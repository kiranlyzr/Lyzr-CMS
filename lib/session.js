/**
 * Session + users (same scheme as the other Lyzr CMSs).
 * CMS_USERS = email:salt:hash,...  (salt/hash base64url, scrypt N=32768 r=8 p=1, 32 bytes).
 * Session cookie = base64url(JSON) + "." + base64url(HMAC-SHA256). It carries the first 12 chars of the password hash,
 * so changing or removing a user in CMS_USERS ends their sessions at once.
 */
import { createHmac, timingSafeEqual, scrypt } from 'node:crypto';

export const COOKIE = 'cms_session';
export const SESSION_HOURS = 24;
export const SCRYPT = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

const b64url = (buf) => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export const fromB64url = (s) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

export function sign(payload, secret) {
  const body = b64url(JSON.stringify(payload));
  return body + '.' + b64url(createHmac('sha256', secret).update(body).digest());
}
export function verify(token, secret) {
  if (!token || !secret) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const want = createHmac('sha256', secret).update(parts[0]).digest();
  const got = fromB64url(parts[1]);
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  try {
    const p = JSON.parse(fromB64url(parts[0]).toString('utf8'));
    return p.exp && p.exp >= Math.floor(Date.now() / 1000) ? p : null;
  } catch (e) { return null; }
}
export function getCookie(req, name) {
  const parts = String(req.headers.cookie || '').split(';');
  for (const raw of parts) { const p = raw.trim(); if (p.indexOf(name + '=') === 0) return decodeURIComponent(p.slice(name.length + 1)); }
  return '';
}
export function cookieHeader(value, maxAge) {
  return COOKIE + '=' + encodeURIComponent(value) + '; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=' + maxAge;
}
export function parseUsers(env = process.env) {
  const out = {};
  String(env.CMS_USERS || '').split(',').forEach((entry) => {
    const p = entry.trim().split(':');
    if (p.length === 3 && p[0] && p[1] && p[2]) out[p[0].toLowerCase()] = { salt: p[1], hash: p[2] };
  });
  return out;
}
export function derive(password, salt) {
  return new Promise((resolve, reject) => scrypt(password, salt, 32, SCRYPT, (e, k) => (e ? reject(e) : resolve(k))));
}
/** the signed-in user, only while still listed in CMS_USERS with the same password; else null */
export function currentUser(req) {
  const p = verify(getCookie(req, COOKIE), process.env.SESSION_SECRET || '');
  if (!p || !p.email || !p.v) return null;
  const entry = parseUsers()[String(p.email).toLowerCase()];
  return entry && entry.hash.slice(0, 12) === p.v ? p : null;
}
