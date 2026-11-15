// SYNCHRONIA desktop shell (Electron).
// Starts the local data service on the loopback interface with a fresh access key, then opens the app window.
import { app, BrowserWindow, Menu, Notification, dialog, ipcMain, session, shell } from 'electron';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPdfRenderer } from './pdf.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const isDev = !app.isPackaged;
const DEV_URL = process.env.SYNCHRONIA_DEV_URL; // Vite dev server during development

app.setName('SYNCHRONIA');
app.setAppUserModelId('app.synchronia.desktop');

// Portable copy (the ZIP): a "portable.txt" beside SYNCHRONIA.exe keeps everything (records, backups, settings and
// window state) in a "SYNCHRONIA Data" folder next to the program instead of %APPDATA%, so the folder can be carried
// on a USB drive. The installer never ships that file. Set before anything reads userData (including the
// single-instance lock, which lives there).
const exeDir = path.dirname(process.execPath);
const PORTABLE = app.isPackaged && fs.existsSync(path.join(exeDir, 'portable.txt'));
if (PORTABLE) app.setPath('userData', path.join(exeDir, 'SYNCHRONIA Data'));

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  const dataDir = process.env.SYNCHRONIA_DATA_DIR || path.join(app.getPath('userData'), 'data');
  process.env.SYNCHRONIA_DATA_DIR = dataDir; // must be set before the server modules load
  fs.mkdirSync(dataDir, { recursive: true });

  let win = null;
  let service = null;
  let pdfRenderer = null;
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
  // Evidence and file references open documents with their usual app. Programs and scripts are never launched from
  // here, even if a reference points at one.
  const NEVER_OPEN = /\.(exe|com|bat|cmd|ps1|psm1|vbs|vbe|js|jse|wsf|wsh|msi|msp|scr|pif|lnk|url|hta|cpl|jar|reg|application|appref-ms|scf|inf|sys|dll|ocx)$/i;
  ipcMain.handle('synchronia:open-path', async (_e, p) => {
    if (typeof p !== 'string' || !path.isAbsolute(p)) return 'Not a valid file location';
    if (p.startsWith('\\\\')) return 'Network locations are not opened directly. Map the shared folder to a drive letter, then link the file from there.';
    if (!fs.existsSync(p)) return 'The file is no longer at that location';
    let st;
    try { st = fs.statSync(p); } catch { return 'The file cannot be read'; }
    if (!st.isFile() && !st.isDirectory()) return 'Not a regular file';
    if (st.isFile() && NEVER_OPEN.test(p)) return 'For your safety, SYNCHRONIA does not open programs or scripts. Use Show in folder instead.';
    return shell.openPath(p); // '' on success, otherwise an error message
  });
  ipcMain.handle('synchronia:open-external', async (_e, url) => {
    if (typeof url === 'string' && /^https?:\/\//i.test(url)) await shell.openExternal(url);
  });
  ipcMain.handle('synchronia:show-data-folder', () => shell.openPath(dataDir));
  // Editing commands for toolbar buttons (Cut, Copy, Paste, Paste as plain text, Select all): the same native
  // actions as the keyboard shortcuts, so pictures and formatted text from the clipboard paste exactly as with Ctrl+V.
  const EDIT = new Set(['cut', 'copy', 'paste', 'pasteAndMatchStyle', 'selectAll', 'undo', 'redo', 'delete']);
  // System Timer alerts as Windows notifications (shown even when SYNCHRONIA is behind other windows).
  ipcMain.handle('synchronia:notify', (_e, title, body) => {
    if (!Notification.isSupported()) return false;
    const n = new Notification({ title: String(title).slice(0, 120), body: String(body).slice(0, 300), silent: false });
    n.on('click', () => { if (win && !win.isDestroyed()) { if (win.isMinimized()) win.restore(); win.focus(); } });
    n.show();
    return true;
  });
  ipcMain.handle('synchronia:edit', (e, action) => { if (EDIT.has(action)) e.sender[action](); });
  ipcMain.handle('synchronia:relaunch', () => { app.relaunch(); app.quit(); });
  ipcMain.handle('synchronia:show-item', (_e, p) => {
    if (typeof p === 'string' && path.isAbsolute(p) && fs.existsSync(p)) shell.showItemInFolder(p);
  });

  // Every download (CV exports, JSON export) goes through a native Save dialog that starts in Documents\SYNCHRONIA,
  // and the window is told where the file landed so it can offer Open / Show in folder.
  const FILTERS = {
    pdf: [{ name: 'PDF document', extensions: ['pdf'] }],
    docx: [{ name: 'Word document', extensions: ['docx'] }],
    json: [{ name: 'JSON data', extensions: ['json'] }],
    xlsx: [{ name: 'Excel workbook', extensions: ['xlsx'] }],
    zip: [{ name: 'ZIP archive', extensions: ['zip'] }],
    db: [{ name: 'SYNCHRONIA backup', extensions: ['db'] }],
  };
  function handleDownloads() {
    session.defaultSession.on('will-download', (_e, item) => {
      const name = item.getFilename();
      const ext = path.extname(name).slice(1).toLowerCase();
      const folder = path.join(app.getPath('documents'), 'SYNCHRONIA');
      try { fs.mkdirSync(folder, { recursive: true }); } catch { /* fall back to the dialog's default */ }
      // SYNCHRONIA_DOWNLOAD_DIR (automated tests only): save there without asking.
      const auto = process.env.SYNCHRONIA_DOWNLOAD_DIR;
      const target = auto ? path.join(auto, name) : dialog.showSaveDialogSync(win, {
        title: 'Save exported file', defaultPath: path.join(folder, name),
        filters: [...(FILTERS[ext] || []), { name: 'All files', extensions: ['*'] }],
      });
      if (!target) {
        item.cancel();
        win?.webContents.send('synchronia:download', { state: 'cancelled', name });
        return;
      }
      item.setSavePath(target);
      item.once('done', (_ev, state) => win?.webContents.send('synchronia:download', { state, name, path: target }));
    });
  }
  ipcMain.on('synchronia:info', (e) => { e.returnValue = { version: app.getVersion(), dataDir, platform: process.platform }; });

  async function createWindow() {
    // Development: the client comes from Vite (which proxies /api to port 4317); production: a random port.
    const token = DEV_URL ? process.env.SYNCHRONIA_ACCESS_TOKEN : crypto.randomBytes(32).toString('base64url');
    const { startServer } = await import('../server/src/server.js');
    pdfRenderer = createPdfRenderer();
    service = await startServer({ port: DEV_URL ? 4317 : 0, host: '127.0.0.1', accessToken: token, pdfRenderer });
    const origin = DEV_URL || `http://127.0.0.1:${service.port}`;

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

    // Window shortcuts. There is no menu bar, so these are handled here; editing keys (Ctrl+C/X/V/A/Z/Y) are Chromium's own.
    win.webContents.on('before-input-event', (e, input) => {
      if (input.type !== 'keyDown') return;
      const ctrl = input.control || input.meta; const wc = win.webContents; const k = input.key;
      if (ctrl && !input.alt && (k === '=' || k === '+' || input.code === 'NumpadAdd')) { e.preventDefault(); wc.setZoomLevel(Math.min(wc.getZoomLevel() + 0.5, 4)); }
      else if (ctrl && !input.alt && (k === '-' || k === '_' || input.code === 'NumpadSubtract')) { e.preventDefault(); wc.setZoomLevel(Math.max(wc.getZoomLevel() - 0.5, -3)); }
      else if (ctrl && !input.alt && (k === '0' || input.code === 'Numpad0')) { e.preventDefault(); wc.setZoomLevel(0); }
      else if (k === 'F11' && !ctrl) { e.preventDefault(); win.setFullScreen(!win.isFullScreen()); }
    });
    win.once('ready-to-show', () => win.show());
    // An editor with unsaved changes blocks closing; ask what to do instead of discarding silently.
    win.webContents.on('will-prevent-unload', (e) => {
      const choice = dialog.showMessageBoxSync(win, {
        type: 'warning', buttons: ['Stay and save', 'Close without saving'], defaultId: 0, cancelId: 0,
        title: 'Unsaved changes', message: 'Some changes have not been saved yet.',
        detail: 'Stay to let SYNCHRONIA finish saving, or close and discard the unsaved changes.',
      });
      if (choice === 1) e.preventDefault();
    });
    win.on('close', saveState);
    win.on('closed', () => { win = null; app.quit(); }); // the hidden print window must not keep the app alive

    await win.loadURL(`${origin}/api/open?token=${encodeURIComponent(token)}&next=/`);
  }

  // Deny every permission (camera, microphone, location, notifications, clipboard read, …) in every session,
  // including the hidden PDF window. SYNCHRONIA needs none of them.
  app.on('session-created', (ses) => {
    // Only full screen (for the System Timer) is allowed; every other permission stays denied.
    ses.setPermissionRequestHandler((_wc, permission, callback) => callback(permission === 'fullscreen'));
    ses.setPermissionCheckHandler((_wc, permission) => permission === 'fullscreen');
  });
  app.whenReady().then(async () => {
    for (const ses of [session.defaultSession]) { ses.setPermissionRequestHandler((_wc, p, cb) => cb(p === 'fullscreen')); ses.setPermissionCheckHandler((_wc, p) => p === 'fullscreen'); }
    if (!isDev) Menu.setApplicationMenu(null);
    handleDownloads();
    try {
      await createWindow();
    } catch (err) {
      dialog.showErrorBox('SYNCHRONIA could not start', String(err?.stack || err));
      app.quit();
    }
  });

  app.on('window-all-closed', () => app.quit());
  let cleaned = false;
  app.on('before-quit', (e) => {
    if (cleaned) return;
    e.preventDefault();
    cleaned = true;
    pdfRenderer?.dispose();
    Promise.resolve(service?.close()).catch(() => {}).finally(() => app.quit());
  });
}
