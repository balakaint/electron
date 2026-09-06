import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import path from 'path';
import fs from 'fs';

const PYTHON_PORT = 5180;
let pythonProcess: ChildProcessWithoutNullStreams | null = null;
let mainWindow: BrowserWindow | null = null;

function getUserDataDir(): string {
  const dir = path.join(app.getPath('userData'), 'data');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
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
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, 'preload.js'),
    },
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
    return res.json();
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

app.whenReady().then(async () => {
  await startPythonEngine();
  createWindow();

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
