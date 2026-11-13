// Starts the SYNCHRONIA API + client on the loopback interface. Used by the desktop app and by `npm run dev:server`.
import crypto from 'node:crypto';
import path from 'node:path';
import { openDatabase } from './db.js';
import { createApp } from './app.js';
import { rebuildSearchIndex } from './repo.js';
import { DB_PATH } from './config.js';
import { applyPendingRestore, backupNow, integrity } from './backup.js';

const SIX_HOURS = 6 * 3600 * 1000;

export async function startServer({ port = 0, host = '127.0.0.1', accessToken = crypto.randomBytes(32).toString('base64url'), pdfRenderer = null } = {}) {
  const dataDir = path.dirname(DB_PATH);
  const restore = applyPendingRestore(dataDir, DB_PATH);
  const db = openDatabase(DB_PATH);
  const health = { integrity: integrity(db), restore, last_backup: null };
  rebuildSearchIndex(db);
  // Automatic backups: at every start (when there is data) and every six hours while the app is open.
  const auto = (reason) => {
    try {
      if (db.prepare('SELECT COUNT(*) n FROM users').get().n) health.last_backup = backupNow(db, dataDir, reason);
    } catch (e) { health.backup_error = e.message; }
  };
  if (health.integrity === 'ok') auto('startup');
  const timer = setInterval(() => auto('scheduled'), SIX_HOURS);
  timer.unref?.();
  const app = createApp(db, { accessToken, pdfRenderer, dataDir, health });
  const server = await new Promise((resolve, reject) => {
    const s = app.listen(port, host, () => resolve(s));
    s.once('error', reject);
  });
  return {
    port: server.address().port,
    accessToken,
    dbPath: DB_PATH,
    health,
    close: () => new Promise((resolve) => server.close(() => { clearInterval(timer); db.close(); resolve(); })),
  };
}
