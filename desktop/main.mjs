// SYNCHRONIA desktop shell (Electron).
// Starts the local data service on the loopback interface with a fresh access key, then opens the app window.
import { app, BrowserWindow, Menu, dialog, ipcMain, shell } from 'electron';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const isDev = !app.isPackaged;
const DEV_URL = process.env.SYNCHRONIA_DEV_URL; // Vite dev server during development

app.setName('SYNCHRONIA');
app.setAppUserModelId('app.synchronia.desktop');

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  const dataDir = process.env.SYNCHRONIA_DATA_DIR || path.join(app.getPath('userData'), 'data');
  process.env.SYNCHRONIA_DATA_DIR = dataDir; // must be set before the server modules load
  fs.mkdirSync(dataDir, { recursive: true });

  let win = null;
  let service = null;
  const stateFile = path.join(app.getPath('userData'), 'window-state.json');

  const readState = () => { try { return JSON.parse(fs.readFileSync(stateFile, 'utf8')); } catch { return {}; } };
  const saveState = () => {
    if (!win || win.isDestroyed()) return;
    try { fs.writeFileSync(stateFile, JSON.stringify({ ...win.getNormalBounds(), maximized: win.isMaximized() })); } catch { /* non-fatal */ }
  };

  app.on('second-instance', () => {
    if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
  });

  // ── Native capabilities exposed to the window (see preload.cjs) ──
  ipcMain.handle('synchronia:pick-file', async () => {
    const res = await dialog.showOpenDialog(win, {
      title: 'Choose supporting evidence',
      properties: ['openFile'],
      filters: [
        { name: 'Documents and images', extensions: ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'jpg', 'jpeg', 'png', 'webp', 'txt'] },
        { name: 'All files', extensions: ['*'] },
      ],
    });
    return res.canceled ? null : res.filePaths[0];
  });
  ipcMain.handle('synchronia:open-path', async (_e, p) => {
    if (typeof p !== 'string' || !path.isAbsolute(p)) return 'Not a valid file location';
    if (!fs.existsSync(p)) return 'The file is no longer at that location';
    return shell.openPath(p); // '' on success, otherwise an error message
  });
  ipcMain.handle('synchronia:open-external', async (_e, url) => {
    if (typeof url === 'string' && /^https?:\/\//i.test(url)) await shell.openExternal(url);
  });
  ipcMain.handle('synchronia:show-data-folder', () => shell.openPath(dataDir));
  ipcMain.on('synchronia:info', (e) => { e.returnValue = { version: app.getVersion(), dataDir, platform: process.platform }; });

  async function createWindow() {
    const accessToken = crypto.randomBytes(32).toString('base64url');
    let origin;
    if (DEV_URL) {
      // Development: the API runs separately (npm run dev:server) with a fixed token; the client comes from Vite.
      origin = DEV_URL;
    } else {
      const { startServer } = await import('../server/src/server.js');
      service = await startServer({ port: 0, host: '127.0.0.1', accessToken });
      origin = `http://127.0.0.1:${service.port}`;
    }
    const token = DEV_URL ? process.env.SYNCHRONIA_ACCESS_TOKEN : accessToken;

    const state = readState();
    win = new BrowserWindow({
      width: state.width || 1440,
      height: state.height || 920,
      x: state.x,
      y: state.y,
      minWidth: 900,
      minHeight: 600,
      show: false,
      title: 'SYNCHRONIA',
      backgroundColor: '#08080a',
      icon: path.join(here, 'icon.png'),
      titleBarStyle: 'hidden',
      titleBarOverlay: { color: '#0b0b0e', symbolColor: '#a7a3ad', height: 56 },
      webPreferences: {
        preload: path.join(here, 'preload.cjs'),
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
        spellcheck: true,
        devTools: isDev,
      },
    });
    if (state.maximized) win.maximize();

    // Keep the window on SYNCHRONIA; send any other link to the default browser.
    const sameOrigin = (url) => { try { return new URL(url).origin === new URL(origin).origin; } catch { return false; } };
    win.webContents.setWindowOpenHandler(({ url }) => {
      if (/^https?:\/\//i.test(url)) shell.openExternal(url);
      return { action: 'deny' };
    });
    win.webContents.on('will-navigate', (e, url) => {
      if (!sameOrigin(url)) { e.preventDefault(); if (/^https?:\/\//i.test(url)) shell.openExternal(url); }
    });

    win.once('ready-to-show', () => win.show());
    win.on('close', saveState);
    win.on('closed', () => { win = null; });

    await win.loadURL(`${origin}/api/open?token=${encodeURIComponent(token)}&next=/`);
  }

  app.whenReady().then(async () => {
    if (!isDev) Menu.setApplicationMenu(null);
    try {
      await createWindow();
    } catch (err) {
      dialog.showErrorBox('SYNCHRONIA could not start', String(err?.stack || err));
      app.quit();
    }
  });

  app.on('window-all-closed', async () => {
    if (service) await service.close().catch(() => {});
    app.quit();
  });
}
