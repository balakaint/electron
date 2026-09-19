# UX audit brief for the Electron port

Written 2026-09-08, from the audit run against the Tkinter reference
(`task_tracker_v3_THEMES.py`) using the `ui-ux-pro-max` rule set — 119
rules, 6 themes × 6 screens, measured by walking the live widget tree
rather than looking at screenshots.

Result there: **8,456 → 4,974 findings**, contrast failures **1,288 →
152**. Everything below is what that audit learned, expressed as work
for this repo.

Nothing in this file has been run against the port. Every claim about
the port's current state was read out of the source and is marked
**VERIFY** where it could be wrong.

---

## 0. Already changed in this repo (do not redo)

These edits are in the working tree now:

| File | Change |
|---|---|
| `electron/main.ts` | Windows venv path (`Scripts\python.exe`), packaged `engine.exe`, `setWindowOpenHandler` + `will-navigate` guards, `path.basename` on export filenames, extension allow-list on `open-path`, `DARK_THEMES` corrected to `warroom`+`journey` |
| `electron/themes.test.ts` | **new** — reads `themes.ts`, computes each theme's background luminance, fails if `DARK_THEMES` drifts |
| `renderer/index.html` | Content-Security-Policy meta |
| `package.json` | `npm test`, `test:window-state`, `test:themes` |
| `dist/electron/window-state.test.js` | deleted (stale build artefact that would ship inside the installer) |

`tsc -p electron/tsconfig.json` is clean and `npm test` passes both
suites.

**One thing I could not verify from here:** the sandbox cannot run
Vite (`npm run build` fails emptying `dist/renderer` over the mount).
Run `npm run build` on Windows once and confirm the CSP survived into
`dist/renderer/index.html`. If a `Refused to …` error appears in the
DevTools console, relax exactly the directive it names and nothing else.

---

## 1. First: does the EXECUTE tri-tab render? **VERIFY**

`HourPlan.tsx` line 10 documents itself as *"the first of three tabs
(HOURS | MIT | TASK LIST)"*, but I could not find the tab strip that
renders them. `Panel3.tsx` draws only `PLAN | EXECUTE` and then mounts
`<TaskList listKey="focus" …/>` directly; grepping `TaskList.tsx` for
`HOURS`, `activeTab`, `setTab` found nothing.

If that reading is right, `HourPlan` and `StrikeCard` are built but
unreachable.

> **Prompt:** In the EXECUTE view, is there a tab strip for HOURS / MIT /
> TASK LIST? If not, add it in `Panel3.tsx` below the PLAN|EXECUTE
> switcher. Order is HOURS, MIT, TASK LIST and HOURS is the default —
> the question at the start of a work block is "what hour am I in".
> Legacy reference: `_show_quarter_plan`'s sibling `_build_focus_view`,
> `_tabkeys` in `task_tracker_v3_THEMES.py`.
>
> The two strips must not look the same weight. Level 1 (PLAN|EXECUTE)
> is a filled segmented control; level 2 is **underlined text tabs** —
> selected tab gets accent text plus a 2px accent rule beneath, others
> get a same-height transparent rule so nothing shifts on switch. Two
> identical strips is what made the nesting unreadable in the Tk app.

---

## 2. Build the Playwright UX auditor

This is the highest-value item and `playwright-core` is already in
`devDependencies`. The Tk auditor found bugs no amount of code reading
would have — a title bar that was dark on a light theme, text at
2.15:1, a 30×29px hit area on a 581×82px card. The same measurements
apply to the DOM and are *easier* there.

> **Prompt:** Add `tests/ux-audit.ts`, a Playwright script that loads the
> app, walks every rendered element, and reports violations grouped by
> rule and severity. It must run over all 6 themes and every screen
> (PLAN: mindset/discipline/consistency; EXECUTE: hours/mit/task list;
> project cards; Business Analysis; Journey; BDP; Settings; the 90-day
> plan). Fail the run on any High finding.
>
> For each visible element read the **computed** style — not the CSS
> source — and check:
>
> **A. Contrast (WCAG 1.4.3).** `color` against the nearest ancestor
> with a non-transparent `background-color`. Threshold 4.5:1; 3:1 only
> if `fontSize ≥ 24px`, or `≥ 18.66px` with `fontWeight ≥ 700`.
> *Exempt:* elements that are `disabled`, `aria-disabled="true"`, or
> `pointer-events: none` — WCAG exempts inactive controls, and without
> this exemption the audit drowns in deliberate "inert" styling.
>
> **B. Target size (WCAG 2.2 AA).** Every element with a click handler,
> or matching `button, a, input, select, [role=button], [onclick]`, must
> have a bounding box ≥ **24×24 CSS px**. Do not use the 44pt iOS
> figure — that is the native-mobile rule and this is desktop.
>
> **C. Type size.** No rendered text below **12px**.
>
> **D. Token discipline.** Any `color`/`background-color` that is not
> traceable to a CSS custom property. Report as Low — the project
> palette legitimately sits outside the theme tokens.
>
> **E. Truncation.** `scrollWidth > clientWidth + 2` on any element that
> is not deliberately scrollable, and `scrollHeight > clientHeight + 2`
> on anything with `overflow: hidden`. This is the check that found
> clipped labels in the Tk app.
>
> Write the results to `ux-audit.json` and print a table grouped by
> rule and severity. Include the element's selector, its text, and the
> measured numbers — a finding you cannot locate is a finding nobody
> fixes.

---

## 3. Design rules the audit established

These came out of fixing 3,482 findings in the Tk app. They are cheap
to apply in CSS and expensive to retrofit.

### 3.1 One accent fill per screen
The filled accent means **"the primary action here"**. In the Tk app
four things wore it at once — the level-1 tab, the level-2 tab, START,
and "+ Add Task" — so it stopped meaning anything.

Keep filled accent for: the selected level-1 tab, and the screen's one
primary button (START). Everything else that is clickable gets an
outline or plain text. **VERIFY** `TaskList.tsx`'s add-task control and
`StrikeCard.tsx`.

### 3.2 Ink on a coloured fill is measured, never assumed
`color: white` on the accent is right for a deep blue and wrong for
cyan or mint. WAR ROOM's `#22D3EE` and JOURNEY's `#4CE0A0` measured
**1.81:1** and **1.68:1** with white text — the *selected* state was
the least readable thing on screen.

The rule: compute contrast for both white and near-black against the
fill and **take the winner**. Do not use a lightness cutoff — the first
version used `luminance > 0.42`, and project 2's orange `#F0883E`
(luminance 0.37) fell on the wrong side of it and kept white text at
2.53:1. The real crossover is ≈0.18, but measuring both is simpler than
remembering that.

**VERIFY:** the port has `--on-accent`, which suggests this is already
handled per theme. Confirm it is *derived*, not hand-assigned — a
hand-assigned value is the same class of bug as `DARK_THEMES` was.

### 3.3 Committed work must outrank uncommitted
In the Tk app the STRIKE rows (the three tasks you committed to)
rendered at 13px non-bold muted, while the LIST pool below them
rendered 13px **bold** in the primary colour. The hierarchy ran
backwards through the one decision the screen exists to support.

STRIKE rows now get 15px bold, primary text colour, and a 3px accent
rail. **VERIFY** `StrikeCard.tsx` against `TaskList.tsx`.

### 3.4 Type scale in pixels, not points
Points are multiplied by screen DPI, so the same code drew 10.7px text
on one machine and 13.3px on another. The Tk ladder is now:

```
XS 12   SMALL 13   BODY 14   H3 15   H2 16   H1 19
```

12px is the floor for any UI text. A *writing surface* (the plan's
answer boxes, notes) gets **15px** — reading a paragraph is not the
same job as reading a label.

### 3.5 Muted tiers still have to be legible
`TEXT3` was 1.99–2.86:1 across the six themes. It was called
"placeholder", but placeholder text carries meaning and WCAG does not
exempt it. The corrected ramp: TEXT ≈16:1, TEXT2 ≈7.5:1, TEXT3 ≈5:1 —
three visibly distinct steps, all passing.

**The corrected accent values are already in `renderer/src/themes.ts`**
(`#2960E6`, `#117B38`, `#A15904`, `#D02222`, `#AE5009`, `#5255EF`), so
this one looks carried across. **VERIFY** the muted/secondary tiers came
with them.

### 3.6 A collapsed card opens from anywhere on it
A collapsed project card is ~581×82px and only a 30×29px badge opened
it — about 1.5% of what looks like a button. Worse, the biggest target
in it was the title input, which took the click and only placed a
cursor, so clicking the project's name read as the app ignoring you.

**VERIFY:** `ProjectDashboard.tsx` lines 174 and 208 both call
`toggleCollapsed`, so this looks correct in the port. Confirm the title
input is *excluded* — it must stay editable.

### 3.7 Multi-line text previews on one line
Once the plan's answer boxes became six lines, people typed six lines,
and the collapsed row rendered them raw — one area grew six lines tall
and pushed the other five off screen. Collapse `\s+` to a single space
**before** truncating, or the clip counts newlines as characters.

**VERIFY** `QuarterlyPlanPanel.tsx`'s collapsed preview.

### 3.8 A modal taller than the screen must scroll
Six-line boxes made the plan dialog ~1000px tall. Fine at 1080p,
unusable at 768px: the window could not shrink, it held a modal grab,
and the Done button sat below the screen edge — the app looked frozen.

Body scrolls, header and footer are fixed, and the footer is laid out
**before** the body so the layout engine cannot squeeze it to a sliver.
In CSS: `display: grid; grid-template-rows: auto 1fr auto;` with
`max-height: calc(100vh - 40px)`.

---

## 4. Still open, deliberately deferred

- **Engine packaging.** `python/dist/engine` does not exist and nothing
  builds it; `electron-builder.yml` expects it at
  `extraResources`. `npm run dist` today produces an installer with no
  engine. Needs a PyInstaller spec + a `build:engine` script.
- **Host header check on the Python API.** It binds `127.0.0.1` only,
  and the absence of CORS middleware means JSON POSTs from a web page
  fail their preflight — but DNS rebinding walks around that. ~5 lines
  of FastAPI middleware rejecting any request whose `Host` is not
  `127.0.0.1:5180` / `localhost:5180`.
- **Icon family.** The Tk app mixes `↻ ✕ ⌄ ⚲ ▸ ◈ ◉ ❖` — different
  stroke weights and metaphors. The port should pick one icon set and
  use it throughout; this is the largest remaining "looks hobbyist"
  item and it is much easier in React than it was in Tk.

---

## 5. Suggested order

1. Verify / add the EXECUTE tri-tab (§1) — features exist but may be unreachable
2. Run `npm run build` on Windows, confirm the CSP survived (§0)
3. Build the Playwright auditor (§2)
4. Fix what it reports, using §3 as the rule set
5. Then packaging (§4)

Build the auditor before hand-fixing anything in §3. Half the bugs in
the Tk session were invisible to code review and obvious the moment
something measured the rendered result.
