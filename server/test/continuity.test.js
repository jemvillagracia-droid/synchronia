// Phase 7 — Integration and Continuity: file library, Google Drive (against a local stand-in for Google),
// unified timeline, unified search, portable archive, backup copy/import.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'synchronia-cont-'));
process.env.SYNCHRONIA_DATA_DIR = tmp;

// ── A stand-in for Google's OAuth and Drive endpoints ──
const G = { codes: new Map(), refresh: 'rt-' + crypto.randomBytes(8).toString('hex'), access: 0, revoked: [], expiresIn: 3600, refreshGrants: 0, failRefresh: false, lastVerifierOk: null,
  files: { 'file-aaaaaaaaaa': { id: 'file-aaaaaaaaaa', name: 'Board Resolution 12.pdf', mimeType: 'application/pdf', modifiedTime: '2026-10-01T02:00:00Z', webViewLink: 'https://drive.google.com/file/d/file-aaaaaaaaaa/view', size: '20480', owners: [{ displayName: 'Maria Santos' }] },
    'file-bbbbbbbbbb': { id: 'file-bbbbbbbbbb', name: 'Syllabus SNEd 3.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', modifiedTime: '2026-09-01T02:00:00Z', webViewLink: 'https://drive.google.com/file/d/file-bbbbbbbbbb/view', owners: [] } } };
const gserver = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  let body = '';
  for await (const c of req) body += c;
  const form = new URLSearchParams(body);
  const json = (code, o) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
  if (u.pathname === '/token') {
    if (form.get('grant_type') === 'authorization_code') {
      const c = G.codes.get(form.get('code'));
      if (!c) return json(400, { error: 'invalid_grant' });
      G.lastVerifierOk = crypto.createHash('sha256').update(form.get('code_verifier') || '').digest('base64url') === c.challenge && form.get('redirect_uri') === c.redirect;
      if (!G.lastVerifierOk) return json(400, { error: 'invalid_grant', error_description: 'PKCE verification failed' });
      return json(200, { access_token: `at-${++G.access}`, refresh_token: G.refresh, expires_in: G.expiresIn, scope: 'https://www.googleapis.com/auth/drive.metadata.readonly', token_type: 'Bearer' });
    }
    if (form.get('grant_type') === 'refresh_token') {
      G.refreshGrants++;
      if (G.failRefresh || form.get('refresh_token') !== G.refresh) return json(400, { error: 'invalid_grant', error_description: 'Token has been expired or revoked.' });
      return json(200, { access_token: `at-${++G.access}`, expires_in: 3600 });
    }
  }
  if (u.pathname === '/revoke') { G.revoked.push(form.get('token')); return json(200, {}); }
  const auth = req.headers.authorization || '';
  if (u.pathname.startsWith('/api/')) {
    if (!/^Bearer at-\d+$/.test(auth)) return json(401, { error: { message: 'Invalid Credentials' } });
    if (u.pathname === '/api/about') return json(200, { user: { displayName: 'Maria Santos', emailAddress: 'maria@example.edu' } });
    if (u.pathname === '/api/files') {
      const m = /name contains '((?:\\'|[^'])*)'/.exec(u.searchParams.get('q') || '');
      const term = m ? m[1].replace(/\\'/g, "'").toLowerCase() : '';
      return json(200, { files: Object.values(G.files).filter((f) => f.name.toLowerCase().includes(term)) });
    }
    const id = decodeURIComponent(u.pathname.replace('/api/files/', ''));
    if (G.files[id]) return json(200, G.files[id]);
    return json(404, { error: { message: 'File not found' } });
  }
  json(404, {});
});
await new Promise((r) => gserver.listen(0, '127.0.0.1', r));
const gbase = `http://127.0.0.1:${gserver.address().port}`;
process.env.SYNCHRONIA_GOOGLE_ENDPOINTS = JSON.stringify({ auth: `${gbase}/auth`, token: `${gbase}/token`, revoke: `${gbase}/revoke`, api: `${gbase}/api` });

const { openDatabase } = await import('../src/db.js');
const { createApp } = await import('../src/app.js');
const { backupNow } = await import('../src/backup.js');
const JSZip = (await import('jszip')).default;

const TOKEN = 'continuity-test-token-'.padEnd(48, 'c');
let server, base, db, cookie = '';
async function call(method, url, body, { raw = false, bin = null, noCookie = false } = {}) {
  const headers = { 'X-Synchronia': '1', ...(noCookie ? {} : { Cookie: cookie }) };
  if (bin) headers['Content-Type'] = 'application/octet-stream'; else headers['Content-Type'] = 'application/json';
  const res = await fetch(base + url, { method, headers, body: bin || (body === undefined ? undefined : JSON.stringify(body)), redirect: 'manual' });
  if (raw) return { status: res.status, buf: Buffer.from(await res.arrayBuffer()), headers: res.headers };
  const t = await res.text();
  let parsed = null; try { parsed = t ? JSON.parse(t) : null; } catch { parsed = t; }
  return { status: res.status, body: parsed };
}
const ok = (r, code = 200) => { assert.equal(r.status, code, JSON.stringify(r.body)); return r.body; };

before(async () => {
  db = openDatabase(path.join(tmp, 'synchronia.db'));
  server = createApp(db, { accessToken: TOKEN, dataDir: tmp }).listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}/api`;
  cookie = (await fetch(`${base}/open?token=${TOKEN}`, { redirect: 'manual' })).headers.get('set-cookie').split(';')[0];
  await call('PUT', '/profile', { full_name: 'Maria Santos', current_position: 'Instructor I' });
});
after(() => { server.close(); gserver.close(); db.close(); fs.rmSync(tmp, { recursive: true, force: true }); });

test('file library: the same file is never stored twice, and usage is listed', async () => {
  const a = ok(await call('POST', '/records/file_references', { provider: 'google_drive', title: 'Certificate', url: 'https://drive.google.com/file/d/1AbCdEfGhIjKlMn/view?usp=sharing' }), 201);
  assert.equal(a.external_id, '1AbCdEfGhIjKlMn');
  const dup = await call('POST', '/records/file_references', { provider: 'google_drive', title: 'Same file', url: 'https://drive.google.com/open?id=1AbCdEfGhIjKlMn' });
  assert.equal(dup.status, 409);
  assert.equal(dup.body.details.existing_id, a.id);
  const award = ok(await call('POST', '/records/awards', { title: 'Best Paper', date_received: '2025-03-01' }), 201);
  const ev = ok(await call('POST', `/records/awards/${award.id}/evidence`, { provider: 'google_drive', title: 'Certificate again', url: 'https://drive.google.com/file/d/1AbCdEfGhIjKlMn/view' }), 201);
  assert.equal(ev[0].id, a.id, 'attaching the same Drive file links the existing reference');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM external_file_references').get().n, 1);
  ok(await call('POST', '/records/file_references', { provider: 'url', title: 'CHED memo', url: 'https://ched.gov.ph/memo.pdf' }), 201);
  const lib = ok(await call('GET', '/knowledge/library'));
  assert.equal(lib.items.length, 2);
  const cert = lib.items.find((i) => i.id === a.id);
  assert.deepEqual(cert.used_by.map((x) => [x.type, x.title]), [['awards', 'Best Paper']]);
  assert.equal(ok(await call('GET', '/knowledge/library?usage=unlinked')).items.length, 1);
  assert.equal(ok(await call('GET', '/knowledge/library?provider=url')).items[0].title, 'CHED memo');
  assert.equal((await call('GET', '/knowledge/library?provider=ftp')).status, 422);
});

test('Google Drive: client validation, PKCE consent URL, single-use state', async () => {
  let s = ok(await call('GET', '/integrations/google'));
  assert.equal(s.status, 'not_connected');
  assert.equal((await call('POST', '/integrations/google/connect')).status, 409, 'needs a client first');
  assert.equal((await call('PUT', '/integrations/google/client', { client_id: 'not-a-client' })).status, 422);
  s = ok(await call('PUT', '/integrations/google/client', { client_id: '123-abc.apps.googleusercontent.com', client_secret: 'GOCSPX-secret' }));
  assert.equal(s.client_configured, true);
  const row = db.prepare('SELECT client_secret_enc FROM google_connections').get();
  assert.ok(!row.client_secret_enc.includes('GOCSPX-secret'), 'client secret encrypted at rest');

  const start = ok(await call('POST', '/integrations/google/connect'));
  const url = new URL(start.url);
  assert.equal(url.origin + url.pathname, `${gbase}/auth`);
  assert.equal(url.searchParams.get('scope'), 'https://www.googleapis.com/auth/drive.metadata.readonly');
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(url.searchParams.get('redirect_uri'), `${base}/integrations/google/callback`);
  const state = url.searchParams.get('state');
  assert.ok(state.length >= 40);

  // Forged state → refused; no cookie is needed or accepted as a substitute.
  const forged = await call('GET', `/integrations/google/callback?state=forged&code=x`, undefined, { noCookie: true });
  assert.equal(forged.status, 400);
  assert.match(forged.body, /not valid or has expired/);

  G.codes.set('code-1', { challenge: url.searchParams.get('code_challenge'), redirect: url.searchParams.get('redirect_uri') });
  const cb = await call('GET', `/integrations/google/callback?state=${state}&code=code-1`, undefined, { noCookie: true });
  assert.equal(cb.status, 200, cb.body);
  assert.match(cb.body, /Google Drive connected/);
  assert.match(cb.body, /maria@example\.edu/);
  assert.equal(G.lastVerifierOk, true, 'PKCE verifier matched the challenge');
  const replay = await call('GET', `/integrations/google/callback?state=${state}&code=code-1`, undefined, { noCookie: true });
  assert.equal(replay.status, 400, 'state is single-use');

  s = ok(await call('GET', '/integrations/google'));
  assert.equal(s.status, 'connected');
  assert.equal(s.account_email, 'maria@example.edu');
  const tok = db.prepare('SELECT refresh_token_enc, access_token_enc FROM google_connections').get();
  assert.ok(!tok.refresh_token_enc.includes(G.refresh) && !tok.access_token_enc.startsWith('at-'), 'tokens encrypted at rest');
  assert.ok(!JSON.stringify(s).includes(G.refresh), 'tokens never returned');
});

test('Google Drive: search, add to library (reused), refresh metadata reports missing files honestly', async () => {
  const found = ok(await call('GET', `/integrations/google/files?q=${encodeURIComponent("resolution")}`));
  assert.deepEqual(found.files.map((f) => f.name), ['Board Resolution 12.pdf']);
  assert.equal(found.files[0].library_id, null);
  const add = ok(await call('POST', '/integrations/google/files/file-aaaaaaaaaa/library'), 201);
  assert.equal(add.reused, false);
  assert.equal(add.reference.external_id, 'file-aaaaaaaaaa');
  assert.equal(add.reference.metadata_json.size, 20480);
  const again = ok(await call('POST', '/integrations/google/files/file-aaaaaaaaaa/library'), 201);
  assert.equal(again.reused, true);
  assert.equal(again.reference.id, add.reference.id);
  assert.equal(ok(await call('GET', '/integrations/google/files?q=resolution')).files[0].library_id, add.reference.id);
  assert.equal((await call('POST', '/integrations/google/files/..%2F..%2Fetc/library')).status, 422);
  // A quote in the search term cannot break out of the Drive query.
  assert.equal(ok(await call('GET', `/integrations/google/files?q=${encodeURIComponent("x' or name contains '")}`)).files.length, 0);

  delete G.files['file-aaaaaaaaaa'];
  const r = ok(await call('POST', '/integrations/google/refresh', {}));
  const gone = r.unavailable.find((x) => x.id === add.reference.id);
  assert.match(gone.reason, /Not found or no longer shared/);
  assert.equal(r.unavailable.length, 2, 'the manually linked Drive file from the first test is not in this Drive either');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM external_file_references WHERE id = ? AND deleted_at IS NULL').get(add.reference.id).n, 1, 'the reference is kept, not deleted');
});

test('Google Drive: expired access is refreshed; a revoked grant asks to reconnect; disconnect revokes', async () => {
  db.prepare("UPDATE google_connections SET access_expires_at = '2000-01-01T00:00:00Z'").run();
  const before = G.refreshGrants;
  ok(await call('GET', '/integrations/google/files?q=syllabus'));
  assert.equal(G.refreshGrants, before + 1);
  db.prepare("UPDATE google_connections SET access_expires_at = '2000-01-01T00:00:00Z'").run();
  G.failRefresh = true;
  const r = await call('GET', '/integrations/google/files?q=syllabus');
  assert.equal(r.status, 409);
  assert.equal(ok(await call('GET', '/integrations/google')).status, 'needs_reconnect');
  G.failRefresh = false;
  // Reconnect, then disconnect.
  const url = new URL(ok(await call('POST', '/integrations/google/connect')).url);
  G.codes.set('code-2', { challenge: url.searchParams.get('code_challenge'), redirect: url.searchParams.get('redirect_uri') });
  assert.equal((await call('GET', `/integrations/google/callback?state=${url.searchParams.get('state')}&code=code-2`, undefined, { noCookie: true })).status, 200);
  assert.equal((await call('DELETE', '/integrations/google/client')).status, 409, 'cannot forget the client while connected');
  const d = ok(await call('POST', '/integrations/google/disconnect'));
  assert.equal(d.status, 'not_connected');
  assert.equal(d.revoked, true);
  assert.deepEqual(G.revoked, [G.refresh]);
  assert.equal(db.prepare('SELECT refresh_token_enc FROM google_connections').get().refresh_token_enc, null);
  assert.equal(d.linked_files, 2, 'file references stay after disconnecting');
  // Consent declined.
  const u3 = new URL(ok(await call('POST', '/integrations/google/connect')).url);
  const denied = await call('GET', `/integrations/google/callback?state=${u3.searchParams.get('state')}&error=access_denied`, undefined, { noCookie: true });
  assert.equal(denied.status, 400);
  assert.match(denied.body, /not granted/);
});

test('timeline: events from records, teaching grouped by term, event date vs recorded date', async () => {
  ok(await call('POST', '/records/employment', { position: 'Administrative Aide IV', institution: 'URS', start_date: '2019-06-01', end_date: '2026-12-31' }), 201);
  ok(await call('POST', '/records/education', { degree: 'Master of Arts in Education', institution: 'PNU', graduation_date: '2018-04-20' }), 201);
  ok(await call('POST', '/records/publications', { title: 'Inclusion in Rural Schools', authors: 'Santos, M.', status: 'published', publication_date: '2026-03-01' }), 201);
  ok(await call('POST', '/records/publications', { title: 'Draft', authors: 'Santos, M.', status: 'submitted', publication_date: '2026-05-01' }), 201);
  const c = ok(await call('POST', '/records/courses', { code: 'EDUC 101', title: 'Teaching Profession' }), 201);
  for (const s of ['A', 'B']) ok(await call('POST', '/records/teaching_assignments', { course_id: c.id, academic_year: '2026-2027', semester: 'first', section: s }), 201);
  const t = ok(await call('GET', '/knowledge/timeline'));
  const titles = t.events.map((e) => e.title);
  assert.ok(titles.includes('Started as Administrative Aide IV, URS'));
  assert.ok(titles.includes('Ended service as Administrative Aide IV, URS'));
  assert.ok(titles.includes('Completed Master of Arts in Education, PNU'));
  assert.ok(titles.includes('Published: Inclusion in Rural Schools'));
  assert.ok(!titles.some((x) => x.includes('Draft')), 'unpublished manuscripts are not milestones');
  const teach = t.events.find((e) => e.category === 'teaching');
  assert.equal(teach.title, 'Taught 2 classes: EDUC 101 A, EDUC 101 B');
  assert.equal(teach.term_label, '1st Semester, SY 2026–2027');
  const grad = t.events.find((e) => e.title.startsWith('Completed Master'));
  assert.equal(grad.retrospective, true, 'entered long after it happened');
  assert.ok(t.events.every((e, i) => i === 0 || t.events[i - 1].date >= e.date), 'newest first');
  assert.equal(ok(await call('GET', '/knowledge/timeline?categories=qualifications')).total, 1);
  assert.equal(ok(await call('GET', '/knowledge/timeline?from=2026-01-01&to=2026-12-31')).events.every((e) => e.date.startsWith('2026')), true);
  assert.equal((await call('GET', '/knowledge/timeline?categories=bogus')).status, 422);
});

test('unified search reaches syllabus content, minutes and generated documents, with a module filter', async () => {
  const c = db.prepare("SELECT id FROM courses WHERE code = 'EDUC 101'").get();
  const s = ok(await call('POST', '/records/syllabi', { course_id: c.id, version_label: 'v1' }), 201);
  ok(await call('PUT', `/academic/syllabi/${s.id}/content`, { description: 'Philosophical foundations', weeks: [{ week: '1', content: 'Montessori and Dewey compared' }] }));
  const m = ok(await call('POST', '/records/meetings', { title: 'Faculty meeting', meeting_date: '2026-08-01', status: 'held' }), 201);
  ok(await call('PUT', `/admin/meetings/${m.id}/minutes`, { minutes: { items: [{ topic: 'Grading', discussion: 'Agreed on the rubric for practicum portfolios' }] } }));
  ok(await call('POST', '/intelligence/reports', { type: 'research_productivity', format: 'docx' }), 201);
  assert.equal(ok(await call('GET', '/search?q=Dewey')).results[0].type, 'syllabi');
  assert.equal(ok(await call('GET', '/search?q=practicum')).results[0].type, 'meetings');
  const doc = ok(await call('GET', '/search?q=Research Productivity')).results.find((r) => r.type === 'reports');
  assert.equal(doc.label, 'Generated Document');
  assert.ok(ok(await call('GET', '/search?q=Montessori&module=admin')).results.length === 0);
  assert.ok(ok(await call('GET', '/search?q=Montessori&module=academic')).results.length === 1);
});

test('portable archive: JSON, CSV, files and checksums; protected fields only on request; no keys or tokens', async () => {
  ok(await call('POST', '/records/licenses', { license_type: 'Professional Teacher', issuing_authority: 'PRC', registration_number: '1234567' }), 201);
  const a = await call('GET', '/knowledge/archive', undefined, { raw: true });
  assert.equal(a.status, 200);
  assert.match(a.headers.get('content-disposition'), /SYNCHRONIA_Archive_\d{4}-\d{2}-\d{2}\.zip/);
  const zip = await JSZip.loadAsync(a.buf);
  const names = Object.keys(zip.files);
  for (const n of ['manifest.json', 'README.txt', 'data/records.json', 'csv/awards.csv', 'csv/evidence_links.csv']) assert.ok(names.includes(n), n);
  assert.ok(names.some((n) => n.startsWith('files/exports/reports/')), 'generated documents included');
  assert.ok(!names.some((n) => /secret\.key|\.db$/.test(n)));
  const manifest = JSON.parse(await zip.file('manifest.json').async('string'));
  assert.equal(manifest.version, JSON.parse(fs.readFileSync(new URL('../../package.json', import.meta.url))).version);
  for (const f of manifest.files) {
    const buf = await zip.file(f.path).async('nodebuffer');
    assert.equal(crypto.createHash('sha256').update(buf).digest('hex'), f.sha256, f.path);
  }
  const data = JSON.parse(await zip.file('data/records.json').async('string'));
  assert.equal(data.licenses[0].registration_number, undefined);
  assert.equal(data.licenses[0].registration_number_enc, undefined);
  assert.equal(data.professional_profile.full_name, 'Maria Santos');
  assert.equal(typeof data.syllabi[0].content_json, 'object', 'JSON fields exported as JSON, not strings');
  const text = a.buf.toString('latin1');
  assert.ok(!text.includes(G.refresh), 'no OAuth tokens');
  const csv = await zip.file('csv/awards.csv').async('string');
  assert.match(csv, /^﻿id,/);
  const withSecrets = await JSZip.loadAsync((await call('GET', '/knowledge/archive?include_secrets=1', undefined, { raw: true })).buf);
  assert.equal(JSON.parse(await withSecrets.file('data/records.json').async('string')).licenses[0].registration_number, '1234567');
});

test('backups: a copy can be saved; imports are verified; names cannot escape the backup folder', async () => {
  const b = backupNow(db, tmp, 'manual');
  const dl = await call('GET', `/system/backups/${b.file}/download`, undefined, { raw: true });
  assert.equal(dl.status, 200);
  assert.equal(dl.buf.subarray(0, 15).toString(), 'SQLite format 3');
  for (const bad of ['..%2F..%2Fsecret.key', 'secret.key', 'synchronia-x.db', '%2E%2E%2Fsynchronia.db']) {
    const r = await call('GET', `/system/backups/${bad}/download`, undefined, { raw: true });
    assert.ok([404, 422].includes(r.status), `${bad}: ${r.status}`);
  }
  assert.equal((await call('POST', '/system/backups/import', undefined, { bin: Buffer.from('not a database at all'.repeat(40)) })).status, 415);
  const imp = ok(await call('POST', '/system/backups/import', undefined, { bin: dl.buf }), 201);
  assert.match(imp.file, /^synchronia-\d{8}-\d{6}-imported(-\d+)?\.db$/);
  assert.equal(imp.ok, true);
  assert.ok(ok(await call('GET', '/system/backups')).some((x) => x.file === imp.file && x.reason === 'imported'));
  // A backup from a newer version is refused.
  const newer = path.join(tmp, 'newer.db');
  db.exec(`VACUUM INTO '${newer}'`);
  const { DatabaseSync } = await import('node:sqlite');
  const d = new DatabaseSync(newer); d.exec("INSERT INTO schema_migrations (name) VALUES ('999_future.sql')"); d.close();
  const r = await call('POST', '/system/backups/import', undefined, { bin: fs.readFileSync(newer) });
  assert.equal(r.status, 422);
  assert.match(r.body.error, /newer version/);
});

test('backups are also copied to a chosen folder (e.g. one a cloud drive keeps on other computers), honestly reported', async () => {
  const cloud = fs.mkdtempSync(path.join(os.tmpdir(), 'synchronia-cloud-'));
  assert.equal((await call('PUT', '/system/backup-copy', { dir: 'relative/folder' })).status, 422);
  assert.equal((await call('PUT', '/system/backup-copy', { dir: path.join(cloud, 'missing') })).status, 422);
  assert.equal((await call('PUT', '/system/backup-copy', { dir: tmp })).status, 422, 'not inside the data folder');
  const set = ok(await call('PUT', '/system/backup-copy', { dir: cloud }));
  assert.equal(set.dir, path.resolve(cloud));
  const now = ok(await call('POST', '/system/backup-copy/now'));
  const copied = path.join(cloud, 'SYNCHRONIA Backups', now.backup.file);
  assert.ok(fs.existsSync(copied), 'the backup is in the chosen folder');
  assert.equal(fs.readFileSync(copied).subarray(0, 15).toString(), 'SQLite format 3');
  assert.equal(now.copy.last_file, now.backup.file);
  assert.ok(!fs.readdirSync(path.join(cloud, 'SYNCHRONIA Backups')).some((f) => f.endsWith('.partial')), 'no half-written files left');
  // Automatic backups are copied too.
  const auto = backupNow(db, tmp, 'scheduled');
  assert.ok(fs.existsSync(path.join(cloud, 'SYNCHRONIA Backups', auto.file)));
  // The copy on the other computer can be imported there.
  const imp = ok(await call('POST', '/system/backups/import', undefined, { bin: fs.readFileSync(copied) }), 201);
  assert.equal(imp.ok, true);
  // If the folder disappears, the backup is still made here and the failure is reported, not hidden.
  fs.rmSync(cloud, { recursive: true, force: true });
  const still = backupNow(db, tmp, 'manual');
  assert.ok(fs.existsSync(path.join(tmp, 'backups', still.file)), 'local backup still written');
  const st = ok(await call('GET', '/system/backup-copy'));
  assert.ok(st.last_error, 'the failed copy is reported');
  assert.notEqual(st.last_file, still.file);
  ok(await call('PUT', '/system/backup-copy', { dir: '' }));
  assert.equal(ok(await call('GET', '/system/backup-copy')).dir, null);
});

test('notification settings are saved and default to on', async () => {
  const p = ok(await call('GET', '/preferences'));
  assert.equal(p.notify_desktop, true); assert.equal(p.notify_sound, true);
  ok(await call('PUT', '/preferences', { notify_desktop: false, notify_sound: false }));
  const q = ok(await call('GET', '/preferences'));
  assert.equal(q.notify_desktop, false); assert.equal(q.notify_sound, false);
  ok(await call('PUT', '/preferences', { notify_desktop: true, notify_sound: true }));
});
