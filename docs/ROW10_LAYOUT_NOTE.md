# Row 10 — Progressive panel layout: design note

## SUPERSEDED 2026-09-07 — read this first

The decision recorded below was **wrong**, and the reason is worth
keeping rather than deleting.

This note argued that legacy's three-column layout could not be ported
because "the port is not a three-panel window ... reproducing legacy's
layout literally would mean rebuilding the port's whole navigation
model". That reasoning treated the port's own page-based navigation as
the thing to preserve. It was not: it was an artifact of how the port
had been built so far, and the three-column layout was the actual
design. Zahid supplied a screenshot of the running legacy app, and the
answer was immediate — the columns ARE the product.

So the shell was rebuilt to match: panel 1 projects, panel 2 the
selected project's goals, panel 3 the fixed-width PLAN/EXECUTE column.
Every panel already existed as a component; only the shell changed.

Consequences of the correction:

- **`partial` is a real layout again.** It was recorded as N/A below on
  the grounds that "panel 1 hidden, panel 2 shown" was not a state the
  port could be in. With three columns it plainly is, and it is now
  supported and persisted like the other two.
- **Three widgets were in the wrong column.** TODAY PROGRESS and the
  Deep Work Trend sat in the projects panel; in legacy the trend belongs
  under the clock in panel 3 and the progress bar belongs to EXECUTE.
- **The EXECUTE tab was still labelled "Focus".** Legacy renamed it, for
  a reason it wrote down: "focus" was already spoken for, since Ctrl+F
  opens Focus Mode, which is the panel collapse.
- Habits, Business Plan and the 90-Day Plan have no column in the
  design; they open as full-window overlays from the Tools menu, as
  legacy opens them in their own windows. Analysis and Journey do the
  same from a project card's buttons.

The lesson, recorded because it generalises: when a port's structure and
the original's structure disagree, the original is the specification.
Asking to see the original UI would have settled this before a line was
written.

---

## Original note (superseded)

Written before implementing, because this row is the one place where the
port's structure and legacy's structure genuinely disagree, and the
disagreement has to be resolved deliberately rather than in passing.

Legacy source: `_LAYOUT_ORDER` (15748), `_apply_panel_layout`
(15818-15923), `_toggle_panel1`/`_toggle_panel2`/`_toggle_focus_mode`
(15787-15805), `_work_area` and the docking maths (15816+).

## What legacy actually does

One window, three columns side by side:

| Panel | Contents | Visible in |
|---|---|---|
| 1 | Projects | full |
| 2 | Goals | full, partial |
| 3 | Clock + tasks | always |

Three modes, in `_LAYOUT_ORDER`:

- **compact** — panel 3 only
- **partial** — panels 2 + 3
- **full** — all three

Column weights are `67 : 83 : 50` in full and `— : 85 : 50` in partial;
panel 2 takes a slightly larger share when panel 1 isn't there to share
with. Panel 3 carries a `minsize`, so it never absorbs the shortfall.

Three ways to change mode:

- Panel 3's top-left chevron: compact ↔ full (a real toggle, keyed off
  current visibility — legacy notes that a fixed ±1 step clamps at index
  0 and breaks the control from the default compact state)
- Panel 2's top-left chevron: partial ↔ full
- Ctrl+F: compact ↔ full — this is `_toggle_focus_mode`, two lines
  calling `_set_panel_layout`

And the window resizes to match: a collapsed layout is an actually-narrow
window docked flush to the right edge of the **work area** (screen minus
taskbar), not empty space with a wandering position. Legacy uses
`MonitorFromPoint` on the window's own top-left rather than
`SPI_GETWORKAREA`, because the latter always reports the primary
monitor's rectangle and silently docks to the wrong screen once the
window has been dragged to a second display.

## Why this can't be ported literally

The port is not a three-panel window. It is a single-page app with a
page nav — Tasks, Habits, Projects, Goals, Journey, BDP, Quarterly — and
shows exactly one of those at a time. There is no panel 1 and panel 2
sitting beside the task list to hide.

Reproducing legacy's layout literally would mean rebuilding the port's
whole navigation model into a three-column window: Projects and Goals
would stop being pages and become permanent side columns, and the four
remaining pages would need somewhere else to live. That is a redesign of
the port, not a port of the feature, and it would undo a structural
decision every other screen already depends on.

## What the modes are actually for

Strip the mechanism away and the user-facing capability is:

1. A **narrow, docked, task-only window** you keep beside the work you
   are actually doing — that is compact mode's whole reason to exist.
2. A **full window** with everything.
3. **One keystroke** between them (Ctrl+F), because the moment you want
   focus mode is the moment you don't want to go hunting for a control.

`partial` is the middle rung of that ladder in a three-column world. In a
one-page-at-a-time world it has no distinct meaning: hiding "panel 1 but
not panel 2" is not a state the port can be in.

## Decision

Port the capability onto the port's own structure:

- **`full`** — the app as it is now: nav, clock, tasks, PLAN review.
- **`compact`** — task-only. Hide the page nav, the clock card's extras,
  and the PLAN review card; keep the task list and the mode control.
  Narrow the window to a fixed compact width and dock it flush to the
  right edge of the work area of *the monitor the window is on*.
  Restore the previous bounds on the way back to full.
- **`partial` is not ported.** It is recorded as N/A on row 10 with this
  reasoning rather than being faked with an arbitrary "hide some things"
  state, which would be a new invention wearing legacy's name.

Controls, matching legacy's three entry points as closely as the
structure allows:

- A corner chevron on the app shell — legacy's panel-3 arrow.
- **Ctrl+F** — compact ↔ full. This closes the remaining half of row 22.
- The Tools menu's **Focus Mode** entry — closes row 29.

Persistence: `AppState.panel_layout`, beside the other working
preferences, via a migration. Legacy stores it in `_settings` and saves
on every change, and it is the same kind of value as `bdp_view` — a
working preference you expect to still hold tomorrow.

Docking is main-process work (`screen.getDisplayMatching`, then
`setBounds`), so the renderer asks for a mode over IPC and the main
process owns the geometry. `screen.getDisplayMatching(win.getBounds())`
is Electron's equivalent of legacy's `MonitorFromPoint` fix, and gets the
multi-monitor case right for the same reason.

## What this costs

The port loses legacy's ability to see Projects and Goals *beside* the
task list. That is real, and it is a consequence of the port's existing
page-based navigation, not of this change — it was already true before
row 10 was touched. Recording it here so it is a known trade rather than
a silent gap.
