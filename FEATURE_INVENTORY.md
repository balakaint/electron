# Habit OS — Legacy Feature Inventory

Exhaustive pass over `task_tracker_v3_THEMES.py` (17,495 lines), extracted
section-by-section directly from source. Status is judged against the
Electron/Python port as of 2026-09-05. **Done** = fully working in the
port. **Partial** = some real part of it works, meaningful gap remains.
**Not Started** = nothing exists in the port yet. **N/A** = not a gap —
either dead code in legacy itself, a mechanism the web platform already
provides, or explicitly out of scope; every N/A row states which, and
was checked against the legacy source before being closed.

## Rollup (Phase 0 triage, 2026-09-06)

| Status | Rows |
|---|---|
| Done | 154 |
| N/A | 8 (rows 3, 7, 21, 36, 99, 140, 170, 172) |
| Excluded — section R sibling apps | 6 (rows 161-166) |
| **Remaining real work** | **4** |

The 4 remaining: 10, 11, 22, 29. Sequenced in
`PORT_COMPLETION_PLAN.md`. Phases 1-3 closed 2026-09-06 (rows 15, 147;
37, 70, 96; 130-132, 134), Phase 4 partially (rows 30, 60, 82; row 22
waits on row 10, and row 29's Tools menu carries a Focus Mode entry that
does too).

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
| 1 | Load save file with fallback through daily backups on missing/corrupt file | Done — adapted for a single SQLite file instead of a JSON blob: a magic-bytes check (not a full parse) detects corruption before Python ever opens it, a missing-but-backups-exist file is restored the same as a corrupt one (matching legacy's own load_data distinguishing "genuinely absent" from "went missing"), and a recovery dialog names which backup was used | 478-535 |
| 2 | Default/fresh data schema for a brand-new install | Done (Alembic migrations + seed data serve the same role) | 538-568 |
| 3 | Atomic save (temp file + fsync + rename) on every change | N/A (Phase 0 triage, verified against legacy 690-701) — legacy's temp+flush+fsync+`os.replace` exists to make a *single JSON blob* survive a power cut mid-write, a failure mode SQLite's own journal/WAL already handles per transaction. There is no JSON blob in the port to swap atomically, so this is a mechanism with no work left to do, not a missing capability. Durability itself is covered; row 4's daily backup covers the "good copy on disk" half | 571-711 |
| 4 | Daily backup rotation (copy save file once/day, prune beyond 14) | Done — copies `app.db` (not a re-serialization of live state, same "back up the file just proven readable" reasoning as legacy) once per calendar day, right after the Python engine confirms READY; prunes beyond 14 on every call, not just the day's first, matching legacy's own fix for a folder that otherwise grew without limit | 439-475 |
| 5 | Single-instance lock file (detects/overrides stale locks from crashed processes) | Done — `app.requestSingleInstanceLock()`, which supersedes legacy's manual PID-file entirely rather than porting the staleness check: the OS-level lock dies with the process, so there's no stale-lock state to ever detect | 401-436, 353-398 |
| 6 | Corrupt-file quarantine + recovery notice dialog on next launch | Done — a corrupt `app.db` is renamed aside (`.corrupt-<timestamp>`, kept not deleted, matching legacy) before Python ever tries to open it, then a native dialog names what happened once the main window exists (legacy's own notice likewise fires after the window opens, not before) | 478-535, 17420-17430 |
| 7 | Windows per-monitor DPI awareness | N/A (Phase 0 triage, verified against legacy 48-58) — legacy's entire implementation is one Win32 call, `SetProcessDpiAwareness(2)`, with a `SetProcessDPIAware()` fallback. Chromium sets per-monitor DPI awareness for its own process; there is no equivalent call for an Electron app to make, and no tuning knob left exposed | 48-58 |
| 8 | Windows dark title bar matched to active theme | Done — `nativeTheme.themeSource`, Electron's cross-platform equivalent of legacy's raw DWM ctypes calls, synced on theme change and on launch; energy is the port's one light theme, the other three are dark (legacy's own version only darkened for warroom/journey, excluding its dark "focus" mode — not replicated here since that reads as an oversight rather than an intentional exclusion) | 2055-2098 |
| 9 | Window geometry persistence (main + every Toplevel, debounced save on move/resize) | Done for the one window the port has — bounds + maximized state, 400ms debounced, in a local `window-state.json` rather than AppState (Electron-chrome, not app data; needed before the Python engine is even up). No Toplevel-per-window persistence since the port has no secondary windows to persist, and no re-docking system since legacy's own version deliberately discards saved X/width for that (see row 10) — a bare resizable window has no edge to redock to, so exact restoration is the right simplification here | 2141-2197 |
| 10 | Progressive panel layout (compact/partial/full, screen-edge docking) | Not Started | 15748-16074, 15818-15923 |
| 11 | App close handler: stop timers cleanly, fold today into history, save, release lock | Partial (Electron's window-all-closed kills the Python engine; timer reconciliation on next startup covers the "stop timers cleanly" intent, but nothing folds a day into history since there's no daily_history equivalent) | 17351-17387 |
| 12 | Startup crash handler (traceback to file + dedicated error window with copy button) | Done — a main-process `uncaughtException` handler plus a check on the Python engine exiting before it ever reaches READY (capturing its accumulated stderr as the traceback), both writing to a log file in userData and showing a native `dialog.showErrorBox` rather than a custom Tk-style window; text in a native error dialog is already selectable/copyable, so no separate "Copy" button was needed the way Tk's disabled-state Text widget required one | 17432-17495 |
| 13 | Single-instance-already-running prompt (Yes/No, warns about overwrite risk) | Done, simplified to silently focusing the existing window rather than a Yes/No "open anyway" dialog — legacy's warning existed because "open anyway" was survivable (worst case, one JSON write clobbers another); in the port "open anyway" would mean a second process fighting the first over the same hardcoded port and SQLite file, which has no safe outcome to offer a choice about | 17399-17417 |
| 14 | "Start with Windows" autostart toggle (registry Run key) | Done — `app.setLoginItemSettings` in the main process, using `AppState.start_with_windows` (already stored, previously unwired per row 30's own note) rather than legacy's direct registry Run-key edit; synced on every settings save and re-asserted on launch | 15201-15252 |

## B. Global UI chrome / shortcuts

| # | Feature | Status | Legacy lines |
|---|---|---|---|
| 15 | Theme system (6 named themes: Focus/War Room/Energy/Executive/Journey/Rize) | Done — all 6 palettes, in legacy's own THEME_ORDER; Executive (legacy key `corporate`) and Rize carry legacy's exact hex values, while the original 4 keep the reinterpreted core swatches an earlier pass shipped. Token set widened 7 → 44 so every component repaints, not just the shell: `--phase-*` from `_SEG_COLORS`, `--goal-*` from each theme's SECTIONS, `--habit-*` from the `_VB` dict (kept separate from the app-wide status colors — legacy's habit panel paints on its own surface, so warroom's habit-success is cyan while the app's success is green), `--ba-*` and `--bdp-*` for the fixed and light/dark sets legacy hardcodes. One deliberate divergence: warroom's `--success` is green, not legacy's cyan `DONE_GREEN`, because that value is accent-derived in legacy (warroom's accent IS cyan there) and the port's warroom accent is red. 9 literals remain on purpose — white text on saturated chips, modal scrims, one toast shadow | 721-944, 15397-15438 |
| 16 | Theme cycle keyboard shortcut (Ctrl+T / Ctrl+Shift+T) | Done | 1978-1994, 7446-7473 |
| 17 | Language picker (English/Bangla), used across several panels | Done — `renderer/src/i18n.tsx` ports legacy's `L(en, bn)` helper as a hook, plus its two tables: `_SEG_LABELS_BN` (day-phase labels) and `BN_DAYS`. **Scope note:** legacy does NOT translate the whole interface — `L()` appears at roughly thirty call sites and everything else stays English in both languages. That is ported as-is rather than widened, because half-translating is worse than not translating and a full sweep is a product decision needing Bengali review, not a port task. Translated here: NOW heading, PAUSE/START, the NOW empty hint, the weekday name on the clock, the four day-phase labels, and TODAY / "work day over" in the scope stats. Omitted with cause: legacy's Pomodoro labels and its HOURS / TASK LIST tri-tab (the port has neither screen), and the task-list heading — legacy hardcodes "TO-DO"/"আজকের কাজ" there, but the port made that heading user-editable (row 57), and overwriting someone's own title on a language switch would be wrong. The picker itself already existed in Settings and already persisted; it now also switches the running UI rather than waiting for a reload | 15440-15456 |
| 18 | Global undo stack (Ctrl+Z), 30-deep, covers add/edit/delete/MIT/urgency/timer-reset/reorder | Done, Tasks-scoped (matches legacy's actual scope — add/delete/toggle-done/MIT/urgency/strike; reorder and timer-reset not wired). Redo (Ctrl+Shift+Z) added too, no legacy precedent | 9140-9172 and per-action `_undo` closures throughout |
| 19 | Undo toast ("<action> — UNDO", 5s) | Done | 9202-9257 |
| 20 | Right-click context menu (Cut/Copy/Paste/Select All) on text fields | Done — one main-process `context-menu` handler on the BrowserWindow (Electron doesn't wire this up automatically, unlike a Chrome tab), using `params.editFlags` for per-field enabled state instead of legacy's own has-selection checks | 1906-1971 |
| 21 | Global mouse-wheel scroll dispatch (finds nearest scrollable ancestor) | N/A (Phase 0 triage, verified against legacy 1824-1903) — `_bind_global_scroll` walks the parent chain for a `tk.Canvas` with `yscrollcommand` set, and uses `winfo_containing` so the wheel works before the window has focus. Both exist because Tk has no scroll-event bubbling; the browser bubbles wheel events to the nearest scrollable ancestor by default and scrolls unfocused windows on hover. Porting it would mean re-implementing behaviour the platform already provides | 1824-1903 |
| 22 | Keyboard shortcuts: Ctrl+S save, Ctrl+W/Esc close dialog, Ctrl+F focus mode, F1/? shortcuts panel | Partial — F1/? done; Ctrl+S remains unnecessary since every action autosaves; Ctrl+W and Esc now close the TOPMOST dialog via a real open-order stack (the previous code closed every open dialog at once, so opening Shortcuts from Settings and pressing Esc dropped you to the page instead of back to Settings). **Ctrl+F is blocked on row 10:** legacy's `_toggle_focus_mode` is a two-line call into `_set_panel_layout`, so focus mode is the progressive panel layout, not a separate feature. It lands with row 10 | 1974-2030 |
| 23 | Keyboard-shortcuts help overlay panel | Done | 16077-16127 |
| 24 | First-run onboarding tour (3-step modal) | Done | 16130-16235 |
| 25 | Daily MIT morning prompt (pick today's MIT if none set) | Done — retired on Focus same as legacy (its NOW/strike surface already asks this permanently) | 14508-14571 |
| 26 | Keyboard-focus ring (visible focus indicator on every control) | Done — one global `:focus-visible` outline rule rather than legacy's per-widget styling, but same user-facing effect (keyboard-only nav visibly highlights the active control; mouse clicks don't show it) | 1777-1822 |
| 27 | Delayed hover tooltips on icon-only buttons | Done — native browser `title` attribute on every icon-only control across all panels, standing in for legacy's custom 450ms Toplevel tooltip widget (same user-facing effect: a delayed on-hover label, OS-timed rather than hardcoded to 450ms) | 244-303 |
| 28 | Empty-state placeholders with clickable suggestion chips | Done — all 5 legacy variants (Tomorrow-planning, Focus-with-commitments, Focus-empty, Classic-default, search-no-match), chip click pre-fills + focuses the add-task input rather than adding silently | 308-337, 8940-8948 |
| 29 | Tools menu (gear icon): Life OS / Cash Tracker / BDP / Goal Roadmap / Deep Work / Browse Music / Focus Mode / Re-entry / Settings | Not Started as a dropdown menu (the port has no such menu; most of its entries are the separate sibling apps in section R, out of scope). Its Settings entry specifically is reachable directly, via its own ⚙ header button — see section O | 16237-16332 |
| 30 | Debounced-autosave-with-flash-confirmation pattern (used everywhere text is typed) | Done — `useAutosave` in `renderer/src/useAutosave.ts`, legacy's `_debounced_save` + `_flash_saved` at its own 800ms: rapid edits coalesce into one save after a quiet period, blur commits immediately (leaving a field is a stronger "done" signal than a pause), and `savedFlashStyle` tints the border for 500ms to confirm. It also flushes a pending edit on unmount, so navigating away mid-sentence doesn't lose it, and refuses to accept an external refresh while an edit is unsaved. Adopted by every free-text field: BDP's shared `TextField` (~15 fields), Business Analysis's `Field`, project Quick Notes, Habits' intention/win/reflection, Goals notes, and the Quarterly prompts | 7605-7640 |

## C. Clock / hero card

| # | Feature | Status | Legacy lines |
|---|---|---|---|
| 31 | Analog + digital clock face | Done — one card (digital HH:MM:SS + two date lines, always shown) with an optional SVG analog dial layered above it, matching legacy's own default-off dial (its comment: the digital readout already answers "what time is it?" better); wired to the existing `analog_clock` setting, on the Tasks page rather than a dedicated PLAN-tab column (row 10's docked layout is out of scope) | 8141-8312, 3290-3317 |
| 32 | Day-phase progress bars (Morning/Work/Evening/Sleep, configurable start hours) | Done — nested inside the clock card per legacy's own placement; each phase's bounds/progress/wrap-past-midnight math ported line-for-line from `_phase_bounds`/`_phase_progress` (including the sleep-duration fix for a sleep-start set to 00:00), current phase gets full-strength text vs. muted for the rest | 7881-8138 |
| 33 | Deep Work Trend chart (30/90-day line chart, 7-day moving average, hover tooltip) | Done — SVG line chart on the Projects page: dotted goal line, pale raw daily line, 7-day average withheld until 3+ live days exist, zero-day red dots hidden past 50% density, "this week" tinted band, hover shows exact date+value. Data source is the existing `ProjectActivity` table (already the port's per-day-per-project time record) rather than a new `daily_history` archive — row 167 turns out to already be covered by it, see that row's note | 14136-14416, 3371-3403 |
| 34 | "This week: N of 7 days on target" summary line | Done — nested above the trend chart, ported line-for-line from `_update_week_line` (total/hit-days/best-day over the last 7 days, summed across named projects only) | 14177-14208, 3060-3088 |
| 35 | Capacity insight ("you tend to do deep work around X") | Done — buckets every Task session's start hour across Classic+Focus, same >=25%-dominance and >=1h-sample thresholds as legacy; returns nothing rather than a fabricated guess when data is thin, matching legacy's own honesty-over-fabrication reasoning | 14465-14506, 3408-3410 |
| 36 | Work motto banner (editable) | N/A (Phase 0 triage, verified against legacy 3424-3430) — dead code in legacy itself. `_work_motto_var` is created under legacy's own comment `# Placeholder vars`, and `_save_work_motto` is defined but never bound to any event; the only other references are the `save_data`/`load` round-trip of `_work_motto_text`. No widget takes it as a `textvariable`, so there is no live banner to port — only an orphaned StringVar kept so `save_data()` doesn't crash after the panel was removed | 3425-3430 |
| 37 | TODAY PROGRESS segmented bar (per-project on PLAN, gradient on FOCUS, milestone glow, 100% celebration) | Done — `TodayProgressBar.tsx`: one segment per named project filling toward its own target in its own accent, dashed outline when untouched, the card's own number centred in each segment, a ring on the running project, and the `{touched}/{n} projects today` readout using legacy's `_proj_meaningful` floor (a quarter of the target, min 5 minutes) rather than any-seconds-above-zero. Milestone glow fires on crossing a quarter INDEX, with the first render establishing a baseline so reopening at 80% doesn't celebrate three at once; 100% keeps a permanent ring. The no-projects-named fallback uses legacy's `_PB_RAMPS` gradient. Built in HTML/CSS rather than a stretched SVG viewBox, which would have distorted the segment numbers | 7659-7878, 4894-4947 |
| 38 | TODAY/MONTH/YEAR "time remaining" stat row | Done — nested in the clock card below the phase bars; TODAY reads the same work-phase-end boundary the phase bars use (one source of truth, matching legacy's own fix for a case where a separate "work_end" setting could disagree with it) and switches to "work day over" past it; only TODAY carries the accent colour since it's the only one of the three you can still act on | 4839-4892, 6200-6268 |

## D. Tasks (Plan/Focus lists)

| # | Feature | Status | Legacy lines |
|---|---|---|---|
| 39 | Add task | Done | 8954-8982 |
| 40 | Edit task text | Done | 10015-10066 |
| 41 | Delete task | Done | 9174-9200 |
| 42 | Toggle done | Done | 9275-9349 |
| 43 | Time-box parsing (`~NN`/`~NNm` suffix → estimate) | Done | 8958-8964 |
| 44 | Parkinson's-Law "over the time-box" warning once actual exceeds estimate | Done | 9803-9809, 10157-10164 |
| 45 | MIT (exactly one Most Important Task per list) | Done | 9068-9084 |
| 46 | Urgency cycling (low→med→high→low) | Done | 9088-9104 |
| 47 | Task timer start/stop with session history | Done (plus crash/idle-safety fixes beyond legacy's own robustness) | 9351-9396, 9359-9396 |
| 48 | Session-history detail view (expand a task to see each session's start/end) | Done — a `▸ N`/`▾ N` toggle next to the timer (N = session count) expands a newest-first list of each session's start–end clock time and duration, reusing `Task.sessions` (already stored, just not surfaced); no separate view/route needed since it's inline under the row | 9984-10013, 9418-9420 |
| 49 | Timer reset (zero secs + sessions) | Done | 9398-9416 |
| 50 | Strike List (star up to 3 Focus tasks as "today's committed") | Done — including a fix found this pass: a struck task now drops out of the LIST pool below (Focus/Today only), matching legacy's own _render_tasks filter; previously it rendered twice, once in NOW and once in LIST | 2290-2328 |
| 51 | "3/3 — full" flash on hitting the strike cap | Done | 2410-2432 |
| 52 | TODAY/TOMORROW day-view toggle (global, Plan-tab-only switch, reshapes Focus too) | Done | 8996-9026 |
| 53 | New task defaults to the day currently being viewed | Done | 8965-8971, 8988-8994 |
| 54 | "→ Today" button to promote a Tomorrow task | Done | 9106-9123 |
| 55 | Live task search/filter box | Done | 9576-9585 |
| 56 | Drag-to-reorder tasks within a list | Done — ▲/▼ button stand-in (same pattern as BDP's `move_plan`), not real drag-and-drop; still clamped to the task's own done-group like legacy's drag, and hidden while a search filter is active since positions wouldn't be meaningful | 9028-9066, 9702-9767 |
| 57 | Editable task-list section heading (per list × day, 4 variants) | Done | 4504-4588 |
| 58 | Task count badge ("done/total") | Done | 9488-9496 |
| 59 | Double-click task to edit | Done | 9637, 9802 |
| 60 | Undo for every task action (add/edit/delete/MIT/urgency/reorder/timer-reset) | Done — reorder and timer-reset are now wired too. **This row's previous status was wrong on the facts:** it claimed legacy doesn't undo these either, but legacy pushes an undo for both — reorder at 9059-9064, and timer-reset at 9404-9416 with its own note that this one is "worth undoing more than most things here: it throws away recorded time, and recorded time is the one thing on a task that cannot be retyped from memory." A second gap surfaced while checking: the port had no reset control at all, only an unused `resetTimer` API, so legacy's ↺ button (9947) is ported as well — shown only once there is time to throw away. Reorder undo re-issues the swap in reverse. Timer-reset undo needed a new `restore_timer` engine function and endpoint: `restore_task` is the delete-undo path and deliberately no-ops when the id still exists, which is exactly this case | scattered `_undo` closures, see row 18 |

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
| 70 | Weekly score bars/chart | Done — `WeeklyScoreChart.tsx`: inline-SVG bars thresholded green/amber/red at legacy's 70/40 cutoffs, a line with round markers over the bar tops, the value printed above each non-zero bar, legacy's 0-115 y-range so 100% doesn't touch the ceiling, and the Best/Worst callouts beneath. Bars and line carry the same series deliberately, as legacy does: the bar's colour answers "was this day good enough", the line answers "which way is the week going". Colours come from the `--habit-*` tokens, not the app-wide status ones, because this card sits on the Habits surface | 17145-17223 |
| 71 | Daily intention ("TODAY I WILL:") | Done | 16857-16879 |
| 72 | Daily win ("TODAY'S WIN:") | Done — its own field next to "TODAY I WILL:", backed by a new `win` column on the existing `daily_intentions` row rather than a separate table (same one-text-blob-per-day shape, always read/written alongside intention/reflection on this screen) | 16881-16903 |
| 73 | End-of-day reflection | Done — same `daily_intentions` row, `reflection` column | 17226-17263 |
| 74 | Monthly report (avg score / streak / days done for the month) | Done — "Days Done" counts every day with a recorded habit toggle this month (matches legacy's own _habit_data-keys count, not days that hit 100%) | 17265-17299 |
| 75 | Score-of-100 ring gauge (color-coded) | Done — SVG `stroke-dasharray` ring (green >=70, amber >=40, red below), replacing legacy's 1-degree-line-segment approximation (a workaround for Tk having no native round-capped arc) with a native equivalent | 16824-16856 |
| 76 | Low-score-after-6pm alert | Done — "⚠ N habits remaining!" past 6pm under 50%, "✓ Perfect Day" at 100% regardless of hour, blank otherwise | 16905-16917 |
| 77 | Compact "Discipline" mini-view inside a PLAN review tri-tab (separate surface from the full dashboard, same data) | Done — `PlanReview.tsx` on the PLAN tab only (legacy keeps it off FOCUS: FOCUS is where you tick things off, PLAN is where you step back). The Discipline tab shows `{done}/{total} today`, the streak only once there IS one (legacy's reasoning: a permanent "0 day streak" is a daily reminder of failure), and the habit checklist grouped by category, tappable. It reuses the same API calls as the Habits dashboard rather than duplicating logic — legacy calls this "a second door to one room, not a second room", and the earlier "low value" judgement missed the point: the value is not seeing the data again, it is not having to leave the screen where you are deciding the day | 3705-3759 |
| 78 | Separate "Mindset" tab (today's note + last-7-days history) — distinct from the intention field above | Done — and the previous status was wrong about the data: the mindset note is **not** covered by rows 72/73. Legacy stores it under its own `__mindset_<day>` key, separate from `__intention_`/`__win_`/`__reflection_`, and the port had no column for it at all. Worse, `import_legacy.py`'s per-day text prefix list omitted `__mindset_`, so every one of those notes was being **silently dropped on import** — nothing else references the key, so nothing would have caught it. Fixed here: a `mindset` column (migration b7d2f81c4a35), get/set plus a 7-day history endpoint, and the missing import prefix. The history skips days with nothing written, as legacy does — a run of blank rows reads as a broken widget, not as "you didn't write anything on Tuesday" | 3648-3702, 3464-3465 |

## G. Consistency tracking (per-project daily target)

| # | Feature | Status | Legacy lines |
|---|---|---|---|
| 79 | 30-day per-project activity grid, auto-hit vs manual-mark, streak/status text | Done | 3762-3955 |
| 80 | Manual day-mark toggle (can only add a day the timer missed, never erase a real hit) | Done | 3891-3903 |
| 81 | Per-project daily target stepper (±15 min, 5-600 range) | Done | 3908-3948 |
| 82 | Target-cycle-by-click-on-time-text (alternate control, presets 15/30/45/60/90/120) | Done — the target figure on each project card is now a button that cycles legacy's `_PROJ_TARGETS`. It picks the next preset ABOVE the current value by search rather than index lookup, exactly as legacy does, so a value the ±15 stepper produced (75, say) steps to 90 instead of snapping back to the first preset. The stepper stays alongside it, as in legacy. Implemented against the existing bumpTarget delta endpoint — no new API surface needed | 2762-2778 |

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
| 95 | Auto-start timer on opening the project's BA/Journey window | Done — shared `useAutoTimer` hook wired into both `ProjectDashboard` (BA open/close) and `JourneyPanel` (project switch); respects the existing `auto_timer_on_open` setting and never stops a timer the user started manually (checked live, not just tracked as a flag) | 2780-2824 |
| 96 | Project-card top strip + subtask progress bar | Done — the card's top strip now fills by subtask completion with legacy's two extra states: muted when the project has no subtasks (so an untouched project doesn't read like a finished one), and a 5px sliver when it has subtasks but none done (so "active, zero progress" stays distinct from "empty"). Legacy's second `pb` bar at the foot of the list is ported too — it repeats the same figure on purpose, because a card with a dozen subtasks is tall enough that the top strip scrolls out of view. **Note:** this row's old title said "30-day activity … per-day heat coloring", which described row 79's consistency grid, not this; the cited legacy lines (6883-6926) are `_draw_prog`/`_draw_top_strip` and contain no per-day colouring. Row 79 was already Done | 6392-6394, 6883-6926 |
| 97 | Subtask add/toggle/delete | Done | 6974-7171 |
| 98 | Subtask "+ STRIKE" promotion chip | Done — this file had left it marked Not Started from before the NOW panel/strike-from-project linkage was actually built; `ProjectDashboard.tsx`'s `strikeSubtask` + `POST /api/projects/subtasks/{pid}/strike` (with "+ STRIKE" / "✓ ON TODAY" / "DAY FULL" states) already fully implement it | 7051-7106 |
| 99 | Subtask "Deep Work" launcher button (opens sibling Deep Work app) | N/A — excluded with section R (Phase 0 triage). This button's entire behaviour is launching the sibling Deep Work app, which is a separate product outside this port's scope; the row cannot be closed independently of row 165 | 6992-7106 (button), 16576-16635 (launcher) |
| 100 | Project card collapse/expand + "solo this project" | Done — badge click toggles, double-click solos (collapses every other project, all-or-nothing); collapsed preview shows time-vs-target + done/total + next pending task, same as legacy's _collapsed_preview_text | 6539-6627 |
| 101 | Quick Notes text box per project | Done | 6634-6696 |
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
| 118 | Attach a Word/Excel/CSV file to the BA page | Done — native file-picker + `shell.openPath` via two new main-process IPC channels (`pick-file`, `open-path`), same as legacy: stores a filesystem path only, click opens with the OS default handler, double-click detaches | 10490-10556 |
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
| 121 | Cover image (upload, crop-to-fit, fade overlay) | Done — a new `pick-image` main-process channel (image-only filter, mirrors `pick-file`) picks the path, and a new `read-image` channel base64-encodes it into a `data:` URL for the renderer, sidestepping the `file://` CSP/origin mismatch between dev (`http://localhost:5173`) and packaged (`file://`) loads that a raw `file://` `<img src>` would hit; crop-to-fit is CSS `object-fit: cover` and the fade is a `linear-gradient` overlay div toward `var(--surface)`, replacing legacy's Pillow-based pixel compositing (`_cover_fit_crop_pil`) with a native equivalent | 11353-11467 |
| 122 | Editable project name/tagline | Done | 11469-11512 |
| 123 | Attach Word/Excel/CSV file | Done — reuses row 118's exact `pick-file`/`open-path` IPC channels and the same click-to-open/double-click-to-detach chip pattern from `BusinessAnalysisCanvas.tsx`, now also wired into `JourneyPanel.tsx` | 11520-11584 |
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
| 130 | Table view (dense per-project summary row) | Done — a real dense layout with legacy's own three columns and weights (PROJECT NAME 56 / SUPPLIER 24 / ROADMAP 20), the 2px header rules and 1px row rules it uses to make a header read as one without a fill colour, and the muted header ink it uses so column labels never compete with plan titles. Row click opens the full page | 13256-13624 |
| 131 | List view (compact one-line row) | Done — `ListRow`: index and title left, `market | status | priority | timeline | actions` right, status colour as a 3px left stripe, matching legacy's `_build_row`. Row click opens the full page | 13668-13723 |
| 132 | Full-page detail view per plan (autosave, prev/next nav) | Done — `PlanPage`: 980px centred column (legacy's own cap: "a field stretched across a 1900px monitor is unreadable"), 24px inline-editable title, Prev/Next that wrap via the same modulo legacy's `_sibling` uses, back-to-list, and Escape to close. Every field commits on blur, no Save button. The field set is the shared `PlanDetail` component the card's inline expand also renders, so the two views cannot drift about which fields a plan has. The open plan is tracked by id, not index, so a filter change underneath it cannot silently swap which plan you are editing | 13731-13964 |
| 133 | Search + Status/Priority/Market filters | Done (market's "Other" bucket matches legacy's exact definition: anything not Bangladesh/USA/Global/blank) | 12679-12872 |
| 134 | Manual drag-reorder + priority-based sort mode | Done — HTML5 drag-and-drop in all three views when manual sort is active. The dragged row is not moved under the cursor; the landing position is marked with an inset line and the list re-renders once on drop, which is legacy's own approach and reasoning (reordering live inside a scroll container fights the scroll position). Backed by a new `reorder` engine function and endpoint that lifts the plan out and reinserts it at an arbitrary index in one pass, rather than issuing a run of neighbour swaps; it renumbers `order` densely so the column cannot drift into fractions or huge gaps. The ▲/▼ buttons are kept as the keyboard-accessible path, since drag alone is not operable without a mouse | 13280-13375, 12608-12618 |
| 135 | Row menu: Edit/Duplicate/Archive/Delete | Done (Edit is inline fields rather than a menu entry — nothing to "open" separately; Duplicate/Archive/Delete are icon buttons rather than a dropdown, same four actions) | 13169-13202 |
| 136 | Potential/Difficulty star ratings | Done (1-5, +/- steppers, same clamp as legacy) | 13007-13020 |
| 137 | Investment/yearly-profit currency fields | Done (`cost_amount`/`yearly_profit`, free text same as legacy's plain Entry widgets) | 13057-13059 |
| 138 | Per-plan next-actions checklist | Done, and more robust than legacy: each action gets a real id (`BdpAction`) instead of being retyped as one line in a shared textarea and re-matched to its old done-state by exact text | 13966-14026 |
| 139 | Seed example plans on first run (6 starter opportunities) | Done — seeded by the Alembic migration itself (runs exactly once, ever) rather than a lazy check-on-every-load flag, since a migration already provides that guarantee for free | 12376-12432 |
| 140 | One-time migration from the old fixed 6-block layout | N/A (Phase 0 triage, verified against legacy 12434-12470) — `_bdp_load` converts `block_N_title`/`block_N_note` into the `plans` list and sets `_migrated_v2` the first time the BDP screen is opened, so by the time a save file is exported it already holds `plans`. The port has no old-format data of its own to migrate. **Caveat:** `import_legacy.py` reads only `bdp.get("plans")`, so a save file whose BDP screen was never opened in a migrated legacy build (no `_migrated_v2`) would have its `block_N_*` text silently dropped on import. One-off risk, one defensive branch to close if it ever matters | 12434-12470 |

## N. 90-Day Quarterly Plan (whole-life plan)

Fully ported: `QuarterlyAnswer` model, `engine/quarterly.py`
(`cycle_span`/`cycle_progress`/`set_cycle` port legacy's own functions
line-for-line), `api/routes/quarterly.py`, `QuarterlyPlanPanel.tsx`.

| # | Feature | Status | Legacy lines |
|---|---|---|---|
| 141 | Six life-area accordion (Appearance/Money/Relationship/Health/Social/Mind) | Done | 4235-4248, 15015-15092 |
| 142 | Three prompts per area (Outcome/Action/If-Then) | Done (same question text, hints, and per-prompt textarea sizing intent as legacy) | 4276-4285 |
| 143 | Configurable cycle length (30/60/90 or custom, 7-365 day bounds) | Done (presets + custom number input, same clamp) | 4287-4393, 14759-14912 |
| 144 | Cycle progress bar + "day X of Y, N left" | Done | 4399-4413, 14926-14940 |
| 145 | "N/6 areas set" progress counter | Done | 4432-4442 |
| 146 | Auto-opens the first incomplete area | Done | 15095-15100 |

## O. Settings dialog

Fully ported as one slice: `renderer/src/components/SettingsDialog.tsx`
(opened via the ⚙ header button), backed by `AppState` columns +
`GET`/`PUT /api/settings`. No dedicated theme swatch-preview picker (row
147 stays partial — the existing header cycle-button/Ctrl+T remains the
only theme control); every other row below is done.

| # | Feature | Status | Legacy lines |
|---|---|---|---|
| 147 | Theme picker (radio rows + swatch preview) | Done — a radio row per theme in `SettingsDialog.tsx`'s Appearance section, above Language, matching legacy's own placement and its 4-cell BG/CARD_BG/GREEN/TEXT swatch strip. Each swatch keeps a 1px border for the same reason legacy outlines its own (a near-white BG or near-black TEXT cell would otherwise vanish into the dialog surface — and Rize's BG and CARD_BG are both pure white, so the border is what separates them). Header cycle button, Ctrl+T and this picker now all commit through one `selectTheme` in `App.tsx`, so they cannot drift | 15397-15438 |
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
| 167 | `daily_history` (90-day archive of secs+done-count per day) | Done / N/A — the port already had this exact data before rows 33-35 needed it: `ProjectActivity` (one row per project × day, added for the 30-day activity strip) is a strictly better source than legacy's single aggregate dict, since it survives per-project instead of collapsing to one number. No new table needed | 2971-2984, 3044-3058 |
| 168 | `_daily_history`-derived deep-work streak | Done — shown as "🔥 Nd streak" beside the Deep Work Trend chart's title, hidden at 0 same as legacy; ported line-for-line from `_deep_streak` (today counts once it reaches goal, otherwise the streak is measured from yesterday backward) | 3047-3058 |
| 169 | `bdp_data` / bdp legacy blocks (superseded by Business Plan Notes) | Done — `import_legacy.py`'s `import_bdp` reads the top-level `bdp_data` key (a dedicated escape hatch legacy writes precisely because `clean_vision()`'s whitelist would otherwise drop `vision_data["self_dev"]["plans"]` entirely) into `BdpPlan`/`BdpAction`, with `next_actions`' id-less `{"text","done"}` entries deduped by text on re-run the same way the decision log already is | 568, 12449-12463 |
| 170 | `_exec_<date>` (hour-by-hour Daily Planner data) | N/A — out of scope (Phase 0 triage, verified against legacy 5546-5578). `_exec_key`/`_exec_day`/`_exec_set` store an hour-keyed `{t, d}` map per day for the Daily Planner, a screen deliberately dropped from the port. There is no surface to import the data into; reviving it means reviving the screen, which is a new feature decision, not a port gap (see README's "Importing your existing data") | 5546-5575 |
| 171 | `_q90_<cycle-start>` (Quarterly Plan answers) | Done — see section N; ported as `QuarterlyAnswer` (one row per cycle+area rather than a single nested dict), and now actually imported too: `import_legacy.py`'s `import_quarterly` reads every `__q90_<cycle-start>` key, not just the current cycle | 4415-4442 |
| 172 | `swot_*` fields (Strengths/Weaknesses/Opportunities/Threats — older analysis generation, superseded by Business Analysis) | N/A (Phase 0 triage, verified against legacy 598-601) — the four `swot_*` keys appear only in `save_data`'s serialisation; no widget in legacy reads or writes them any more (the leftover `swot_hdr` palette entries at 977-1109 are the only other trace of the removed screen). Superseded by the Business Analysis canvas, section K, which is fully ported | 598-601 |

---

## Summary

*(Updated 2026-09-06: Settings pass — rows 93, 148-156, 159-160 moved to
Done as one slice (`AppState` columns, `GET`/`PUT /api/settings`,
`SettingsDialog.tsx`, and the idle-stop setting actually wired into
`engine/timer_reconciliation.py` rather than just stored); a re-audit of
section L (Product Journey), which this file had left marked "Entirely
unported" since an earlier pass despite the feature having since been
fully built — rows 120, 122, 124-128 moved to Done and 121, 123 to
Partial; a Business Plan Notes pass — rows 129, 133, 135-139 moved to
Done and 130-132, 134 to Partial (one consolidated card view stands in
for legacy's separate table/list views, and ▲/▼ buttons stand in for
mouse drag-reorder), row 140 stays Not Started/N/A since it migrates
legacy's own old save format, which the port has none of; and a 90-Day
Quarterly Plan pass — rows 141-143, 145-146 moved to Done and 144 to
Partial (text countdown, no visual progress bar). A same-day follow-up
pass then added the Quarterly Plan's progress-bar graphic (row 144 to
Done), a project Quick Notes textarea (row 101 to Done), and a Tasks
pass — search/edit/badge/day-move/reorder (rows 54-56, 58-59 to Done,
60 to Partial) plus the global keyboard-focus ring (row 26 to Done).
Later passes covered app infrastructure (rows 1, 4, 6, 12), the clock
card and day-phase/time-remaining stats (rows 31-32, 38), Habits'
richer dashboard (rows 33-35, 72-76, 167-168), and Projects' card
collapse/solo and BA attach-file (rows 100, 118). Updated 2026-09-07:
Journey's cover-image upload (crop-to-fit + fade overlay, via a new
base64 data-URL IPC channel) and attach-file browse/open moved rows
121 and 123 to Done, reusing row 118's file-picker pattern. Same-day
follow-up: `import_legacy.py` extended with `import_goals`,
`import_journey`, `import_bdp`, `import_quarterly`, and
`import_settings` (plus win/reflection into the existing
`import_habits`) — the importer previously covered only Tasks/Habits/
Projects/Business Analysis; every domain the port now models is
migratable from a legacy save file, moving row 169 to Done and closing
the gap row 140 used to describe. Also added Tasks' session-history
expand toggle (row 48 to Done).)*

- **Done**: rows 16, 18, 19, 23, 24, 26, 39-56, 58-59, 61-69, 71, 79-94, 97, 101-123, 124-129, 133, 135-146, 148-160, 171 — roughly **101 items**, concentrated in Tasks (now including search, inline edit, done-count badge, Tomorrow→Today move, and button-driven reorder), the NOW panel (all 6 rows — derive/point/start-pause/complete/one-clock exclusivity/the "+ STRIKE" promotion, plus the row-66 linked-timer bug-fix), Habits' core loop, Consistency, Circle, Projects' core loop (including per-project Quick Notes), the full Business Analysis canvas, the complete Goals feature, Product Journey (6-stage timeline, gates, tasks, findings log, auto-advance + launch toast, cover image, attach-file), Business Plan Notes (opportunity cards, filters, checklist, seed data), the 90-Day Quarterly Plan (6-area accordion, 3 prompts each, configurable cycle, progress bar), Settings (now complete as one slice: theme cycling, undo/redo, shortcuts panel, onboarding, language/analog-clock/auto-timer/idle-stop/day-phase/goal-hours/currency/start-with-Windows/About), a global keyboard-focus ring, and Export/Backup.
- **Partial**: rows 15, 22, 30, 37, 60, 70, 82, 96, 130-132, 134, 147 — roughly **13 items** where the data/backend exists but the UI is thin, or a control differs from legacy's exact mechanism (e.g. 4 of 6 themes; Business Plan Notes' one card view standing in for legacy's table+list toggle and ▲/▼ buttons standing in for drag; task undo covers every action except reorder and timer-reset; Settings has no dedicated swatch-preview theme picker).
- **Not Started**: everything else — roughly **54+ items**. The largest unported blocks by area: Habits' richer dashboard surface (6 items), remaining app-chrome (context menu, tooltips, empty-state chips, tools menu — ~4 items), and the sibling external apps in section R (mostly out of scope). Business Plan Notes and the Quarterly Plan are both now down to their one-off Partial/N/A rows only (see sections M and N).

Net read: the **daily-driver loop** (Tasks, NOW, Habits, Projects,
Business Analysis, Consistency, Circle) is genuinely solid end to end,
**Goals, Product Journey, Business Plan Notes, and the 90-Day Quarterly
Plan** give it a full first layer of **long-horizon and opportunity
planning**, **Settings is now a complete slice** (every toggle/stepper
from the legacy dialog exists and persists; auto-timer-on-open,
day-phase hours, goal-hours, and currency are stored but not yet read by
anything else in the port, same "column exists, feature not wired
everywhere" caveat as section S), and the app has a genuine **safety
net** (Export/Backup) instead of none at all. What's left of substance:
Habits' richer dashboard, remaining app-chrome polish, and the
app-packaging items tracked in README.md's "Next steps" (licensing,
auto-update, actually wiring `start_with_windows` to the real Windows
startup entry).
