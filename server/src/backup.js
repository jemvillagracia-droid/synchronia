// Save-path safety: durable writes, integrity checks, automatic backups and verified restores.
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { HttpError } from './repo.js';

export const KEEP_AUTOMATIC = 15;
const NAME_RE = /^synchronia-(\d{8}-\d{6})-(startup|scheduled|manual|pre-update|pre-restore)\.db$/;

export const backupDir = (dataDir) => path.join(dataDir, 'backups');
const stamp = () => { const d = new Date(); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`; };

/** Quick structural check of an open database. Returns 'ok' or the first problem found. */
export function integrity(db) {
  const rows = db.prepare('PRAGMA quick_check').all();
  const msg = rows.map((r) => Object.values(r)[0]).join('; ');
  return msg === 'ok' ? 'ok' : msg || 'unknown';
}

/** Write a consistent snapshot with VACUUM INTO (safe while the app is running). */
export function backupNow(db, dataDir, reason = 'manual') {
  const dir = backupDir(dataDir);
  fs.mkdirSync(dir, { recursive: true });
  let name = `synchronia-${stamp()}-${reason}.db`;
  for (let i = 1; fs.existsSync(path.join(dir, name)); i += 1) name = `synchronia-${stamp()}-${reason}.db`.replace('.db', `-${i}.db`);
  const file = path.join(dir, name);
  db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
  prune(dir);
  return describe(file);
}

function describe(file) {
  const st = fs.statSync(file);
  const m = NAME_RE.exec(path.basename(file));
  return { file: path.basename(file), reason: m ? m[2] : 'manual', at: st.mtime.toISOString(), size_bytes: st.size };
}

/** Keep the newest KEEP_AUTOMATIC automatic backups; manual and safety backups are kept until deleted by the user. */
function prune(dir) {
  const auto = fs.readdirSync(dir).filter((f) => /-(startup|scheduled)\.db$/.test(f)).sort().reverse();
  for (const f of auto.slice(KEEP_AUTOMATIC)) fs.rmSync(path.join(dir, f), { force: true });
}

export function listBackups(dataDir) {
  const dir = backupDir(dataDir);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith('.db')).map((f) => describe(path.join(dir, f))).sort((a, b) => b.at.localeCompare(a.at));
}

/** Verify a backup can be opened and belongs to SYNCHRONIA before it is ever restored. */
export function verifyBackup(file) {
  let d;
  try {
    d = new DatabaseSync(file, { readOnly: true });
    const ok = integrity(d);
    const migrations = d.prepare('SELECT COUNT(*) n FROM schema_migrations').get().n;
    const users = d.prepare('SELECT COUNT(*) n FROM users').get().n;
    return { ok: ok === 'ok' && migrations > 0, integrity: ok, migrations, users };
  } catch (e) {
    return { ok: false, integrity: e.message };
  } finally { d?.close(); }
}

/** Schedule a restore; it is applied before the database is opened on the next start. */
export function scheduleRestore(dataDir, name) {
  if (!NAME_RE.test(name) && !/^synchronia-[\w-]+\.db$/.test(name)) throw new HttpError(422, 'Not a SYNCHRONIA backup file name');
  const file = path.join(backupDir(dataDir), path.basename(name));
  if (!fs.existsSync(file)) throw new HttpError(404, 'Backup not found');
  const v = verifyBackup(file);
  if (!v.ok) throw new HttpError(422, `This backup failed verification (${v.integrity}). It will not be restored.`);
  fs.writeFileSync(path.join(dataDir, 'restore-pending.json'), JSON.stringify({ file: path.basename(file), requested_at: new Date().toISOString() }));
  return { scheduled: path.basename(file), ...v };
}

/** Called before opening the database: swap in a scheduled backup, keeping a copy of the current file. */
export function applyPendingRestore(dataDir, dbPath) {
  const flag = path.join(dataDir, 'restore-pending.json');
  if (!fs.existsSync(flag)) return null;
  const { file } = JSON.parse(fs.readFileSync(flag, 'utf8'));
  const src = path.join(backupDir(dataDir), path.basename(file));
  fs.rmSync(flag, { force: true });
  if (!fs.existsSync(src) || !verifyBackup(src).ok) return { restored: false, file };
  if (fs.existsSync(dbPath)) {
    fs.mkdirSync(backupDir(dataDir), { recursive: true });
    const keep = new DatabaseSync(dbPath);
    try { keep.exec(`VACUUM INTO '${path.join(backupDir(dataDir), `synchronia-${stamp()}-pre-restore.db`).replace(/'/g, "''")}'`); } finally { keep.close(); }
  }
  for (const ext of ['', '-wal', '-shm']) fs.rmSync(dbPath + ext, { force: true });
  fs.copyFileSync(src, dbPath);
  return { restored: true, file };
}
