// PDS Section VII: L&D interventions attended, by year — list, folder links, PDS-layout exports, and import from a PDS.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'synchronia-pds-'));
process.env.SYNCHRONIA_DATA_DIR = tmp;
const { openDatabase } = await import('../src/db.js');
const { createApp } = await import('../src/app.js');
const { readPdsDate } = await import('../src/portfolio/pds.js');
const ExcelJS = (await import('exceljs')).default;
const JSZip = (await import('jszip')).default;

const TOKEN = 'pds-test-token-'.padEnd(48, 'p');
let server, base, db, cookie = '';
async function call(method, url, body, headers = {}) {
  const raw = Buffer.isBuffer(body);
  const res = await fetch(base + url, { method, headers: { 'Content-Type': raw ? 'application/octet-stream' : 'application/json', 'X-Synchronia': '1', Cookie: cookie, ...headers }, body: body === undefined ? undefined : raw ? body : JSON.stringify(body) });
  if (headers.raw) return Buffer.from(await res.arrayBuffer());
  const t = await res.text();
  return { status: res.status, body: t ? JSON.parse(t) : null };
}
const download = async (u) => Buffer.from(await (await fetch(base + u.replace('/api', ''), { headers: { Cookie: cookie } })).arrayBuffer());

before(async () => {
  db = openDatabase(':memory:');
  server = createApp(db, { accessToken: TOKEN }).listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}/api`;
  cookie = (await fetch(`${base}/open?token=${TOKEN}`, { redirect: 'manual' })).headers.get('set-cookie').split(';')[0];
  await call('PUT', '/profile', { full_name: 'Maria Santos' });
});
after(() => { server.close(); db.close(); fs.rmSync(tmp, { recursive: true, force: true }); });

const T = (o) => call('POST', '/records/trainings', { role: 'participant', training_type: 'seminar', ...o });

test('L&D by year: most recent first, PDS dates, totals, what is missing, talks you gave left out', async () => {
  await T({ title: 'Foundations of Guidance Work: (Series 1) Spotting the Red Flags', start_date: '2025-12-06', hours: 2, ld_type: 'technical', organizer: 'RGC Connect Consultancy Group' });
  await T({ title: 'Foundations of Guidance Work: (Series 3) Guidance Program Development', start_date: '2025-12-27', end_date: '2025-12-27', hours: 3, ld_type: 'technical', organizer: 'RGC Connect Consultancy Group' });
  await T({ title: 'Records Management Fundamentals', start_date: '2025-05-22', end_date: '2025-11-02', hours: 80, ld_type: 'technical', organizer: 'Primaexcellence Review and Training Center' });
  await T({ title: 'Virtual Information Session "Learn ChatGPT"', start_date: '2025-10-06', hours: 4 });
  await T({ title: 'Inclusive Education Summit', start_date: '2024-08-15', end_date: '2024-08-16', hours: 16, ld_type: 'technical', organizer: 'DepEd' });
  await T({ title: 'Keynote on guidance practice', start_date: '2025-09-01', hours: 2, role: 'speaker' });

  const years = (await call('GET', '/portfolio/ld/years')).body;
  assert.deepEqual(years.years.map((y) => [y.year, y.count, y.hours, y.missing_type]), [[2025, 4, 89, 1], [2024, 1, 16, 0]]);
  const y = (await call('GET', '/portfolio/ld?year=2025')).body;
  assert.deepEqual(y.items.map((i) => i.from), ['27/12/2025', '06/12/2025', '06/10/2025', '22/05/2025'], 'most recent first, dd/mm/yyyy');
  assert.equal(y.items.find((i) => i.title.startsWith('Records')).to, '02/11/2025');
  assert.equal(y.total_hours, 89);
  assert.deepEqual(y.items.find((i) => i.title.startsWith('Virtual')).issues, ['type of L&D', 'conducted / sponsored by']);
  assert.ok(!y.items.some((i) => i.title.startsWith('Keynote')), 'a talk you gave is not an L&D intervention attended');
  assert.equal((await call('GET', '/portfolio/ld?year=all')).body.items.length, 5);
  assert.deepEqual((await call('GET', '/portfolio/ld?year=2025&order=asc')).body.items.map((i) => i.from), ['22/05/2025', '06/10/2025', '06/12/2025', '27/12/2025'], 'oldest first on request');
});

test('each year keeps a link to its folder of certificates', async () => {
  assert.equal((await call('PUT', '/portfolio/ld/folders/2025', { url: 'not a link' })).status, 422);
  await call('PUT', '/portfolio/ld/folders/2025', { url: 'https://drive.google.com/drive/folders/abc2025' });
  await call('PUT', '/portfolio/ld/folders/2023', { url: 'https://drive.google.com/drive/folders/abc2023' });
  const years = (await call('GET', '/portfolio/ld/years')).body.years;
  assert.equal(years.find((y) => y.year === 2025).folder_url, 'https://drive.google.com/drive/folders/abc2025');
  assert.ok(years.some((y) => y.year === 2023 && y.count === 0), 'a folder year shows even before its trainings are entered');
  assert.equal((await call('GET', '/portfolio/ld?year=2025')).body.folder_url, 'https://drive.google.com/drive/folders/abc2025');
  await call('PUT', '/portfolio/ld/folders/2023', { url: '' });
  assert.ok(!(await call('GET', '/portfolio/ld/years')).body.years.some((y) => y.year === 2023));
});

test('exports in the PDS layout: Excel with the Section VII headings, Word, and the right refusals', async () => {
  const x = await call('POST', '/portfolio/ld/export', { year: 2025, format: 'xlsx' });
  assert.equal(x.status, 201, JSON.stringify(x.body));
  const wb = new ExcelJS.Workbook(); await wb.xlsx.load(await download(x.body.download));
  const ws = wb.worksheets[0];
  assert.match(String(ws.getCell('A1').value), /^VII\. LEARNING AND DEVELOPMENT \(L&D\) INTERVENTIONS\/TRAINING PROGRAMS ATTENDED/);
  assert.match(String(ws.getCell('A2').value), /TITLE OF LEARNING AND DEVELOPMENT/);
  assert.deepEqual([ws.getCell('B3').value, ws.getCell('C3').value], ['From', 'To']);
  assert.deepEqual([ws.getCell('A4').value, ws.getCell('B4').value, ws.getCell('C4').value, ws.getCell('D4').value, ws.getCell('E4').value, ws.getCell('F4').value],
    ['Foundations of Guidance Work: (Series 3) Guidance Program Development', '27/12/2025', '27/12/2025', 3, 'TECHNICAL', 'RGC Connect Consultancy Group']);
  assert.equal(ws.getCell('D8').value, 89, 'total hours row');
  assert.ok(ws.model.merges.includes('B2:C2'), 'inclusive dates heading spans From and To');

  const asc = await call('POST', '/portfolio/ld/export', { year: 2025, format: 'xlsx', order: 'asc' });
  const wa = new ExcelJS.Workbook(); await wa.xlsx.load(await download(asc.body.download));
  assert.equal(wa.worksheets[0].getCell('B4').value, '22/05/2025', 'export follows the chosen order');
  const w = await call('POST', '/portfolio/ld/export', { year: 'all', format: 'docx' });
  assert.equal(w.status, 201, JSON.stringify(w.body));
  const xml = await (await JSZip.loadAsync(await download(w.body.download))).file('word/document.xml').async('string');
  for (const t of ['LEARNING AND DEVELOPMENT', '27/12/2025', 'Inclusive Education Summit', 'TOTAL NUMBER OF HOURS', '105.0']) assert.ok(xml.includes(t), t);
  await call('PUT', '/preferences', { paper_size: 'a5' });
  const small = await call('POST', '/portfolio/ld/export', { year: 2025, format: 'docx' });
  const sxml = await (await JSZip.loadAsync(await download(small.body.download))).file('word/document.xml').async('string');
  assert.match(sxml, /w:orient="landscape"/, 'six PDS columns print in landscape on A5');
  await call('PUT', '/preferences', { paper_size: 'letter' });
  assert.equal((await call('POST', '/portfolio/ld/export', { year: 2019, format: 'xlsx' })).status, 422);
  assert.equal((await call('POST', '/portfolio/ld/export', { year: 2025, format: 'pdf' })).status, 503, 'PDF needs the desktop app');
});

/** A PDS-like workbook: a section heading, merged headings with From/To on the next row, text and Excel dates, then section VIII. */
async function pdsWorkbook() {
  const wb = new ExcelJS.Workbook();
  const c4 = wb.addWorksheet('C2');
  c4.getCell('A1').value = 'VII.  LEARNING AND DEVELOPMENT (L&D) INTERVENTIONS/TRAINING PROGRAMS ATTENDED';
  c4.mergeCells('A2:H3'); // decorative block above, as some versions have
  c4.getCell('A15').value = '30.'; c4.getCell('B15').value = 'TITLE OF LEARNING AND DEVELOPMENT INTERVENTIONS/TRAINING PROGRAMS\n(Write in full)';
  c4.getCell('I15').value = 'INCLUSIVE DATES OF ATTENDANCE\n(dd/mm/yyyy)'; c4.getCell('K15').value = 'NUMBER OF HOURS'; c4.getCell('L15').value = 'Type of LD\n( Managerial/ Supervisory/\nTechnical/etc)'; c4.getCell('M15').value = 'CONDUCTED/ SPONSORED BY\n(Write in full)';
  c4.getCell('I16').value = 'From'; c4.getCell('J16').value = 'To';
  const rows = [['Foundations of Guidance Work: (Series 2) Strengthening Case Management & Referral Systems', '26/12/2025', '26/12/2025', '3.0', 'TECHNICAL', 'RGC Connect Consultancy Group'],
    ['Caring for Carers: PaHinga Muna" - PMHA\'s Annual Membership Meeting', new Date(Date.UTC(2025, 11, 12)), new Date(Date.UTC(2025, 11, 12)), 4, 'TECHNICAL', 'Philippine Mental Health Association'],
    ['Foundations of Guidance Work: (Series 1) Spotting the Red Flags', '06/12/2025', '06/12/2025', '2.0', 'TECHNICAL', 'RGC Connect Consultancy Group'],
    ['Supervisory Development Course Track 1', '03/03/2024', '07/03/2024', 40, 'Supervisory', 'Civil Service Commission'],
    ['N/A', '', '', '', '', '']];
  rows.forEach((r, i) => { const n = 17 + i; c4.getCell(`B${n}`).value = r[0]; c4.getCell(`I${n}`).value = r[1]; c4.getCell(`J${n}`).value = r[2]; c4.getCell(`K${n}`).value = r[3]; c4.getCell(`L${n}`).value = r[4]; c4.getCell(`M${n}`).value = r[5]; });
  c4.getCell('A24').value = 'VIII.  OTHER INFORMATION';
  c4.getCell('B26').value = 'Should not be read as a training'; c4.getCell('I26').value = '01/01/2025';
  return Buffer.from(await wb.xlsx.writeBuffer());
}

test('reads the L&D rows from a PDS Excel file, marks ones already saved, and saves the chosen ones', async () => {
  assert.equal(readPdsDate('06/10/2025'), '2025-10-06', 'dd/mm/yyyy');
  assert.equal(readPdsDate('31/02/2025'), null);
  const read = await call('POST', '/portfolio/ld/import/read', await pdsWorkbook());
  assert.equal(read.status, 200, JSON.stringify(read.body));
  const items = read.body.items;
  assert.deepEqual(items.map((i) => [i.start_date, i.end_date, i.hours, i.ld_type]), [['2025-12-26', null, 3, 'technical'], ['2025-12-12', null, 4, 'technical'], ['2025-12-06', null, 2, 'technical'], ['2024-03-03', '2024-03-07', 40, 'supervisory']]);
  assert.equal(items[1].organizer, 'Philippine Mental Health Association');
  assert.ok(items[2].already, 'Series 1 is already in the portfolio');
  assert.ok(!items.some((i) => /Should not be read/.test(i.title)), 'reading stops at section VIII');
  const saved = await call('POST', '/portfolio/ld/import', { items: items.filter((i) => !i.already) });
  assert.equal(saved.body.saved, 3);
  const y = (await call('GET', '/portfolio/ld?year=2025')).body;
  assert.equal(y.items.length, 6);
  assert.equal((await call('GET', '/portfolio/ld?year=2024')).body.total_hours, 56);
  assert.equal((await call('POST', '/portfolio/ld/import/read', Buffer.from('not excel'))).status, 422);
});
