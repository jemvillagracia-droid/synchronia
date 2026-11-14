// Knowledge and References: the file-reference library (no duplicate files, no duplicate references), the unified
// professional timeline, and the portable archive that keeps the owner free of lock-in.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import JSZip from 'jszip';
import { DATA_DIR, APP_NAME, APP_VERSION } from '../config.js';
import { RESOURCES } from '../resources.js';
import { HttpError, createHooks, dateEnd, dateStart, displayTitle, driveFileId, getResource } from '../repo.js';
import { decrypt } from '../secrets.js';

const parse = (j, d) => { try { return j ? JSON.parse(j) : d; } catch { return d; } };
const ISO = /^\d{4}-\d{2}-\d{2}$/;

// ───────────────────────── File-reference library ─────────────────────────

const normUrl = (u) => String(u || '').trim();

/** Same provider and same Drive file ID or same link/path → it is the same file. */
export function findDuplicate(db, userId, { provider, external_id, url }, exceptId = null) {
  const ext = external_id || (provider === 'google_drive' ? driveFileId(url) : null);
  const byId = ext && db.prepare('SELECT id, title FROM external_file_references WHERE user_id = ? AND provider = ? AND external_id = ? AND deleted_at IS NULL AND id IS NOT ?').get(userId, provider, ext, exceptId);
  if (byId) return byId;
  const u = normUrl(url);
  return u ? db.prepare('SELECT id, title FROM external_file_references WHERE user_id = ? AND provider = ? AND url = ? AND deleted_at IS NULL AND id IS NOT ?').get(userId, provider, u, exceptId) || null : null;
}

createHooks.file_references = (db, userId, input) => {
  if (input.url) input.url = normUrl(input.url);
  if (input.provider === 'google_drive' && !input.external_id && input.url) input.external_id = driveFileId(input.url);
  const dup = input.provider && findDuplicate(db, userId, input);
  if (dup) throw new HttpError(409, `This file is already in your library as “${dup.title}”.`, { existing_id: dup.id });
  return input;
};

function usage(db, userId, ids) {
  if (!ids.length) return {};
  const rows = db.prepare(`SELECT file_ref_id, entity_type, entity_id, created_at FROM evidence_links WHERE user_id = ? AND file_ref_id IN (${ids.map(() => '?').join(',')}) ORDER BY id`).all(userId, ...ids);
  const out = {};
  for (const l of rows) {
    const r = RESOURCES[l.entity_type];
    const target = r && db.prepare(`SELECT * FROM ${r.table} WHERE id = ? AND user_id = ? AND deleted_at IS NULL`).get(l.entity_id, userId);
    if (!target) continue;
    (out[l.file_ref_id] ||= []).push({ type: l.entity_type, id: l.entity_id, label: r.label, module: r.module, title: displayTitle(r, target), linked_at: l.created_at });
  }
  return out;
}

export function library(db, userId, q = {}) {
  const where = ['user_id = ?', 'deleted_at IS NULL'];
  const params = [userId];
  if (q.provider) {
    if (!['google_drive', 'url', 'local_path'].includes(q.provider)) throw new HttpError(422, 'Unknown provider');
    where.push('provider = ?'); params.push(q.provider);
  }
  if (q.q) {
    const like = `%${String(q.q).slice(0, 100).replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
    where.push("(title LIKE ? ESCAPE '\\' OR url LIKE ? ESCAPE '\\')"); params.push(like, like);
  }
  const rows = db.prepare(`SELECT * FROM external_file_references WHERE ${where.join(' AND ')} ORDER BY updated_at DESC, id DESC LIMIT 1000`).all(...params);
  const used = usage(db, userId, rows.map((r) => r.id));
  let items = rows.map((r) => ({
    id: r.id, provider: r.provider, external_id: r.external_id, url: r.url, title: r.title, mime_type: r.mime_type,
    metadata: parse(r.metadata_json, {}), metadata_checked_at: r.metadata_checked_at, created_at: r.created_at, updated_at: r.updated_at,
    used_by: used[r.id] || [],
  }));
  if (q.usage === 'linked') items = items.filter((i) => i.used_by.length);
  if (q.usage === 'unlinked') items = items.filter((i) => !i.used_by.length);
  const all = db.prepare("SELECT provider, COUNT(*) n FROM external_file_references WHERE user_id = ? AND deleted_at IS NULL GROUP BY provider").all(userId);
  return { items, counts: Object.fromEntries(all.map((x) => [x.provider, x.n])) };
}

// ───────────────────────── Unified professional timeline ─────────────────────────

const SEM = { first: '1st Semester', second: '2nd Semester', summer: 'Summer', other: 'Term' };
const TERM_DATE = (ay, sem) => { const y = Number(ay.slice(0, 4)); return sem === 'second' ? `${y + 1}-01-01` : sem === 'summer' ? `${y + 1}-06-01` : `${y}-08-01`; };

/** Which records become timeline events, and how. Each event links back to its record. */
const SOURCES = [
  ['employment', 'employment', [['start_date', (r) => `Started as ${r.position}${r.institution ? `, ${r.institution}` : ''}`], ['end_date', (r) => `Ended service as ${r.position}${r.institution ? `, ${r.institution}` : ''}`]]],
  ['appointments', 'appointments', [['start_date', (r) => `Appointed ${r.academic_rank}${r.institution ? `, ${r.institution}` : ''}`]]],
  ['education', 'qualifications', [['graduation_date', (r) => `Completed ${r.degree}${r.institution ? `, ${r.institution}` : ''}`], ['start_date', (r) => `Began ${r.degree}`, (r) => !r.graduation_date]]],
  ['licenses', 'licenses', [['registration_date', (r) => `Licensed: ${r.license_type}${r.issuing_authority ? ` (${r.issuing_authority})` : ''}`]]],
  ['trainings', 'trainings', [['start_date', (r) => (['speaker', 'facilitator', 'organizer'].includes(r.role) ? `${r.role[0].toUpperCase()}${r.role.slice(1)}: ${r.title}` : r.title)]]],
  ['publications', 'publications', [['publication_date', (r) => `Published: ${r.title}`, (r) => r.status === 'published']]],
  ['presentations', 'publications', [['presentation_date', (r) => `Presented: ${r.title}${r.conference ? ` — ${r.conference}` : ''}`]]],
  ['awards', 'awards', [['date_received', (r) => `${r.title}${r.issuer ? ` — ${r.issuer}` : ''}`]]],
  ['research_projects', 'research', [['start_date', (r) => `Started research: ${r.title}`, (r) => r.status !== 'idea'], ['end_date', (r) => `Completed research: ${r.title}`, (r) => r.status === 'completed']]],
  ['extension_projects', 'extension', [['start_date', (r) => `${r.title}${r.partner ? ` — ${r.partner}` : ''}`]]],
  ['committees', 'service', [['start_date', (r) => `${r.role ? `${r.role}, ` : ''}${r.committee}`]]],
  ['memberships', 'service', [['start_date', (r) => `Member: ${r.organization}`]]],
  ['portfolio_entries', 'accomplishments', [['event_date', (r) => r.title]]],
];
export const TIMELINE_CATEGORIES = ['employment', 'appointments', 'qualifications', 'licenses', 'trainings', 'publications', 'awards', 'teaching', 'research', 'extension', 'service', 'accomplishments'];

function support(row, evidence) {
  if (evidence > 0 || row.verification === 'evidence_verified') return 'evidenced';
  if (!('verification' in row)) return 'system';
  return row.verification === 'user_confirmed' ? 'confirmed' : 'self_reported';
}

export function timeline(db, userId, q = {}) {
  if ((q.from && !ISO.test(q.from)) || (q.to && !ISO.test(q.to))) throw new HttpError(422, 'Dates must be YYYY-MM-DD');
  const cats = q.categories ? String(q.categories).split(',').filter(Boolean) : TIMELINE_CATEGORIES;
  const bad = cats.filter((c) => !TIMELINE_CATEGORIES.includes(c));
  if (bad.length) throw new HttpError(422, `Unknown category: ${bad.join(', ')}`);
  const events = [];
  const ev = db.prepare('SELECT entity_type, entity_id, COUNT(*) n FROM evidence_links GROUP BY entity_type, entity_id').all();
  const evMap = new Map(ev.map((e) => [`${e.entity_type}:${e.entity_id}`, e.n]));
  for (const [type, category, rules] of SOURCES) {
    if (!cats.includes(category)) continue;
    const r = getResource(type);
    for (const row of db.prepare(`SELECT * FROM ${r.table} WHERE user_id = ? AND deleted_at IS NULL`).all(userId)) {
      const evidence = evMap.get(`${type}:${row.id}`) || 0;
      for (const [field, title, when] of rules) {
        if (!row[field] || (when && !when(row))) continue;
        events.push({ date: row[field], category, title: title(row), type, id: row.id, label: r.label, kind: field,
          support: support(row, evidence), evidence, recorded_at: row.created_at.slice(0, 10) });
      }
    }
  }
  if (cats.includes('teaching')) {
    // One event per term, listing the classes handled (from teaching assignments).
    const rows = db.prepare(`SELECT a.*, c.code FROM teaching_assignments a JOIN courses c ON c.id = a.course_id
        WHERE a.user_id = ? AND a.deleted_at IS NULL AND a.academic_year GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9][0-9][0-9]' ORDER BY a.academic_year, a.semester, c.code`).all(userId);
    const terms = new Map();
    for (const a of rows) {
      const k = `${a.academic_year}|${a.semester}`;
      if (!terms.has(k)) terms.set(k, []);
      terms.get(k).push(a);
    }
    for (const [k, list] of terms) {
      const [ay, sem] = k.split('|');
      const classes = list.map((a) => `${a.code}${a.section ? ` ${a.section}` : ''}`);
      events.push({ date: TERM_DATE(ay, sem), precision: 'term', term_label: `${SEM[sem] || 'Term'}, SY ${ay.replace('-', '–')}`, category: 'teaching',
        title: `Taught ${list.length} class${list.length > 1 ? 'es' : ''}: ${classes.join(', ')}`, type: 'teaching_assignments', id: list[0].id, label: 'Teaching Assignment',
        kind: 'term', support: 'system', evidence: 0, recorded_at: list.map((a) => a.created_at.slice(0, 10)).sort()[0], ids: list.map((a) => a.id) });
    }
  }
  let out = events;
  if (q.from) out = out.filter((e) => dateEnd(e.date) >= q.from);
  if (q.to) out = out.filter((e) => dateStart(e.date) <= q.to);
  if (q.q) { const s = String(q.q).toLowerCase(); out = out.filter((e) => e.title.toLowerCase().includes(s)); }
  out.sort((a, b) => (b.date.localeCompare(a.date)) || a.title.localeCompare(b.title));
  // A retrospective entry: recorded more than 30 days after the event happened.
  for (const e of out) { e.retrospective = (Date.parse(e.recorded_at) - Date.parse(dateEnd(e.date))) / 86400000 > 30; e.precision ||= e.date.length === 4 ? 'year' : e.date.length === 7 ? 'month' : 'day'; }
  const years = {};
  for (const e of out) years[e.date.slice(0, 4)] = (years[e.date.slice(0, 4)] || 0) + 1;
  return { events: out, total: out.length, years, categories: TIMELINE_CATEGORIES };
}

// ───────────────────────── Portable archive ─────────────────────────

const csvCell = (v) => {
  if (v == null) return '';
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const toCsv = (rows) => {
  if (!rows.length) return '';
  const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  return `﻿${[cols.join(','), ...rows.map((r) => cols.map((c) => csvCell(r[c])).join(','))].join('\r\n')}\r\n`;
};

function addDir(zip, abs, prefix, manifest) {
  if (!fs.existsSync(abs)) return;
  for (const name of fs.readdirSync(abs)) {
    const p = path.join(abs, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) addDir(zip, p, `${prefix}/${name}`, manifest);
    else {
      const buf = fs.readFileSync(p);
      zip.file(`${prefix}/${name}`, buf);
      manifest.files.push({ path: `${prefix}/${name}`, bytes: buf.length, sha256: crypto.createHash('sha256').update(buf).digest('hex') });
    }
  }
}

/**
 * A complete, open-format export: every record as JSON and as CSV, generated documents, CV images and letterhead,
 * with a manifest of SHA-256 checksums. Encrypted fields are left out unless the owner asks for them; access
 * tokens and the encryption key are never exported.
 */
export async function archive(db, userId, { includeSecrets = false } = {}) {
  const zip = new JSZip();
  const manifest = { application: APP_NAME, version: APP_VERSION, exported_at: new Date().toISOString(), format: 1, include_secrets: !!includeSecrets, records: {}, files: [] };
  const data = {};
  const profile = db.prepare('SELECT * FROM professional_profiles WHERE user_id = ?').get(userId);
  if (profile) { const { user_id, ...p } = profile; data.professional_profile = p; }
  data.preferences = (({ user_id, ...p }) => p)(db.prepare('SELECT * FROM user_profiles WHERE user_id = ?').get(userId) || {});
  const inst = db.prepare('SELECT data_json FROM institution_settings WHERE user_id = ?').get(userId);
  data.institution = parse(inst?.data_json, {});
  for (const r of Object.values(RESOURCES)) {
    const secretFields = Object.entries(r.fields).filter(([, f]) => f.type === 'secret').map(([n]) => n);
    const rows = db.prepare(`SELECT * FROM ${r.table} WHERE user_id = ? ORDER BY id`).all(userId).map((row) => {
      const { user_id, ...x } = row;
      for (const n of secretFields) {
        if (includeSecrets && x[`${n}_enc`]) { try { x[n] = decrypt(x[`${n}_enc`]); } catch { x[n] = null; } }
        delete x[`${n}_enc`];
      }
      for (const [n, f] of Object.entries(r.fields)) if (f.type === 'json' && typeof x[n] === 'string') x[n] = parse(x[n], x[n]);
      return x;
    });
    data[r.key] = rows;
    manifest.records[r.key] = rows.length;
    if (rows.length) zip.file(`csv/${r.key}.csv`, toCsv(rows.map((x) => Object.fromEntries(Object.entries(x).map(([k, v]) => [k, v])))));
  }
  const extra = {
    evidence_links: 'SELECT * FROM evidence_links WHERE user_id = ?',
    document_routes: 'SELECT * FROM document_routes WHERE user_id = ?',
    outcome_alignments: 'SELECT a.* FROM outcome_alignments a JOIN learning_outcomes o ON o.id = a.course_outcome_id WHERE o.user_id = ?',
    cv_sections: 'SELECT s.* FROM cv_sections s JOIN cv_profiles p ON p.id = s.cv_profile_id WHERE p.user_id = ?',
    cv_entries: 'SELECT e.* FROM cv_entries e JOIN cv_sections s ON s.id = e.cv_section_id JOIN cv_profiles p ON p.id = s.cv_profile_id WHERE p.user_id = ?',
    cv_exports: 'SELECT * FROM cv_exports WHERE user_id = ?',
    uploaded_images: 'SELECT * FROM uploaded_images WHERE user_id = ?',
    reports: 'SELECT id, report_type, title, period_start, period_end, format, file_path, params_json, created_at FROM reports WHERE user_id = ?',
    audit_logs: 'SELECT id, entity_type, entity_id, action, summary, created_at FROM audit_logs WHERE user_id = ?',
  };
  for (const [k, sql] of Object.entries(extra)) {
    let rows = [];
    try { rows = db.prepare(sql).all(userId).map(({ user_id, ...x }) => x); } catch { rows = []; }
    data[k] = rows;
    manifest.records[k] = rows.length;
    if (rows.length) zip.file(`csv/${k}.csv`, toCsv(rows));
  }
  const json = Buffer.from(JSON.stringify(data, null, 2));
  zip.file('data/records.json', json);
  manifest.files.push({ path: 'data/records.json', bytes: json.length, sha256: crypto.createHash('sha256').update(json).digest('hex') });
  addDir(zip, path.join(DATA_DIR, 'exports'), 'files/exports', manifest);
  addDir(zip, path.join(DATA_DIR, 'images'), 'files/images', manifest);
  addDir(zip, path.join(DATA_DIR, 'letterhead'), 'files/letterhead', manifest);
  zip.file('manifest.json', JSON.stringify(manifest, null, 2));
  zip.file('README.txt', [
    `${APP_NAME} export — ${manifest.exported_at}`,
    '',
    'data/records.json   Every record, grouped by type (open JSON).',
    'csv/*.csv           The same records as spreadsheets (UTF-8 with BOM, opens in Excel).',
    'files/              Generated documents and CV exports, CV photographs and the letterhead images.',
    'manifest.json       Record counts and a SHA-256 checksum for every file.',
    '',
    includeSecrets ? 'Encrypted fields (e.g. licence numbers) are INCLUDED in plain text. Keep this file safe.'
      : 'Encrypted fields (e.g. licence numbers) are left out. Export again with “include protected fields” if you need them.',
    'Google Drive files are not copied: they stay in your Drive. References keep their Drive file IDs and links.',
    'Access tokens and the encryption key are never exported.',
    '',
  ].join('\r\n'));
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } });
}
