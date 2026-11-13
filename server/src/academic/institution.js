// Institution profile and official letterhead. The letterhead is imported from the institution's own Word template
// (its header and footer images are extracted), so official branding is never bundled with the application.
import fs from 'node:fs';
import path from 'node:path';
import JSZip from 'jszip';
import { DATA_DIR } from '../config.js';
import { HttpError, audit } from '../repo.js';
import { inspectImage } from '../cv/images.js';

export const INSTITUTION_FIELDS = {
  university: 300, campus: 200, college: 300, office_line: 300, contact_line: 400,
  vision: 3000, mission: 3000, goals_national: 2000, goals_regional: 2000, goals_university: 2000,
  core_values: 1000, graduate_attributes: 1000,
  program_head_name: 200, program_head_title: 200, dean_name: 200, dean_title: 200,
};

const dir = () => { const d = path.join(DATA_DIR, 'letterhead'); fs.mkdirSync(d, { recursive: true }); return d; };

export function getInstitution(db, userId) {
  const row = db.prepare('SELECT data_json, updated_at FROM institution_settings WHERE user_id = ?').get(userId);
  let data = {};
  try { data = row ? JSON.parse(row.data_json) : {}; } catch { data = {}; }
  const lh = data.letterhead || null;
  const usable = lh && ['header', 'footer'].every((k) => !lh[k] || fs.existsSync(path.join(DATA_DIR, lh[k].file)));
  return { ...Object.fromEntries(Object.keys(INSTITUTION_FIELDS).map((k) => [k, data[k] || ''])), letterhead: usable ? lh : null, updated_at: row?.updated_at || null };
}

function store(db, userId, data) {
  db.prepare(`INSERT INTO institution_settings (user_id, data_json, updated_at) VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      ON CONFLICT(user_id) DO UPDATE SET data_json = excluded.data_json, updated_at = excluded.updated_at`).run(userId, JSON.stringify(data));
}

function raw(db, userId) {
  const row = db.prepare('SELECT data_json FROM institution_settings WHERE user_id = ?').get(userId);
  try { return row ? JSON.parse(row.data_json) : {}; } catch { return {}; }
}

export function saveInstitution(db, userId, body = {}) {
  const errors = {};
  const next = raw(db, userId);
  for (const [k, v] of Object.entries(body)) {
    if (!(k in INSTITUTION_FIELDS)) { errors[k] = 'Unknown field'; continue; }
    if (v !== null && typeof v !== 'string') { errors[k] = 'Must be text'; continue; }
    if ((v || '').length > INSTITUTION_FIELDS[k]) { errors[k] = `At most ${INSTITUTION_FIELDS[k]} characters`; continue; }
    next[k] = (v || '').trim();
  }
  if (Object.keys(errors).length) throw new HttpError(422, 'Validation failed', errors);
  store(db, userId, next);
  audit(db, userId, 'institution', null, 'settings', 'Updated institution profile');
  return getInstitution(db, userId);
}

/** Fill only empty institution fields (used when importing a syllabus). */
export function fillInstitutionGaps(db, userId, values) {
  const next = raw(db, userId);
  let changed = false;
  for (const [k, v] of Object.entries(values)) {
    if (k in INSTITUTION_FIELDS && v && !next[k]) { next[k] = String(v).slice(0, INSTITUTION_FIELDS[k]); changed = true; }
  }
  if (changed) store(db, userId, next);
  return changed;
}

const textOf = (xml) => (xml.match(/<w:p[ >][\s\S]*?<\/w:p>/g) || [])
  .map((p) => (p.match(/<w:t(?: [^>]*)?>[^<]*<\/w:t>/g) || []).map((t) => t.replace(/<[^>]+>/g, '')).join('').trim()).filter(Boolean);

/** Extract the default header/footer banner images and lines from an official Word template. */
export async function importLetterhead(db, userId, buffer, fileName = 'template.docx') {
  let zip;
  try { zip = await JSZip.loadAsync(buffer); } catch { throw new HttpError(415, 'That file is not a Word (.docx) document.'); }
  const docXml = await zip.file('word/document.xml')?.async('string');
  const relsXml = await zip.file('word/_rels/document.xml.rels')?.async('string');
  if (!docXml || !relsXml) throw new HttpError(415, 'That file is not a Word (.docx) document.');
  const rels = Object.fromEntries([...relsXml.matchAll(/<Relationship [^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g)].map((m) => [m[1], m[2]]));
  const ref = (kind) => {
    const m = new RegExp(`<w:${kind}Reference[^>]*w:type="default"[^>]*r:id="([^"]+)"|<w:${kind}Reference[^>]*r:id="([^"]+)"[^>]*w:type="default"`).exec(docXml);
    return m ? rels[m[1] || m[2]] : null;
  };
  const out = {};
  for (const kind of ['header', 'footer']) {
    const target = ref(kind);
    if (!target) continue;
    const partPath = `word/${target.replace(/^\/?word\//, '')}`;
    const partRels = await zip.file(partPath.replace(/word\/(.+)$/, 'word/_rels/$1.rels'))?.async('string');
    const lines = textOf(await zip.file(partPath)?.async('string') || '');
    if (!partRels) { out[`${kind}_lines`] = lines; continue; }
    const imgs = [...partRels.matchAll(/Target="(media\/[^"]+)"/g)].map((m) => `word/${m[1]}`);
    let best = null;
    for (const name of imgs) {
      const data = await zip.file(name)?.async('nodebuffer');
      const info = data && inspectImage(data);
      if (info?.width && info.width >= 300 && (!best || data.length > best.data.length)) best = { data, info };
    }
    if (best) {
      const file = path.join('letterhead', `${kind}.${best.info.mime === 'image/png' ? 'png' : best.info.mime === 'image/jpeg' ? 'jpg' : 'webp'}`);
      fs.mkdirSync(dir(), { recursive: true });
      for (const old of fs.readdirSync(dir()).filter((f) => f.startsWith(`${kind}.`))) fs.rmSync(path.join(dir(), old), { force: true });
      fs.writeFileSync(path.join(DATA_DIR, file), best.data);
      out[kind] = { file, width: best.info.width, height: best.info.height, mime: best.info.mime };
    }
    out[`${kind}_lines`] = lines;
  }
  if (!out.header && !out.footer) throw new HttpError(422, 'No letterhead images were found in this template’s header or footer.');
  const next = raw(db, userId);
  next.letterhead = { header: out.header || null, footer: out.footer || null, source: path.basename(fileName).slice(0, 200), imported_at: new Date().toISOString() };
  // Template header lines such as "Office of the ____" become editable defaults when nothing is set yet.
  const [office, contact] = (out.header_lines || []).filter((l) => !/^[_\s]+$/.test(l));
  if (!next.office_line && office) next.office_line = office;
  if (!next.contact_line && contact) next.contact_line = contact;
  store(db, userId, next);
  audit(db, userId, 'institution', null, 'settings', `Imported letterhead from ${path.basename(fileName)}`);
  return getInstitution(db, userId);
}

export function removeLetterhead(db, userId) {
  const next = raw(db, userId);
  delete next.letterhead;
  store(db, userId, next);
  for (const f of fs.readdirSync(dir())) fs.rmSync(path.join(dir(), f), { force: true });
  audit(db, userId, 'institution', null, 'settings', 'Removed letterhead');
  return getInstitution(db, userId);
}

/** Letterhead description for the document builder, or null when none is configured. */
export function letterheadFor(db, userId) {
  const inst = getInstitution(db, userId);
  const lh = inst.letterhead;
  if (!lh) return null;
  const load = (part) => (part ? { ...part, data: fs.readFileSync(path.join(DATA_DIR, part.file)) } : null);
  const blank = (s) => !s || /_{3,}/.test(s);
  return { header: load(lh.header), footer: load(lh.footer), office: blank(inst.office_line) ? null : inst.office_line, contact: blank(inst.contact_line) ? null : inst.contact_line };
}
