// Pictures in word-processor documents. Only PNG, JPEG and GIF are stored (the formats Word documents can hold; the
// app converts other picture types to PNG before uploading). Each file is checked by its content, not its name,
// stored once (identical pictures are shared), and served only to this app.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { DATA_DIR } from './config.js';
import { HttpError } from './repo.js';
import { inspectImage } from './cv/images.js';

export const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif' };
const dir = () => { const d = path.join(DATA_DIR, 'doc-images'); fs.mkdirSync(d, { recursive: true }); return d; };

/** Recognise a picture from its bytes: PNG, JPEG or GIF, with its pixel size. */
export function sniff(buf) {
  if (buf.length >= 10 && /^GIF8[79]a$/.test(buf.toString('ascii', 0, 6))) return { mime: 'image/gif', width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
  const i = inspectImage(buf.subarray(0, Math.min(buf.length, 256 * 1024)));
  return i && (i.mime === 'image/png' || i.mime === 'image/jpeg') ? i : null;
}

export function storeImage(db, userId, buf, name = '') {
  if (!Buffer.isBuffer(buf) || !buf.length) throw new HttpError(422, 'No picture was received.');
  if (buf.length > MAX_IMAGE_BYTES) throw new HttpError(413, 'Pictures can be up to 15 MB.');
  const info = sniff(buf);
  if (!info) throw new HttpError(415, 'That file is not a PNG, JPEG or GIF picture.');
  const sha = crypto.createHash('sha256').update(buf).digest('hex');
  const existing = db.prepare('SELECT * FROM doc_images WHERE user_id = ? AND sha256 = ?').get(userId, sha);
  if (existing && fs.existsSync(path.join(DATA_DIR, existing.file))) return present(existing);
  const rel = path.join('doc-images', `${sha.slice(0, 32)}.${EXT[info.mime]}`);
  fs.writeFileSync(path.join(dir(), path.basename(rel)), buf);
  if (existing) { db.prepare('UPDATE doc_images SET file = ? WHERE id = ?').run(rel, existing.id); return present({ ...existing, file: rel }); }
  const r = db.prepare('INSERT INTO doc_images (user_id, file, mime, width, height, bytes, sha256, name) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(userId, rel, info.mime, info.width || null, info.height || null, buf.length, sha, String(name || '').slice(0, 200) || null);
  return present(db.prepare('SELECT * FROM doc_images WHERE id = ?').get(r.lastInsertRowid));
}

const present = (r) => ({ id: r.id, src: `/api/doc-images/${r.id}`, mime: r.mime, width: r.width, height: r.height, bytes: r.bytes });

/** The stored picture behind a document src (/api/doc-images/<id>), with its bytes — for Word and PDF output. */
export function loadImage(db, userId, src) {
  const m = /^\/api\/doc-images\/(\d+)$/.exec(String(src || ''));
  if (!m) return null;
  const r = db.prepare('SELECT * FROM doc_images WHERE id = ? AND user_id = ?').get(Number(m[1]), userId);
  if (!r) return null;
  try { return { ...r, data: fs.readFileSync(path.join(DATA_DIR, r.file)) }; } catch { return null; }
}

/** A picture copied from a web page arrives as a link; fetch it once so the document keeps its own copy. */
export async function fetchImage(db, userId, url) {
  let u;
  try { u = new URL(String(url)); } catch { throw new HttpError(422, 'That is not a web address.'); }
  if (!['http:', 'https:'].includes(u.protocol)) throw new HttpError(422, 'Only web (http/https) pictures can be fetched.');
  // Never reach into this computer or its local network.
  if (/^(localhost|.*\.local|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1\]?|0\.0\.0\.0)/i.test(u.hostname)) throw new HttpError(422, 'Pictures on this computer or local network cannot be fetched by address.');
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 15000);
  try {
    const res = await fetch(u, { signal: ctl.signal, redirect: 'follow' });
    if (!res.ok) throw new HttpError(422, `The picture could not be downloaded (${res.status}).`);
    const len = Number(res.headers.get('content-length') || 0);
    if (len > MAX_IMAGE_BYTES) throw new HttpError(413, 'Pictures can be up to 15 MB.');
    const buf = Buffer.from(await res.arrayBuffer());
    return storeImage(db, userId, buf, path.basename(u.pathname));
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(422, 'The picture could not be downloaded.');
  } finally { clearTimeout(t); }
}

export function docImagesRouter(db) {
  const r = express.Router();
  const raw = express.raw({ type: () => true, limit: MAX_IMAGE_BYTES + 1024 });
  r.post('/', raw, (req, res) => {
    let name = '';
    try { name = decodeURIComponent(String(req.get('X-Filename') || '')); } catch { /* ignore */ }
    res.status(201).json(storeImage(db, req.user.id, req.body, name));
  });
  r.post('/from-url', async (req, res) => res.status(201).json(await fetchImage(db, req.user.id, req.body?.url)));
  r.get('/:id', (req, res) => {
    const img = loadImage(db, req.user.id, `/api/doc-images/${Number(req.params.id)}`);
    if (!img) throw new HttpError(404, 'Picture not found');
    res.set('Cache-Control', 'private, max-age=31536000, immutable').type(img.mime).send(img.data);
  });
  return r;
}
