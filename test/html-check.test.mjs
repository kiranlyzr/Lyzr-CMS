import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { checkHtml, wrapHtmlBlock, unwrapHtmlBlock, replaceDataImages } from '../lib/html-check.js';
import { PAGES } from '../lib/pages.config.js';

const page = { name: 'Test', root: 'lyzr-x' };
const good = '<div id="lyzr-x"><style>#lyzr-x .a{color:red}@media (max-width:640px){#lyzr-x .a{color:blue}}</style><h1 class="a">Hello</h1><p>' + 'x'.repeat(200) + '</p></div>';

test('clean snippet passes', () => { const r = checkHtml(good, page); assert.deepEqual(r.errors, []); });
test('full document blocked', () => { assert.ok(checkHtml('<!doctype html><html><body>' + good + '</body></html>', page).errors.some((e) => e.id === 'document')); });
test('viewport meta blocked', () => { assert.ok(checkHtml('<meta name="viewport" content="x">' + good, page).errors.some((e) => e.id === 'viewport')); });
test('wrong page blocked', () => { assert.ok(checkHtml(good.replace(/lyzr-x/g, 'lyzr-y'), page).errors.some((e) => e.id === 'root')); });
test('global CSS blocked', () => { assert.ok(checkHtml(good.replace('</style>', 'body{margin:0}</style>'), page).errors.some((e) => e.id === 'css-global')); });
test('unscoped selector warned', () => { assert.ok(checkHtml(good.replace('</style>', '.btn{color:red}</style>'), page).warnings.some((e) => e.id === 'css-loose')); });
test('&& in script blocked', () => { assert.ok(checkHtml(good + '<script>if(a&&b){}</script>', page).errors.length > 0); });
test('http blocked', () => { assert.ok(checkHtml(good + '<img src="http://x.com/a.png" alt="">', page).errors.some((e) => e.id === 'mixed')); });
test('no media query warned', () => { assert.ok(checkHtml(good.replace(/@media[^{]*\{[^}]*\}\}/, ''), page).warnings.some((e) => e.id === 'responsive')); });
test('wrap/unwrap', () => { const w = wrapHtmlBlock(good); assert.ok(w.startsWith('<!-- wp:html -->')); assert.equal(unwrapHtmlBlock(w), good); assert.equal(wrapHtmlBlock(w), w); });
test('data images replaced', async () => {
  const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  const h = '<img src="data:image/png;base64,' + png + '"><img src="data:image/png;base64,' + png + '">';
  const r = await replaceDataImages(h, async () => 'https://www.lyzr.ai/u/a.png');
  assert.equal(r.uploaded, 1); assert.ok(!r.html.includes('base64'));
});
/* the three live pages (public rendered HTML, fetched into /tmp by the build session) */
for (const p of PAGES) {
  const f = '/tmp/p_' + p.id + '.json';
  test('live page ' + p.key, { skip: !existsSync(f) }, () => {
    const html = JSON.parse(readFileSync(f, 'utf8')).content.rendered;
    const r = checkHtml(html, p);
    console.log(p.key, 'ERRORS', JSON.stringify(r.errors.map((e) => e.id + ': ' + e.msg.slice(0, 100))), 'WARN', r.warnings.map((w) => w.id).join(','));
    const ids = r.errors.map((e) => e.id);
    if (p.key === 'sovereign-ai') assert.ok(ids.some((i) => i.indexOf('amp-') === 0), 'known && bug should be flagged');
    else assert.deepEqual(ids, []);
  });
}
