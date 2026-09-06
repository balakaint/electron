# Habit OS — Port Completion Plan (100% Legacy Parity)

Goal: close every remaining gap between `task_tracker_v3_THEMES.py` and the
Electron/Python port, so that the port does everything the Tkinter app did.
New Electron-only features come **after** this plan, not during it.

Baseline at time of writing: 172 inventory rows — 139 Done, 15 Partial,
18 Not Started. Section R (6 sibling-app launchers) is **excluded by
decision** — those are separate products, integrated later.

---

## Step 0 — Triage: rows closed as N/A, not built ✅ DONE 2026-09-06

**Status: complete.** Eight of the 33 remaining rows were not real gaps.
Each claim was checked against the cited legacy source before the row was
closed; all eight are now marked `N/A` in `FEATURE_INVENTORY.md` with the
verification recorded in the row itself.

(An earlier draft of this plan said "nine" while listing eight — the count
was wrong, the list was right.)

| Row | Feature | Why N/A |
|---|---|---|
| 3 | Atomic save (temp+fsync+rename) | Verified legacy 690-701: temp+flush+fsync+`os.replace` protects a single JSON blob; SQLite's journal/WAL covers the same failure mode per transaction |
| 7 | Per-monitor DPI awareness | Verified legacy 48-58: the whole implementation is one `SetProcessDpiAwareness(2)` call, which Chromium already makes for its own process |
| 21 | Global mouse-wheel scroll dispatch | Verified legacy 1824-1903: `_bind_global_scroll` walks the parent chain for a scrollable Canvas — Tk has no wheel-event bubbling, browsers do |
| 36 | Work motto banner | Verified legacy 3424-3430: created under legacy's own `# Placeholder vars` comment, `_save_work_motto` never bound to an event, no `textvariable` anywhere. Dead code |
| 99 | Subtask "Deep Work" launcher | Belongs to Section R (excluded) |
| 140 | BDP 6-block one-time migration | Verified legacy 12434-12470: `_bdp_load` folds `block_N_*` into `plans` and sets `_migrated_v2` on first open. **Caveat recorded in the row:** `import_legacy.py` reads only `plans`, so a never-migrated save file would drop that text silently |
| 170 | `_exec_<date>` Daily Planner data | Verified legacy 5546-5578: hour-keyed `{t, d}` map for the Daily Planner, a screen deliberately dropped. Reviving it is a new-feature decision, not a port gap |
| 172 | `swot_*` fields | Verified legacy 598-601: the four keys appear only in `save_data`'s serialisation, no widget reads them. Superseded by section K, which is fully ported |

Row 29 (Tools menu) is a **partial** N/A: 6 of its 9 entries are Section R.
It is rescoped in Phase 4 below to only the in-scope entries.

**After Step 0 the real remaining work is 19 rows, not 33:**
10, 11, 15, 17, 22, 29, 30, 37, 60, 70, 77, 78, 82, 96, 130, 131, 132,
134, 147.

(A recount after the triage corrected this from the 17 an earlier draft
claimed — row 17, the Language picker, had been dropped from the phase
list altogether. It now has its own phase, 4B.)

---

## Phase 1 — Theme system completion (highest visible parity gap)

**Rows: 15, 147**

Current state: `renderer/src/themes.ts` has 4 palettes (focus, warroom,
energy, journey) as ~7 CSS custom properties each. Legacy has 6 named
themes and every widget is repainted. Several React components still use
hardcoded colors instead of the CSS vars.

Work:
1. Add the two missing palettes: **Executive** and **Rize** — read the exact
   swatches from legacy lines 721–944.
2. Widen the token set beyond 7 vars if the legacy palettes need it
   (success/warn/danger, chip backgrounds, chart series colors).
3. Audit all 18 components in `renderer/src/components/` for hardcoded hex
   colors and replace them with `var(--…)`.
4. Row 147: add a radio-row theme picker with live swatch previews to
   `SettingsDialog.tsx` (currently theme is only the header cycle button +
   Ctrl+T).

### Prompt for Claude Code

```
Read FEATURE_INVENTORY.md rows 15 and 147, and legacy lines 721-944 and
15397-15438 of task_tracker_v3_THEMES.py.

1. Add the two missing themes (Executive, Rize) to renderer/src/themes.ts,
   using the actual legacy palette values. Extend the CSS custom-property
   token set if these palettes need tokens the current 7 don't cover.
2. Grep every file under renderer/src/ for hardcoded hex colors and rgba()
   literals. Replace each with the appropriate CSS var so all 6 themes
   repaint the entire UI, not just the shell and modals.
3. Add a theme picker to SettingsDialog.tsx: one radio row per theme with a
   small live swatch preview (bg / surface / accent), matching legacy's
   radio-row layout. It must stay in sync with the header cycle button and
   Ctrl+T.
4. Verify by launching the app and cycling all 6 themes on every page.
5. Update FEATURE_INVENTORY.md rows 15 and 147 to Done, then commit.
```

---

## Phase 2 — Data visualisation parity

**Rows: 37, 96, 70**

Legacy drew these on Tk canvases; the port currently shows plain text or a
plain bar. These are the most visible "it looks less finished" gaps.

- **Row 37** — TODAY PROGRESS segmented bar: per-project segments on PLAN,
  gradient fill on FOCUS, milestone glow, 100% celebration state.
  Legacy 7659–7878, 4894–4947.
- **Row 96** — 30-day activity strip: per-day heat colouring, top-strip
  canvas above each project card. Legacy 6392–6394, 6883–6926.
- **Row 70** — Weekly score chart: line + bar combined, best/worst-day
  callouts. Legacy 17145–17223.

Build these as inline SVG in React. Do **not** add a charting library —
three bespoke charts do not justify the dependency, and the legacy visuals
are specific enough that a generic library would fight you.

### Prompt for Claude Code

```
Port the three remaining chart/visualisation features to inline SVG React
components. No charting library.

Row 37 — read legacy lines 7659-7878 and 4894-4947. Replace the plain
percentage line in ProjectDashboard.tsx with the segmented TODAY PROGRESS
bar: per-project segments on the PLAN view, gradient fill on FOCUS,
milestone glow, and the 100% celebration state.

Row 96 — read legacy lines 6392-6394 and 6883-6926. Add the 30-day
activity strip with per-day heat colouring above each project card.

Row 70 — read legacy lines 17145-17223. Upgrade the week bars in
HabitDashboard.tsx to the full line+bar chart with best-day and worst-day
callouts.

All colours must come from the theme CSS vars added in Phase 1 so the
charts repaint with the theme. Verify each against the legacy rendering
logic, update the three inventory rows, and commit each row separately.
```

---

## Phase 3 — BDP view modes

**Rows: 130, 131, 132, 134**

`BdpPanel.tsx` (438 lines) currently has one consolidated card view with an
inline expand. Legacy has four distinct surfaces.

- **130** Table view — dense per-project summary row. Legacy 13256–13624.
- **131** List view — compact one-line row. Legacy 13668–13723.
- **132** Full-page detail view per plan, autosave, prev/next nav between
  plans. Legacy 13731–13964.
- **134** Manual drag-reorder with the mouse (port has ▲/▼ buttons).
  Legacy 13280–13375, 12608–12618.

Row 132 is the highest-value of the four — it is a genuinely different
working surface, not a re-skin. Rows 130/131 are cheap once a shared row
renderer exists. Row 134 is the lowest value (the ▲/▼ buttons already
achieve the outcome) — do it last, and use the HTML5 drag-and-drop API.

### Prompt for Claude Code

```
Complete the BDP panel to full legacy parity. Read FEATURE_INVENTORY.md
rows 130, 131, 132, 134 first.

1. Row 132 (do this first): add a full-page detail view for a single plan
   — legacy lines 13731-13964. Every field autosaves on blur. Add prev/next
   navigation between plans, and a back-to-list control.
2. Rows 130/131: add a Card / Table / List view switcher. Table = dense
   per-project summary row (legacy 13256-13624). List = compact one-line
   row (legacy 13668-13723). The selected view mode must persist in
   AppState like other settings.
3. Row 134: replace the ▲/▼ swap buttons with real mouse drag-reorder using
   the HTML5 drag-and-drop API, keeping the existing priority-sort mode
   intact and keeping keyboard-accessible fallback controls.

Add an Alembic migration if AppState needs a new column for the view mode.
Update each inventory row and commit per row.
```

---

## Phase 4 — Interaction and shell parity

**Rows: 22, 29, 30, 60, 82**

Smaller, mostly mechanical items.

- **22** Ctrl+W / Esc close-dialog stack, and Ctrl+F focus mode. Requires a
  real dialog-stack concept in `App.tsx` (currently Escape is hardcoded to
  two specific dialogs) and a focus-mode toggle. Legacy 1974–2030.
- **29** Tools menu — **rescoped**: build the gear dropdown with only the
  in-scope entries (BDP, Goal Roadmap, Focus Mode, Settings). Section R
  entries are omitted; note this in the inventory row. Legacy 16237–16332.
- **30** Shared debounced-autosave hook with flash confirmation, replacing
  the per-component onBlur handlers. Legacy 7605–7640.
- **60** Extend the undo stack to cover reorder and timer-reset.
- **82** Click-on-the-time-text to cycle target presets (15/30/45/60/90/120)
  as an alternate control alongside the existing stepper. Legacy 2762–2778.

### Prompt for Claude Code

```
Close the remaining interaction-parity rows: 22, 29, 30, 60, 82. Read each
row in FEATURE_INVENTORY.md and its cited legacy lines before starting.

Row 30 first, since other rows depend on it: build a shared
useDebouncedAutosave hook (debounce + a brief "saved" flash confirmation,
matching legacy lines 7605-7640) and migrate every component's ad-hoc
onBlur autosave onto it.

Row 22: introduce a real dialog stack in App.tsx so Ctrl+W and Escape close
the topmost dialog rather than the two currently hardcoded. Add Ctrl+F
focus mode.

Row 29: add the gear-icon Tools dropdown with only the in-scope entries
(BDP, Goal Roadmap, Focus Mode, Settings). Note in the inventory row that
the Section R entries are deliberately omitted.

Row 60: extend the undo stack to cover task reorder and timer reset.

Row 82: add click-on-the-time-text preset cycling (15/30/45/60/90/120)
alongside the existing stepper for the per-project daily target.

One commit per row, updating the inventory row in the same commit.
```

---

## Phase 4B — Language picker (English / Bangla)

**Row 17** — Legacy 15440–15456.

Dropped from an earlier draft of this plan by mistake; it is a real row and
a substantial one. The backend already supports it — `LangT` in
`api/schemas.py` and `LANGS` in `engine/settings.py` are both
`("en", "bn")` — so the gap is entirely in the renderer: there is no
string catalogue and no picker.

This is the one remaining row whose cost is proportional to how much UI
already exists, so it gets cheaper the earlier it is done and more
expensive after Phase 5 adds a new surface. Do it before Phase 5.

### Prompt for Claude Code

```
Read inventory row 17 and legacy lines 15440-15456.

The backend already accepts lang "en"/"bn" (LangT in api/schemas.py,
LANGS in engine/settings.py) and AppState already stores it — confirm
that before starting, then treat this as renderer-only work.

1. Add a lightweight i18n layer: a string catalogue keyed by message id
   with en and bn entries, plus a hook that reads the current lang from
   settings. No i18n library — the app has one settings source and two
   languages.
2. Extract every user-facing string in renderer/src into the catalogue.
   Work file by file, running tsc --noEmit after each. Report the string
   count per file as you go.
3. Add the language picker to SettingsDialog.tsx next to the theme
   picker, matching legacy's own placement (it sits directly below the
   theme rows, legacy line 15440).
4. Bangla strings: translate them, but flag any term you are unsure about
   rather than guessing — I will correct those myself.
5. Verify by switching to Bangla and visiting every page.

Do NOT hardcode Bangla digits or date formats in this pass; note where
they would be needed and we will decide separately.
```

Bangla text is wider and taller than English at the same point size —
expect layout breakage in fixed-width chips and buttons, and check those
specifically rather than assuming the switch is cosmetic.

---

## Phase 5 — PLAN review tri-tab

**Rows: 77, 78**

Legacy's PLAN screen has a Mindset / Discipline / Consistency tri-tab that
shows a condensed second view of Habits data. The inventory deferred these
as low value — that judgement was correct for a partial port, but this plan
targets full parity, so build them.

Only genuinely net-new content: the **last-7-days mindset note history**
(row 78). Everything else is a condensed re-render of existing data.

Legacy 3705–3759 (Discipline mini-view), 3648–3702 and 3464–3465 (Mindset).

### Prompt for Claude Code

```
Build the PLAN review tri-tab (inventory rows 77 and 78) — legacy lines
3705-3759, 3648-3702, 3464-3465.

Add a Mindset / Discipline / Consistency tri-tab container to the PLAN
screen. Discipline and Consistency are condensed re-renders of data the
Habits dashboard already fetches — reuse the existing API calls and
components, do not duplicate logic. Mindset is today's note plus a
last-7-days history list, which is net-new: add the API route and engine
function for the 7-day note history if one doesn't exist.

Update rows 77 and 78 and commit.
```

---

## Phase 6 — Progressive panel layout (largest single item)

**Row 10** — Legacy 15748–16074, 15818–15923.

Compact / partial / full layout modes plus screen-edge docking. This is
~500 lines of legacy layout logic and touches every screen. It is deliberately
last because it will conflict with any component still being edited, and
because Phase 1's CSS var audit makes it far easier.

Treat this as its own multi-session task, not one prompt.

### Prompt for Claude Code

```
Read legacy lines 15748-16074 and 15818-15923 of task_tracker_v3_THEMES.py
and write a design note (do not write code yet) covering:

- what compact / partial / full mode each change in the layout
- how screen-edge docking works and what state it persists
- which of the 18 React components need mode-aware layout
- whether this is best done with CSS container queries, a layout context,
  or both

Show me the note before implementing. Then implement in slices — one
component group per commit — with the mode stored in AppState via a new
Alembic migration.
```

---

## Phase 7 — Close-handler completeness

**Row 11** — Legacy 17351–17387.

The only genuine gap is "fold today into history" — the port has no
`daily_history` equivalent. Decide first whether the port needs one at all,
given that DeepWorkTrend and the habit tables already derive history from
per-day records.

### Prompt for Claude Code

```
Read inventory row 11 and legacy lines 17351-17387.

First determine whether the port actually needs a daily_history table, or
whether the existing per-day records already answer every question legacy's
daily_history answered. Tell me your conclusion before writing code.

If it is needed: add the table, the Alembic migration, and a fold-today
step in the app-close handler in electron/main.ts. If it is not needed,
mark row 11 Done with that reasoning recorded.
```

---

## Verification gate — run before declaring 100%

```
Do a full parity audit against task_tracker_v3_THEMES.py:

1. Re-count FEATURE_INVENTORY.md by status. Every row must be Done, N/A, or
   an explicitly-recorded Section R exclusion. Zero Partial, zero
   Not Started.
2. For 10 randomly chosen Done rows, open the cited legacy lines and
   confirm the port actually does what the legacy code does. Report any row
   whose Done status you cannot justify.
3. Run every test in python/ and report failures.
4. Launch the app, visit every page in all 6 themes, and screenshot each.

Report findings. Do not mark anything Done that you could not verify.
```

---

## Order summary

| Phase | Rows | Effort | Why this order |
|---|---|---|---|
| 0 Triage ✅ | 8 rows → N/A | Done | Removed a quarter of the backlog |
| 1 Themes | 15, 147 | Medium | Every later phase touches colours |
| 2 Charts | 37, 96, 70 | Medium | Biggest visible gap; depends on Phase 1 tokens |
| 3 BDP views | 132, 130, 131, 134 | Medium | Self-contained in one component |
| 4 Interaction | 30, 22, 29, 60, 82 | Small–Medium | Row 30 first; others depend on it |
| 4B Language | 17 | Medium–Large | Cheaper before Phase 5 adds a new surface |
| 5 PLAN tri-tab | 77, 78 | Medium | New surface, reuses existing data |
| 6 Panel layout | 10 | Large | Touches everything — do it last |
| 7 Close handler | 11 | Small | Decide-then-build |

---

## Notes

- **Commit per row.** The existing git history already does this (33 commits,
  each naming its row numbers). Keep that discipline — it is what makes this
  audit possible at all.
- **Update `FEATURE_INVENTORY.md` in the same commit** as the code. The
  inventory is the source of truth for "how much is left"; a stale inventory
  is worse than none.
- **Do not start commercial packaging** (PyInstaller, licensing, code
  signing, auto-update) inside these phases. Those are a separate track and
  mixing them in will make both harder to verify.
- The claim that auto-update is Done (inventory Section Q) does not match
  the code — `electron-updater` is in `package.json` but is never imported.
  Worth checking during the verification gate.
