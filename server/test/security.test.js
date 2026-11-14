// Security tests: access control on every route, request-origin guards, injection, traversal, uploads, secrets at
// rest, headers and error hygiene. Routes are enumerated from the source, so a new route is covered automatically.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'synchronia-sec-'));
process.env.SYNCHRONIA_DATA_DIR = tmp;
const { openDatabase } = await import('../src/db.js');
const { createApp } = await import('../src/app.js');

const SRC = new URL('../src/', import.meta.url);
const TOKEN = 'security-test-token-'.padEnd(48, 's');
const PUBLIC = new Set(['GET /api/meta', 'GET /api/open', 'GET /api/auth/state', 'GET /api/integrations/google/callback']);
let server, base, port, db, cookie = '';

/** Every route declared in the server source, with its mount prefix. */
function routes() {
  const mounts = { 'app.js': { '': '' }, 'cv/routes.js': { cvRouter: '/cv', imageRouter: '/images' }, 'academic/routes.js': { academicRouter: '/academic' },
    'intelligence/routes.js': { intelligenceRouter: '/intelligence' }, 'admin/routes.js': { adminRouter: '/admin' }, 'knowledge/routes.js': { knowledgeRouter: '/knowledge' }, 'calendar/routes.js': { calendarRouter: '/calendar' }, 'portfolio/routes.js': { portfolioImportRouter: '/portfolio' }, 'docimages.js': { docImagesRouter: '/doc-images' }, 'research/routes.js': { researchRouter: '/research' },
    'integrations/routes.js': { googleCallbackRouter: '', integrationsRouter: '/integrations' } };
  // Guard: every router mounted in app.js must be listed above.
  const appSrc = fs.readFileSync(new URL('app.js', SRC), 'utf8');
  const mounted = [...appSrc.matchAll(/api\.use\((?:'([^']+)',\s*)?(\w+Router)\(/g)].map((m) => [m[2], m[1] || '']);
  const known = Object.values(mounts).flatMap((m) => Object.entries(m));
  for (const [fn, prefix] of mounted) assert.ok(known.some(([k, p]) => k === fn && p === prefix), `router ${fn} at "${prefix}" is not covered by the security test`);
  const out = [];
  for (const [file, fns] of Object.entries(mounts)) {
    const src = fs.readFileSync(new URL(file, SRC), 'utf8');
    const chunks = file === 'app.js' ? [['', src]] : src.split(/export function /).slice(1).map((c) => [c.slice(0, c.indexOf('(')), c]);
    for (const [fn, body] of chunks) {
      if (!(fn in fns)) continue;
      for (const m of body.matchAll(/(?:api|r)\.(get|post|put|patch|delete)\('([^']+)'/g)) out.push({ method: m[1].toUpperCase(), path: `/api${fns[fn]}${m[2]}` });
    }
  }
  return out;
}

function raw(method, p, headers = {}, body = null) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, method, path: p, headers: { ...headers, ...(body ? { 'Content-Length': Buffer.byteLength(body) } : {}) } }, (res) => {
      let data = ''; res.on('data', (c) => { data += c; }); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

before(async () => {
  db = openDatabase(path.join(tmp, 'synchronia.db'));
  server = createApp(db, { accessToken: TOKEN, dataDir: tmp }).listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  port = server.address().port;
  base = `http://127.0.0.1:${port}/api`;
  cookie = (await fetch(`${base}/open?token=${TOKEN}`, { redirect: 'manual' })).headers.get('set-cookie').split(';')[0];
});
after(() => { server.close(); db.close(); fs.rmSync(tmp, { recursive: true, force: true }); });

test('every non-public API route refuses requests without this launch’s access key', async () => {
  const list = routes();
  assert.ok(list.length > 120, `found ${list.length} routes`);
  const failures = [];
  for (const r of list) {
    const key = `${r.method} ${r.path}`;
    if (PUBLIC.has(key)) continue;
    const p = r.path.replace(/:(\w+)/g, (_m, name) => (name === 'type' ? 'awards' : name === 'name' ? 'synchronia-20260101-000000-manual.db' : name === 'part' ? 'header' : '1'));
    for (const cookieHeader of [undefined, 'sync_access=wrong-key-wrong-key-wrong-key-wrong-key']) {
      const res = await raw(r.method, p, { 'X-Synchronia': '1', 'Content-Type': 'application/json', ...(cookieHeader ? { Cookie: cookieHeader } : {}) }, r.method === 'GET' ? null : '{}');
      if (res.status !== 401) failures.push(`${key} → ${res.status}${cookieHeader ? ' (wrong key)' : ''}`);
    }
  }
  assert.deepEqual(failures, []);
});

test('requests addressed to another host name are refused (DNS rebinding)', async () => {
  for (const host of ['evil.example', 'synchronia.local', `127.0.0.1.nip.io:${port}`]) {
    const r = await raw('GET', '/api/nexus', { Host: host, Cookie: cookie });
    assert.equal(r.status, 421, host);
  }
  assert.equal((await raw('GET', '/api/nexus', { Host: `localhost:${port}`, Cookie: cookie })).status, 200);
});

test('state-changing requests need the custom header (CSRF)', async () => {
  for (const [m, p] of [['POST', '/api/records/awards'], ['PUT', '/api/profile'], ['DELETE', '/api/records/awards/1'], ['POST', '/api/system/backups']]) {
    const r = await raw(m, p, { Cookie: cookie, 'Content-Type': 'application/json' }, '{"title":"x"}');
    assert.equal(r.status, 403, `${m} ${p}`);
  }
});

test('access cookie is HttpOnly and SameSite=Strict; the entry point cannot redirect elsewhere', async () => {
  const r = await raw('GET', `/api/open?token=${TOKEN}&next=//evil.example/x`);
  assert.match(r.headers['set-cookie'][0], /HttpOnly/);
  assert.match(r.headers['set-cookie'][0], /SameSite=Strict/);
  assert.equal(r.headers.location, '/');
  for (const next of ['https://evil.example', '/\\evil.example', '/%2F%2Fevil.example']) {
    assert.equal((await raw('GET', `/api/open?token=${TOKEN}&next=${encodeURIComponent(next)}`)).headers.location, '/', next);
  }
  assert.equal((await raw('GET', '/api/open?token=wrong')).status, 401);
});

test('security headers on every response', async () => {
  for (const p of ['/api/meta', '/api/nexus', '/']) {
    const r = await raw('GET', p, { Cookie: cookie });
    assert.match(r.headers['content-security-policy'] || '', /default-src 'self'.*object-src 'none'.*frame-ancestors 'none'/, p);
    assert.equal(r.headers['x-content-type-options'], 'nosniff');
    assert.equal(r.headers['x-frame-options'], 'DENY');
    assert.equal(r.headers['referrer-policy'], 'no-referrer');
    assert.equal(r.headers['x-powered-by'], undefined);
  }
});

const api = async (method, p, body) => {
  const r = await fetch(base + p, { method, headers: { 'Content-Type': 'application/json', 'X-Synchronia': '1', Cookie: cookie }, body: body === undefined ? undefined : JSON.stringify(body) });
  const t = await r.text();
  let parsed; try { parsed = JSON.parse(t); } catch { parsed = t; }
  return { status: r.status, body: parsed };
};

test('injection: sort, filters, search syntax and unknown fields are inert', async () => {
  await api('POST', '/records/awards', { title: "O'Brien Award\"; DROP TABLE awards; --" });
  for (const q of ['sort=id;DROP TABLE awards', 'sort=(SELECT 1)', 'order=asc;DELETE', "title=' OR 1=1 --", 'deleted_at=x', 'limit=-1', 'limit=99999999', 'offset=abc']) {
    const r = await api('GET', `/records/awards?${q}`);
    assert.equal(r.status, 200, q);
  }
  assert.equal((await api('GET', "/records/awards?title=' OR 1=1 --")).body.items.length, 0, 'filter values are bound, not interpolated');
  for (const q of ['"', 'NEAR(a b)', 'title:*', '*', 'a OR', "') --", '\u0000']) {
    const r = await api('GET', `/search?q=${encodeURIComponent(q)}`);
    assert.equal(r.status, 200, q);
  }
  assert.equal((await api('POST', '/records/awards', { title: 'x', user_id: 99, id: 5 })).status, 422, 'unknown or protected fields are refused');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM awards').get().n, 1, 'table intact');
  assert.equal((await api('GET', '/records/sqlite_master')).status, 404);
  assert.equal((await api('GET', '/records/awards%20UNION%20SELECT')).status, 404);
});

test('path traversal: downloads only serve their own files', async () => {
  for (const p of ['/academic/reports/..%2F..%2Fsecret.key/download', '/academic/reports/1%20OR%201=1/download', '/system/backups/..%2Fsynchronia.db/download',
    '/system/backups/secret.key/download', '/academic/institution/letterhead/..%2F..%2Fsecret.key', '/images/..%2Fsecret.key/file']) {
    const r = await api('GET', p);
    assert.ok([400, 404, 422].includes(r.status), `${p} → ${r.status}`);
    assert.ok(!String(r.body).match(/[0-9a-f]{64}/), 'no key material');
  }
});

test('uploads are checked by content, not by name or declared type', async () => {
  const fake = Buffer.from('<?php echo "not an image"; ?>'.repeat(20));
  const r = await fetch(`${base}/images`, { method: 'POST', headers: { 'X-Synchronia': '1', Cookie: cookie, 'Content-Type': 'image/png', 'X-Filename': 'photo.png' }, body: fake });
  assert.ok([415, 422].includes(r.status), `image upload → ${r.status}`);
  const d = await fetch(`${base}/academic/syllabi/import`, { method: 'POST', headers: { 'X-Synchronia': '1', Cookie: cookie, 'Content-Type': 'application/octet-stream', 'X-Filename': 'syllabus.docx' }, body: fake });
  assert.equal(d.status, 415);
});

test('protected fields are encrypted in the database file, and revealing one is audited', async () => {
  const lic = await api('POST', '/records/licenses', { license_type: 'Professional Teacher', issuing_authority: 'PRC', registration_number: '0987654321' });
  assert.equal(lic.status, 201);
  assert.equal(lic.body.registration_number_masked, '••••4321');
  assert.ok(!JSON.stringify(lic.body).includes('0987654321'));
  db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  const bytes = fs.readFileSync(path.join(tmp, 'synchronia.db')).toString('latin1');
  assert.ok(!bytes.includes('0987654321'), 'not in the database file in plain text');
  const rev = await api('GET', `/records/licenses/${lic.body.id}/secret/registration_number`);
  assert.equal(rev.body.value, '0987654321');
  assert.ok(db.prepare("SELECT COUNT(*) n FROM audit_logs WHERE entity_type = 'licenses' AND summary LIKE '%Revealed%'").get().n >= 1);
  assert.equal(fs.statSync(path.join(tmp, 'secret.key')).mode & 0o077, 0, 'key file readable only by the owner');
});

test('oversized and malformed bodies are refused without detail leaks', async () => {
  const big = await fetch(`${base}/records/awards`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Synchronia': '1', Cookie: cookie }, body: JSON.stringify({ title: 'x'.repeat(2 * 1024 * 1024) }) });
  assert.equal(big.status, 413);
  const bad = await raw('POST', '/api/records/awards', { 'Content-Type': 'application/json', 'X-Synchronia': '1', Cookie: cookie }, '{"title": ');
  assert.equal(bad.status, 400);
  assert.doesNotMatch(bad.body, /at .*\.js:\d+|node_modules|SyntaxError/);
  const notFound = await api('GET', '/records/awards/999999');
  assert.equal(notFound.status, 404);
  assert.doesNotMatch(JSON.stringify(notFound.body), /SELECT|sqlite|\.js:/i);
});

test('generated documents escape markup from records', async () => {
  await api('PUT', '/profile', { full_name: '<script>alert(1)</script> Santos' });
  const r = await api('POST', '/intelligence/reports', { type: 'portfolio_summary', format: 'docx' });
  assert.equal(r.status, 201);
  const f = await fetch(base.replace('/api', '') + r.body.download, { headers: { Cookie: cookie } });
  const JSZip = (await import('jszip')).default;
  const xml = await (await JSZip.loadAsync(Buffer.from(await f.arrayBuffer()))).file('word/document.xml').async('string');
  assert.ok(!xml.includes('<script>'), 'raw markup never reaches the document XML');
  assert.ok(xml.includes('&lt;script&gt;') || xml.includes('&lt;SCRIPT&gt;'));
});
