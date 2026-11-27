// Idea moodboards: an endless canvas of note, picture and link cards, one board per place of work.
// Card text is searchable; pictures are stored pictures (/api/doc-images/…), never outside links.
import express from 'express';
import { HttpError, audit, searchPut } from './repo.js';
import { tx } from './db.js';

const CONTEXTS = { general: null, research_projects: 'research_projects', courses: 'courses', syllabi: 'syllabi' };
const COLORS = ['violet', 'yellow', 'pink', 'green', 'blue', 'orange', 'grey'];
const LOCAL_IMAGE = /^\/api\/doc-images\/\d+$/;
const num = (v, d, min, max) => { const n = Number(v); return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : d; };

function titleFor(db, userId, type, id) {
  if (type === 'general') return 'General ideas';
  const t = { research_projects: ['research_projects', 'title'], courses: ['courses', "code || ' · ' || title"], syllabi: ['syllabi', 'version_label'] }[type];
  const row = db.prepare(`SELECT ${t[1]} AS t FROM ${t[0]} WHERE id = ? AND user_id = ? AND deleted_at IS NULL`).get(Number(id), userId);
  if (!row) throw new HttpError(404, 'That place of work was not found');
  return String(row.t).slice(0, 300);
}

function owned(db, userId, id) {
  const b = db.prepare('SELECT * FROM moodboards WHERE id = ? AND user_id = ? AND deleted_at IS NULL').get(Number(id), userId);
  if (!b) throw new HttpError(404, 'Moodboard not found');
  return b;
}

/** The board for a place of work, created on first use. */
export function boardFor(db, userId, type = 'general', id = null) {
  if (!(type in CONTEXTS)) throw new HttpError(422, 'Unknown place of work');
  const cid = type === 'general' ? null : Number(id);
  const found = db.prepare('SELECT * FROM moodboards WHERE user_id = ? AND context_type = ? AND COALESCE(context_id, 0) = ? AND deleted_at IS NULL').get(userId, type, cid || 0);
  if (found) return found;
  const title = titleFor(db, userId, type, cid);
  const r = db.prepare('INSERT INTO moodboards (user_id, title, context_type, context_id) VALUES (?, ?, ?, ?)').run(userId, title, type, cid);
  return db.prepare('SELECT * FROM moodboards WHERE id = ?').get(r.lastInsertRowid);
}

export function listBoards(db, userId) {
  return db.prepare(`SELECT b.*, (SELECT COUNT(*) FROM moodboard_items i WHERE i.board_id = b.id AND i.deleted_at IS NULL) AS items
    FROM moodboards b WHERE b.user_id = ? AND b.deleted_at IS NULL ORDER BY b.updated_at DESC`).all(userId);
}

export function getBoard(db, userId, id) {
  const b = owned(db, userId, id);
  return { board: b, items: db.prepare('SELECT * FROM moodboard_items WHERE board_id = ? AND deleted_at IS NULL ORDER BY z, id').all(b.id) };
}

function clean(body, partial) {
  const v = {};
  if (!partial || 'kind' in body) { if (!['note', 'image', 'link'].includes(body.kind)) throw new HttpError(422, 'A card is a note, a picture or a link'); v.kind = body.kind; }
  for (const k of ['x', 'y']) if (!partial || k in body) v[k] = num(body[k], 0, -1e6, 1e6);
  if (!partial || 'w' in body) v.w = num(body.w, 240, 80, 2000);
  if (!partial || 'h' in body) v.h = num(body.h, 160, 50, 2000);
  if ('z' in body) v.z = Math.round(num(body.z, 0, -1e6, 1e6));
  if ('color' in body) v.color = COLORS.includes(body.color) ? body.color : null;
  if ('text' in body) v.text = body.text == null ? null : String(body.text).slice(0, 20000);
  if ('image_src' in body) { if (body.image_src && !LOCAL_IMAGE.test(body.image_src)) throw new HttpError(422, 'Pictures must be stored in SYNCHRONIA first'); v.image_src = body.image_src || null; }
  if ('url' in body) { if (body.url && !/^https?:\/\//i.test(body.url)) throw new HttpError(422, 'Links must start with http:// or https://'); v.url = body.url ? String(body.url).slice(0, 2000) : null; }
  return v;
}

function touch(db, b) { db.prepare("UPDATE moodboards SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?").run(b.id); }
function reindexBoard(db, b) {
  const text = db.prepare('SELECT text, url FROM moodboard_items WHERE board_id = ? AND deleted_at IS NULL').all(b.id).map((r) => [r.text, r.url].filter(Boolean).join(' ')).join('\n').slice(0, 60000);
  searchPut(db, 'moodboards', b.id, b.user_id, `Moodboard · ${b.title}`, text);
}

export function addItem(db, userId, boardId, body = {}) {
  const b = owned(db, userId, boardId);
  const v = clean(body, false);
  if (v.kind === 'image' && !v.image_src) throw new HttpError(422, 'Choose a picture');
  if (v.kind === 'link' && !v.url) throw new HttpError(422, 'Give the link');
  return tx(db, () => {
    const z = db.prepare('SELECT COALESCE(MAX(z), 0) + 1 AS z FROM moodboard_items WHERE board_id = ?').get(b.id).z;
    const cols = ['user_id', 'board_id', 'z', ...Object.keys(v).filter((k) => k !== 'z')];
    const r = db.prepare(`INSERT INTO moodboard_items (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`).run(userId, b.id, v.z ?? z, ...Object.entries(v).filter(([k]) => k !== 'z').map(([, x]) => x));
    touch(db, b); reindexBoard(db, b);
    return db.prepare('SELECT * FROM moodboard_items WHERE id = ?').get(r.lastInsertRowid);
  });
}

export function updateItem(db, userId, itemId, body = {}) {
  const it = db.prepare('SELECT * FROM moodboard_items WHERE id = ? AND user_id = ? AND deleted_at IS NULL').get(Number(itemId), userId);
  if (!it) throw new HttpError(404, 'Card not found');
  const v = clean(body, true);
  delete v.kind;
  if (!Object.keys(v).length) return it;
  db.prepare(`UPDATE moodboard_items SET ${Object.keys(v).map((k) => `${k} = ?`).join(', ')}, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`).run(...Object.values(v), it.id);
  const b = owned(db, userId, it.board_id); touch(db, b); if ('text' in v || 'url' in v) reindexBoard(db, b);
  return db.prepare('SELECT * FROM moodboard_items WHERE id = ?').get(it.id);
}

export function removeItem(db, userId, itemId) {
  const it = db.prepare('SELECT * FROM moodboard_items WHERE id = ? AND user_id = ? AND deleted_at IS NULL').get(Number(itemId), userId);
  if (!it) throw new HttpError(404, 'Card not found');
  db.prepare("UPDATE moodboard_items SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?").run(it.id);
  const b = owned(db, userId, it.board_id); touch(db, b); reindexBoard(db, b);
  audit(db, userId, 'moodboards', b.id, 'delete', `Removed a ${it.kind} card from moodboard ${b.title}`);
  return { ok: true };
}

export function moodboardRouter(db) {
  const r = express.Router();
  const u = (req) => req.user.id;
  r.get('/', (req, res) => res.json(listBoards(db, u(req))));
  r.get('/for', (req, res) => res.json(getBoard(db, u(req), boardFor(db, u(req), String(req.query.type || 'general'), req.query.id).id)));
  r.get('/:id', (req, res) => res.json(getBoard(db, u(req), req.params.id)));
  r.post('/:id/items', (req, res) => res.status(201).json(addItem(db, u(req), req.params.id, req.body || {})));
  r.patch('/items/:id', (req, res) => res.json(updateItem(db, u(req), req.params.id, req.body || {})));
  r.delete('/items/:id', (req, res) => res.json(removeItem(db, u(req), req.params.id)));
  return r;
}
