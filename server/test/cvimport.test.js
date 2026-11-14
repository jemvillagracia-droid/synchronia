// CV importer: reads a PDF or Word CV into reviewed portfolio records. Fixtures are synthetic CVs laid out like a
// typical CV builder export (bold titles, right-aligned dates, indented bullets, capitalised section headings).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { Document, Packer, Paragraph, TextRun, TabStopType } from 'docx';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'synchronia-cvimp-'));
process.env.SYNCHRONIA_DATA_DIR = tmp;
const { openDatabase } = await import('../src/db.js');
const { createApp } = await import('../src/app.js');
const { parseDate, parseRange } = await import('../src/portfolio/cvImport.js');
const require = createRequire(import.meta.url);
let chromium = null;
try { ({ chromium } = require('playwright')); } catch { /* optional */ }

const TOKEN = 'cv-import-test-token-'.padEnd(48, 'v');
let server, base, db, cookie = '';
const call = async (method, url, body, bin) => {
  const r = await fetch(base + url, { method, headers: { 'X-Synchronia': '1', Cookie: cookie, 'Content-Type': bin ? 'application/octet-stream' : 'application/json', 'X-Filename': 'Sample_CV.pdf' }, body: bin || (body === undefined ? undefined : JSON.stringify(body)) });
  const t = await r.text();
  return { status: r.status, body: t ? JSON.parse(t) : null };
};
const ok = (r, code = 200) => { assert.equal(r.status, code, JSON.stringify(r.body)); return r.body; };

const SECTIONS = [
  ['EDUCATION', [
    { t: 'Master of Arts in Education, Major in Guidance and Counseling', o: 'Sample State University', d: '2023 – present' },
    { t: 'Bachelor of Science in Psychology', o: 'Sample University', d: '2014 – 2019' },
    { t: 'High School', o: 'Sample Catholic College', d: '2010 – 2014', b: ['Best in Conduct (Third Year)'] },
  ]],
  ['PROFESSIONAL EXPERIENCE', [
    { t: 'Administrative Aide VI (Clerk III)', o: 'Sample State University', d: '2023 – Present' },
    { t: 'Guidance Staff', o: 'Sample State University - North Campus', d: '2022 – 2023', b: ['Handled intake interviews and records'] },
  ]],
  ['PRC LICENSES', [
    { t: 'Registered Psychometrician (RPm)', o: 'Board of Psychology, Professional Regulatory Commission', d: '2019 – Present' },
  ]],
  ['RESEARCH INVOLVEMENT AND PUBLICATIONS', [
    { t: 'Determinants of global talent mobility', b: ['Research Assistant and Co-Author, working with Dr. A. Researcher and Dr. B. Scholar', 'Academy of Management; https://doi.org/10.5465/AMBPP.2022.10383abstract'] },
  ]],
  ['LITERARY PUBLICATIONS (ANTHOLOGY)', [
    { t: 'Love in Style Vol. 1', o: 'Sample Books', d: '14th February 2023', b: ['"Love is Rosy" as author name Sam Sample', 'ISBN 978-621-0000-00-0 (paperback)'] },
  ]],
  ['PROFESSIONAL ORGANIZATIONS', [
    { t: 'Psychological Association of the Philippines', o: 'Member (Psychometrician)', d: 'present' },
  ]],
  ['RESOURCE SPEAKERSHIP', [
    { t: 'S.E.R.V.E. with Purpose: Empowering Student Leaders through Engagement, Responsible, and Visionary Leadership, and Excellence', o: 'Sample State University', d: 'November 2025' },
    { t: 'Goal Setting and Overcoming Procrastination among College Students', o: 'Sample State University', d: 'November 2023' },
  ]],
  ['CHARACTER REFERENCES', [{ t: 'Dr. Someone Else', o: 'Professor' }]],
];

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const cvHtml = () => `<!doctype html><html><head><style>
@page { size: A4; margin: 15mm 15mm; } body { font-family: Arial, sans-serif; font-size: 11pt; }
h1 { font-size: 20pt; margin: 0; } .contact { font-size: 10pt; margin-bottom: 8pt; }
h2 { font-size: 14pt; margin: 12pt 0 4pt 18pt; } .e { margin: 6pt 0; } .row { display: flex; justify-content: space-between; }
.t { font-weight: bold; width: 70%; } .d { font-weight: normal; } .ul { margin: 2pt 0 2pt 18pt; font-size: 10pt; }
</style></head><body><h1>Sam P. Sample, RPm, LPT</h1>
<div class="contact">0340 Sample St., Binangonan, Rizal &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; sam.sample@example.com &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; 09171234567</div>
${SECTIONS.map(([h, es]) => `<h2>${h}</h2>${es.map((e) => `<div class="e"><div class="row"><span class="t">${esc(e.t)}</span><span class="d">${e.d || ''}</span></div>${e.o ? `<div>${esc(e.o)}</div>` : ''}${e.b ? `<div class="ul">${e.b.map((x) => `<div>• ${esc(x)}</div>`).join('')}</div>` : ''}</div>`).join('')}`).join('')}
</body></html>`;

async function cvDocx() {
  const kids = [new Paragraph({ children: [new TextRun({ text: 'Sam P. Sample, RPm, LPT', bold: true, size: 40 })] }),
    new Paragraph({ children: [new TextRun({ text: 'sam.sample@example.com\t09171234567', size: 20 })] })];
  for (const [h, es] of SECTIONS) {
    kids.push(new Paragraph({ children: [new TextRun({ text: h, bold: true, size: 28 })] }));
    for (const e of es) {
      kids.push(new Paragraph({ tabStops: [{ type: TabStopType.RIGHT, position: 9000 }], children: [new TextRun({ text: e.t, bold: true, size: 22 }), ...(e.d ? [new TextRun({ text: `\t${e.d}`, size: 22 })] : [])] }));
      if (e.o) kids.push(new Paragraph({ children: [new TextRun({ text: e.o, size: 22 })] }));
      for (const b of e.b || []) kids.push(new Paragraph({ bullet: { level: 0 }, children: [new TextRun({ text: b, size: 20 })] }));
    }
  }
  return Packer.toBuffer(new Document({ sections: [{ children: kids }] }));
}

before(async () => {
  db = openDatabase(':memory:');
  server = createApp(db, { accessToken: TOKEN }).listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}/api`;
  cookie = (await fetch(`${base}/open?token=${TOKEN}`, { redirect: 'manual' })).headers.get('set-cookie').split(';')[0];
});
after(() => { server.close(); db.close(); fs.rmSync(tmp, { recursive: true, force: true }); });

test('dates keep the precision the CV gives', () => {
  assert.equal(parseDate('2019'), '2019');
  assert.equal(parseDate('December 2025'), '2025-12');
  assert.equal(parseDate('7th July 2024'), '2024-07-07');
  assert.equal(parseDate('July 16, 2023'), '2023-07-16');
  assert.deepEqual(parseRange('2023 – present'), { start: '2023', end: null, current: true });
  assert.deepEqual(parseRange('2014 – 2019'), { start: '2014', end: '2019', current: false });
  assert.deepEqual(parseRange('present'), { start: null, end: null, current: true });
  assert.equal(parseRange('Best in Conduct'), null);
});

const check = (p) => {
  const by = (r) => p.items.filter((i) => i.resource === r).map((i) => i.values);
  assert.equal(p.profile.find((x) => x.field === 'full_name').value, 'Sam P. Sample, RPm, LPT');
  assert.equal(p.profile.find((x) => x.field === 'email').value, 'sam.sample@example.com');
  assert.equal(p.profile.find((x) => x.field === 'phone').value, '09171234567');
  const edu = by('education');
  assert.deepEqual(edu.map((e) => [e.degree, e.institution, e.start_date, e.graduation_date ?? null, e.status]), [
    ['Master of Arts in Education, Major in Guidance and Counseling', 'Sample State University', '2023', null, 'ongoing'],
    ['Bachelor of Science in Psychology', 'Sample University', '2014', '2019', 'completed'],
    ['High School', 'Sample Catholic College', '2010', '2014', 'completed']]);
  assert.equal(edu[2].distinctions, 'Best in Conduct (Third Year)');
  const emp = by('employment');
  assert.deepEqual(emp.map((e) => [e.position, e.is_current]), [['Administrative Aide VI (Clerk III)', true], ['Guidance Staff', false]]);
  assert.equal(by('licenses')[0].issuing_authority, 'Board of Psychology, Professional Regulatory Commission');
  const pubs = by('publications');
  assert.equal(pubs[0].doi, '10.5465/AMBPP.2022.10383abstract');
  assert.equal(pubs[0].status, 'published');
  assert.equal(pubs[0].venue, 'Academy of Management');
  assert.deepEqual([pubs[1].title, pubs[1].authors, pubs[1].venue, pubs[1].publication_date, pubs[1].publication_type], ['Love is Rosy', 'Sam Sample', 'Love in Style Vol. 1', '2023-02-14', 'book_chapter']);
  assert.match(pubs[1].notes, /ISBN 978-621-0000-00-0/);
  assert.deepEqual(by('memberships').map((m) => [m.organization, m.membership_type, m.is_current]), [['Psychological Association of the Philippines', 'Member (Psychometrician)', true]]);
  const talks = by('trainings');
  assert.deepEqual(talks.map((t) => [t.title.slice(0, 26), t.role, t.start_date]), [['S.E.R.V.E. with Purpose: E', 'speaker', '2025-11'], ['Goal Setting and Overcomin', 'speaker', '2023-11']]);
  assert.ok(talks[0].title.endsWith('and Excellence'), 'a wrapped title stays one entry');
  assert.deepEqual(p.skipped.map((s) => s.heading), ['CHARACTER REFERENCES'], 'references are listed, not imported');
};

test('PDF CV: profile, sections and entries recognised for review', { skip: !chromium && 'Playwright Chromium not available' }, async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent(cvHtml());
  const pdf = await page.pdf({ format: 'A4', printBackground: true });
  await browser.close();
  const p = ok(await call('POST', '/portfolio/import-cv', undefined, pdf));
  assert.equal(p.format, 'pdf');
  check(p);
});

test('Word CV: the same structure from bold runs, tabs and list paragraphs', async () => {
  const p = ok(await call('POST', '/portfolio/import-cv', undefined, await cvDocx()));
  assert.equal(p.format, 'docx');
  check(p);
});

test('commit saves reviewed items as self-reported, all or nothing; duplicates are flagged next time', async () => {
  const p = ok(await call('POST', '/portfolio/import-cv', undefined, await cvDocx()));
  // An item with a required field removed makes the whole import fail, saving nothing.
  const broken = structuredClone(p);
  const lic = broken.items.find((i) => i.resource === 'licenses');
  delete lic.values.issuing_authority;
  const bad = await call('POST', '/portfolio/import-cv/commit', broken);
  assert.equal(bad.status, 422);
  assert.equal(bad.body.details.failures.length, 1);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM education_records').get().n, 0, 'nothing saved');

  const r = ok(await call('POST', '/portfolio/import-cv/commit', p), 201);
  assert.deepEqual(r.created, { education: 3, employment: 2, licenses: 1, publications: 2, memberships: 1, trainings: 2 });
  assert.deepEqual(r.profile_updated.sort(), ['email', 'full_name', 'phone'].sort().concat(p.profile.filter((x) => x.apply && !['email', 'full_name', 'phone'].includes(x.field)).map((x) => x.field)).sort());
  const bs = db.prepare("SELECT degree, start_date, graduation_date, verification, notes FROM education_records WHERE degree LIKE 'Bachelor%'").get();
  assert.deepEqual({ ...bs }, { degree: 'Bachelor of Science in Psychology', start_date: '2014', graduation_date: '2019', verification: 'self_reported', notes: 'Imported from Sample_CV.pdf.' });
  // The CV builder shows year-only dates as years, not invented months.
  const again = ok(await call('POST', '/portfolio/import-cv', undefined, await cvDocx()));
  assert.ok(again.items.every((i) => i.duplicate_of && !i.include), 'everything is now recognised as already in the portfolio');
  assert.ok(again.profile.every((x) => !x.apply || x.current === null), 'existing profile fields are not overwritten by default');
});

test('non-CV files are refused with a clear message', async () => {
  assert.equal((await call('POST', '/portfolio/import-cv', undefined, Buffer.from('just some text, not a document'.repeat(10)))).status, 415);
  assert.equal((await call('POST', '/portfolio/import-cv/commit', { items: [] })).status, 422);
  assert.equal((await call('POST', '/portfolio/import-cv/commit', { items: [{ include: true, resource: 'users', values: {} }] })).status, 422);
});

test('speaking engagements get their own CV section; existing CVs receive it hidden', async () => {
  const cv = ok(await call('POST', '/cv', { name: 'Academic CV', cv_type: 'academic', template_key: 'harvard_academic' }), 201);
  const id = cv.id ?? cv.cv?.id;
  const full = ok(await call('GET', `/cv/${id}`));
  const sec = (k) => (full.sections || full.cv?.sections).find((s) => s.section_key === k || s.key === k);
  const speaking = sec('speaking');
  const development = sec('development');
  assert.ok(speaking, 'section exists');
  const count = (s) => (s.entries || []).filter((e) => e.included !== false).length;
  assert.equal(count(speaking), 2);
  assert.equal(count(development), 0, 'talks are not repeated under Professional Development');
  // Migration 009 on a CV that predates the section: added hidden and empty, nothing else touched.
  db.prepare("DELETE FROM cv_sections WHERE cv_profile_id = ? AND section_key = 'speaking'").run(id);
  db.exec(fs.readFileSync(new URL('../migrations/009_cv_speaking_section.sql', import.meta.url), 'utf8'));
  const row = db.prepare("SELECT visible, (SELECT COUNT(*) FROM cv_entries WHERE cv_section_id = s.id) n FROM cv_sections s WHERE cv_profile_id = ? AND section_key = 'speaking'").get(id);
  assert.deepEqual({ ...row }, { visible: 0, n: 0 });
});

test('wording suggestions: rule-based, shown before applying, applied where the text lives', async () => {
  const { pastTense, wordingSuggestions } = await import('../src/cv/analyze.js');
  assert.deepEqual(['handling', 'studying', 'planning', 'teaching', 'coordinating', 'managing'].map(pastTense), ['Handled', 'Studied', 'Planned', 'Taught', 'Coordinated', 'Managed']);
  const model = { sections: [{ heading: 'Experience', entries: [{ id: 1, title: 'Aide', source: { type: 'employment', id: 9 }, details: ['Responsible for handling incoming documents', 'Worked on the enrolment database', 'Prepared minutes'] }] }] };
  assert.deepEqual(wordingSuggestions(model).map((s) => [s.original, s.suggested]), [
    ['Responsible for handling incoming documents', 'Handled incoming documents'],
    ['Worked on the enrolment database', 'Contributed to the enrolment database']]);

  const job = ok(await call('POST', '/records/employment', { position: 'Records Officer', institution: 'Sample Office', start_date: '2020', responsibilities: '• Responsible for handling incoming documents\n• Prepared minutes' }), 201);
  const cv = ok(await call('POST', '/cv', { name: 'Portfolio CV', cv_type: 'portfolio' }), 201);
  const cvId = cv.id ?? cv.cv?.id;
  const full = ok(await call('GET', `/cv/${cvId}`));
  const entry = (full.sections || full.cv.sections).find((s) => (s.section_key || s.key) === 'employment').entries.find((e) => (e.source?.id ?? e.source_id) === job.id);
  assert.ok(entry, 'the portfolio CV includes the record');
  const r = ok(await call('POST', `/cv/${cvId}/wording`, { entry_id: entry.id, original: 'Responsible for handling incoming documents', suggested: 'Handled incoming documents' }));
  assert.equal(r.applied_to, 'portfolio');
  const after = ok(await call('GET', `/records/employment/${job.id}`));
  assert.equal(after.responsibilities, '• Handled incoming documents\n• Prepared minutes', 'bullet kept, other lines untouched');
  assert.equal((await call('POST', `/cv/${cvId}/wording`, { entry_id: entry.id, original: 'Responsible for handling incoming documents', suggested: 'x' })).status, 409, 'stale suggestions are refused');
  assert.ok(ok(await call('GET', `/records/employment/${job.id}/history`)).length >= 2, 'the change is in the version history');
});
