/* Exercises lib/wp.js against a small fake of the WordPress bridge (same routes and rules as lyzr-cms-bridge.php). */
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

const KEY = 'test-key-123';
const pages = { 153241: { slug: 'open-finetuner', status: 'publish', content: 'A'.repeat(80), modified: '2026-11-13T17:40:39' }, 130050: { slug: 'sovereign-ai', status: 'publish', content: 'B'.repeat(80), modified: '2026-11-05T19:40:12' }, 154655: { slug: 'open-cowork', status: 'publish', content: 'C'.repeat(80), modified: '2026-11-13T14:15:55' } };
const revs = { 154655: [] };
let n = 0; const uploads = [];
const server = http.createServer((req, res) => {
  const chunks = []; req.on('data', (c) => chunks.push(c)); req.on('end', () => {
    const body = Buffer.concat(chunks);
    const send = (code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
    const u = new URL(req.url, 'http://x'); const path = u.pathname.replace('/wp-json/lyzr-cms/v1', '');
    if (req.headers['x-cms-key'] !== KEY) return send(403, { code: 'lyzr_cms_forbidden', message: 'Forbidden' });
    let m;
    if (path === '/pages') return send(200, { pages: Object.entries(pages).map(([id, p]) => ({ id: +id, slug: p.slug, status: p.status, link: 'https://x/' + p.slug + '/', modified: p.modified, title: p.slug })) });
    if ((m = path.match(/^\/pages\/(\d+)(\/.*)?$/))) {
      const id = +m[1]; const p = pages[id]; const sub = m[2] || '';
      if (!p) return send(403, { code: 'lyzr_cms_page', message: 'Page not allowed' });
      if (req.method === 'GET' && sub === '') return send(200, { id, slug: p.slug, status: p.status, link: 'https://x/', modified: p.modified, title: p.slug, content: p.content });
      if (req.method === 'POST' && sub === '/content') { revs[id] = revs[id] || []; revs[id].unshift({ id: 900 + (++n), date: p.modified, content: p.content }); p.content = JSON.parse(body).content; p.modified = '2026-11-27T10:00:0' + n; return send(200, { id, modified: p.modified }); }
      if (req.method === 'POST' && sub === '/status') { const s = JSON.parse(body).status; if (s !== 'draft' && s !== 'publish') return send(400, { message: 'bad' }); p.status = s; return send(200, { id, status: s, modified: p.modified }); }
      if (sub === '/revisions') return send(200, { revisions: (revs[id] || []).map((r) => ({ id: r.id, date: r.date })) });
      if ((m = sub.match(/^\/revisions\/(\d+)$/))) { const r = (revs[id] || []).filter((x) => x.id === +m[1])[0]; return r ? send(200, { id: r.id, date: r.date, content: r.content }) : send(404, { message: 'Revision not found' }); }
    }
    if (path === '/media' && req.method === 'POST') { uploads.push({ type: req.headers['content-type'], name: req.headers['x-filename'], bytes: body.length }); return send(200, { id: 1, source_url: 'https://x/wp-content/uploads/' + req.headers['x-filename'] }); }
    send(404, { code: 'rest_no_route', message: 'No route' });
  });
});
await new Promise((r) => server.listen(0, r));
process.env.WP_URL = 'http://localhost:' + server.address().port;
const wp = await import('../lib/wp.js');

test('wrong key is refused', async () => { process.env.WP_CMS_KEY = 'nope'; await assert.rejects(wp.listSummaries().then((l) => { assert.ok(l[0].error); throw new Error('refused'); }), /refused/); });
test('lists the 3 pages', async () => { process.env.WP_CMS_KEY = KEY; const l = await wp.listSummaries(); assert.equal(l.length, 3); assert.equal(l[2].status, 'publish'); assert.ok(!l.some((x) => x.error)); });
test('reads a page', async () => { const d = await wp.getPage(154655); assert.equal(d.raw, 'C'.repeat(80)); assert.equal(d.slug, 'open-cowork'); });
test('page outside the list is refused before any request', async () => { await assert.rejects(wp.getPage(1), /not allowed/); await assert.rejects(wp.updateContent(1, 'x'), /not allowed/); });
test('saves content, creates a revision, restores it', async () => {
  await wp.updateContent(154655, 'NEW'.repeat(30));
  assert.equal((await wp.getPage(154655)).raw, 'NEW'.repeat(30));
  const r = await wp.listRevisions(154655); assert.equal(r.length, 1);
  const old = await wp.getRevision(154655, r[0].id); assert.equal(old.raw, 'C'.repeat(80));
  await wp.updateContent(154655, old.raw); assert.equal((await wp.getPage(154655)).raw, 'C'.repeat(80));
});
test('status: only draft/publish', async () => { assert.equal((await wp.setStatus(154655, 'draft')).status, 'draft'); assert.equal((await wp.listSummaries())[2].status, 'draft'); await assert.rejects(wp.setStatus(154655, 'trash'), /draft or publish/); await wp.setStatus(154655, 'publish'); });
test('uploads an image', async () => { const url = await wp.uploadMedia(Buffer.from('abc'), 'open-cowork-1.png', 'image/png'); assert.match(url, /open-cowork-1\.png$/); assert.equal(uploads[0].type, 'image/png'); });
test('missing bridge gives a clear message', async () => { process.env.WP_URL = 'http://localhost:' + server.address().port + '/nope'; const l = await wp.listSummaries(); assert.ok(l[0].error); process.env.WP_URL = 'http://localhost:' + server.address().port; });
test.after(() => server.close());
