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
}

function getWindowStatePath(): string {
  return path.join(app.getPath('userData'), 'window-state.json');
}

function loadWindowState(): WindowState {
  try {
    return JSON.parse(fs.readFileSync(getWindowStatePath(), 'utf-8'));
  } catch {
    return { width: 1200, height: 800, maximized: false };
  }
}

function saveWindowState(win: BrowserWindow) {
  const bounds = win.getBounds();
  const state: WindowState = { ...bounds, maximized: win.isMaximized() };
  try {
    fs.writeFileSync(getWindowStatePath(), JSON.stringify(state));
  } catch (err) {
    console.error('window state save failed:', err);
  }
}

let pendingRecoveryNotice: string | null = null;

function startPythonEngine(): Promise<void> {
  return new Promise((resolve, reject) => {
    const isDev = !app.isPackaged;
    const dbPath = path.join(getUserDataDir(), 'app.db');

    pendingRecoveryNotice = recoverDatabaseIfNeeded(dbPath);

    const venvPython = path.join(__dirname, '../../python/.venv/bin/python');
    const command = isDev
      ? (fs.existsSync(venvPython) ? venvPython : 'python3')
      : path.join(process.resourcesPath, 'engine', 'engine');
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
      if (!started) reject(err);
    });
    pythonProcess.on('exit', (code) => {
      console.error(`Python engine exited with code ${code}`);
      // A crash BEFORE ever reaching READY means the app has no engine
      // to talk to and never will — matches legacy's own startup
      // exception handler, which treats "failed before the main loop
      // opened" as fatal rather than something to quietly retry.
      if (!started) {
        reject(new Error(`Python engine exited with code ${code} before starting:\n\n${stderrLog}`));
      }
    });

    // Fail-safe: don't hang forever if the READY marker is missed.
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
  const state = loadWindowState();
  mainWindow = new BrowserWindow({
    width: state.width,
    height: state.height,
    x: state.x,
    y: state.y,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });
  if (state.maximized) mainWindow.maximize();

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
// manual HWND/DwmSetWindowAttribute plumbing. Keep in sync with
// renderer/src/themes.ts's palette: energy is the port's one light
// theme, the rest are dark.
const DARK_THEMES = new Set(['focus', 'warroom', 'journey']);

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
const COMPACT_WIDTH = 420;

// The bounds to return to when leaving compact. Held in memory only:
// window-state.json already persists what the user last had, and
// writing an interim "restore point" to disk would fight it.
let preCompactBounds: Electron.Rectangle | null = null;

function applyPanelLayout(layout: 'full' | 'compact') {
  const win = mainWindow;
  if (!win || win.isDestroyed()) return;

  if (layout === 'compact') {
    if (preCompactBounds === null) preCompactBounds = win.getBounds();
    if (win.isMaximized()) win.unmaximize();
    // getDisplayMatching, not getPrimaryDisplay: this is Electron's
    // equivalent of legacy's MonitorFromPoint fix. The primary display's
    // work area is the wrong rectangle the moment the window has been
    // dragged to a second monitor, and the symptom — docking to the
    // wrong screen, or the taskbar overlapping the bottom — is
    // confusing enough that legacy left a paragraph about it.
    const wa = screen.getDisplayMatching(win.getBounds()).workArea;
    win.setBounds({
      x: wa.x + wa.width - COMPACT_WIDTH,
      y: wa.y,
      width: COMPACT_WIDTH,
      height: wa.height,
    });
  } else if (preCompactBounds) {
    win.setBounds(preCompactBounds);
    preCompactBounds = null;
  }
}

ipcMain.handle('set-panel-layout', async (_, layout: 'full' | 'compact') => {
  applyPanelLayout(layout);
  return { ok: true };
});

ipcMain.handle('health-check', async () => {
  const res = await fetch(`${BASE()}/health`);
  return res.json();
});

ipcMain.handle(
  'api-request',
  async (_, { method, path: reqPath, body }: { method: string; path: string; body?: unknown }) => {
    if (!ALLOWED_METHODS.has(method) || !reqPath.startsWith('/api/')) {
      throw new Error(`Blocked request: ${method} ${reqPath}`);
    }
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
    for (const f of files) {
      fs.writeFileSync(path.join(folder, f.filename), f.content, 'utf-8');
    }
    return { ok: true, folder, filenames: files.map((f) => f.filename) };
  },
);

// Matches legacy's _ba_attach_pick/_ba_attach_open: the BA "attach a
// Word/Excel/CSV file" control only ever stores a filesystem PATH, not
// the file's contents — the renderer can't touch the filesystem
// directly (same contextIsolation reasoning as export-save), so
// picking a path and opening it with the OS's own default handler both
// need a main-process round trip.
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
  fetch(`${BASE()}/api/settings`)
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

app.on('window-all-closed', () => {
  pythonProcess?.kill();
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  pythonProcess?.kill();
});
