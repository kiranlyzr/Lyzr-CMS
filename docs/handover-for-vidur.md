# Product Pages CMS: quick start for the tech team

You can edit and publish three pages on lyzr.ai through this CMS, without a WordPress login:
**Open Finetuner**, **Sovereign AI** and **Open Cowork**.

**Address:** https://lyzr-product-pages-cms.vercel.app
**Sign in:** your work email and the password Kiran gives you (keep it private; sessions last 24 hours; 5 wrong tries lock you out for 15 minutes).

## The 5-step routine
1. **Open the page** you want to change (Edit page).
2. **Download current HTML** (Step 1). Always start from this file, never from an old copy.
3. **Make your changes** (for example with Claude: give it the downloaded file and [page-rules.md](page-rules.md)).
4. **Upload the new HTML** (Step 2: drop the file or paste it). The CMS checks it:
   - **Fix** (red) = must be fixed before it can be published.
   - **Check** (amber) = allowed, but look at it.
5. **Preview, then publish.** The preview switches to *Your uploaded file* automatically. Look at **Desktop**, **Tablet** and **Mobile** (and *Full screen*), compare with **Live now**, then click **Publish to live page**. Open the live page afterwards to confirm.

Nothing goes live until you click Publish.

## The rules that matter most (full list in page-rules.md)
- Upload only the page snippet: no `<html>`, `<head>` or `<body>`.
- Keep the page's wrapper id: Open Finetuner `lyzr-oft`, Sovereign AI `lyzr-sov`, Open Cowork `lyzr-oc`.
- Start every CSS selector with that id (for example `#lyzr-oc .hero h1`). Never style `body`, `html` or `:root` on their own.
- No `&&` in scripts (WordPress breaks it); use nested `if`s. Write `i < n` with spaces.
- Use `https://` links only, and keep `@media` rules for tablet and phone.
- Keep the file under about 4.5 MB (embedded images are moved to the media library for you).

## Taking a page offline, and undoing a mistake
- **Page status > Move to draft** hides the page on lyzr.ai at once. **Set live** brings it back.
- **Earlier versions > Restore** puts back any of the last 20 saved copies (a copy is saved before every publish).

## Things to know
- If someone else changed the page after you opened it, publishing is refused: reload the page and upload again.
- You cannot rename a page, change its address or delete it from the CMS.
- **Sovereign AI currently contains a script bug** (`&&` in one script), so the CMS will not publish it until that `&&` is replaced. Open Cowork's first publish moves its embedded images to the media library: that is expected and makes the page lighter.
- If something looks wrong or the CMS shows a WordPress error, stop and tell Kiran. Do not retry repeatedly.
