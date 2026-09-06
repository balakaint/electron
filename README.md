# Habit OS — Electron shell

Skeleton for migrating `task_tracker_v3_THEMES.py` (Tkinter, 17.5k lines) to
an Electron + React UI backed by a local Python/FastAPI engine.

## Layout

- `electron/` — main process (spawns the Python engine, opens the window) + preload (secure IPC bridge)
- `renderer/` — React + TypeScript + Vite UI
- `python/` — FastAPI engine (`api/`), business logic (`engine/`), persistence (`database/`), `licensing/`
- `task_tracker_v3_THEMES.py` — original app, kept as-is for reference during the port

## Run in dev

```
npm install
pip install -r python/requirements.txt
npm run dev
```

This starts Vite, compiles the Electron TS, and launches Electron, which
spawns `python3 python/main.py` (or the project's `python/.venv` if present)
and loads the React UI from the Vite dev server.

## What's real so far

**Tasks** (the PLAN/FOCUS lists from the Tkinter app) are fully ported:

- `python/database/models.py` — single `tasks` table (`list_key` column
  distinguishes PLAN `classic` vs FOCUS `focus`, matching how
  `_find_task` in the original app always searched both as one pool)
- `python/database/repository.py` + `python/engine/tasks.py` — CRUD plus
  the original's actual behaviors: `~NN` time-box parsing, MIT (one
  per list), urgency cycling (low/med/high), start/stop timers with
  session history
- **Strike** ("today's 3 committed" Focus tasks, `STRIKE_MAX = 3`) is
  also ported: `toggle_strike` rejects a 4th (`StrikeLimitReached` →
  409), Focus-list only (matches `_strike_tasks` reading `tasks_focus`
  only — striking a Plan task is rejected outright here rather than
  silently accepted-but-never-counted like the legacy quirk), and
  un-striking a task whose own timer is running stops it first (the
  legacy bug-fix this replicates: a struck task's clock had no visible
  stop button once un-starred). Daily reset has no live tick to hook
  into, so it's enforced lazily instead of via a cron: a tiny `app_state`
  singleton table (`last_strike_reset_day`) is checked on every
  strike read/write and on the periodic timer-reconciliation loop
  (below), and clears all strikes the first time a new day is seen.
- **TODAY/TOMORROW day-view** is also ported: a single global toggle
  (`app_state.task_day_view`, shared by both lists — matches the legacy
  `self._task_day`, whose switch only lives on the Plan tab but also
  reshapes what the Focus tab and its strike list show) filters every
  list read to `day <= today` (TODAY — deliberately inclusive of
  overdue, so an unfinished task never silently disappears) or
  `day > today` (TOMORROW). A task created while TOMORROW is active
  defaults its own `day` to tomorrow, so "switch to Tomorrow, then add"
  plans it directly.
- `python/api/routes/tasks.py` — REST endpoints, mounted at `/api/tasks`
  (+ `/strike`, `/{id}/toggle-strike`, `/day-view`)
- `renderer/src/components/TaskList.tsx` — Plan/Focus tabs, Today/Tomorrow
  toggle (Plan tab only), add/edit/done/MIT/urgency/timer/strike/delete,
  all wired through `electron/main.ts`'s generic `api-request` IPC bridge
  (`window.api.request(method, path, body)`)
- Alembic migrations run automatically on engine startup (`main.py`)
- **Timer safety**: `python/engine/timer_reconciliation.py` — a stale
  running project/task timer (engine crash, closed app, machine sleep)
  is capped at a 15-minute idle window instead of crediting the whole
  gap; a project timer is exclusive (starting one stops any other) and
  splits elapsed time across a midnight boundary instead of dumping it
  all on the stop-day. Reconciled at engine startup, every 60s via a
  background `asyncio` loop in `python/api/server.py`, and on every
  explicit start/stop — see the module's docstring for the full design.

**Habits** (the "Life Execution Dashboard": MONEY/HEALTH/RELATION/MINDSET
categories, daily checklists, streaks, intention) are also fully ported:

- `python/database/models.py` — `habits` (id, category, name, sort_order,
  active — soft-delete only, so history never orphans), `habit_completions`
  (habit_id + day unique, done), `daily_intentions` (day -> text). Unlike
  the legacy app, habits get a stable id — renaming one no longer silently
  orphans its history the way editing `__habits_{cat}` did originally
- Migration seeds the same default habit set the Tkinter app shipped
  (`_HABIT_DEFAULTS`) so a fresh install looks the same as before
- `python/engine/habits.py` — toggle completion, per-day/per-category score,
  streak (>=50% of active habits done, consecutive days ending today —
  matches `_habit_streak`'s deliberately forgiving threshold), 7-day scores
- `python/api/routes/habits.py` — `/api/habits` (+ `/summary`, `/streak`,
  `/week`), `/api/intentions/{day}`
- `renderer/src/components/HabitDashboard.tsx` — score, streak, week bars,
  4 category cards with add/toggle

**Projects** (fixed 6 slots `proj1`-`proj6` — title, note, subtasks, daily
consistency tracking, accountability circle) are also fully ported.
**Business Analysis canvas** (per-project idea/analysis/financial/decision/
next-action fields, decision status + priority segmented controls, an
append-only decision log, and the old 15-box freeform grid kept as a
read-only archive) is also fully ported:

- `python/database/models.py` — `BusinessAnalysis` (1:1 with `projects`,
  seeded empty for all 6 slots by the migration, matching the current
  5-section canvas the legacy app itself already migrated forward to),
  `DecisionLog` (append-only, `why` is a snapshot of `decision_why`
  captured automatically at the moment of the status change, not asked
  for again), `LegacyAnalysisBox` (the pre-redesign 15-box grid the
  legacy app stopped showing but never deleted — kept read-only here too)
- `python/engine/business_analysis.py` — field updates; decision-status
  and priority are segmented-control toggles that clear back to `""` on
  a repeat click of the active option; every real status change
  auto-logs and trims history to the legacy app's 40-entry cap
- `python/api/routes/business_analysis.py` — `/api/projects/{key}/analysis`
  (+`/decision-status`, `/priority`, `/log`, `/legacy-boxes`)
- `renderer/src/components/BusinessAnalysisCanvas.tsx` — opened via an
  "Analysis" button on each project card in `ProjectDashboard.tsx`

- `python/database/models.py` — `Project` (key PK `proj1..6`, seeded by
  migration with the original's hardcoded accent colors; `running_since`
  tracks a live timer, not in the legacy schema but needed to support
  start/stop), `ProjectSubtask` (pid PK keeps the legacy
  `"proj1:<ms>:<idx>"` format so existing references resolve untouched),
  `ProjectActivity` (per project+day: timer seconds + manual override
  mark — merges what were two separately-keyed legacy dicts,
  `__ptime_*` and `__consist_mark_*`), `CirclePerson` (project-scoped or
  `project_key=NULL` for the legacy unassigned list)
- **`Task.project`/`Task.psrc` are now real foreign keys** (were bare
  unconstrained strings) to `projects.key` / `project_subtasks.pid` —
  verified genuinely enforced, not just declared: `PRAGMA foreign_keys`
  reads 1, and an invalid reference raises `IntegrityError`
- Fixed a fidelity bug caught before it shipped: initially seeded
  `name = "PROJECT 1"` etc. as real data, which would have broken the
  original's "unnamed slot vs. real project" distinction (`_named_projects`
  filters on non-empty title, and daily totals only count named ones) —
  seed now leaves `name` empty, matching the original
- `python/engine/projects.py` — project edit/target-bump, subtask
  add/toggle/delete, timer start/stop (elapsed credited to *today* on
  stop, matching `_proj_add_secs`), manual consistency marks, 30-day
  activity strip, circle add/mark-contacted/adopt-from-unassigned
  (sorted worst-gap-first), finished-sinks project ordering
- `python/api/routes/projects.py` — `/api/projects` (+`/order`,
  `/today-progress`, `/{key}/target`, `/{key}/toggle-timer`, `/{key}/mark`,
  `/{key}/activity`, `/{key}/subtasks`), `/api/circle`
- `renderer/src/components/ProjectDashboard.tsx` — 6 cards in
  finished-sinks order, editable name/progress/timer/activity-strip/
  subtasks/circle

**Goals** (per-project YEARLY/MONTHLY/WEEKLY targets) are fully ported:

- `python/database/models.py` — `Goal` (project_key, horizon, text, done,
  start_date, done_date, note), horizon constrained to `GOAL_HORIZONS`
  (yearly/monthly/weekly)
- `python/engine/goals.py` — CRUD plus `day_number` (days elapsed since
  start_date, 1-indexed, falls back to 1 on a malformed date rather than
  raising — matches legacy's `day_number()`); panel-level state (which
  project the Goals screen shows, optional renamed section headings)
  reuses `TaskRepository`'s `app_state` singleton rather than a new
  repository, same reasoning as `engine.settings`
- `python/api/routes/goals.py` — `/api/projects/{key}/goals`
  (+ `/api/projects/goals/{id}` for edit/toggle/delete), `/api/goals/panel`
  (+ `/project`, `/section-title`)
- `renderer/src/components/GoalsPanel.tsx` — project switcher, 3 horizon
  sections with a capped-at-30-day progress bar per goal, per-goal
  note/start-date editing, renamable section titles

**NOW** (the single focused-task pointer, explicitly deferred out of the
Tasks/Strike slice above) is also fully ported:

- `python/engine/now.py` — `NowEngine.get()` derives the pointer live
  rather than trusting a stored id: an explicit override
  (`app_state.now_task_id`) is honored only while it still qualifies
  (struck, not done); otherwise it falls back to the first unfinished
  struck task in the current day-view. This makes completing/un-starring/
  deleting the pointed-to task self-healing instead of leaving a dangling
  id — never raises, just stops answering with it. Same
  never-store-derivable-state choice as `engine.journey`'s current-stage
- `toggle_run()` starts/pauses the NOW task's timer and its linked
  project's timer together (the actual payoff of `Task.project`
  existing), and — unlike the regular per-task timer toggle, which
  deliberately allows a Plan and a Focus task to run concurrently —
  stops every *other* running task first: NOW is "one clock at a time"
- `complete()` finishes the task and clears the pointer, but the clock
  does **not** carry over to whatever's picked next — finishing one
  thing and starting the next stay two separate decisions (same
  reasoning as the idle-stop timer-safety design above)
- `strike_project_task()` — the "+ STRIKE" action: promotes a project
  subtask straight into today's Focus strike list (re-striking an
  existing not-yet-done promotion if one exists), enforcing the same
  `STRIKE_MAX` cap against the same day-view-filtered count the regular
  strike toggle uses
- `python/api/routes/now.py` — `/api/now` (get/toggle-run/complete/
  `{task_id}`), plus `/api/projects/subtasks/{pid}/strike`
- `renderer/src/components/NowCard.tsx` — shown above the Focus list
  only, live-ticking timer re-anchored to the server's `secs` on every
  fetch (avoids drift), START/PAUSE/COMPLETE; nudges `TaskList` to
  refetch since NOW mutates fields (strike/done/sessions) the Focus list
  itself renders

**Journey** (the 6-stage per-project "Product Idea → Launch" tracker) is
fully ported, backend and frontend:

- `python/database/models.py` — `ProjectJourney` (1:1 with `projects`:
  proj_name/tagline/cover_image/attach_file — image and attached-file are
  stored as absolute filesystem paths, not embedded blobs, matching the
  legacy "launch, don't embed" assumption of a single-user desktop app),
  `JourneyStage` (one row per project+stage 0-5: name/description/gate/
  gate_done), `JourneyTask`, `JourneyLogEntry` (dated, 3-state `status`:
  `""`/`"ok"`/`"no"`)
- `python/engine/journey.py` — current-stage and stage-done are
  deliberately **not** columns: legacy stores+defensively-recomputes
  `stage`, but the port just derives it live every read (gate written →
  the gate's tick decides and *only* it; gate empty → every task done,
  and at least one exists) so the stored value and the rule can never
  disagree. `launched`/`advanced` toast events fire only right after the
  one mutation (gate toggle or task toggle) that can move the pointer
  forward — matches legacy exactly, including not firing on a task
  delete that happens to also complete a stage
- `python/api/routes/journey.py` — `/api/projects/{key}/journey`
  (+ `/stages/{i}`, `/stages/{i}/gate`, `/stages/{i}/gate/toggle`,
  `/stages/{i}/tasks`, `/stages/{i}/logs`), plus flat id-addressed
  `/api/journey/tasks/{id}` and `/api/journey/logs/{id}` for edit/toggle/
  delete/cycle (a task/log id is already a globally-unique ms-timestamp,
  so these don't need the project key)
- `renderer/src/components/JourneyPanel.tsx` — project switcher, editable
  header (name/tagline/cover-image path/attach-file path), a 6-stage
  strip (current stage bold, done stages checked), and a stage detail
  panel with gate toggle+text, task CRUD, and log CRUD with the 3-state
  cycle button; a toast surfaces the `launched`/`advanced` event returned
  from the one mutating call that triggers it

**Export** (JSON backup + CSV) is fully ported:

- `python/engine/export.py` — `build_backup()` dumps every persisted
  table generically (every column via SQLAlchemy's mapper introspection,
  not a hand-maintained per-table field list, so a new column is never
  silently missed) under one versioned envelope (`schema_version`) — the
  closest equivalent to the legacy app's single-JSON-blob save file, now
  that state lives in real tables instead. `build_csv()` reconstructs the
  legacy CSV's exact task-row columns plus a per-day activity summary
  row — documented inline as an *improvement* over legacy's semantics in
  one place (`seconds` now sums real `ProjectActivity` instead of
  whatever `progress_secs` happened to hold at rollover) and a
  *narrower* one in another (no completion timestamp is tracked, so
  `done` means "scheduled for day D and currently done," not legacy's
  literal same-day snapshot)
- `python/api/routes/export.py` — `/api/export/backup`, `/api/export/csv`
- Wired into `App.tsx`'s "⬇ Export Data" header button: fetches both
  payloads, then hands them to the Electron main process's folder picker
  (`window.api.exportSave`) in one call, producing both files in one
  chosen folder — matches the legacy app's single "Export Data" action

Everything else (licensing, auto-update, etc.) is still just the empty
skeleton from the original scaffold. Daily Planner is not part of that
list — the legacy app had already removed the feature itself (see the
Importing section below) before this port started, so there is nothing
left to port.

## Importing your existing data

The Tkinter app's data lives in `~/.task_tracker_v6.json`. To pull it into
the new SQLite database:

```
cd python
APP_DB_PATH=/path/to/app.db .venv/bin/python -m database.import_legacy ~/.task_tracker_v6.json
```

Safe to re-run — idempotent for Projects (updates existing seeded rows,
skips subtasks/activity-days/circle-contacts already present), Tasks
(skips ids already present), and Habits (skips completions already
recorded, matches habit names to existing rows or creates them if
missing). **Projects import must run before Tasks** in the same
transaction — existing tasks' `project`/`psrc` are now real FKs, so the
referenced project/subtask rows have to exist (and be flushed) first, or
those inserts fail FK validation. Pulls:

- Projects: `vision_data[proj1..6]` (title/note/detail_note/note_bg/
  note_fg/subtasks) plus, from `habit_data` despite the name:
  `__consist_tgt_*` (target minutes), `__ptime_*` (daily timer seconds),
  `__consist_mark_*` (manual override), `__circle_*`/`__circle`
  (accountability circle, project-scoped or legacy-unassigned)
- Tasks: `id/text/done/secs/sessions/est/mit/day/urgency/strike/project/psrc`
  from `tasks` + `tasks_focus`
- Habits: day-keyed completion grids, `__habits_{cat}` custom name lists,
  and `__intention_{day}` texts out of `habit_data`

- Business Analysis: `ba_idea_*`/`ba_an_*`/`ba_fin_*`/`ba_decision_why`/
  `ba_decision_status`/`ba_next_*` (overwrites on every run, same as
  Project name/note), `ba_decision_log` (append-only — matched on
  date/from/to/why, only new entries are inserted), `ba_box_0..14` +
  `ba_box_{n}_title` (the legacy 15-box grid, upserted by index)

Doesn't touch Goals or Journey — both now have schemas but no
`import_legacy.py` support yet. Daily Planner isn't on that list because
there's nothing to import: the legacy app itself had already deleted the
feature (a one-time purge in `task_tracker_v3_THEMES.py` archives any
leftover `__dp2_<date>` entries to a sibling JSON file and drops them
from `habit_data`, noting "Life OS covers it" — folded into what this
port already has as the Habits dashboard) before this migration began,
so `~/.task_tracker_v6.json` carries no planner data to pull in.

**Settings** (theming, shortcuts, undo/redo, onboarding, and the rest of
the legacy `_show_settings` dialog) is now fully ported:

- `python/database/models.py` — `AppState` gained `theme`, `onboarded`,
  and (added together as one slice) `lang`, `analog_clock`,
  `auto_timer_on_open`, `idle_stop_min`, `phase_morning_start`/
  `phase_work_start`/`phase_evening_start`/`phase_sleep_start`,
  `goal_hours`, `currency`, `start_with_windows` — flat columns on the
  same singleton row every other cross-cutting setting already lives
  on, not a separate key-value table, so there's still exactly one
  place a new setting goes
- `python/engine/settings.py` + `python/api/routes/settings.py` —
  `GET`/`PUT /api/settings` (patches only the fields sent) plus the
  existing `POST /api/settings/theme` and `/onboarded`; `PUT` clamps
  the same way the legacy dialog's steppers did (idle 2-120min, phase
  hours 0-23, goal 1-12h, currency falls back to `"$"` on blank)
  rather than trusting the caller
- `python/database/repository.py` — `AppState` access (`get_app_state`/
  `save_app_state`) is now exposed on both `TaskRepository` and
  `ProjectRepository` off one shared implementation, since the row is
  genuinely global rather than owned by either
- **`idle_stop_min` actually drives the timer**, not just a number that
  round-trips through the API: `engine/timer_reconciliation.py`'s
  project-timer functions (`tick_project`/`stop_project`/`start_project`/
  `reconcile_all_projects`) take an optional `idle_limit_secs` and
  self-resolve it from settings via whichever repo they already have
  when the caller doesn't pass one explicitly; the task-side functions
  (`tick_task`/`stop_task_session`) take a plain int instead (they have
  no repo to resolve from), so their repo-holding callers
  (`reconcile_all_tasks`, `stop_task_and_project`, plus
  `TaskEngine.toggle_done`/`toggle_timer` in `engine/tasks.py`) resolve
  it once and pass it down. The module-level `IDLE_LIMIT_SECS = 15 * 60`
  constant survives only as the fallback default (and matches
  `idle_stop_min`'s own column default), so every existing test and
  call site that doesn't care about the setting keeps working
  unchanged
- `renderer/src/themes.ts` — 4 of the legacy app's 6 named themes
  (Focus/War Room/Energy/Journey), applied as CSS custom properties on
  the document root so any component can opt in via `var(--bg)` etc.;
  currently wired into the app shell, not yet every component's
  semantic colors (MIT gold, urgency red, project accents stay
  theme-invariant, matching how those read as fixed semantic colors in
  the original too)
- Theme switcher button in the header + `Ctrl+T`/`Ctrl+Shift+T` cycle
  shortcut, both backed by the same persisted setting
- `Ctrl+Z`/`Ctrl+Shift+Z` undo/redo (`renderer/src/undo.tsx`) — a
  generic 30-deep stack matching the legacy app's `_UNDO_MAX`, wired
  into `TaskList.tsx`'s add/delete/toggle-done/MIT/urgency/strike
  actions (the same scope the legacy undo stack actually covered — it
  was never app-wide there either). Redo has no legacy precedent (the
  original app only ever had undo) but was cheap to add symmetrically.
  `POST /api/tasks/restore` (re-inserts an exact snapshot, same id) is
  what makes delete undo-able without a soft-delete column.
- `F1`/`?` keyboard-shortcuts help overlay
  (`renderer/src/components/ShortcutsHelp.tsx`)
- First-run onboarding tour (`renderer/src/components/OnboardingModal.tsx`),
  3 steps, gated on the persisted `onboarded` flag
- `renderer/src/components/SettingsDialog.tsx` — the ⚙ header button
  opens one dialog covering every section above (Appearance/Time
  tracking/Schedule/Productivity/System), each control committing
  immediately via `PUT /api/settings` (no separate Save step), plus a
  "More" section linking to Shortcuts/Export and a static About block
  (version/contact)

`start_with_windows` is stored as a plain preference only — actually
registering/unregistering the app with Windows startup is Electron
main-process territory (`app.setLoginItemSettings` or a registry write)
and isn't wired yet; the toggle just remembers what the user asked for.

**Business Plan Notes** (an unlimited list of opportunity/plan cards —
replaces the legacy screen's old fixed 6-block layout) is ported with
one deliberate scope adjustment, noted below:

- `python/database/models.py` — `BdpPlan` (a single global list, *not*
  project-scoped, matching legacy's own flat
  `vision_data["self_dev"]["plans"]`; `order` is a float so a new plan
  can be inserted at the very top or between two neighbors without
  renumbering everything else) and `BdpAction` (the next-actions
  checklist — given a real ms-timestamp id per action instead of
  legacy's retype-the-whole-textarea-and-match-by-text approach, same
  convention as JourneyTask)
- `python/engine/bdp.py` — full CRUD, status/priority/market/text
  search filtering (market's "Other" bucket = anything not
  Bangladesh/USA/Global/blank, matching legacy exactly), manual vs.
  priority sort (`_rank`: HIGH before MEDIUM before LOW, then higher
  potential first, then oldest first — reading top to bottom already
  tells you what to look at first), duplicate (copies the actions too,
  as new independent rows), archive (hidden from the default list,
  never deleted), and the checklist's add/toggle/edit/delete
- `python/api/routes/bdp.py` — `/api/bdp/plans` (+`/{id}` edit/delete,
  `/{id}/duplicate`, `/{id}/archive`, `/{id}/move`, `/{id}/actions`),
  `/api/bdp/sort`, flat `/api/bdp/actions/{id}` (+`/toggle`)
- `renderer/src/components/BdpPanel.tsx` — search + status/priority/
  market filters, sort toggle, plan cards with an expandable "Details"
  section (title/status/priority always visible; the other ~15 fields,
  star ratings, and next-actions checklist behind one click, since 21
  simultaneously-visible fields per card was a wall, not a list) and a
  row menu (duplicate/archive/delete)
- Seeded via the Alembic migration itself (`c9ce19d69cbf`) rather than
  a lazy on-first-load check like legacy's `_bdp_seed` — a migration
  already only ever runs once, so it doesn't need legacy's separate
  `_migrated_v2` flag to avoid reseeding after the six examples are
  deleted
- **Scope adjustment**: legacy's table-view/list-view toggle and true
  mouse drag-to-reorder are consolidated into one card view with ▲/▼
  move buttons — same manual-ordering capability, without a second
  rendering mode or a drag library for equivalent functionality. Not
  extended to `import_legacy.py` — this is a new-to-the-port feature
  area with no existing rows to migrate forward, same as Goals/Journey.

**90-Day (or N-day) Quarterly Plan** (a repeating whole-life-review
cycle, six areas x three prompts each) is fully ported:

- `python/database/models.py` — `QuarterlyAnswer` (one row per
  (cycle, area), flattening legacy's single
  `_habit_data["__q90_<cycle-start>"]` nested dict the same way Goal
  already flattened yearly/monthly/weekly) plus `AppState.q90_cycle_start`/
  `q90_cycle_days` (the cycle anchor + length — global settings, not
  owned by any one cycle's answers). `Q90_AREAS`/`Q90_CYCLE_PRESETS`/
  `Q90_CYCLE_MIN`/`Q90_CYCLE_MAX` match legacy's `_Q90_AREAS`/
  `CYCLE_PRESETS`/`CYCLE_MIN`/`CYCLE_MAX` exactly (craft/career is
  deliberately absent — that's what the 6 Projects and their Goals
  already are)
- `python/engine/quarterly.py` — `cycle_span`/`cycle_progress` port
  legacy's `_cycle_span`/`_cycle_progress` line-for-line, including the
  "no anchor chosen yet" fallback to the calendar quarter containing
  today (so a fresh install needs no setup step first) and cycles
  repeating forward from the anchor forever rather than expiring;
  `set_cycle` moves the current cycle's answers to the new key,
  matching legacy's `_set_cycle` (existing destination answers win,
  nothing is ever silently deleted)
- `python/api/routes/quarterly.py` — `GET /api/quarterly/panel`,
  `POST /api/quarterly/answer`, `POST /api/quarterly/cycle`
- `renderer/src/components/QuarterlyPlanPanel.tsx` — header (cycle
  length + "N/6 areas set" + date range/countdown, editable inline),
  6-area accordion (one open at a time, auto-opens the first area with
  no outcome written yet — matches legacy exactly), each area's 3
  prompts (Outcome/weekly Action/If-then) autosaving on blur

## Next steps

Same approach, one feature at a time: enumerate the real fields a feature
uses in `task_tracker_v3_THEMES.py`, design the table, port the engine
logic, wire the routes, build the React screen, then extend
`import_legacy.py`. Daily Planner is off this list — the legacy app had
already removed it (see "Importing your existing data" above), and
Settings, Business Plan Notes, and the Quarterly Plan are now fully
covered (see above). What's actually left: licensing, auto-update, and
actually wiring `start_with_windows` to the real Windows startup entry
on the Electron side — the last remaining gaps are these app-packaging
concerns plus the long tail of smaller UI polish items tracked in
`FEATURE_INVENTORY.md` (search/filter boxes, drag-to-reorder as actual
mouse drag rather than buttons, richer Habits dashboard visuals, and
similar).
