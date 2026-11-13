import { Router } from 'express';
import { HttpError, audit, indexProfile } from './repo.js';
import { hashPassword, verifyPassword, randomToken, sha256 } from './secrets.js';
import { IS_PROD, SESSION_DAYS } from './config.js';
import { tx } from './db.js';

const COOKIE = 'sync_session';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parseCookies(header = '') {
  return Object.fromEntries(header.split(';').map((p) => p.trim().split('=')).filter(([k]) => k).map(([k, ...v]) => [k, decodeURIComponent(v.join('='))]));
}

function setSessionCookie(res, token, maxAgeSec) {
  const parts = [`${COOKIE}=${token}`, 'Path=/', 'HttpOnly', 'SameSite=Strict', `Max-Age=${maxAgeSec}`];
  if (IS_PROD) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

function checkPassword(pw) {
  if (typeof pw !== 'string' || pw.length < 10) throw new HttpError(422, 'Password must be at least 10 characters.', { password: 'At least 10 characters' });
  if (pw.length > 200) throw new HttpError(422, 'Password is too long.');
}

function startSession(db, res, userId) {
  const token = randomToken();
  const expires = new Date(Date.now() + SESSION_DAYS * 864e5).toISOString();
  db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)').run(sha256(token), userId, expires);
  db.prepare("UPDATE users SET last_login_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?").run(userId);
  setSessionCookie(res, token, SESSION_DAYS * 86400);
}

/** Attaches req.user when a valid session cookie is present. */
export function sessionMiddleware(db) {
  return (req, _res, next) => {
    const token = parseCookies(req.headers.cookie)[COOKIE];
    if (token) {
      const row = db.prepare(`SELECT u.id, u.email FROM sessions s JOIN users u ON u.id = s.user_id
                              WHERE s.token_hash = ? AND s.expires_at > strftime('%Y-%m-%dT%H:%M:%fZ','now')`).get(sha256(token));
      if (row) { req.user = row; req.sessionHash = sha256(token); }
    }
    next();
  };
}

export function requireAuth(req, _res, next) {
  if (!req.user) return next(new HttpError(401, 'Sign in required'));
  next();
}

/** CSRF defence in depth (cookie is already SameSite=Strict): state-changing requests must carry a custom header. */
export function csrfGuard(req, _res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.get('X-Synchronia') !== '1') return next(new HttpError(403, 'Missing request header'));
  next();
}

// Simple in-memory brute-force throttle: 8 failures per 15 minutes per IP.
const failures = new Map();
function throttle(ip) {
  const now = Date.now();
  const list = (failures.get(ip) || []).filter((t) => now - t < 15 * 60e3);
  failures.set(ip, list);
  if (list.length >= 8) throw new HttpError(429, 'Too many sign-in attempts. Try again in 15 minutes.');
  return () => list.push(now);
}

export function authRouter(db) {
  const r = Router();

  r.get('/state', (req, res) => {
    const userCount = db.prepare('SELECT COUNT(*) n FROM users').get().n;
    res.json({ setupRequired: userCount === 0, user: req.user || null });
  });

  // First-run: create the owner account. Disabled once any account exists.
  r.post('/setup', (req, res) => {
    const { email, password, full_name } = req.body || {};
    if (db.prepare('SELECT COUNT(*) n FROM users').get().n > 0) throw new HttpError(409, 'SYNCHRONIA is already initialised.');
    if (typeof email !== 'string' || !EMAIL_RE.test(email.trim())) throw new HttpError(422, 'Enter a valid email address.', { email: 'Invalid email' });
    checkPassword(password);
    const name = typeof full_name === 'string' ? full_name.trim().slice(0, 200) : '';
    const userId = tx(db, () => {
      const u = db.prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)').run(email.trim(), hashPassword(password));
      const id = Number(u.lastInsertRowid);
      db.prepare('INSERT INTO user_profiles (user_id) VALUES (?)').run(id);
      db.prepare('INSERT INTO professional_profiles (user_id, full_name, email) VALUES (?, ?, ?)').run(id, name || null, email.trim());
      indexProfile(db, id);
      audit(db, id, 'user', id, 'create', 'SYNCHRONIA initialised');
      return id;
    });
    startSession(db, res, userId);
    res.status(201).json({ user: { id: userId, email: email.trim() } });
  });

  r.post('/login', (req, res) => {
    const record = throttle(req.ip);
    const { email, password } = req.body || {};
    const user = typeof email === 'string' && db.prepare('SELECT * FROM users WHERE email = ?').get(email.trim());
    if (!user || typeof password !== 'string' || !verifyPassword(password, user.password_hash)) {
      record();
      throw new HttpError(401, 'Email or password is incorrect.');
    }
    db.prepare("DELETE FROM sessions WHERE expires_at <= strftime('%Y-%m-%dT%H:%M:%fZ','now')").run();
    startSession(db, res, user.id);
    audit(db, user.id, 'user', user.id, 'login', 'Signed in');
    res.json({ user: { id: user.id, email: user.email } });
  });

  r.post('/logout', (req, res) => {
    if (req.sessionHash) {
      db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(req.sessionHash);
      audit(db, req.user.id, 'user', req.user.id, 'logout', 'Signed out');
    }
    setSessionCookie(res, '', 0);
    res.json({ ok: true });
  });

  r.post('/password', requireAuth, (req, res) => {
    const { current_password, new_password } = req.body || {};
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    if (typeof current_password !== 'string' || !verifyPassword(current_password, user.password_hash)) {
      throw new HttpError(422, 'Current password is incorrect.', { current_password: 'Incorrect' });
    }
    checkPassword(new_password);
    tx(db, () => {
      db.prepare("UPDATE users SET password_hash = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?").run(hashPassword(new_password), user.id);
      db.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?').run(user.id, req.sessionHash);
      audit(db, user.id, 'user', user.id, 'settings', 'Password changed; other sessions signed out');
    });
    res.json({ ok: true });
  });

  return r;
}
