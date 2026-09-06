import { app, BrowserWindow, dialog, ipcMain, Menu, nativeTheme, shell } from 'electron';
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

function startPythonEngine(): Promise<void> {
  return new Promise((resolve, reject) => {
    const isDev = !app.isPackaged;
    const dbPath = path.join(getUserDataDir(), 'app.db');

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
    const onReady = (data: Buffer) => {
      const msg = data.toString();
      process.stdout.write(`[python] ${msg}`);
      if (!started && msg.includes('READY')) {
        started = true;
        resolve();
      }
    };

    pythonProcess.stdout.on('data', onReady);
    pythonProcess.stderr.on('data', (data) => process.stderr.write(`[python:err] ${data}`));
    pythonProcess.on('error', reject);
    pythonProcess.on('exit', (code) => {
      console.error(`Python engine exited with code ${code}`);
    });

    // Fail-safe: don't hang forever if the READY marker is missed.
    setTimeout(() => {
      if (!started) {
        started = true;
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

app.whenReady().then(async () => {
  await startPythonEngine();
  createWindow();

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
