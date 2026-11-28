// CV Studio service: profiles, sections, entries, portfolio synchronisation, composition and versioning.
import { RESOURCES } from '../resources.js';
import { HttpError, audit, update as updateRecord } from '../repo.js';
import { tx, inChunks } from '../db.js';
import { SECTIONS, SECTION_BY_KEY, DEFAULT_ORDER, DEFAULT_TEMPLATE, TYPE_HEADINGS } from './sections.js';
import { TEMPLATES } from './templates.js';

const now = () => new Date().toISOString();
const CV_TYPES = ['academic', 'faculty', 'research', 'administrative', 'professional', 'application', 'short_bio', 'portfolio', 'reclassification'];

export const DEFAULT_SETTINGS = {
  page_size: 'letter',            // letter | a4 | folio (8.5 × 13 in) | legal | a5 | b5
  margins: { top: 0.75, right: 0.8, bottom: 0.75, left: 0.8 },  // inches
  font_family: null,              // null = template default
  font_size: null,                // pt; null = template default
  section_spacing: 'normal',      // compact | normal | relaxed
  date_order: 'reverse',          // reverse | chronological
  date_style: 'month_year',       // month_year | year
  show_photo: false,
  page_numbers: true,
  footer_text: '',
  hide_empty: true,
  show_license_numbers: false,
  keywords: '',                   // target keywords / job advertisement text for the ATS analyzer
  target_position: '',
};

export const FONTS = ['Times New Roman', 'Georgia', 'Garamond', 'Cambria', 'Calibri', 'Arial'];

function parse(json, fallback) { try { return json ? JSON.parse(json) : fallback; } catch { return fallback; } }

export function settingsOf(cv) {
  const s = parse(cv.settings_json, {});
  return { ...DEFAULT_SETTINGS, ...s, margins: { ...DEFAULT_SETTINGS.margins, ...(s.margins || {}) } };
}

/** Validate a partial settings update. */
export function cleanSettings(patch) {
  const errors = {};
  const out = {};
  const num = (v, min, max) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
  for (const [k, v] of Object.entries(patch || {})) {
    switch (k) {
      case 'page_size': if (['letter', 'a4', 'folio', 'legal', 'a5', 'b5'].includes(v)) out[k] = v; else errors[k] = 'letter, a4, folio, legal, a5 or b5'; break;
      case 'margins':
        if (v && typeof v === 'object' && ['top', 'right', 'bottom', 'left'].every((s) => v[s] === undefined || num(v[s], 0.3, 2))) out[k] = v;
        else errors[k] = 'Each margin must be between 0.3 and 2 inches'; break;
      case 'font_family': if (v === null || FONTS.includes(v)) out[k] = v; else errors[k] = `One of: ${FONTS.join(', ')}`; break;
      case 'font_size': if (v === null || num(v, 9, 13)) out[k] = v; else errors[k] = 'Between 9 and 13 pt'; break;
      case 'section_spacing': if (['compact', 'normal', 'relaxed'].includes(v)) out[k] = v; else errors[k] = 'compact, normal or relaxed'; break;
      case 'date_order': if (['reverse', 'chronological'].includes(v)) out[k] = v; else errors[k] = 'reverse or chronological'; break;
      case 'date_style': if (['month_year', 'year'].includes(v)) out[k] = v; else errors[k] = 'month_year or year'; break;
      case 'show_photo': case 'page_numbers': case 'hide_empty': case 'show_license_numbers': out[k] = !!v; break;
      case 'footer_text': case 'target_position':
        if (typeof v === 'string' && v.length <= 200) out[k] = v.trim(); else errors[k] = 'Text up to 200 characters'; break;
      case 'keywords': if (typeof v === 'string' && v.length <= 8000) out[k] = v; else errors[k] = 'Text up to 8000 characters'; break;
      default: errors[k] = 'Unknown setting';
    }
  }
  if (Object.keys(errors).length) throw new HttpError(422, 'Invalid CV settings', errors);
  return out;
}

export function getCvRow(db, userId, id, { includeDeleted = false } = {}) {
  const cv = db.prepare(`SELECT p.*, t.key AS template_key, t.name AS template_name FROM cv_profiles p LEFT JOIN cv_templates t ON t.id = p.template_id
      WHERE p.id = ? AND p.user_id = ?${includeDeleted ? '' : ' AND p.deleted_at IS NULL'}`).get(Number(id), userId);
  if (!cv) throw new HttpError(404, 'CV not found');
  return cv;
}

function assertDraft(cv) {
  if (cv.status === 'finalized') throw new HttpError(409, 'This CV version is finalized. Create a new draft version to make changes.');
}

function touch(db, cvId) {
  db.prepare('UPDATE cv_profiles SET updated_at = ? WHERE id = ?').run(now(), cvId);
}

const templateId = (db, key) => {
  const t = db.prepare('SELECT id FROM cv_templates WHERE key = ?').get(key);
  if (!t) throw new HttpError(422, 'Unknown template', { template_key: `One of: ${Object.keys(TEMPLATES).join(', ')}` });
  return t.id;
};

// ───────────────────────── Source records ─────────────────────────

const sourcesOf = (def) => (def.source === null || def.source === 'profile' ? [] : Array.isArray(def.source) ? def.source : [def.source]);

function loadRows(db, userId, type, ids = null) {
  if (ids && ids.length > 500) return inChunks(ids, (chunk) => loadRows(db, userId, type, chunk));
  const r = RESOURCES[type];
  if (type === 'teaching_assignments') {
    const where = ids ? `AND a.id IN (${ids.map(() => '?').join(',')})` : '';
    return db.prepare(`SELECT a.*, c.code AS _course_code, c.title AS _course_title, c.program AS _course_program
        FROM teaching_assignments a JOIN courses c ON c.id = a.course_id
        WHERE a.user_id = ? AND a.deleted_at IS NULL AND c.deleted_at IS NULL ${where}`).all(userId, ...(ids || []));
  }
  const where = ids ? `AND id IN (${ids.map(() => '?').join(',')})` : '';
  return db.prepare(`SELECT * FROM ${r.table} WHERE user_id = ? AND deleted_at IS NULL ${where}`).all(userId, ...(ids || []));
}

/** Portfolio records that belong in a section (before inclusion choices). */
function eligible(db, userId, def) {
  const out = [];
  for (const type of sourcesOf(def)) {
    const f = def.filter?.[type];
    for (const row of loadRows(db, userId, type)) if (!f || f(row)) out.push({ type, row });
  }
  return out;
}

const profileRow = (db, userId) => db.prepare('SELECT * FROM professional_profiles WHERE user_id = ?').get(userId) || {};

// ───────────────────────── Create / list ─────────────────────────

export function listCvs(db, userId) {
  const rows = db.prepare(`SELECT p.id, p.name, p.cv_type, p.status, p.version, p.family_id, p.finalized_at, p.created_at, p.updated_at,
        t.key AS template_key, t.name AS template_name,
        (SELECT COUNT(*) FROM cv_exports x WHERE x.cv_profile_id = p.id) AS export_count,
        (SELECT MAX(created_at) FROM cv_exports x WHERE x.cv_profile_id = p.id) AS last_export_at
      FROM cv_profiles p LEFT JOIN cv_templates t ON t.id = p.template_id
      WHERE p.user_id = ? AND p.deleted_at IS NULL ORDER BY p.family_id, p.version DESC`).all(userId);
  return rows.map((r) => ({ ...r, pending: r.status === 'draft' ? pendingCount(db, userId, r.id) : 0 }));
}

export function createCv(db, userId, body = {}) {
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name || name.length > 120) throw new HttpError(422, 'Give the CV a name', { name: 'Required, up to 120 characters' });
  const cvType = body.cv_type || 'academic';
  if (!CV_TYPES.includes(cvType)) throw new HttpError(422, 'Unknown CV type', { cv_type: `One of: ${CV_TYPES.join(', ')}` });
  const tplKey = body.template_key || DEFAULT_TEMPLATE[cvType];
  const tplId = templateId(db, tplKey);
  const p = profileRow(db, userId);
  return tx(db, () => {
    const res = db.prepare(`INSERT INTO cv_profiles (user_id, name, cv_type, template_id, photo_image_id, status, settings_json)
        VALUES (?, ?, ?, ?, ?, 'draft', ?)`).run(userId, name, cvType, tplId, p.photo_image_id || null, JSON.stringify({}));
    const cvId = Number(res.lastInsertRowid);
    db.prepare('UPDATE cv_profiles SET family_id = ? WHERE id = ?').run(cvId, cvId);
    const order = DEFAULT_ORDER[cvType];
    const sorted = [...order.map((k) => SECTION_BY_KEY[k]), ...SECTIONS.filter((s) => !order.includes(s.key))];
    sorted.forEach((def, i) => {
      const s = db.prepare('INSERT INTO cv_sections (cv_profile_id, section_key, heading, sort_order, visible, is_custom, settings_json) VALUES (?, ?, ?, ?, ?, 0, ?)')
        .run(cvId, def.key, TYPE_HEADINGS[cvType]?.[def.key] || def.heading, i, order.includes(def.key) ? 1 : 0, JSON.stringify({ sort: 'auto', page_break_before: false }));
      const sid = Number(s.lastInsertRowid);
      if (def.source === 'profile') {
        db.prepare("INSERT INTO cv_entries (cv_section_id, source_type, source_id, sort_order, included) VALUES (?, 'profile', ?, 0, 1)").run(sid, p.id || 0);
      } else {
        eligible(db, userId, def).forEach(({ type, row }, j) => {
          db.prepare('INSERT INTO cv_entries (cv_section_id, source_type, source_id, sort_order, included) VALUES (?, ?, ?, ?, 1)').run(sid, type, row.id, j);
        });
      }
      if (def.key === 'references') {
        db.prepare('INSERT INTO cv_entries (cv_section_id, custom_content_json, sort_order, included) VALUES (?, ?, 0, 1)')
          .run(sid, JSON.stringify({ text: 'Available upon request.' }));
      }
    });
    audit(db, userId, 'cv_profiles', cvId, 'create', `Created CV: ${name}`);
    return getCv(db, userId, cvId);
  });
}

/** New draft version from any version (e.g. a finalized one). Copies sections, entries, overrides and settings. */
export function newVersion(db, userId, id) {
  const src = getCvRow(db, userId, id);
  return tx(db, () => {
    const v = db.prepare('SELECT MAX(version) v FROM cv_profiles WHERE family_id = ? AND user_id = ?').get(src.family_id, userId).v + 1;
    const res = db.prepare(`INSERT INTO cv_profiles (user_id, name, cv_type, template_id, photo_image_id, status, settings_json, family_id, version)
        VALUES (?, ?, ?, ?, ?, 'draft', ?, ?, ?)`).run(userId, src.name, src.cv_type, src.template_id, src.photo_image_id, src.settings_json, src.family_id, v);
    const cvId = Number(res.lastInsertRowid);
    for (const s of db.prepare('SELECT * FROM cv_sections WHERE cv_profile_id = ? ORDER BY sort_order').all(src.id)) {
      const ns = db.prepare('INSERT INTO cv_sections (cv_profile_id, section_key, heading, sort_order, visible, is_custom, settings_json) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(cvId, s.section_key, s.heading, s.sort_order, s.visible, s.is_custom, s.settings_json);
      for (const e of db.prepare('SELECT * FROM cv_entries WHERE cv_section_id = ?').all(s.id)) {
        db.prepare('INSERT INTO cv_entries (cv_section_id, source_type, source_id, custom_content_json, sort_order, included) VALUES (?, ?, ?, ?, ?, ?)')
          .run(Number(ns.lastInsertRowid), e.source_type, e.source_id, e.custom_content_json, e.sort_order, e.included);
      }
    }
    audit(db, userId, 'cv_profiles', cvId, 'create', `Created draft version ${v} of CV: ${src.name}`);
    return getCv(db, userId, cvId);
  });
}

export function updateCv(db, userId, id, body = {}) {
  const cv = getCvRow(db, userId, id);
  assertDraft(cv);
  const sets = [];
  const params = [];
  const changes = {};
  if ('name' in body) {
    const n = String(body.name || '').trim();
    if (!n || n.length > 120) throw new HttpError(422, 'Invalid name', { name: 'Required, up to 120 characters' });
    sets.push('name = ?'); params.push(n); changes.name = [cv.name, n];
  }
  if ('cv_type' in body) {
    if (!CV_TYPES.includes(body.cv_type)) throw new HttpError(422, 'Unknown CV type', { cv_type: CV_TYPES.join(', ') });
    sets.push('cv_type = ?'); params.push(body.cv_type); changes.cv_type = [cv.cv_type, body.cv_type];
  }
  if ('template_key' in body) {
    sets.push('template_id = ?'); params.push(templateId(db, body.template_key)); changes.template = [cv.template_key, body.template_key];
  }
  if ('photo_image_id' in body) {
    const pid = body.photo_image_id === null ? null : Number(body.photo_image_id);
    if (pid !== null && !db.prepare('SELECT id FROM uploaded_images WHERE id = ? AND user_id = ? AND deleted_at IS NULL').get(pid, userId)) {
      throw new HttpError(422, 'Photo not found', { photo_image_id: 'No such photograph' });
    }
    sets.push('photo_image_id = ?'); params.push(pid); changes.photo = [cv.photo_image_id, pid];
  }
  if ('settings' in body) {
    const next = { ...parse(cv.settings_json, {}), ...cleanSettings(body.settings) };
    sets.push('settings_json = ?'); params.push(JSON.stringify(next)); changes.settings = Object.keys(body.settings || {});
  }
  if (sets.length) {
    db.prepare(`UPDATE cv_profiles SET ${sets.join(', ')}, updated_at = ? WHERE id = ?`).run(...params, now(), cv.id);
    audit(db, userId, 'cv_profiles', cv.id, 'update', `Updated CV: ${cv.name}`, changes);
  }
  return getCv(db, userId, cv.id);
}

export function deleteCv(db, userId, id) {
  const cv = getCvRow(db, userId, id);
  db.prepare('UPDATE cv_profiles SET deleted_at = ?, updated_at = ? WHERE id = ?').run(now(), now(), cv.id);
  audit(db, userId, 'cv_profiles', cv.id, 'delete', `Deleted CV: ${cv.name} (v${cv.version})`);
  return { ok: true };
}

// ───────────────────────── Sections & entries ─────────────────────────

function sectionRow(db, cv, sid) {
  const s = db.prepare('SELECT * FROM cv_sections WHERE id = ? AND cv_profile_id = ?').get(Number(sid), cv.id);
  if (!s) throw new HttpError(404, 'Section not found');
  return s;
}

export function updateSection(db, userId, id, sid, body = {}) {
  const cv = getCvRow(db, userId, id);
  assertDraft(cv);
  const s = sectionRow(db, cv, sid);
  const settings = parse(s.settings_json, {});
  if ('heading' in body) {
    const h = String(body.heading || '').trim();
    if (!h || h.length > 80) throw new HttpError(422, 'Invalid heading', { heading: 'Required, up to 80 characters' });
    db.prepare('UPDATE cv_sections SET heading = ? WHERE id = ?').run(h, s.id);
  }
  if ('visible' in body) db.prepare('UPDATE cv_sections SET visible = ? WHERE id = ?').run(body.visible ? 1 : 0, s.id);
  if ('page_break_before' in body) settings.page_break_before = !!body.page_break_before;
  if ('sort' in body) {
    if (!['auto', 'manual'].includes(body.sort)) throw new HttpError(422, 'sort must be auto or manual');
    settings.sort = body.sort;
  }
  db.prepare('UPDATE cv_sections SET settings_json = ? WHERE id = ?').run(JSON.stringify(settings), s.id);
  touch(db, cv.id);
  return getCv(db, userId, cv.id);
}

export function reorderSections(db, userId, id, ids) {
  const cv = getCvRow(db, userId, id);
  assertDraft(cv);
  const existing = db.prepare('SELECT id FROM cv_sections WHERE cv_profile_id = ?').all(cv.id).map((r) => r.id);
  if (!Array.isArray(ids) || ids.length !== existing.length || !ids.every((x) => existing.includes(Number(x)))) {
    throw new HttpError(422, 'Provide every section id exactly once');
  }
  tx(db, () => ids.forEach((sid, i) => db.prepare('UPDATE cv_sections SET sort_order = ? WHERE id = ?').run(i, Number(sid))));
  touch(db, cv.id);
  return getCv(db, userId, cv.id);
}

export function addCustomSection(db, userId, id, body = {}) {
  const cv = getCvRow(db, userId, id);
  assertDraft(cv);
  const h = String(body.heading || '').trim();
  if (!h || h.length > 80) throw new HttpError(422, 'Invalid heading', { heading: 'Required, up to 80 characters' });
  const max = db.prepare('SELECT COALESCE(MAX(sort_order), -1) m FROM cv_sections WHERE cv_profile_id = ?').get(cv.id).m;
  db.prepare("INSERT INTO cv_sections (cv_profile_id, section_key, heading, sort_order, visible, is_custom, settings_json) VALUES (?, 'custom', ?, ?, 1, 1, ?)")
    .run(cv.id, h, max + 1, JSON.stringify({ sort: 'manual', page_break_before: false }));
  touch(db, cv.id);
  return getCv(db, userId, cv.id);
}

export function deleteSection(db, userId, id, sid) {
  const cv = getCvRow(db, userId, id);
  assertDraft(cv);
  const s = sectionRow(db, cv, sid);
  if (!s.is_custom) throw new HttpError(409, 'Standard sections can be hidden but not deleted.');
  db.prepare('DELETE FROM cv_sections WHERE id = ?').run(s.id);
  touch(db, cv.id);
  return getCv(db, userId, cv.id);
}

function cleanContent(c) {
  if (!c || typeof c !== 'object') throw new HttpError(422, 'Entry content must be an object');
  const out = {};
  for (const k of ['title', 'subtitle', 'dates', 'text', 'note', 'org', 'role', 'location']) {
    if (c[k] === undefined) continue;
    if (c[k] !== null && (typeof c[k] !== 'string' || c[k].length > 4000)) throw new HttpError(422, `Invalid ${k}`, { [k]: 'Text up to 4000 characters' });
    out[k] = c[k] === null ? null : c[k].trim();
  }
  if (c.details !== undefined) {
    if (c.details !== null && (!Array.isArray(c.details) || c.details.some((d) => typeof d !== 'string'))) throw new HttpError(422, 'details must be a list of text');
    out.details = c.details === null ? null : c.details.map((d) => d.trim()).filter(Boolean).slice(0, 40);
  }
  return out;
}

function entryRow(db, cv, eid) {
  const e = db.prepare(`SELECT e.* FROM cv_entries e JOIN cv_sections s ON s.id = e.cv_section_id WHERE e.id = ? AND s.cv_profile_id = ?`).get(Number(eid), cv.id);
  if (!e) throw new HttpError(404, 'Entry not found');
  return e;
}

export function addManualEntry(db, userId, id, sid, body = {}) {
  const cv = getCvRow(db, userId, id);
  assertDraft(cv);
  const s = sectionRow(db, cv, sid);
  const content = cleanContent(body);
  if (!content.title && !content.text) throw new HttpError(422, 'Add a title or text', { title: 'Required' });
  const max = db.prepare('SELECT COALESCE(MAX(sort_order), -1) m FROM cv_entries WHERE cv_section_id = ?').get(s.id).m;
  db.prepare('INSERT INTO cv_entries (cv_section_id, custom_content_json, sort_order, included) VALUES (?, ?, ?, 1)').run(s.id, JSON.stringify(content), max + 1);
  touch(db, cv.id);
  return getCv(db, userId, cv.id);
}

/** Include/exclude an entry, or set/clear its manual override ({ override: {...} | null }). */
export function updateEntry(db, userId, id, eid, body = {}) {
  const cv = getCvRow(db, userId, id);
  assertDraft(cv);
  const e = entryRow(db, cv, eid);
  if ('included' in body) db.prepare('UPDATE cv_entries SET included = ? WHERE id = ?').run(body.included ? 1 : 0, e.id);
  if ('override' in body) {
    if (!e.source_type) {
      if (!body.override) throw new HttpError(422, 'Manual entries cannot be reset; delete them instead');
      const merged = { ...parse(e.custom_content_json, {}), ...cleanContent(body.override) };
      db.prepare('UPDATE cv_entries SET custom_content_json = ? WHERE id = ?').run(JSON.stringify(merged), e.id);
    } else {
      db.prepare('UPDATE cv_entries SET custom_content_json = ? WHERE id = ?').run(body.override ? JSON.stringify(cleanContent(body.override)) : null, e.id);
    }
  }
  touch(db, cv.id);
  return getCv(db, userId, cv.id);
}

/**
 * Apply an approved wording suggestion. The line is changed where it lives: in this CV's own override when the entry
 * was customised here, otherwise in the portfolio record (with version history). Refused if the text has changed.
 */
export function applyWording(db, userId, id, body = {}) {
  const cv = getCvRow(db, userId, id);
  assertDraft(cv);
  const original = String(body.original || '').trim();
  const suggested = String(body.suggested || '').trim();
  if (!original || !suggested || suggested.length > 2000) throw new HttpError(422, 'original and suggested text are required');
  const e = entryRow(db, cv, body.entry_id);
  const strip = (l) => l.replace(/^\s*[-•*·]\s*/, '').trim();
  const override = parse(e.custom_content_json, null);
  if (override?.details?.some((d) => strip(d) === original) || !e.source_type || e.source_type === 'profile') {
    if (!override?.details?.some((d) => strip(d) === original)) throw new HttpError(409, 'That line has changed since the review. Run the review again.');
    override.details = override.details.map((d) => (strip(d) === original ? suggested : d));
    db.prepare('UPDATE cv_entries SET custom_content_json = ? WHERE id = ?').run(JSON.stringify(override), e.id);
    audit(db, userId, 'cv_profiles', cv.id, 'update', `Applied a wording suggestion in this CV: “${original.slice(0, 60)}” → “${suggested.slice(0, 60)}”`);
    touch(db, cv.id);
    return { applied_to: 'cv', cv: getCv(db, userId, cv.id) };
  }
  const r = RESOURCES[e.source_type];
  const row = r && db.prepare(`SELECT * FROM ${r.table} WHERE id = ? AND user_id = ? AND deleted_at IS NULL`).get(e.source_id, userId);
  if (!row) throw new HttpError(404, 'The portfolio record behind this entry was not found');
  for (const [field, f] of Object.entries(r.fields)) {
    if (f.type !== 'text' || typeof row[field] !== 'string') continue;
    const lines = row[field].split(/\r?\n/);
    const i = lines.findIndex((l) => strip(l) === original);
    if (i < 0) continue;
    const prefix = (/^\s*[-•*·]\s*/.exec(lines[i]) || [''])[0];
    lines[i] = prefix + suggested;
    updateRecord(db, userId, e.source_type, row.id, { [field]: lines.join('\n') });
    touch(db, cv.id);
    return { applied_to: 'portfolio', record: { type: e.source_type, id: row.id, field }, cv: getCv(db, userId, cv.id) };
  }
  throw new HttpError(409, 'That line has changed since the review. Run the review again.');
}

export function deleteEntry(db, userId, id, eid) {
  const cv = getCvRow(db, userId, id);
  assertDraft(cv);
  const e = entryRow(db, cv, eid);
  if (e.source_type) throw new HttpError(409, 'Portfolio entries are excluded rather than deleted, so they are not offered again.');
  db.prepare('DELETE FROM cv_entries WHERE id = ?').run(e.id);
  touch(db, cv.id);
  return getCv(db, userId, cv.id);
}

export function reorderEntries(db, userId, id, sid, ids) {
  const cv = getCvRow(db, userId, id);
  assertDraft(cv);
  const s = sectionRow(db, cv, sid);
  const existing = db.prepare('SELECT id FROM cv_entries WHERE cv_section_id = ?').all(s.id).map((r) => r.id);
  if (!Array.isArray(ids) || ids.length !== existing.length || !ids.every((x) => existing.includes(Number(x)))) {
    throw new HttpError(422, 'Provide every entry id of the section exactly once');
  }
  tx(db, () => {
    ids.forEach((x, i) => db.prepare('UPDATE cv_entries SET sort_order = ? WHERE id = ?').run(i, Number(x)));
    const settings = parse(s.settings_json, {});
    settings.sort = 'manual';
    db.prepare('UPDATE cv_sections SET settings_json = ? WHERE id = ?').run(JSON.stringify(settings), s.id);
  });
  touch(db, cv.id);
  return getCv(db, userId, cv.id);
}

// ───────────────────────── Portfolio synchronisation ─────────────────────────

function pendingFor(db, userId, cvId) {
  const out = {};
  for (const s of db.prepare("SELECT * FROM cv_sections WHERE cv_profile_id = ? AND is_custom = 0").all(cvId)) {
    const def = SECTION_BY_KEY[s.section_key];
    if (!def || !sourcesOf(def).length) continue;
    const known = new Set(db.prepare('SELECT source_type, source_id FROM cv_entries WHERE cv_section_id = ? AND source_type IS NOT NULL').all(s.id)
      .map((e) => `${e.source_type}:${e.source_id}`));
    const items = eligible(db, userId, def).filter(({ type, row }) => !known.has(`${type}:${row.id}`))
      .map(({ type, row }) => ({ type, id: row.id, title: row[RESOURCES[type].title] || row._course_title || `${RESOURCES[type].label} #${row.id}` }));
    if (items.length) out[s.id] = items;
  }
  return out;
}

export function pendingCount(db, userId, cvId) {
  return Object.values(pendingFor(db, userId, cvId)).reduce((n, l) => n + l.length, 0);
}

/** Add (or dismiss) new portfolio records offered to a CV. Never runs on finalized CVs. */
export function syncPending(db, userId, id, { section_id = null, action = 'add', items = null } = {}) {
  const cv = getCvRow(db, userId, id);
  assertDraft(cv);
  if (!['add', 'dismiss'].includes(action)) throw new HttpError(422, 'action must be add or dismiss');
  const pending = pendingFor(db, userId, cv.id);
  let n = 0;
  tx(db, () => {
    for (const [sid, list] of Object.entries(pending)) {
      if (section_id && Number(section_id) !== Number(sid)) continue;
      const max = db.prepare('SELECT COALESCE(MAX(sort_order), -1) m FROM cv_entries WHERE cv_section_id = ?').get(sid).m;
      list.filter((p) => !items || items.some((i) => i.type === p.type && Number(i.id) === p.id)).forEach((p, i) => {
        db.prepare('INSERT INTO cv_entries (cv_section_id, source_type, source_id, sort_order, included) VALUES (?, ?, ?, ?, ?)')
          .run(Number(sid), p.type, p.id, max + 1 + i, action === 'add' ? 1 : 0);
        n += 1;
      });
    }
  });
  if (n) {
    touch(db, cv.id);
    audit(db, userId, 'cv_profiles', cv.id, 'update', `${action === 'add' ? 'Added' : 'Dismissed'} ${n} portfolio record(s) ${action === 'add' ? 'to' : 'for'} CV: ${cv.name}`);
  }
  return getCv(db, userId, cv.id);
}

// ───────────────────────── Composition ─────────────────────────

function resolveEntries(db, userId, cv, s, def, settings, p) {
  const entries = db.prepare('SELECT * FROM cv_entries WHERE cv_section_id = ? ORDER BY sort_order, id').all(s.id);
  const bySource = {};
  for (const e of entries) if (e.source_type && e.source_type !== 'profile') (bySource[e.source_type] ||= []).push(e.source_id);
  const rows = {};
  for (const [type, ids] of Object.entries(bySource)) {
    for (const r of loadRows(db, userId, type, ids)) rows[`${type}:${r.id}`] = r;
  }
  const o = { dateStyle: settings.date_style, showLicenseNumbers: settings.show_license_numbers };
  return entries.map((e) => {
    const override = parse(e.custom_content_json, null);
    let base = {};
    let source = null;
    let missing = [];
    if (e.source_type === 'profile') {
      base = def.fromProfile(p);
      missing = base.missing || [];
      source = { type: 'profile', id: p.id };
    } else if (e.source_type) {
      const row = rows[`${e.source_type}:${e.source_id}`];
      if (!row) return { id: e.id, included: !!e.included, removed: true, source: { type: e.source_type, id: e.source_id }, title: '(record removed from portfolio)' };
      base = def.map(row, o, e.source_type);
      missing = base.missing || [];
      source = { type: e.source_type, id: row.id, verification: row.verification || null };
    }
    const content = { ...base, ...(override || {}) };
    delete content.missing;
    return {
      id: e.id, included: !!e.included, sort_order: e.sort_order, manual: !e.source_type, overridden: !!(override && e.source_type),
      kind: def?.kind || 'item', source, missing, override: e.source_type ? override : null,
      title: content.title || null, subtitle: content.subtitle || null, dates: content.dates || null, note: content.note || null,
      org: content.org || null, role: content.role || null, location: content.location || null,
      details: def?.kind === 'list' ? [] : content.details || [], text: content.text || null,
      // List sections: an override's lines, the profile's items, or — for manual entries — the typed text split on semicolons.
      items: def?.kind === 'list'
        ? (override?.details?.length ? override.details
          : content.items?.length ? content.items
            : [content.title, content.text, ...(content.details || [])].filter(Boolean).flatMap((t) => String(t).split(/;\s*/)).filter(Boolean))
        : content.items || null,
      sortDate: base.sortDate || null,
    };
  });
}

function sortEntries(list, mode, dateOrder) {
  if (mode === 'manual') return list;
  const dir = dateOrder === 'chronological' ? 1 : -1;
  return [...list].sort((a, b) => {
    const x = a.sortDate || '', y = b.sortDate || '';
    if (x === y) return a.sort_order - b.sort_order;
    if (!x) return 1;
    if (!y) return -1;
    return x < y ? -dir : dir;
  });
}

/** Editor view: every section (visible or not) with all entries, pending portfolio records and source details. */
export function getCv(db, userId, id) {
  const cv = getCvRow(db, userId, id);
  const settings = settingsOf(cv);
  const p = profileRow(db, userId);
  const pending = cv.status === 'draft' ? pendingFor(db, userId, cv.id) : {};
  const sections = db.prepare('SELECT * FROM cv_sections WHERE cv_profile_id = ? ORDER BY sort_order, id').all(cv.id).map((s) => {
    const def = SECTION_BY_KEY[s.section_key] || { kind: 'item', source: null };
    const st = parse(s.settings_json, {});
    const entries = sortEntries(resolveEntries(db, userId, cv, s, def, settings, p), st.sort || 'auto', settings.date_order);
    return {
      id: s.id, key: s.section_key, heading: s.heading, default_heading: def.heading || null, ats_heading: def.ats || null,
      visible: !!s.visible, custom: !!s.is_custom, kind: def.kind || 'item', source: def.source ?? null,
      sort: st.sort || 'auto', page_break_before: !!st.page_break_before,
      entries, pending: pending[s.id] || [],
    };
  });
  const photo = cv.photo_image_id ? db.prepare('SELECT id, label, width, height FROM uploaded_images WHERE id = ? AND deleted_at IS NULL').get(cv.photo_image_id) : null;
  return {
    id: cv.id, name: cv.name, cv_type: cv.cv_type, status: cv.status, version: cv.version, family_id: cv.family_id,
    template_key: cv.template_key, template_name: cv.template_name, photo_image_id: photo ? photo.id : null, photo,
    finalized_at: cv.finalized_at, created_at: cv.created_at, updated_at: cv.updated_at,
    approval: parse(cv.approval_json, null),
    settings, sections, pending_total: Object.values(pending).reduce((n, l) => n + l.length, 0),
    versions: db.prepare('SELECT id, version, status, finalized_at, updated_at FROM cv_profiles WHERE family_id = ? AND user_id = ? AND deleted_at IS NULL ORDER BY version DESC').all(cv.family_id, userId),
  };
}

/**
 * The document model every renderer uses. mode 'ats' forces the ATS template, conventional headings and no photo.
 * Finalized CVs are rendered from their frozen snapshot.
 */
export function composeCv(db, userId, id, { mode = 'visual' } = {}) {
  const cv = getCvRow(db, userId, id);
  if (cv.status === 'finalized' && cv.snapshot_json) {
    const snap = parse(cv.snapshot_json, null);
    if (snap?.[mode]) return snap[mode];
  }
  return buildModel(db, userId, cv, mode);
}

function buildModel(db, userId, cv, mode) {
  const view = getCv(db, userId, cv.id);
  const settings = view.settings;
  const ats = mode === 'ats';
  const p = profileRow(db, userId);
  const tplKey = ats ? 'minimal_ats' : view.template_key;
  const sections = view.sections
    .filter((s) => s.visible)
    .map((s) => {
      const usedDefault = !s.custom && s.heading === s.default_heading;
      const entries = s.entries.filter((e) => e.included && !e.removed)
        .filter((e) => e.text || e.title || (e.items && e.items.length) || e.details.length);
      return {
        id: s.id, key: s.key, kind: s.kind, page_break_before: s.page_break_before,
        heading: ats && usedDefault && s.ats_heading ? s.ats_heading : s.heading,
        custom_heading: s.custom || !usedDefault,
        entries: entries.map(({ id, kind, title, subtitle, dates, note, details, text, items, source, missing, manual, org, role, location, overridden, override }) => {
          // A per-CV rewording of title/subtitle takes precedence over the Harvard organization/role lines.
          const reworded = overridden && override && (override.title !== undefined || override.subtitle !== undefined) && override.org === undefined && override.role === undefined;
          return { id, kind, title, subtitle, dates, note, details, text, items, source, missing, manual,
            org: reworded ? null : org, role: reworded ? null : role, location: reworded ? null : location };
        }),
      };
    })
    .filter((s) => !(settings.hide_empty && s.entries.length === 0));
  // In ATS mode, merge sections that map to the same conventional heading (e.g. Committee Memberships → Institutional Service).
  const merged = [];
  for (const s of sections) {
    const prev = ats ? merged.find((m) => m.heading === s.heading) : null;
    if (prev) prev.entries.push(...s.entries); else merged.push({ ...s, entries: [...s.entries] });
  }
  const photo = !ats && settings.show_photo && view.photo
    ? db.prepare('SELECT id, optimized_path, original_path, mime_type, width, height FROM uploaded_images WHERE id = ?').get(view.photo.id) : null;
  return {
    meta: {
      cv_id: cv.id, name: view.name, cv_type: view.cv_type, version: view.version, status: view.status, mode,
      template_key: tplKey, template_name: TEMPLATES[tplKey]?.name, generated_at: now(),
    },
    settings: ats ? { ...settings, show_photo: false } : settings,
    header: {
      name: p.full_name || null,
      title: [p.professional_title, p.academic_designation].filter(Boolean).join(', ') || null,
      contact: [p.email, p.phone, p.address, p.website].filter(Boolean),
      email: p.email || null, phone: p.phone || null,
      photo: photo && photo.optimized_path ? { id: photo.id, path: photo.optimized_path, mime: 'image/jpeg' } : null,
      photo_requested: !ats && settings.show_photo,
    },
    sections: merged,
  };
}

export function finalizeCv(db, userId, id, approval) {
  const cv = getCvRow(db, userId, id);
  assertDraft(cv);
  const snapshot = { visual: buildModel(db, userId, cv, 'visual'), ats: buildModel(db, userId, cv, 'ats') };
  for (const m of Object.values(snapshot)) { m.meta.status = 'finalized'; }
  db.prepare("UPDATE cv_profiles SET status = 'finalized', finalized_at = ?, snapshot_json = ?, approval_json = ?, updated_at = ? WHERE id = ?")
    .run(now(), JSON.stringify(snapshot), JSON.stringify(approval || null), now(), cv.id);
  audit(db, userId, 'cv_profiles', cv.id, 'update', `Approved and finalized CV: ${cv.name} (v${cv.version})`);
  return getCv(db, userId, cv.id);
}
