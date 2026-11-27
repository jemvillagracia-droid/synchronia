// School calendar import: dates read from the academic calendar file (Word table, Excel, PDF, pasted text),
// shown before saving, placed on the calendar, not saved twice, and removable as one import.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'synchronia-schoolcal-'));
process.env.SYNCHRONIA_DATA_DIR = tmp;
const { openDatabase } = await import('../src/db.js');
const { createApp } = await import('../src/app.js');
const { parseCalendar } = await import('../src/calendar/importer.js');
const { Document, Packer, Paragraph, Table, TableRow, TableCell } = await import('docx');
const ExcelJS = (await import('exceljs')).default;

const TOKEN = 'school-calendar-token-'.padEnd(48, 's');
let server, base, db, cookie = '';
async function call(method, url, body, headers = {}) {
  const raw = Buffer.isBuffer(body);
  const res = await fetch(base + url, { method, headers: { 'Content-Type': raw ? 'application/octet-stream' : 'application/json', 'X-Synchronia': '1', Cookie: cookie, ...headers }, body: body === undefined ? undefined : raw ? body : JSON.stringify(body) });
  const t = await res.text();
  return { status: res.status, body: t ? JSON.parse(t) : null };
}

before(async () => {
  db = openDatabase(':memory:');
  server = createApp(db, { accessToken: TOKEN }).listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}/api`;
  cookie = (await fetch(`${base}/open?token=${TOKEN}`, { redirect: 'manual' })).headers.get('set-cookie').split(';')[0];
  await call('PUT', '/profile', { full_name: 'Maria Santos' });
});
after(() => { server.close(); db.close(); fs.rmSync(tmp, { recursive: true, force: true }); });

const row = (a, b) => new TableRow({ children: [new TableCell({ children: [new Paragraph(a)] }), new TableCell({ children: [new Paragraph(b)] })] });
async function wordCalendar() {
  const doc = new Document({ sections: [{ children: [
    new Paragraph('ACADEMIC CALENDAR'), new Paragraph('School Year 2026-2027'), new Paragraph('FIRST SEMESTER'),
    new Table({ rows: [row('DATE', 'ACTIVITY'), row('July 20-31, 2026', 'Enrollment for the First Semester'), row('August 10, 2026 (Monday)', 'Opening of Classes'),
      row('October 19-24', 'Midterm Examinations'), row('December 21, 2026 – January 3, 2027', 'Christmas Break'), row('March 15, 16 and 17', 'Midterm Examinations (Second Semester)'),
      row('January 8', 'Deadline of Submission of Grades')] }),
  ] }] });
  return Packer.toBuffer(doc);
}
/** A one-page text PDF, written by hand: enough for the PDF reader. */
function textPdf(lines) {
  const content = `BT /F1 11 Tf 72 740 Td 14 TL ${lines.map((l) => `(${l.replace(/[()\\]/g, '\\$&')}) '`).join(' ')} ET`;
  const objs = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  let pdf = '%PDF-1.4\n'; const offs = [];
  objs.forEach((o, i) => { offs.push(pdf.length); pdf += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const x = pdf.length;
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offs.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${x}\n%%EOF`;
  return Buffer.from(pdf, 'latin1');
}

test('reads dates from many calendar layouts, years from the school year', () => {
  const r = parseCalendar(['ACADEMIC CALENDAR SY 2026-2027', 'Aug. 31 – Sept. 4 | Enrollment', '14 August 2026 Faculty Day', 'Graduation Rites', 'May 28, 2027',
    'Students may 5 times retake the quiz.', '03/04/2027 Holy Thursday', 'December 21, 2026 – January 3, 2027 | Christmas Break', 'September 21 (Mon) | Start of Classes']);
  const by = Object.fromEntries(r.items.map((i) => [i.title, i]));
  assert.equal(r.school_year, '2026–2027');
  assert.deepEqual([by.Enrollment.start_date, by.Enrollment.end_date, by.Enrollment.kind], ['2026-08-31', '2026-09-04', 'enrollment']);
  assert.equal(by['Faculty Day'].start_date, '2026-08-14');
  assert.equal(by['Graduation Rites'].start_date, '2027-05-28', 'title on the line above its date');
  assert.equal(by['Holy Thursday'].kind, 'holiday');
  assert.ok(by['Holy Thursday'].notes.some((n) => /either way round/.test(n)), 'ambiguous 03/04 is flagged');
  assert.deepEqual([by['Christmas Break'].end_date, by['Christmas Break'].kind, by['Christmas Break'].no_classes], ['2027-01-03', 'break', true]);
  assert.equal(by['Start of Classes'].kind, 'term');
  assert.ok(!r.items.some((i) => /retake/.test(i.title)), '"may 5" in a sentence is not a date');
  // Month headings: "AUGUST 2026" then day lines.
  const m = parseCalendar(['AUGUST 2026', '3 | Faculty orientation', '10-14 Enrollment week', '3 units minimum load', 'JANUARY 2027', '4 Mon Classes resume']).items;
  assert.deepEqual(m.map((i) => [i.start_date, i.end_date, i.title]), [['2026-08-03', null, 'Faculty orientation'], ['2026-08-10', '2026-08-14', 'Enrollment week'], ['2027-01-04', null, 'Classes resume']]);
});

test('Word calendar with a table: read, saved, on the calendar, not saved twice, removed as one import', async () => {
  const buf = await wordCalendar();
  const read = await call('POST', '/calendar/import/read', buf, { 'X-Filename': encodeURIComponent('URS Academic Calendar 2026-2027.docx') });
  assert.equal(read.status, 200, JSON.stringify(read.body));
  assert.equal(read.body.school_year, '2026–2027');
  const titles = read.body.items.map((i) => `${i.start_date} ${i.title}`);
  for (const t of ['2026-07-20 Enrollment for the First Semester', '2026-08-10 Opening of Classes', '2026-10-19 Midterm Examinations', '2026-12-21 Christmas Break', '2027-01-08 Deadline of Submission of Grades', '2027-03-16 Midterm Examinations (Second Semester)'])
    assert.ok(titles.includes(t), `${t} in ${titles.join(' | ')}`);
  assert.equal((await call('GET', '/calendar?from=2026-08-01&to=2026-08-31')).body.events.filter((e) => e.type === 'school_calendar').length, 0, 'reading saves nothing');

  const saved = await call('POST', '/calendar/import', { file_name: read.body.file_name, school_year: read.body.school_year, items: read.body.items });
  assert.equal(saved.status, 201);
  assert.equal(saved.body.saved, read.body.items.length);
  const dec = (await call('GET', '/calendar?from=2026-12-01&to=2027-01-31')).body.events.filter((e) => e.type === 'school_calendar');
  const brk = dec.find((e) => e.title === 'Christmas Break');
  assert.deepEqual([brk.date, brk.end_date, brk.kind, brk.no_classes], ['2026-12-21', '2027-01-03', 'school', true]);
  // A range that began in an earlier month still shows when only January is asked for.
  assert.ok((await call('GET', '/calendar?from=2027-01-01&to=2027-01-31')).body.events.some((e) => e.title === 'Christmas Break'));
  // Search finds the dates.
  assert.ok(JSON.stringify((await call('GET', '/search?q=Opening%20of%20Classes')).body).includes('Opening of Classes'));

  const opening = (await call('GET', '/calendar?from=2026-08-10&to=2026-08-10')).body.events.find((e) => e.title === 'Opening of Classes');
  await call('PATCH', `/records/school_calendar/${opening.id}`, { title: 'First day of classes' });
  const again = await call('POST', '/calendar/import/read', buf, { 'X-Filename': 'again.docx' });
  assert.ok(again.body.items.every((i) => i.already), 'importing the same calendar again marks every date as already saved, renamed ones too');

  const imports = (await call('GET', '/calendar/imports')).body;
  assert.equal(imports.length, 1);
  assert.equal(imports[0].file_name, 'URS Academic Calendar 2026-2027.docx');
  assert.deepEqual([imports[0].first_date, imports[0].last_date], ['2026-07-20', '2027-03-17']);
  const rm = await call('DELETE', `/calendar/imports/${imports[0].id}`);
  assert.equal(rm.body.removed, saved.body.saved);
  assert.equal((await call('GET', '/calendar?from=2026-07-01&to=2027-06-30')).body.events.filter((e) => e.type === 'school_calendar').length, 0);
  assert.equal((await call('GET', '/calendar/imports')).body.length, 0);
});

test('Excel, PDF and pasted text calendars', async () => {
  const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('Calendar');
  ws.addRow(['Date', 'Activity']); ws.addRow([new Date(Date.UTC(2026, 7, 10)), 'Opening of Classes']); ws.addRow(['Sept 21-26, 2026', 'Preliminary Examinations']);
  const x = await call('POST', '/calendar/import/read', Buffer.from(await wb.xlsx.writeBuffer()), { 'X-Filename': 'calendar.xlsx' });
  assert.deepEqual(x.body.items.map((i) => [i.start_date, i.end_date, i.title, i.kind]), [['2026-08-10', null, 'Opening of Classes', 'term'], ['2026-09-21', '2026-09-26', 'Preliminary Examinations', 'exam']]);

  const p = await call('POST', '/calendar/import/read', textPdf(['ACADEMIC CALENDAR SY 2026-2027', 'November 30 Bonifacio Day', 'December 14-19 Final Examinations']), { 'X-Filename': 'calendar.pdf' });
  assert.equal(p.status, 200, JSON.stringify(p.body));
  assert.deepEqual(p.body.items.map((i) => [i.start_date, i.end_date, i.title]), [['2026-11-30', null, 'Bonifacio Day'], ['2026-12-14', '2026-12-19', 'Final Examinations']]);

  const t = await call('POST', '/calendar/import/read-text', { text: 'SY 2026-2027\nFebruary 25 - EDSA People Power Anniversary' });
  assert.equal(t.body.items[0].start_date, '2027-02-25');

  const none = await call('POST', '/calendar/import/read-text', { text: 'Memo: please attend the meeting.' });
  assert.equal(none.status, 422);
  const pic = await call('POST', '/calendar/import/read', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]), { 'X-Filename': 'photo.png' });
  assert.equal(pic.status, 422);
  assert.match(pic.body.error, /could not be read|No text/, 'a broken picture is refused with advice');
  const heic = await call('POST', '/calendar/import/read', Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypheic'), Buffer.alloc(16)]), { 'X-Filename': 'IMG_0001.HEIC' });
  assert.match(heic.body.error, /HEIC/);
  assert.equal((await call('POST', '/calendar/import', { items: [] })).status, 422);
  assert.equal((await call('POST', '/calendar/import', { items: [{ title: 'Bad', start_date: '2026-13-40' }] })).status, 422, 'invalid dates are refused');
});

test('a photo of the calendar is read offline (OCR) and reviewed like any file', async () => {
  const photo = fs.readFileSync(new URL('./fixtures/calendar-photo.jpg', import.meta.url));
  const r = await call('POST', '/calendar/import/read', photo, { 'X-Filename': 'calendar-photo.jpg' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.picture.kind, 'jpeg');
  assert.ok(r.body.picture.confidence >= 60, `confidence ${r.body.picture.confidence}`);
  assert.equal(r.body.school_year, '2026–2027');
  const got = r.body.items.map((i) => `${i.start_date}|${i.end_date || ''}|${i.title}`);
  for (const want of ['2026-07-20|2026-07-31|Enrollment for the First Semester', '2026-08-10||Opening of Classes', '2026-10-19|2026-10-24|Midterm Examinations',
    '2026-12-21|2027-01-03|Christmas Break', '2027-01-08||Deadline of Submission of Grades']) assert.ok(got.includes(want), `${want} in ${got.join(' / ')}`);
});
