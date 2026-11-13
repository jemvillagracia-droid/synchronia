// Generic, registry-driven data access: validation, ownership scoping, soft delete,
// audit trail (which doubles as version history) and full-text index maintenance.
import { RESOURCES } from './resources.js';
import { encrypt } from './secrets.js';
import { tx } from './db.js';

export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const now = () => new Date().toISOString();

export function getResource(key) {
  const r = RESOURCES[key];
  if (!r) throw new HttpError(404, `Unknown record type "${key}"`);
  return r;
}

/** Validate and coerce input into column values. partial=true for PATCH. */
export function validate(db, userId, r, input, { partial = false } = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new HttpError(400, 'Expected a JSON object');
  const errors = {};
  const out = {};
  for (const name of Object.keys(input)) {
    if (!r.fields[name]) errors[name] = 'Unknown field';
  }
  for (const [name, f] of Object.entries(r.fields)) {
    const present = Object.prototype.hasOwnProperty.call(input, name);
    let v = present ? input[name] : undefined;
    if (typeof v === 'string') v = v.trim();
    const empty = v === undefined || v === null || v === '';
    if (empty) {
      if (f.required && (!partial || present)) errors[name] = 'Required';
      else if (present) {
        if (f.type === 'secret') { out[`${name}_enc`] = null; out[`${name}_last4`] = null; }
        else if (f.type === 'bool') out[name] = 0;
        else if (f.type === 'enum') { /* fall back to column default: skip */ }
        else out[name] = null;
      }
      continue;
    }
    switch (f.type) {
      case 'text':
        if (typeof v !== 'string') { errors[name] = 'Must be text'; break; }
        if (v.length > f.max) { errors[name] = `At most ${f.max} characters`; break; }
        out[name] = v;
        break;
      case 'date':
        if (typeof v !== 'string' || !DATE_RE.test(v) || Number.isNaN(Date.parse(v))) { errors[name] = 'Use YYYY-MM-DD'; break; }
        out[name] = v;
        break;
      case 'int':
      case 'real': {
        const n = Number(v);
        if (!Number.isFinite(n) || (f.type === 'int' && !Number.isInteger(n))) { errors[name] = 'Must be a number'; break; }
        if (f.min !== undefined && n < f.min) { errors[name] = `Must be ≥ ${f.min}`; break; }
        out[name] = n;
        break;
      }
      case 'bool':
        out[name] = v === true || v === 1 || v === '1' || v === 'true' ? 1 : 0;
        break;
      case 'enum':
        if (!f.values.includes(v)) { errors[name] = `One of: ${f.values.join(', ')}`; break; }
        out[name] = v;
        break;
      case 'json':
        try { out[name] = typeof v === 'string' ? JSON.stringify(JSON.parse(v)) : JSON.stringify(v); }
        catch { errors[name] = 'Invalid JSON'; }
        break;
      case 'ref': {
        const target = RESOURCES[f.resource];
        const id = Number(v);
        const row = Number.isInteger(id) && db.prepare(`SELECT id FROM ${target.table} WHERE id = ? AND user_id = ? AND deleted_at IS NULL`).get(id, userId);
        if (!row) { errors[name] = `No such ${target.label.toLowerCase()}`; break; }
        out[name] = id;
        break;
      }
      case 'secret': {
        const s = String(v);
        if (s.length > 200) { errors[name] = 'Too long'; break; }
        out[`${name}_enc`] = encrypt(s);
        out[`${name}_last4`] = s.slice(-4);
        break;
      }
      default:
        throw new Error(`Unhandled field type ${f.type}`);
    }
  }
  if (Object.keys(errors).length) throw new HttpError(422, 'Validation failed', errors);
  return out;
}

/** Shape a DB row for the API: parse JSON, booleans, mask secrets, add display fields. */
export function present(r, row) {
  if (!row) return row;
  const out = { ...row };
  delete out.user_id;
  for (const [name, f] of Object.entries(r.fields)) {
    if (f.type === 'bool') out[name] = !!row[name];
    if (f.type === 'json' && row[name]) { try { out[name] = JSON.parse(row[name]); } catch { /* keep raw */ } }
    if (f.type === 'secret') {
      delete out[`${name}_enc`];
      delete out[`${name}_last4`];
      out[`${name}_masked`] = row[`${name}_last4`] ? `••••${row[`${name}_last4`]}` : null;
    }
  }
  out._type = r.key;
  out._title = displayTitle(r, row);
  return out;
}

export function displayTitle(r, row) {
  const t = row[r.title];
  return t === null || t === undefined || t === '' ? `${r.label} #${row.id}` : String(t);
}

function indexText(r, row) {
  return {
    title: displayTitle(r, row),
    body: r.searchFields.filter((n) => n !== r.title).map((n) => row[n]).filter(Boolean).join(' \n '),
  };
}

export function reindex(db, r, row) {
  db.prepare('DELETE FROM search_index WHERE entity_type = ? AND entity_id = ?').run(r.key, row.id);
  if (row.deleted_at) return;
  const { title, body } = indexText(r, row);
  db.prepare('INSERT INTO search_index (entity_type, entity_id, user_id, title, body) VALUES (?, ?, ?, ?, ?)')
    .run(r.key, row.id, row.user_id, title, body);
}

const PROFILE_SEARCH = ['email', 'professional_title', 'academic_designation', 'specialization', 'research_interests',
  'current_position', 'current_office', 'current_institution', 'biography'];

export function indexProfile(db, userId) {
  db.prepare("DELETE FROM search_index WHERE entity_type = 'profile' AND user_id = ?").run(userId);
  const p = db.prepare('SELECT * FROM professional_profiles WHERE user_id = ?').get(userId);
  if (!p) return;
  db.prepare('INSERT INTO search_index (entity_type, entity_id, user_id, title, body) VALUES (?, ?, ?, ?, ?)')
    .run('profile', p.id, userId, p.full_name || 'Professional Profile', PROFILE_SEARCH.map((k) => p[k]).filter(Boolean).join(' \n '));
}

export function rebuildSearchIndex(db) {
  tx(db, () => {
    db.exec('DELETE FROM search_index');
    for (const r of Object.values(RESOURCES)) {
      for (const row of db.prepare(`SELECT * FROM ${r.table} WHERE deleted_at IS NULL`).all()) reindex(db, r, row);
    }
    for (const { id } of db.prepare('SELECT id FROM users').all()) indexProfile(db, id);
  });
}

export function audit(db, userId, entityType, entityId, action, summary, changes) {
  db.prepare('INSERT INTO audit_logs (user_id, entity_type, entity_id, action, summary, changes_json) VALUES (?, ?, ?, ?, ?, ?)')
    .run(userId, entityType, entityId ?? null, action, summary ?? null, changes ? JSON.stringify(changes) : null);
}

function diff(before, after) {
  const changes = {};
  for (const k of Object.keys(after)) {
    if (k === 'updated_at') continue;
    const b = before ? before[k] ?? null : null;
    const a = after[k] ?? null;
    if (b !== a) changes[k] = k.endsWith('_enc') ? ['(encrypted)', '(encrypted)'] : [b, a];
  }
  return changes;
}

function translateConstraint(err) {
  const m = String(err.message);
  if (m.includes('UNIQUE constraint failed')) return new HttpError(409, 'A matching record already exists (duplicate prevented).');
  if (m.includes('CHECK constraint failed')) return new HttpError(422, 'A value is outside the allowed range.');
  if (m.includes('FOREIGN KEY constraint failed')) return new HttpError(422, 'A linked record does not exist.');
  return err;
}

const SORTABLE = new Set(['created_at', 'updated_at', 'id']);

export function list(db, userId, key, { deleted = false, limit = 50, offset = 0, sort = 'updated_at', order = 'desc', where = {} } = {}) {
  const r = getResource(key);
  const clauses = ['user_id = ?', deleted ? 'deleted_at IS NOT NULL' : 'deleted_at IS NULL'];
  const params = [userId];
  for (const [k, v] of Object.entries(where)) {
    if (!r.fields[k] || r.fields[k].type === 'secret' || r.fields[k].type === 'json') continue;
    clauses.push(`${k} = ?`);
    params.push(v);
  }
  const col = SORTABLE.has(sort) || (r.fields[sort] && r.fields[sort].type !== 'secret') ? sort : 'updated_at';
  const dir = order === 'asc' ? 'ASC' : 'DESC';
  const lim = Math.min(Math.max(Number(limit) || 50, 1), 500);
  const off = Math.max(Number(offset) || 0, 0);
  const sqlWhere = clauses.join(' AND ');
  const total = db.prepare(`SELECT COUNT(*) n FROM ${r.table} WHERE ${sqlWhere}`).get(...params).n;
  const rows = db.prepare(`SELECT * FROM ${r.table} WHERE ${sqlWhere} ORDER BY ${col} ${dir}, id DESC LIMIT ? OFFSET ?`)
    .all(...params, lim, off);
  return { total, items: rows.map((row) => present(r, row)) };
}

function getRaw(db, userId, r, id, { includeDeleted = false } = {}) {
  const row = db.prepare(`SELECT * FROM ${r.table} WHERE id = ? AND user_id = ?${includeDeleted ? '' : ' AND deleted_at IS NULL'}`)
    .get(Number(id), userId);
  if (!row) throw new HttpError(404, `${r.label} not found`);
  return row;
}

export function get(db, userId, key, id) {
  const r = getResource(key);
  return present(r, getRaw(db, userId, r, id));
}

/** A record may only be marked evidence_verified when supporting evidence is actually linked. */
function guardVerification(db, r, values, id) {
  if (values.verification !== 'evidence_verified') return;
  const n = id ? db.prepare('SELECT COUNT(*) n FROM evidence_links WHERE entity_type = ? AND entity_id = ?').get(r.key, Number(id)).n : 0;
  if (!n) {
    throw new HttpError(422, 'Link supporting evidence before marking this record as evidence-verified.', {
      verification: 'Requires linked supporting evidence — use “User confirmed” instead',
    });
  }
}

export function create(db, userId, key, input) {
  const r = getResource(key);
  const values = validate(db, userId, r, input);
  guardVerification(db, r, values, null);
  const cols = ['user_id', ...Object.keys(values)];
  try {
    return tx(db, () => {
      const res = db.prepare(`INSERT INTO ${r.table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`)
        .run(userId, ...Object.values(values));
      const row = getRaw(db, userId, r, res.lastInsertRowid);
      reindex(db, r, row);
      audit(db, userId, key, row.id, 'create', `Created ${r.label.toLowerCase()}: ${displayTitle(r, row)}`, diff(null, values));
      return present(r, row);
    });
  } catch (err) { throw translateConstraint(err); }
}

export function update(db, userId, key, id, input) {
  const r = getResource(key);
  const values = validate(db, userId, r, input, { partial: true });
  guardVerification(db, r, values, id);
  if (key === 'tasks' && 'status' in values) values.completed_at = values.status === 'done' ? now() : null;
  try {
    return tx(db, () => {
      const before = getRaw(db, userId, r, id);
      const changes = diff(before, values);
      if (!Object.keys(changes).length) return present(r, before);
      const sets = [...Object.keys(values).map((c) => `${c} = ?`), 'updated_at = ?'];
      db.prepare(`UPDATE ${r.table} SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`)
        .run(...Object.values(values), now(), before.id, userId);
      const row = getRaw(db, userId, r, id);
      reindex(db, r, row);
      audit(db, userId, key, row.id, 'update', `Updated ${r.label.toLowerCase()}: ${displayTitle(r, row)}`, changes);
      return present(r, row);
    });
  } catch (err) { throw translateConstraint(err); }
}

/** Move to recycle bin. */
export function remove(db, userId, key, id) {
  const r = getResource(key);
  return tx(db, () => {
    const row = getRaw(db, userId, r, id);
    const ts = now();
    db.prepare(`UPDATE ${r.table} SET deleted_at = ?, updated_at = ? WHERE id = ?`).run(ts, ts, row.id);
    reindex(db, r, { ...row, deleted_at: ts });
    audit(db, userId, key, row.id, 'delete', `Moved to recycle bin: ${displayTitle(r, row)}`);
    return { ok: true };
  });
}

export function restore(db, userId, key, id) {
  const r = getResource(key);
  try {
    return tx(db, () => {
      const row = getRaw(db, userId, r, id, { includeDeleted: true });
      if (!row.deleted_at) return present(r, row);
      db.prepare(`UPDATE ${r.table} SET deleted_at = NULL, updated_at = ? WHERE id = ?`).run(now(), row.id);
      const restored = getRaw(db, userId, r, id);
      reindex(db, r, restored);
      audit(db, userId, key, row.id, 'restore', `Restored from recycle bin: ${displayTitle(r, row)}`);
      return present(r, restored);
    });
  } catch (err) { throw translateConstraint(err); }
}

export function history(db, userId, key, id) {
  const r = getResource(key);
  getRaw(db, userId, r, id, { includeDeleted: true });
  return db.prepare('SELECT id, action, summary, changes_json, at FROM audit_logs WHERE user_id = ? AND entity_type = ? AND entity_id = ? ORDER BY id DESC')
    .all(userId, key, Number(id))
    .map((a) => ({ ...a, changes: a.changes_json ? JSON.parse(a.changes_json) : null, changes_json: undefined }));
}
