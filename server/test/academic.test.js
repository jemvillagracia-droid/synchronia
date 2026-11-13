import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'synchronia-acad-'));
process.env.SYNCHRONIA_DATA_DIR = tmp;
const { openDatabase } = await import('../src/db.js');
const { createApp } = await import('../src/app.js');
const { apportion, computeTos } = await import('../src/academic/service.js');
const JSZip = (await import('jszip')).default;

const TOKEN = 'academic-test-token-'.padEnd(48, 'q');
let server, base, db, cookie = '';
async function call(method, url, body, raw = false) {
  const res = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json', 'X-Synchronia': '1', Cookie: cookie }, body: body === undefined ? undefined : JSON.stringify(body) });
  if (raw) return { status: res.status, buf: Buffer.from(await res.arrayBuffer()) };
  const t = await res.text();
  return { status: res.status, body: t ? JSON.parse(t) : null };
}
const docText = async (download) => {
  const f = await call('GET', download.replace('/api', ''), undefined, true);
  assert.equal(f.status, 200);
  return (await (await JSZip.loadAsync(f.buf)).file('word/document.xml').async('string')).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
};

before(async () => {
  db = openDatabase(':memory:');
  server = createApp(db, { accessToken: TOKEN }).listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}/api`;
  cookie = (await fetch(`${base}/open?token=${TOKEN}`, { redirect: 'manual' })).headers.get('set-cookie').split(';')[0];
  await call('PUT', '/profile', { full_name: 'Maria Santos', current_position: 'Part-time Lecturer', current_institution: 'Central State University' });
});
after(() => { server.close(); db.close(); fs.rmSync(tmp, { recursive: true, force: true }); });

test('apportion uses the largest-remainder method and always sums to the total', () => {
  assert.deepEqual(apportion(10, [1, 1, 1]), [4, 3, 3]);
  assert.deepEqual(apportion(50, [20, 20, 20, 15, 15, 10]), [10, 10, 10, 8, 7, 5]);
  assert.equal(apportion(37, [3, 5, 2, 7]).reduce((a, b) => a + b, 0), 37);
  assert.deepEqual(apportion(0, [1, 2]), [0, 0]);
});

test('TOS: items follow teaching hours and Bloom percentages; placements are sequential', () => {
  const t = computeTos({ total_items: 50, rows: [{ topic: 'Philosophies of education', clo: 'CLO1', hours: 6 }, { topic: 'The teacher as professional', clo: 'CLO2', hours: 9 }, { topic: 'Ethics', clo: 'CLO3', hours: 3 }] });
  assert.deepEqual(t.rows.map((r) => r.items), [17, 25, 8]);
  assert.equal(t.total_items, 50);
  assert.equal(t.level_totals.reduce((a, b) => a + b, 0), 50);
  assert.deepEqual(t.rows[0].cells, [3, 3, 3, 3, 3, 2]);
  assert.equal(t.rows[0].placement[0], '1–3');
  const last = t.rows[2].placement.filter(Boolean).pop();
  assert.match(last, /50$/);
  assert.deepEqual(computeTos({ total_items: 10, levels: { creating: 50 }, rows: [{ topic: 'x', hours: 1 }] }).warnings.length, 1);
});

let courseId, offeringId, syllabusId;

test('course workspace: offerings, outcomes, alignment, syllabus content', async () => {
  courseId = (await call('POST', '/records/courses', { code: 'EDUC 101', title: 'The Teaching Profession', units: 3, program: 'BSEd' })).body.id;
  offeringId = (await call('POST', '/records/teaching_assignments', { course_id: courseId, academic_year: '2026-2027', semester: 'first', section: 'A', student_count: 40, status: 'active' })).body.id;
  const clo1 = (await call('POST', '/records/learning_outcomes', { course_id: courseId, outcome_type: 'CLO', code: 'CLO1', description: 'Explain the philosophical foundations of education' })).body.id;
  const clo2 = (await call('POST', '/records/learning_outcomes', { course_id: courseId, outcome_type: 'CLO', code: 'CLO2', description: 'Demonstrate professional ethics' })).body.id;
  const po1 = (await call('POST', '/records/learning_outcomes', { outcome_type: 'PO', code: 'PO-a', description: 'Articulate the rootedness of education in philosophy', program: 'BSEd' })).body.id;
  let w = (await call('PUT', `/academic/courses/${courseId}/alignments`, { pairs: [{ clo_id: clo1, po_id: po1, level: 'I' }, { clo_id: clo2, po_id: po1, level: 'D' }] })).body;
  assert.equal(w.alignments.length, 2);
  assert.equal(w.pos.length, 1, 'program outcomes shared by program');
  assert.equal((await call('PUT', `/academic/courses/${courseId}/alignments`, { pairs: [{ clo_id: clo1, po_id: po1, level: 'X' }] })).status, 422);
  w = (await call('PUT', `/academic/courses/${courseId}/alignments`, { pairs: [{ clo_id: clo1, po_id: po1, level: 'E' }] })).body;
  assert.deepEqual(w.alignments.map((x) => x.level), ['P'], 'legacy Enhanced is stored as Practiced');

  syllabusId = (await call('POST', '/records/syllabi', { course_id: courseId, version_label: 'v2026', academic_year: '2026-2027', semester: 'first' })).body.id;
  const s = (await call('PUT', `/academic/syllabi/${syllabusId}/content`, {
    description: 'Introduces the teaching profession.', weeks: [{ week: '1', topics: 'Orientation; philosophies', clo_codes: 'CLO1', activities: 'Lecture-discussion', assessment: 'Reflection paper', hours: 3 }],
    grading: [{ component: 'Major examinations', weight: 40 }, { component: 'Class standing', weight: 50 }], references: ['Bilbao, P. (2018). The teaching profession.'], extra: 'ignored',
  })).body;
  assert.equal(s.content.weeks.length, 1);
  assert.equal(s.content.extra, undefined, 'unknown keys dropped');
  w = (await call('GET', `/academic/courses/${courseId}`)).body;
  assert.equal(w.syllabi[0].grading_total, 90);
  assert.equal(w.offerings[0].section, 'A');
});

test('syllabus export: real tables and an honest note when weights do not total 100%', async () => {
  const x = await call('POST', `/academic/syllabi/${syllabusId}/export`);
  assert.equal(x.status, 201);
  assert.match(x.body.file_name, /^Syllabus_EDUC_101_v2026_\d{4}-\d{2}-\d{2}\.docx$/);
  const text = await docText(x.body.download);
  assert.match(text, /CLO1\. Explain the philosophical foundations/);
  assert.match(text, /COURSE SYLLABUS.*Vision, Mission and Goals.*Program Outcomes.*Course Intended Learning Outcomes.*Mapping.*Legend: I – Introductory\s+P – Practiced\s+D – Demonstrative.*Course Outline.*Prepared by:.*Reviewed by:.*Approved by:/);
  assert.match(text, /grading weights total 90%/);
});

test('assessments, TOS and rubric round-trip and export', async () => {
  const asmt = (await call('POST', '/records/assessments', { course_id: courseId, teaching_assignment_id: offeringId, title: 'Midterm Examination', assessment_type: 'midterm', item_count: 50 })).body.id;
  const tos = (await call('POST', '/records/tos', { assessment_id: asmt, title: 'Midterm TOS' })).body.id;
  let t = (await call('GET', `/academic/tos/${tos}`)).body;
  assert.equal(t.content.total_items, 50, 'item count taken from the assessment');
  t = (await call('PUT', `/academic/tos/${tos}/content`, { total_items: 50, rows: [{ topic: 'Philosophies', clo: 'CLO1', hours: 6 }, { topic: 'Ethics', clo: 'CLO2', hours: 4 }] })).body;
  assert.deepEqual(t.rows.map((r) => r.items), [30, 20]);
  const tx = await call('POST', `/academic/tos/${tos}/export`);
  assert.match(await docText(tx.body.download), /Table of Specifications.*Philosophies/);

  const rub = (await call('POST', '/records/rubrics', { course_id: courseId, assessment_id: asmt, title: 'Reflection Paper Rubric' })).body.id;
  let r = (await call('GET', `/academic/rubrics/${rub}`)).body;
  assert.equal(r.content.levels.length, 4, 'default four-level scale');
  assert.equal((await call('PUT', `/academic/rubrics/${rub}/criteria`, { levels: [{ label: 'Only', points: 1 }], criteria: [] })).status, 422);
  r = (await call('PUT', `/academic/rubrics/${rub}/criteria`, { levels: r.content.levels, criteria: [
    { name: 'Content', weight: 60, descriptors: ['Insightful', 'Clear', 'Partial', 'Minimal'] }, { name: 'Organization', weight: 30, descriptors: ['a', 'b', 'c', 'd'] }] })).body;
  assert.equal(r.summary.warnings.length, 1, 'weights total 90%');
  const rx = await call('POST', `/academic/rubrics/${rub}/export`);
  assert.match(await docText(rx.body.download), /Content 60% Insightful Clear Partial Minimal/);
  const w = (await call('GET', `/academic/courses/${courseId}`)).body;
  assert.equal(w.assessments[0].tos_id, tos);
  assert.equal(w.assessments[0].rubric_id, rub);
});

test('class activity records with attendance feed the course and the teaching report', async () => {
  await call('POST', '/records/class_activities', { teaching_assignment_id: offeringId, activity_date: '2026-08-12', title: 'Orientation', present: 38, enrolled: 40 });
  await call('POST', '/records/class_activities', { teaching_assignment_id: offeringId, activity_date: '2026-08-19', title: 'Philosophies of education', present: 36, enrolled: 40 });
  assert.equal((await call('POST', '/records/class_activities', { teaching_assignment_id: offeringId, activity_date: '2026-08-26', title: 'x', present: -1 })).status, 422);
  const w = (await call('GET', `/academic/courses/${courseId}`)).body;
  assert.equal(w.offerings[0].activities, 2);
  assert.equal(w.offerings[0].attendance_pct, 92.5);
  assert.equal((await call('POST', '/academic/reports/teaching', { academic_year: '2030-2031', semester: 'first' })).status, 404);
  const rep = await call('POST', '/academic/reports/teaching', { academic_year: '2026-2027', semester: 'first' });
  assert.equal(rep.status, 201);
  const text = await docText(rep.body.download);
  assert.match(text, /Teaching Accomplishment Report/);
  assert.match(text, /Classes handled 1/);
  assert.match(text, /EDUC 101 — The Teaching Profession A/);
  assert.match(text, /92\.5%/);
  assert.match(text, /Midterm Examination/);
});

test('research progress, extension report and development goals', async () => {
  const rp = await call('POST', '/records/research_projects', { title: 'Instructional Readiness Study', status: 'data_collection', progress_pct: 45, target_sample: 120, collected_sample: 54, validation_status: 'validated', ethics_status: 'approved' });
  assert.equal(rp.status, 201);
  assert.equal((await call('PATCH', `/records/research_projects/${rp.body.id}`, { progress_pct: 140 })).status, 422);
  await call('POST', '/records/publications', { title: 'Readiness paper', authors: 'Santos, M.', research_project_id: rp.body.id });
  const ext = (await call('POST', '/records/extension_projects', { title: 'Literacy Caravan', partner: 'Brgy. Tabuc Suba', status: 'completed', participants_count: 85, training_hours: 16, narrative: 'Reading sessions for Grade 3 learners.' })).body;
  await call('POST', `/records/extension_projects/${ext.id}/evidence`, { provider: 'url', title: 'Attendance sheets', url: 'https://example.edu/attendance' });
  const er = await call('POST', `/academic/extension/${ext.id}/report`);
  const text = await docText(er.body.download);
  assert.match(text, /Literacy Caravan/);
  assert.match(text, /Participants \(recorded\) 85/);
  assert.match(text, /Attendance sheets/);
  const tr = (await call('POST', '/records/trainings', { title: 'Assessment Literacy Course', start_date: `${new Date().getFullYear()}-02-01`, hours: 30 })).body;
  await call('POST', '/records/development_goals', { goal_area: 'teaching', title: 'Complete assessment literacy training', status: 'in_progress', progress_pct: 50, linked_training_id: tr.id });
  const o = (await call('GET', '/academic/overview')).body;
  assert.equal(o.teaching.courses[0].clos, 2);
  assert.equal(o.teaching.active_offerings, 1);
  assert.equal(o.research.projects[0].publications, 1);
  assert.equal(o.research.by_status.data_collection, 1);
  assert.equal(o.extension.participants, 85);
  assert.equal(o.development.goals[0].training_title, 'Assessment Literacy Course');
  assert.equal(o.development.hours_year, 30);
  const reports = (await call('GET', '/academic/reports')).body;
  assert.ok(reports.length >= 5);
});
