// Save-path safety: durable writes, integrity checks, automatic backups and verified restores.
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { HttpError } from './repo.js';

export const KEEP_AUTOMATIC = 15;
const NAME_RE = /^synchronia-(\d{8}-\d{6})-(startup|scheduled|manual|pre-update|pre-restore|imported)(-\d+)?\.db$/;

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
  copyBackup(dataDir, name); // also into the chosen folder, if one is set (never fails the backup)
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

const SQLITE_MAGIC = Buffer.from('SQLite format 3\0', 'latin1');

/** Path of a listed backup, refusing anything that is not a backup file name in the backup folder. */
export function backupFile(dataDir, name) {
  if (!NAME_RE.test(String(name))) throw new HttpError(422, 'Not a SYNCHRONIA backup file name');
  const file = path.join(backupDir(dataDir), path.basename(name));
  if (!fs.existsSync(file)) throw new HttpError(404, 'Backup not found');
  return file;
}

/**
 * Bring in a backup made on another computer (or kept elsewhere). It is verified before it is listed, and refused if
 * it comes from a newer version of SYNCHRONIA than this one. Restoring it is a separate, deliberate step.
 */
export function importBackup(dataDir, buffer, knownMigrations) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 512 || !buffer.subarray(0, 16).equals(SQLITE_MAGIC)) {
    throw new HttpError(415, 'That file is not a SYNCHRONIA database backup (.db).');
  }
  const dir = backupDir(dataDir);
  fs.mkdirSync(dir, { recursive: true });
  let name = `synchronia-${stamp()}-imported.db`;
  for (let i = 1; fs.existsSync(path.join(dir, name)); i += 1) name = `synchronia-${stamp()}-imported-${i}.db`;
  const file = path.join(dir, name);
  fs.writeFileSync(file, buffer);
  const v = verifyBackup(file);
  let newer = [];
  if (v.ok) {
    let d;
    try { d = new DatabaseSync(file, { readOnly: true }); newer = d.prepare('SELECT name FROM schema_migrations').all().map((r) => r.name).filter((n) => !knownMigrations.includes(n)); } catch { /* verified above */ } finally { d?.close(); }
  }
  if (!v.ok || newer.length) {
    fs.rmSync(file, { force: true });
    throw new HttpError(422, !v.ok ? `This backup failed verification (${v.integrity}). It was not imported.` : 'This backup was made by a newer version of SYNCHRONIA. Update the app first.');
  }
  return { file: name, ...v };
}

// ── Copy of every backup in a folder of your choice ─────────
// For example a folder that Google Drive, OneDrive or Dropbox keeps on your other computers: backups made here appear
// there, ready for "Import a backup". The setting lives beside the database (not inside it), so a restore never
// changes it. A copy that fails never stops the backup itself, and its status is always shown as it is.
export const KEEP_COPIES = 15;
const copyConfigFile = (dataDir) => path.join(dataDir, 'backup-copy.json');
export function getBackupCopy(dataDir) {
  try { return JSON.parse(fs.readFileSync(copyConfigFile(dataDir), 'utf8')); } catch { return { dir: null }; }
}
function saveCopyConfig(dataDir, cfg) {
  const tmp = copyConfigFile(dataDir) + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(cfg, null, 2)); fs.renameSync(tmp, copyConfigFile(dataDir));
}
export const copyTarget = (dir) => path.join(dir, 'SYNCHRONIA Backups');

/** Choose (or clear, with an empty value) the folder. The folder must exist and be writable. */
export function setBackupCopy(dataDir, dir) {
  const d = String(dir || '').trim();
  if (!d) { saveCopyConfig(dataDir, { dir: null }); return getBackupCopy(dataDir); }
  if (!path.isAbsolute(d)) throw new HttpError(422, 'Choose a folder on this computer', { dir: 'Use Choose folder… to pick it' });
  if (!fs.existsSync(d) || !fs.statSync(d).isDirectory()) throw new HttpError(422, 'That folder does not exist', { dir: d });
  if (path.resolve(d).startsWith(path.resolve(dataDir))) throw new HttpError(422, 'Choose a folder outside the SYNCHRONIA data folder', { dir: d });
  try { fs.mkdirSync(copyTarget(d), { recursive: true }); const probe = path.join(copyTarget(d), '.write-test'); fs.writeFileSync(probe, 'ok'); fs.rmSync(probe); }
  catch (e) { throw new HttpError(422, 'SYNCHRONIA cannot write to that folder', { dir: String(e.message).slice(0, 160) }); }
  saveCopyConfig(dataDir, { ...getBackupCopy(dataDir), dir: path.resolve(d), last_error: null });
  return getBackupCopy(dataDir);
}

/** Copy one backup file into the chosen folder. Written under a temporary name and renamed when complete, so a
 *  syncing service never uploads half a file. Returns the updated status; never throws. */
export function copyBackup(dataDir, name) {
  const cfg = getBackupCopy(dataDir);
  if (!cfg.dir) return cfg;
  const now = new Date().toISOString();
  try {
    const src = path.join(backupDir(dataDir), path.basename(name));
    // The chosen folder itself must still be there: if a cloud drive is not running or a USB drive is unplugged,
    // re-creating it would write to an ordinary folder that syncs nowhere — that is reported as a failed copy instead.
    if (!fs.existsSync(cfg.dir)) throw new Error(`The folder ${cfg.dir} is not available (is the drive connected, or the sync app running?)`);
    const target = copyTarget(cfg.dir); fs.mkdirSync(target, { recursive: true });
    const tmp = path.join(target, `.${path.basename(name)}.partial`);
    fs.copyFileSync(src, tmp); fs.renameSync(tmp, path.join(target, path.basename(name)));
    const auto = fs.readdirSync(target).filter((f) => /-(startup|scheduled)\.db$/.test(f)).sort().reverse();
    for (const f of auto.slice(KEEP_COPIES)) fs.rmSync(path.join(target, f), { force: true });
    saveCopyConfig(dataDir, { ...cfg, last_at: now, last_file: path.basename(name), last_error: null });
  } catch (e) {
    saveCopyConfig(dataDir, { ...cfg, last_error: String(e.message || e).slice(0, 200), last_error_at: now });
  }
  return getBackupCopy(dataDir);
}
