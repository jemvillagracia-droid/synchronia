// Brings a credentials tracker workbook (Excel) into SYNCHRONIA: each sheet's rows become portfolio records, each record
// is claimed under its DBM-CHED indicator, and the tracker's "secured?" columns become the claim's document checklist.
// Rows marked as future or aspirational become planned goals. Sheets are recognised by their names and headers, so a
// tracker laid out like "The Absolute Dogma of Being" (education, licences, creative works, resource speakerships,
// research publications, professional organisations, awards) imports without set-up. Nothing is saved until the
// reviewed rows are sent back to commit().
import ExcelJS from 'exceljs';
import { HttpError, create } from '../repo.js';
import { RESOURCES } from '../resources.js';
import { tx } from '../db.js';
import { INDICATORS, suggest, addClaim } from './jc.js';

const KINDS = [
  ['education', /educational|education|attainment/i],
  ['licenses', /licen[cs]e|eligibilit/i],
  ['creative', /creative/i],
  ['speaking', /speaker|speakership|resource person/i],
  ['research', /research|publication|scholarly/i],
  ['organizations', /organi[sz]ation|membership/i],
  ['awards', /award|recognition/i],
];
const SKIP = /cover|legend|dashboard|summary|instruction/i;

const text = (v) => {
  if (v == null) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object') return text(v.result ?? v.text ?? (v.richText ? v.richText.map((t) => t.text).join('') : ''));
  return String(v).replace(/\s+/g, ' ').trim();
};
const norm = (s) => text(s).toLowerCase();
/** A document status written as ✔ YES / ✘ NO / 🔄 PENDING / — N/A / ☐ Future. */
function status(v) {
  const s = text(v);
  if (!s) return null;
  if (/☐|future/i.test(s)) return 'future';
  if (/✔|\byes\b|secured|✓/i.test(s)) return 'secured';
  if (/✘|\bno\b|missing|✗/i.test(s)) return 'missing';
  if (/pending|🔄|awaiting|in progress/i.test(s)) return 'pending';
  if (/n\/a|^—|^-$|not applicable/i.test(s)) return 'na';
  return null;
}
/** Dates written as 2024-10-12, "July 6, 2022", "March 2025", 2019 or "2010-2014" (the last year is kept). */
function date(v) {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = text(v);
  if (/^\d{4}(\.0)?$/.test(s)) return s.slice(0, 4);
  let m = s.match(/^(\d{4})\s*[-–]\s*(\d{4})$/); if (m) return m[2];
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return m[0];
  const d = new Date(s.replace(/(\d)(st|nd|rd|th)\b/g, '$1'));
  if (!Number.isNaN(d.getTime()) && /\d{4}/.test(s)) {
    const y = d.getFullYear(); const mo = String(d.getMonth() + 1).padStart(2, '0'); const da = String(d.getDate()).padStart(2, '0');
    return /^[A-Za-z]+\.?\s+\d{4}$/.test(s) ? `${y}-${mo}` : `${y}-${mo}-${da}`;
  }
  m = s.match(/\b(19|20)\d{2}\b/); return m ? m[0] : null;
}

/** Finds the header row (the first row with at least three labelled cells that are not a title) and maps column names. */
function table(ws) {
  for (let r = 1; r <= Math.min(ws.rowCount, 12); r++) {
    const cells = []; ws.getRow(r).eachCell({ includeEmpty: false }, (c, col) => cells.push([col, norm(c.value)]));
    // A merged title repeats its text across the merged columns, so a header needs at least four different labels.
    if (new Set(cells.map(([, h]) => h).filter(Boolean)).size >= 4) {
      const cols = {}; for (const [c, h] of cells) if (h && !(h in cols)) cols[h] = c;
      const rows = [];
      for (let i = r + 1; i <= ws.rowCount; i++) {
        const row = ws.getRow(i); const vals = {};
        for (const [h, col] of Object.entries(cols)) vals[h] = row.getCell(col).value;
        const first = text(Object.values(vals).find((v) => text(v)));
        if (!first || /^ⓘ|^▌|^\(add /i.test(first)) continue;
        if (new Set(Object.values(vals).map(text).filter(Boolean)).size < 2) continue; // a merged note or section label
        rows.push({ line: i, vals });
      }
      return { header: Object.keys(cols), rows };
    }
  }
  return { header: [], rows: [] };
}
const col = (vals, re) => { for (const [h, v] of Object.entries(vals)) if (re.test(h)) return v; return null; };

/** One planned import row: the record to create, and how it is claimed. */
function plan(kind, vals) {
  const g = (re) => text(col(vals, re));
  const st = (re) => status(col(vals, re));
  switch (kind) {
    case 'education': {
      const level = g(/^level/); const degree = g(/degree|qualification/);
      if (!degree || /elementary|secondary|high school/i.test(level + degree)) return null;
      const future = /aspiration|planned|future/i.test(level); const ongoing = /progress|ongoing/i.test(level);
      const rec = { degree, major: g(/field/) || null, institution: g(/institution|school/) || 'Not yet chosen', status: future || ongoing ? 'ongoing' : 'completed',
        graduation_date: future ? null : date(col(vals, /year|completed/)), distinctions: g(/honou?rs|award/) || null };
      const cav = st(/cav|diploma/); const tor = st(/transcript|tor\b/); const equiv = st(/equivalen/);
      return { type: 'education', record: rec, planned: future || ongoing, docs: { 0: cav === 'secured' || tor === 'secured' ? 'secured' : cav === 'pending' || tor === 'pending' ? 'pending' : cav === 'missing' || tor === 'missing' ? 'missing' : null, 1: equiv === 'na' ? 'na' : null }, remark: g(/remark|action/) };
    }
    case 'licenses': {
      const title = g(/title|eligibility/) || g(/exam/); const statusText = g(/registration status|^status/);
      if (!title || /planned|review|future/i.test(statusText + g(/number/))) return null; // a licence not yet held is not a record
      return { type: 'licenses', record: { license_type: title, issuing_authority: /civil service|cse/i.test(g(/exam/) + title) ? 'Civil Service Commission' : 'Professional Regulation Commission', registration_date: date(col(vals, /date of exam/)) }, noClaim: true,
        why: 'Licences and eligibilities are kept in the portfolio; the 2026 guidelines give them no separate points.' };
    }
    case 'creative': {
      const title = g(/^title/); if (!title) return null;
      const type = g(/^type/) || 'Creative work'; const pub = g(/publisher/); const when = g(/publication date|date/);
      const future = /planned|tbd|future/i.test(when + g(/remark|action/) + g(/cover page/));
      return { type: 'portfolio_entries', record: { category: `Creative work — ${type}`, title, event_date: future ? null : date(when),
        description: [g(/anthology|collection/) && `In ${g(/anthology|collection/)}`, pub && `Publisher: ${pub}`, g(/isbn/) && `ISBN ${g(/isbn/)}`, g(/author name/) && `Author name used: ${g(/author name/)}`].filter(Boolean).join('. ') || null },
      planned: future, docs: { 0: st(/cover page|toc/) }, remark: g(/remark|action/) };
    }
    case 'speaking': {
      const topic = g(/topic|title/); if (!topic) return null;
      const intl = /int'?l|international/i.test(g(/level/));
      return { type: 'trainings', record: { title: topic, role: 'speaker', training_type: 'seminar', organizer: g(/host|organi[sz]ation/) || null, location: g(/location|venue/) || null, start_date: date(col(vals, /^date/)) },
        indicator: intl ? 'III.B.1.5.2' : 'III.B.1.5.1',
        docs: { 0: st(/invitation/), 1: st(/program/), 2: st(/certificate/), 3: st(/authori[sz]ation/) }, remark: g(/remark|action/) };
    }
    case 'research': {
      const title = g(/research title|^title/); if (!title) return null;
      const type = g(/output type|type/); const venue = g(/journal|proceedings/) || g(/publisher|venue/);
      const authors = g(/author/) || 'Not recorded';
      if (/presented/i.test(type)) {
        const intl = /international/i.test(type + venue);
        return { type: 'presentations', record: { title, conference: venue || 'Conference', authors, presentation_date: date(col(vals, /date/)), presentation_type: 'oral' },
          indicator: intl ? 'IV.B.3.2' : 'IV.B.3.1', docs: { 2: st(/printout|link to/), 0: null }, remark: g(/remark|action/) };
      }
      const pending = /pending|for publication|submitted|tbd/i.test(type + g(/date/));
      return { type: 'publications', record: { title, authors, publication_type: 'journal_article', venue: venue || null, publication_date: pending ? null : date(col(vals, /date/)), doi: /doi\.org|^10\./i.test(g(/doi|link/)) ? g(/doi|link/) : null, status: pending ? 'in_preparation' : 'published' },
        indicator: 'II.A.3', planned: pending, docs: { 0: st(/printout|link to/), 1: st(/peer review|index/) }, remark: g(/remark|action/) };
    }
    case 'organizations': {
      const org = g(/organi[sz]ation name|^organi[sz]ation/); if (!org) return null;
      const s = g(/^status/);
      return { type: 'memberships', record: { organization: org, membership_type: [g(/membership type/), g(/role|position/)].filter(Boolean).join(' — ') || null, is_current: !/inactive|lapsed|former/i.test(s), start_date: date(col(vals, /year joined/)) },
        indicator: 'IV.A.1', docs: { 0: st(/certificate of membership|id card/), 3: st(/certification of engagement|engagement/), 1: st(/profile/) }, remark: g(/remark|action/) };
    }
    case 'awards': {
      const title = g(/award|recognition title|^title/); if (!title) return null;
      return { type: 'awards', record: { title, issuer: g(/awarding organi[sz]ation|organi[sz]ation/) || null, level: g(/^level/) || null, date_received: date(col(vals, /year|date/)) },
        docs: { 1: st(/certificate|photo/), 3: st(/profile/), 2: st(/criteria|mechanics/) }, remark: g(/remark|action/) };
    }
    default: return null;
  }
}

export async function previewTracker(db, userId, buffer) {
  if (!buffer?.length) throw new HttpError(422, 'Choose the tracker workbook (.xlsx) to import');
  const wb = new ExcelJS.Workbook();
  try { await wb.xlsx.load(buffer); } catch { throw new HttpError(422, 'That file is not an Excel workbook (.xlsx) SYNCHRONIA can read'); }
  const sheets = []; const skipped = [];
  for (const ws of wb.worksheets) {
    const name = ws.name.replace(/^[^\p{L}\p{N}]+/u, '').trim();
    if (SKIP.test(name)) { skipped.push({ sheet: name, why: 'Overview sheet — the checklist dashboard replaces it' }); continue; }
    const kind = KINDS.find(([, re]) => re.test(name))?.[0];
    if (!kind) { skipped.push({ sheet: name, why: 'Not recognised' }); continue; }
    const { rows } = table(ws);
    const out = [];
    for (const { line, vals } of rows) {
      const p = plan(kind, vals);
      if (!p) continue;
      const res = RESOURCES[p.type];
      const titleField = res.title;
      const existing = db.prepare(`SELECT id FROM ${res.table} WHERE user_id = ? AND deleted_at IS NULL AND lower(${titleField}) = lower(?)`).get(userId, String(p.record[titleField] || ''));
      // Planned degrees are matched as if completed, so the goal shows the points it will earn.
      const indicator = p.noClaim ? null : p.indicator || suggest(p.type, { ...p.record, status: p.planned && p.type === 'education' ? 'completed' : p.record.status })?.indicator || null;
      const docs = Object.fromEntries(Object.entries(p.docs || {}).filter(([, v]) => v && v !== 'future'));
      out.push({ key: `${name}:${line}`, line, type: p.type, label: res.label, title: String(p.record[titleField] || ''), record: p.record,
        indicator, indicator_title: indicator ? INDICATORS.get(indicator)?.title : null, planned: !!p.planned, docs,
        existing_id: existing?.id || null, remark: p.remark || null, why: p.why || null });
    }
    sheets.push({ sheet: name, kind, rows: out });
  }
  if (!sheets.some((s) => s.rows.length)) throw new HttpError(422, 'No credential rows were found. The sheets need a header row (e.g. Title, Date, Level) and one row per credential.');
  return { sheets, skipped, total: sheets.reduce((n, s) => n + s.rows.length, 0) };
}

/** Creates the chosen records (or reuses ones already in the portfolio) and claims them with their document statuses. */
export function commitTracker(db, userId, body = {}) {
  const rows = Array.isArray(body.rows) ? body.rows : [];
  if (!rows.length) throw new HttpError(422, 'Choose at least one row to import');
  if (rows.length > 2000) throw new HttpError(422, 'Too many rows in one import');
  let created = 0; let reused = 0; let claimed = 0; const problems = [];
  tx(db, () => {
    for (const row of rows) {
      if (!RESOURCES[row.type] || !['education', 'licenses', 'portfolio_entries', 'trainings', 'presentations', 'publications', 'memberships', 'awards'].includes(row.type)) { problems.push({ key: row.key, error: 'Unknown record type' }); continue; }
      let id = Number(row.existing_id) || null;
      if (id && !db.prepare(`SELECT 1 FROM ${RESOURCES[row.type].table} WHERE id = ? AND user_id = ? AND deleted_at IS NULL`).get(id, userId)) id = null;
      try {
        if (!id) { id = create(db, userId, row.type, row.record || {}).id; created++; } else reused++;
      } catch (e) { problems.push({ key: row.key, title: row.title, error: e.message, details: e.details }); continue; }
      if (row.indicator && INDICATORS.has(row.indicator)) {
        const exists = db.prepare('SELECT id FROM jc_claims WHERE user_id = ? AND indicator = ? AND entity_type = ? AND entity_id = ?').get(userId, row.indicator, row.type, id);
        if (!exists) {
          try { addClaim(db, userId, { indicator: row.indicator, type: row.type, id, status: row.planned ? 'planned' : 'claimed', docs: row.docs || {}, note: row.remark || null }); claimed++; } catch (e) { problems.push({ key: row.key, title: row.title, error: e.message }); }
        }
      }
    }
  });
  return { created, reused, claimed, problems };
}
