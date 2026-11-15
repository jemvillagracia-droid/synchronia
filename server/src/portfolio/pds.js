// Personal Data Sheet (CS Form 212), Section VII — Learning and Development (L&D) interventions / training programs
// attended. The list is built from your Professional Development records, year by year (most recent first, as the PDS
// asks), with each year's folder of certificates, and exported in the PDS layout. An existing PDS (Excel) can be read
// to bring its L&D rows in.
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { HttpError, create as createRecord } from '../repo.js';
import { tx } from '../db.js';
import { saveReport } from '../academic/docs.js';
import { render } from '../research/exports.js';
import { heading, para, tableOf } from '../richdoc.js';
import { defaultPaper } from '../paper.js';

export const LD_TYPES = ['managerial', 'supervisory', 'technical', 'foundation', 'other'];
const ATTENDED = "(role IS NULL OR role = '' OR role = 'participant')"; // the PDS lists what you attended, not talks you gave

const yearOf = (d) => (d ? Number(String(d).slice(0, 4)) : null);
/** dd/mm/yyyy, as the PDS asks. Partial dates keep what is known. */
export function pdsDate(d) {
  if (!d) return '';
  const [y, m, day] = String(d).split('-');
  return day ? `${day}/${m}/${y}` : m ? `${m}/${y}` : y;
}
const num = (h) => (h == null ? '' : Number.isInteger(+h) ? `${+h}.0` : String(+h));

export function ldYears(db, userId) {
  const rows = db.prepare(`SELECT substr(start_date, 1, 4) AS year, COUNT(*) AS n, COALESCE(SUM(hours), 0) AS hours,
      SUM(CASE WHEN ld_type IS NULL OR ld_type = '' THEN 1 ELSE 0 END) AS missing_type
    FROM training_records WHERE user_id = ? AND deleted_at IS NULL AND start_date IS NOT NULL AND ${ATTENDED}
    GROUP BY year ORDER BY year DESC`).all(userId);
  const folders = Object.fromEntries(db.prepare('SELECT year, url FROM ld_year_folders WHERE user_id = ?').all(userId).map((f) => [f.year, f.url]));
  const undated = db.prepare(`SELECT COUNT(*) n FROM training_records WHERE user_id = ? AND deleted_at IS NULL AND start_date IS NULL AND ${ATTENDED}`).get(userId).n;
  const years = rows.map((r) => ({ year: Number(r.year), count: r.n, hours: r.hours, missing_type: r.missing_type, folder_url: folders[r.year] || null }));
  for (const y of Object.keys(folders).map(Number)) if (!years.some((x) => x.year === y)) years.push({ year: y, count: 0, hours: 0, missing_type: 0, folder_url: folders[y] });
  years.sort((a, b) => b.year - a.year);
  return { years, undated };
}

/** The L&D rows for a year (or every year with year = 'all'), most recent first. */
export function ldList(db, userId, year, order = 'desc') {
  const dir = order === 'asc' ? 'ASC' : 'DESC'; // the PDS asks for most recent first; oldest first is offered too
  const all = year === 'all' || year == null || year === '';
  if (!all && !/^\d{4}$/.test(String(year))) throw new HttpError(422, 'Choose a year');
  const rows = db.prepare(`SELECT id, title, start_date, end_date, hours, ld_type, organizer, training_type, verification
    FROM training_records WHERE user_id = ? AND deleted_at IS NULL AND ${ATTENDED} ${all ? 'AND start_date IS NOT NULL' : 'AND substr(start_date, 1, 4) = ?'}
    ORDER BY start_date ${dir}, COALESCE(end_date, start_date) ${dir}, id ${dir}`).all(userId, ...(all ? [] : [String(year)]));
  const items = rows.map((r) => ({
    ...r, from: pdsDate(r.start_date), to: pdsDate(r.end_date || r.start_date),
    issues: [!r.hours && 'number of hours', !r.ld_type && 'type of L&D', !r.organizer && 'conducted / sponsored by', String(r.start_date).length < 10 && 'full date'].filter(Boolean),
  }));
  const folder = all ? null : db.prepare('SELECT url FROM ld_year_folders WHERE user_id = ? AND year = ?').get(userId, Number(year))?.url || null;
  return { year: all ? 'all' : Number(year), order: dir.toLowerCase(), items, total_hours: items.reduce((s, r) => s + (Number(r.hours) || 0), 0), folder_url: folder };
}

export function setFolder(db, userId, year, url) {
  if (!/^\d{4}$/.test(String(year))) throw new HttpError(422, 'Choose a year');
  const u = String(url || '').trim();
  if (!u) { db.prepare('DELETE FROM ld_year_folders WHERE user_id = ? AND year = ?').run(userId, Number(year)); return { year: Number(year), url: null }; }
  if (!/^https?:\/\/\S+$/i.test(u) || u.length > 2000) throw new HttpError(422, 'Enter the folder’s web address', { url: 'Copy the folder link from Google Drive (it starts with https://)' });
  db.prepare('INSERT INTO ld_year_folders (user_id, year, url) VALUES (?, ?, ?) ON CONFLICT(user_id, year) DO UPDATE SET url = excluded.url').run(userId, Number(year), u);
  return { year: Number(year), url: u };
}

// ── Export in the PDS layout ────────────────────────────────
const SECTION = 'VII. LEARNING AND DEVELOPMENT (L&D) INTERVENTIONS/TRAINING PROGRAMS ATTENDED';
const EXCEL_PAPER = { letter: 1, legal: 5, a4: 9, a5: 11, b5: 13, folio: 14 };

export async function exportLd(db, userId, { year = 'all', format = 'xlsx', order = 'desc' } = {}, { pdfRenderer } = {}) {
  if (!['xlsx', 'docx', 'pdf'].includes(format)) throw new HttpError(422, 'Choose Excel, Word or PDF');
  const { items, total_hours: total } = ldList(db, userId, year, order);
  if (!items.length) throw new HttpError(422, year === 'all' ? 'No trainings attended are recorded yet.' : `No trainings attended are recorded for ${year}.`);
  const label = year === 'all' ? 'All years' : String(year);
  const title = `L&D Interventions Attended — ${label}`;
  const fileStem = `PDS_LD_Interventions_${year === 'all' ? 'All_years' : year}`;
  const type = (t) => (t ? t.toUpperCase() : '');

  if (format === 'xlsx') {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(`L&D ${label}`.slice(0, 31), { pageSetup: { paperSize: EXCEL_PAPER[defaultPaper()] || 1, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } } });
    ws.columns = [{ width: 62 }, { width: 13 }, { width: 13 }, { width: 11 }, { width: 15 }, { width: 40 }];
    const thin = { style: 'thin', color: { argb: 'FF000000' } };
    const box = { top: thin, left: thin, bottom: thin, right: thin };
    const grey = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEAEAEA' } };
    ws.mergeCells('A1:F1');
    Object.assign(ws.getCell('A1'), { value: SECTION, font: { bold: true, italic: true, color: { argb: 'FFFFFFFF' }, size: 11, name: 'Arial Narrow' }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF969696' } }, alignment: { vertical: 'middle' } });
    ws.getRow(1).height = 20;
    ws.mergeCells('A2:A3'); ws.mergeCells('B2:C2'); ws.mergeCells('D2:D3'); ws.mergeCells('E2:E3'); ws.mergeCells('F2:F3');
    const head = { A2: '30.  TITLE OF LEARNING AND DEVELOPMENT INTERVENTIONS/TRAINING PROGRAMS\n(Write in full)', B2: 'INCLUSIVE DATES OF ATTENDANCE\n(dd/mm/yyyy)', B3: 'From', C3: 'To',
      D2: 'NUMBER OF HOURS', E2: 'Type of L&D\n(Managerial/ Supervisory/ Technical/etc)', F2: 'CONDUCTED/ SPONSORED BY\n(Write in full)' };
    for (const [ref, v] of Object.entries(head)) Object.assign(ws.getCell(ref), { value: v, font: { size: 8, name: 'Arial Narrow' }, alignment: { horizontal: 'center', vertical: 'middle', wrapText: true }, fill: grey });
    for (const r of [2, 3]) for (const c of 'ABCDEF') Object.assign(ws.getCell(`${c}${r}`), { border: box, fill: grey });
    ws.getRow(2).height = 42; ws.getRow(3).height = 16;
    for (const it of items) {
      const row = ws.addRow([it.title, it.from, it.to, it.hours == null ? '' : Number(it.hours), type(it.ld_type), it.organizer || '']);
      row.eachCell({ includeEmpty: true }, (c, i) => {
        c.border = box; c.font = { bold: true, size: 10, name: 'Arial' };
        c.alignment = { vertical: 'middle', wrapText: true, horizontal: i === 1 ? 'left' : 'center' };
      });
      row.getCell(4).numFmt = '0.0';
    }
    const tr = ws.addRow(['TOTAL NUMBER OF HOURS', '', '', total, '', '']);
    ws.mergeCells(`A${tr.number}:C${tr.number}`);
    tr.eachCell({ includeEmpty: true }, (c) => { c.border = box; c.font = { bold: true, size: 10, name: 'Arial' }; c.alignment = { horizontal: 'center', vertical: 'middle' }; });
    tr.getCell(1).alignment = { horizontal: 'right', vertical: 'middle' }; tr.getCell(4).numFmt = '0.0';
    ws.views = [{ state: 'frozen', ySplit: 3 }];
    ws.pageSetup.printTitlesRow = '1:3';
    const buffer = Buffer.from(await wb.xlsx.writeBuffer());
    return saveReport(db, userId, { type: 'pds_ld', title, buffer, format: 'xlsx', fileStem, expect: [] });
  }

  const rows = [
    [{ text: 'TITLE OF LEARNING AND DEVELOPMENT INTERVENTIONS / TRAINING PROGRAMS (write in full)', width: 34 }, { text: 'From (dd/mm/yyyy)', width: 11, align: 'center' }, { text: 'To (dd/mm/yyyy)', width: 11, align: 'center' },
      { text: 'Number of hours', width: 8, align: 'center' }, { text: 'Type of L&D', width: 11, align: 'center' }, { text: 'Conducted / sponsored by (write in full)', width: 25, align: 'center' }],
    ...items.map((it) => [{ text: it.title, bold: true }, { text: it.from, align: 'center' }, { text: it.to, align: 'center' }, { text: num(it.hours), align: 'center' }, { text: type(it.ld_type), align: 'center' }, { text: it.organizer || '', align: 'center' }]),
    [{ text: 'TOTAL NUMBER OF HOURS', bold: true, colspan: 3, align: 'right' }, { text: num(total), bold: true, align: 'center' }, { text: '' }, { text: '' }],
  ];
  const doc = { type: 'doc', content: [heading(SECTION, 2), para(`${label} · ${items.length} intervention${items.length === 1 ? '' : 's'} · ${num(total)} hours`), tableOf(rows)] };
  return render(db, userId, { doc, title, format, type: 'pds_ld', fileStem, pdfRenderer });
}

// ── Read an existing PDS (Excel) ────────────────────────────
const norm = (v) => {
  if (v == null) return '';
  if (v instanceof Date) return v;
  if (typeof v === 'object') return v.result instanceof Date ? v.result : String(v.text ?? v.result ?? (v.richText ? v.richText.map((r) => r.text).join('') : '')).trim();
  return String(v).trim();
};
const isoFromDate = (d) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
/** dd/mm/yyyy (the PDS format), an Excel date, or yyyy-mm-dd. */
export function readPdsDate(v) {
  if (v instanceof Date) return isoFromDate(v);
  const s = String(v || '').trim();
  let m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s);
  if (m) { const [d, mo, y] = [+m[1], +m[2], +m[3]]; const t = new Date(Date.UTC(y, mo - 1, d)); return t.getUTCMonth() === mo - 1 && t.getUTCDate() === d ? isoFromDate(t) : null; }
  m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s); if (m) return s;
  if (/^\d{5}(\.\d+)?$/.test(s)) { const t = new Date(Date.UTC(1899, 11, 30) + Number(s) * 86400000); return isoFromDate(t); }
  return null;
}
const LD_OF = (s) => { const t = String(s || '').toLowerCase(); return LD_TYPES.find((k) => t.startsWith(k.slice(0, 5))) || (t ? 'other' : null); };

/** Find the L&D table in every sheet of a PDS workbook (the PDS and its continuation sheets) and read its rows. */
export async function readPdsLd(buffer) {
  if (!buffer?.length || buffer.subarray(0, 2).toString('latin1') !== 'PK') throw new HttpError(422, 'Choose the PDS Excel file (.xlsx). Older .xls files must be saved as .xlsx first.');
  const zip = await JSZip.loadAsync(buffer).catch(() => null);
  if (!zip?.file('xl/workbook.xml')) throw new HttpError(422, 'Choose the PDS Excel file (.xlsx).');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer).catch(() => { throw new HttpError(422, 'This Excel file could not be read.'); });
  const items = [];
  wb.eachSheet((ws) => {
    let cols = null; let blank = 0;
    for (let r = 1; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const cells = []; for (let c = 1; c <= Math.max(ws.columnCount, 1); c++) cells[c] = norm(row.getCell(c).value);
      const text = cells.map((x) => (x instanceof Date ? '' : x)).join(' ');
      if (/TITLE OF LEARNING AND DEVELOPMENT/i.test(text)) {
        // Header row: find each column by its heading; From/To sit on this row or the next.
        const find = (re, rr = cells) => rr.findIndex((x) => typeof x === 'string' && re.test(x));
        const next = []; const nr = ws.getRow(r + 1); for (let c = 1; c <= ws.columnCount; c++) next[c] = norm(nr.getCell(c).value);
        let from = find(/^from$/i, next); let to = find(/^to$/i, next);
        if (from < 0) { from = find(/^from$/i); to = find(/^to$/i); }
        const dates = find(/INCLUSIVE DATES/i);
        if (from < 0 && dates > 0) { from = dates; to = dates + 1; }
        cols = { title: find(/TITLE OF LEARNING/i), from, to, hours: find(/NUMBER OF HOURS|^HOURS/i), type: find(/Type of L/i), by: find(/CONDUCTED|SPONSORED/i) };
        r += from >= 0 && next[from] ? 1 : 0; blank = 0; continue;
      }
      if (!cols) continue;
      if (/^\s*VIII\.|OTHER INFORMATION|\(Continue on separate sheet/i.test(text) || /^SIGNATURE/i.test(String(cells[1] || ''))) { cols = null; continue; }
      const title = cells.slice(Math.max(1, cols.title), cols.from > 0 ? cols.from : undefined).find((x) => typeof x === 'string' && x.length > 2) || '';
      const start = cols.from > 0 ? readPdsDate(cells[cols.from]) : null;
      if (!title && !start) { if (++blank > 6) cols = null; continue; }
      blank = 0;
      if (!title || /^(N\/?A|none|-+)$/i.test(title)) continue;
      const end = cols.to > 0 ? readPdsDate(cells[cols.to]) : null;
      const hours = cols.hours > 0 ? Number(String(cells[cols.hours]).replace(/[^\d.]/g, '')) || null : null;
      items.push({ title: title.replace(/\s+/g, ' ').slice(0, 500), start_date: start, end_date: end && end !== start ? end : null, hours, ld_type: cols.type > 0 ? LD_OF(cells[cols.type]) : null,
        organizer: cols.by > 0 && typeof cells[cols.by] === 'string' ? cells[cols.by].replace(/\s+/g, ' ').slice(0, 500) : null, sheet: ws.name, row: r,
        issues: [!start && 'date not read'].filter(Boolean) });
    }
  });
  return items;
}

export async function previewPdsImport(db, userId, buffer) {
  const items = await readPdsLd(buffer);
  if (!items.length) throw new HttpError(422, 'No L&D rows were found. Choose the PDS Excel file that has Section VII (Learning and Development) filled in.');
  const have = new Set(db.prepare('SELECT lower(title) t, start_date FROM training_records WHERE user_id = ? AND deleted_at IS NULL').all(userId).map((x) => `${x.t}|${x.start_date || ''}`));
  return { items: items.map((it) => ({ ...it, already: have.has(`${it.title.toLowerCase()}|${it.start_date || ''}`) })) };
}

export function commitPdsImport(db, userId, body = {}) {
  const items = Array.isArray(body.items) ? body.items.slice(0, 2000) : [];
  if (!items.length) throw new HttpError(422, 'Choose at least one training to save.');
  return tx(db, () => {
    let n = 0;
    for (const it of items) {
      createRecord(db, userId, 'trainings', { title: it.title, start_date: it.start_date || null, end_date: it.end_date || null, hours: it.hours ?? null,
        ld_type: LD_TYPES.includes(it.ld_type) ? it.ld_type : null, organizer: it.organizer || null, role: 'participant', training_type: 'training', verification: 'self_reported',
        notes: 'Imported from the Personal Data Sheet (Section VII).' });
      n++;
    }
    return { saved: n };
  });
}
