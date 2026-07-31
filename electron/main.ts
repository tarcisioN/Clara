import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

process.env.DIST = path.join(__dirname, '../dist');
process.env.VITE_PUBLIC = app.isPackaged
  ? process.env.DIST
  : path.join(process.env.DIST, '../public');

let mainWindow: BrowserWindow | null = null;

const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 960,
    height: 640,
    title: 'Clara',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: process.platform === 'darwin' ? { x: 14, y: 11 } : undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(process.env.DIST!, 'index.html'));
  }
}

app.whenReady().then(createWindow);

// Quit on every platform, including macOS: the window is the whole app, and in dev the
// Vite process only exits once Electron does.
app.on('window-all-closed', () => {
  app.quit();
});

ipcMain.handle('collection:open', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    title: 'Open Postman collection',
    properties: ['openFile'],
    filters: [
      { name: 'Postman Collection', extensions: ['json'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });

  if (result.canceled || result.filePaths.length === 0) {
    return { canceled: true as const };
  }

  const filePath = result.filePaths[0];
  const raw = await readFile(filePath, 'utf8');

  return {
    canceled: false as const,
    filePath,
    raw
  };
});

ipcMain.handle(
  'collection:save',
  async (_event, payload: { filePath: string; contents: string }) => {
    const { filePath, contents } = payload;
    if (!filePath || typeof contents !== 'string') {
      throw new Error('filePath and contents are required');
    }

    await writeFile(filePath, contents, 'utf8');
    return { ok: true as const, filePath };
  }
);
