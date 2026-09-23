# Planning Hierarchy — Phase A: Core Data Model + Panel 2/3 Migration

> **Supersedes the "no new backend data model" decision** in
> `2026-09-22-execute-panel-redesign-design.md` (decision #1 there: "reuse
> the existing `Goal`/`GoalTask` data ... no new backend data model"). That
> decision stands as the reason WEEKLY/MONTHLY/YEARLY looked the way they
> did through 2026-09-22; this spec is the follow-up that replaces the data
> source under those same three tabs (and Panel 2 entirely) with a real
> parent-child hierarchy. The accordion shell, its icons, and DAILY's own
> HourPlan content are untouched.

## Origin

Validated externally in a standalone HTML/JS mockup (`habit-os-redesign-v5-
data-contract.html`, 5 rounds with the product owner) and handed off as
`PHASE5A-DEVELOPER-HANDOFF.md`. Both files live outside this repo (
`F:\electron\ref` / `/mnt/f/electron/ref` on this machine) and are the
source of truth for the interaction contract section below — read them for
exact mockup behavior, not as code to copy.

## Why this is bigger than the handoff doc scoped

The handoff doc frames this as a new, additive planning surface. Reading
the current repo surfaced two things the handoff doc (written without
repo access) could not have known, both resolved with the product owner
below:

1. Panel 3's EXECUTE tab **already has** DAILY/WEEKLY/MONTHLY/YEARLY tabs
   (`HoursAccordion` in `Panel3.tsx`), built on the existing flat `Goal`
   table. The new tabs are not additive — they replace this accordion's
   data source.
2. `goal_id` threads through three more subsystems the handoff doc never
   mentions: Panel 2 (`GoalsPanel.tsx`, goal CRUD), the Individual Task
   Board (`BoardTask`/`BoardCard`, its own mini-kanban per goal), and the
   NOW card (`engine/now.py`, resolves a goal-task back to its owner
   project). A full migration is much bigger than one panel.

**Decision:** split into three phases. **This spec is Phase A only:**
core tables + engine + Panel 2 (`GoalsPanel.tsx`) + Panel 3's EXECUTE tab.
Phase B (Board remap) and Phase C (NOW card remap) are separate specs,
written after Phase A ships. `goals`/`goal_tasks` tables are **not
touched** in Phase A — Board keeps reading them unchanged until Phase B,
so Phase A cannot break the Board feature.

## Locked interaction contract (do not re-litigate)

Straight from the handoff doc — validated with the product owner across 5
mockup rounds, binding for Phase A's frontend work:

- Single tabbed view (DAILY/WEEKLY/MONTHLY/YEARLY), one panel visible at a
  time — this already matches `HoursAccordion`'s existing shell, unchanged.
- Breadcrumb computed per level: Yearly=year, Monthly=year›month,
  Weekly=year›month›week, Daily=+day. Each segment clickable, jumps to
  that level.
- **WIN ≠ Task.** A Win is its own object (title, progress bar, criteria
  string) — a Win hitting 100%-of-tasks is not automatically "achieved" in
  the UI; achieved is an explicit badge/toast event, not implied by the bar.
- Time-vs-Progress-vs-Pace pattern at Week/Month level: elapsed-time % vs
  completed-work % vs a derived pace chip (behind/on pace/ahead).
- Click-to-navigate on any date (day-strip cell, calendar date, month
  cell) jumps to that date's Daily view, with an inline "add a meeting/
  deadline" affordance — no modal.
- **One shared task row**, not per-view duplicates — completing it in
  Daily updates its Win's bar in Weekly/Monthly/Yearly with no separate
  write.
- Carry Forward is inline (no modal): Move to next period / Schedule a
  specific date / Backlog / Drop — preserves the item's row identity.

## Data model

Four tables, real FKs, matching the handoff doc's explicit instruction
("separate SQLAlchemy tables... not one polymorphic type-tagged table",
Zahid's own prior direction) and this repo's existing convention
(`Goal`, `QuarterlyAnswer`: ms-timestamp integer PK, no ORM base
surprises):

```
outcomes    { id, owner_key, title, year, status, fixed, progress }
milestones  { id, outcome_id FK, title, month, year, status, fixed, progress }
wins        { id, milestone_id FK, title, week_start_date, criteria, status, fixed, progress }
tasks       { id, win_id FK nullable, title, scheduled_date nullable, status, owner_key }
```

- `owner_key` reuses the existing `GoalOwnerKeyT` literal (`proj1`..`proj6`,
  `"life"`) — same ownership concept as `Goal.project_key`, same reserved
  `"life"` handling (no FK to `projects`, see `Goal.project_key`'s own
  comment for why).
- `fixed` + `progress`: when `fixed` is true, `progress` is the stored,
  manually-set value (a not-yet-started or externally-closed period — e.g.
  a future week with no tasks yet, or last month carried over as done).
  When `fixed` is false, progress is **always derived**, per the handoff
  doc's pseudocode — never hand-written per period:

```
winProgress(win):
    if win.fixed: return win.progress
    tasks = TASK.filter(t => t.win_id == win.id)
    if not tasks: return win.progress or 0
    return round(100 * count(tasks, done) / len(tasks))

milestoneProgress(milestone):
    if milestone.fixed: return milestone.progress
    wins = WIN.filter(w => w.milestone_id == milestone.id)
    if not wins: return milestone.progress or 0
    return round(avg(wins.map(winProgress)))

outcomeProgress(outcome):
    milestones = MILESTONE.filter(m => m.outcome_id == outcome.id)
    if not milestones: return outcome.progress or 0
    return round(avg(milestones.map(milestoneProgress)))
```

- No week-container table. Week identity comes from `scheduled_date`
  (ISO week) directly — the handoff doc flags this as an implementation
  call for whoever has repo access to how dates are already handled; this
  repo already does date math in plain `date.fromisoformat`/`timedelta`
  (see `engine/goals.py`'s `_default_deadline`), so ISO-week derivation at
  read time is consistent with that, no new table needed.

### Checklist items — resolving the "which levels get a checklist" question

The product owner confirmed (2026-09-23) that a plain, unscheduled
checklist — today's `GoalTask`, addable to a goal at *any* horizon — must
keep working at *every* level (Outcome/Milestone/Win), not just Win. The
handoff doc's locked `TASK` contract only gives Win a child, by design (its
`winProgress` formula only ever walks Win's own tasks). Rather than bolt
three nullable parent columns onto `TASK` — which would let a checklist
item silently feed `winProgress` for two of three parent types and not the
third, an inconsistency nobody asked for — Phase A keeps `TASK` exactly as
the handoff doc specifies (Win-only parent, the day-scheduled,
board-linkable, doc-pure item Phase B's Board remap will attach to) and
adds a second, separate table for the plain checklist:

```
checklist_items { pid, text, done, added_date, outcome_id FK nullable, milestone_id FK nullable, win_id FK nullable }
```

Exactly one of the three FK columns is set per row (enforced at the
engine layer, same as `GoalTask` today is scoped to exactly one
`goal_id`). This is a straight re-pointing of the existing `GoalTask`
shape (`pid`, `text`, `done`, `added_date`) — same table shape, new FK
target — so the feature shipped 2026-09-22 (inline add/strike/remove
checklist items on a goal card) keeps working identically once Panel 2
reads from the new tables, no UI change needed for that feature.

## Migration of existing `goals`/`goal_tasks` data

`goals` and `goal_tasks` are **not dropped or modified** in Phase A —
Board (`BoardTask.goal_id`) still reads them until Phase B. The new
migration only adds tables and forward-copies data into them, per this
repo's additive-migration convention (`QuarterlyAnswer`'s V2 migration is
the precedent: schema change + data copy in one `upgrade()`, via bulk SQL,
nothing dropped).

Best-effort auto-migrate, confirmed with the product owner (2026-09-23) —
existing goals have no stored parent link between horizons, so the
migration infers one:

1. Group existing `Goal` rows by `(project_key, horizon)`.
2. Every `horizon="yearly"` Goal → one `Outcome` row (`year` = year of
   `start_date`).
3. Every `horizon="monthly"` Goal → one `Milestone` row. If exactly one
   Outcome exists for that `(project_key, year(start_date))`, parent to
   it. Otherwise create a synthetic Outcome titled `"General <year>"` for
   that owner and parent to that.
4. Every `horizon="weekly"` Goal → one `Win` row, same matching logic
   one level down (existing Milestone for that owner+month, else a
   synthetic `"General <month> <year>"` Milestone).
5. Every `GoalTask` row → one `checklist_items` row, FK'd to whichever new
   node its parent `Goal` became in steps 2-4.
6. Every migrated node keeps a `legacy_goal_id` column (nullable) pointing
   back to the source `Goal.id`, purely for the manual fix-up UI — never
   read by the progress engine or any other business logic — so Panel 2
   can offer "this was auto-linked from your old goal, re-parent it" on
   nodes worth double-checking, without a second migration to add that
   column later.
7. This yields real, sometimes-wrong parent links for anything that was
   ambiguous (e.g. two monthly goals under one owner with only one
   yearly goal to guess from) — expected and accepted: Panel 2 gets a
   re-parent control (a simple parent picker on each node's edit form)
   so the product owner can fix any auto-link by hand. This is cheaper
   and safer than trying to make the heuristic perfect.

⚠ Horizon label-crossing (`GoalsPanel.tsx`'s own documented quirk —
stored `horizon="yearly"` displays as "WEEKLY GOAL", etc.) applies to
**reading the old `Goal.horizon` column during migration only**. The new
tables have no such crossing: `outcomes.year`/`milestones.month`/
`wins.week_start_date` mean exactly what they say. Migration code must
use the *stored* `horizon` value (not the displayed label) to decide
which new table a row becomes — i.e. exactly what `GOAL_HORIZONS`/
`Goal.horizon` already contains, no re-mapping needed there, but do not
let the displayed-label confusion leak into new code once this is done.

## Backend

- `engine/planning.py` — the three pure derived-progress functions above,
  plus CRUD (`create_outcome`, `create_milestone`, `create_win`,
  `create_task`, `edit_*`, `delete_*`, `add_checklist_item`,
  `toggle_checklist_item`, `delete_checklist_item`, `carry_forward_task`).
  Structured like `engine/quarterly.py` (an `Engine` class wrapping a
  repository), unit-tested the same way `test_quarterly.py` tests
  `compute_status()`.
- `api/routes/planning.py` — mirrors `/api/quarterly/*`'s route shape:
  - `GET/POST /api/planning/outcomes`, `.../milestones`, `.../wins`,
    `.../tasks` (list scoped by owner/period, create)
  - `PATCH /api/planning/{outcomes,milestones,wins,tasks}/{id}` (edit,
    including the re-parent fix-up: changing `outcome_id`/`milestone_id`/
    `win_id`)
  - `DELETE /api/planning/{...}/{id}` — returns 409 with a child count if
    the node has children, rather than cascading silently (see Edge
    Cases below); a `?force=true` query param cascades.
  - `PATCH /api/planning/tasks/{id}/schedule` — sets `scheduled_date`/
    `win_id`
  - `POST /api/planning/tasks/{id}/carry-forward` — body
    `{action: "nextweek"|"date"|"backlog"|"drop", date?: string}`
  - `POST/PATCH/DELETE /api/planning/checklist-items` — same shape as
    today's `/api/goals/{id}/tasks` (`GoalTaskCreate`/`GoalTaskOut`), just
    accepting whichever one of `outcome_id`/`milestone_id`/`win_id` the
    caller sets.
- `api/schemas.py` — `OutcomeOut/Create/Edit`, `MilestoneOut/Create/Edit`,
  `WinOut/Create/Edit`, `TaskOut/Create/Edit`, `ChecklistItemOut/Create`.

## Frontend

- `services/api.ts` — new `planningApi` client mirroring `quarterlyApi`'s
  shape.
- `Panel2` (`GoalsPanel.tsx`, currently 1152 lines) — the horizon dropdown
  (yearly/monthly/weekly, flat) becomes a parent picker: creating a
  Milestone asks which Outcome it belongs to (defaulting to the owner's
  only Outcome if there's exactly one), creating a Win asks which
  Milestone. Existing card chrome, inline checklist add/strike/remove,
  and `useAutosave` wiring are reused, not rebuilt — this is a data-source
  swap on an existing component, not a rewrite. If the file grows
  meaningfully past its current size handling the extra picker UI, split
  the parent-picker into its own small component rather than growing
  `GoalsPanel.tsx` further (the writing-plans file-structure step should
  make this call once the actual diff size is visible).
- `Panel3` (`Panel3.tsx`'s `HoursAccordion`) — `GoalHorizonSection`
  (WEEKLY/MONTHLY/YEARLY) replaced by new components built to the mockup:
  a Win card (bar, criteria string, achieved badge, supporting-tasks
  `<details>`), the Time-vs-Progress-vs-Pace row, and inline Carry-Forward
  actions on incomplete items. DAILY's existing 7-day strip / click-to-
  navigate (shipped 2026-09-22/23) and its calendar click→open-goal wiring
  are reused as-is — they already do what the mockup asks, just against
  the new tables.

## Edge cases

- **Deleting a node with children:** blocked by default (409 from the
  route), a confirm dialog in the UI shows the child count and offers
  "delete anyway" (`?force=true`) — today's `Goal`→`GoalTask` cascade is a
  single flat level; cascading three levels silently (an Outcome delete
  taking every Milestone/Win/Task under it) is a much bigger blast radius
  than anything this app deletes today.
- **Empty period, not yet started:** `fixed=true`, `progress=0`, no
  children yet — matches the mockup's Week 4 placeholder ("not started",
  never fabricated fake data to fill it).
- **Win hits 100% via task completion:** achieved badge/toast fires
  (derived: `progress === 100`), but the stored `status` field is not
  auto-written to "achieved" — matches the mockup (`weekWinAchieved` is a
  client-side derived flag, not a write) and the handoff doc's explicit
  rule that task-done contributes to a Win, it doesn't silently equal it.
- **Carry Forward "Schedule a specific date":** still aliases to "move to
  next period" in Phase A, exactly as the mockup does — the handoff doc
  explicitly defers real date-picker/date→week derivation past this
  phase. Leave the future contract as a code comment on the route
  handler: `{ planned_period, scheduled_date, status, parent_win }`.
- **Ambiguous migration parent (step 7 above):** surfaced via the
  re-parent picker on Panel 2, not silently accepted as correct.

## Testing

- `python/test_planning.py` (mirrors `test_quarterly.py`) — the three
  pure progress functions across tree shapes: empty, single-child, deep
  (2+ levels), a `fixed` node with stored progress, a node whose child
  set changes between two calls (no caching bugs).
- Migration round-trip test against a throwaway DB: seed a few
  `Goal`/`GoalTask` scenarios (a clean single yearly→monthly→weekly
  chain; an orphan monthly goal with no matching yearly goal, forcing
  the synthetic-Outcome path; a goal with checklist items) and assert
  the resulting `outcomes`/`milestones`/`wins`/`checklist_items` rows
  match the rules above. Also assert `goals`/`goal_tasks` are byte-for-
  byte unchanged after migration (Board's safety net).
- `tsc --noEmit`, `spacing-check.mjs`, `radius-check.mjs`,
  `typography-check.mjs` — this repo's standing verification chain.
- Live check via the `run-habit-os` skill: build, launch, walk the
  create→schedule→complete→cascade flow end to end in the real app (not
  just a disposable sandbox — this repo's own history has caught
  sandbox-only verification missing real bugs before).

## Explicitly out of scope for Phase A

- Board (Kanban) remap — Phase B, separate spec.
- NOW card remap — Phase C, separate spec.
- Real date-picker for "Schedule a specific date" (see Edge Cases).
- Theme/visual changes — the handoff doc is explicit that Zahid has
  deferred all visual/theme decisions past this data/interaction layer
  ("Phase 6" in that doc's own numbering); Phase A reuses existing
  card/spacing/typography primitives, no new visual language.
