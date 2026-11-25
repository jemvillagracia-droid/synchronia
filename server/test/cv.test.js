import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'synchronia-cv-'));
process.env.SYNCHRONIA_DATA_DIR = tmp;

const { openDatabase } = await import('../src/db.js');
const { createApp } = await import('../src/app.js');
const { inspectImage } = await import('../src/cv/images.js');
const JSZip = (await import('jszip')).default;

// PDF rendering in tests uses headless Chromium (the desktop app uses Electron's Chromium the same way).
const require = createRequire(import.meta.url);
let chromium = null;
try { ({ chromium } = require('playwright')); } catch { /* optional */ }

const TOKEN = 'cv-test-access-token-'.padEnd(48, 'z');
let server, base, db, browser, cookie = '';

async function call(method, url, body, { raw = false, headers = {} } = {}) {
  const res = await fetch(base + url, {
    method, headers: { 'Content-Type': 'application/json', 'X-Synchronia': '1', Cookie: cookie, ...headers },
    body: body === undefined ? undefined : JSON.stringify(body), redirect: 'manual',
  });
  if (raw) return { status: res.status, buf: Buffer.from(await res.arrayBuffer()), headers: res.headers };
  const text = await res.text();
  let parsed; try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text; }
  return { status: res.status, body: parsed };
}

function upload(url, buf, type, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(base + url);
    const req = http.request({ hostname: '127.0.0.1', port: u.port, path: u.pathname + u.search, method: url.includes('/optimized') ? 'PUT' : 'POST',
      headers: { 'Content-Type': type, 'X-Synchronia': '1', Cookie: cookie, 'Content-Length': buf.length, ...extraHeaders } }, (res) => {
      let d = ''; res.on('data', (c) => { d += c; }); res.on('end', () => resolve({ status: res.statusCode, body: d ? JSON.parse(d) : null }));
    });
    req.on('error', reject);
    req.end(buf);
  });
}

before(async () => {
  db = openDatabase(':memory:');
  let pdfRenderer = null;
  if (chromium) {
    browser = await chromium.launch();
    pdfRenderer = async (html, { footerTemplate }) => {
      const page = await browser.newPage();
      try {
        await page.setContent(html, { waitUntil: 'load' });
        return await page.pdf({ preferCSSPageSize: true, printBackground: true, tagged: true, displayHeaderFooter: !!footerTemplate, headerTemplate: '<span></span>', footerTemplate: footerTemplate || '<span></span>' });
      } finally { await page.close(); }
    };
  }
  server = createApp(db, { accessToken: TOKEN, pdfRenderer }).listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}/api`;
  const open = await fetch(`${base}/open?token=${TOKEN}`, { redirect: 'manual' });
  cookie = open.headers.get('set-cookie').split(';')[0];

  await call('PUT', '/profile', {
    full_name: 'Maria Santos', professional_title: 'Administrative Aide IV', academic_designation: 'LPT, MAEd', email: 'maria@csu.edu.ph',
    phone: '+63 917 555 0101', specialization: 'Educational Management; Curriculum Development', research_interests: 'Outcomes-based education, faculty development',
    biography: 'Education professional with seven years of academic administration experience.',
  });
  const post = (t, b) => call('POST', `/records/${t}`, b);
  await post('education', { degree: 'Master of Arts in Education', major: 'Educational Management', institution: 'Central State University', location: 'Iloilo City', graduation_date: '2025-06-20' });
  await post('education', { degree: 'Bachelor of Secondary Education', major: 'English', institution: 'Western Visayas College', graduation_date: '2016-03-30', distinctions: 'Cum laude' });
  await post('licenses', { license_type: 'Licensed Professional Teacher', issuing_authority: 'Professional Regulation Commission', registration_number: '1789456', registration_date: '2016-11-10' });
  await post('employment', { position: 'Administrative Aide IV', institution: 'Central State University', office: 'Office of the VPAA', start_date: '2019-02-01', is_current: true, responsibilities: 'Secretariat to the Academic Council\nCorrespondence registry' });
  await post('trainings', { title: 'OBE Syllabus Writing Workshop', organizer: 'CHED', start_date: '2026-03-12', hours: 24, training_type: 'workshop' });
  await post('trainings', { title: 'Google Certified Educator Level 1', organizer: 'Google for Education', start_date: '2024-05-02', training_type: 'certification' });
  await post('publications', { title: 'Readiness of Newly Hired Instructors for OBE', authors: 'Santos, M. A.', venue: 'Philippine Journal of Higher Education', volume: '12', issue: '2', pages: '45-61', publication_date: '2026-05-30', status: 'published', doi: '10.1234/pjhe.2026.045' });
  await post('awards', { title: 'Outstanding Non-Teaching Personnel', issuer: 'Central State University', date_received: '2024-12-18' });
  await post('committees', { committee: 'Academic Council', role: 'Secretary', assignment_type: 'secretariat', start_date: '2022-06-01', is_current: true });
});

after(async () => { server.close(); db.close(); await browser?.close(); fs.rmSync(tmp, { recursive: true, force: true }); });

let cvId;

test('creating a CV pulls every eligible portfolio record into the right sections', async () => {
  const bad = await call('POST', '/cv', { name: '' });
  assert.equal(bad.status, 422);
  const r = await call('POST', '/cv', { name: 'Faculty application — CSU', cv_type: 'academic' });
  assert.equal(r.status, 201);
  cvId = r.body.id;
  assert.equal(r.body.template_key, 'harvard_academic');
  assert.equal(r.body.status, 'draft');
  const sec = (k) => r.body.sections.find((s) => s.key === k);
  assert.equal(sec('education').entries.length, 2);
  assert.equal(sec('licenses').entries.length, 2, 'licence + certification-type training');
  assert.equal(sec('development').entries.length, 1, 'certifications are not double-listed');
  assert.equal(sec('service').entries.length, 1);
  assert.equal(sec('publications').entries[0].kind, 'citation');
  assert.match(sec('publications').entries[0].text, /Santos, M\. A\. \(2026\)\. Readiness .*12\(2\), 45-61\. https:\/\/doi\.org\/10\.1234/);
  assert.equal(sec('employment').entries[0].dates, 'Feb 2019 – Present');
  assert.equal(sec('education').entries[0].title, 'Master of Arts in Education, Educational Management', 'reverse-chronological by default');
  assert.deepEqual(sec('specialization').entries[0].items, ['Educational Management', 'Curriculum Development']);
  assert.equal(r.body.pending_total, 0);
});

test('new portfolio records are offered, not silently added; dismissed ones are not offered again', async () => {
  await call('POST', '/records/trainings', { title: 'Research Ethics Seminar', organizer: 'URO', start_date: '2025-08-01', hours: 8, training_type: 'seminar' });
  await call('POST', '/records/awards', { title: 'Service Award (10 years)', issuer: 'CSU', date_received: '2026-01-15' });
  let cv = (await call('GET', `/cv/${cvId}`)).body;
  assert.equal(cv.pending_total, 2);
  const dev = cv.sections.find((s) => s.key === 'development');
  assert.equal(dev.entries.length, 1, 'not added automatically');
  assert.equal(dev.pending[0].title, 'Research Ethics Seminar');
  const notes = (await call('GET', '/notifications')).body.items;
  assert.ok(notes.some((n) => n.type === 'cv' && /2 new portfolio records/.test(n.detail)));
  cv = (await call('POST', `/cv/${cvId}/sync`, { section_id: dev.id, action: 'add' })).body;
  assert.equal(cv.sections.find((s) => s.key === 'development').entries.length, 2);
  const awards = cv.sections.find((s) => s.key === 'awards');
  cv = (await call('POST', `/cv/${cvId}/sync`, { section_id: awards.id, action: 'dismiss' })).body;
  assert.equal(cv.pending_total, 0);
  const aw = cv.sections.find((s) => s.key === 'awards').entries;
  assert.equal(aw.filter((e) => !e.included).length, 1, 'dismissed = excluded');
});

test('editing: overrides, manual and custom entries, ordering, headings and settings', async () => {
  let cv = (await call('GET', `/cv/${cvId}`)).body;
  const emp = cv.sections.find((s) => s.key === 'employment');
  cv = (await call('PATCH', `/cv/${cvId}/entries/${emp.entries[0].id}`, { override: { details: ['Secretariat to the Academic Council (24 sessions)', 'Correspondence registry'] } })).body;
  const e = cv.sections.find((s) => s.key === 'employment').entries[0];
  assert.equal(e.overridden, true);
  assert.equal(e.details[0], 'Secretariat to the Academic Council (24 sessions)');
  assert.equal(e.title, 'Administrative Aide IV', 'non-overridden fields stay live');

  const skills = cv.sections.find((s) => s.key === 'skills');
  cv = (await call('PATCH', `/cv/${cvId}/sections/${skills.id}`, { visible: true })).body;
  cv = (await call('POST', `/cv/${cvId}/sections/${skills.id}/entries`, { title: 'Records management', details: ['Document tracking systems', 'Google Workspace'] })).body;
  assert.equal(cv.sections.find((s) => s.key === 'skills').entries[0].manual, true);
  assert.equal((await call('POST', `/cv/${cvId}/sections`, { heading: '' })).status, 422);
  cv = (await call('POST', `/cv/${cvId}/sections`, { heading: 'Languages' })).body;
  const lang = cv.sections.find((s) => s.heading === 'Languages');
  cv = (await call('POST', `/cv/${cvId}/sections/${lang.id}/entries`, { title: 'English, Filipino, Hiligaynon' })).body;

  const edu = cv.sections.find((s) => s.key === 'education');
  cv = (await call('PUT', `/cv/${cvId}/sections/${edu.id}/entries/order`, { ids: [...edu.entries.map((x) => x.id)].reverse() })).body;
  assert.equal(cv.sections.find((s) => s.key === 'education').sort, 'manual');
  assert.equal(cv.sections.find((s) => s.key === 'education').entries[0].title, 'Bachelor of Secondary Education, English');
  cv = (await call('PATCH', `/cv/${cvId}/sections/${edu.id}`, { sort: 'auto' })).body;
  assert.equal(cv.sections.find((s) => s.key === 'education').entries[0].title, 'Master of Arts in Education, Educational Management');

  assert.equal(cv.sections[0].key, 'education', 'Harvard convention: Education first');
  const ids = cv.sections.map((s) => s.id);
  const awardsId = cv.sections.find((s) => s.key === 'awards').id;
  const moved = [awardsId, ...ids.filter((x) => x !== awardsId)];
  cv = (await call('PUT', `/cv/${cvId}/sections/order`, { ids: moved })).body;
  assert.equal(cv.sections[0].key, 'awards');
  cv = (await call('PUT', `/cv/${cvId}/sections/order`, { ids })).body;
  assert.equal(cv.sections[0].key, 'education');
  assert.equal((await call('PUT', `/cv/${cvId}/sections/order`, { ids: moved.slice(1) })).status, 422);

  assert.equal((await call('PATCH', `/cv/${cvId}`, { settings: { font_size: 30 } })).status, 422);
  assert.equal((await call('PATCH', `/cv/${cvId}`, { settings: { mystery: 1 } })).status, 422);
  cv = (await call('PATCH', `/cv/${cvId}`, { settings: { font_family: 'Georgia', margins: { top: 1, right: 1, bottom: 1, left: 1 }, keywords: 'curriculum development, OBE, accreditation' } })).body;
  assert.equal(cv.settings.font_family, 'Georgia');
  assert.equal(cv.settings.margins.left, 1);
  const portfolioEntry = cv.sections.find((s) => s.key === 'education').entries[0];
  assert.equal((await call('DELETE', `/cv/${cvId}/entries/${portfolioEntry.id}`)).status, 409, 'portfolio entries are excluded, not deleted');
});

test('DOCX export is a genuine Word document with native headings and bullets', async () => {
  const x = await call('POST', `/cv/${cvId}/exports`, { format: 'docx' });
  assert.equal(x.status, 201);
  assert.match(x.body.file_name, /^Santos_Maria_CV_Academic_HarvardInspiredAcademic_v1_DRAFT_\d{4}-\d{2}-\d{2}\.docx$/);
  const file = await call('GET', x.body.download.replace('/api', ''), undefined, { raw: true });
  assert.equal(file.status, 200);
  assert.match(file.headers.get('content-disposition'), /attachment/);
  const zip = await JSZip.loadAsync(file.buf);
  const xml = await zip.file('word/document.xml').async('string');
  assert.match(xml, /<w:pStyle w:val="Heading1"\/>/);
  assert.match(xml, /<w:pStyle w:val="Title"\/>/);
  assert.match(xml, /<w:numPr>/);
  assert.doesNotMatch(xml, /<w:tbl>/, 'no layout tables');
  assert.doesNotMatch(xml, /<w:txbxContent>/, 'no text boxes');
  assert.match(xml, /Maria Santos/);
  assert.doesNotMatch(xml, /1789456/, 'licence numbers excluded unless enabled');
  const styles = await zip.file('word/styles.xml').async('string');
  assert.match(styles, /Georgia/);
  for (const id of ['Title', 'Heading1']) {
    assert.equal(styles.split(`w:styleId="${id}"`).length - 1, 1, `${id} style defined exactly once`);
  }
});

test('ATS DOCX uses conventional headings and the plain template', async () => {
  const x = await call('POST', `/cv/${cvId}/exports`, { format: 'docx_ats' });
  const file = await call('GET', x.body.download.replace('/api', ''), undefined, { raw: true });
  const xml = await (await JSZip.loadAsync(file.buf)).file('word/document.xml').async('string');
  assert.match(xml, />Education</i); // headings print in capitals, in Word as in the PDF
  assert.match(xml, />Professional Experience</i);
  assert.doesNotMatch(xml, />Educational Background</i);
  assert.match(x.body.file_name, /MinimalistATS/);
});

test('PDF export is text-based and the analyzer reads it back', { skip: !chromium && 'Chromium not available' }, async () => {
  const x = await call('POST', `/cv/${cvId}/exports`, { format: 'pdf' });
  assert.equal(x.status, 201);
  const file = await call('GET', x.body.download.replace('/api', ''), undefined, { raw: true });
  assert.equal(file.buf.subarray(0, 5).toString(), '%PDF-');
  const a = (await call('GET', `/cv/${cvId}/analysis?mode=visual`)).body;
  assert.match(a.extracted.pdf, /Maria Santos/);
  assert.match(a.extracted.pdf, /Readiness of Newly Hired Instructors/);
  assert.match(a.extracted.pdf, /Page 1 of/);
  assert.equal(a.extracted.pdf_title, 'Maria Santos — Curriculum Vitae');
  const check = (id) => a.ats.checks.find((c) => c.id === id);
  assert.equal(check('extraction').status, 'pass', JSON.stringify(check('extraction')));
  assert.equal(check('reading_order').status, 'pass', JSON.stringify(check('reading_order')));
  assert.equal(check('essentials').status, 'pass');
  assert.equal(check('image_text').status, 'pass');
  assert.ok(['pass', 'warn'].includes(check('keywords').status));
  assert.ok(a.ats.keywords.terms.includes('obe'));
  assert.ok(['warn', 'pass'].includes(check('headings').status));
  assert.match(a.ats.disclaimer, /cannot guarantee/);
  const ats = (await call('GET', `/cv/${cvId}/analysis?mode=ats`)).body;
  assert.ok(ats.extracted.docx_headings.some((h) => h.toLowerCase() === 'education'));
  const items = a.checklist.items.map((i) => i.id);
  for (const id of ['contact', 'education', 'employment', 'licenses', 'references', 'consistency', 'chronology', 'text', 'ats', 'integrity']) assert.ok(items.includes(id), id);
  assert.equal(a.checklist.items.find((i) => i.id === 'integrity').status, 'incomplete', 'self-reported records are surfaced');
  const prev = await call('GET', `/cv/${cvId}/preview.pdf?mode=ats`, undefined, { raw: true });
  assert.equal(prev.headers.get('content-type'), 'application/pdf');
});

test('photographs: content validation, size limit, optimized copy, CV inclusion and ATS exclusion', { skip: !chromium && 'Chromium not available' }, async () => {
  const page = await browser.newPage({ viewport: { width: 400, height: 500 } });
  await page.setContent('<body style="margin:0;background:linear-gradient(#456,#abc)"></body>');
  const png = await page.screenshot({ type: 'png' });
  const jpg = await page.screenshot({ type: 'jpeg', quality: 85 });
  await page.close();
  assert.deepEqual(inspectImage(png), { mime: 'image/png', width: 400, height: 500 });
  assert.deepEqual(inspectImage(jpg), { mime: 'image/jpeg', width: 400, height: 500 });

  assert.equal((await upload('/images', png, 'image/jpeg')).status, 415, 'declared type must match content');
  assert.equal((await upload('/images', Buffer.from('not an image at all, just text'), 'image/png')).status, 415);
  assert.equal((await upload('/images', Buffer.alloc(10), 'image/gif')).status, 415);
  const tooBig = await new Promise((resolve) => {
    const u = new URL(base + '/images');
    const req = http.request({ hostname: '127.0.0.1', port: u.port, path: u.pathname, method: 'POST',
      headers: { 'Content-Type': 'image/png', 'X-Synchronia': '1', Cookie: cookie, 'Content-Length': 100 * 1024 * 1024 + 1 } }, (res) => { res.resume(); resolve(res.statusCode); });
    req.on('error', () => resolve('reset'));
    req.end();
  });
  assert.ok(tooBig === 413 || tooBig === 'reset');

  const up = await upload('/images', png, 'image/png', { 'X-Filename': encodeURIComponent('Formal portrait.png') });
  assert.equal(up.status, 201);
  assert.equal(up.body.width, 400);
  assert.equal(up.body.has_optimized, false);
  const opt = await upload(`/images/${up.body.id}/optimized`, jpg, 'image/jpeg', { 'X-Crop': JSON.stringify({ x: 0, y: 0, width: 400, height: 500 }) });
  assert.equal(opt.status, 200);
  assert.equal(opt.body.has_optimized, true);
  const orig = await call('GET', `/images/${up.body.id}/file?variant=original`, undefined, { raw: true });
  assert.ok(orig.buf.equals(png), 'original preserved byte-for-byte');

  await call('PATCH', `/cv/${cvId}`, { photo_image_id: up.body.id, settings: { show_photo: true } });
  const x = await call('POST', `/cv/${cvId}/exports`, { format: 'docx' });
  const zip = await JSZip.loadAsync((await call('GET', x.body.download.replace('/api', ''), undefined, { raw: true })).buf);
  assert.ok(Object.keys(zip.files).some((n) => n.startsWith('word/media/')), 'photo embedded in DOCX');
  const xa = await call('POST', `/cv/${cvId}/exports`, { format: 'docx_ats' });
  const za = await JSZip.loadAsync((await call('GET', xa.body.download.replace('/api', ''), undefined, { raw: true })).buf);
  assert.ok(!Object.keys(za.files).some((n) => n.startsWith('word/media/')), 'ATS export has no photo');
  const a = (await call('GET', `/cv/${cvId}/analysis?mode=visual`)).body;
  assert.equal(a.ats.checks.find((c) => c.id === 'graphics').status, 'warn');
  const lib = (await call('GET', '/images')).body;
  assert.equal(lib[0].used_by[0].id, cvId);
});

test('finalized CVs are frozen; new versions pick up portfolio changes', { skip: !chromium && 'Chromium not available' }, async () => {
  assert.equal((await call('POST', `/cv/${cvId}/finalize`, {})).status, 422, 'approval must be explicit');
  const fin = await call('POST', `/cv/${cvId}/finalize`, { acknowledged: true });
  assert.equal(fin.status, 200);
  assert.equal(fin.body.status, 'finalized');
  assert.ok(fin.body.approval.checklist);
  assert.equal((await call('PATCH', `/cv/${cvId}`, { name: 'x' })).status, 409);
  assert.equal((await call('POST', `/cv/${cvId}/sync`, {})).status, 409);

  const awards = (await call('GET', '/records/awards')).body.items;
  const award = awards.find((a) => a.title === 'Outstanding Non-Teaching Personnel');
  await call('PATCH', `/records/awards/${award.id}`, { title: 'Outstanding Non-Teaching Personnel of the Year' });
  const frozen = (await call('GET', `/cv/${cvId}/analysis?mode=visual`)).body.extracted.pdf;
  assert.match(frozen, /Outstanding Non-Teaching Personnel/);
  assert.doesNotMatch(frozen, /of the Year/, 'finalized CV unaffected by later portfolio edits');

  const v2 = await call('POST', `/cv/${cvId}/versions`, {});
  assert.equal(v2.status, 201);
  assert.equal(v2.body.version, 2);
  assert.equal(v2.body.status, 'draft');
  assert.equal(v2.body.versions.length, 2);
  const fresh = (await call('GET', `/cv/${v2.body.id}/analysis?mode=visual`)).body.extracted.pdf;
  assert.match(fresh, /of the Year/);
  assert.match(fresh, /languages/i, 'custom sections carried into the new version');
  const exp = (await call('GET', '/cv/exports')).body;
  assert.ok(exp.length >= 5);
  const list = (await call('GET', '/cv')).body;
  assert.equal(list.length, 2);
});

test('licence numbers appear only when enabled', async () => {
  const cv2 = (await call('GET', '/cv')).body.find((c) => c.status === 'draft');
  await call('PATCH', `/cv/${cv2.id}`, { settings: { show_license_numbers: true } });
  const x = await call('POST', `/cv/${cv2.id}/exports`, { format: 'docx' });
  const xml = await (await JSZip.loadAsync((await call('GET', x.body.download.replace('/api', ''), undefined, { raw: true })).buf)).file('word/document.xml').async('string');
  assert.match(xml, /License No\. 1789456/);
});

test('Harvard layout, conventions check and special characters survive both exports', { skip: !chromium && 'Chromium not available' }, async () => {
  await call('POST', '/records/employment', {
    position: 'Research Assistant', institution: 'Dela Peña & Associates “Learning Lab”', location: 'Iloilo City, Philippines',
    start_date: '2015-06-01', end_date: '2016-05-31', responsibilities: 'Responsible for encoding survey data\nI coded 1,200 interview transcripts',
  });
  const cv = (await call('POST', '/cv', { name: 'Harvard check', cv_type: 'academic', template_key: 'harvard_academic' })).body;
  assert.equal(cv.sections.filter((s) => s.visible)[0].key, 'education');
  const x = await call('POST', `/cv/${cv.id}/exports`, { format: 'docx' });
  const xml = await (await JSZip.loadAsync((await call('GET', x.body.download.replace('/api', ''), undefined, { raw: true })).buf)).file('word/document.xml').async('string');
  assert.match(xml, /Dela Peña &amp; Associates “Learning Lab”/, 'XML-escaped, unicode preserved');
  assert.match(xml, /<w:tab\/><w:t xml:space="preserve">Iloilo City, Philippines/, 'location right-aligned on the organization line');
  const a = (await call('GET', `/cv/${cv.id}/analysis?mode=visual`)).body;
  assert.match(a.extracted.pdf, /Dela Peña & Associates “Learning Lab” Iloilo City, Philippines/);
  assert.match(a.extracted.pdf, /Research Assistant Jun 2015 – May 2016/, 'role and dates on the second line');
  const harvard = a.checklist.items.find((i) => i.id === 'harvard');
  assert.equal(harvard.status, 'incomplete');
  assert.ok(harvard.items.some((i) => /action verb/.test(i)));
  assert.ok(harvard.items.some((i) => /first-person/.test(i)));
  const pdf = await call('POST', `/cv/${cv.id}/exports`, { format: 'pdf' });
  assert.match(pdf.body.file_name, /^Santos_Maria_CV_Academic_HarvardInspiredAcademic_v1_DRAFT_/);
});
