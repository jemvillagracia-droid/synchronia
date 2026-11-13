// Professional photograph library. Uploads are streamed to disk (never buffered whole), limited to 100 MB, and the
// actual file content is validated: the signature must match JPEG/PNG/WebP and the header must declare sane
// dimensions. Originals are preserved; an optimized, cropped JPEG copy is used for CV rendering.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from '../config.js';
import { HttpError, audit } from '../repo.js';

export const MAX_IMAGE_BYTES = 100 * 1024 * 1024;
export const MAX_OPTIMIZED_BYTES = 15 * 1024 * 1024;
const MAX_DIMENSION = 40000;
const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

const dir = (sub) => { const d = path.join(DATA_DIR, 'images', sub); fs.mkdirSync(d, { recursive: true }); return d; };

/** Detect format from the file signature and read pixel dimensions from the header. */
export function inspectImage(head) {
  if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) {
    let i = 2;
    while (i + 9 < head.length) {
      if (head[i] !== 0xff) { i += 1; continue; }
      const marker = head[i + 1];
      if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01 || marker === 0xff) { i += marker === 0xff ? 1 : 2; continue; }
      const len = head.readUInt16BE(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { mime: 'image/jpeg', height: head.readUInt16BE(i + 5), width: head.readUInt16BE(i + 7) };
      }
      if (marker === 0xda || len < 2) break;
      i += 2 + len;
    }
    return { mime: 'image/jpeg', width: null, height: null };
  }
  if (head.length >= 24 && head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) && head.toString('ascii', 12, 16) === 'IHDR') {
    return { mime: 'image/png', width: head.readUInt32BE(16), height: head.readUInt32BE(20) };
  }
  if (head.length >= 30 && head.toString('ascii', 0, 4) === 'RIFF' && head.toString('ascii', 8, 12) === 'WEBP') {
    const chunk = head.toString('ascii', 12, 16);
    if (chunk === 'VP8 ' && head[23] === 0x9d && head[24] === 0x01 && head[25] === 0x2a) {
      return { mime: 'image/webp', width: head.readUInt16LE(26) & 0x3fff, height: head.readUInt16LE(28) & 0x3fff };
    }
    if (chunk === 'VP8L' && head[20] === 0x2f) {
      const b = head.readUInt32LE(21);
      return { mime: 'image/webp', width: (b & 0x3fff) + 1, height: ((b >> 14) & 0x3fff) + 1 };
    }
    if (chunk === 'VP8X') {
      return { mime: 'image/webp', width: 1 + head.readUIntLE(24, 3), height: 1 + head.readUIntLE(27, 3) };
    }
    return { mime: 'image/webp', width: null, height: null };
  }
  return null;
}

/** Stream the request body to a temporary file, enforcing the size limit while it arrives. */
function receive(req, limit) {
  return new Promise((resolve, reject) => {
    const declared = Number(req.headers['content-length'] || 0);
    if (declared > limit) return reject(new HttpError(413, `The file is larger than ${Math.round(limit / 1048576)} MB.`));
    const tmp = path.join(dir('tmp'), `${crypto.randomUUID()}.part`);
    const out = fs.createWriteStream(tmp, { flags: 'wx' });
    const hash = crypto.createHash('sha256');
    let size = 0;
    let head = Buffer.alloc(0);
    let failed = false;
    const fail = (err) => {
      if (failed) return;
      failed = true;
      req.unpipe?.(out);
      out.destroy();
      fs.rm(tmp, { force: true }, () => {});
      req.resume();
      reject(err);
    };
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) return fail(new HttpError(413, `The file is larger than ${Math.round(limit / 1048576)} MB.`));
      if (head.length < 4 * 1024 * 1024) head = Buffer.concat([head, chunk.subarray(0, 4 * 1024 * 1024 - head.length)]);
      hash.update(chunk);
      if (!out.write(chunk)) { req.pause(); out.once('drain', () => req.resume()); }
    });
    req.on('end', () => { if (!failed) out.end(() => resolve({ tmp, size, head, sha256: hash.digest('hex') })); });
    req.on('error', fail);
    req.on('aborted', () => fail(new HttpError(400, 'Upload interrupted')));
  });
}

function validate(info, size, declaredType) {
  if (!size) throw new HttpError(422, 'The file is empty.');
  if (!info) throw new HttpError(415, 'Unsupported file. Choose a JPEG, PNG or WebP image.');
  if (declaredType && EXT[declaredType] && declaredType !== info.mime) {
    throw new HttpError(415, `The file's contents are ${info.mime.split('/')[1].toUpperCase()}, but it was sent as ${declaredType.split('/')[1].toUpperCase()}. It may be renamed or damaged.`);
  }
  if (!info.width || !info.height) throw new HttpError(422, 'The image header could not be read; the file may be damaged.');
  if (info.width > MAX_DIMENSION || info.height > MAX_DIMENSION) throw new HttpError(422, `Images larger than ${MAX_DIMENSION} pixels on a side are not supported.`);
}

const presentImage = (r) => r && ({
  id: r.id, label: r.label, original_name: r.original_name, mime_type: r.mime_type, size_bytes: r.size_bytes, width: r.width, height: r.height,
  has_optimized: !!r.optimized_path, crop: r.crop_json ? JSON.parse(r.crop_json) : null, created_at: r.created_at, updated_at: r.updated_at,
});

export function listImages(db, userId) {
  const profilePhoto = db.prepare('SELECT photo_image_id FROM professional_profiles WHERE user_id = ?').get(userId)?.photo_image_id || null;
  return db.prepare('SELECT * FROM uploaded_images WHERE user_id = ? AND deleted_at IS NULL ORDER BY created_at DESC').all(userId)
    .map((r) => ({ ...presentImage(r), is_profile_photo: r.id === profilePhoto,
      used_by: db.prepare('SELECT id, name, version FROM cv_profiles WHERE photo_image_id = ? AND deleted_at IS NULL').all(r.id) }));
}

export async function uploadImage(db, userId, req) {
  const declared = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
  if (!EXT[declared]) {
    req.resume();
    throw new HttpError(415, 'Unsupported file type. Choose a JPEG, PNG or WebP image.');
  }
  const { tmp, size, head, sha256 } = await receive(req, MAX_IMAGE_BYTES);
  try {
    const info = inspectImage(head);
    validate(info, size, declared);
    const name = decodeURIComponent(String(req.headers['x-filename'] || 'photo')).replace(/[^\w .()-]/g, '_').slice(0, 120) || 'photo';
    const rel = path.join('images', 'originals', `${sha256}.${EXT[info.mime]}`);
    dir('originals');
    fs.renameSync(tmp, path.join(DATA_DIR, rel));
    const res = db.prepare(`INSERT INTO uploaded_images (user_id, label, original_name, original_path, mime_type, size_bytes, sha256, width, height, original_ext)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(userId, name.replace(/\.[^.]+$/, ''), name, rel, info.mime, size, sha256, info.width, info.height, EXT[info.mime]);
    const id = Number(res.lastInsertRowid);
    audit(db, userId, 'uploaded_images', id, 'create', `Uploaded photograph: ${name} (${(size / 1048576).toFixed(1)} MB, ${info.width}×${info.height})`);
    const replaces = Number(req.query.replaces);
    if (replaces) replaceImage(db, userId, replaces, id);
    return presentImage(db.prepare('SELECT * FROM uploaded_images WHERE id = ?').get(id));
  } catch (err) {
    fs.rmSync(tmp, { force: true });
    throw err;
  }
}

function imageRow(db, userId, id) {
  const r = db.prepare('SELECT * FROM uploaded_images WHERE id = ? AND user_id = ? AND deleted_at IS NULL').get(Number(id), userId);
  if (!r) throw new HttpError(404, 'Photograph not found');
  return r;
}

/** Store the optimized, cropped JPEG produced by the client-side worker (validated like any upload). */
export async function saveOptimized(db, userId, id, req) {
  const img = imageRow(db, userId, id);
  let crop = null;
  try { crop = req.headers['x-crop'] ? JSON.parse(String(req.headers['x-crop'])) : null; } catch { throw new HttpError(422, 'Invalid crop data'); }
  if (crop && !['x', 'y', 'width', 'height'].every((k) => Number.isFinite(crop[k]) && crop[k] >= 0)) throw new HttpError(422, 'Invalid crop rectangle');
  const { tmp, size, head } = await receive(req, MAX_OPTIMIZED_BYTES);
  try {
    const info = inspectImage(head);
    validate(info, size, 'image/jpeg');
    const rel = path.join('images', 'optimized', `${img.id}-${Date.now()}.jpg`);
    dir('optimized');
    fs.renameSync(tmp, path.join(DATA_DIR, rel));
    if (img.optimized_path) fs.rmSync(path.join(DATA_DIR, img.optimized_path), { force: true });
    db.prepare('UPDATE uploaded_images SET optimized_path = ?, crop_json = ?, updated_at = ? WHERE id = ?')
      .run(rel, JSON.stringify({ ...(crop || {}), out_width: info.width, out_height: info.height }), new Date().toISOString(), img.id);
    audit(db, userId, 'uploaded_images', img.id, 'update', `Cropped and optimized photograph: ${img.label}`);
    return presentImage(db.prepare('SELECT * FROM uploaded_images WHERE id = ?').get(img.id));
  } catch (err) {
    fs.rmSync(tmp, { force: true });
    throw err;
  }
}

export function sendImage(db, userId, id, variant, res) {
  const img = imageRow(db, userId, id);
  const rel = variant === 'original' ? img.original_path : img.optimized_path;
  if (!rel) throw new HttpError(404, 'No optimized copy yet');
  res.setHeader('Content-Type', variant === 'original' ? img.mime_type : 'image/jpeg');
  res.setHeader('Cache-Control', 'private, no-cache');
  res.sendFile(path.join(DATA_DIR, rel));
}

export function updateImage(db, userId, id, body = {}) {
  const img = imageRow(db, userId, id);
  if ('label' in body) {
    const l = String(body.label || '').trim();
    if (!l || l.length > 120) throw new HttpError(422, 'Invalid label', { label: 'Required, up to 120 characters' });
    db.prepare('UPDATE uploaded_images SET label = ?, updated_at = ? WHERE id = ?').run(l, new Date().toISOString(), img.id);
  }
  if ('is_profile_photo' in body) {
    db.prepare('UPDATE professional_profiles SET photo_image_id = ? WHERE user_id = ?').run(body.is_profile_photo ? img.id : null, userId);
  }
  return listImages(db, userId).find((i) => i.id === img.id);
}

/** Point every CV (draft) and the profile at the replacement, then retire the old photograph. */
export function replaceImage(db, userId, oldId, newId) {
  const old = imageRow(db, userId, oldId);
  db.prepare("UPDATE cv_profiles SET photo_image_id = ? WHERE photo_image_id = ? AND user_id = ? AND status = 'draft'").run(newId, old.id, userId);
  db.prepare('UPDATE professional_profiles SET photo_image_id = ? WHERE photo_image_id = ? AND user_id = ?').run(newId, old.id, userId);
  const stillUsed = db.prepare("SELECT COUNT(*) n FROM cv_profiles WHERE photo_image_id = ? AND deleted_at IS NULL").get(old.id).n;
  if (!stillUsed) db.prepare('UPDATE uploaded_images SET deleted_at = ? WHERE id = ?').run(new Date().toISOString(), old.id);
  audit(db, userId, 'uploaded_images', old.id, 'update', `Replaced photograph ${old.label}${stillUsed ? ' (kept: used by finalized CVs)' : ''}`);
}

export function deleteImage(db, userId, id) {
  const img = imageRow(db, userId, id);
  const finalized = db.prepare("SELECT COUNT(*) n FROM cv_profiles WHERE photo_image_id = ? AND status = 'finalized' AND deleted_at IS NULL").get(img.id).n;
  if (finalized) throw new HttpError(409, 'This photograph is part of a finalized CV and is kept with it.');
  db.prepare("UPDATE cv_profiles SET photo_image_id = NULL WHERE photo_image_id = ? AND status = 'draft'").run(img.id);
  db.prepare('UPDATE professional_profiles SET photo_image_id = NULL WHERE photo_image_id = ?').run(img.id);
  db.prepare('UPDATE uploaded_images SET deleted_at = ? WHERE id = ?').run(new Date().toISOString(), img.id);
  audit(db, userId, 'uploaded_images', img.id, 'delete', `Removed photograph: ${img.label}`);
  return { ok: true };
}
