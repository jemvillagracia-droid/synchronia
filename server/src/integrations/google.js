// Optional Google Drive connection. The owner registers their own OAuth client (Desktop app) and authorizes
// SYNCHRONIA with read-only access to file metadata. The flow is OAuth 2.0 with PKCE and a loopback redirect;
// tokens are encrypted at rest. SYNCHRONIA never uploads, edits or synchronizes Drive files: it searches,
// stores references (file ID, link, metadata) and refreshes that metadata on request.
import crypto from 'node:crypto';
import { HttpError, audit, create, update } from '../repo.js';
import { encrypt, decrypt } from '../secrets.js';

export const SCOPE = 'https://www.googleapis.com/auth/drive.metadata.readonly';
const DEFAULTS = {
  auth: 'https://accounts.google.com/o/oauth2/v2/auth',
  token: 'https://oauth2.googleapis.com/token',
  revoke: 'https://oauth2.googleapis.com/revoke',
  api: 'https://www.googleapis.com/drive/v3',
};
/** Endpoints; tests point these at a local stand-in. */
export const endpoints = () => ({ ...DEFAULTS, ...(process.env.SYNCHRONIA_GOOGLE_ENDPOINTS ? JSON.parse(process.env.SYNCHRONIA_GOOGLE_ENDPOINTS) : {}) });

const FILE_FIELDS = 'id,name,mimeType,modifiedTime,webViewLink,iconLink,size,owners(displayName),trashed';
const pending = new Map(); // state → { userId, verifier, redirect, expires }
const now = () => new Date().toISOString();
const b64url = (buf) => buf.toString('base64url');

function row(db, userId) {
  return db.prepare('SELECT * FROM google_connections WHERE user_id = ?').get(userId) || null;
}
function upsert(db, userId, values) {
  const cur = row(db, userId);
  if (!cur) db.prepare('INSERT INTO google_connections (user_id) VALUES (?)').run(userId);
  const keys = Object.keys(values);
  db.prepare(`UPDATE google_connections SET ${keys.map((k) => `${k} = ?`).join(', ')}, updated_at = ? WHERE user_id = ?`).run(...keys.map((k) => values[k]), now(), userId);
}

export function status(db, userId) {
  const r = row(db, userId);
  return {
    client_configured: !!r?.client_id,
    client_id: r?.client_id ? `${r.client_id.slice(0, 12)}…${r.client_id.slice(-28)}` : null,
    status: r?.status || 'not_connected',
    status_detail: r?.status_detail || null,
    account_email: r?.account_email || null, account_name: r?.account_name || null,
    scopes: r?.scopes ? r.scopes.split(' ') : [],
    connected_at: r?.connected_at || null, last_used_at: r?.last_used_at || null,
    linked_files: db.prepare("SELECT COUNT(*) n FROM external_file_references WHERE user_id = ? AND provider = 'google_drive' AND deleted_at IS NULL").get(userId).n,
    scope_requested: SCOPE,
  };
}

export function saveClient(db, userId, body = {}) {
  const clientId = String(body.client_id || '').trim();
  const secret = String(body.client_secret || '').trim();
  if (!/^[\w-]+\.apps\.googleusercontent\.com$/.test(clientId)) throw new HttpError(422, 'Validation failed', { client_id: 'Paste the OAuth client ID ending in .apps.googleusercontent.com' });
  if (secret.length > 200) throw new HttpError(422, 'Validation failed', { client_secret: 'Too long' });
  upsert(db, userId, { client_id: clientId, client_secret_enc: secret ? encrypt(secret) : null });
  audit(db, userId, 'integration', null, 'settings', 'Saved Google OAuth client');
  return status(db, userId);
}

/** Begin authorization: returns the Google consent URL. The redirect comes back to this app on the loopback address. */
export function start(db, userId, origin) {
  const r = row(db, userId);
  if (!r?.client_id) throw new HttpError(409, 'Add your Google OAuth client ID first.');
  for (const [k, v] of pending) if (v.expires < Date.now()) pending.delete(k);
  const state = b64url(crypto.randomBytes(32));
  const verifier = b64url(crypto.randomBytes(48));
  const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());
  const redirect = `${origin}/api/integrations/google/callback`;
  pending.set(state, { userId, verifier, redirect, expires: Date.now() + 10 * 60 * 1000 });
  const u = new URL(endpoints().auth);
  for (const [k, v] of Object.entries({ client_id: r.client_id, redirect_uri: redirect, response_type: 'code', scope: SCOPE, access_type: 'offline', prompt: 'consent', include_granted_scopes: 'false', state, code_challenge: challenge, code_challenge_method: 'S256' })) u.searchParams.set(k, v);
  return { url: u.toString(), expires_in: 600 };
}

async function tokenRequest(params) {
  const res = await fetch(endpoints().token, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(params) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { const e = new Error(data.error_description || data.error || `Token request failed (${res.status})`); e.code = data.error; throw e; }
  return data;
}

const page = (title, body, ok) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${title}</title>
<style>body{font:16px/1.5 system-ui,sans-serif;background:#080808;color:#f2f2f2;display:grid;place-items:center;min-height:100vh;margin:0}
main{max-width:520px;padding:32px;border:1px solid ${ok ? '#8a3ffc' : '#ff5a1f'}}h1{font-size:22px;margin:0 0 8px;color:${ok ? '#b98aff' : '#ff7a45'}}</style></head>
<body><main><h1>${title}</h1><p>${body}</p></main></body></html>`;
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** OAuth redirect target. Authenticated by the single-use state (and PKCE), not by the app cookie. */
export async function callback(db, query) {
  const p = query.state && pending.get(String(query.state));
  if (!p || p.expires < Date.now()) {
    if (p) pending.delete(String(query.state));
    return { status: 400, html: page('Link expired', 'This sign-in link is not valid or has expired. Return to SYNCHRONIA and choose “Connect Google Drive” again.', false) };
  }
  pending.delete(String(query.state)); // single use
  if (query.error) {
    upsert(db, p.userId, { status_detail: `Authorization was not granted (${String(query.error).slice(0, 80)})` });
    return { status: 400, html: page('Not connected', 'Google Drive access was not granted. Nothing was changed. You can close this tab.', false) };
  }
  const r = row(db, p.userId);
  try {
    const t = await tokenRequest({ grant_type: 'authorization_code', code: String(query.code || ''), client_id: r.client_id, ...(r.client_secret_enc ? { client_secret: decrypt(r.client_secret_enc) } : {}), redirect_uri: p.redirect, code_verifier: p.verifier });
    if (!t.refresh_token) throw new Error('Google did not return a refresh token');
    const granted = String(t.scope || '').split(' ');
    if (!granted.includes(SCOPE)) throw new Error('The Drive metadata permission was not granted');
    upsert(db, p.userId, {
      refresh_token_enc: encrypt(t.refresh_token), access_token_enc: encrypt(t.access_token),
      access_expires_at: new Date(Date.now() + (Number(t.expires_in) || 3600) * 1000 - 60000).toISOString(),
      scopes: granted.join(' '), status: 'connected', status_detail: null, connected_at: now(),
    });
    try {
      const about = await api(db, p.userId, '/about', { fields: 'user(displayName,emailAddress)' });
      upsert(db, p.userId, { account_email: about.user?.emailAddress || null, account_name: about.user?.displayName || null });
    } catch { /* account details are optional */ }
    audit(db, p.userId, 'integration', null, 'settings', 'Connected Google Drive (read-only metadata)');
    const s = status(db, p.userId);
    return { status: 200, html: page('Google Drive connected', `SYNCHRONIA can now search your Drive file names and keep links to them${s.account_email ? ` for <b>${esc(s.account_email)}</b>` : ''}. It cannot change, upload or delete files. You can close this tab and return to the app.`, true) };
  } catch (e) {
    upsert(db, p.userId, { status_detail: `Connection failed: ${String(e.message).slice(0, 200)}` });
    return { status: 502, html: page('Not connected', `Google did not complete the connection: ${esc(e.message)}. Nothing was stored.`, false) };
  }
}

async function accessToken(db, userId) {
  const r = row(db, userId);
  if (!r || r.status !== 'connected' || !r.refresh_token_enc) throw new HttpError(409, r?.status === 'needs_reconnect' ? 'Google Drive needs to be reconnected.' : 'Google Drive is not connected.');
  if (r.access_token_enc && r.access_expires_at > now()) return decrypt(r.access_token_enc);
  try {
    const t = await tokenRequest({ grant_type: 'refresh_token', refresh_token: decrypt(r.refresh_token_enc), client_id: r.client_id, ...(r.client_secret_enc ? { client_secret: decrypt(r.client_secret_enc) } : {}) });
    upsert(db, userId, { access_token_enc: encrypt(t.access_token), access_expires_at: new Date(Date.now() + (Number(t.expires_in) || 3600) * 1000 - 60000).toISOString() });
    return t.access_token;
  } catch (e) {
    if (e.code === 'invalid_grant') {
      upsert(db, userId, { status: 'needs_reconnect', status_detail: 'Google no longer accepts the saved authorization (it was revoked or expired). Connect again.', access_token_enc: null, refresh_token_enc: null });
      throw new HttpError(409, 'Google Drive needs to be reconnected.');
    }
    throw new HttpError(502, `Could not reach Google: ${e.message}`);
  }
}

async function api(db, userId, path, params = {}) {
  const token = await accessToken(db, userId);
  const u = new URL(endpoints().api + path);
  for (const [k, v] of Object.entries(params)) if (v != null && v !== '') u.searchParams.set(k, v);
  let res;
  try { res = await fetch(u, { headers: { Authorization: `Bearer ${token}` } }); } catch (e) { throw new HttpError(502, `Could not reach Google Drive: ${e.message}`); }
  if (res.status === 401) { upsert(db, userId, { access_token_enc: null, access_expires_at: null }); throw new HttpError(502, 'Google Drive rejected the request; try again.'); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { const e = new HttpError(res.status === 404 ? 404 : 502, data.error?.message || `Google Drive error (${res.status})`); throw e; }
  db.prepare('UPDATE google_connections SET last_used_at = ? WHERE user_id = ?').run(now(), userId);
  return data;
}

const meta = (f) => ({ modified_time: f.modifiedTime || null, size: f.size ? Number(f.size) : null, owners: (f.owners || []).map((o) => o.displayName).filter(Boolean), icon: f.iconLink || null, trashed: !!f.trashed, checked_at: now() });

/** Search Drive by file name (metadata only). Marks files already in the library. */
export async function search(db, userId, q = '', pageToken = '') {
  const term = String(q).trim().slice(0, 120).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  const data = await api(db, userId, '/files', {
    q: `${term ? `name contains '${term}' and ` : ''}trashed = false`, fields: `nextPageToken,files(${FILE_FIELDS})`,
    pageSize: '25', orderBy: term ? undefined : 'modifiedTime desc', pageToken, spaces: 'drive', supportsAllDrives: 'true', includeItemsFromAllDrives: 'true',
  });
  const ids = (data.files || []).map((f) => f.id);
  const known = ids.length ? Object.fromEntries(db.prepare(`SELECT external_id, id FROM external_file_references WHERE user_id = ? AND provider = 'google_drive' AND deleted_at IS NULL AND external_id IN (${ids.map(() => '?').join(',')})`).all(userId, ...ids).map((x) => [x.external_id, x.id])) : {};
  return {
    files: (data.files || []).map((f) => ({ id: f.id, name: f.name, mime_type: f.mimeType, url: f.webViewLink, ...meta(f), library_id: known[f.id] || null })),
    next_page_token: data.nextPageToken || null,
  };
}

/** Add a Drive file to the library as a reference (reusing an existing one). Nothing is copied from Drive. */
export async function addToLibrary(db, userId, fileId) {
  if (!/^[\w-]{10,200}$/.test(String(fileId))) throw new HttpError(422, 'Invalid Drive file ID');
  const existing = db.prepare("SELECT id FROM external_file_references WHERE user_id = ? AND provider = 'google_drive' AND external_id = ? AND deleted_at IS NULL").get(userId, fileId);
  const f = await api(db, userId, `/files/${encodeURIComponent(fileId)}`, { fields: FILE_FIELDS, supportsAllDrives: 'true' });
  const values = { title: String(f.name || 'Drive file').slice(0, 500), url: f.webViewLink || `https://drive.google.com/file/d/${fileId}/view`, mime_type: f.mimeType || null, metadata_json: meta(f) };
  const ref = existing ? update(db, userId, 'file_references', existing.id, values) : create(db, userId, 'file_references', { provider: 'google_drive', external_id: fileId, ...values });
  db.prepare('UPDATE external_file_references SET metadata_checked_at = ? WHERE id = ?').run(now(), ref.id);
  return { reference: ref, reused: !!existing };
}

/** Refresh stored metadata for Drive references. Files that are gone or no longer shared are reported, not removed. */
export async function refreshMetadata(db, userId, ids = null) {
  const refs = db.prepare(`SELECT * FROM external_file_references WHERE user_id = ? AND provider = 'google_drive' AND deleted_at IS NULL AND external_id IS NOT NULL
      ${ids ? `AND id IN (${ids.map(() => '?').join(',')})` : ''} ORDER BY id LIMIT 200`).all(userId, ...(ids || []));
  const out = { checked: 0, updated: 0, unavailable: [] };
  for (const r of refs) {
    out.checked++;
    try {
      const f = await api(db, userId, `/files/${encodeURIComponent(r.external_id)}`, { fields: FILE_FIELDS, supportsAllDrives: 'true' });
      db.prepare('UPDATE external_file_references SET metadata_json = ?, mime_type = COALESCE(?, mime_type), metadata_checked_at = ? WHERE id = ?')
        .run(JSON.stringify({ ...meta(f), drive_name: f.name }), f.mimeType || null, now(), r.id);
      out.updated++;
      if (f.trashed) out.unavailable.push({ id: r.id, title: r.title, reason: 'In the Drive trash' });
    } catch (e) {
      if (e.status === 404) {
        db.prepare('UPDATE external_file_references SET metadata_json = ?, metadata_checked_at = ? WHERE id = ?').run(JSON.stringify({ ...(safeParse(r.metadata_json)), unavailable: 'Not found or no longer shared with this account', checked_at: now() }), now(), r.id);
        out.unavailable.push({ id: r.id, title: r.title, reason: 'Not found or no longer shared with this account' });
      } else throw e;
    }
  }
  return out;
}
const safeParse = (j) => { try { return j ? JSON.parse(j) : {}; } catch { return {}; } };

/** Revoke and forget the tokens. File references stay (they are your records). */
export async function disconnect(db, userId) {
  const r = row(db, userId);
  let revoked = false;
  if (r?.refresh_token_enc) {
    try {
      const res = await fetch(endpoints().revoke, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token: decrypt(r.refresh_token_enc) }) });
      revoked = res.ok;
    } catch { revoked = false; }
  }
  upsert(db, userId, { refresh_token_enc: null, access_token_enc: null, access_expires_at: null, status: 'not_connected', status_detail: null, account_email: null, account_name: null, scopes: null, connected_at: null });
  audit(db, userId, 'integration', null, 'settings', `Disconnected Google Drive${revoked ? ' (access revoked at Google)' : ' (stored tokens deleted; Google did not confirm revocation)'}`);
  return { ...status(db, userId), revoked };
}

export function forgetClient(db, userId) {
  const r = row(db, userId);
  if (r?.refresh_token_enc) throw new HttpError(409, 'Disconnect Google Drive first.');
  upsert(db, userId, { client_id: null, client_secret_enc: null });
  return status(db, userId);
}

/** For tests only. */
export const _pending = pending;
