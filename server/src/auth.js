// Single-owner access for the SYNCHRONIA desktop app.
//
// There is no sign-in: the desktop shell generates a random access key at every launch and hands it to its own
// window through a one-time URL that sets an HttpOnly, SameSite=Strict cookie. The API listens on 127.0.0.1 only,
// checks the Host header (DNS-rebinding defence) and requires a custom header on writes (CSRF defence), so other
// programs and websites cannot read or change your records.
import crypto from 'node:crypto';
import { HttpError, indexProfile } from './repo.js';
import { tx } from './db.js';

const COOKIE = 'sync_access';

function parseCookies(header = '') {
  return Object.fromEntries(header.split(';').map((p) => p.trim().split('=')).filter(([k]) => k).map(([k, ...v]) => [k, decodeURIComponent(v.join('='))]));
}

const safeEqual = (a, b) => {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

/** Ensure the single owner account (and its profile rows) exists; returns the owner. */
export function ensureOwner(db) {
  const existing = db.prepare('SELECT id, email FROM users ORDER BY id LIMIT 1').get();
  if (existing) return existing;
  return tx(db, () => {
    // No password: access is granted by the desktop app's per-launch key.
    const u = db.prepare("INSERT INTO users (email, password_hash) VALUES ('owner@synchronia.local', '!desktop')").run();
    const id = Number(u.lastInsertRowid);
    db.prepare('INSERT INTO user_profiles (user_id) VALUES (?)').run(id);
    db.prepare('INSERT INTO professional_profiles (user_id) VALUES (?)').run(id);
    indexProfile(db, id);
    return { id, email: 'owner@synchronia.local' };
  });
}

/** Attaches req.user when the request carries this launch's access key. */
export function accessMiddleware(db, accessToken) {
  if (!accessToken || accessToken.length < 32) throw new Error('An access token of at least 32 characters is required');
  const owner = ensureOwner(db);
  return (req, _res, next) => {
    const presented = parseCookies(req.headers.cookie)[COOKIE];
    if (presented && safeEqual(presented, accessToken)) req.user = owner;
    next();
  };
}

/** Only accept requests addressed to the loopback interface (blocks DNS-rebinding attacks). */
export function hostGuard(req, _res, next) {
  const host = String(req.headers.host || '').replace(/:\d+$/, '').toLowerCase();
  if (host !== '127.0.0.1' && host !== 'localhost' && host !== '[::1]') return next(new HttpError(421, 'Misdirected request'));
  next();
}

export function requireAuth(req, _res, next) {
  if (!req.user) return next(new HttpError(401, 'SYNCHRONIA must be opened from its desktop app.'));
  next();
}

/** CSRF defence in depth (cookie is already SameSite=Strict): state-changing requests must carry a custom header. */
export function csrfGuard(req, _res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.get('X-Synchronia') !== '1') return next(new HttpError(403, 'Missing request header'));
  next();
}

/** GET /api/open?token=…&next=/path — the desktop window's entry point. Sets the access cookie, then redirects. */
export function openHandler(accessToken) {
  return (req, res) => {
    if (!safeEqual(req.query.token || '', accessToken)) throw new HttpError(401, 'Invalid access key');
    const nextPath = typeof req.query.next === 'string' && /^\/(?!\/)[\w\-/]*$/.test(req.query.next) ? req.query.next : '/';
    res.setHeader('Set-Cookie', `${COOKIE}=${accessToken}; Path=/; HttpOnly; SameSite=Strict`);
    res.setHeader('Cache-Control', 'no-store');
    res.redirect(303, nextPath);
  };
}
