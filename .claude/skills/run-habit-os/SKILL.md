---
name: run-habit-os
description: Build, launch, and drive the Habit OS Electron desktop app (this project) for live UI verification — take a screenshot, click through a feature, read rendered text. Use when asked to run/start/launch the app, screenshot it, or verify a UI change actually works end-to-end (not just typecheck).
---

Habit OS is an Electron + Python (FastAPI) desktop app. This WSL
environment already has a **real X display via WSLg**
(`DISPLAY=:0`, `WAYLAND_DISPLAY=wayland-0`) — **no `xvfb` needed**,
unlike the generic cold-container Electron recipe. No `xdotool` /
`scrot` / `import` / `wmctrl` are installed, so drive it via
Playwright's `_electron` launcher (`playwright-core`, already a
devDependency), not raw X tools.

All paths below are relative to the repo root
(`/mnt/c/Users/ZAHID/Desktop/electron`).

## Build

```bash
npx tsc -p electron/tsconfig.json     # -> dist/electron/main.js, preload.js
(nohup npx vite > /tmp/vite.log 2>&1 &)   # renderer dev server on :5173
sleep 3 && cat /tmp/vite.log              # confirm "ready"
```

`playwright-core` is a real devDependency (`npm install --save-dev
playwright-core` was already run) — it drives the project's own
already-installed `node_modules/electron/dist/electron` binary
directly, no browser download involved.

## Run (agent path)

```bash
tmux new-session -d -s habitos -x 200 -y 50
tmux send-keys -t habitos 'DISPLAY=:0 node .claude/skills/run-habit-os/driver.mjs' Enter
timeout 20 bash -c 'until tmux capture-pane -t habitos -p | grep -q "driver>"; do sleep 0.3; done'
tmux send-keys -t habitos 'launch' Enter
timeout 30 bash -c 'until tmux capture-pane -t habitos -p | grep -q "launched\."; do sleep 0.5; done'
tmux send-keys -t habitos 'ss landing' Enter
tmux capture-pane -t habitos -p
```

Screenshots land in `/tmp/shots/` (override with `SCREENSHOT_DIR`).
Then actually open the PNG — a blank or error-page screenshot means
you're not done, not that the app is fine.

### Commands

| command | what it does |
|---|---|
| `launch` | build+start the app, wait for the window |
| `ss [name]` | screenshot -> `/tmp/shots/<name>.png` |
| `click <css-sel>` | click element via DOM `.click()` (not coordinates) |
| `click-text <text>` | click the button/link whose text matches |
| `fill <sel> <text>` / `fill "<sel>" <text>` | set a controlled input's value via a captured ElementHandle — see Gotchas; quote the selector if it contains a space |
| `blur` | press Tab (fires the `onBlur` save most inputs here use) |
| `type <text>` / `press <key>` | keyboard input |
| `wait <css-sel>` | wait for element, 10s timeout |
| `eval <js>` | evaluate in the page, print JSON |
| `text [css-sel]` | print `innerText` (defaults to `document.body`) |
| `windows` | list Electron windows |
| `quit` | close the app, exit the driver |

Example flow (this exact sequence was run to verify the driver):

```
launch
click-text Goals
wait input[value="YEARLY"]
fill "input[placeholder='+ Add goal…']" My goal
press Enter
wait input[value='My goal']
ss goals-added
```

## Run (human path)

```bash
npm run dev   # opens a real window; useless headless. Ctrl-C to quit.
```

## Gotchas

- **No `xvfb` needed here.** This is WSL with WSLg — a real X server
  already exists at `:0`. Don't `apt-get install xvfb`; it's not
  needed and the generic cold-container recipe over-assumes it.
- **A locator built on an input's `value` attribute breaks the instant
  you `.fill()` that same input.** `page.locator('input[value="X"]')`
  re-resolves live on every action — after `.fill()` changes the
  value, the selector no longer matches, so a chained `.press()` on
  the same locator times out. This app's controlled inputs (task/goal
  titles, section headings, project names) are ALL matched this way
  in practice, so this isn't an edge case. The driver's `fill` command
  exists specifically to route around it: it grabs an `ElementHandle`
  via `page.$()` once, then acts on the handle, not a live locator.
- **A numbered UI element does not reliably map to a fixed backend
  key.** The project selector (`1.` .. `6.` pills) re-sorts
  finished-projects-to-the-bottom, so pill "2." is not always
  `proj2`. If a driven flow needs to return to "the project I started
  on," track it by capturing the element (or its `disabled`/active
  state) rather than by re-deriving it from a displayed number.
- **The app's dev userData DB is `~/.config/habit-os/data/app.db`**
  (Electron derives the folder from `package.json`'s `"name"` field),
  **not** `~/.config/Electron/data/app.db` — a same-shaped directory
  that can exist as stale residue from an earlier ad-hoc `electron .`
  run before the app name resolved correctly. If ever unsure which is
  live, `stat -c '%Y %n'` both and trust the recent mtime.
- **Schema migrations run automatically on every launch** — `main.py`
  calls `alembic upgrade head` against whatever `APP_DB_PATH` Electron
  passes it (`python/main.py`'s `run_migrations()`), so a fresh model
  change is picked up with no manual migration step against this DB.
  `python/app.db` (used by the backend's own dev workflow / manual
  `alembic` runs) is a **separate file** from the Electron userData
  DB — migrating one does not migrate the other; both get migrated on
  their own next use (Electron launch / `python main.py` invocation).
- **`click <sel>` (DOM `el.click()`) does NOT blur a currently-focused
  input, and `press Tab` on a native `<input type="date">` moves
  between its internal month/day/year sub-fields instead of leaving
  the control** — so neither reliably fires `onBlur` the way a real
  mouse click does. If a value seems to not "save" after `fill` +
  `blur`/`click`, don't assume the app is broken — confirm first with
  `eval document.activeElement.blur()`, which always fires a genuine
  blur. (Caught this exact false alarm verifying the Goals date
  picker: the save logic was fine, the test technique wasn't.)
- **Any test data lands in the real userData DB the actual app
  uses.** Treat it like a shared staging DB — clean up after driving
  it:
  ```bash
  cd python && source .venv/bin/activate && python -c "
  from database.models import Goal   # or whatever table you touched
  from sqlalchemy import create_engine, delete
  from sqlalchemy.orm import Session
  eng = create_engine('sqlite:////home/zahid/.config/habit-os/data/app.db')
  with Session(eng) as s:
      s.execute(delete(Goal)); s.commit()
  "
  ```
  and reset any `AppState` singleton fields you changed (theme,
  `goal_project`, `sec_title_*`, etc.) back to their prior values.

## Troubleshooting

- **`launch` hangs / times out:** confirm `dist/electron/main.js`
  exists (re-run the Build step) and vite is actually serving on
  `:5173` (`cat /tmp/vite.log`, look for "ready").
- **Window loads blank / shows a connection error:** vite isn't up
  yet, or died — check `/tmp/vite.log`.
- **`fill` reports `NOT_FOUND`:** the selector didn't match anything
  *at the moment `fill` ran* — `wait` for it first, and remember
  React inputs here are matched by `value`/`placeholder`, which is
  exact-string, not substring.
- **Driver seems to eat your input:** the REPL protects stdin from
  Electron via a raw `/dev/stdin` fd read — if that ever breaks, run
  the driver directly (not through another wrapper) so it owns the
  real stdin.
