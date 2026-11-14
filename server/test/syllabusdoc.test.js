// Syllabi edited as documents: conversion of a structured syllabus, autosave, clean-up of what the editor sends,
// conflict protection, recovery points, Word export, new syllabus from the outline, and search.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'synchronia-sdoc-'));
process.env.SYNCHRONIA_DATA_DIR = tmp;
const { openDatabase } = await import('../src/db.js');
const { createApp } = await import('../src/app.js');
const { sanitize, wordCount, plainText } = await import('../src/richdoc.js');
const JSZip = (await import('jszip')).default;

const TOKEN = 'syllabus-doc-test-token-'.padEnd(48, 'z');
let server, base, db, cookie = '', courseId, sylId;
async function call(method, url, body, raw = false) {
  const res = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json', 'X-Synchronia': '1', Cookie: cookie }, body: body === undefined ? undefined : JSON.stringify(body) });
  if (raw) return { status: res.status, buf: Buffer.from(await res.arrayBuffer()) };
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
  courseId = (await call('POST', '/records/courses', { code: 'EDUC 101', title: 'Foundations of Education', units: 3, program: 'BSEd' })).body.id;
  sylId = (await call('POST', '/records/syllabi', { course_id: courseId, version_label: 'v2026', academic_year: '2026-2027', semester: 'first' })).body.id;
  await call('PUT', `/academic/syllabi/${sylId}/content`, { description: 'Philosophical and historical bases of education.', weeks: [{ week: '1', content: 'Orientation and course overview', hours: 3 }], grading: [{ component: 'Major exams', weight: 60 }, { component: 'Projects', weight: 40 }], references: ['Dewey, J. (1916). Democracy and education.'], signatories: { approved_by_name: 'Juan Cruz, PhD', approved_by_title: 'Dean' } });
});
after(() => { server.close(); db.close(); fs.rmSync(tmp, { recursive: true, force: true }); });

test('sanitize keeps formatting and tables, drops anything unexpected', () => {
  const d = sanitize({ type: 'doc', content: [
    { type: 'heading', attrs: { level: 9, textAlign: 'center', onclick: 'x' }, content: [{ type: 'text', text: 'Title', marks: [{ type: 'bold' }, { type: 'link', attrs: { href: 'javascript:alert(1)' } }] }] },
    { type: 'script', content: [{ type: 'text', text: 'kept as text' }] },
    { type: 'table', content: [{ type: 'tableRow', content: [{ type: 'tableCell', attrs: { colspan: 2, style: 'x' }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'cell' }] }] }] }] },
  ] });
  assert.deepEqual(d.content[0], { type: 'heading', attrs: { level: 2, textAlign: 'center' }, content: [{ type: 'text', text: 'Title', marks: [{ type: 'bold' }] }] });
  assert.equal(d.content[1].type, 'paragraph');
  assert.equal(plainText(d.content[1]).trim(), 'kept as text');
  assert.deepEqual(d.content[2].content[0].content[0].attrs, { colspan: 2 });
  assert.equal(wordCount(d), 5);
  assert.throws(() => sanitize({ type: 'nope' }));
});

test('a structured syllabus opens as a document with its content, grading and signatories', async () => {
  const r = await call('GET', `/academic/syllabi/${sylId}/document`);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const text = plainText(r.body.document);
  for (const s of ['COURSE SYLLABUS', 'Foundations of Education', 'Philosophical and historical bases', 'Orientation and course overview', 'Major exams', '60%', 'Dewey', 'JUAN CRUZ, PhD', 'MARIA SANTOS']) assert.ok(text.includes(s), s);
  assert.deepEqual(r.body.page, { size: 'folio', landscape: true });
  assert.equal(r.body.snapshots[0].reason, 'converted');
  // Opening again does not convert twice.
  assert.equal((await call('GET', `/academic/syllabi/${sylId}/document`)).body.snapshots.length, 1);
});

test('autosave stores the edited document, guards against stale saves, and search finds the words', async () => {
  const cur = (await call('GET', `/academic/syllabi/${sylId}/document`)).body;
  const doc = { type: 'doc', content: [{ type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Revised Syllabus' }] }, { type: 'paragraph', content: [{ type: 'text', text: 'Experiential pedagogy across Mindanao communities', marks: [{ type: 'italic' }] }] }, ...cur.document.content] };
  const s = await call('PUT', `/academic/syllabi/${sylId}/document`, { document: doc, page: { size: 'a4', landscape: false }, base_updated_at: cur.syllabus.updated_at });
  assert.equal(s.status, 200, JSON.stringify(s.body));
  assert.deepEqual(s.body.page, { size: 'a4', landscape: false });
  const stale = await call('PUT', `/academic/syllabi/${sylId}/document`, { document: doc, base_updated_at: cur.syllabus.updated_at });
  assert.equal(stale.status, 409);
  const again = (await call('GET', `/academic/syllabi/${sylId}/document`)).body;
  assert.equal(again.document.content[0].content[0].text, 'Revised Syllabus');
  const found = (await call('GET', '/search?q=Mindanao')).body;
  assert.ok(JSON.stringify(found).includes('v2026'), 'syllabus text is searchable');
  assert.ok(!JSON.stringify((await call('GET', '/search?q=tableCell')).body).includes('v2026'), 'editor structure is not indexed');
});

test('recovery points can be restored, keeping the current text as a recovery point', async () => {
  const v = (await call('GET', `/academic/syllabi/${sylId}/document`)).body;
  const converted = v.snapshots.find((x) => x.reason === 'converted');
  const r = await call('POST', `/academic/syllabi/${sylId}/snapshots/${converted.id}/restore`);
  assert.equal(r.status, 200);
  assert.ok(!plainText(r.body.document).includes('Revised Syllabus'));
  assert.ok(r.body.snapshots.some((x) => x.reason === 'before restore'));
});

test('Word export follows the document and passes verification', async () => {
  const cur = (await call('GET', `/academic/syllabi/${sylId}/document`)).body;
  const doc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Bilingual instruction plan', marks: [{ type: 'bold' }] }] },
    { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Point one' }] }] }] },
    { type: 'table', content: [{ type: 'tableRow', content: [{ type: 'tableHeader', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Week' }] }] }, { type: 'tableHeader', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Topic' }] }] }] },
      { type: 'tableRow', content: [{ type: 'tableCell', attrs: { colspan: 2 }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Midterm examination' }] }] }] }] }] };
  await call('PUT', `/academic/syllabi/${sylId}/document`, { document: doc, base_updated_at: cur.syllabus.updated_at });
  const x = await call('POST', `/academic/syllabi/${sylId}/document/export`, { format: 'docx' });
  assert.equal(x.status, 201, JSON.stringify(x.body));
  assert.match(x.body.validation.summary, /Verified/);
  const f = await call('GET', x.body.download.replace('/api', ''), undefined, true);
  const xml = await (await JSZip.loadAsync(f.buf)).file('word/document.xml').async('string');
  for (const s of ['Bilingual instruction plan', 'Point one', 'Week', 'Midterm examination']) assert.ok(xml.includes(s), s);
  assert.match(xml, /<w:gridSpan w:val="2"\/>/);
  assert.match(xml, /<w:b\/>/);
  assert.equal((await call('POST', `/academic/syllabi/${sylId}/document/export`, { format: 'pdf' })).status, 503, 'PDF needs the desktop renderer');
});

test('a new syllabus starts from the outline with only the author as signatory; copies are possible', async () => {
  const n = await call('POST', `/academic/courses/${courseId}/syllabi`, { version_label: 'v2027', academic_year: '2027-2028', semester: 'second' });
  assert.equal(n.status, 201, JSON.stringify(n.body));
  const t = plainText(n.body.document);
  assert.ok(t.includes('Course Outline') && t.includes('Grading System') && t.includes('MARIA SANTOS'));
  assert.ok(!t.includes('JUAN CRUZ'), 'no assumed signatories');
  const c = await call('POST', `/academic/courses/${courseId}/syllabi`, { version_label: 'copy', copy_from: sylId });
  assert.ok(plainText(c.body.document).includes('Bilingual instruction plan'));
  assert.equal((await call('POST', '/academic/courses/999/syllabi', {})).status, 404);
});

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAADCAYAAAC56t6BAAAAEklEQVR4nGP4z8DwHxkzEC0AAP0LF+lrWQZTAAAAAElFTkSuQmCC', 'base64');
const GIF = Buffer.from('R0lGODlhBAACAIAAAP///wAAACH5BAEAAAAALAAAAAAEAAIAAAIDhI8FADs=', 'base64');
const upload = async (buf, name) => {
  const res = await fetch(`${base}/doc-images`, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream', 'X-Synchronia': '1', 'X-Filename': name, Cookie: cookie }, body: buf });
  return { status: res.status, body: await res.json() };
};

test('pictures: PNG and GIF are stored once by content, other files are refused', async () => {
  const p = await upload(PNG, 'a.png');
  assert.equal(p.status, 201, JSON.stringify(p.body));
  assert.deepEqual([p.body.mime, p.body.width, p.body.height], ['image/png', 2, 3]);
  assert.match(p.body.src, /^\/api\/doc-images\/\d+$/);
  assert.equal((await upload(PNG, 'again.png')).body.id, p.body.id, 'identical picture is shared');
  const g = await upload(GIF, 'anim.gif');
  assert.deepEqual([g.body.mime, g.body.width, g.body.height], ['image/gif', 4, 2]);
  assert.equal((await upload(Buffer.from('<svg onload=alert(1)>'), 'x.svg')).status, 415);
  const img = await call('GET', p.body.src.replace('/api', ''), undefined, true);
  assert.equal(img.status, 200);
  assert.ok(img.buf.equals(PNG));
  for (const url of ['http://127.0.0.1:1/x.png', 'http://localhost/x.png', 'http://192.168.1.4/a.png', 'file:///etc/passwd']) {
    assert.equal((await call('POST', '/doc-images/from-url', { url })).status, 422, url);
  }
});

test('pictures are kept only when stored in SYNCHRONIA and are exported into Word', async () => {
  const p = (await upload(PNG, 'a.png')).body;
  const g = (await upload(GIF, 'anim.gif')).body;
  const d = sanitize({ type: 'doc', content: [{ type: 'image', attrs: { src: 'https://tracker.example/x.png' } }, { type: 'image', attrs: { src: p.src, width: 50, alt: 'Diagram', onerror: 'x' } }] });
  assert.deepEqual(d.content, [{ type: 'image', attrs: { src: p.src, alt: 'Diagram', width: 50 } }]);
  const cur = (await call('GET', `/academic/syllabi/${sylId}/document`)).body;
  const doc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Concept map below' }] }, { type: 'image', attrs: { src: p.src, width: 40, align: 'center' } },
    { type: 'table', content: [{ type: 'tableRow', content: [{ type: 'tableCell', content: [{ type: 'image', attrs: { src: g.src } }] }] }] }] };
  assert.equal((await call('PUT', `/academic/syllabi/${sylId}/document`, { document: doc, base_updated_at: cur.syllabus.updated_at })).status, 200);
  const x = await call('POST', `/academic/syllabi/${sylId}/document/export`, { format: 'docx' });
  assert.equal(x.status, 201, JSON.stringify(x.body));
  const zip = await JSZip.loadAsync((await call('GET', x.body.download.replace('/api', ''), undefined, true)).buf);
  const media = Object.keys(zip.files).filter((f) => f.startsWith('word/media/'));
  assert.ok(media.some((f) => f.endsWith('.png')) && media.some((f) => f.endsWith('.gif')), media.join(','));
});
