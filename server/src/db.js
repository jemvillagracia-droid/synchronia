import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { ROOT } from './config.js';

const MIGRATIONS_DIR = path.join(ROOT, 'server', 'migrations');

/** Open (and migrate) a database. Pass ':memory:' for tests. */
export function openDatabase(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA foreign_keys = ON;');
  if (file !== ':memory:') db.exec('PRAGMA journal_mode = WAL;');
  // FULL: every committed change is on disk before the API reports success (survives power loss).
  db.exec('PRAGMA synchronous = FULL;');
  db.exec('PRAGMA busy_timeout = 5000;');
  migrate(db, file);
  return db;
}

function migrate(db, file = ':memory:') {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  )`);
  const applied = new Set(db.prepare('SELECT name FROM schema_migrations').all().map((r) => r.name));
  const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
  const pending = files.filter((f) => !applied.has(f));
  // Before changing the structure of an existing database, keep a snapshot of it.
  if (pending.length && applied.size && file !== ':memory:') {
    const dir = path.join(path.dirname(file), 'backups');
    fs.mkdirSync(dir, { recursive: true });
    const d = new Date(); const p2 = (n) => String(n).padStart(2, '0');
    const name = `synchronia-${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}-pre-update.db`;
    db.exec(`VACUUM INTO '${path.join(dir, name).replace(/'/g, "''")}'`);
  }
  for (const f of files) {
    if (applied.has(f)) continue;
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, f), 'utf8');
    db.exec('BEGIN');
    try {
      db.exec(sql);
      db.prepare('INSERT INTO schema_migrations (name) VALUES (?)').run(f);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw new Error(`Migration ${f} failed: ${err.message}`);
    }
  }
}

/** Run fn inside a transaction. */
const depth = new WeakMap();
/** Run fn atomically. Nested calls use savepoints, so an outer transaction can group several record writes. */
export function tx(db, fn) {
  const d = depth.get(db) || 0;
  const sp = `sp_${d}`;
  db.exec(d ? `SAVEPOINT ${sp}` : 'BEGIN');
  depth.set(db, d + 1);
  try {
    const out = fn();
    db.exec(d ? `RELEASE ${sp}` : 'COMMIT');
    return out;
  } catch (err) {
    db.exec(d ? `ROLLBACK TO ${sp}; RELEASE ${sp}` : 'ROLLBACK');
    throw err;
  } finally {
    depth.set(db, d);
  }
}
