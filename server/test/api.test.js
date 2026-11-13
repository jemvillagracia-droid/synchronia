import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'synchronia-test-'));
process.env.SYNCHRONIA_DATA_DIR = tmp;

const { openDatabase } = await import('../src/db.js');
const { createApp } = await import('../src/app.js');
const { rebuildSearchIndex } = await import('../src/repo.js');

let server, base, db, cookie = '';

async function call(method, url, body, { auth = true, headers = {} } = {}) {
  const res = await fetch(base + url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Synchronia': '1',
      ...(auth && cookie ? { Cookie: cookie } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const setCookie = res.headers.get('set-cookie');
  if (setCookie) cookie = setCookie.split(';')[0];
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

before(async () => {
  db = openDatabase(':memory:');
  server = createApp(db).listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}/api`;
});
after(() => { server.close(); db.close(); fs.rmSync(tmp, { recursive: true, force: true }); });

test('schema migrates and seeds CV templates', () => {
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((r) => r.name);
  for (const t of ['users', 'professional_profiles', 'education_records', 'licenses', 'courses', 'syllabi', 'publications',
    'cv_profiles', 'cv_entries', 'uploaded_images', 'external_file_references', 'audit_logs', 'tasks', 'administrative_transactions']) {
    assert.ok(tables.includes(t), `missing table ${t}`);
  }
  assert.equal(db.prepare('SELECT COUNT(*) n FROM cv_templates').get().n, 7);
});

test('first-run setup, auth state, and protection', async () => {
  assert.equal((await call('GET', '/auth/state', undefined, { auth: false })).body.setupRequired, true);
  assert.equal((await call('GET', '/nexus', undefined, { auth: false })).status, 401);
  const weak = await call('POST', '/auth/setup', { email: 'a@b.co', password: 'short' });
  assert.equal(weak.status, 422);
  const ok = await call('POST', '/auth/setup', { email: 'owner@example.edu', password: 'correct horse battery', full_name: 'Juan Dela Cruz' });
  assert.equal(ok.status, 201);
  assert.ok(cookie.startsWith('sync_session='));
  const again = await call('POST', '/auth/setup', { email: 'x@example.edu', password: 'another long password' });
  assert.equal(again.status, 409, 'setup must be one-time');
});

test('CSRF header required on writes', async () => {
  const res = await fetch(base + '/capture', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify({ kind: 'idea', title: 'x' }),
  });
  assert.equal(res.status, 403);
});

test('login / logout / wrong password', async () => {
  const saved = cookie;
  assert.equal((await call('POST', '/auth/login', { email: 'owner@example.edu', password: 'nope nope nope' }, { auth: false })).status, 401);
  assert.equal((await call('POST', '/auth/login', { email: 'OWNER@example.edu', password: 'correct horse battery' }, { auth: false })).status, 200);
  await call('POST', '/auth/logout');
  assert.equal((await call('GET', '/nexus')).status, 401);
  cookie = saved;
  assert.equal((await call('GET', '/nexus')).status, 200, 'other session still valid');
});

test('quick capture writes tasks and activities', async () => {
  const task = await call('POST', '/capture', { kind: 'task', title: 'Submit syllabus draft', due_date: '2000-01-01', module: 'teaching', priority: 'high' });
  assert.equal(task.status, 201);
  assert.equal(task.body._type, 'tasks');
  const idea = await call('POST', '/capture', { kind: 'idea', title: 'Study on blended learning readiness', body: 'mixed methods' });
  assert.equal(idea.body._type, 'activities');
  assert.equal(idea.body.source, 'quick_capture');
  const bad = await call('POST', '/capture', { kind: 'task', title: '' });
  assert.equal(bad.status, 422);
  assert.equal(bad.body.details.title, 'Required');
});

test('records CRUD with validation, duplicates, recycle bin, history', async () => {
  const bad = await call('POST', '/records/education', { degree: 'MA', institution: 'X', graduation_date: '2020/01/01' });
  assert.equal(bad.status, 422);
  assert.match(bad.body.details.graduation_date, /YYYY-MM-DD/);

  const ed = await call('POST', '/records/education', { degree: 'Master of Arts in Education', institution: 'State University', graduation_date: '2024-06-15' });
  assert.equal(ed.status, 201);
  assert.equal(ed.body.verification, 'self_reported', 'new records are never auto-verified');
  const dup = await call('POST', '/records/education', { degree: 'Master of Arts in Education', institution: 'State University', graduation_date: '2024-06-15' });
  assert.equal(dup.status, 409);

  const upd = await call('PATCH', `/records/education/${ed.body.id}`, { major: 'Educational Management' });
  assert.equal(upd.body.major, 'Educational Management');
  const hist = await call('GET', `/records/education/${ed.body.id}/history`);
  assert.deepEqual(hist.body.map((h) => h.action), ['update', 'create']);
  assert.deepEqual(hist.body[0].changes.major, [null, 'Educational Management']);

  assert.equal((await call('DELETE', `/records/education/${ed.body.id}`)).status, 200);
  assert.equal((await call('GET', `/records/education/${ed.body.id}`)).status, 404);
  const bin = await call('GET', '/recycle-bin');
  assert.ok(bin.body.items.some((i) => i.type === 'education' && i.id === ed.body.id));
  assert.equal((await call('POST', `/records/education/${ed.body.id}/restore`)).status, 200);
  assert.equal((await call('GET', `/records/education/${ed.body.id}`)).status, 200);
});

test('license registration numbers are encrypted at rest and masked', async () => {
  const lic = await call('POST', '/records/licenses', { license_type: 'Professional Teacher', issuing_authority: 'PRC', registration_number: '1234567' });
  assert.equal(lic.status, 201);
  assert.equal(lic.body.registration_number_masked, '••••4567');
  assert.equal(lic.body.registration_number, undefined);
  const raw = db.prepare('SELECT registration_number_enc FROM licenses WHERE id = ?').get(lic.body.id);
  assert.ok(raw.registration_number_enc.startsWith('v1:'));
  assert.ok(!raw.registration_number_enc.includes('1234567'));
  const exp = await call('GET', '/export');
  assert.equal(exp.body.records.licenses[0].registration_number, '1234567', 'export is complete for portability');
});

test('records cannot be marked evidence-verified without linked evidence', async () => {
  const bad = await call('POST', '/records/awards', { title: 'Outstanding Employee', verification: 'evidence_verified' });
  assert.equal(bad.status, 422);
  const award = await call('POST', '/records/awards', { title: 'Outstanding Employee', verification: 'user_confirmed' });
  assert.equal(award.status, 201);
  assert.equal((await call('PATCH', `/records/awards/${award.body.id}`, { verification: 'evidence_verified' })).status, 422);
  const ref = await call('POST', '/records/file_references', { provider: 'url', title: 'Certificate scan', url: 'https://example.edu/cert.pdf' });
  db.prepare('INSERT INTO evidence_links (user_id, file_ref_id, entity_type, entity_id) SELECT user_id, ?, ?, ? FROM awards WHERE id = ?')
    .run(ref.body.id, 'awards', award.body.id, award.body.id);
  assert.equal((await call('PATCH', `/records/awards/${award.body.id}`, { verification: 'evidence_verified' })).status, 200);
});

test('references must point to records the user owns', async () => {
  const bad = await call('POST', '/records/teaching_assignments', { course_id: 9999, academic_year: '2026-2027', semester: 'first' });
  assert.equal(bad.status, 422);
  const course = await call('POST', '/records/courses', { code: 'EDUC 101', title: 'Foundations of Education' });
  const ok = await call('POST', '/records/teaching_assignments', { course_id: course.body.id, academic_year: '2026-2027', semester: 'first', status: 'active' });
  assert.equal(ok.status, 201);
});

test('global search finds records across modules, and forgets deleted ones', async () => {
  const pub = await call('POST', '/records/publications', { title: 'Pedagogical Readiness of Novice Instructors', authors: 'Dela Cruz, J.' });
  let s = await call('GET', '/search?q=pedagog');
  assert.ok(s.body.results.some((r) => r.type === 'publications' && r.id === pub.body.id));
  s = await call('GET', '/search?q=blended');
  assert.ok(s.body.results.some((r) => r.type === 'activities'));
  s = await call('GET', '/search?q=Juan');
  assert.ok(s.body.results.some((r) => r.type === 'profile'));
  await call('DELETE', `/records/publications/${pub.body.id}`);
  s = await call('GET', '/search?q=pedagog');
  assert.equal(s.body.results.length, 0);
  rebuildSearchIndex(db);
  s = await call('GET', '/search?q=Juan');
  assert.ok(s.body.results.some((r) => r.type === 'profile'), 'profile survives index rebuild');
  assert.equal((await call('GET', '/search?q=%22%20OR%20*')).status, 200, 'FTS syntax is sanitised');
});

test('nexus aggregates real records only', async () => {
  await call('PUT', '/profile', { current_position: 'Administrative Aide', current_institution: 'State University', career_goal: 'Instructor I' });
  await call('POST', '/records/trainings', { title: 'Outcomes-Based Education Workshop', start_date: `${new Date().getFullYear()}-02-10`, hours: 16 });
  const n = (await call('GET', '/nexus')).body;
  assert.equal(n.profile.full_name, 'Juan Dela Cruz');
  assert.equal(n.profile.current_position, 'Administrative Aide');
  assert.equal(n.teaching.courses, 1);
  assert.equal(n.teaching.active_assignments, 1);
  assert.equal(n.research.publications, 0, 'deleted publication not counted');
  assert.equal(n.pd.year_hours, 16);
  assert.ok(n.deadlines.items.some((d) => d.title === 'Submit syllabus draft' && d.overdue));
  assert.ok(n.development.groups.find((g) => g.key === 'licenses').count === 1);
  assert.equal(n.development.evidenced, 1, 'the award with a linked file counts as evidenced');
  assert.equal(n.development.verification.evidence_verified, 1);
  assert.ok(n.recent_records.length > 0);
  assert.equal(n.layout.length, n.widgets.length);
  const notes = (await call('GET', '/notifications')).body;
  assert.ok(notes.items.some((i) => i.level === 'critical'));
});

test('preferences: mode, layout customisation and reset', async () => {
  let p = (await call('PUT', '/preferences', { academic_mode: 'instructor' })).body;
  assert.equal(p.academic_mode, 'instructor');
  assert.equal(p.dashboard_layout[1].id, 'teaching', 'role-aware default order');
  const layout = p.dashboard_layout.map((w) => ({ ...w, visible: w.id !== 'recent_cvs' })).reverse();
  p = (await call('PUT', '/preferences', { dashboard_layout: layout })).body;
  assert.equal(p.layout_customised, true);
  assert.equal(p.dashboard_layout[0].id, layout[0].id);
  assert.equal(p.dashboard_layout.find((w) => w.id === 'recent_cvs').visible, false);
  p = (await call('PUT', '/preferences', { dashboard_layout: null })).body;
  assert.equal(p.layout_customised, false);
  assert.equal((await call('PUT', '/preferences', { academic_mode: 'wizard' })).status, 422);
});

test('users cannot read each other\'s records', async () => {
  // Create a second account directly (setup is one-time) and check isolation.
  const { hashPassword } = await import('../src/secrets.js');
  const u = db.prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)').run('other@example.edu', hashPassword('other password 123'));
  db.prepare('INSERT INTO user_profiles (user_id) VALUES (?)').run(u.lastInsertRowid);
  db.prepare('INSERT INTO professional_profiles (user_id) VALUES (?)').run(u.lastInsertRowid);
  const mine = (await call('GET', '/records/courses')).body.items[0];
  const saved = cookie;
  await call('POST', '/auth/login', { email: 'other@example.edu', password: 'other password 123' }, { auth: false });
  assert.equal((await call('GET', `/records/courses/${mine.id}`)).status, 404);
  assert.equal((await call('GET', '/records/courses')).body.total, 0);
  assert.equal((await call('GET', '/search?q=Foundations')).body.results.length, 0);
  cookie = saved;
});
