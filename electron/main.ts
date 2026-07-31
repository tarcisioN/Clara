import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  nativeImage,
  shell,
  type MenuItemConstructorOptions
} from 'electron';
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AppCommand } from './commands.ts';
import {
  CLARA_HOME,
  loadSession,
  saveSession,
  type SessionState
} from './session.ts';
import {
  checkNewman,
  installNewman,
  runNewmanCollection,
  type NewmanRunRequest
} from './newman.ts';
import { discoverGit, readCollectionAtRef } from './git.ts';
import {
  createEmptyCollection,
  serializeCollection,
  suggestCollectionFileName
} from '../src/postman/types.ts';
import { NEWMAN_DOCS_URL } from '../src/newman/missing.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

process.env.DIST = path.join(__dirname, '../dist');
process.env.VITE_PUBLIC = app.isPackaged
  ? process.env.DIST
  : path.join(process.env.DIST, '../public');

let mainWindow: BrowserWindow | null = null;

const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;

/** Menu bar / About name (dock label may still say Electron until the app is packaged). */
app.setName('Clara');

function resolveAppIconPath(): string | null {
  const candidates = [
    path.join(__dirname, '../resources/icon.png'),
    path.join(process.cwd(), 'resources/icon.png')
  ];
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

function sendCommand(command: AppCommand) {
  mainWindow?.webContents.send('app:command', command);
}

function buildMenu() {
  const isMac = process.platform === 'darwin';

  const template: MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' as const },
              { type: 'separator' as const },
              { role: 'services' as const },
              { type: 'separator' as const },
              { role: 'hide' as const },
              { role: 'hideOthers' as const },
              { role: 'unhide' as const },
              { type: 'separator' as const },
              { role: 'quit' as const }
            ]
          }
        ]
      : []),
    {
      label: 'File',
      submenu: [
        {
          label: 'New Collection…',
          accelerator: 'CmdOrCtrl+N',
          click: () => sendCommand({ type: 'new-collection' })
        },
        {
          label: 'Open Collections…',
          accelerator: 'CmdOrCtrl+O',
          click: () => sendCommand({ type: 'open' })
        },
        {
          label: 'Open Environment…',
          accelerator: 'CmdOrCtrl+Shift+O',
          click: () => sendCommand({ type: 'open-environment' })
        },
        {
          label: 'Save',
          accelerator: 'CmdOrCtrl+S',
          click: () => sendCommand({ type: 'save' })
        },
        {
          label: 'Send Request',
          accelerator: 'CmdOrCtrl+Enter',
          click: () => sendCommand({ type: 'send' })
        },
        { type: 'separator' },
        {
          label: 'Close Window',
          accelerator: 'CmdOrCtrl+Shift+W',
          role: 'close'
        },
        ...(isMac ? [] : [{ type: 'separator' as const }, { role: 'quit' as const }])
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
      ]
    },
    {
      label: 'Tabs',
      submenu: [
        {
          label: 'New Request',
          accelerator: 'CmdOrCtrl+T',
          click: () => sendCommand({ type: 'new-request' })
        },
        {
          label: 'Close Tab',
          accelerator: 'CmdOrCtrl+W',
          click: () => sendCommand({ type: 'close-tab' })
        },
        {
          label: 'Force Close Tab',
          accelerator: 'Alt+CmdOrCtrl+W',
          click: () => sendCommand({ type: 'force-close-tab' })
        },
        {
          label: 'Next Tab',
          accelerator: 'Ctrl+Tab',
          click: () => sendCommand({ type: 'next-tab' })
        },
        {
          label: 'Previous Tab',
          accelerator: 'Ctrl+Shift+Tab',
          click: () => sendCommand({ type: 'prev-tab' })
        },
        { type: 'separator' },
        ...Array.from({ length: 9 }, (_, index) => ({
          label: `Tab ${index + 1}`,
          accelerator: `CmdOrCtrl+${index + 1}`,
          click: () => sendCommand({ type: 'select-tab', index })
        }))
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        {
          label: 'Next Change',
          accelerator: 'Alt+CmdOrCtrl+]',
          click: () => sendCommand({ type: 'next-change' })
        },
        {
          label: 'Previous Change',
          accelerator: 'Alt+CmdOrCtrl+[',
          click: () => sendCommand({ type: 'prev-change' })
        },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      role: 'window',
      submenu: [{ role: 'minimize' }, { role: 'zoom' }, ...(isMac ? [{ type: 'separator' as const }, { role: 'front' as const }] : [])]
    }
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow() {
  const iconPath = resolveAppIconPath();
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 720,
    title: 'Clara',
    ...(iconPath ? { icon: iconPath } : {}),
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

app.whenReady().then(() => {
  const iconPath = resolveAppIconPath();
  if (process.platform === 'darwin' && iconPath) {
    const image = nativeImage.createFromPath(iconPath);
    if (!image.isEmpty()) {
      app.dock?.setIcon(image);
    }
  }

  buildMenu();
  createWindow();
});

// Quit on every platform, including macOS: the window is the whole app, and in dev the
// Vite process only exits once Electron does.
app.on('window-all-closed', () => {
  app.quit();
});

ipcMain.handle('collection:open', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    title: 'Open Postman collection(s)',
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Postman Collection', extensions: ['json'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });

  if (result.canceled || result.filePaths.length === 0) {
    return { canceled: true as const };
  }

  const files = await Promise.all(
    result.filePaths.map(async (filePath) => ({
      filePath,
      raw: await readFile(filePath, 'utf8')
    }))
  );

  return {
    canceled: false as const,
    files
  };
});

ipcMain.handle(
  'collection:create',
  async (_event, payload: { name?: string } | undefined) => {
    const name =
      typeof payload?.name === 'string' && payload.name.trim()
        ? payload.name.trim()
        : 'New Collection';
    const suggested = suggestCollectionFileName(name);
    const result = await dialog.showSaveDialog(mainWindow!, {
      title: 'Create Postman collection',
      defaultPath: suggested,
      filters: [
        { name: 'Postman Collection', extensions: ['json'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });

    if (result.canceled || !result.filePath) {
      return { canceled: true as const };
    }

    let filePath = result.filePath;
    if (!/\.json$/i.test(filePath)) {
      filePath = `${filePath}.postman_collection.json`;
    }

    const collection = createEmptyCollection(name);
    const raw = serializeCollection(collection);
    await writeFile(filePath, raw, 'utf8');
    return {
      canceled: false as const,
      filePath,
      raw
    };
  }
);

ipcMain.handle('collection:read', async (_event, filePath: string) => {
  if (!filePath || typeof filePath !== 'string') {
    throw new Error('filePath is required');
  }
  const raw = await readFile(filePath, 'utf8');
  return { filePath, raw };
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

ipcMain.handle('environment:open', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    title: 'Open Postman environment(s)',
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Postman Environment', extensions: ['json'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });

  if (result.canceled || result.filePaths.length === 0) {
    return { canceled: true as const };
  }

  const files = await Promise.all(
    result.filePaths.map(async (filePath) => ({
      filePath,
      raw: await readFile(filePath, 'utf8')
    }))
  );

  return {
    canceled: false as const,
    files
  };
});

ipcMain.handle('environment:read', async (_event, filePath: string) => {
  if (!filePath || typeof filePath !== 'string') {
    throw new Error('filePath is required');
  }
  const raw = await readFile(filePath, 'utf8');
  return { filePath, raw };
});

ipcMain.handle(
  'environment:save',
  async (_event, payload: { filePath: string; contents: string }) => {
    const { filePath, contents } = payload;
    if (!filePath || typeof contents !== 'string') {
      throw new Error('filePath and contents are required');
    }

    await writeFile(filePath, contents, 'utf8');
    return { ok: true as const, filePath };
  }
);

ipcMain.handle('session:load', async () => loadSession());

ipcMain.handle('session:save', async (_event, state: SessionState) => saveSession(state));

ipcMain.handle('session:home', async () => CLARA_HOME);

ipcMain.handle('newman:run', async (_event, payload: NewmanRunRequest) =>
  runNewmanCollection(payload)
);

ipcMain.handle('newman:check', async () => checkNewman());

ipcMain.handle('newman:install', async () => installNewman());

ipcMain.handle('shell:openExternal', async (_event, url: string) => {
  if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
    throw new Error('Only http(s) URLs can be opened');
  }
  // Allow Newman docs + npm pages; keep the surface narrow.
  const allowed =
    url === NEWMAN_DOCS_URL ||
    url.startsWith('https://learning.postman.com/') ||
    url.startsWith('https://www.npmjs.com/');
  if (!allowed) {
    throw new Error('URL not allowed');
  }
  await shell.openExternal(url);
  return { ok: true as const };
});

ipcMain.handle('git:discover', async (_event, collectionPath: string) =>
  discoverGit(collectionPath)
);

ipcMain.handle(
  'git:readAtRef',
  async (_event, payload: { collectionPath: string; ref: string }) => {
    if (!payload?.collectionPath || typeof payload.collectionPath !== 'string') {
      throw new Error('collectionPath is required');
    }
    if (!payload?.ref || typeof payload.ref !== 'string') {
      throw new Error('ref is required');
    }
    return readCollectionAtRef(payload.collectionPath, payload.ref);
  }
);
