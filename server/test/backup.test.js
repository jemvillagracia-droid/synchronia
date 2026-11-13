import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'synchronia-backup-'));
process.env.SYNCHRONIA_DATA_DIR = tmp;
const { openDatabase } = await import('../src/db.js');
const { DatabaseSync } = await import('node:sqlite');
const { ensureOwner } = await import('../src/auth.js');
const repo = await import('../src/repo.js');
const b = await import('../src/backup.js');
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

test('database is opened for durable writes', () => {
  const db = openDatabase(path.join(tmp, 'durable.db'));
  assert.equal(db.prepare('PRAGMA synchronous').get().synchronous, 2, 'FULL');
  assert.equal(db.prepare('PRAGMA journal_mode').get().journal_mode, 'wal');
  assert.equal(b.integrity(db), 'ok');
  db.close();
});

test('backup → verify → scheduled restore brings back the earlier state, keeping a pre-restore copy', () => {
  const dir = path.join(tmp, 'r1'); fs.mkdirSync(dir);
  const file = path.join(dir, 'synchronia.db');
  let db = openDatabase(file);
  const { id: u } = ensureOwner(db);
  repo.create(db, u, 'awards', { title: 'Before backup' });
  const snap = b.backupNow(db, dir, 'manual');
  assert.match(snap.file, /^synchronia-\d{8}-\d{6}-manual\.db$/);
  assert.equal(b.verifyBackup(path.join(dir, 'backups', snap.file)).ok, true);
  repo.create(db, u, 'awards', { title: 'After backup' });
  assert.equal(db.prepare('SELECT COUNT(*) n FROM awards').get().n, 2);
  assert.throws(() => b.scheduleRestore(dir, '../../etc/passwd'), /backup file name/);
  b.scheduleRestore(dir, snap.file);
  db.close();
  const r = b.applyPendingRestore(dir, file);
  assert.deepEqual(r, { restored: true, file: snap.file });
  db = openDatabase(file);
  assert.deepEqual(db.prepare('SELECT title FROM awards').all().map((x) => x.title), ['Before backup']);
  assert.ok(b.listBackups(dir).some((x) => x.reason === 'pre-restore'), 'current state kept before restoring');
  db.close();
  assert.equal(b.applyPendingRestore(dir, file), null, 'restore applied once only');
});

test('a corrupt backup is refused', () => {
  const dir = path.join(tmp, 'r2'); fs.mkdirSync(path.join(dir, 'backups'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'backups', 'synchronia-20260101-000000-manual.db'), 'not a database');
  assert.throws(() => b.scheduleRestore(dir, 'synchronia-20260101-000000-manual.db'), /failed verification/);
});

test('automatic backups are pruned to the newest 15; manual ones are kept', () => {
  const dir = path.join(tmp, 'r3'); fs.mkdirSync(path.join(dir, 'backups'), { recursive: true });
  for (let i = 0; i < 20; i += 1) fs.writeFileSync(path.join(dir, 'backups', `synchronia-202601${String(i + 1).padStart(2, '0')}-000000-startup.db`), 'x');
  fs.writeFileSync(path.join(dir, 'backups', 'synchronia-20250101-000000-manual.db'), 'x');
  const db = openDatabase(path.join(dir, 'synchronia.db'));
  b.backupNow(db, dir, 'startup');
  const names = fs.readdirSync(path.join(dir, 'backups'));
  assert.equal(names.filter((n) => n.endsWith('-startup.db')).length, b.KEEP_AUTOMATIC);
  assert.ok(names.includes('synchronia-20250101-000000-manual.db'));
  assert.ok(!names.includes('synchronia-20260101-000000-startup.db'), 'oldest automatic removed');
  db.close();
});

test('a snapshot is taken before database updates are applied', () => {
  const dir = path.join(tmp, 'r4'); fs.mkdirSync(dir);
  const file = path.join(dir, 'synchronia.db');
  const d = new DatabaseSync(file);
  d.exec(fs.readFileSync(new URL('../migrations/001_foundation.sql', import.meta.url), 'utf8'));
  d.exec("CREATE TABLE schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT 'x'); INSERT INTO schema_migrations (name) VALUES ('001_foundation.sql');");
  d.close();
  const db = openDatabase(file);
  const pre = fs.readdirSync(path.join(dir, 'backups')).filter((n) => n.endsWith('-pre-update.db'));
  assert.equal(pre.length, 1);
  assert.equal(new DatabaseSync(path.join(dir, 'backups', pre[0]), { readOnly: true }).prepare('SELECT COUNT(*) n FROM schema_migrations').get().n, 1, 'snapshot is the pre-update state');
  db.close();
});
