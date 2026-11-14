// Institution profile, letterhead import, URS-format syllabus export and the .docx syllabus importer.
// Fixtures are generated here (a synthetic template and a deliberately messy syllabus), so no real
// institutional branding or personal names live in the repository.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, Header, Footer, ImageRun, Tab, WidthType,
} from 'docx';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'synchronia-import-'));
process.env.SYNCHRONIA_DATA_DIR = tmp;
const { openDatabase } = await import('../src/db.js');
const { createApp } = await import('../src/app.js');
const JSZip = (await import('jszip')).default;

const TOKEN = 'importer-test-token-'.padEnd(48, 'z');
let server, base, db, cookie = '';
async function call(method, url, body, { raw = false, docx = null, name = 'file.docx' } = {}) {
  const headers = { 'X-Synchronia': '1', Cookie: cookie };
  if (docx) Object.assign(headers, { 'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'X-Filename': encodeURIComponent(name) });
  else headers['Content-Type'] = 'application/json';
  const res = await fetch(base + url, { method, headers, body: docx || (body === undefined ? undefined : JSON.stringify(body)) });
  if (raw) return { status: res.status, buf: Buffer.from(await res.arrayBuffer()), type: res.headers.get('content-type') };
  const t = await res.text();
  return { status: res.status, body: t ? JSON.parse(t) : null };
}

/** A solid-colour RGB PNG of the given size. */
function png(w, h, rgb = [40, 60, 160]) {
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: w }, () => rgb).flat())]);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(Buffer.concat(Array(h).fill(row)))), chunk('IEND', Buffer.alloc(0))]);
}

const P = (...runs) => new Paragraph({ children: runs.map((r) => (typeof r === 'string' ? new TextRun(r) : r)) });
const cell = (...paras) => new TableCell({ children: paras.length ? paras.map((x) => (typeof x === 'string' ? P(x) : x)) : [P('')] });
const tbl = (rows) => new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: rows.map((r) => new TableRow({ children: r })) });
/** "Week 1" and "3 hrs" separated by a line break inside one paragraph, as in real syllabi. */
const weekCell = (n) => cell(new Paragraph({ children: [new TextRun(`Week ${n}`), new TextRun({ text: '3 hrs', break: 1 })] }));

async function letterheadTemplate() {
  const doc = new Document({ sections: [{
    headers: { default: new Header({ children: [new Paragraph({ children: [new ImageRun({ type: 'png', data: png(1024, 192), transformation: { width: 816, height: 153 } })] }), P('Office of the ______________'), P('Contact No. ________ | Email: ________')] }) },
    footers: { default: new Footer({ children: [new Paragraph({ children: [new ImageRun({ type: 'png', data: png(1250, 147, [200, 40, 40]), transformation: { width: 816, height: 96 } })] })] }) },
    children: [P('Body')],
  }] });
  return Packer.toBuffer(doc);
}

/** A syllabus laid out the hard way: everything inside one outer table, labels and values in separate cells,
 *  tabs for the grading list, and a nested curriculum map and outline. */
async function messySyllabus() {
  const map = tbl([
    [cell('CILO'), cell('P1'), cell('P2'), cell('P3')],
    [cell('CILO 1. Explain inclusive education concepts'), cell('I'), cell('–'), cell('P')],
    [cell('CILO 2. Design accessible lessons'), cell('–'), cell('D'), cell('E')],
  ]);
  const outline = tbl([
    [cell('WEEK / TIME ALLOTMENT'), cell('INTENDED LEARNING OUTCOMES'), cell('OUTCOME-BASED ASSESSMENT (OBA)'), cell('CONTENT'), cell('TEACHING & LEARNING ACTIVITIES (TLA)'), cell('LEARNING RESOURCES')],
    [weekCell(1), cell('Explain the course scope. (CILO 1)'), cell('Reflection'), cell('Orientation'), cell('Discussion'), cell('Syllabus')],
    [weekCell(2), cell('Design an accessible lesson. (CILO 1–2)'), cell('Lesson plan'), cell('UDL & access'), cell('Workshop'), cell('CAST UDL')],
  ]);
  const sign = tbl([
    [cell('Prepared by:'), cell('Reviewed by:'), cell('Approved by:')],
    [cell('ANA REYES, PhD'), cell('BEN CRUZ, MAEd'), cell('CARLA DIAZ, EdD')],
    [cell('Faculty'), cell('Program Head, BSNEd'), cell('College Dean')],
  ]);
  const body = tbl([
    [cell(
      P('Program Outcomes:'), P('The graduates have the ability to:'),
      P('A. Common to All Programs'), P('PO 1. Communicate effectively in English and Filipino.'),
      P('B. Common to the Discipline'), P('PILO 1. Articulate the rootedness of education'), P('in philosophy and history.'),
      P('PILO 2. Demonstrate mastery of subject matter.'), P('PILO 3. Facilitate learning using varied methods.'),
      P('Course Intended Learning Outcomes:'), P('At the end of the course, the pre-service teachers can:'),
      P('CILO 1. Explain inclusive education concepts'), P('CILO 2. Design accessible lessons'),
      P('Course Description:'), P('Foundations of inclusive & special needs education.'),
      P('Curriculum Map:'), map, P('Legend:'),
      P('Course Outline:'), outline,
      P('. References:'), P('CAST. (2024). UDL guidelines version 3.0.'), P('Heward, W. L. (2022). Exceptional children.'),
      P('Course Policies:'), P('Attendance is required.'), P('Cheating. Penalties apply:'), P('First offense – reprimand.'),
      P('Grading Policy'), P('Quiz', new Tab(), new Tab(), '20%'), P('Projects      50%'), P('Exams', new Tab(), '30%'), P('Total', new Tab(), '100%'),
      P('Consultation Hours'), P('MWF 1:00-3:00 pm'),
      sign,
    )],
  ]);
  const doc = new Document({ sections: [{ children: [
    P('COLLEGE OF  EDUCATION'),
    P('SY 2026-2027  (   ) 1st sem     ( / ) 2nd sem    (  )  Summer'),
    tbl([[cell('COURSE TITLE:        Inclusive Education & Access'), cell('COURSE CODE: SNEd 9')], [cell('CONTACT HOURS:   54'), cell('CREDIT UNITS: 3')], [cell('PRE-REQUISITES:'), cell('')]]),
    tbl([[cell('Vision:'), cell('A leading university of human development.')], [cell('Mission'), cell('To nurture upright and competent graduates.')],
      [cell('Goals:'), cell('')], [cell('National:'), cell('Train the nation’s workforce.')], [cell('Core Values:'), cell('Integrity, Service, Excellence')],
      [cell('Program:'), cell('Bachelor of Special Needs Education (BSNEd)')]]),
    body,
  ] }] });
  return Packer.toBuffer(doc);
}

before(async () => {
  db = openDatabase(':memory:');
  server = createApp(db, { accessToken: TOKEN }).listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}/api`;
  cookie = (await fetch(`${base}/open?token=${TOKEN}`, { redirect: 'manual' })).headers.get('set-cookie').split(';')[0];
  await call('PUT', '/profile', { full_name: 'Ana Reyes' });
});
after(() => { server.close(); db.close(); fs.rmSync(tmp, { recursive: true, force: true }); });

test('institution profile validates and saves', async () => {
  const bad = await call('PUT', '/academic/institution', { college: 5, nonsense: 'x' });
  assert.equal(bad.status, 422);
  assert.ok(bad.body.details.college && bad.body.details.nonsense);
  const ok = await call('PUT', '/academic/institution', { university: 'Example State University', dean_name: 'Dr. Dean', dean_title: 'College Dean' });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.university, 'Example State University');
  assert.equal(ok.body.letterhead, null);
});

test('letterhead: header and footer images are extracted from a Word template; non-Word files are refused', async () => {
  const notWord = await call('POST', '/academic/institution/letterhead', undefined, { docx: Buffer.from('plain text'), name: 'x.txt' });
  assert.equal(notWord.status, 415);
  const empty = await call('POST', '/academic/institution/letterhead', undefined, { docx: Buffer.alloc(0) });
  assert.equal(empty.status, 422);

  const r = await call('POST', '/academic/institution/letterhead', undefined, { docx: await letterheadTemplate(), name: 'Template 8.5 x 13.docx' });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.letterhead.header.width, 1024);
  assert.equal(r.body.letterhead.footer.width, 1250);
  assert.equal(r.body.letterhead.source, 'Template 8.5 x 13.docx');
  const img = await call('GET', '/academic/institution/letterhead/header', undefined, { raw: true });
  assert.equal(img.status, 200);
  assert.equal(img.type, 'image/png');
  assert.equal((await call('GET', '/academic/institution/letterhead/side', undefined, { raw: true })).status, 404);
});

let preview;
test('importer recovers a messy syllabus: course, VMGO, grouped outcomes, map, outline, grading and signatories', async () => {
  const r = await call('POST', '/academic/syllabi/import', undefined, { docx: await messySyllabus(), name: 'SNEd 9 syllabus.docx' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  preview = r.body;
  assert.deepEqual(preview.course && { code: preview.course.code, title: preview.course.title, h: preview.course.contact_hours, u: preview.course.units },
    { code: 'SNEd 9', title: 'Inclusive Education & Access', h: 54, u: 3 });
  assert.equal(preview.course.program, 'Bachelor of Special Needs Education (BSNEd)');
  assert.equal(preview.academic_year, '2026-2027');
  assert.equal(preview.semester, 'second');
  assert.equal(preview.institution.college, 'COLLEGE OF EDUCATION');
  assert.equal(preview.institution.vision, 'A leading university of human development.');
  assert.equal(preview.institution.goals_national, 'Train the nation’s workforce.');
  assert.deepEqual(preview.pos.map((p) => [p.code, p.group_label]), [['PO 1', 'A. Common to All Programs'], ['PILO 1', 'B. Common to the Discipline'], ['PILO 2', 'B. Common to the Discipline'], ['PILO 3', 'B. Common to the Discipline']]);
  assert.equal(preview.pos[1].description, 'Articulate the rootedness of education in philosophy and history.', 'wrapped lines are joined');
  assert.deepEqual(preview.clos.map((c) => c.code), ['CILO 1', 'CILO 2']);
  assert.equal(preview.content.learner_term, 'pre-service teachers');
  assert.equal(preview.content.description, 'Foundations of inclusive & special needs education.');
  assert.deepEqual(preview.alignments, [
    { clo: 'CILO 1', po: 'PILO 1', level: 'I' }, { clo: 'CILO 1', po: 'PILO 3', level: 'P' },
    { clo: 'CILO 2', po: 'PILO 2', level: 'D' }, { clo: 'CILO 2', po: 'PILO 3', level: 'P' },
  ], 'Pn columns name PILO n; the old E level reads as P');
  assert.deepEqual(preview.content.weeks.map((w) => [w.week, w.hours, w.clo_codes, w.ilos]), [['1', 3, 'CILO 1', 'Explain the course scope.'], ['2', 3, 'CILO 1–2', 'Design an accessible lesson.']]);
  assert.deepEqual(preview.content.grading, [{ component: 'Quiz', weight: 20 }, { component: 'Projects', weight: 50 }, { component: 'Exams', weight: 30 }]);
  assert.equal(preview.content.references.length, 2);
  assert.match(preview.content.policies, /^Attendance is required\.\nCheating\. Penalties apply:\nFirst offense – reprimand\.$/);
  assert.equal(preview.content.consultation, 'MWF 1:00-3:00 pm');
  assert.equal(preview.content.signatories.approved_by_name, 'CARLA DIAZ, EdD');
  assert.equal(preview.content.signatories.reviewed_by_title, 'Program Head, BSNEd');
  assert.deepEqual(preview.warnings, []);
});

test('import commit creates the course, outcomes, alignments and a draft syllabus atomically; gaps-only for institution', async () => {
  const bad = await call('POST', '/academic/syllabi/import/commit', { ...preview, course: { ...preview.course, code: '' } });
  assert.equal(bad.status, 422);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM courses WHERE code = 'SNEd 9'").get().n, 0);

  const r = await call('POST', '/academic/syllabi/import/commit', preview);
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.deepEqual(r.body.counts, { course: 'created', program_outcomes: 4, course_outcomes: 2, alignments: 4 });
  const ws = (await call('GET', `/academic/courses/${r.body.course_id}`)).body;
  assert.equal(ws.course.contact_hours, 54);
  // 1.2: the syllabus keeps its own statements and signatories; Settings gains neither.
  const inst = (await call('GET', '/academic/institution')).body;
  assert.equal(inst.university, 'Example State University', 'existing values are kept');
  assert.equal(inst.dean_name, 'Dr. Dean', 'existing values are kept (not used for new documents)');
  assert.equal(inst.vision, '', 'statements are not copied into Settings');
  assert.equal(inst.program_head_name, '', 'signatories are not copied into Settings');
  const own = (await call('GET', `/academic/syllabi/${r.body.syllabus_id}/document`)).body;
  const ownText = JSON.stringify(own.document);
  assert.ok(ownText.includes('A leading university of human development.'), 'the vision stays with the syllabus');
  assert.ok(ownText.includes('BEN CRUZ, MAEd'), 'the signatories stay with the syllabus');

  // Importing again reuses the course and outcomes instead of duplicating them.
  const again = await call('POST', '/academic/syllabi/import/commit', preview);
  assert.equal(again.body.course_id, r.body.course_id);
  assert.equal(again.body.counts.course, 'updated');
  assert.equal(db.prepare("SELECT COUNT(*) n FROM learning_outcomes WHERE deleted_at IS NULL AND code LIKE 'PILO%'").get().n, 3);

  // Export: URS layout on 8.5 × 13 landscape with the letterhead in header and footer.
  const x = await call('POST', `/academic/syllabi/${r.body.syllabus_id}/export`);
  assert.equal(x.status, 201);
  const f = await call('GET', x.body.download.replace('/api', ''), undefined, { raw: true });
  const zip = await JSZip.loadAsync(f.buf);
  const docXml = await zip.file('word/document.xml').async('string');
  assert.match(docXml, /<w:pgSz w:w="18720" w:h="12240" w:orient="landscape"\/>/);
  const text = docXml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  assert.match(text, /\( ✓ \) 2nd sem/);
  assert.match(text, /CILO P1 P2 P3 CILO 1\. Explain inclusive education concepts I – P/);
  assert.match(text, /Week 2 3 hrs Design an accessible lesson\. \(CILO 1–2\)/);
  assert.match(text, /ANA REYES, PhD BEN CRUZ, MAEd CARLA DIAZ, EdD Faculty Program Head, BSNEd College Dean/);
  const media = Object.keys(zip.files).filter((n) => /^word\/media\/.+\.(png|jpe?g)$/.test(n));
  assert.equal(media.length, 2, 'header and footer banners embedded');
  const headers = Object.keys(zip.files).filter((n) => /word\/(header|footer)\d*\.xml$/.test(n));
  assert.ok(headers.length >= 2);
});

test('importer refuses non-Word uploads', async () => {
  const r = await call('POST', '/academic/syllabi/import', undefined, { docx: Buffer.from('%PDF-1.7 not a docx'), name: 'syllabus.pdf' });
  assert.equal(r.status, 415);
  assert.match(r.body.error, /not a Word/);
});
