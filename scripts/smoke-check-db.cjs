// Used by the release workflow after starting the built app: every migration must have applied inside Electron's own
// SQLite (which refuses some changes plain Node allows) and the database must pass its integrity check.
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const db = new DatabaseSync(process.argv[2], { readOnly: true });
const applied = db.prepare('SELECT COUNT(*) AS n FROM schema_migrations').get().n;
const wanted = fs.readdirSync(path.join(__dirname, '..', 'server', 'migrations')).filter((f) => /\.(sql|cjs)$/.test(f)).length;
const integrity = db.prepare('PRAGMA integrity_check').get().integrity_check;
console.log(`migrations applied: ${applied} of ${wanted}; integrity: ${integrity}`);
process.exit(applied === wanted && integrity === 'ok' ? 0 : 1);
