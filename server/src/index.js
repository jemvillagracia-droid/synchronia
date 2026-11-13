import { openDatabase } from './db.js';
import { createApp } from './app.js';
import { rebuildSearchIndex } from './repo.js';
import { DB_PATH, PORT, APP_NAME, APP_TAGLINE } from './config.js';

const db = openDatabase(DB_PATH);
rebuildSearchIndex(db);
const app = createApp(db);

const host = process.env.HOST || '127.0.0.1';
const server = app.listen(PORT, host, () => {
  console.log(`${APP_NAME} — ${APP_TAGLINE}`);
  console.log(`API listening on http://${host}:${PORT}  (database: ${DB_PATH})`);
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => server.close(() => { db.close(); process.exit(0); }));
}
