# Habit OS — Legacy Feature Inventory

Exhaustive pass over `task_tracker_v3_THEMES.py` (17,495 lines), extracted
section-by-section directly from source. Status is judged against the
Electron/Python port as of 2026-09-05. **Done** = fully working in the
port. **Partial** = some real part of it works, meaningful gap remains.
**Not Started** = nothing exists in the port yet.

Pure internal visual/utility plumbing (color-blend math, hover-tint
helpers, rounded-rect canvas drawing, tooltip positioning, drag-ghost
animation, DPI awareness, dark-titlebar toggling, scrollbar re-skinning,
focus-ring styling) is bundled into a small number of "infrastructure"
rows near the end of each relevant section rather than exploded into
one row per helper function — those are implementation details of
features already tracked above them, not separate user-facing
capabilities. Ask if you want that granularity broken out further.

---

## A. App infrastructure / data integrity

| # | Feature | Status | Legacy lines |
|---|---|---|---|
| 1 | Load save file with fallback through daily backups on missing/corrupt file | Not Started | 478-535 |
| 2 | Default/fresh data schema for a brand-new install | Done (Alembic migrations + seed data serve the same role) | 538-568 |
| 3 | Atomic save (temp file + fsync + rename) on every change | Partial (SQLite gives its own durability guarantees, not the same atomic-JSON-swap mechanism) | 571-711 |
| 4 | Daily backup rotation (copy save file once/day, prune beyond 14) | Not Started | 439-475 |
| 5 | Single-instance lock file (detects/overrides stale locks from crashed processes) | Not Started | 401-436, 353-398 |
| 6 | Corrupt-file quarantine + recovery notice dialog on next launch | Not Started | 478-535, 17420-17430 |
| 7 | Windows per-monitor DPI awareness | Not Started (Electron handles DPI itself, but no equivalent tuning) | 48-58 |
| 8 | Windows dark title bar matched to active theme | Not Started (no theme system) | 2055-2098 |
| 9 | Window geometry persistence (main + every Toplevel, debounced save on move/resize) | Not Started | 2141-2197 |
| 10 | Progressive panel layout (compact/partial/full, screen-edge docking) | Not Started | 15748-16074, 15818-15923 |
| 11 | App close handler: stop timers cleanly, fold today into history, save, release lock | Partial (Electron's window-all-closed kills the Python engine; timer reconciliation on next startup covers the "stop timers cleanly" intent, but nothing folds a day into history since there's no daily_history equivalent) | 17351-17387 |
| 12 | Startup crash handler (traceback to file + dedicated error window with copy button) | Not Started | 17432-17495 |
| 13 | Single-instance-already-running prompt (Yes/No, warns about overwrite risk) | Not Started | 17399-17417 |
| 14 | "Start with Windows" autostart toggle (registry Run key) | Not Started | 15201-15252 |

## B. Global UI chrome / shortcuts

| # | Feature | Status | Legacy lines |
|---|---|---|---|
| 15 | Theme system (6 named themes: Focus/War Room/Energy/Executive/Journey/Rize) | Partial (4 of 6 palettes ported as CSS vars — Focus/War Room/Energy/Journey; only the app shell and modals consume them so far, not every component) | 721-944, 15397-15438 |
| 16 | Theme cycle keyboard shortcut (Ctrl+T / Ctrl+Shift+T) | Done | 1978-1994, 7446-7473 |
| 17 | Language picker (English/Bangla), used across several panels | Not Started | 15440-15456 |
| 18 | Global undo stack (Ctrl+Z), 30-deep, covers add/edit/delete/MIT/urgency/timer-reset/reorder | Done, Tasks-scoped (matches legacy's actual scope — add/delete/toggle-done/MIT/urgency/strike; reorder and timer-reset not wired). Redo (Ctrl+Shift+Z) added too, no legacy precedent | 9140-9172 and per-action `_undo` closures throughout |
| 19 | Undo toast ("<action> — UNDO", 5s) | Done | 9202-9257 |
| 20 | Right-click context menu (Cut/Copy/Paste/Select All) on text fields | Not Started | 1906-1971 |
| 21 | Global mouse-wheel scroll dispatch (finds nearest scrollable ancestor) | Not Started (web scrolling handles this natively) | 1824-1903 |
| 22 | Keyboard shortcuts: Ctrl+S save, Ctrl+W/Esc close dialog, Ctrl+F focus mode, F1/? shortcuts panel | Partial (F1/? done; no Ctrl+S needed since every action autosaves immediately; Ctrl+W/Esc and Ctrl+F have no dialog-stack/focus-mode concept to attach to yet) | 1974-2030 |
| 23 | Keyboard-shortcuts help overlay panel | Done | 16077-16127 |
| 24 | First-run onboarding tour (3-step modal) | Done | 16130-16235 |
| 25 | Daily MIT morning prompt (pick today's MIT if none set) | Not Started | 14508-14571 |
| 26 | Keyboard-focus ring (visible focus indicator on every control) | Not Started (browser default focus styling only) | 1777-1822 |
| 27 | Delayed hover tooltips on icon-only buttons | Not Started | 244-303 |
| 28 | Empty-state placeholders with clickable suggestion chips | Not Started (plain "No tasks yet." text only) | 308-337, 8940-8948 |
| 29 | Tools menu (gear icon): Life OS / Cash Tracker / BDP / Goal Roadmap / Deep Work / Browse Music / Focus Mode / Re-entry / Settings | Not Started as a dropdown menu (the port has no such menu; most of its entries are the separate sibling apps in section R, out of scope). Its Settings entry specifically is reachable directly, via its own ⚙ header button — see section O | 16237-16332 |
| 30 | Debounced-autosave-with-flash-confirmation pattern (used everywhere text is typed) | Partial (individual fields do autosave on blur via each component's own onBlur handler; no shared debounce/flash mechanism) | 7605-7640 |

## C. Clock / hero card

| # | Feature | Status | Legacy lines |
|---|---|---|---|
| 31 | Analog + digital clock face | Not Started | 8141-8312, 3290-3317 |
| 32 | Day-phase progress bars (Morning/Work/Evening/Sleep, configurable start hours) | Not Started | 7881-8138 |
| 33 | Deep Work Trend chart (30/90-day line chart, 7-day moving average, hover tooltip) | Not Started | 14136-14416, 3371-3403 |
| 34 | "This week: N of 7 days on target" summary line | Not Started | 14177-14208, 3060-3088 |
| 35 | Capacity insight ("you tend to do deep work around X") | Not Started | 14465-14506, 3408-3410 |
| 36 | Work motto banner (editable) | Not Started | 3425-3430 |
| 37 | TODAY PROGRESS segmented bar (per-project on PLAN, gradient on FOCUS, milestone glow, 100% celebration) | Partial (ProjectDashboard shows a plain percentage line, no segmented/gradient visualization) | 7659-7878, 4894-4947 |
| 38 | TODAY/MONTH/YEAR "time remaining" stat row | Not Started | 4839-4892, 6200-6268 |

## D. Tasks (Plan/Focus lists)

| # | Feature | Status | Legacy lines |
|---|---|---|---|
| 39 | Add task | Done | 8954-8982 |
| 40 | Edit task text | Done | 10015-10066 |
| 41 | Delete task | Done | 9174-9200 |
| 42 | Toggle done | Done | 9275-9349 |
| 43 | Time-box parsing (`~NN`/`~NNm` suffix → estimate) | Done | 8958-8964 |
| 44 | Parkinson's-Law "over the time-box" warning once actual exceeds estimate | Not Started | 9803-9809, 10157-10164 |
| 45 | MIT (exactly one Most Important Task per list) | Done | 9068-9084 |
| 46 | Urgency cycling (low→med→high→low) | Done | 9088-9104 |
| 47 | Task timer start/stop with session history | Done (plus crash/idle-safety fixes beyond legacy's own robustness) | 9351-9396, 9359-9396 |
| 48 | Session-history detail view (expand a task to see each session's start/end) | Partial (data is stored and used correctly; no UI to view individual sessions) | 9984-10013, 9418-9420 |
| 49 | Timer reset (zero secs + sessions) | Done | 9398-9416 |
| 50 | Strike List (star up to 3 Focus tasks as "today's committed") | Done | 2290-2328 |
| 51 | "3/3 — full" flash on hitting the strike cap | Done | 2410-2432 |
| 52 | TODAY/TOMORROW day-view toggle (global, Plan-tab-only switch, reshapes Focus too) | Done | 8996-9026 |
| 53 | New task defaults to the day currently being viewed | Done | 8965-8971, 8988-8994 |
| 54 | "→ Today" button to promote a Tomorrow task | Not Started | 9106-9123 |
| 55 | Live task search/filter box | Not Started | 9576-9585 |
| 56 | Drag-to-reorder tasks within a list | Not Started | 9028-9066, 9702-9767 |
| 57 | Editable task-list section heading (per list × day, 4 variants) | Not Started | 4504-4588 |
| 58 | Task count badge ("done/total") | Not Started (UI shows the list but no summary count) | 9488-9496 |
| 59 | Double-click task to edit | Not Started (port has no click-to-edit; text is not editable inline or via dialog from the list) | 9637, 9802 |
| 60 | Undo for every task action (add/edit/delete/MIT/urgency/reorder/timer-reset) | Not Started | scattered `_undo` closures, see row 18 |

## E. NOW panel (focused-task pointer)

Full stack (data model + API + UI) built and live-verified this
session — `AppState.now_task_id`, `engine/now.py`'s `NowEngine`, the
`/api/now/*` + `/api/projects/subtasks/{pid}/strike` routes, and
`NowCard.tsx` + the "→ NOW" pointer button (TaskList) + the "+ STRIKE"
chip (ProjectDashboard).

| # | Feature | Status | Legacy lines |
|---|---|---|---|
| 61 | NOW card (single focused task, derived or explicitly pointed) | Done | 2261-2288, 5059-5163 |
| 62 | ▶ START/⏸ PAUSE on NOW task — also starts/stops its linked project's timer | Done | 2434-2462 |
| 63 | ✓ COMPLETE on NOW task — finishes it and advances to the next | Done | 2464-2485 |
| 64 | Global one-timer-at-a-time exclusivity when driven via the NOW panel | Done | 2450-2453 |
| 65 | "+ STRIKE" button on a project subtask row (promotes it into today's Focus/Strike list) | Done | 2344-2379 |
| 66 | Linked task+project timer stop (the bug-fix this exists for: un-starring a running task must stop its project's clock too) | Done (fixed as part of building the linkage that makes the bug possible — verified live: un-starring a task whose linked project was running correctly stops both) | 2487-2501 |

## F. Habits / Discipline

| # | Feature | Status | Legacy lines |
|---|---|---|---|
| 67 | Per-category (Money/Health/Relation/Mindset) daily checklist | Done | 2507-2525, 16943-17134 |
| 68 | Custom habit names per category (add/rename/remove, falls back to shipped defaults) | Done | 2507-2511, 17036-17114 |
| 69 | Streak (≥50% of active habits, consecutive days ending today) | Done | 2537-2551 |
| 70 | Weekly score bars/chart | Partial (port shows simple week bars; legacy has a full line+bar chart with best/worst-day callouts, matplotlib if available) | 17145-17223 |
| 71 | Daily intention ("TODAY I WILL:") | Done | 16857-16879 |
| 72 | Daily win ("TODAY'S WIN:") | Not Started | 16881-16903 |
| 73 | End-of-day reflection | Not Started | 17226-17263 |
| 74 | Monthly report (avg score / streak / days done for the month) | Not Started | 17265-17299 |
| 75 | Score-of-100 ring gauge (color-coded) | Not Started (a number/percent may show, no ring visualization) | 16824-16856 |
| 76 | Low-score-after-6pm alert | Not Started | 16905-16917 |
| 77 | Compact "Discipline" mini-view inside a PLAN review tri-tab (separate surface from the full dashboard, same data) | Not Started (port has one flat Habits tab, no PLAN-review-card container at all) | 3705-3759 |
| 78 | Separate "Mindset" tab (today's note + last-7-days history) — distinct from the intention field above | Not Started | 3648-3702, 3464-3465 |

## G. Consistency tracking (per-project daily target)

| # | Feature | Status | Legacy lines |
|---|---|---|---|
| 79 | 30-day per-project activity grid, auto-hit vs manual-mark, streak/status text | Done | 3762-3955 |
| 80 | Manual day-mark toggle (can only add a day the timer missed, never erase a real hit) | Done | 3891-3903 |
| 81 | Per-project daily target stepper (±15 min, 5-600 range) | Done | 3908-3948 |
| 82 | Target-cycle-by-click-on-time-text (alternate control, presets 15/30/45/60/90/120) | Partial (port uses a stepper instead of a click-to-cycle-presets control — same underlying capability, different control) | 2762-2778 |

## H. Accountability circle

| # | Feature | Status | Legacy lines |
|---|---|---|---|
| 83 | Add/remove a contact per project | Done | 4043-4059, 4172-4175 |
| 84 | Worst-gap-first sort | Done | 4083-4086 |
| 85 | Overdue flag (`gap > cadence`) | Done | 4090, 4118 |
| 86 | "✓ today" mark-contacted | Done | 4157-4164 |
| 87 | Cadence cycling (1/3/7/14/30 days) | Done | 3963, 4139-4152 |
| 88 | Legacy-unassigned list + "adopt onto a project" | Done | 3985-3994, 4192-4215 |

## I. Projects overview (6 fixed cards)

| # | Feature | Status | Legacy lines |
|---|---|---|---|
| 89 | 6 fixed project slots with accent colors | Done | 6271-6308 |
| 90 | Editable project title | Done | 6450-6512 |
| 91 | Project timer start/stop | Done (plus crash/idle/exclusivity safety fixes beyond legacy) | 2715-2755 |
| 92 | Idle auto-stop with refund | Done (hardcoded 15 min) | 2699-2824 |
| 93 | Idle-stop threshold configurable in Settings | Done (`idle_stop_min` on `AppState`, `SettingsDialog.tsx`'s "Stop after idle" stepper; `engine/timer_reconciliation.py`'s project/task functions self-resolve it from settings instead of the old hardcoded constant) | 2699-2708, 15469-15471 |
| 94 | Single-running-project exclusivity | Done | 2715-2755 |
| 95 | Auto-start timer on opening the project's BA/Journey window | Not Started | 2780-2824 |
| 96 | 30-day activity/progress bar + top-strip canvas | Partial (a simple bar exists; no top-strip canvas, no per-day heat coloring) | 6392-6394, 6883-6926 |
| 97 | Subtask add/toggle/delete | Done | 6974-7171 |
| 98 | Subtask "+ STRIKE" promotion chip | Not Started (depends on NOW panel / strike-from-project linkage) | 7051-7106 |
| 99 | Subtask "Deep Work" launcher button (opens sibling Deep Work app) | Not Started | 6992-7106 (button), 16576-16635 (launcher) |
| 100 | Project card collapse/expand + "solo this project" | Not Started | 6539-6627 |
| 101 | Quick Notes text box per project | Partial (fields exist in schema/API, no textarea in the UI) | 6634-6696 |
| 102 | Finished-projects-sink-to-bottom ordering | Done | 2635-2656 |
| 103 | "N/M projects at target" today progress summary | Done | 141-151 in `projects.py` (today_progress) vs 2658-2672 legacy |

## J. Goals (yearly/monthly/weekly, per project)

| # | Feature | Status | Legacy lines |
|---|---|---|---|
| 104 | Per-project goal lists (yearly/monthly/weekly) | Done | 7284-7443, 4235-4248 (data model context) |
| 105 | Add/edit/delete a goal | Done | 8487-8572, 8593-8656 |
| 106 | Toggle goal done | Done | 8574-8584 |
| 107 | 30-day goal progress bar with tooltip | Done | 8828-8899 |
| 108 | Editable section headings (Yearly/Monthly/Weekly) | Done | 7386-7435 |
| 109 | Project selector for the Goals panel | Done | 7246-7282 |

## K. Business Analysis canvas (per project)

| # | Feature | Status | Legacy lines |
|---|---|---|---|
| 110 | IDEA section (business/problem/customer/goal) | Done | 10351-10356 |
| 111 | ANALYSIS section (market/competition/strength/risk) | Done | 10357-10362 |
| 112 | FINANCIAL section (investment/cost/revenue/profit) | Done | 10363-10368 |
| 113 | DECISION section (why + GO/VALIDATE/PIVOT/NO-GO toggle) | Done | 10369-10371, 10770-10829 |
| 114 | Decision history log (auto-appends on every status change, capped at 40, snapshots "why") | Done | 10806-10814, 10967-11002 |
| 115 | NEXT ACTION section (action/priority/deadline) | Done | 10372-10373, 11004-11060 |
| 116 | PEOPLE (Circle) section embedded in the BA page | Done (same Circle feature as row 83-88, reused here) | 11062-11094 |
| 117 | Legacy 15-box freeform grid (read-only archive) | Done | box fields referenced at 10573-10731 (dead per-box UI), data model per row 616-617 in chunk A |
| 118 | Attach a Word/Excel/CSV file to the BA page | Not Started | 10490-10556 |
| 119 | Old single-blob-to-per-field one-time migration (`ba_idea`→`ba_idea_business` etc.) | Done (handled once during import, no live migration needed since the port starts from the already-current field names) | 10392-10400 |

## L. Product Journey (6-stage timeline, per project)

Fully ported, backend and frontend: `ProjectJourney`/`JourneyStage`/
`JourneyTask`/`JourneyLogEntry` models, `engine/journey.py` (current
stage/stage-done derived live from gate+tasks rather than stored, same
non-redundant-state choice as NOW's pointer), `python/api/routes/journey.py`
(`/api/projects/{key}/journey/*` plus flat `/api/journey/tasks/{id}` and
`/api/journey/logs/{id}`), and `renderer/src/components/JourneyPanel.tsx`.
This section was stale as "Entirely unported" from an earlier pass and
has now been re-audited against the actual code.

| # | Feature | Status | Legacy lines |
|---|---|---|---|
| 120 | 6-stage vertical timeline (Research→SEO→Viral→Acquisition→Sales/Feedback) | Done (horizontal stage-button strip rather than a vertical timeline — same 6 stages, current bold, done checked) | 11113-11127, 11671-11978 |
| 121 | Cover image (upload, crop-to-fit, fade overlay) | Partial (`cover_image` path is stored and editable via a plain text field; no file-picker upload, no image actually rendered anywhere in `JourneyPanel.tsx`, so no crop-to-fit/fade overlay either) | 11353-11467 |
| 122 | Editable project name/tagline | Done | 11469-11512 |
| 123 | Attach Word/Excel/CSV file | Partial (`attach_file` path is stored and editable via a plain text field, matching the model's "store a path, don't embed" design; no file-picker browse button and no "open" action handing it to the OS, unlike legacy's actual attach flow) | 11520-11584 |
| 124 | Per-stage exit condition ("DONE WHEN") gate | Done | 11807-11851, 12225-12288 |
| 125 | Per-stage dated findings log with worked/didn't-work status cycling | Done | 11853-11977, 12191-12223 |
| 126 | Per-stage always-visible task list (add/toggle/edit/delete) | Done | 11980-12153 |
| 127 | Auto-computed current stage (from gate or task completion) | Done | 11227-11257 |
| 128 | "PROJECT LAUNCHED!" / "advanced to next stage" toast on progress | Done | 12184-12186, 12271-12288 |

## M. Business Plan Notes / BDP (opportunity tracker)

Ported: `BdpPlan`/`BdpAction` models, `engine/bdp.py`,
`api/routes/bdp.py`, `renderer/src/components/BdpPanel.tsx` (see
README.md for the full breakdown). One deliberate scope adjustment:
legacy's table-view/list-view toggle and true drag-to-reorder are
consolidated into a single card view with ▲/▼ move buttons — same
underlying capability (see rows 130-132, 134).

| # | Feature | Status | Legacy lines |
|---|---|---|---|
| 129 | Opportunity/plan cards (title, status, priority, opportunity text, next actions, timeline) | Done (inline-editable card, not a separate modal — matches this codebase's established GoalsPanel/JourneyPanel convention over legacy's own modal-based editor) | 12875-13167 |
| 130 | Table view (dense per-project summary row) | Partial (no separate dense table layout; the one card view's collapsed state covers the same "scan many at once" job) | 13256-13624 |
| 131 | List view (compact one-line row) | Partial (same one consolidated card view stands in for this too — see row 130) | 13668-13723 |
| 132 | Full-page detail view per plan (autosave, prev/next nav) | Partial (an inline expand-in-place "Details" section autosaves every field on blur; no full-page view and no prev/next navigation between plans) | 13731-13964 |
| 133 | Search + Status/Priority/Market filters | Done (market's "Other" bucket matches legacy's exact definition: anything not Bangladesh/USA/Global/blank) | 12679-12872 |
| 134 | Manual drag-reorder + priority-based sort mode | Partial (priority-sort mode is exact; manual mode uses ▲/▼ swap-with-neighbor buttons instead of mouse drag — same reordering outcome, different input method) | 13280-13375, 12608-12618 |
| 135 | Row menu: Edit/Duplicate/Archive/Delete | Done (Edit is inline fields rather than a menu entry — nothing to "open" separately; Duplicate/Archive/Delete are icon buttons rather than a dropdown, same four actions) | 13169-13202 |
| 136 | Potential/Difficulty star ratings | Done (1-5, +/- steppers, same clamp as legacy) | 13007-13020 |
| 137 | Investment/yearly-profit currency fields | Done (`cost_amount`/`yearly_profit`, free text same as legacy's plain Entry widgets) | 13057-13059 |
| 138 | Per-plan next-actions checklist | Done, and more robust than legacy: each action gets a real id (`BdpAction`) instead of being retyped as one line in a shared textarea and re-matched to its old done-state by exact text | 13966-14026 |
| 139 | Seed example plans on first run (6 starter opportunities) | Done — seeded by the Alembic migration itself (runs exactly once, ever) rather than a lazy check-on-every-load flag, since a migration already provides that guarantee for free | 12376-12432 |
| 140 | One-time migration from the old fixed 6-block layout | Not Started / N/A — this migrates *legacy's own* pre-existing 6-block save data forward; the port has no such old-format data of its own to migrate, and `import_legacy.py` isn't extended for BDP (new-to-the-port feature area, same as Goals/Journey) | 12434-12470 |

## N. 90-Day Quarterly Plan (whole-life plan)

Entirely unported.

| # | Feature | Status | Legacy lines |
|---|---|---|---|
| 141 | Six life-area accordion (Appearance/Money/Relationship/Health/Social/Mind) | Not Started | 4235-4248, 15015-15092 |
| 142 | Three prompts per area (Outcome/Action/If-Then) | Not Started | 4276-4285 |
| 143 | Configurable cycle length (30/60/90 or custom, 7-365 day bounds) | Not Started | 4287-4393, 14759-14912 |
| 144 | Cycle progress bar + "day X of Y, N left" | Not Started | 4399-4413, 14926-14940 |
| 145 | "N/6 areas set" progress counter | Not Started | 4432-4442 |
| 146 | Auto-opens the first incomplete area | Not Started | 15095-15100 |

## O. Settings dialog

Fully ported as one slice: `renderer/src/components/SettingsDialog.tsx`
(opened via the ⚙ header button), backed by `AppState` columns +
`GET`/`PUT /api/settings`. No dedicated theme swatch-preview picker (row
147 stays partial — the existing header cycle-button/Ctrl+T remains the
only theme control); every other row below is done.

| # | Feature | Status | Legacy lines |
|---|---|---|---|
| 147 | Theme picker (radio rows + swatch preview) | Partial (header cycle-button + Ctrl+T only; `SettingsDialog.tsx` doesn't add a separate swatch-preview picker) | 15397-15438 |
| 148 | Language picker (English/Bangla) | Done (`lang` toggle, `AppState.lang`) | 15440-15456 |
| 149 | Analog-clock-face toggle | Done (`analog_clock` toggle; stored/round-tripped only — no analog clock face is rendered anywhere in the port yet, same as the port having no clock face at all) | 15458-15461 |
| 150 | Auto-start-timer-on-project-open toggle | Done (`auto_timer_on_open` toggle, `AppState.auto_timer_on_open`; stored/round-tripped only — nothing in `engine/projects.py` reads it yet to actually auto-start a timer on open) | 15463-15468 |
| 151 | Idle-stop-minutes stepper | Done (`idle_stop_min` stepper; genuinely wired into `engine/timer_reconciliation.py`, see row 93) | 15469-15471 |
| 152 | Day-phase start-hour steppers (Morning/Work/Evening/Sleep) | Done (steppers, 12h AM/PM formatted same as legacy; stored/round-tripped only — nothing in the port reads day-phase yet, since the phase bars/insights views aren't ported) | 15474-15489 |
| 153 | Daily goal-hours control | Done (`goal_hours` stepper; stored/round-tripped only — same "no project named yet" fallback role as legacy, but nothing in the port's progress bar reads it, since that bar isn't ported) | 15491-15535 |
| 154 | Currency symbol field | Done (`currency` field, same blank-falls-back-to-"$"/4-char-cap clamp as legacy; stored/round-tripped only — nothing in the port formats money with it yet) | 15538-15543 |
| 155 | Start-with-Windows toggle | Done as a stored preference (`start_with_windows`); actually registering the OS startup entry is unwired — Electron main-process work, not this dialog's | 15544-15549 |
| 156 | Links out to Shortcuts panel / Export Data / About | Done ("More" section) | 15556-15577 |

## P. Export / Backup

| # | Feature | Status | Legacy lines |
|---|---|---|---|
| 157 | One-click JSON backup export (full curated ~30-key state dump) | Done (dumps all 13 real tables under a versioned envelope — a more complete backup than legacy's single hand-curated blob, since nothing is hand-picked) | 15658-15673 |
| 158 | CSV export (tasks + daily history summary) | Done (task rows match legacy exactly; the per-day summary row is reconstructed from ProjectActivity + Task.day rather than legacy's never-ported `daily_history` — see engine/export.py's docstring for the exact semantic difference) | 15658, 15674-15690 |

## Q. About / Update

| # | Feature | Status | Legacy lines |
|---|---|---|---|
| 159 | About dialog (version/tagline/contact) | Done (folded into `SettingsDialog.tsx`'s "More" section rather than its own separate dialog; shows the port's own version (`0.1.0`) and contact, not legacy's `3.2.0`) | 15699-15739 |
| 160 | "Check for Updates" button (legacy is itself a placeholder, always reports latest) | Done as the same placeholder (always reports latest, no real check) — electron-updater dependency in package.json is still unwired, README still calls out real auto-update as empty skeleton | 15727-15732 |

## R. Sibling external apps (launched as separate processes)

These are genuinely separate standalone programs the legacy app can
launch, not internal features — listed for completeness since the user
asked for an exhaustive pass, but likely out of scope for "porting this
app" rather than a gap in it.

| # | Feature | Status | Legacy lines |
|---|---|---|---|
| 161 | Launch "Life Execution Board" (life_os.py) | Not Started / Out of scope | 16420-16482 |
| 162 | Launch "Cash Is Your Brain" finance tracker | Not Started / Out of scope | 16375-16417 |
| 163 | Launch "Goal Step" roadmap tool | Not Started / Out of scope | 16485-16530 |
| 164 | Launch "Re-entry" page | Not Started / Out of scope | 16533-16573 |
| 165 | Launch "Deep Work" session (optionally pre-filled with a task) | Not Started / Out of scope | 16576-16635 |
| 166 | Browse/play/stop background music | Not Started | 8436-8481 |

## S. Data model fields carried but with no feature wired up in the port

These persisted fields were confirmed present in the legacy schema and
(mostly) already flow through `import_legacy.py`, but nothing in the
port's engine/routes/UI reads or writes them yet — flagged separately
since "the column exists" is not the same as "the feature works."

| # | Field | Status | Legacy lines |
|---|---|---|---|
| 167 | `daily_history` (90-day archive of secs+done-count per day) | Not Started | 2971-2984, 3044-3058 |
| 168 | `_daily_history`-derived deep-work streak | Not Started | 3047-3058 |
| 169 | `bdp_data` / bdp legacy blocks (superseded by Business Plan Notes) | Not Started | 568, 12449-12463 |
| 170 | `_exec_<date>` (hour-by-hour Daily Planner data) | Not Started | 5546-5575 |
| 171 | `_q90_<cycle-start>` (Quarterly Plan answers) | Not Started | 4415-4442 |
| 172 | `swot_*` fields (Strengths/Weaknesses/Opportunities/Threats — older analysis generation, superseded by Business Analysis) | Not Started (superseded feature, unlikely worth reviving) | 598-601 |

---

## Summary

*(Updated 2026-09-06: Settings pass — rows 93, 148-156, 159-160 moved to
Done as one slice (`AppState` columns, `GET`/`PUT /api/settings`,
`SettingsDialog.tsx`, and the idle-stop setting actually wired into
`engine/timer_reconciliation.py` rather than just stored); a re-audit of
section L (Product Journey), which this file had left marked "Entirely
unported" since an earlier pass despite the feature having since been
fully built — rows 120, 122, 124-128 moved to Done and 121, 123 to
Partial; and a Business Plan Notes pass — rows 129, 133, 135-139 moved
to Done and 130-132, 134 to Partial (one consolidated card view stands
in for legacy's separate table/list views, and ▲/▼ buttons stand in for
mouse drag-reorder), row 140 stays Not Started/N/A since it migrates
legacy's own old save format, which the port has none of.)*

- **Done**: rows 16, 18, 19, 23, 24, 39-53, 61-69, 71, 79-94, 97, 102-119, 120, 122, 124-129, 133, 135-139, 148-160 — roughly **85 items**, concentrated in Tasks, the NOW panel (all 6 rows — derive/point/start-pause/complete/one-clock exclusivity/the "+ STRIKE" promotion, plus the row-66 linked-timer bug-fix), Habits' core loop, Consistency, Circle, Projects' core loop, the full Business Analysis canvas, the complete Goals feature, Product Journey (6-stage timeline, gates, tasks, findings log, auto-advance + launch toast), Business Plan Notes (opportunity cards, filters, checklist, seed data), Settings (now complete as one slice: theme cycling, undo/redo, shortcuts panel, onboarding, language/analog-clock/auto-timer/idle-stop/day-phase/goal-hours/currency/start-with-Windows/About), and Export/Backup.
- **Partial**: rows 15, 22, 30, 37, 48, 70, 82, 96, 101, 121, 123, 130-132, 134, 147 — roughly **16 items** where the data/backend exists but the UI is thin, or a control differs from legacy's exact mechanism (e.g. 4 of 6 themes; Journey's cover-image/attach-file fields store a path with no upload/preview/open UI around them; Business Plan Notes' one card view standing in for legacy's table+list toggle and ▲/▼ buttons standing in for drag; Settings has no dedicated swatch-preview theme picker).
- **Not Started**: everything else — roughly **69+ items**. The largest unported blocks by area: Habits' richer dashboard surface (6 items), Quarterly Plan (6 items), remaining app-chrome (context menu, focus ring, tooltips, empty-state chips, tools menu — ~5 items), and the sibling external apps in section R (mostly out of scope).

Net read: the **daily-driver loop** (Tasks, NOW, Habits, Projects,
Business Analysis, Consistency, Circle) is genuinely solid end to end,
**Goals, Product Journey, and Business Plan Notes** give it a full first
layer of **long-horizon and opportunity planning**, **Settings is now a
complete slice** (every toggle/stepper from the legacy dialog exists and
persists; auto-timer-on-open, day-phase hours, goal-hours, and currency
are stored but not yet read by anything else in the port, same "column
exists, feature not wired everywhere" caveat as section S), and the app
has a genuine **safety net** (Export/Backup) instead of none at all.
Still fully unstarted: Quarterly Plan.
