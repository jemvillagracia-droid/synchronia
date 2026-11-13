// Starts the SYNCHRONIA API + client on the loopback interface. Used by the desktop app and by `npm run dev:server`.
import crypto from 'node:crypto';
import { openDatabase } from './db.js';
import { createApp } from './app.js';
import { rebuildSearchIndex } from './repo.js';
import { DB_PATH } from './config.js';

export async function startServer({ port = 0, host = '127.0.0.1', accessToken = crypto.randomBytes(32).toString('base64url'), pdfRenderer = null } = {}) {
  const db = openDatabase(DB_PATH);
  rebuildSearchIndex(db);
  const app = createApp(db, { accessToken, pdfRenderer });
  const server = await new Promise((resolve, reject) => {
    const s = app.listen(port, host, () => resolve(s));
    s.once('error', reject);
  });
  return {
    port: server.address().port,
    accessToken,
    dbPath: DB_PATH,
    close: () => new Promise((resolve) => server.close(() => { db.close(); resolve(); })),
  };
}
