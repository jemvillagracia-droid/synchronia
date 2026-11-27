// School calendar import: reads the dates out of the academic calendar your school releases (PDF, Word, Excel,
// CSV or pasted text) and proposes calendar entries. Nothing is saved until you confirm; every proposal keeps the
// line it came from so it can be checked against the original.
import JSZip from 'jszip';
import ExcelJS from 'exceljs';
import { pdfText } from '../cv/extract.js';
import { HttpError, create as createRecord, remove as removeRecord } from '../repo.js';
import { tx } from '../db.js';
import { pictureKind, readPicture } from '../ocr.js';

// ── Text extraction ─────────────────────────────────────────
const decode = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const runsText = (xml) => {
  let t = '';
  for (const tok of xml.match(/<w:t(?: [^>]*)?>[\s\S]*?<\/w:t>|<w:tab\/>|<w:br\/>/g) || []) t += tok === '<w:tab/>' ? '\t' : tok === '<w:br/>' ? ' ' : decode(tok.replace(/<[^>]+>/g, ''));
  return t;
};

/** Word: paragraphs as lines; each table row as one line with its cells joined by " | ". */
async function docxLines(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const xml = await zip.file('word/document.xml')?.async('string');
  if (!xml) throw new HttpError(422, 'This Word file could not be read.');
  const lines = [];
  for (const block of xml.match(/<w:tbl>[\s\S]*?<\/w:tbl>|<w:p[ >][\s\S]*?<\/w:p>/g) || []) {
    if (block.startsWith('<w:tbl>')) {
      for (const row of block.match(/<w:tr[ >][\s\S]*?<\/w:tr>/g) || []) {
        const cells = (row.match(/<w:tc>[\s\S]*?<\/w:tc>/g) || []).map((c) => (c.match(/<w:p[ >][\s\S]*?<\/w:p>/g) || []).map(runsText).join(' ').replace(/\s+/g, ' ').trim());
        if (cells.some(Boolean)) lines.push(cells.join(' | '));
      }
    } else lines.push(runsText(block));
  }
  return lines;
}

const ymd = (d) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
async function xlsxLines(buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const lines = [];
  wb.eachSheet((ws) => ws.eachRow((row) => {
    const cells = row.values.slice(1).map((v) => {
      if (v instanceof Date) return ymd(v);
      if (v && typeof v === 'object') return v.text ?? (v.result instanceof Date ? ymd(v.result) : v.result) ?? (v.richText ? v.richText.map((r) => r.text).join('') : '');
      return v ?? '';
    }).map((v) => String(v).trim());
    if (cells.some(Boolean)) lines.push(cells.join(' | '));
  }));
  return lines;
}

export async function documentLines(buffer, fileName = '') {
  if (!buffer?.length) throw new HttpError(422, 'Choose a file to import.');
  const head = buffer.subarray(0, 5).toString('latin1');
  if (head === '%PDF-') {
    const { text } = await pdfText(buffer).catch(() => { throw new HttpError(422, 'This PDF could not be read.'); });
    const lines = text.split('\n').filter((l) => l !== '\f');
    if (lines.join('').replace(/\s/g, '').length < 20) throw new HttpError(422, 'This PDF has no readable text — it is probably a scan. Take a screenshot of each page and import the picture, or import the Word or PDF file the office released.');
    return lines;
  }
  if (head.startsWith('PK')) {
    const zip = await JSZip.loadAsync(buffer).catch(() => null);
    if (zip?.file('word/document.xml')) return docxLines(buffer);
    if (zip?.file('xl/workbook.xml')) return xlsxLines(buffer);
    throw new HttpError(422, 'Use a PDF, Word (.docx), Excel (.xlsx), CSV or text file.');
  }
  // Pictures (a photo or screenshot of the calendar): read offline with OCR, then reviewed like any other file.
  const kind = pictureKind(buffer);
  if (kind === 'heic') throw new HttpError(422, 'iPhone HEIC photos cannot be read. Share or save the photo as JPG (or take a screenshot), then import that.');
  if (kind) {
    const { lines, confidence } = await readPicture(buffer).catch(() => { throw new HttpError(422, 'This picture could not be read. Try a clearer photo or a screenshot, or paste the calendar text instead.'); });
    if (lines.join('').replace(/\s/g, '').length < 15) throw new HttpError(422, 'No text could be read from this picture. Try a clearer, straighter photo or a screenshot, or paste the calendar text instead.');
    lines.picture = { kind, confidence };
    return lines;
  }
  if (/\.(png|jpe?g|gif|webp|heic|bmp|tiff?)$/i.test(fileName)) throw new HttpError(422, 'This picture file could not be opened. Save it again as JPG or PNG and import that.');
  if (/\.doc$|\.xls$/i.test(fileName)) throw new HttpError(422, 'Older .doc and .xls files cannot be read. Open the file and save it as .docx or .xlsx (or PDF), then import that.');
  const text = buffer.toString('utf8');
  if (/\u0000/.test(text)) throw new HttpError(422, 'Use a PDF, Word (.docx), Excel (.xlsx), CSV or text file.');
  return text.split(/\r?\n/).map((l) => (/\.csv$/i.test(fileName) ? l.split(',').map((c) => c.replace(/^"|"$/g, '').trim()).join(' | ') : l));
}

// ── Dates ───────────────────────────────────────────────────
const MONTHS = {
  jan: 1, january: 1, enero: 1, feb: 2, february: 2, pebrero: 2, mar: 3, march: 3, marso: 3, apr: 4, april: 4, abril: 4,
  may: 5, mayo: 5, jun: 6, june: 6, hunyo: 6, jul: 7, july: 7, hulyo: 7, aug: 8, august: 8, agosto: 8,
  sep: 9, sept: 9, september: 9, setyembre: 9, oct: 10, october: 10, oktubre: 10, nov: 11, november: 11, nobyembre: 11,
  dec: 12, december: 12, disyembre: 12,
};
const MON = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?|enero|pebrero|marso|abril|mayo|hunyo|hulyo|agosto|setyembre|oktubre|nobyembre|disyembre)\\.?';
const DAY = '(\\d{1,2})(?!\\d)(?:st|nd|rd|th)?';
const TO = '\\s*(?:-|–|—|to|until|thru|through|hanggang)\\s*';
const YR = '(?:,?\\s*(\\d{4}))?';
const WD = '(?:(?:mon|tues?|wed(?:nes)?|thu(?:rs?)?|fri|sat(?:ur)?|sun)(?:day)?\\.?,?\\s*)?';
// "August 12[–16][, 2026]", "Aug 31 – Sept 4, 2026", "August 12, 13 and 14, 2026"
const RE_MD = new RegExp(`\\b${MON}\\s+${DAY}(?:${TO}${WD}(?:${MON}\\s+)?${DAY})?((?:\\s*(?:,|&|and)\\s*\\d{1,2}(?:st|nd|rd|th)?\\b(?!\\s*:))*)${YR}`, 'gi');
// "12[–16] August[ 2026]"
const RE_DM = new RegExp(`\\b${DAY}(?:${TO}${DAY})?\\s+(?:of\\s+)?${MON}${YR}\\b`, 'gi');
const RE_ISO = /\b(20\d\d)-(\d{1,2})-(\d{1,2})\b/g;
const RE_NUM = /\b(\d{1,2})[/.](\d{1,2})[/.](\d{4}|\d{2})\b/g;
const RE_CONNECT = new RegExp(`^${TO}${WD}$`, 'i');
const RE_MONTH_HEAD = new RegExp(`^\\s*${MON}\\s*,?\\s*(\\d{4})\\s*$`, 'i');
const RE_DAY_LINE = new RegExp(`^\\s*${WD}${DAY}(?:${TO}${WD}${DAY})?\\b\\s*\\(?${WD}\\)?\\s*[|:.\\-–—)]?\\s*(.+)$`, 'i');

const monthOf = (s) => MONTHS[s.toLowerCase().replace(/\.$/, '')] || MONTHS[s.toLowerCase().slice(0, 3)];
const valid = (y, m, d) => { const t = new Date(Date.UTC(y, m - 1, d)); return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d; };
const iso = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const y4 = (y) => (y.length === 2 ? 2000 + Number(y) : Number(y));

/** Every date expression in a line: { start: {y?,m,d}, end?: {y?,m,d}, extra?: [d…], from, to, ambiguous? } */
function findDates(line) {
  const hits = [];
  const taken = (a, b) => hits.some((h) => a < h.to && b > h.from);
  for (const m of line.matchAll(RE_ISO)) hits.push({ start: { y: +m[1], m: +m[2], d: +m[3] }, from: m.index, to: m.index + m[0].length });
  for (const m of line.matchAll(RE_NUM)) {
    if (taken(m.index, m.index + m[0].length)) continue;
    let a = +m[1], b = +m[2]; const amb = a <= 12 && b <= 12 && a !== b;
    const [mo, d] = a > 12 ? [b, a] : [a, b]; // month/day (the Philippine usage) unless the first number cannot be a month
    hits.push({ start: { y: y4(m[3]), m: mo, d }, from: m.index, to: m.index + m[0].length, ambiguous: amb });
  }
  for (const m of line.matchAll(RE_MD)) {
    if (taken(m.index, m.index + m[0].length)) continue;
    if (/^(may|mar|march)$/i.test(m[1]) && m[1][0] !== m[1][0].toUpperCase()) continue; // "students may 2…" is not a date
    const y = m[6] ? +m[6] : undefined; const mo = monthOf(m[1]);
    const h = { start: { y, m: mo, d: +m[2] }, from: m.index, to: m.index + m[0].length };
    if (m[4]) h.end = { y, m: m[3] ? monthOf(m[3]) : mo, d: +m[4] };
    const extra = (m[5] || '').match(/\d{1,2}/g);
    if (extra && !m[4]) h.extra = extra.map(Number);
    hits.push(h);
  }
  for (const m of line.matchAll(RE_DM)) {
    if (taken(m.index, m.index + m[0].length)) continue;
    const y = m[4] ? +m[4] : undefined; const mo = monthOf(m[3]);
    const h = { start: { y, m: mo, d: +m[1] }, from: m.index, to: m.index + m[0].length };
    if (m[2]) h.end = { y, m: mo, d: +m[2] };
    hits.push(h);
  }
  hits.sort((a, b) => a.from - b.from);
  // "December 21, 2026 – January 3, 2027": two dates joined by a range word make one range.
  const out = [];
  for (const h of hits) {
    const p = out[out.length - 1];
    if (p && !p.end && !p.extra && RE_CONNECT.test(line.slice(p.to, h.from))) { p.end = h.end || h.start; p.to = h.to; if (p.start.y === undefined && h.start.y !== undefined) p.start.y = h.end?.y ?? h.start.y; continue; }
    out.push(h);
  }
  // A year given only at the end of a range applies to its start too.
  for (const h of out) if (h.end && h.start.y === undefined && h.end.y !== undefined) h.start.y = h.end.y - (h.start.m > h.end.m ? 1 : 0);
  return out;
}

// ── What each entry is ──────────────────────────────────────
const KINDS = [
  ['term', /(?:start|opening|beginning|first day|end|close|closing|last day) of (?:classes|the (?:semester|term|school year)|semester|term)|classes (?:begin|start|resume|end)|resumption of classes|semester (?:begins|starts|ends)|term (?:begins|ends)/i],
  ['break', /break|vacation|recess|sem-?break|semestral|intersession|holidays? \(|christmas season/i],
  ['holiday', /holiday|no (?:class|work|office)|suspen|all saints|all souls|christmas|new year|rizal day|bonifacio|independence|eid|ramadan|araw ng|feast|immaculate|holy (?:week|thursday|friday|saturday)|maundy|good friday|black saturday|easter|undas|labou?r day|heroes|edsa|ninoy|chinese new year|national day|anzac|australia day|king'?s birthday|queen'?s birthday|melbourne cup|boxing day/i],
  ['exam', /exam|prelim|mid-?term|pre-?final|semi-?final|finals?\b|final (?:term|period)|assessment week|qualifying|comprehensive/i],
  ['enrollment', /enrol|registration|admission|adding|dropping|withdraw|change of (?:subject|matriculation)|late enrol/i],
  ['deadline', /deadline|due|submission|submit|last day (?:for|to)|encoding|posting of grades|grades|clearance/i],
];
export const SCHOOL_KINDS = ['term', 'exam', 'holiday', 'break', 'enrollment', 'deadline', 'event'];
export const kindOf = (title) => (KINDS.find(([, re]) => re.test(title)) || ['event'])[0];
const NO_CLASSES = /holiday|no (?:class|work)|suspen|break|vacation|recess|sem-?break|semestral|intersession/i;

const cleanTitle = (s) => s
  .replace(/\(\s*(?:mon|tues?|wed(?:nes)?|thu(?:rs?)?|fri|sat(?:ur)?|sun)(?:day)?\.?\s*(?:[-–—]\s*(?:mon|tues?|wed(?:nes)?|thu(?:rs?)?|fri|sat(?:ur)?|sun)(?:day)?\.?\s*)?\)/gi, ' ')
  .replace(/(^|\|)\s*(?:mon|tues?|wed(?:nes)?|thu(?:rs?)?|fri|sat(?:ur)?|sun)(?:day)?\.?,?\s*(?=\||$)/gi, '$1')
  .replace(/\s*\|\s*/g, ' | ').replace(/^[\s|:;,.\-–—•*·]+|[\s|:;,\-–—•*·]+$/g, '').replace(/(?:\s*\|\s*)+/g, ' — ').replace(/\s{2,}/g, ' ').trim();

/** School year from the document: "SY 2026–2027", "A.Y. 2026-27", "School Year 2026 - 2027". */
function schoolYear(lines) {
  for (const l of lines.slice(0, 80)) {
    const m = /(?:S\.?\s?Y\.?|A\.?\s?Y\.?|school\s+year|academic\s+year|taong\s+panuruan)\s*:?\s*(20\d\d)\s*(?:-|–|—|\/|to)\s*(20\d\d|\d\d)\b/i.exec(l);
    if (m) return { start: +m[1], end: m[2].length === 2 ? 2000 + +m[2] : +m[2], label: `${m[1]}–${m[2].length === 2 ? `20${m[2]}` : m[2]}` };
  }
  return null;
}

/**
 * Proposals from the lines of a calendar. Years left out are taken from the month heading above, from the school
 * year (June to December in its first year, January to May in its second), or else from the order of the dates.
 */
export function parseCalendar(lines, { today = new Date() } = {}) {
  const sy = schoolYear(lines);
  const items = []; const skipped = [];
  let ctx = null; // month heading: { y, m }
  let last = null; // last date, to keep a chronological document in order
  let pending = null; // the previous line when it had no date: a title written above its date
  const isHeading = (l) => l === l.toUpperCase() && /[A-Z]{3}/.test(l) || /^(?:date|activity|activities|event|events|particulars|remarks)s?\b/i.test(l);
  const inferYear = (m, d) => {
    if (ctx && ctx.m === m) return { y: ctx.y, how: null };
    if (sy) return { y: m >= 6 ? sy.start : sy.end, how: null }; // reliable: said once in the review, not on every date
    const base = last ? Number(last.slice(0, 4)) : today.getFullYear();
    const cand = [base - 1, base, base + 1].filter((y) => valid(y, m, d)).map((y) => iso(y, m, d));
    const ref = last || iso(today.getFullYear(), today.getMonth() + 1, today.getDate());
    const pick = cand.filter((c) => c >= (last ? addDays(last, -45) : addDays(ref, -200))).sort()[0] || cand[1] || cand[0];
    return { y: Number(pick.slice(0, 4)), how: 'year not in the document — check it' };
  };
  const toIso = (p, notes) => {
    let y = p.y;
    if (y === undefined) { const g = inferYear(p.m, p.d); y = g.y; if (g.how) notes.add(g.how); }
    return valid(y, p.m, p.d) ? iso(y, p.m, p.d) : null;
  };

  const clean = lines.map((l) => String(l || '').replace(/ /g, ' ').replace(/[ \t]+/g, ' ').trim());
  for (let i = 0; i < clean.length; i++) {
    const line = clean[i];
    if (!line) continue;
    const head = RE_MONTH_HEAD.exec(line);
    if (head) { ctx = { m: monthOf(head[1]), y: +head[2] }; pending = null; continue; }
    for (const seg of line.split(/\s*;\s*/)) {
      let dates = findDates(seg);
      // Calendars laid out by month: "AUGUST 2026" then "12 | Start of classes" or "12-16 Enrollment".
      if (!dates.length && ctx) {
        const dl = RE_DAY_LINE.exec(seg);
        if (dl && +dl[1] >= 1 && +dl[1] <= 31 && !/^\s*\d{1,2}\s*(?:%|units?|hours?|hrs?|students?|minutes?|pm|am)\b/i.test(seg)) {
          const at = seg.indexOf(dl[3]);
          dates = [{ start: { y: ctx.y, m: ctx.m, d: +dl[1] }, ...(dl[2] ? { end: { y: ctx.y, m: ctx.m, d: +dl[2] } } : {}), from: 0, to: at }];
        }
      }
      if (!dates.length) { pending = isHeading(seg) ? null : seg; continue; }
      // Title: the line without its dates; for a line that is only a date, the next line that has no date.
      let title = cleanTitle(dates.reduceRight((s, h) => s.slice(0, h.from) + ' | ' + s.slice(h.to), seg));
      const notes = new Set();
      if (title.replace(/[^a-z]/gi, '').length < 3) {
        const next = clean[i + 1];
        if (pending) { title = cleanTitle(pending); notes.add('title taken from the line above'); }
        else if (next && !findDates(next).length && !RE_MONTH_HEAD.test(next)) { title = cleanTitle(next); i++; notes.add('title taken from the next line'); }
        else { skipped.push(line); continue; }
      }
      for (const h of dates) {
        const lineNotes = new Set(notes);
        if (h.ambiguous) lineNotes.add('day and month could be either way round — check it');
        const starts = [h.start, ...(h.extra || []).map((d) => ({ ...h.start, d }))];
        const kind = kindOf(title);
        for (const s of starts) {
          const start = toIso(s, lineNotes);
          let end = h.end ? toIso({ ...h.end, y: h.end.y ?? (h.end.m < s.m && s.y !== undefined ? s.y + 1 : h.end.y) }, lineNotes) : null;
          if (end && start && end < start) { const e = new Date(end + 'T00:00:00Z'); e.setUTCFullYear(e.getUTCFullYear() + 1); end = ymd(e); }
          if (!start) { skipped.push(line); continue; }
          if (end === start) end = null;
          if (end && days(start, end) > 200) { skipped.push(line); continue; }
          items.push({ start_date: start, end_date: end, title: title.slice(0, 300), kind, no_classes: kind === 'holiday' || kind === 'break' || NO_CLASSES.test(title), notes: [...lineNotes], source: line.slice(0, 300) });
          last = end || start;
        }
      }
    }
  }
  // The same entry read twice (headers repeated on every page, a summary table) is kept once.
  const seen = new Set();
  const unique = items.filter((it) => { const k = `${it.start_date}|${it.end_date || ''}|${it.title.toLowerCase()}`; if (seen.has(k)) return false; seen.add(k); return true; });
  unique.sort((a, b) => a.start_date.localeCompare(b.start_date));
  return { school_year: sy?.label || null, items: unique, unread: [...new Set(skipped)].slice(0, 50) };
}

function addDays(isoDate, n) { const d = new Date(isoDate + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return ymd(d); }
function days(a, b) { return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000); }

// ── Import, save and undo ───────────────────────────────────

/** Read a file (or pasted text) and propose entries; marks the ones already in your school calendar. Saves nothing. */
export async function previewImport(db, userId, { buffer, fileName, text } = {}) {
  const lines = text != null ? String(text).split(/\r?\n/) : await documentLines(buffer, fileName);
  const r = parseCalendar(lines);
  const picture = lines.picture || null; // read from a picture: the review says so, with how sure the reading is
  if (!r.items.length) throw new HttpError(422, 'No dates were found in this file. Check that it is the academic calendar, or paste its text instead.', { unread: r.unread.join('\n').slice(0, 2000) });
  // Already saved: the same day with the same title, or the same day read from the same line (even if you renamed it).
  const have = new Set();
  for (const x of db.prepare('SELECT start_date, lower(title) t, notes FROM school_calendar WHERE user_id = ? AND deleted_at IS NULL').all(userId)) {
    have.add(`${x.start_date}|${x.t}`);
    const src = /^From the school calendar: “([\s\S]*)”$/.exec(x.notes || '')?.[1];
    if (src) have.add(`${x.start_date}|src:${src}`);
  }
  return {
    file_name: fileName || null, school_year: r.school_year, unread: r.unread, picture,
    items: r.items.map((it) => ({ ...it, already: have.has(`${it.start_date}|${it.title.toLowerCase()}`) || have.has(`${it.start_date}|src:${it.source.slice(0, 300)}`) })),
  };
}

/** Save the entries you kept. One import record groups them, so they can be removed together. */
export function commitImport(db, userId, body = {}) {
  const items = Array.isArray(body.items) ? body.items.slice(0, 1000) : [];
  if (!items.length) throw new HttpError(422, 'Choose at least one date to save.');
  return tx(db, () => {
    const imp = db.prepare('INSERT INTO calendar_imports (user_id, file_name, school_year, items) VALUES (?, ?, ?, 0)')
      .run(userId, body.file_name ? String(body.file_name).slice(0, 255) : null, body.school_year ? String(body.school_year).slice(0, 20) : null);
    const id = Number(imp.lastInsertRowid);
    const saved = [];
    for (const it of items) {
      saved.push(createRecord(db, userId, 'school_calendar', {
        title: it.title, start_date: it.start_date, end_date: it.end_date || null,
        kind: SCHOOL_KINDS.includes(it.kind) ? it.kind : 'event', no_classes: !!it.no_classes,
        notes: it.source ? `From the school calendar: “${String(it.source).slice(0, 300)}”` : null, import_id: id,
      }));
    }
    db.prepare('UPDATE calendar_imports SET items = ? WHERE id = ?').run(saved.length, id);
    return { import_id: id, saved: saved.length, first_date: saved.map((x) => x.start_date).sort()[0] };
  });
}

export function listImports(db, userId) {
  return db.prepare(`SELECT i.id, i.file_name, i.school_year, i.created_at,
      (SELECT COUNT(*) FROM school_calendar s WHERE s.import_id = i.id AND s.deleted_at IS NULL) AS items,
      (SELECT MIN(start_date) FROM school_calendar s WHERE s.import_id = i.id AND s.deleted_at IS NULL) AS first_date,
      (SELECT MAX(COALESCE(end_date, start_date)) FROM school_calendar s WHERE s.import_id = i.id AND s.deleted_at IS NULL) AS last_date
    FROM calendar_imports i WHERE i.user_id = ? AND i.removed_at IS NULL ORDER BY i.id DESC`).all(userId).filter((i) => i.items > 0);
}

/** Remove every date an import added (they go to the recycle bin, so this can be undone there). */
export function removeImport(db, userId, id) {
  const imp = db.prepare('SELECT id FROM calendar_imports WHERE id = ? AND user_id = ? AND removed_at IS NULL').get(Number(id), userId);
  if (!imp) throw new HttpError(404, 'That import was not found.');
  return tx(db, () => {
    const rows = db.prepare('SELECT id FROM school_calendar WHERE import_id = ? AND user_id = ? AND deleted_at IS NULL').all(imp.id, userId);
    for (const r of rows) removeRecord(db, userId, 'school_calendar', r.id);
    db.prepare("UPDATE calendar_imports SET removed_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?").run(imp.id);
    return { removed: rows.length };
  });
}
