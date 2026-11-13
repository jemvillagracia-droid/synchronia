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

const TOKEN = 'test-access-token-'.padEnd(48, 'x');
let server, base, db, cookie = '';

async function call(method, url, body, { auth = true, headers = {} } = {}) {
  const res = await fetch(base + url, {
    method,
    redirect: 'manual',
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
  let parsed = null;
  try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text; }
  return { status: res.status, body: parsed, headers: res.headers };
}

before(async () => {
  db = openDatabase(':memory:');
  server = createApp(db, { accessToken: TOKEN }).listen(0, '127.0.0.1');
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
  assert.equal(db.prepare('SELECT COUNT(*) n FROM schema_migrations').get().n, 2);
});

test('no sign-in: the launch access key opens the app; everything else is refused', async () => {
  assert.equal((await call('GET', '/auth/state', undefined, { auth: false })).body.user, null);
  assert.equal((await call('GET', '/nexus', undefined, { auth: false })).status, 401);
  assert.equal((await call('GET', '/open?token=wrong', undefined, { auth: false })).status, 401);
  assert.equal((await call('GET', '/nexus', undefined, { headers: { Cookie: 'sync_access=wrong' } })).status, 401);
  const open = await call('GET', `/open?token=${TOKEN}&next=/portfolio`, undefined, { auth: false });
  assert.equal(open.status, 303);
  assert.equal(open.headers.get('location'), '/portfolio');
  assert.ok(cookie.startsWith('sync_access='));
  assert.match(open.headers.get('set-cookie'), /HttpOnly; SameSite=Strict/);
  assert.ok((await call('GET', '/auth/state')).body.user.id > 0);
  assert.equal((await call('GET', '/nexus')).status, 200);
  const evil = await call('GET', `/open?token=${TOKEN}&next=//evil.example`, undefined, { auth: false });
  assert.equal(evil.headers.get('location'), '/', 'open redirect blocked');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM users').get().n, 1, 'single owner');
  await call('PUT', '/profile', { full_name: 'Juan Dela Cruz' });
});

test('requests addressed to other host names are refused (DNS rebinding)', async () => {
  // fetch() ignores a custom Host header, so use the raw http client.
  const http = await import('node:http');
  const status = (host) => new Promise((resolve, reject) => {
    const u = new URL(base + '/nexus');
    http.get({ hostname: '127.0.0.1', port: u.port, path: u.pathname, headers: { Host: host, Cookie: cookie } }, (res) => { res.resume(); resolve(res.statusCode); }).on('error', reject);
  });
  assert.equal(await status('attacker.example'), 421);
  assert.equal(await status('attacker.example:80'), 421);
  assert.equal(await status(`127.0.0.1:${new URL(base).port}`), 200);
  assert.equal(await status(`localhost:${new URL(base).port}`), 200);
});

test('CSRF header required on writes', async () => {
  const res = await fetch(base + '/capture', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify({ kind: 'idea', title: 'x' }),
  });
  assert.equal(res.status, 403);
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

test('quick-captured accomplishments land in the portfolio as self-reported', async () => {
  const a = await call('POST', '/capture', { kind: 'accomplishment', title: 'Secretariat, 2026 Academic Council', body: 'Prepared minutes' });
  assert.equal(a.status, 201);
  assert.equal(a.body._type, 'portfolio_entries');
  assert.equal(a.body.verification, 'self_reported');
  assert.equal(a.body.description, 'Prepared minutes');
});

test('date fields must be chronological, including on partial updates', async () => {
  const bad = await call('POST', '/records/employment', { position: 'Clerk', institution: 'X', start_date: '2024-05-01', end_date: '2023-01-01' });
  assert.equal(bad.status, 422);
  assert.ok(bad.body.details.end_date);
  const ok = await call('POST', '/records/employment', { position: 'Clerk', institution: 'X', start_date: '2020-05-01', end_date: '2023-01-01' });
  assert.equal((await call('PATCH', `/records/employment/${ok.body.id}`, { start_date: '2024-01-01' })).status, 422);
  const lic = await call('POST', '/records/licenses', { license_type: 'Civil Service Eligibility', issuing_authority: 'CSC', registration_date: '2022-01-01', valid_until: '2021-01-01' });
  assert.equal(lic.status, 422);
});

test('per-record completeness lists missing recommended fields', async () => {
  const t = await call('POST', '/records/trainings', { title: 'Research Ethics Seminar' });
  assert.deepEqual(t.body._missing, ['organizer', 'start_date', 'hours']);
  const u = await call('PATCH', `/records/trainings/${t.body.id}`, { organizer: 'University Research Office', start_date: '2025-08-01', hours: 8 });
  assert.deepEqual(u.body._missing, []);
  const lic = (await call('GET', '/records/licenses')).body.items.find((l) => l.license_type === 'Professional Teacher');
  assert.ok(!lic._missing.includes('registration_number'), 'encrypted fields count as filled');
  const schema = (await call('GET', '/schema')).body;
  assert.deepEqual(schema.trainings.recommended, ['organizer', 'start_date', 'hours']);
});

test('evidence: attach (Drive link, web link, local file), verify, detach resets verification', async () => {
  const award = await call('POST', '/records/awards', { title: 'Best Paper Award', issuer: 'Regional Research Congress', date_received: '2025-11-20' });
  const id = award.body.id;
  assert.equal(award.body._evidence_count, 0);

  const notDrive = await call('POST', `/records/awards/${id}/evidence`, { provider: 'google_drive', title: 'Certificate', url: 'https://example.com/x' });
  assert.equal(notDrive.status, 422);
  const drive = await call('POST', `/records/awards/${id}/evidence`, {
    provider: 'google_drive', title: 'Certificate (Drive)', url: 'https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUv/view?usp=sharing',
  });
  assert.equal(drive.status, 201);
  assert.equal(drive.body[0].external_id, '1AbCdEfGhIjKlMnOpQrStUv');
  const web = await call('POST', `/records/awards/${id}/evidence`, { provider: 'url', title: 'Congress announcement', url: 'https://congress.example.edu/awards' });
  assert.equal(web.body.length, 2);
  const local = await call('POST', `/records/awards/${id}/evidence`, { provider: 'local_path', title: 'Scanned plaque', url: 'C:\\Users\\Maria\\Documents\\plaque.pdf' });
  assert.equal(local.body.length, 3);
  // Re-link an existing reference to a second record (no duplicate file references)
  const entry = await call('POST', '/records/portfolio_entries', { title: 'Presented at Regional Research Congress' });
  const relink = await call('POST', `/records/portfolio_entries/${entry.body.id}/evidence`, { file_ref_id: drive.body[0].id });
  assert.equal(relink.status, 201);
  assert.equal((await call('POST', `/records/portfolio_entries/${entry.body.id}/evidence`, { file_ref_id: drive.body[0].id })).status, 409);

  assert.equal((await call('GET', `/records/awards/${id}`)).body._evidence_count, 3);
  const verified = await call('PATCH', `/records/awards/${id}`, { verification: 'evidence_verified' });
  assert.equal(verified.status, 200);

  const items = (await call('GET', `/records/awards/${id}/evidence`)).body;
  for (const [i, link] of items.entries()) {
    const out = await call('DELETE', `/records/awards/${id}/evidence/${link.link_id}`);
    assert.equal(out.status, 200);
    assert.equal(out.body.record.verification, i < items.length - 1 ? 'evidence_verified' : 'self_reported');
  }
  const hist = (await call('GET', `/records/awards/${id}/history`)).body;
  assert.ok(hist.some((h) => /Verification reset/.test(h.summary)));
  assert.equal((await call('GET', '/records/tasks/1/evidence')).status, 400, 'tasks do not take evidence');
});

test('licence numbers can be revealed by the owner, and the reveal is audited', async () => {
  const lic = (await call('GET', '/records/licenses')).body.items.find((l) => l.license_type === 'Professional Teacher');
  const r = await call('GET', `/records/licenses/${lic.id}/secret/registration_number`);
  assert.equal(r.body.value, '1234567');
  assert.equal((await call('GET', `/records/licenses/${lic.id}/secret/license_type`)).status, 404);
  assert.ok((await call('GET', '/audit')).body.some((a) => /Revealed registration number/.test(a.summary)));
});

test('expiring licences raise notifications', async () => {
  const soon = new Date(Date.now() + 20 * 864e5).toISOString().slice(0, 10);
  await call('POST', '/records/licenses', { license_type: 'Driver License', issuing_authority: 'LTO', valid_until: soon });
  const n = (await call('GET', '/notifications')).body.items;
  assert.ok(n.some((i) => i.type === 'licenses' && i.level === 'warning'));
});

test('portfolio summary: categories, evidence, confirmation and attention list', async () => {
  const s = (await call('GET', '/portfolio/summary')).body;
  assert.deepEqual(s.categories.map((c) => c.key),
    ['education', 'licenses', 'employment', 'appointments', 'research', 'development', 'service', 'awards', 'accomplishments']);
  const acc = s.categories.find((c) => c.key === 'accomplishments');
  assert.equal(acc.total, 2);
  assert.equal(acc.evidenced, 1, 'the re-linked Drive file counts');
  assert.ok(s.totals.total >= s.totals.evidenced);
  assert.ok(s.attention.length > 0 && s.attention.every((a) => a.title));
  assert.equal(s.licences.expiring, 1);
  assert.ok(s.development.hours >= 8);
});

test('migration 002 moves Phase 1 captured accomplishments into the portfolio', async () => {
  const { DatabaseSync } = await import('node:sqlite');
  const file = path.join(tmp, 'm.db');
  const d = new DatabaseSync(file);
  d.exec(fs.readFileSync(new URL('../migrations/001_foundation.sql', import.meta.url), 'utf8'));
  d.exec(`CREATE TABLE schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT 'x');
          INSERT INTO schema_migrations (name) VALUES ('001_foundation.sql');
          INSERT INTO users (email, password_hash) VALUES ('a@b.c', 'x');
          INSERT INTO activities (user_id, kind, title, body, event_date, source) VALUES (1, 'accomplishment', 'Old win', 'detail', '2026-01-05', 'quick_capture');
          INSERT INTO activities (user_id, kind, title, source) VALUES (1, 'idea', 'Keep me', 'quick_capture');`);
  d.close();
  const migrated = openDatabase(file);
  const pe = migrated.prepare('SELECT * FROM portfolio_entries').all();
  assert.equal(pe.length, 1);
  assert.equal(pe[0].title, 'Old win');
  assert.equal(pe[0].event_date, '2026-01-05');
  assert.equal(migrated.prepare('SELECT COUNT(*) n FROM activities WHERE deleted_at IS NULL').get().n, 1);
  migrated.close();
});
