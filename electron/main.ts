import { app, BrowserWindow, dialog, ipcMain, Menu, nativeTheme, screen, shell } from 'electron';
import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import path from 'path';
import fs from 'fs';

const PYTHON_PORT = 5180;
let pythonProcess: ChildProcessWithoutNullStreams | null = null;
let mainWindow: BrowserWindow | null = null;

// Matches legacy's acquire_lock/release_lock (a PID file it checks for
// staleness) and the Yes/No "open anyway" prompt around it, but the
// underlying risk changed shape with the architecture: legacy's own
// reasoning was "two copies both autosave a JSON file, whichever
// writes last wins outright" — a risk SQLite-via-a-single-process
// doesn't have. What the port DOES still risk is two Electron
// instances each spawning a Python engine on the same hardcoded port
// and opening the same SQLite file from two separate processes, which
// "open anyway" would only make worse, not offer a safe escape from.
// So this uses Electron's own OS-level lock (no stale-PID-file problem
// to detect at all, since the lock dies with the process) and skips
// the warning dialog in favor of just focusing the already-running
// window — the standard pattern for apps with no legitimate reason to
// run twice (VS Code, Slack, Discord all do this silently).
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  // app.quit() only schedules a quit — it doesn't stop the rest of this
  // module from running, and everything below (spawning the Python
  // engine on a hardcoded port, opening the same SQLite file) is
  // exactly what must NOT happen from a second process. Exiting
  // immediately is the only way to guarantee that.
  process.exit(0);
}
app.on('second-instance', () => {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
});

function getUserDataDir(): string {
  const dir = path.join(app.getPath('userData'), 'data');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// Matches legacy's startup exception handler: a crash here has to
// leave a trace that outlives the process that hit it — a traceback
// that only ever existed as pixels in a window the user didn't
// screenshot is one they have to retype by hand to report. Written to
// a file AND surfaced in a dialog, same as legacy writing to a file,
// stderr, and a Tk window all at once.
function writeCrashLog(details: string): string {
  const logPath = path.join(app.getPath('userData'), 'startup-error.txt');
  try {
    fs.writeFileSync(logPath, `Habit OS startup error\n${new Date().toISOString()}\n\n${details}`);
  } catch (err) {
    console.error('failed to write crash log:', err);
  }
  return logPath;
}

function reportStartupCrash(details: string) {
  console.error(details);
  const logPath = writeCrashLog(details);
  dialog.showErrorBox('Habit OS failed to start', `${details}\n\nSaved to:\n${logPath}`);
}

process.on('uncaughtException', (err) => {
  reportStartupCrash(err.stack || String(err));
  app.quit();
});

// ── Backup rotation + corrupt-file recovery ───────────────────────────
// Matches legacy's _write_backup/load_data, adapted for a single
// SQLite file instead of a JSON blob: the underlying risk shrinks (a
// transactional file format doesn't corrupt from an ordinary partial
// write the way naive JSON serialization can) but doesn't disappear
// entirely — disk corruption and interrupted writes during non-WAL
// operations are both still real — so the same daily-backup-with-
// fallback-recovery safety net still earns its place.
const BACKUP_KEEP = 14; // matches legacy's BACKUP_KEEP (days of history kept on disk)
const SQLITE_MAGIC = 'SQLite format 3\0';

function getBackupDir(): string {
  const dir = path.join(app.getPath('userData'), 'backups');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// Local calendar date, not toISOString()'s UTC one — a backup taken at
// 00:02 local time in a UTC+6 timezone would otherwise date-stamp
// itself for the PREVIOUS day, same class of bug as any other
// UTC-vs-local date mismatch. Matches legacy's date.today(), which
// reads the local system clock.
function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function backupPaths(): string[] {
  try {
    return fs
      .readdirSync(getBackupDir())
      .filter((n) => n.startsWith('backup-') && n.endsWith('.db'))
      .sort()
      .reverse()
      .map((n) => path.join(getBackupDir(), n));
  } catch {
    return [];
  }
}

function isValidSqliteFile(filePath: string): boolean {
  try {
    const fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(16);
    fs.readSync(fd, buf, 0, 16, 0);
    fs.closeSync(fd);
    return buf.toString('utf-8') === SQLITE_MAGIC;
  } catch {
    return false;
  }
}

// Copies today's already-migrated, already-opened-successfully DB
// aside — deliberately a copy of the file Python just proved it could
// read, not a fresh serialization, so a bug that corrupted live state
// can't get faithfully backed up as if it were good data. Runs once
// per day; prunes on every call (not just the day's first) so a
// long-running install doesn't grow the folder without limit.
function rotateBackups(dbPath: string) {
  try {
    if (!fs.existsSync(dbPath)) return;
    const dest = path.join(getBackupDir(), `backup-${localDateStr(new Date())}.db`);
    if (!fs.existsSync(dest)) {
      fs.copyFileSync(dbPath, dest);
    }
    for (const old of backupPaths().slice(BACKUP_KEEP)) {
      try {
        fs.unlinkSync(old);
      } catch (err) {
        console.error('backup prune failed:', old, err);
      }
    }
  } catch (err) {
    console.error('backup rotation failed:', err);
  }
}

// Runs BEFORE the Python engine ever opens dbPath, since recovery here
// means the file Python would have opened is already the right one by
// the time it tries. Returns a notice to show once the window exists —
// showing a dialog this early, before app.whenReady(), isn't reliable
// on every platform.
function recoverDatabaseIfNeeded(dbPath: string): string | null {
  const backups = backupPaths();
  if (!fs.existsSync(dbPath)) {
    // Genuinely absent (fresh install) is not the same as missing
    // (the file existed for a previous run that made backups) — matches
    // legacy's load_data distinguishing the two by whether backups exist.
    if (backups.length === 0) return null;
    fs.copyFileSync(backups[0], dbPath);
    return `Database file was missing — restored from ${path.basename(backups[0])}`;
  }
  if (isValidSqliteFile(dbPath)) return null;
  const quarantinePath = `${dbPath}.corrupt-${Date.now()}`;
  try {
    fs.renameSync(dbPath, quarantinePath);
  } catch (err) {
    console.error('failed to quarantine corrupt database:', err);
  }
  if (backups.length === 0) {
    return 'Database file was damaged and no backup could be found. Starting fresh — the damaged file was kept, not deleted.';
  }
  fs.copyFileSync(backups[0], dbPath);
  return `Database file was damaged — restored from ${path.basename(backups[0])}`;
}

// Matches legacy's _setup_window / main-window geometry save, minus
// the docking system that (deliberately) throws the saved X/width away
// on every launch — a bare resizable window has no screen-edge to
// re-dock to, so a plain "remember exactly where I was" is the right
// simplification here. Lives in its own local JSON file rather than
// AppState: it's Electron-chrome, not app data, and reading it can't
// wait on the Python engine being up (the window needs its bounds at
// construction time, before startPythonEngine() even resolves).
interface WindowState {
  x?: number;
  y?: number;
  width: number;
  height: number;
  maximized: boolean;
  // Whether the window was left in compact mode. The GEOMETRY stored
  // alongside this is always the FULL geometry, never compact's — see
  // windowStateToPersist for why.
  compact?: boolean;
}

// Legacy's _layout_width (15938): compact is `_PANEL3_W + 40` — the
// panel's own fixed width (545) plus room for the window frame and the
// scrollbar. It is not a taste number, it is the smallest width at which
// panel 3 is not cut off, which is the entire point of compact mode.
//
// This was 420. Panel 3 is 545 wide in the renderer too (App.tsx), so
// compact was docking 165px narrower than its only occupant: the clock,
// the third scope box, the right of the trend chart and the mindset card
// were all sliced off, with a horizontal scrollbar as the consolation.
const PANEL3_W = 545;
const COMPACT_WIDTH = PANEL3_W + 40;
// Three columns: panel 3 is a fixed 545, so a 1200-wide window left
// panels 1 and 2 about 320 each — narrower than a single project card
// wants. 1500 gives the two flexible columns room to be read.
const DEFAULT_WIDTH = 1500;
const DEFAULT_HEIGHT = 900;
const FULL_MIN_WIDTH = 900;

const FULL_MIN_HEIGHT = 600;

// Current layout, and the geometry to return to when leaving compact.
// Declared here rather than beside applyPanelLayout because
// saveWindowState needs them, and the two together are what make a
// docked window restorable.
type Layout = 'full' | 'partial' | 'compact';

// Legacy's _layout_width (15925-15940) — THE definition of how wide the
// window is in each layout, used by the initial dock and by every arrow
// click.
//
// THE BUG THIS FIXES. This port only ever resized for COMPACT. Hiding
// panel 1 left the window exactly as wide as it was, so "partial" was a
// full-screen window with an empty third of it — which is the precise
// thing legacy calls out as the failure worth avoiding: "a collapsed
// layout is an actually-narrow window pinned to the right edge of the
// screen, not empty space with a wandering position". The collapse
// control looked broken because half of what it does was missing.
//
// "full" is the monitor's work area, not a remembered number. Panel 3
// has a minimum width, so any width short of the screen is taken out of
// panels 1 and 2 — the two that needed it. Legacy's own note: it used
// to mean 1600px and left ~320px of a 1920 desktop unused while the
// flexible panels were visibly cramped.
const PARTIAL_WIDTH = 1280;

function layoutWidth(layout: Layout, workAreaWidth: number): number {
  if (layout === 'compact') return COMPACT_WIDTH;
  if (layout === 'partial') return Math.min(PARTIAL_WIDTH, workAreaWidth);
  return Math.max(FULL_MIN_WIDTH, workAreaWidth);
}

// Only compact changes the WINDOW; 'partial' just hides a column, so
// everything below treats it exactly like 'full'.
let currentLayout: Layout = 'full';
let preCompactBounds: Electron.Rectangle | null = null;
let preCompactMaximized = false;

function getWindowStatePath(): string {
  return path.join(app.getPath('userData'), 'window-state.json');
}

/**
 * Repair a window state written before compact stopped persisting its own
 * docked geometry. Such a file says width 420 with no `compact` flag, so
 * the window reopens 420 wide in the FULL layout — three columns crammed
 * into a quarter of the width they need, which renders as a clipped
 * panel 3 and nothing else.
 *
 * minWidth alone does not save this: X11/WSLg does not enforce a window's
 * minimum size the way Windows and macOS do, so the narrow size survives
 * to the screen. A genuinely compact window is identified by its flag,
 * not by being narrow, so widening here cannot affect one.
 *
 * Pure and exported so the repair is testable — the state that needs it
 * only exists on a machine that already ran the broken build.
 */
export function healWindowState(state: WindowState): WindowState {
  if (state.compact || state.width >= FULL_MIN_WIDTH) return state;
  const { x: _x, y: _y, ...rest } = state;
  return {
    ...rest,
    width: DEFAULT_WIDTH,
    height: Math.max(state.height, DEFAULT_HEIGHT),
  };
}

function readWindowStateRaw(): unknown {
  try {
    return JSON.parse(fs.readFileSync(getWindowStatePath(), 'utf-8'));
  } catch {
    return null;
  }
}

function loadWindowState(): WindowState {
  try {
    const state: WindowState = JSON.parse(fs.readFileSync(getWindowStatePath(), 'utf-8'));

    // Self-heal a state file written before compact stopped persisting
    // its own docked geometry. Such a file says width 420 with no
    // `compact` flag, so the window reopens 420 wide in the FULL layout
    // — three columns crammed into a quarter of the width they need,
    // which renders as a clipped panel 3 and nothing else.
    //
    // minWidth alone does not save this: X11/WSLg does not enforce a
    // window's minimum size the way Windows and macOS do, so the narrow
    // size survives. Widening here is what actually fixes it, and it is
    // safe because a genuinely compact window is identified by the flag,
    // not by being narrow.
    return healWindowState(state);
  } catch {
    return { width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT, maximized: false };
  }
}

/**
 * What to write to window-state.json.
 *
 * Pure, and exported, because this is where a real bug lived: compact's
 * geometry was being persisted as if the user had chosen it. Compact is
 * computed — a fixed width docked to the screen edge — so saving it
 * overwrote the only record of the real window size. On the next launch
 * the window opened at 420px, compact was re-applied on top of that, and
 * the "restore" bounds captured 420px as the full size. Leaving compact
 * then resized the window to 420px: the nav and clock crammed into a
 * sliver with a horizontal scrollbar, and no way back but a manual drag.
 *
 * So while compact, the REMEMBERED full geometry is written instead of
 * the live bounds, and the compact flag records the mode. Both halves
 * are needed: keeping the flag without the geometry still loses the size,
 * and keeping the geometry without the flag reopens full every time.
 */
export function windowStateToPersist(
  layout: Layout,
  live: { bounds: Electron.Rectangle; maximized: boolean },
  remembered: { bounds: Electron.Rectangle; maximized: boolean } | null,
): WindowState | null {
  if (layout === 'compact') {
    // Nothing remembered yet means compact was applied before any full
    // geometry was recorded. Writing the live compact bounds is exactly
    // the bug above, so write nothing and keep whatever is on disk.
    if (!remembered) return null;
    return { ...remembered.bounds, maximized: remembered.maximized, compact: true };
  }
  return { ...live.bounds, maximized: live.maximized, compact: false };
}

function saveWindowState(win: BrowserWindow) {
  const state = windowStateToPersist(
    currentLayout,
    { bounds: win.getBounds(), maximized: win.isMaximized() },
    preCompactBounds ? { bounds: preCompactBounds, maximized: preCompactMaximized } : null,
  );
  if (state === null) return;
  try {
    fs.writeFileSync(getWindowStatePath(), JSON.stringify(state));
  } catch (err) {
    console.error('window state save failed:', err);
  }
}

let pendingRecoveryNotice: string | null = null;

// The window is deliberately allowed to open before the engine answers
// (see the fail-safe in startPythonEngine): a visible shell beats a
// blank screen, and a missed READY marker must never hang the app.
//
// But "the window may open early" was being paid for by every fetch in
// the app. A cold start with migrations to run took ~10s on WSL, so the
// first seconds produced a wall of ECONNREFUSED — one per mounted
// component, plus the startup settings sync — and each one was a real
// failure that a component had to survive on its own.
//
// The gap belongs here, in the one place that knows when the engine came
// up, not in fifty call sites. Requests arriving early wait for READY
// instead of being refused. The renderer's retry stays as a backstop for
// the case this cannot cover (the engine dying and being restarted), but
// it is no longer what makes a cold start work.
let engineListening: Promise<void> = Promise.resolve();
let markEngineListening: () => void = () => {};
let markEngineFailed: (err: Error) => void = () => {};

// Long enough to cover a slow cold start with migrations; short enough
// that a genuinely dead engine surfaces as an error instead of a UI that
// waits forever with no explanation.
const ENGINE_WAIT_MS = 90_000;

async function awaitEngine(): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      engineListening,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`Engine did not start within ${ENGINE_WAIT_MS / 1000}s`)),
          ENGINE_WAIT_MS,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function startPythonEngine(): Promise<void> {
  engineListening = new Promise<void>((ready, failed) => {
    markEngineListening = ready;
    markEngineFailed = failed;
  });
  // Nothing awaits this until a request arrives; without a handler an
  // early rejection would be an unhandled promise rejection.
  engineListening.catch(() => {});

  return new Promise((resolve, reject) => {
    const isDev = !app.isPackaged;
    const dbPath = path.join(getUserDataDir(), 'app.db');

    pendingRecoveryNotice = recoverDatabaseIfNeeded(dbPath);

    // Windows puts a venv's interpreter in Scripts\python.exe; every
    // other platform uses bin/python. Only the POSIX path was checked,
    // so on Windows existsSync was always false and this fell through to
    // the literal string 'python3' — which on Windows is usually not a
    // real command at all but the Microsoft Store stub, so spawn failed
    // and the app died on the startup-crash dialog. The fallback has the
    // same problem: the interpreter on PATH is `python` on Windows.
    const venvCandidates = [
      path.join(__dirname, '../../python/.venv/Scripts/python.exe'),
      path.join(__dirname, '../../python/.venv/bin/python'),
    ];
    const isWin = process.platform === 'win32';
    const venvPython = venvCandidates.find((p) => fs.existsSync(p));
    // electron-builder gives the packaged sidecar the host's executable
    // extension. Without it, spawn on Windows looks for an extensionless
    // file that PyInstaller never produced.
    const packagedEngine = path.join(
      process.resourcesPath,
      'engine',
      isWin ? 'engine.exe' : 'engine',
    );
    const command = isDev
      ? (venvPython ?? (isWin ? 'python' : 'python3'))
      : packagedEngine;
    const args = isDev
      ? [path.join(__dirname, '../../python/main.py'), '--port', String(PYTHON_PORT)]
      : ['--port', String(PYTHON_PORT)];

    pythonProcess = spawn(command, args, {
      env: { ...process.env, APP_DB_PATH: dbPath },
    });

    let started = false;
    let stderrLog = '';
    const onReady = (data: Buffer) => {
      const msg = data.toString();
      process.stdout.write(`[python] ${msg}`);
      if (msg.includes('READY')) {
        // Always, even if the fail-safe already opened the window: THIS
        // is the moment queued requests may proceed.
        markEngineListening();
      }
      if (!started && msg.includes('READY')) {
        started = true;
        rotateBackups(dbPath);
        resolve();
      }
    };

    pythonProcess.stdout.on('data', onReady);
    pythonProcess.stderr.on('data', (data) => {
      const text = data.toString();
      stderrLog += text;
      process.stderr.write(`[python:err] ${text}`);
    });
    pythonProcess.on('error', (err) => {
      markEngineFailed(err);
      if (!started) reject(err);
    });
    pythonProcess.on('exit', (code) => {
      console.error(`Python engine exited with code ${code}`);
      // A crash BEFORE ever reaching READY means the app has no engine
      // to talk to and never will — matches legacy's own startup
      // exception handler, which treats "failed before the main loop
      // opened" as fatal rather than something to quietly retry.
      if (!started) {
        const err = new Error(
          `Python engine exited with code ${code} before starting:\n\n${stderrLog}`,
        );
        markEngineFailed(err);
        reject(err);
      }
    });

    // Fail-safe: show the window even if the READY marker is missed.
    // It deliberately does NOT mark the engine as listening — that is
    // what this timeout used to imply, and the ECONNREFUSED storm was
    // the app acting on that false claim.
    setTimeout(() => {
      if (!started) {
        started = true;
        rotateBackups(dbPath);
        resolve();
      }
    }, 5000);
  });
}

function createWindow() {
  // Kept separately so the log below can show both what was on disk AND
  // what the repair made of it. Which of the two applied is exactly what
  // has been guessed at for several rounds; it should be readable.
  const raw = readWindowStateRaw();
  const state = loadWindowState();
  mainWindow = new BrowserWindow({
    width: state.width,
    height: state.height,
    x: state.x,
    y: state.y,
    // Below this the three columns stop being readable. Compact lowers
    // the minimum before docking and raises it again on the way back —
    // setBounds IS clamped to the minimum size, so leaving this at 900
    // would silently pin the compact window at 900px instead of 420.
    minWidth: FULL_MIN_WIDTH,
    minHeight: FULL_MIN_HEIGHT,
    // OUR OWN TITLE BAR.
    //
    // The grey OS strip was the loudest thing on screen saying "this was
    // assembled at home": an app the user pays for is expected to own
    // the whole rectangle, and every desktop product they already use
    // does. It also wasted 30px telling them the name of a window they
    // are looking at, in a font and colour that belong to no theme here.
    //
    // The renderer draws it instead (components/TitleBar.tsx) — six
    // themes, one bar, and the drag region declared in CSS. macOS keeps
    // its traffic lights, because hiding those is not a style choice
    // there, it is breaking the platform's only close button.
    frame: process.platform === 'darwin',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    // Painted before the renderer's first frame. The saved theme lives
    // in the engine's settings and is not readable this early, so this
    // follows the OS instead: a wrong guess costs one frame of the wrong
    // background, an unset one costs a white flash on every dark theme.
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#0C0C0F' : '#E8E5E0',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });
  if (state.maximized) mainWindow.maximize();

  // Reopen docked if that is how it was left. Done here in the main
  // process rather than waiting for the renderer to ask, so the window
  // doesn't flash full-size first — and, more importantly, so the full
  // geometry is seeded as the restore point BEFORE compact is applied.
  // That seeding is what the earlier bug was missing.
  console.log(
    `[layout] window-state.json ${JSON.stringify(raw)} -> after heal ${JSON.stringify(state)}`,
  );

  if (state.compact) {
    preCompactBounds = { x: state.x ?? 0, y: state.y ?? 0, width: state.width, height: state.height };
    preCompactMaximized = state.maximized;
    applyPanelLayout('compact');
  }

  // ── Navigation is not something this window does ────────────────────
  // There is exactly one document here and it never navigates: every
  // call to the engine goes over IPC, not over the renderer's own
  // network stack. So both routes OUT are closed rather than policed.
  //
  // Why this matters more than it looks: a window that navigates keeps
  // its preload, so anything it lands on inherits window.api — the same
  // bridge that reaches the filesystem and the engine. A stray target=
  // _blank, a redirect, or a dragged-in link is enough. Denying by
  // default is the only version of this that stays correct as the
  // renderer grows.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    // A real external link still works — it just opens in the user's
    // browser, where it has no bridge to inherit.
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const current = mainWindow?.webContents.getURL() ?? '';
    // Same-document navigation (hash routing, reloads) is fine; going
    // anywhere else is not.
    if (current && new URL(url).origin === new URL(current).origin) return;
    event.preventDefault();
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
  });

  // Debounced the same way as legacy (400ms after the last move/resize)
  // to avoid a disk-write storm while the user is actively dragging.
  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  const debouncedSaveState = () => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => mainWindow && saveWindowState(mainWindow), 400);
  };
  mainWindow.on('resize', debouncedSaveState);
  mainWindow.on('move', debouncedSaveState);
  mainWindow.on('maximize', debouncedSaveState);
  mainWindow.on('unmaximize', debouncedSaveState);

  // Flush on close, cancelling the pending debounce. Without this a
  // change made inside the last 400ms is simply lost — and the case that
  // actually bit was leaving compact and quitting straight after, which
  // persisted the app's layout as "full" while the window file still
  // said compact. The renderer now corrects that mismatch on load, but
  // writing the right thing in the first place is better than repairing
  // it afterwards.
  mainWindow.on('close', () => {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    if (mainWindow && !mainWindow.isDestroyed()) saveWindowState(mainWindow);
  });

  // Matches legacy's _bind_context_menu (Cut/Copy/Paste/Select All on
  // every text widget, app-wide): unlike a regular Chrome tab, a bare
  // BrowserWindow shows no context menu at all on right-click unless
  // one is built here — Electron doesn't wire up Chromium's default
  // editable-field menu automatically. `params.editFlags` already
  // reflects the exact widget under the cursor (has a selection? is it
  // empty?), so this needs no renderer-side code to match legacy's
  // per-field enabled/disabled state.
  mainWindow.webContents.on('context-menu', (_event, params) => {
    if (!params.isEditable) return;
    const { editFlags } = params;
    Menu.buildFromTemplate([
      { label: 'Cut', role: 'cut', enabled: editFlags.canCut },
      { label: 'Copy', role: 'copy', enabled: editFlags.canCopy },
      { label: 'Paste', role: 'paste', enabled: editFlags.canPaste },
      { type: 'separator' },
      { label: 'Select All', role: 'selectAll', enabled: editFlags.canSelectAll },
    ]).popup({ window: mainWindow! });
  });

  // No application menu. Legacy has no menu bar at all — its whole
  // chrome is the window's own title bar — and Electron's default
  // File/Edit/View/Window/Help strip is pure boilerplate that would
  // announce "this is an Electron app" above every screen.
  //
  // Only the MENU is removed, not the shortcuts it happened to carry:
  // Cut/Copy/Paste stay live through the context-menu handler above and
  // through Chromium's built-in accelerators, and everything this app
  // actually binds (Ctrl+T/Z/F/W, F1, Escape) is handled in the
  // renderer, so none of it depends on this template.
  Menu.setApplicationMenu(null);

  const isDev = !app.isPackaged;
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }
}

const BASE = () => `http://127.0.0.1:${PYTHON_PORT}`;
const ALLOWED_METHODS = new Set(['GET', 'POST', 'PUT', 'DELETE']);

// The renderer only stores the preference (Settings' start_with_windows
// toggle); actually registering/unregistering the OS startup entry has
// to happen here, since contextIsolation + nodeIntegration:false keep
// the renderer from touching login-item settings itself. Wrapped in
// try/catch because setLoginItemSettings isn't meaningful on every
// platform this could run on, and a preference toggle must never crash
// the app over a missing OS integration.
function syncLoginItem(startWithWindows: boolean) {
  try {
    app.setLoginItemSettings({ openAtLogin: startWithWindows });
  } catch (err) {
    console.error('setLoginItemSettings failed:', err);
  }
}

// Matches legacy's _set_dark_titlebar (raw DWM ctypes calls, Windows-
// only, wired to the theme picker) — nativeTheme.themeSource is
// Electron's own cross-platform equivalent for the same native-chrome
// effect (title bar, window borders, scrollbars) with none of the
// manual HWND/DwmSetWindowAttribute plumbing.
//
// BUG THIS FIXES: this set said ['focus', 'warroom', 'journey'] and the
// comment above it claimed "energy is the port's one light theme, the
// rest are dark". Both were wrong, and in opposite directions. Reading
// the actual backgrounds out of renderer/src/themes.ts:
//
//     focus     #E8E5E0  light      corporate #E7E2DB  light
//     warroom   #1A1A1E  DARK       journey   #17211D  DARK
//     energy    #EBEBEB  light      rize      #E5E7EB  light
//
// So FOCUS — a light theme, and the app's default — was getting a black
// title bar above a near-white window on Windows.
//
// The underlying fault is that one fact lived in two places: the palette
// in themes.ts and a hand-written list here. themes.test.ts now reads
// themes.ts and fails if this set ever drifts from it again.
export const DARK_THEMES = new Set(['warroom', 'journey']);

function syncTitleBarTheme(theme: unknown) {
  if (typeof theme !== 'string') return;
  nativeTheme.themeSource = DARK_THEMES.has(theme) ? 'dark' : 'light';
}

// ── Progressive panel layout: the window half ───────────────────────
// Legacy's compact mode is not "the same window with things hidden" —
// it is an actually-narrow window docked flush to the right edge of the
// work area (screen minus taskbar), so it sits beside whatever you are
// working in. Hiding content without narrowing the window would leave a
// wide pane of empty space, which is the state legacy explicitly calls
// out as the bug worth avoiding.
//
// See docs/ROW10_LAYOUT_NOTE.md for why only two of legacy's three
// layout rungs are ported.


function applyPanelLayout(layout: Layout) {
  const win = mainWindow;
  if (!win || win.isDestroyed()) return;

  console.log(`[layout] apply ${layout} (was ${currentLayout}); bounds ${JSON.stringify(win.getBounds())}`);
  currentLayout = layout;

  // ONE formula for all three rungs, which is the whole point.
  //
  // This used to remember the bounds the window had before going
  // compact and put them back afterwards, and resize for compact only.
  // Two consequences, both of which read as "the collapse button is
  // broken": PARTIAL never changed the window at all, so hiding panel 1
  // left a third of a full-screen window empty; and FULL came back at
  // whatever size happened to be remembered rather than the screen.
  //
  // Legacy does not remember anything — it recomputes deterministically
  // from the monitor every time (_dock_geometry + _layout_width), which
  // is both simpler and impossible to desynchronise. So does this now.
  const dock = () => {
    if (win.isDestroyed()) return;
    // getDisplayMatching, not getPrimaryDisplay: Electron's equivalent
    // of legacy's MonitorFromPoint fix. The primary display's work area
    // is the wrong rectangle the moment the window has been dragged to a
    // second monitor, and the symptom — docking to the wrong screen, or
    // the taskbar overlapping the bottom — is confusing enough that
    // legacy left a paragraph about it.
    const wa = screen.getDisplayMatching(win.getBounds()).workArea;
    const width = layoutWidth(layout, wa.width);
    // Must come BEFORE setBounds: a window whose minimum width is still
    // 900 cannot be resized to 585, and the dock would silently land at
    // 900 with no error to notice.
    win.setMinimumSize(Math.min(width, FULL_MIN_WIDTH), 400);
    win.setBounds({ x: wa.x + wa.width - width, y: wa.y, width, height: wa.height });
    // Restored after the move, so a full window can still be dragged
    // narrow by hand but not below what the three columns need.
    if (layout === 'full') win.setMinimumSize(FULL_MIN_WIDTH, FULL_MIN_HEIGHT);
  };

  if (win.isMaximized()) {
    // unmaximize() is not synchronous under X11/WSLg: it asks the window
    // manager, which restores its own remembered position afterwards —
    // landing on top of a setBounds issued immediately after. Docking
    // from a NON-maximized window always worked, which is what
    // identified this. Waiting for the event does the same thing
    // correctly, with a timed fallback for window managers that never
    // emit it; the fallback re-checks the width so a dock that already
    // succeeded is not redone.
    const want = () => layoutWidth(layout, screen.getDisplayMatching(win.getBounds()).workArea.width);
    win.once('unmaximize', dock);
    win.unmaximize();
    setTimeout(() => {
      if (!win.isDestroyed() && currentLayout === layout && win.getBounds().width !== want()) dock();
    }, 250);
  } else {
    dock();
  }
}

// The three window buttons, and the state the maximise button needs to
// know which glyph it is. Deliberately thin: the renderer decides what
// they look like, the main process is the only place that can act on
// them.
ipcMain.handle('window-control', async (_, action: 'minimise' | 'maximise' | 'close') => {
  if (!mainWindow) return { maximised: false };
  if (action === 'minimise') mainWindow.minimize();
  else if (action === 'close') mainWindow.close();
  else if (mainWindow.isMaximized()) mainWindow.unmaximize();
  else mainWindow.maximize();
  return { maximised: mainWindow.isMaximized() };
});

ipcMain.handle('window-state', async () => ({
  maximised: mainWindow?.isMaximized() ?? false,
  platform: process.platform,
}));

ipcMain.handle('set-panel-layout', async (_, layout: Layout) => {
  applyPanelLayout(layout);
  return { ok: true };
});

ipcMain.handle('health-check', async () => {
  await awaitEngine();
  const res = await fetch(`${BASE()}/health`);
  return res.json();
});

ipcMain.handle(
  'api-request',
  async (_, { method, path: reqPath, body }: { method: string; path: string; body?: unknown }) => {
    if (!ALLOWED_METHODS.has(method) || !reqPath.startsWith('/api/')) {
      throw new Error(`Blocked request: ${method} ${reqPath}`);
    }
    await awaitEngine();
    const res = await fetch(`${BASE()}${reqPath}`, {
      method,
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const detail = await res.text();
      throw new Error(`${res.status} ${detail}`);
    }
    if (res.status === 204) return null;
    const json = (await res.json()) as Record<string, unknown>;
    if (reqPath === '/api/settings' && typeof json.start_with_windows === 'boolean') {
      syncLoginItem(json.start_with_windows);
    }
    if ((reqPath === '/api/settings' || reqPath === '/api/settings/theme') && 'theme' in json) {
      syncTitleBarTheme(json.theme);
    }
    return json;
  },
);

// Separate from api-request on purpose: that channel only proxies
// JSON over HTTP to the Python engine and can't touch the filesystem
// (contextIsolation + nodeIntegration:false keep the renderer from
// doing this itself). Export needs a real native folder picker and a
// direct fs.writeFile, so it gets its own narrow channel instead of
// widening api-request's contract.
ipcMain.handle(
  'export-save',
  async (_, { files }: { files: { filename: string; content: string }[] }) => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: 'Choose export folder',
      properties: ['openDirectory', 'createDirectory'],
    });
    if (result.canceled || !result.filePaths[0]) return { ok: false, cancelled: true };
    const folder = result.filePaths[0];
    // basename, because `filename` crosses the IPC boundary from the
    // renderer and path.join happily walks upwards: a filename of
    // "../../../../Windows/System32/drivers/etc/hosts" would have been
    // written OUTSIDE the folder the user picked. The user chose a
    // destination; a filename is a name, not a path.
    const written: string[] = [];
    for (const f of files) {
      const name = path.basename(String(f.filename ?? '')).trim();
      if (!name || name === '.' || name === '..') continue;
      fs.writeFileSync(path.join(folder, name), f.content, 'utf-8');
      written.push(name);
    }
    return { ok: true, folder, filenames: written };
  },
);

// Matches legacy's _ba_attach_pick/_ba_attach_open: the BA "attach a
// Word/Excel/CSV file" control only ever stores a filesystem PATH, not
// the file's contents — the renderer can't touch the filesystem
// directly (same contextIsolation reasoning as export-save), so
// picking a path and opening it with the OS's own default handler both
// need a main-process round trip.
// shell.openPath hands a file to the OS default handler, which for an
// .exe/.bat/.cmd/.ps1/.lnk means RUNNING it. open-path took whatever
// string the renderer sent, so an XSS or a bad dependency in the
// renderer was one IPC call away from launching a program.
//
// The obvious fix — only allow paths picked in this session — is wrong:
// a BA attachment and a Journey cover are stored in the database and
// opened again weeks later, so that would break the feature it is meant
// to protect. What actually needs constraining is not WHERE the path
// came from but WHAT it is: this control exists to open documents, and
// a document is not an executable.
const OPENABLE_EXTS = new Set([
  '.docx', '.doc', '.xlsx', '.xls', '.xlsm', '.csv', '.pdf', '.txt',
  '.rtf', '.odt', '.ods', '.md',
  '.png', '.jpg', '.jpeg', '.webp', '.bmp', '.gif',
]);

ipcMain.handle('pick-file', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    title: 'Attach Word / Excel / CSV file',
    properties: ['openFile'],
    filters: [
      { name: 'Word & Excel', extensions: ['docx', 'doc', 'xlsx', 'xls', 'xlsm', 'csv'] },
      { name: 'Word documents', extensions: ['docx', 'doc'] },
      { name: 'Excel spreadsheets', extensions: ['xlsx', 'xls', 'xlsm'] },
      { name: 'All files', extensions: ['*'] },
    ],
  });
  if (result.canceled || !result.filePaths[0]) return null;
  return result.filePaths[0];
});

ipcMain.handle('open-path', async (_, filePath: string) => {
  if (typeof filePath !== 'string' || !filePath) {
    return { ok: false, error: 'No file path given.' };
  }
  if (!OPENABLE_EXTS.has(path.extname(filePath).toLowerCase())) {
    return { ok: false, error: 'Only documents and images can be opened from here.' };
  }
  const error = await shell.openPath(filePath);
  return { ok: error === '', error: error || null };
});

// Journey's cover image: same "store a path, not the bytes" model as
// pick-file, just with an image-only filter (matches legacy's own
// cover-pick dialog, task_tracker_v3_THEMES.py lines ~11357-11358).
ipcMain.handle('pick-image', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    title: 'Choose cover image',
    properties: ['openFile'],
    filters: [
      { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif'] },
      { name: 'All files', extensions: ['*'] },
    ],
  });
  if (result.canceled || !result.filePaths[0]) return null;
  return result.filePaths[0];
});

const IMAGE_MIME_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.gif': 'image/gif',
};

// Renders <img> from a bare filesystem path without a file:// CSP/origin
// mismatch between dev (http://localhost:5173) and packaged (file://)
// loads: read the bytes here, in the process that already has fs
// access, and hand the renderer a self-contained data URL instead.
ipcMain.handle('read-image', async (_, filePath: string) => {
  try {
    const ext = path.extname(filePath).toLowerCase();
    const mime = IMAGE_MIME_TYPES[ext];
    if (!mime) return null;
    const data = fs.readFileSync(filePath);
    return `data:${mime};base64,${data.toString('base64')}`;
  } catch {
    return null;
  }
});

app.whenReady().then(async () => {
  try {
    await startPythonEngine();
  } catch (err) {
    reportStartupCrash(err instanceof Error ? err.stack || err.message : String(err));
    app.quit();
    return;
  }
  createWindow();

  // A dialog this early (before the window exists) isn't reliable on
  // every platform — shown here instead, once there's a real window to
  // anchor it to. Matches legacy's own recovery dialog, which likewise
  // fires 700ms after the main window opens rather than before it.
  if (pendingRecoveryNotice && mainWindow) {
    dialog.showMessageBox(mainWindow, {
      type: 'warning',
      title: 'Habit OS — data recovery',
      message: pendingRecoveryNotice,
      detail: `Backups are kept in:\n${getBackupDir()}`,
    });
  }

  // Registering the OS startup entry is a side effect of a stored
  // preference, not something the preference-setting UI is guaranteed
  // to re-trigger every launch (the toggle only fires on change) — so
  // launch itself has to re-assert whatever was last saved, in case the
  // OS entry was ever cleared out from under the app (e.g. a user
  // reinstall, or a Windows "clean startup" tool).
  awaitEngine()
    .then(() => fetch(`${BASE()}/api/settings`))
    .then((res) => res.json() as Promise<Record<string, unknown>>)
    .then((settings) => {
      syncLoginItem(Boolean(settings.start_with_windows));
      syncTitleBarTheme(settings.theme);
    })
    .catch((err) => console.error('startup settings sync failed:', err));

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Legacy's on_close stops every running task timer BEFORE saving
// (17359-17367), because quitting with one running "used to leave `end`
// as None forever ... and it inflated the task's session count for
// good."
//
// Not an accuracy fix: the idle cap runs from the last checkpoint and
// the scheduler checkpoints about once a minute, so an abrupt exit loses
// well under a minute of genuine work. The problem is that tick_task
// never auto-stops — a session left open by an abrupt exit is STILL open
// on the next launch, and startup reconciliation credits min(gap,
// idle_limit) where the gap is the whole time the app was closed. Quit
// overnight and the task banks a full idle limit of time nobody worked,
// and reads as still running. Closing the session on the way out is what
// prevents that; the reconciler stays as the safety net for a real
// crash, where nothing gets to run.
//
// Bounded and best-effort: shutdown must not hang on an engine that has
// already died or wedged, so a failure or a slow reply just proceeds to
// the kill.
let shutdownDone = false;

async function gracefulShutdown(): Promise<void> {
  if (shutdownDone) return;
  shutdownDone = true;
  if (!pythonProcess) return;
  try {
    await Promise.race([
      fetch(`${BASE()}/api/tasks/stop-all-timers`, { method: 'POST' }),
      new Promise((resolve) => setTimeout(resolve, 1500)),
    ]);
  } catch (err) {
    console.error('stop-all-timers on shutdown failed:', err);
  }
}

app.on('window-all-closed', async () => {
  await gracefulShutdown();
  pythonProcess?.kill();
  if (process.platform !== 'darwin') app.quit();
});

// before-quit fires for Cmd+Q and an OS-initiated quit, which
// window-all-closed does not. Quitting is deferred once so the stop can
// actually complete — without preventDefault the process is gone before
// the request lands. shutdownDone makes the second pass fall straight
// through, so this cannot loop.
app.on('before-quit', (e) => {
  if (!shutdownDone) {
    e.preventDefault();
    gracefulShutdown().finally(() => {
      pythonProcess?.kill();
      app.quit();
    });
    return;
  }
  pythonProcess?.kill();
});
