# Habit OS — Year→Month→Week→Day→Now Planning: Developer Handoff Note

**For:** Claude Code, working directly in the real repo (`~/dev/habit-os`, Electron + Python/FastAPI backend + React/TypeScript frontend).
**From:** a separate Cowork session that only had HTML-mockup access — no visibility into the real codebase's actual file names, table names, or component structure. Everything below is a validated *interaction and data contract*, not real code to paste in. Translate it into this repo's existing conventions (see `claude/habit-os-port-status.md` in the project for those conventions: additive-only Alembic migrations, `engine/*.py` pure compute functions, `api/routes/*.py` + `api/schemas.py`, React components using the existing `useAutosave` pattern, and the `tsc --noEmit` / `spacing-check.mjs` / `radius-check.mjs` / `typography-check.mjs` verification chain).

**Status:** validated in a standalone HTML/JS mockup through 5 rounds with the product owner (Zahid). Not yet touched in the real app. This note is what to build next.

---

## 1. What this feature is

A single planning surface across five zoom levels — **Year → Month → Week → Day → Now** — replacing (or extending) the current separate Quarterly/Goals panels with a coherent drill-down hierarchy. Owner explicitly locked this sequencing:

`Outcome (Year) → Milestone (Month) → Win (Week) → Task (Day) → Now (single active task)`

This is **not a redesign of the Quarterly Plan feature** documented elsewhere in the project — it's a separate, new planning surface. Whether/how it eventually merges with `QuarterlyAnswer` is an open question for Zahid, not something to assume.

## 2. Validated UX architecture (build to this, do not re-litigate it)

- **Single tabbed view**, not side-by-side panels: DAILY / WEEKLY / MONTHLY / YEARLY as tabs, one panel visible at a time.
- **Breadcrumb = orientation, computed per level**: Yearly shows only the year; Monthly shows `year › month`; Weekly shows `year › month › week`; Daily shows `year › month › week › day`. Each segment is clickable and jumps straight to that level.
- **WIN ≠ Task.** A Win is its own object (title, progress bar, a criteria string), never a checkbox property bolted onto a task. A Win reaching "100% of its tasks done" is necessary but the UI should treat *criteria met* as the explicit achieved-state event (badge / toast), not an implicit side effect of the progress bar hitting 100.
- **Time-vs-Progress-vs-Pace pattern** at Week/Month level: elapsed-time % vs. completed-work % vs. a derived pace chip (behind / on pace / ahead), not a bare task count.
- **Click-to-navigate on any date** (a Weekly day-strip cell, a Monthly calendar date, a Yearly month cell) jumps straight into the Daily view for that date, with a lightweight inline "add a meeting/deadline for this day" affordance — this is the actual feature Zahid asked for originally ("no deadline missed").
- **One shared task object, not per-view duplicates.** The same task appearing in Daily (by day), Weekly (by week), and as a Win's supporting action must be the *same* underlying record — editing/completing it in one place is instantly reflected everywhere, because it's one row, not three.
- **Carry Forward is a real, inline (no modal) action set**: for an unfinished item, Move to next period / Schedule a specific date / Backlog / Drop — and moving preserves the item's identity (same ID/row), it does not create a duplicate.

## 3. Locked data contract

```
OUTCOME   { id, title, period(year),  status, progress? }
MILESTONE { id, title, parentOutcomeId,  period(month), status, progress? }
WIN       { id, title, parentMilestoneId, period(week),  criteria, status, progress? }
TASK      { id, title, parentWinId (nullable), scheduledDate, status, projectId }
```

Relationship: `task.winId → win.milestoneId → milestone.outcomeId`. A **Win**, **Milestone** or **Outcome**'s progress is *always derived by walking this relationship*, never hand-written per period:

```
winProgress(win):
    if win.fixed: return win.storedProgress
    tasks = TASK.filter(t => t.winId == win.id)
    if not tasks: return win.storedProgress or 0
    return round(100 * count(tasks, done) / len(tasks))

milestoneProgress(milestone):
    if milestone.fixed: return milestone.storedProgress
    wins = WIN.filter(w => w.milestoneId == milestone.id)
    if not wins: return milestone.storedProgress or 0
    return round(avg(wins.map(winProgress)))

outcomeProgress(outcome):
    milestones = MILESTONE.filter(m => m.outcomeId == outcome.id)
    if not milestones: return outcome.storedProgress or 0
    return round(avg(milestones.map(milestoneProgress)))
```

No level's compute function ever mentions a specific week/month/year by name or string tag. This was previously validated *wrong* (a `task.winFor === 'week-3'` string tag, and a hand-written `(100+100+weekPct+0)/4` formula) and has since been proven correct against the same numeric scenario using only ID-based `.filter()`/`.reduce()`.

**In the real app, per Zahid's own explicit direction:** `outcomes`, `milestones`, `wins`, `tasks` should be **separate SQLAlchemy tables** with real foreign keys (`milestone.outcome_id`, `win.milestone_id`, `task.win_id` nullable), not one polymorphic `type`-tagged table — follow this repo's existing additive-migration convention (see `QuarterlyAnswer`'s migration history for the pattern: new nullable columns/tables, forward-copy any existing data, never drop old columns).

A **WEEKS**-style period-container table is also needed to support real week navigation (id, number, date range, parent month/year) — the mockup modeled this as a small in-memory array; in the real app this is likely computable from `scheduledDate` directly (ISO week) rather than needing its own table — that's an implementation decision for Claude Code to make based on how dates are already handled elsewhere in this codebase, not something the mockup can dictate.

## 4. Interaction flows that must work (all validated in the mockup)

1. **Create** — a new Task/Win/Milestone/Outcome, with a type picker, from any level.
2. **Schedule** — Month→Week→Day drill assignment (a task gets a `scheduledDate`/`winId` and immediately appears in every view that reads it).
3. **Same object, multiple views** — completing a task in Daily updates its Win's progress bar in Weekly/Monthly/Yearly without a page reload or separate write.
4. **Carry Forward** — Move to next week / Schedule a specific date / Backlog / Drop, preserving row identity; source period's progress recalculates immediately (it's derived, so this is automatic once the relationship model is real).
5. **WIN completion criteria** — a Win reaching 100%-of-tasks is *not* automatically "achieved" in the UI sense; achieved is its own explicit state (a criteria string + an achieved event/badge), matching the "WIN rule" Zahid locked: task-done contributes to a Win, it doesn't silently equal the Win.

## 5. Explicitly NOT in scope yet — do not build these speculatively

- **Real date-picker / date→week derivation.** The mockup's "Schedule a specific date" is still an alias for "move to next period." The future interaction contract for it (write this down in code as a comment/TODO, don't implement the UI yet unless Zahid asks): `{ planned_period, scheduled_date, status, parent_win }`.
- **Theme.** Zahid has repeatedly and explicitly deferred all visual/theme decisions until this data/interaction layer is proven ("Phase 6"). Do not restyle, do not switch dark→light, do not add new cards, on your own initiative.
- **Full 12-month fake data.** Any real UI for this feature should be seeded with real or minimally-real data (a small vertical slice), never a fabricated full year — Zahid has caught and objected to this pattern before.

## 6. Do not touch (standing rule, unrelated to this feature but binding across the whole port)

The `horizon="yearly"` → displays as "WEEKLY GOAL" label-crossing behavior (and similar quirks) elsewhere in the existing app is **deliberate** and must never be "fixed" as a bug, in this feature or any other.

## 7. Reference artifact

A fully interactive, single-file HTML mockup (`habit-os-redesign-v5-data-contract.html`) implements everything in sections 2–4 above with vanilla JS, against a small real vertical slice (2026 Outcome → September Milestone → Week 3 Win → 5 real tasks, plus a minimal Week 4 and August for carry-forward/context testing). Its compute functions and data shape are the direct source for section 3's pseudocode — read it for exact behavior, not for code to copy (it's a prototyping mockup, not production code: no persistence, no API, in-memory only).

## 8. Suggested build order for the real repo

1. Add `outcomes` / `milestones` / `wins` tasks-linking columns via additive Alembic migrations, following the `QuarterlyAnswer` precedent exactly (new nullable columns/tables, forward-copy nothing since this is new, migration round-trip test against a throwaway DB).
2. `engine/planning.py` (or similar, matching this repo's `engine/quarterly.py`/`engine/goals.py` naming): the three derived-progress functions from section 3, pure and unit-tested the same way `test_quarterly.py` tests `compute_status()`.
3. API routes mirroring the existing `/api/quarterly/*` shape: create/list per level, a schedule/assign endpoint, a carry-forward endpoint.
4. Frontend: one new panel component per the single-tabbed-view architecture in section 2, reusing existing patterns (`StatusBadge`, `useAutosave`, the spacing/typography scale) rather than inventing new visual language — this keeps Phase 6 (theme) meaningful later instead of fighting a parallel visual system.
5. Full verification pass before calling it done: `tsc --noEmit`, `spacing-check.mjs`, `radius-check.mjs`, `typography-check.mjs`, a migration round-trip, and a real Playwright pass against the production build (not just a disposable sandbox — this project's own history shows sandbox-only verification has missed real bugs before).
