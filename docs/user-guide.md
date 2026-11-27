# User guide

Sign in at https://lyzr-product-pages-cms.vercel.app with the email and password you were given. Sessions last 24 hours.

## Update a page
1. **All pages** shows the three pages with a Live/Draft label. Click **Edit page**.
2. **Step 1: Get the current HTML.** Click *Download current HTML* and start from it, so you never overwrite someone else's changes. The preview tab *Current live HTML* shows what is live now.
3. **Make your changes** (for example with Claude). Give Claude [page-rules.md](page-rules.md).
4. **Step 2: Upload the new HTML.** Drop the .html file, or paste it. The CMS checks it straight away:
   - **Fix:** blocks publishing until fixed (for example a full `<html>` document, `&&` in a script, CSS that targets the whole site, the wrong page's wrapper id).
   - **Check:** allowed, but look at it (no phone breakpoints, images without alt text, fixed widths).
5. **Preview** on **Desktop**, **Tablet** and **Mobile**. The preview shows only your page: no site header, footer or site fonts.
6. **Step 3: Publish.** Confirm. The live page is replaced at once. Images embedded in the file are moved to the media library and replaced with links.
7. Open the live page (*View live page*) and check it, since the host's cache can take a moment.

## Take a page offline (draft)
Under **Page status**, *Move to draft (take offline)* hides the page on lyzr.ai at once (visitors see "page not found"). While it is a draft, the button becomes *Save (stays draft)*, so you can upload and save safely. *Set live* puts it back (the saved HTML is checked first).

## Earlier versions / restore
The CMS saves a copy of the page before every publish (the last 20 per page). Under **Earlier versions**, *Restore* replaces the live page with that copy. The version being replaced is saved as a copy too.

## Good to know
- If someone else changed the page after you opened it, publishing is refused: reload the page in the CMS and upload again.
- You cannot rename a page, change its address, or delete it from here.
- Files over about 4.5 MB (Vercel's limit) are rejected: compress images or let the CMS move them to the media library.
- The first time Open Cowork is published, its 31 embedded images are moved to the media library. The page gets much lighter.
