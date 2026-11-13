// Phase 5 — Intelligence: analytics and reports computed only from stored records, with traceable sources.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'synchronia-intel-'));
process.env.SYNCHRONIA_DATA_DIR = tmp;
const { openDatabase } = await import('../src/db.js');
const { createApp } = await import('../src/app.js');
const JSZip = (await import('jszip')).default;
const ExcelJS = (await import('exceljs')).default;
const require = createRequire(import.meta.url);
let chromium = null;
try { ({ chromium } = require('playwright')); } catch { /* optional */ }

const TOKEN = 'intelligence-test-token-'.padEnd(48, 'i');
let server, base, db, browser, cookie = '';
async function call(method, url, body, raw = false) {
  const res = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json', 'X-Synchronia': '1', Cookie: cookie }, body: body === undefined ? undefined : JSON.stringify(body) });
  if (raw) return { status: res.status, buf: Buffer.from(await res.arrayBuffer()), type: res.headers.get('content-type') };
  const t = await res.text();
  return { status: res.status, body: t ? JSON.parse(t) : null };
}
const mk = async (type, body) => { const r = await call('POST', `/records/${type}`, body); assert.equal(r.status, 201, `${type}: ${JSON.stringify(r.body)}`); return r.body; };
const A = (body, key) => body.sections.flatMap((s) => s.metrics).find((m) => m.key === key);
const ids = {};

before(async () => {
  db = openDatabase(':memory:');
  let pdfRenderer = null;
  if (chromium) {
    browser = await chromium.launch();
    pdfRenderer = async (html, { footerTemplate }) => {
      const page = await browser.newPage();
      try { await page.setContent(html, { waitUntil: 'load' }); return await page.pdf({ preferCSSPageSize: true, printBackground: true, displayHeaderFooter: true, headerTemplate: '<span></span>', footerTemplate }); } finally { await page.close(); }
    };
  }
  server = createApp(db, { accessToken: TOKEN, pdfRenderer }).listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}/api`;
  cookie = (await fetch(`${base}/open?token=${TOKEN}`, { redirect: 'manual' })).headers.get('set-cookie').split(';')[0];
  await call('PUT', '/profile', { full_name: 'Maria Santos', current_position: 'Instructor I' });

  // AY 2026-2027 = 1 Jun 2026 – 31 May 2027. Records inside, outside and undated.
  const course = await mk('courses', { code: 'EDUC 101', title: 'The Teaching Profession' });
  const old = await mk('courses', { code: 'EDUC 9', title: 'Old Course' });
  await mk('teaching_assignments', { course_id: course.id, academic_year: '2026-2027', semester: 'first', section: 'A', student_count: 40, status: 'active' });
  await mk('teaching_assignments', { course_id: course.id, academic_year: '2026-2027', semester: 'first', section: 'B', student_count: 35, status: 'active' });
  await mk('teaching_assignments', { course_id: old.id, academic_year: '2023-2024', semester: 'second', status: 'completed' });
  await mk('syllabi', { course_id: course.id, version_label: 'v1', academic_year: '2026-2027', status: 'approved' });
  await mk('materials', { course_id: course.id, title: 'Module 1', material_type: 'module', event_date: '2026-08-15' });
  ids.training = (await mk('trainings', { title: 'Research Methods Workshop', training_type: 'workshop', start_date: '2026-09-10', hours: 16, cpd_units: 4, verification: 'user_confirmed' })).id;
  await mk('trainings', { title: 'Outcomes-Based Education Seminar', training_type: 'seminar', start_date: '2026-10-01', hours: 8 });
  await mk('trainings', { title: 'Webinar on Inclusion', start_date: '2025-01-15', hours: 3 });
  await mk('trainings', { title: 'Undated orientation', hours: 2 });
  await mk('trainings', { title: 'Classroom Assessment Training', role: 'speaker', start_date: '2027-02-02', hours: 6 });
  await mk('research_projects', { title: 'Inclusive Practices Study', status: 'data_collection', start_date: '2026-07-01', collaborators: 'Dr. Cruz' });
  await mk('research_projects', { title: 'Completed Study', status: 'completed', start_date: '2025-06-01', end_date: '2026-12-15' });
  await mk('publications', { title: 'Inclusion in Rural Schools', authors: 'Santos, M.', status: 'published', publication_date: '2027-03-01', publication_type: 'journal_article' });
  await mk('publications', { title: 'Draft Manuscript', authors: 'Santos, M.', status: 'submitted' });
  await mk('extension_projects', { title: 'Literacy Outreach', project_type: 'extension_project', partner: 'Barangay San Jose', start_date: '2026-11-05', end_date: '2026-11-30', status: 'completed', participants_count: 60 });
  await mk('extension_projects', { title: 'Teacher Training', project_type: 'training_conducted', partner: 'barangay san jose', start_date: '2027-01-10', status: 'ongoing', participants_count: 25, training_hours: 8 });
  ids.award = (await mk('awards', { title: 'Best Paper Award', date_received: '2027-03-20', level: 'national', verification: 'user_confirmed' })).id;
  await call('POST', `/records/awards/${ids.award}/evidence`, { provider: 'url', title: 'Certificate', url: 'https://example.edu/cert.pdf' });
  await mk('licenses', { license_type: 'Professional Teacher', issuing_authority: 'PRC', registration_date: '2026-06-20', valid_until: '2026-06-30' });
  await mk('correspondence', { direction: 'incoming', subject: 'Memo on enrolment', document_date: '2026-08-01' });
  await mk('correspondence', { direction: 'outgoing', subject: 'Reply to memo', document_date: '2026-08-03' });
  await mk('activities', { kind: 'meeting', title: 'Faculty meeting', event_date: '2026-08-20' });
  await mk('committees', { committee: 'Board Secretariat', assignment_type: 'secretariat', start_date: '2025-01-01', is_current: true });
});
after(async () => { server.close(); db.close(); await browser?.close(); fs.rmSync(tmp, { recursive: true, force: true }); });

const AY = '?from=2026-06-01&to=2027-05-31';

test('catalog lists sections A–E, indicators with their date basis, and eight report types', async () => {
  const c = (await call('GET', '/intelligence/catalog')).body;
  assert.deepEqual(c.sections.map((s) => s.code), ['A', 'B', 'C', 'D', 'E']);
  assert.ok(c.metrics.every((m) => m.basis), 'every indicator says what it is counted by');
  assert.deepEqual(c.reports.map((r) => r.key), ['annual_academic', 'faculty_development', 'research_productivity', 'extension', 'professional_development', 'portfolio_summary', 'administrative', 'custom']);
});

test('analytics count only records in the period, and report undated records instead of guessing', async () => {
  const a = (await call('GET', `/intelligence/analytics${AY}`)).body;
  assert.equal(a.period.label, 'June 1, 2026 – May 31, 2027');
  assert.equal(A(a, 'courses').count, 1, 'only the course offered in AY 2026-2027');
  assert.equal(A(a, 'classes').count, 2);
  assert.deepEqual(A(a, 'classes').sums, [{ field: 'student_count', unit: 'students', value: 75, missing: 0 }]);
  assert.equal(A(a, 'syllabi').count, 1);
  assert.equal(A(a, 'materials').count, 1);
  const dev = A(a, 'dev_activities');
  assert.equal(dev.count, 3, 'two trainings attended plus one as speaker, all dated in the period');
  assert.equal(dev.undated, 1, 'the undated orientation is reported, not counted');
  assert.equal(dev.sums.find((s) => s.unit === 'hours').value, 30);
  assert.equal(A(a, 'research_training').count, 1);
  assert.equal(A(a, 'research_initiated').count, 1);
  assert.equal(A(a, 'research_ongoing').count, 1);
  assert.equal(A(a, 'research_completed').count, 1);
  assert.equal(A(a, 'publications').count, 1);
  assert.equal(A(a, 'publications_pipeline').count, 1);
  assert.equal(A(a, 'collaborations').count, 1);
  assert.equal(A(a, 'extension_projects').count, 1);
  assert.equal(A(a, 'trainings_conducted').sums.find((s) => s.unit === 'training hours').value, 8);
  assert.equal(A(a, 'partnerships').count, 1, 'distinct partners, ignoring letter case');
  assert.equal(A(a, 'resource_speaker').count, 1);
  assert.equal(A(a, 'licenses').sources[0].group, 'expired');
  assert.equal(A(a, 'incoming').count, 1);
  assert.equal(A(a, 'outgoing').count, 1);
  assert.equal(A(a, 'meetings').count, 1);
  assert.equal(A(a, 'secretariat').count, 1, 'a current assignment that began before the period still counts');

  const all = (await call('GET', '/intelligence/analytics')).body;
  assert.equal(A(all, 'courses').count, 2);
  assert.equal(A(all, 'dev_activities').count, 5, 'without a period every record counts, dated or not');
  const none = (await call('GET', '/intelligence/analytics?from=2010-01-01&to=2010-12-31')).body;
  assert.equal(none.totals.records, 0);
});

test('every figure is traceable to its records, and support is distinguished honestly', async () => {
  const a = (await call('GET', `/intelligence/analytics${AY}`)).body;
  const award = A(a, 'awards').sources[0];
  assert.deepEqual({ type: award.type, id: award.id, title: award.title, support: award.support, evidence: award.evidence }, { type: 'awards', id: ids.award, title: 'Best Paper Award', support: 'evidenced', evidence: 1 });
  const tr = A(a, 'dev_activities').sources.find((s) => s.id === ids.training);
  assert.equal(tr.support, 'confirmed');
  assert.equal(A(a, 'dev_activities').support.self_reported, 2);
  assert.equal(A(a, 'syllabi').sources[0].support, 'system');
  assert.match(A(a, 'syllabi').sources[0].title, /^EDUC 101 · v1$/);

  const ev = (await call('GET', `/intelligence/analytics${AY}&support=evidenced`)).body;
  assert.equal(ev.totals.records, 1);
  assert.equal(A(ev, 'awards').count, 1);
  const conf = (await call('GET', `/intelligence/analytics${AY}&support=confirmed`)).body;
  assert.equal(A(conf, 'dev_activities').count, 1, 'self-reported trainings left out');

  const m = (await call('GET', `/intelligence/metrics/publications${AY}`)).body;
  assert.equal(m.sources[0].title, 'Inclusion in Rural Schools');
  assert.equal((await call('GET', '/intelligence/metrics/nope')).status, 404);
});

test('filters are validated', async () => {
  for (const q of ['?from=2026-13', '?from=2027-01-01&to=2026-01-01', '?sections=academic,bogus', '?support=maybe']) {
    assert.equal((await call('GET', `/intelligence/analytics${q}`)).status, 422, q);
  }
  const only = (await call('GET', '/intelligence/analytics?sections=research,admin')).body;
  assert.deepEqual(only.sections.map((s) => s.code), ['B', 'E']);
});

test('Word report: summary, detail rows citing [S#] sources, source list, signatures', async () => {
  const r = await call('POST', '/intelligence/reports', { type: 'annual_academic', from: '2026-06-01', to: '2027-05-31', format: 'docx' });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.match(r.body.file_name, /^Annual_Academic_Accomplishment_Report_2026-06-01_to_2027-05-31_\d{4}-\d{2}-\d{2}\.docx$/);
  const f = await call('GET', r.body.download.replace('/api', ''), undefined, true);
  const text = (await (await JSZip.loadAsync(f.buf)).file('word/document.xml').async('string')).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  assert.match(text, /Annual Academic Accomplishment Report/);
  assert.match(text, /Period: June 1, 2026 – May 31, 2027/);
  assert.match(text, /This report is generated from \d+ records/);
  assert.match(text, /Summary Indicator Count Totals Support Courses managed 1/);
  assert.match(text, /Faculty development activities 3 30 hours; 4 CPD units/);
  assert.match(text, /S\d+ Best Paper Award March 20, 2027 National Evidence \(1 file\)/);
  assert.match(text, /1 undated record was left out/);
  assert.match(text, /Source records Ref Record type Title Date Support Record ID/);
  assert.match(text, new RegExp(`awards#${ids.award}`));
  assert.match(text, /Prepared by: MARIA SANTOS Instructor I/);
  assert.doesNotMatch(text, /Old Course/, 'records outside the period are not in the report');
});

test('spreadsheet report: Summary, Records and Sources sheets with real dates', async () => {
  const r = await call('POST', '/intelligence/reports', { type: 'research_productivity', from: '2026-06-01', to: '2027-05-31', format: 'xlsx' });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const f = await call('GET', r.body.download.replace('/api', ''), undefined, true);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(f.buf);
  assert.deepEqual(wb.worksheets.map((w) => w.name), ['Summary', 'Records', 'Sources']);
  const sum = wb.getWorksheet('Summary');
  const pubRow = sum.getRows(2, sum.rowCount - 1).find((row) => row.getCell(2).value === 'Publications (published)');
  assert.equal(pubRow.getCell(3).value, 1);
  const src = wb.getWorksheet('Sources');
  const pub = src.getRows(2, src.rowCount - 1).find((row) => row.getCell(3).value === 'Inclusion in Rural Schools');
  assert.ok(pub.getCell(4).value instanceof Date, 'dates are real spreadsheet dates');
  assert.equal(pub.getCell(5).value, 'Self-reported');

  const xa = await call('GET', `/intelligence/analytics.xlsx${AY}`, undefined, true);
  assert.equal(xa.status, 200);
  assert.match(xa.type, /spreadsheetml/);
});

test('PDF report is a real PDF', { skip: !chromium && 'Playwright Chromium not available' }, async () => {
  const r = await call('POST', '/intelligence/reports', { type: 'administrative', format: 'pdf' });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const f = await call('GET', r.body.download.replace('/api', ''), undefined, true);
  assert.equal(f.buf.subarray(0, 5).toString(), '%PDF-');
});

test('custom report needs sections; an empty period says so instead of inventing content', async () => {
  assert.equal((await call('POST', '/intelligence/reports', { type: 'custom', sections: [], format: 'docx' })).status, 422);
  assert.equal((await call('POST', '/intelligence/reports', { type: 'nope' })).status, 422);
  assert.equal((await call('POST', '/intelligence/reports', { type: 'custom', sections: ['admin'], format: 'rtf' })).status, 422);
  const r = await call('POST', '/intelligence/reports', { type: 'custom', sections: ['research'], from: '2010-01-01', to: '2010-12-31', format: 'docx' });
  assert.equal(r.status, 201);
  assert.equal(r.body.sources, 0);
  const f = await call('GET', r.body.download.replace('/api', ''), undefined, true);
  const text = (await (await JSZip.loadAsync(f.buf)).file('word/document.xml').async('string')).replace(/<[^>]+>/g, ' ');
  assert.match(text, /No records fall within the period/);
  const list = (await call('GET', '/intelligence/reports')).body;
  assert.ok(list.length >= 4);
  assert.ok(list.every((x) => x.report_type.startsWith('intelligence_') && x.download));
});
