// Phase 6 — Administrative Operations.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'synchronia-admin-'));
process.env.SYNCHRONIA_DATA_DIR = tmp;
const { openDatabase } = await import('../src/db.js');
const { createApp } = await import('../src/app.js');
const JSZip = (await import('jszip')).default;

const TOKEN = 'admin-test-token-'.padEnd(48, 'a');
let server, base, db, cookie = '';
async function call(method, url, body, raw = false) {
  const res = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json', 'X-Synchronia': '1', Cookie: cookie }, body: body === undefined ? undefined : JSON.stringify(body) });
  if (raw) return { status: res.status, buf: Buffer.from(await res.arrayBuffer()) };
  const t = await res.text();
  return { status: res.status, body: t ? JSON.parse(t) : null };
}
const ok = (r, code = 200) => { assert.equal(r.status, code, JSON.stringify(r.body)); return r.body; };
const docText = async (download) => {
  const f = await call('GET', download.replace('/api', ''), undefined, true);
  assert.equal(f.status, 200);
  return (await (await JSZip.loadAsync(f.buf)).file('word/document.xml').async('string')).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
};
const today = new Date().toISOString().slice(0, 10);
const year = today.slice(0, 4);
const ago = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
const ids = {};

before(async () => {
  db = openDatabase(':memory:');
  server = createApp(db, { accessToken: TOKEN }).listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}/api`;
  cookie = (await fetch(`${base}/open?token=${TOKEN}`, { redirect: 'manual' })).headers.get('set-cookie').split(';')[0];
  await call('PUT', '/profile', { full_name: 'Maria Santos', current_position: 'Administrative Aide IV', current_office: 'Office of the Board Secretary', current_institution: 'University of Rizal System' });
});
after(() => { server.close(); db.close(); fs.rmSync(tmp, { recursive: true, force: true }); });

test('registry numbers correspondence per direction and year, and keeps given numbers', async () => {
  const a = ok(await call('POST', '/admin/correspondence', { direction: 'incoming', subject: 'Memo on enrolment', counterpart: 'Registrar', document_date: ago(10), logged_date: ago(9), due_date: ago(2) }), 201);
  const b = ok(await call('POST', '/admin/correspondence', { direction: 'incoming', subject: 'Request for faculty data', counterpart: 'HR Office' }), 201);
  const c = ok(await call('POST', '/admin/correspondence', { direction: 'outgoing', subject: 'Reply on faculty data', counterpart: 'HR Office' }), 201);
  const d = ok(await call('POST', '/admin/correspondence', { direction: 'incoming', subject: 'Board resolution copy', reference_no: 'BOR-77' }), 201);
  assert.equal(a.reference_no, `IN-${ago(9).slice(0, 4)}-0001`);
  assert.equal(b.reference_no, `IN-${year}-${ago(9).slice(0, 4) === year ? '0002' : '0001'}`);
  assert.equal(c.reference_no, `OUT-${year}-0001`);
  assert.equal(d.reference_no, 'BOR-77');
  assert.equal(b.status, 'received');
  assert.equal(c.status, 'in_progress');
  assert.equal(b.logged_date, today);
  Object.assign(ids, { a: a.id, b: b.id, c: c.id, d: d.id });
  assert.equal(ok(await call('GET', '/admin/correspondence/next-reference?direction=outgoing')).reference_no, `OUT-${year}-0002`);
  assert.equal((await call('POST', '/admin/correspondence', { direction: 'sideways', subject: 'x' })).status, 422);
  const viaForm = ok(await call('POST', '/records/correspondence', { direction: 'outgoing', subject: 'Entered through the record form', status: 'completed', completed_date: today }), 201);
  assert.equal(viaForm.reference_no, `OUT-${year}-0002`, 'the standard record form numbers it too');
});

test('routing: steps are recorded in order, status follows, and validation holds', async () => {
  let t = ok(await call('POST', `/admin/correspondence/${ids.a}/routes`, { routed_to: 'Office of the President', action_requested: 'For approval', routed_date: ago(8), due_date: ago(5) }), 201);
  assert.equal(t.status, 'routed');
  assert.equal(t.routes.length, 1);
  assert.equal(t.routes_pending, 1);
  assert.equal((await call('POST', `/admin/correspondence/${ids.a}/routes`, {})).status, 422);
  assert.equal((await call('POST', `/admin/correspondence/${ids.a}/routes`, { routed_to: 'X', routed_date: ago(3), due_date: ago(4) })).status, 422);
  t = ok(await call('PATCH', `/admin/routes/${t.routes[0].id}`, { status: 'acted', remarks: 'Approved' }));
  assert.equal(t.routes[0].status, 'acted');
  assert.equal(t.routes[0].acted_date, today);
  t = ok(await call('POST', `/admin/correspondence/${ids.a}/routes`, { routed_to: 'Registrar', action_requested: 'For implementation', routed_date: ago(4) }), 201);
  assert.deepEqual(t.last_route, { routed_to: 'Registrar', routed_date: ago(4), status: 'pending' });
  const list = ok(await call('GET', '/admin/correspondence?direction=incoming&status=open'));
  assert.deepEqual(list.map((x) => x.id).sort(), [ids.a, ids.b, ids.d].sort());
  const memo = list.find((x) => x.id === ids.a);
  assert.equal(memo.days_open, 9);
  assert.equal(memo.overdue, true);
  assert.equal(ok(await call('GET', '/admin/correspondence?q=faculty')).length, 2);
  assert.equal((await call('PATCH', '/admin/routes/99999', { status: 'acted' })).status, 404);
});

test('completing correspondence records the date and action taken', async () => {
  const t = ok(await call('POST', `/admin/correspondence/${ids.c}/complete`, { action_taken: 'Sent by email and courier' }));
  assert.equal(t.status, 'completed');
  assert.equal(t.completed_date, today);
  assert.equal(t.processing_days, 0);
  assert.equal(t.days_open, null);
});

test('meetings, minutes and action items become linked admin tasks once', async () => {
  const m = ok(await call('POST', '/records/meetings', { title: '3rd Regular Board Meeting', body: 'Board of Regents', meeting_type: 'regular', meeting_date: ago(1), start_time: '09:00', end_time: '11:30', venue: 'Board Room', role: 'secretary', status: 'held', presiding: 'Dr. Rosa Lim', attendees: 'Dr. Rosa Lim\nDr. Ben Cruz\nMs. Ana Reyes', absent: 'Dr. Carl Diaz' }), 201);
  ids.meeting = m.id;
  assert.equal((await call('POST', '/records/meetings', { title: 'Bad', meeting_date: today, start_time: '25:00' })).status, 422);
  assert.equal((await call('POST', '/records/meetings', { title: 'Bad', meeting_date: today, start_time: '10:00', end_time: '09:00' })).status, 422);
  let f = ok(await call('GET', '/admin/follow-ups'));
  assert.ok(f.some((x) => x.kind === 'minutes' && x.entity_id === m.id), 'held meeting without minutes is a follow-up');
  let d = ok(await call('PUT', `/admin/meetings/${m.id}/minutes`, {
    agenda: [{ item: 'Approval of the academic calendar', presenter: 'VPAA' }, { item: '' }],
    minutes: { call_to_order: '09:05', quorum: 'Quorum was declared.', items: [
      { topic: 'Academic calendar', discussion: 'The calendar was presented.', action: 'Publish the approved calendar', responsible: 'Registrar', due: today },
      { topic: 'Other', discussion: 'Noted.' },
    ], adjournment: '11:20' },
  }));
  assert.equal(d.agenda.length, 1, 'empty agenda rows are dropped');
  assert.equal(d.meeting.minutes_status, 'draft', 'recording minutes moves them to draft');
  d = ok(await call('POST', `/admin/meetings/${m.id}/action-items`));
  assert.equal(d.created, 1);
  assert.equal(d.tasks.length, 1);
  assert.equal(d.tasks[0].title, 'Publish the approved calendar');
  assert.equal(ok(await call('POST', `/admin/meetings/${m.id}/action-items`)).created, 0, 'not created twice');
  const x = ok(await call('POST', `/admin/meetings/${m.id}/export`), 201);
  ids.minutesFile = x.download;
  const text = await docText(x.download);
  assert.match(text, /DRAFT — minutes not yet approved/);
  assert.match(text, /BOARD OF REGENTS MINUTES OF THE REGULAR MEETING/);
  assert.match(text, /called to order at 9:05 AM by Dr\. Rosa Lim/);
  assert.match(text, /Present Dr\. Rosa Lim Dr\. Ben Cruz Ms\. Ana Reyes Absent Dr\. Carl Diaz/);
  assert.match(text, /Action \/ decision: Publish the approved calendar/);
  assert.match(text, /adjourned at 11:20 AM/);
  assert.match(text, /Prepared by: Attested \/ approved by: .*MARIA SANTOS DR\. ROSA LIM Secretary Presiding Officer/);
  assert.doesNotMatch(text, /no other matters/i, 'no invented boilerplate');
  ok(await call('PUT', `/admin/meetings/${m.id}/minutes`, { minutes_status: 'approved' }));
  f = ok(await call('GET', '/admin/follow-ups'));
  assert.ok(!f.some((x) => x.kind === 'minutes' && x.entity_id === m.id));
});

test('secretariat records are numbered per type and year', async () => {
  const r1 = ok(await call('POST', '/admin/secretariat', { record_type: 'resolution', title: 'Approving the academic calendar', meeting_id: ids.meeting, record_date: today, status: 'signed' }), 201);
  const r2 = ok(await call('POST', '/admin/secretariat', { record_type: 'resolution', title: 'Approving fees', status: 'draft' }), 201);
  const c1 = ok(await call('POST', '/admin/secretariat', { record_type: 'certification', title: 'Certified true copy', status: 'for_signature' }), 201);
  assert.equal(r1.record_no, `Resolution No. 1, s. ${year}`);
  assert.equal(r2.record_no, `Resolution No. 2, s. ${year}`);
  assert.equal(c1.record_no, `Certification No. 1, s. ${year}`);
  const d = ok(await call('GET', `/admin/meetings/${ids.meeting}`));
  assert.equal(d.records.length, 1);
});

test('follow-up tracker lists overdue items first and computes ages', async () => {
  ok(await call('POST', '/records/tasks', { title: 'Prepare board kit', module: 'admin', due_date: ago(1), priority: 'high' }), 201);
  ok(await call('POST', '/records/meetings', { title: 'Committee meeting', meeting_date: ago(3), status: 'scheduled' }), 201);
  const f = ok(await call('GET', '/admin/follow-ups'));
  assert.ok(f[0].overdue, 'overdue first');
  const kinds = new Set(f.map((x) => x.kind));
  for (const k of ['correspondence', 'route', 'task', 'meeting_status', 'secretariat']) assert.ok(kinds.has(k), k);
  const route = f.find((x) => x.kind === 'route');
  assert.equal(route.age_days, 4);
  assert.match(route.detail, /With Registrar — For implementation/);
  const o = ok(await call('GET', '/admin/overview'));
  assert.equal(o.counts.follow_ups, f.length);
  assert.equal(o.counts.overdue, f.filter((x) => x.overdue).length);
});

test('daily log groups by day and category with outputs and time', async () => {
  for (const [d, s, e, a, c, q] of [[today, '08:00', '09:30', 'Logged incoming documents', 'correspondence', 6], [today, '10:00', '11:00', 'Drafted resolutions', 'secretariat', 2], [ago(1), '13:00', '15:00', 'Prepared minutes', 'secretariat', 1]]) {
    ok(await call('POST', '/records/daily_logs', { log_date: d, start_time: s, end_time: e, activity: a, category: c, quantity: q }), 201);
  }
  const l = ok(await call('GET', '/admin/log'));
  assert.equal(l.total, 3);
  assert.equal(l.days[0].date, today);
  assert.deepEqual(l.by_category.secretariat, { entries: 2, quantity: 3, minutes: 180 });
  assert.equal((await call('GET', '/admin/log?from=2026-02-01&to=2026-01-01')).status, 422);
});

test('turnover documentation compiles live records with the owner’s notes', async () => {
  ok(await call('POST', '/records/committees', { committee: 'Board Secretariat', role: 'Board Secretary', assignment_type: 'secretariat', start_date: '2025-01-01', is_current: true }), 201);
  const t = ok(await call('POST', '/records/turnover_documents', { title: 'Turnover — Board Secretary', office: 'Office of the Board Secretary', successor_name: 'Juan Dela Cruz', successor_position: 'Administrative Officer I', effective_date: today, noted_by: 'Dr. Rosa Lim', noted_by_title: 'University President' }), 201);
  let d = ok(await call('PUT', `/admin/turnover/${t.id}/notes`, { correspondence: 'The board kit folder is on the shared drive.', unknown: 'x' }));
  assert.equal(d.notes.correspondence, 'The board kit folder is on the shared drive.');
  assert.ok(!('unknown' in d.notes));
  assert.equal(d.snapshot.correspondence.length, 3, 'open correspondence only');
  assert.equal(d.snapshot.responsibilities.length, 1);
  assert.equal(d.snapshot.secretariat.length, 3);
  const x = ok(await call('POST', `/admin/turnover/${t.id}/export`), 201);
  const text = await docText(x.download);
  assert.match(text, /DRAFT/);
  assert.match(text, /Turned over to: Juan Dela Cruz, Administrative Officer I/);
  assert.match(text, /The board kit folder is on the shared drive\./);
  assert.match(text, new RegExp(`IN-\\d{4}-0001 .* Memo on enrolment .* Registrar \\(since`));
  assert.match(text, /Board Secretariat Board Secretary Secretariat/);
  assert.match(text, /No file references linked to records as of/);
  assert.match(text, /Turned over by: Received by: Noted by: MARIA SANTOS JUAN DELA CRUZ DR\. ROSA LIM/);
});

test('role change ends the current position, starts the new one, switches mode and drafts a turnover', async () => {
  ok(await call('POST', '/records/employment', { position: 'Administrative Aide IV', institution: 'University of Rizal System', office: 'Office of the Board Secretary', start_date: '2023-03-01', is_current: true }), 201);
  assert.equal((await call('POST', '/admin/role-change', {})).status, 422);
  const r = ok(await call('POST', '/admin/role-change', { position: 'Instructor I', office: 'College of Education', effective_date: '2027-01-02', academic_mode: 'instructor', turnover: true }), 201);
  assert.equal(r.ended.length, 1);
  const old = ok(await call('GET', `/records/employment/${r.ended[0]}`));
  assert.equal(old.end_date, '2027-01-01');
  assert.equal(old.is_current, false);
  const neu = ok(await call('GET', `/records/employment/${r.employment_id}`));
  assert.deepEqual([neu.position, neu.institution, neu.start_date, neu.is_current], ['Instructor I', 'University of Rizal System', '2027-01-02', true]);
  const prof = ok(await call('GET', '/profile'));
  assert.equal(prof.current_position, 'Instructor I');
  assert.equal(prof.current_office, 'College of Education');
  assert.equal(ok(await call('GET', '/preferences')).academic_mode, 'instructor');
  const turnover = ok(await call('GET', `/records/turnover_documents/${r.turnover_id}`));
  assert.equal(turnover.office, 'Office of the Board Secretary');
  assert.equal(turnover.status, 'draft');
});

test('office accomplishment report and analytics count the new administrative records', async () => {
  const a = ok(await call('GET', `/intelligence/analytics?sections=admin&from=${ago(30)}&to=${today}`));
  const M = (k) => a.sections[0].metrics.find((m) => m.key === k);
  assert.equal(M('routed').count, 2);
  assert.match(M('routed').sources[0].title, /→/);
  assert.equal(M('meetings').count, 1);
  assert.equal(M('minutes_prepared').count, 1);
  assert.equal(M('secretariat_records').count, 1, 'only signed/disseminated/archived records count as issued');
  assert.equal(M('daily_log').sums[0].value, 9);
  assert.equal(M('correspondence_completed').count, 2);
  const r = ok(await call('POST', '/intelligence/reports', { type: 'office_accomplishment', from: ago(30), to: today, format: 'docx' }), 201);
  const text = await docText(r.download);
  assert.match(text, /Office Accomplishment Report/);
  assert.match(text, /Daily activity log entries 3 9 outputs/);
});

test('migration 006 carries legacy routing notes into routing steps', async () => {
  const sql = fs.readFileSync(new URL('../migrations/006_administrative_operations.sql', import.meta.url), 'utf8');
  const carry = sql.slice(sql.indexOf('INSERT INTO document_routes'));
  const uid = db.prepare('SELECT id FROM users').get().id;
  const id = db.prepare("INSERT INTO administrative_transactions (user_id, direction, subject, logged_date, routing_json) VALUES (?, 'incoming', 'Legacy memo', '2025-05-01', ?)")
    .run(uid, JSON.stringify([{ to: 'Dean', date: '2025-05-02', action: 'For comment' }, { office: 'Registrar' }])).lastInsertRowid;
  db.exec(carry);
  const rows = db.prepare('SELECT routed_to, routed_date, action_requested FROM document_routes WHERE transaction_id = ? ORDER BY id').all(id);
  assert.deepEqual(rows.map((r) => ({ ...r })), [{ routed_to: 'Dean', routed_date: '2025-05-02', action_requested: 'For comment' }, { routed_to: 'Registrar', routed_date: '2025-05-01', action_requested: null }]);
});
