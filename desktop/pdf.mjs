// Prints CV HTML to a text-based, tagged PDF with Electron's Chromium (offscreen, JavaScript disabled).
import { BrowserWindow } from 'electron';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export function createPdfRenderer() {
  let win = null;
  let queue = Promise.resolve();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'synchronia-print-'));

  const getWindow = () => {
    if (win && !win.isDestroyed()) return win;
    win = new BrowserWindow({
      show: false, width: 900, height: 1200,
      webPreferences: { partition: 'synchronia-print', javascript: false, sandbox: true, contextIsolation: true, nodeIntegration: false, offscreen: false, spellcheck: false },
    });
    // Isolated session: the print window only ever shows local CV HTML; block every network request.
    win.webContents.session.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (_d, cb) => cb({ cancel: true }));
    return win;
  };

  const render = async (html, { footerTemplate }) => {
    const w = getWindow();
    const file = path.join(dir, `${crypto.randomUUID()}.html`);
    fs.writeFileSync(file, html);
    try {
      await w.loadFile(file);
      return await w.webContents.printToPDF({
        preferCSSPageSize: true,
        printBackground: true,
        generateTaggedPDF: true,
        displayHeaderFooter: !!footerTemplate,
        headerTemplate: '<span></span>',
        footerTemplate: footerTemplate || '<span></span>',
      });
    } finally {
      fs.rm(file, { force: true }, () => {});
    }
  };

  // Serialize print jobs; one failure must not block the next.
  const renderer = (html, opts = {}) => {
    const job = queue.then(() => render(html, opts));
    queue = job.catch(() => {});
    return job;
  };
  renderer.dispose = () => { if (win && !win.isDestroyed()) win.destroy(); fs.rmSync(dir, { recursive: true, force: true }); };
  return renderer;
}
