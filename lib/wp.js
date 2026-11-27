/**
 * The only code that talks to WordPress. The server decides every URL; the browser never supplies a path.
 * It talks to the "Lyzr CMS bridge" (wordpress/lyzr-cms-bridge.php, a WPCode snippet) with a secret key in the X-CMS-Key header:
 * normal WordPress logins (application passwords) are ignored by this site, and the bridge can only reach the 3 pages in pages.config.js.
 * Secrets (never in the browser or the repo): WP_URL, WP_CMS_KEY.
 */
import { appendFileSync } from 'node:fs';
import { pageById, PAGES } from './pages.config.js';

const MOCK = process.env.DEV_MOCK === '1' && !process.env.K_SERVICE && !process.env.VERCEL && process.env.NODE_ENV !== 'production';
const mem = new Map();          /* mock mode: page id -> saved content */
const memStatus = new Map();    /* mock mode: page id -> status */
export const isMock = MOCK;

function record(kind, data) { try { appendFileSync('mock-writes.jsonl', JSON.stringify({ at: new Date().toISOString(), kind, ...data }) + '\n'); } catch (e) { /* read-only disk */ } }
function need(id) { const p = pageById(id); if (!p) { const e = new Error('Page not allowed'); e.status = 403; throw e; } return p; }
const base = () => String(process.env.WP_URL || (MOCK ? 'https://www.lyzr.ai' : '')).replace(/\/$/, '');

async function bridge(path, init) {
  const url = base(); const key = process.env.WP_CMS_KEY || '';
  if (!url) throw new Error('WP_URL is not set on the server');
  if (!key) throw new Error('WP_CMS_KEY is not set on the server');
  const res = await fetch(url + '/wp-json/lyzr-cms/v1' + path, Object.assign({}, init, { headers: Object.assign({ 'X-CMS-Key': key }, init && init.headers), signal: AbortSignal.timeout(110000) }));
  const text = await res.text();
  let body; try { body = JSON.parse(text); } catch (e) { body = { raw: text.slice(0, 200) }; }
  if (!res.ok) {
    const err = new Error(body && body.code === 'rest_no_route' ? 'The WordPress bridge snippet is not installed or not active.' : ((body && body.message) || 'WordPress returned ' + res.status));
    err.status = res.status; err.code = body && body.code; err.bridge = true; throw err;
  }
  return body;
}

async function publicPage(id) { /* mock mode only: the public REST API (no login) */
  const r = await fetch(base() + '/wp-json/wp/v2/pages/' + id + '?_fields=id,slug,status,link,modified,title,content', { signal: AbortSignal.timeout(60000) });
  if (!r.ok) throw new Error('WordPress returned ' + r.status);
  return r.json();
}

export async function listSummaries() {
  if (MOCK) return Promise.all(PAGES.map(async (p) => {
    try { const d = await publicPage(p.id); return { id: p.id, key: p.key, name: p.name, slug: d.slug, status: memStatus.get(p.id) || d.status, link: d.link, modified: d.modified }; }
    catch (e) { return { id: p.id, key: p.key, name: p.name, slug: p.slug, error: e.message }; }
  }));
  try {
    const d = await bridge('/pages');
    return PAGES.map((p) => { const w = d.pages.filter((x) => x.id === p.id)[0]; return w ? { id: p.id, key: p.key, name: p.name, slug: w.slug, status: w.status, link: w.link, modified: w.modified } : { id: p.id, key: p.key, name: p.name, slug: p.slug, error: 'Page not found in WordPress' }; });
  } catch (e) { return PAGES.map((p) => ({ id: p.id, key: p.key, name: p.name, slug: p.slug, error: e.message })); }
}

export async function getPage(id) {
  const p = need(id);
  if (MOCK) {
    const pub = await publicPage(p.id);
    const raw = mem.has(p.id) ? mem.get(p.id) : '<!-- wp:html -->\n' + pub.content.rendered.replace(/<p class="wp-block-paragraph"><\/p>\s*$/, '').trim() + '\n<!-- /wp:html -->';
    return { id: p.id, slug: pub.slug, status: memStatus.get(p.id) || pub.status, link: pub.link, modified: pub.modified, title: pub.title.rendered, raw };
  }
  const d = await bridge('/pages/' + p.id);
  return { id: d.id, slug: d.slug, status: d.status, link: d.link, modified: d.modified, title: d.title || p.name, raw: d.content };
}

/** only the content is sent: title, slug, template and status are never changed by this call */
export async function updateContent(id, content) {
  const p = need(id);
  if (MOCK) { mem.set(p.id, content); record('update-page', { id: p.id, bytes: content.length }); return { id: p.id, modified: new Date().toISOString() }; }
  const d = await bridge('/pages/' + p.id + '/content', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content }) });
  return { id: d.id, modified: d.modified };
}

/** only 'publish' and 'draft' are accepted; nothing else (trash, private, scheduled) can be set from here */
export async function setStatus(id, status) {
  const p = need(id);
  if (status !== 'draft' && status !== 'publish') { const e = new Error('Status must be draft or publish'); e.status = 400; throw e; }
  if (MOCK) { memStatus.set(p.id, status); record('set-status', { id: p.id, status }); return { id: p.id, status, modified: new Date().toISOString() }; }
  const d = await bridge('/pages/' + p.id + '/status', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
  return { id: d.id, status: d.status, modified: d.modified };
}

export async function listRevisions(id) {
  const p = need(id);
  if (MOCK) return [];
  const d = await bridge('/pages/' + p.id + '/revisions');
  return d.revisions.map((r) => ({ id: r.id, date: r.date }));
}
export async function getRevision(id, revId) {
  const p = need(id);
  if (!/^\d+$/.test(String(revId))) { const e = new Error('Bad revision'); e.status = 400; throw e; }
  if (MOCK) { const e = new Error('No revisions in test mode'); e.status = 404; throw e; }
  const d = await bridge('/pages/' + p.id + '/revisions/' + revId);
  return { id: d.id, date: d.date, raw: d.content };
}
export async function uploadMedia(buffer, filename, mime) {
  if (MOCK) { record('upload', { filename, bytes: buffer.length }); return 'https://www.lyzr.ai/wp-content/uploads/mock/' + filename; }
  const d = await bridge('/media', { method: 'POST', headers: { 'Content-Type': mime, 'X-Filename': filename.replace(/[^a-zA-Z0-9._-]/g, '') }, body: buffer });
  return d.source_url;
}
