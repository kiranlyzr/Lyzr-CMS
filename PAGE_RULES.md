# Rules for the page HTML (give this file to Claude when you make or change a page)

The CMS saves your file as ONE raw HTML block inside a WordPress page (Kadence theme; the site header and footer are Elementor). The CMS checks these rules and will not publish a file that breaks one of the "Fix" rules.

## Must (the CMS blocks the file otherwise)
1. **Snippet only.** No `<!doctype>`, `<html>`, `<head>` or `<body>`. Start with the wrapper element, then the `<style>`, markup and `<script>`.
2. **One wrapper with the page's id**, around everything: Open Finetuner `id="lyzr-oft"`, Sovereign AI `id="lyzr-sov"`, Open Cowork `id="lyzr-oc"`.
3. **Every CSS selector starts with that id**, e.g. `#lyzr-oc .hero h1{...}`. Never `body{}`, `html{}`, `:root{}` or `*{}` on their own: they restyle the site header and footer. Put CSS variables on the wrapper (`#lyzr-oc{--accent:#FE4B1E}`), not on `:root`. Keyframes and `@media` blocks are fine, with the selectors inside still prefixed.
4. **No `<meta name="viewport">`** (WordPress already sends it).
5. **No `&&` in scripts** (WordPress rewrites it to `&#038;&#038;` and the script silently stops). Use `if(a){if(b){...}}` or `a?b:false`.
6. **Write `<` with spaces in scripts** (`i < n`, not `i<n`) so it is never read as a tag.
7. **https:// only** for images, fonts and scripts.
8. **Under 1.5 MB** after images are moved out. Embedded base64 images are fine: the CMS uploads them to the media library and swaps in the links. Still compress images (WebP, about 2x the displayed size).

## Should (shown as "Check", allowed)
- **Responsive:** use `@media (max-width:...)` rules for tablet (about 820px) and phone (about 390-640px). Prefer `max-width` and `%`/`clamp()` over fixed widths of 1000px or more. Do not use `100vw` (use `100%`). Test in the Desktop / Tablet / Mobile previews before publishing.
- **Images:** every `<img>` has `alt`, `width` and `height` (stops the page jumping while loading).
- **No `position:fixed`** that sits at the top: the site header is fixed, 80px tall.
- No `<title>`, no canonical link (WordPress and the SEO plugin set them).
- Fonts: use the site's Aeonik via the page's own CSS or Google Fonts; do not rely on the preview, which has no site fonts.
- A `<form>` is not processed by WordPress; post it to a working endpoint.

## Workflow
Download current HTML from the CMS, edit it with Claude, upload the new file, read the Fix/Check list, look at the three previews, then Publish. The previous version is kept under "Earlier versions" for one-click restore.
