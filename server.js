/**
 * Lyzr Product Pages CMS: edit and publish the 3 product pages (Open Finetuner, Sovereign AI, Open Cowork) as HTML.
 * Express server for Alpha (Cloud Run): `npm start`, listens on $PORT. Secrets: WP_URL, WP_USER, WP_PASS, SESSION_SECRET, CMS_USERS.
 *   DEV_MOCK=1 npm run dev  -> local test mode: reads the public site, never writes to WordPress, no login.
 */
import express from 'express';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createHash, timingSafeEqual } from 'node:crypto';
import { COOKIE, SESSION_HOURS, sign, cookieHeader, parseUsers, derive, fromB64url, currentUser } from './lib/session.js';
import { PAGES, pageById } from './lib/pages.config.js';
import { checkHtml, wrapHtmlBlock, unwrapHtmlBlock, replaceDataImages, extFor } from './lib/html-check.js';
import * as wp from './lib/wp.js';

const dir = fileURLToPath(new URL('.', import.meta.url));
const read = (f) => readFileSync(dir + 'views/' + f, 'utf8');
const LOGIN_HTML = read('login.html');
const APP_HTML = read('app.html');
const APP_JS = read('app.js');
const DEV = wp.isMock;            /* local test mode: no login, no writes */

const SECURITY = {
  'Content-Security-Policy': "default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com data:; img-src https: data: blob:; media-src https: blob:; connect-src 'self'; frame-src 'self' blob:; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; object-src 'none'",
  'X-Frame-Options': 'DENY', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  'Cross-Origin-Opener-Policy': 'same-origin', 'X-Robots-Tag': 'noindex, nofollow', 'Cache-Control': 'no-store'
};

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', true);
app.use((req, res, next) => { Object.keys(SECURITY).forEach((k) => res.setHeader(k, SECURITY[k])); next(); });
app.use(express.json({ limit: '30mb' }));

const user = (req) => (DEV ? { email: 'dev@local' } : currentUser(req));
function guard(req, res, next) {
  const u = user(req);
  if (!u) return res.status(401).json({ error: 'Unauthorized' });
  if (req.method !== 'GET' && req.headers['x-requested-with'] !== 'cms') return res.status(403).json({ error: 'Forbidden' });
  req.u = u; next();
}
const audit = (req, what, extra) => console.log('cms-audit', JSON.stringify(Object.assign({ who: req.u.email, what }, extra || {})));

/* ---------- sign-in ---------- */
const fails = new Map(); const MAX_FAILS = 5; const LOCK_MS = 15 * 60 * 1000;
const DUMMY_SALT = Buffer.from('lyzr-cms-dummy-salt-0123456789ab');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const locked = (k) => { const f = fails.get(k); if (!f) return false; if (Date.now() - f.first > LOCK_MS) { fails.delete(k); return false; } return f.n >= MAX_FAILS; };
const addFail = (k) => { const f = fails.get(k); if (!f || Date.now() - f.first > LOCK_MS) fails.set(k, { n: 1, first: Date.now() }); else f.n++; if (fails.size > 5000) fails.clear(); };

app.post('/auth/login', async (req, res) => {
  const host = req.headers.host || ''; const origin = req.headers.origin || ''; const site = req.headers['sec-fetch-site'] || '';
  if (origin && origin !== 'https://' + host && origin.indexOf('http://localhost') !== 0) return res.status(403).json({ error: 'Forbidden' });
  if (site && site !== 'same-origin' && site !== 'none') return res.status(403).json({ error: 'Forbidden' });
  if (req.headers['x-requested-with'] !== 'cms') return res.status(403).json({ error: 'Forbidden' });
  const secret = process.env.SESSION_SECRET || ''; const users = parseUsers();
  if (!secret || !Object.keys(users).length) return res.status(500).json({ error: 'Sign-in is not set up on the server yet.' });
  const b = req.body || {};
  const email = typeof b.email === 'string' ? b.email.trim().toLowerCase() : ''; const password = typeof b.password === 'string' ? b.password : '';
  if (!email || !password || email.length > 254 || password.length > 200) { await sleep(400); return res.status(400).json({ error: 'Enter your email and password.' }); }
  const ip = String(req.ip || '');
  const kA = 'e:' + email, kB = 'i:' + ip + ':' + email;
  if (locked(kA) || locked(kB)) { await sleep(600); return res.status(429).json({ error: 'Too many attempts. Try again in 15 minutes.' }); }
  const entry = users[email];
  const derived = await derive(password.normalize('NFKC'), entry ? fromB64url(entry.salt) : DUMMY_SALT);
  const stored = entry ? fromB64url(entry.hash) : Buffer.alloc(32);
  const ok = !!entry && stored.length === derived.length && timingSafeEqual(stored, derived);
  if (!ok) { addFail(kA); addFail(kB); console.log('cms-login-fail', JSON.stringify({ known: !!entry, ip })); await sleep(500 + Math.floor(Math.random() * 400)); return res.status(401).json({ error: 'Incorrect email or password.' }); }
  fails.delete(kA); fails.delete(kB);
  const token = sign({ email, exp: Math.floor(Date.now() / 1000) + SESSION_HOURS * 3600, v: entry.hash.slice(0, 12) }, secret);
  console.log('cms-login', JSON.stringify({ email, ip }));
  res.setHeader('Set-Cookie', cookieHeader(token, SESSION_HOURS * 3600));
  res.json({ ok: true });
});
app.post('/auth/logout', (req, res) => { res.setHeader('Set-Cookie', cookieHeader('', 0)); res.json({ ok: true }); });
app.get('/auth/me', (req, res) => { const u = user(req); if (!u) return res.status(401).json({ error: 'Unauthorized' }); res.json({ email: u.email, test: DEV }); });

/* ---------- pages (login page for visitors; the editor only after sign-in) ---------- */
app.get('/health', (req, res) => res.type('text/plain').send('ok'));
app.get('/', (req, res) => res.type('html').send(user(req) ? APP_HTML : LOGIN_HTML));
app.get('/app.js', (req, res) => { if (!user(req)) return res.status(404).type('text/plain').send('Not found'); res.type('js').send(APP_JS); });

/* ---------- API ---------- */
function getTarget(req, res) { const p = pageById(req.params.id); if (!p) { res.status(404).json({ error: 'Unknown page' }); return null; } return p; }
const fail = (res, e) => { console.error('cms-error', e.message); res.status(e.status && e.status >= 400 && e.status < 600 ? (e.status === 401 || e.status === 403 ? 502 : e.status) : 502).json({ error: e.status === 401 || e.status === 403 ? 'WordPress refused the request. Check that the bridge snippet has the current key (ask the admin).' : e.message }); };

app.get('/api/pages', guard, async (req, res) => {
  try { res.json({ pages: await wp.listSummaries() }); } catch (e) { fail(res, e); }
});
app.get('/api/pages/:id', guard, async (req, res) => {
  const p = getTarget(req, res); if (!p) return;
  try { const d = await wp.getPage(p.id); res.json({ id: p.id, name: p.name, root: p.root, status: d.status, link: d.link, modified: d.modified, html: unwrapHtmlBlock(d.raw) }); audit(req, 'open', { id: p.id }); } catch (e) { fail(res, e); }
});
app.get('/api/pages/:id/download', guard, async (req, res) => {
  const p = getTarget(req, res); if (!p) return;
  try { const d = await wp.getPage(p.id); res.setHeader('Content-Disposition', 'attachment; filename="' + p.key + '.html"'); res.type('text/html; charset=utf-8').send(unwrapHtmlBlock(d.raw)); audit(req, 'download', { id: p.id }); } catch (e) { fail(res, e); }
});
app.post('/api/pages/:id/check', guard, (req, res) => {
  const p = getTarget(req, res); if (!p) return;
  const html = req.body && typeof req.body.html === 'string' ? req.body.html : '';
  res.json(checkHtml(html, p));
});
app.post('/api/pages/:id/publish', guard, async (req, res) => {
  const p = getTarget(req, res); if (!p) return;
  const html = req.body && typeof req.body.html === 'string' ? req.body.html : '';
  const baseModified = req.body && req.body.modified;
  try {
    /* checked again here: the browser's check is never trusted */
    const first = checkHtml(html, p);
    if (first.errors.length) return res.status(422).json({ error: 'The file has problems that must be fixed first.', errors: first.errors, warnings: first.warnings });
    const cur = await wp.getPage(p.id);
    if (baseModified && cur.modified !== baseModified) return res.status(409).json({ error: 'Someone else changed this page after you opened it. Reload the page in the CMS, then upload again.' });
    const up = await replaceDataImages(html, (buf, mime) => wp.uploadMedia(buf, p.key + '-' + createHash('sha1').update(buf).digest('hex').slice(0, 10) + '.' + extFor(mime), mime));
    const second = checkHtml(up.html, p, { afterUpload: true });
    if (second.errors.length) return res.status(422).json({ error: 'The file has problems that must be fixed first.', errors: second.errors, warnings: second.warnings });
    const out = await wp.updateContent(p.id, wrapHtmlBlock(up.html));
    audit(req, 'publish', { id: p.id, bytes: Buffer.byteLength(up.html), images: up.uploaded });
    res.json({ ok: true, modified: out.modified, uploadedImages: up.uploaded, warnings: second.warnings, link: cur.link });
  } catch (e) { fail(res, e); }
});
app.post('/api/pages/:id/status', guard, async (req, res) => {
  const p = getTarget(req, res); if (!p) return;
  const status = req.body && req.body.status;
  if (status !== 'draft' && status !== 'publish') return res.status(400).json({ error: 'Status must be draft or publish' });
  try {
    if (status === 'publish') {                       /* going live: the saved HTML must still pass the checks */
      const cur = await wp.getPage(p.id);
      const chk = checkHtml(unwrapHtmlBlock(cur.raw), p, { afterUpload: true });
      if (chk.errors.length) return res.status(422).json({ error: 'The saved HTML has problems, so the page was not set live: ' + chk.errors[0].msg });
    }
    const out = await wp.setStatus(p.id, status);
    audit(req, status === 'draft' ? 'to-draft' : 'set-live', { id: p.id });
    res.json({ ok: true, status: out.status, modified: out.modified });
  } catch (e) { fail(res, e); }
});
app.get('/api/pages/:id/revisions', guard, async (req, res) => {
  const p = getTarget(req, res); if (!p) return;
  try { res.json({ revisions: await wp.listRevisions(p.id) }); } catch (e) { fail(res, e); }
});
app.post('/api/pages/:id/restore', guard, async (req, res) => {
  const p = getTarget(req, res); if (!p) return;
  try {
    const rev = await wp.getRevision(p.id, req.body && req.body.revisionId);
    const out = await wp.updateContent(p.id, rev.raw);     /* WordPress keeps the version being replaced as a new revision */
    audit(req, 'restore', { id: p.id, revision: rev.id });
    res.json({ ok: true, modified: out.modified });
  } catch (e) { fail(res, e); }
});

app.use((req, res) => res.status(404).type('text/plain').send('Not found'));
app.use((err, req, res, next) => { console.error('cms-error', err.message); res.status(err.status || 500).json({ error: err.type === 'entity.too.large' ? 'The file is too large (limit 30 MB).' : 'Server error' }); });

/* Vercel imports the app (api/index.js); Alpha / local run it as a normal server */
if (!process.env.VERCEL) {
  const port = Number(process.env.PORT || 8081);
  app.listen(port, '0.0.0.0', () => console.log('Product Pages CMS on :' + port + (DEV ? ' (TEST MODE: no login, no writes)' : '')));
}
export default app;
