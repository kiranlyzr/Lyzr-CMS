/**
 * Checks an uploaded page file before it can be saved. Pure functions (no network), shared by the server and the tests.
 * Goal: HTML that drops into a WordPress page (Kadence theme + Elementor header/footer) without breaking the site and
 * stays responsive. Errors block the save; warnings are shown but allowed.
 */
export const MAX_BYTES = 1500000;      /* after embedded images have been moved to the media library */
export const WARN_BYTES = 600000;

function between(html, tag) {
  const out = []; const re = new RegExp('<' + tag + '\\b[^>]*>([\\s\\S]*?)</' + tag + '>', 'gi'); let m;
  while ((m = re.exec(html))) out.push(m[1]);
  return out;
}
function cssRules(css) {
  /* selector lists of every rule, including the ones inside @media/@supports; keyframe steps and at-rules are skipped */
  const sels = [];
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const re = /([^{};]+)\{/g; let m;
  while ((m = re.exec(clean))) {
    const s = m[1].trim();
    if (!s || s[0] === '@' || /^(from|to|\d+(\.\d+)?%)(\s*,\s*(from|to|\d+(\.\d+)?%))*$/i.test(s)) continue;
    s.split(',').forEach((x) => { x = x.trim(); if (x) sels.push(x); });
  }
  return sels;
}
export function dataImages(html) {
  const out = []; const re = /data:(image\/(?:png|jpe?g|webp|gif|avif|svg\+xml));base64,([A-Za-z0-9+/=]+)/g; let m;
  while ((m = re.exec(html))) out.push({ uri: m[0], mime: m[1], b64: m[2] });
  return out;
}

export function checkHtml(html, page, opts) {
  opts = opts || {};
  const errors = []; const warnings = [];
  const E = (id, msg) => errors.push({ id, msg });
  const W = (id, msg) => warnings.push({ id, msg });
  const text = String(html || '');
  const bytes = Buffer.byteLength(text, 'utf8');
  if (text.trim().length < 200) { E('empty', 'The file is empty or too short to be a page.'); return { errors, warnings, bytes }; }

  /* a full document would nest <html>/<body> inside the theme and break the layout */
  if (/<!doctype/i.test(text) || /<\/?(html|head|body)\b/i.test(text)) E('document', 'This is a full HTML document. Upload only the page snippet: remove the doctype, <html>, <head> and <body> tags (keep the <style>, the page markup and <script>).');
  if (/<meta[^>]+name=["']viewport/i.test(text)) E('viewport', 'Remove the <meta name="viewport"> tag: WordPress already sets it, and a second one is ignored or conflicts.');
  if (/<title\b/i.test(text)) W('title', 'Remove the <title> tag: the page title is set in WordPress and a second one is ignored.');
  if (/<link[^>]+rel=["']canonical/i.test(text)) W('canonical', 'Remove the canonical link: WordPress/Yoast already prints one and two canonicals confuse search engines.');

  /* the right page */
  if (page && page.root && text.indexOf('id="' + page.root + '"') < 0 && text.indexOf("id='" + page.root + "'") < 0) {
    E('root', 'This does not look like the ' + page.name + ' page: its outer element id="' + page.root + '" is missing. Check you picked the right card.');
  }

  /* WordPress rewrites "&&" and "<letter" in scripts, which silently breaks the script */
  const scripts = between(text, 'script');
  scripts.forEach((s, i) => {
    if (/&&|&#0?38;|&amp;&amp;/.test(s)) E('amp-' + i, 'Script ' + (i + 1) + ' contains "&&" (or &#038;). WordPress rewrites it and the script stops working. Use nested ifs or ?: instead of &&.');
    /* "<letter" inside JS: WordPress reads it as a tag. i<n is fine to write as "i < n" with spaces. */
    if (/[\w)\]]<[a-zA-Z]/.test(s)) W('lt-' + i, 'Script ' + (i + 1) + ' has "<" directly followed by a letter (e.g. i<n). Write it with spaces (i < n) so WordPress does not treat it as a tag.');
  });
  if (/<script[^>]+src=["']http:\/\//i.test(text) || /(?:src|href)=["']http:\/\/(?!www\.w3\.org)/i.test(text)) E('mixed', 'A link or image uses http:// instead of https://. Browsers block it on the https site.');

  /* CSS must stay inside the page's own wrapper, or it restyles the site header, footer and menus */
  const css = between(text, 'style').join('\n');
  const sels = cssRules(css);
  const root = page && page.root ? '#' + page.root : '';
  const leaks = []; const loose = [];
  sels.forEach((s) => {
    if (root && s.indexOf(root) === 0) return;                       /* scoped */
    if (/^(html|body|head|:root|\*)(?![\w-])/i.test(s)) leaks.push(s);  /* whole-site selector */
    else loose.push(s);                                               /* e.g. ".btn" or "h2" with no root in front */
  });
  if (leaks.length) E('css-global', 'CSS targets the whole site (' + leaks.slice(0, 4).join(' | ') + (leaks.length > 4 ? ' …' : '') + '). Prefix every selector with #' + (page ? page.root : 'your-root') + ' so it cannot change the header, footer or other pages.');
  if (loose.length) W('css-loose', loose.length + ' CSS selector' + (loose.length > 1 ? 's are' : ' is') + ' not prefixed with ' + (root || 'the root id') + ' (first: ' + loose[0].slice(0, 60) + '). They may leak into the site header/footer.');
  if (/<style[^>]*>[\s\S]*?<\/style>/i.test(text) === false && /<[a-z]/i.test(text)) W('no-style', 'No <style> block found. Is the CSS inline or missing?');

  /* responsive */
  const medias = (css.match(/@media[^{]*\{/g) || []).length;
  if (!medias) W('responsive', 'No @media rules found: the page may not adapt to tablet and phone widths. Check the Mobile preview.');
  else if (!/@media[^{]*(max|min)-width\s*:\s*(5\d\d|6\d\d|7\d\d|4\d\d)px/i.test(css)) W('responsive-phone', 'There are @media rules but none for phone widths (about 400-768px). Check the Mobile preview.');
  if (/\b(?:width|min-width)\s*:\s*(?:[1-9]\d{3,})px/i.test(css)) W('fixed-width', 'A fixed width of 1000px or more was found in the CSS. It can cause sideways scrolling on phones; prefer max-width.');
  if (/\b100vw\b/.test(css)) W('vw', '100vw is used: it includes the scrollbar and can cause a sideways scroll bar on desktop. Prefer width:100%.');
  if (/position\s*:\s*fixed/i.test(css)) W('fixed', 'position:fixed is used. It can sit under the site header (80px, fixed). Check it in the previews.');
  const imgs = text.match(/<img\b[^>]*>/gi) || [];
  const noAlt = imgs.filter((t) => !/\balt=/.test(t)).length;
  const noDim = imgs.filter((t) => !(/\bwidth=/.test(t) && /\bheight=/.test(t)) && !/aspect-ratio/.test(t)).length;
  if (noAlt) W('alt', noAlt + ' image' + (noAlt > 1 ? 's have' : ' has') + ' no alt text (accessibility and SEO).');
  if (noDim && imgs.length > 3) W('img-dim', noDim + ' of ' + imgs.length + ' images have no width and height, which makes the page jump while loading.');

  /* external scripts */
  const ext = (text.match(/<script[^>]+src=["'][^"']+["']/gi) || []).map((t) => (t.match(/src=["']([^"']+)/) || [])[1]);
  ext.forEach((u) => { if (!/^https:\/\/(www\.lyzr\.ai|cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|unpkg\.com|fonts\.googleapis\.com|www\.googletagmanager\.com)\//.test(u)) W('ext-script', 'External script from an unusual host: ' + u.slice(0, 80) + '. Make sure you trust it.'); });
  if (/<form\b/i.test(text)) W('form', 'The page contains a <form>. WordPress will not process it: make sure it posts to a working endpoint.');
  if (/<iframe\b/i.test(text)) W('iframe', 'The page contains an <iframe>. Check that the embedded site allows framing.');

  /* size and embedded images */
  const imgsData = dataImages(text);
  if (imgsData.length && !opts.afterUpload) W('embedded', imgsData.length + ' embedded image' + (imgsData.length > 1 ? 's' : '') + ' (' + Math.round(imgsData.reduce((a, i) => a + i.b64.length, 0) * 0.75 / 1024) + ' KB) will be uploaded to the media library and replaced with links when you publish.');
  if (bytes > MAX_BYTES) E('size', 'The page is ' + Math.round(bytes / 1024) + ' KB (limit ' + Math.round(MAX_BYTES / 1024) + ' KB). Move big images to the media library or compress them.');
  else if (bytes > WARN_BYTES && !imgsData.length) W('size', 'The page is ' + Math.round(bytes / 1024) + ' KB, which is heavy for page speed.');
  if (/\bTODO\b|\{\{[A-Z_]+\}\}|REPLACE_ME|lorem ipsum/i.test(text)) W('placeholder', 'Placeholder text found (TODO, {{…}}, REPLACE_ME or lorem ipsum).');
  return { errors, warnings, bytes };
}

/** WordPress must see the snippet as one raw HTML block, or wpautop injects <p>/<br> and breaks the layout */
export function wrapHtmlBlock(html) {
  const t = String(html || '').trim();
  if (/^<!-- wp:html -->/.test(t)) return t;
  return '<!-- wp:html -->\n' + t + '\n<!-- /wp:html -->';
}
export function unwrapHtmlBlock(raw) {
  return String(raw || '').replace(/^\s*<!-- wp:html -->\s*/, '').replace(/\s*<!-- \/wp:html -->\s*$/, '');
}

export function extFor(mime) { return { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif', 'image/svg+xml': 'svg' }[mime] || 'bin'; }

/** upload(buffer, mime, index) -> url ; replaces every base64 image with its media-library URL */
export async function replaceDataImages(html, upload) {
  const seen = new Map(); let out = html; let n = 0;
  for (const img of dataImages(html)) {
    if (seen.has(img.uri)) continue;
    const url = await upload(Buffer.from(img.b64, 'base64'), img.mime, n++);
    seen.set(img.uri, url);
  }
  seen.forEach((url, uri) => { out = out.split(uri).join(url); });
  return { html: out, uploaded: seen.size };
}
