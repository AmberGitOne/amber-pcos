/* ============================================================================
 * auth.js — password hashing (scrypt) + JWT (HMAC-SHA256), Node built-ins only
 * ==========================================================================*/
'use strict';
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

// Persistent signing secret. Prefer an env var (stable across serverless
// instances); otherwise store/generate it in a writable folder.
const SECRET_DIR = process.env.VERCEL ? path.join('/tmp', 'amber-data') : path.join(__dirname, 'data');
const SECRET_FILE = path.join(SECRET_DIR, '.secret');
function getSecret() {
  if (process.env.AMBER_SECRET) return process.env.AMBER_SECRET;
  try { return fs.readFileSync(SECRET_FILE, 'utf8'); }
  catch {
    fs.mkdirSync(path.dirname(SECRET_FILE), { recursive: true });
    const s = crypto.randomBytes(48).toString('hex');
    fs.writeFileSync(SECRET_FILE, s, { mode: 0o600 });
    return s;
  }
}
const SECRET = getSecret();

// ---- passwords ------------------------------------------------------------
function hashPw(pw) {
  const salt = crypto.randomBytes(16);
  const dk = crypto.scryptSync(String(pw), salt, 64);
  return salt.toString('hex') + ':' + dk.toString('hex');
}
function verifyPw(pw, stored) {
  try {
    const [s, h] = String(stored).split(':');
    const dk = crypto.scryptSync(String(pw), Buffer.from(s, 'hex'), 64);
    return crypto.timingSafeEqual(dk, Buffer.from(h, 'hex'));
  } catch { return false; }
}
// async variants — scrypt is CPU-heavy; these keep the event loop free under load
function hashPwAsync(pw) {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16);
    crypto.scrypt(String(pw), salt, 64, (e, dk) => e ? reject(e) : resolve(salt.toString('hex') + ':' + dk.toString('hex')));
  });
}
function verifyPwAsync(pw, stored) {
  return new Promise((resolve) => {
    try {
      const [s, h] = String(stored).split(':');
      crypto.scrypt(String(pw), Buffer.from(s, 'hex'), 64, (e, dk) => {
        if (e) return resolve(false);
        try { resolve(crypto.timingSafeEqual(dk, Buffer.from(h, 'hex'))); } catch { resolve(false); }
      });
    } catch { resolve(false); }
  });
}

// ---- JWT (HS256) ----------------------------------------------------------
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
function signToken(payload, ttlMs = 1000 * 60 * 60 * 12) {
  const body = { ...payload, exp: Date.now() + ttlMs };
  const head = b64({ alg: 'HS256', typ: 'JWT' });
  const data = head + '.' + b64(body);
  const sig = crypto.createHmac('sha256', SECRET).update(data).digest('base64url');
  return data + '.' + sig;
}
function verifyToken(token) {
  try {
    const [h, b, s] = String(token).split('.');
    if (!h || !b || !s) return null;
    const expected = crypto.createHmac('sha256', SECRET).update(h + '.' + b).digest('base64url');
    const a = Buffer.from(s), e = Buffer.from(expected);
    if (a.length !== e.length || !crypto.timingSafeEqual(a, e)) return null;
    const payload = JSON.parse(Buffer.from(b, 'base64url').toString());
    if (payload.exp && Date.now() > payload.exp) return null;
    return payload;
  } catch { return null; }
}

module.exports = { hashPw, verifyPw, hashPwAsync, verifyPwAsync, signToken, verifyToken };
