/**
 * The only code that talks to WordPress. The server decides every URL; the browser never supplies a path.
 * Allowed: read/update the pages in pages.config.js (content only, never title/slug/template/delete),
 * list/read their revisions, upload media. Credentials come from env vars (WP_URL, WP_USER, WP_PASS) and never leave the server.
 */
import { writeFileSync, appendFileSync } from 'node:fs';
import { pageById } from './pages.config.js';

const MOCK = process.env.DEV_MOCK === '1' && !process.env.K_SERVICE && process.env.NODE_ENV !== 'production';
const mem = new Map();    /* mock mode: page id -> latest saved content */
const memStatus = new Map();   /* mock mode: page id -> status */
let mediaN = 0;

function conf() {
  const url = String(process.env.WP_URL || (MOCK ? 'https://www.lyzr.ai' : '')).replace(/\/$/, '');
  return { url, auth: 'Basic ' + Buffer.from((process.env.WP_USER || '') + ':' + (process.env.WP_PASS || '')).toString('base64'), ok: !!(url && process.env.WP_USER && process.env.WP_PASS) };
}
function record(kind, data) { try { appendFileSync('mock-writes.jsonl', JSON.stringify({ at: new Date().toISOString(), kind, ...data }) + '\n'); } catch (e) {} }

async function call(path, init, authed) {
  const c = conf();
  if (!c.url) throw new Error('WP_URL not set');
  const headers = Object.assign({}, init && init.headers);
  if (authed) { if (!c.ok) throw new Error('WordPress credentials are not set on the server'); headers.Authorization = c.auth; }
  const res = await fetch(c.url + '/wp-json' + path, Object.assign({}, init, { headers, signal: AbortSignal.timeout(120000) }));
  const buf = Buffer.from(await res.arrayBuffer());
  let body; try { body = JSON.parse(buf.toString('utf8')); } catch (e) { body = { raw: buf.toString('utf8').slice(0, 300) }; }
  if (!res.ok) { const err = new Error((body && body.message) || ('WordPress returned ' + res.status)); err.status = res.status; err.code = body && body.code; throw err; }
  return body;
}
function need(id) { const p = pageById(id); if (!p) { const e = new Error('Page not allowed'); e.status = 403; throw e; } return p; }

export const isMock = MOCK;

export async function getPage(id) {
  const p = need(id);
  if (MOCK) {
    const pub = await call('/wp/v2/pages/' + p.id + '?_fields=id,slug,status,link,modified,title,content', {}, false);
    const raw = mem.has(p.id) ? mem.get(p.id) : '<!-- wp:html -->\n' + pub.content.rendered.replace(/<p class="wp-block-paragraph"><\/p>\s*$/, '').trim() + '\n<!-- /wp:html -->';
    return { id: p.id, slug: pub.slug, status: memStatus.get(p.id) || pub.status, link: pub.link, modified: pub.modified, title: pub.title.rendered, raw };
  }
  const d = await call('/wp/v2/pages/' + p.id + '?context=edit&_fields=id,slug,status,link,modified,title,content', {}, true);
  return { id: d.id, slug: d.slug, status: d.status, link: d.link, modified: d.modified, title: (d.title && (d.title.raw || d.title.rendered)) || p.name, raw: d.content.raw };
}
export async function getSummary(id) {
  const p = need(id);
  if (!MOCK) {
    const e = await call('/wp/v2/pages/' + p.id + '?context=edit&_fields=id,slug,status,link,modified', {}, true);
    return { id: p.id, key: p.key, name: p.name, slug: e.slug, status: e.status, link: e.link, modified: e.modified };
  }
  const d = await call('/wp/v2/pages/' + p.id + '?_fields=id,slug,status,link,modified,title', {}, false);
  if (!d.status || d.status !== 'publish') { /* a draft page is hidden from the public API: ask with the CMS login */
    try { const e = await call('/wp/v2/pages/' + p.id + '?context=edit&_fields=id,slug,status,link,modified', {}, true); return { id: p.id, key: p.key, name: p.name, slug: e.slug, status: e.status, link: e.link, modified: e.modified }; } catch (x) { /* fall through */ }
  }
  return { id: p.id, key: p.key, name: p.name, slug: d.slug, status: memStatus.get(p.id) || d.status, link: d.link, modified: d.modified };
}
export async function updateContent(id, content) {
  const p = need(id);
  if (MOCK) { mem.set(p.id, content); record('update-page', { id: p.id, bytes: content.length }); return { id: p.id, modified: new Date().toISOString() }; }
  /* only the content is sent: title, slug, template, status and parent are never changed from here */
  const d = await call('/wp/v2/pages/' + p.id, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content }) }, true);
  return { id: d.id, modified: d.modified };
}
/** only 'publish' and 'draft' are accepted; nothing else (trash, private, scheduled) can be set from here */
export async function setStatus(id, status) {
  const p = need(id);
  if (status !== 'draft' && status !== 'publish') { const e = new Error('Status must be draft or publish'); e.status = 400; throw e; }
  if (MOCK) { memStatus.set(p.id, status); record('set-status', { id: p.id, status }); return { id: p.id, status, modified: new Date().toISOString() }; }
  const d = await call('/wp/v2/pages/' + p.id, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) }, true);
  return { id: d.id, status: d.status, modified: d.modified };
}
export async function listRevisions(id) {
  const p = need(id);
  if (MOCK) return [];
  const d = await call('/wp/v2/pages/' + p.id + '/revisions?per_page=15&_fields=id,date,modified,author', {}, true);
  return d.map((r) => ({ id: r.id, date: r.modified || r.date }));
}
export async function getRevision(id, revId) {
  const p = need(id);
  if (!/^\d+$/.test(String(revId))) { const e = new Error('Bad revision'); e.status = 400; throw e; }
  if (MOCK) { const e = new Error('No revisions in test mode'); e.status = 404; throw e; }
  const d = await call('/wp/v2/pages/' + p.id + '/revisions/' + revId + '?context=edit&_fields=id,date,content', {}, true);
  return { id: d.id, date: d.date, raw: d.content.raw };
}
export async function uploadMedia(buffer, filename, mime) {
  if (MOCK) { record('upload', { filename, bytes: buffer.length }); mediaN++; return 'https://www.lyzr.ai/wp-content/uploads/mock/' + filename; }
  const d = await call('/wp/v2/media', { method: 'POST', headers: { 'Content-Type': mime, 'Content-Disposition': 'attachment; filename="' + filename.replace(/[^a-zA-Z0-9._-]/g, '') + '"' }, body: buffer }, true);
  return d.source_url;
}
