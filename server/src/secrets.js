import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from './config.js';

// AES-256-GCM for sensitive fields (e.g. licence registration numbers).
// The key lives in data/secret.key (mode 0600) or SYNCHRONIA_SECRET_KEY (64 hex chars).
let cachedKey;
function key() {
  if (cachedKey) return cachedKey;
  if (process.env.SYNCHRONIA_SECRET_KEY) {
    cachedKey = Buffer.from(process.env.SYNCHRONIA_SECRET_KEY, 'hex');
  } else {
    const file = path.join(DATA_DIR, 'secret.key');
    if (fs.existsSync(file)) {
      cachedKey = Buffer.from(fs.readFileSync(file, 'utf8').trim(), 'hex');
    } else {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      cachedKey = crypto.randomBytes(32);
      fs.writeFileSync(file, cachedKey.toString('hex'), { mode: 0o600 });
    }
  }
  if (cachedKey.length !== 32) throw new Error('Encryption key must be 32 bytes (64 hex characters).');
  return cachedKey;
}

export function encrypt(plain) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const body = Buffer.concat([c.update(String(plain), 'utf8'), c.final()]);
  return ['v1', iv.toString('base64'), c.getAuthTag().toString('base64'), body.toString('base64')].join(':');
}

export function decrypt(token) {
  if (!token) return null;
  const [v, iv, tag, body] = token.split(':');
  if (v !== 'v1') throw new Error('Unknown ciphertext version');
  const d = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64'));
  d.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([d.update(Buffer.from(body, 'base64')), d.final()]).toString('utf8');
}

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };
export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export function verifyPassword(password, stored) {
  const [alg, N, r, p, salt, hash] = String(stored).split('$');
  if (alg !== 'scrypt') return false;
  const expected = Buffer.from(hash, 'base64');
  const actual = crypto.scryptSync(password, Buffer.from(salt, 'base64'), expected.length, { N: +N, r: +r, p: +p });
  return crypto.timingSafeEqual(expected, actual);
}

export const randomToken = () => crypto.randomBytes(32).toString('base64url');
export const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
