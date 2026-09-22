# EXECUTE Panel Redesign — Phase 1: Daily/Weekly/Monthly/Yearly Accordion

> **Simplified after this spec shipped (2026-09-22, same day):** the user
> asked to keep HOURS/MIT/LIST exactly as they were and nest the DAILY/
> WEEKLY/MONTHLY/YEARLY accordion *inside* the HOURS tab instead of
> replacing the tab strip with it. MIT and LIST are no longer folded into
> NOW or a popover — that whole section below is superseded. The nested
> accordion's expanded level is in-memory only (not persisted), matching
> `HourPlanTab`'s own existing convention for its phase-block open state.
> Left the rest of this doc as the historical record of what was designed
> and why (the horizon-crossing table, the Goal-data-reuse decision, and
> the Phase 2 scope boundary all still apply unchanged) — see
> `HoursAccordion` in `Panel3.tsx` for what actually shipped.

## Summary

Panel 3's EXECUTE mode currently shows three tabs — HOURS, MIT, LIST — switched
by a segmented control, with a NOW card pinned above them. This redesigns that
into a single continuous accordion of four "zoom levels" — DAILY, WEEKLY,
MONTHLY, YEARLY — with NOW still pinned at the top. Only one level is expanded
at a time; DAILY is expanded by default. WEEKLY/MONTHLY/YEARLY are new compact
views onto data that already exists (the Goals feature in Panel 2) — no new
planning data model.

This is **Phase 1** of the user's full design brief. Phase 2 (deferred, not
speced here): the optional 7-day strip on WEEKLY, the mini calendar on
MONTHLY, the Jan–Dec strip on YEARLY, and any Daily→Weekly→Monthly→Yearly
"contribution" linking UI (that needs a new Goal→Goal data relationship that
doesn't exist yet — see "Explicitly out of scope" below).

## Decisions already confirmed with the user

1. **Data source for WEEKLY/MONTHLY/YEARLY:** reuse the existing `Goal`/
   `GoalTask` data already shown in Panel 2 (GoalsPanel), not a new
   calendar-rollup of daily task completion. No new backend data model.
2. **MIT and LIST tabs:** MIT (today's STRIKE picker) folds into an inline
   expand under the NOW card. LIST (tomorrow's focus list) becomes a small
   "Tomorrow →" link that opens the existing list in a lightweight popover —
   neither survives as a top-level accordion section.
3. **Goal owner shown in WEEKLY/MONTHLY/YEARLY:** mirrors whatever project
   (or `"life"`) Panel 1/2 currently has active. **Confirmed gap, needs a
   one-line fix:** `App.tsx:564` currently passes Panel 3's
   `activeProjectKey={allProjectsCollapsed ? null : goalsProject}` — `null`,
   not `'life'`, when every project is collapsed — while GoalsPanel
   (`App.tsx:489`) resolves the same state to `'life'`
   (`allProjectsCollapsed ? 'life' : goalsProject`). Left as-is, Panel 3's
   new sections would show nothing at the exact moment Panel 2 shows the
   Life Plan goals. `App.tsx` must pass Panel 3 the same resolved
   `goalsPanelKey` GoalsPanel already computes, not raw `activeProjectKey`.

## ⚠ The horizon/label crossing — read before touching any of this

`GoalsPanel.tsx` (lines 10-43) and `engine/goals.py` (lines 35-47) both carry
large warnings that the stored `Goal.horizon` column and the label shown in
Panel 2 are **deliberately crossed**:

| stored `horizon` | Panel 2 shows it as | accent CSS var |
|---|---|---|
| `yearly` | "WEEKLY GOAL" | `var(--goal-yearly)` |
| `monthly` | "MONTHLY GOAL" | `var(--goal-monthly)` |
| `weekly` | "YEARLY GOAL" | `var(--goal-weekly)` |

Panel 3's new sections must follow the **displayed** meaning, matching what
the user already understands as "their weekly goals" in Panel 2 — not the
raw column name. So:

- Panel 3's **WEEKLY** section queries `horizon="yearly"` goals.
- Panel 3's **MONTHLY** section queries `horizon="monthly"` goals.
- Panel 3's **YEARLY** section queries `horizon="weekly"` goals.

This is the single easiest thing to get backwards when implementing. Do not
"fix" the crossing — it's load-bearing for every existing Goal row in the
database.

## Component architecture

```
Panel3.tsx (EXECUTE branch)
├── date header                          (unchanged)
├── NowCard                              (grows an inline STRIKE-picker expand)
│    └── [expanded] <TaskList listKey="focus" dayView="today" .../>   (was the MIT tab)
├── sticky segmented nav: DAILY | WEEKLY | MONTHLY | YEARLY   (was FocusTabs)
└── four stacked <AccordionSection> — only one expanded at a time
     ├── DAILY   → body: <HourPlanTab/> (unchanged internals) + "Tomorrow →" popover trigger
     ├── WEEKLY  → body: <GoalHorizonSection horizon="yearly" .../>
     ├── MONTHLY → body: <GoalHorizonSection horizon="monthly" .../>
     └── YEARLY  → body: <GoalHorizonSection horizon="weekly" .../>
```

**New files:**
- `renderer/src/components/AccordionSection.tsx` — generic collapsed/expanded
  section shell (icon, label, period text, count, chevron, accent-colored left
  rail). Used by all four levels so they read as "one system," not four
  screens (the user's own requirement). Collapsed height ~56-72px per the
  brief.
- `renderer/src/components/GoalHorizonSection.tsx` — the compact goal-list
  body shared by WEEKLY/MONTHLY/YEARLY. One component, parameterized by
  `{ horizon, ownerKey, accentVar, glyph, noun }` rather than three
  near-duplicate components — the three sections are structurally identical
  (a list of that horizon's goals, checkbox, accent rail), differing only in
  which horizon they query and their header copy.

**Modified files:**
- `renderer/src/components/Panel3.tsx` — replace `FOCUS_TABS`/`FocusTabs`/
  `tab` state with the four-level accordion (`expandedLevel` state, same
  settings-backed persistence as today's `tab`). Stack the four sections;
  drive expand/collapse + scroll-into-view from the sticky nav.
- `renderer/src/components/NowCard.tsx` — `onGoToMit` becomes a toggle for an
  inline-expand flag owned by the parent (Panel3), rendering the existing
  `TaskList` component right under the NOW card instead of switching tabs.
  No change to NowCard's own current-task rendering.
- `renderer/src/components/HourPlan.tsx` — visual polish only (spacing/token
  cleanup within its existing structure). No structural or behavioral
  change — this is explicitly the one section the brief says not to
  redesign.
- `renderer/src/App.tsx` — pass Panel 3 the same resolved `goalsPanelKey`
  (with the `'life'` fallback) that GoalsPanel already gets, instead of raw
  `activeProjectKey` (see "Goal owner" decision above for why).

## WEEKLY / MONTHLY / YEARLY content (Phase 1)

The brief's mockups show bespoke content per level ("FOCUS / KEY MILESTONE /
MONTHLY TARGET" for Monthly, numbered "KEY OUTCOMES 01/02/03" for Yearly).
**Deviation from the literal mockup, flagged here for visibility:** the real
`Goal` data model is a flat list of goals per horizon, not three fixed named
slots — there's no field that means "the milestone" versus "the target."
Rather than inventing new schema to force-fit three named boxes (out of
scope — "don't change business logic unless required for this UI," and this
would be required for the *mockup*, not the *feature*), all three levels
render the same pattern:

```
[glyph] WEEKLY        22–28 Sep 2026                    2/3 done      v
  [ ] Finish Habit OS planner
  [x] Contact 3 buyers
  [ ] Complete export research
```

- **Header:** glyph + level name + a calendar-derived period string (current
  Mon–Sun range / current month name+year / current year — pure client-side
  date math, unrelated to any goal's own `start_date`/`deadline`) + `done/total`
  (matches Panel 2's own header convention) + collapse chevron.
- **Body:** one row per goal in that horizon for the active owner — a
  checkbox (`goalsApi.toggle`), the goal text, a thin accent-colored rail
  (the same `--goal-yearly/monthly/weekly` var Panel 2 uses for that
  horizon). **Read + toggle-done only** — no add/edit/delete/reorder from
  here. Editing a goal's note, deadline, or its own task checklist stays in
  Panel 2; this is a glance, not a second editor. Empty state: muted
  "Nothing here yet" line, same copy convention as Panel 2.
- No internal scrolling (the brief explicitly forbids nested scroll areas) —
  a long list just extends the page; the whole EXECUTE column already
  scrolls as one surface.

## NOW → inline MIT picker

`NowCard`'s existing "Choose today's 3 →" button (shown when there's no
current task and no in-progress hour) currently calls `onGoToMit`, which
today switches to the MIT tab. It keeps the same prop, but Panel3 changes
what happens on click: instead of `selectTab('mit')`, it toggles a local
`mitOpen` boolean and renders `<TaskList listKey="focus" dayView="today"
activeProjectKey .../>` directly below the NOW card when true — the exact
same component the MIT tab already uses, just inline instead of tab-swapped.

## DAILY → "Tomorrow" popover, and the double-header problem

`HourPlanTab` (`HourPlan.tsx:306-331`) already renders its own header line —
`TO-DO (N)` / `done/total done` — inside itself. Wrapping it in
`AccordionSection`, which also renders a header (icon, "DAILY", date, count,
chevron), would stack two redundant header rows, which the brief's own DAILY
mockup shows as one. **`HourPlanTab` needs a `hideHeader` prop** (default
`false`, so its only other caller — none currently exist outside Panel3, but
keep it non-breaking) that suppresses its internal header line when rendered
inside the new accordion; `AccordionSection`'s own header becomes the single
source of the date/done-count line for DAILY, same as it is for the other
three levels.

The old LIST tab (`<TaskList dayView="tomorrow">`) becomes a small text
button, "Tomorrow →", placed in that same DAILY header row (next to its
done-count, before the collapse chevron). Clicking it opens a lightweight
anchored popover — reusing the exact pattern `ToolsMenu.tsx` already
implements (absolute-positioned panel, closes on outside click) rather than
inventing a new overlay primitive — containing the same `TaskList` component,
unchanged.

## Backend changes

`AppState.focus_tab` is repurposed to persist which of the four levels is
currently expanded, replacing its three old values with four new ones:

- `python/engine/settings.py`: `FOCUS_TABS = ("hours", "mit", "list")` →
  `("daily", "weekly", "monthly", "yearly")`.
- `python/api/schemas.py`: `FocusTabT` literal updated to match (two usage
  sites: the settings response and settings patch schemas).
- `python/database/models.py`: `AppState.focus_tab` default `"hours"` →
  `"daily"` (comment updated).
- New Alembic migration: changes the column's `server_default` to `'daily'`
  and rewrites any existing stored rows — `'hours'→'daily'`, `'mit'→'daily'`,
  `'list'→'daily'` (MIT and LIST no longer have a direct top-level
  equivalent, so both fall back to DAILY, the new default level).

Frontend: `FocusTab` type (`services/api.ts`) updates to the same four
values; every reference (`Settings`/`SettingsPatch` interfaces, `Panel3.tsx`)
updates together.

No other backend change. `GoalHorizonSection` reads through the existing
`goalsApi`/`goalTasksApi` — no new routes, no new tables.

## Visual system — mapped onto existing tokens, not a new palette

The brief specifies a fresh visual language (Inter/system-ui font, a
blue/green/orange/purple color set, an explicit 4/8px spacing scale). Two
deliberate deviations, flagged for visibility:

1. **Font stays as-is.** The app already sets `'Plus Jakarta Sans', ...`
   app-wide (`index.css:81-83`), from an already-shipped premium design pass
   (2026-09-21). Switching just this one screen to Inter/system-ui would
   fracture the app into two type systems — worse than either choice alone.
2. **Colors reuse existing theme tokens, not new hardcoded hex values.** The
   app has 6 switchable themes (`themes.ts`), each defining its own
   `--accent`/`--success`/`--warning`/`--danger`/`--goal-*` — hardcoding
   "orange for evening, purple for sleep" would look right in exactly one
   theme and wrong in the other five, and the user has previously flagged
   inconsistent-effort theming as reading "washed out." New UI here uses
   `var(--accent)` for primary actions, `var(--success)` for done/positive,
   `var(--goal-yearly/monthly/weekly)` for the three horizon rails (already
   established by Panel 2), and does not introduce new semantic colors for
   Morning/Work/Evening/Sleep beyond what `HourPlan.tsx` already does today.

Spacing/radius: the brief's 4/8/12/16/24px scale already exists verbatim as
`SPACE`/`RADIUS` in `renderer/src/spacing.ts`, enforced by a pre-commit hook
that gates spacing drift. New components use those constants; no new scale
needed.

## Explicitly out of scope (Phase 1)

- 7-day strip (WEEKLY), mini calendar (MONTHLY), Jan–Dec strip (YEARLY) — all
  three are marked "optional" in the brief; deferred to Phase 2.
- Adding, editing, deleting, or reordering goals from Panel 3 — stays in
  Panel 2 only.
- Any Daily→Weekly→Monthly→Yearly "this task contributes to this goal"
  linking UI (brief sections 21-23) — there is no `Goal`→`Goal` parent/child
  relationship in the data model today (confirmed: only `GoalTask.goal_id`
  and `BoardTask.goal_id` exist, both pointing at one flat `Goal` row, never
  at another `Goal`). Building that link is a real schema change and its own
  design decision, not a Phase 1 UI change.

## Testing / verification

- Backend: existing `test_now_hour.py`, `test_settings.py`,
  `test_hour_plan.py` must still pass after the `focus_tab` value rename (no
  behavior change to the underlying HOURS/STRIKE/NOW logic itself).
- Manual, via the `run-habit-os` skill: expand/collapse each of the four
  levels (only one open at a time), confirm DAILY still behaves exactly as
  HOURS did today, confirm WEEKLY/MONTHLY/YEARLY show the *correct* horizon
  per the crossing table above (cross-check against what Panel 2 currently
  shows for the same project), confirm NOW's inline MIT picker matches the
  old MIT tab's STRIKE behavior (cap at `STRIKE_MAX`, DAY FULL handling),
  confirm the Tomorrow popover opens/closes and shows tomorrow's list
  unchanged, confirm the sticky nav both expands and scrolls to a level.
