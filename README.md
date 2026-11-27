# Lyzr Product Pages CMS

Edit and publish three standalone-HTML pages on lyzr.ai: Open Finetuner (153241), Sovereign AI (130050), Open Cowork (154655). Page list: `lib/pages.config.js`. HTML rules: `PAGE_RULES.md`.

## What it does
- Email + password sign-in (only the people in `CMS_USERS`: kiran@lyzr.com, vidur@lyzr.com). 24 h sessions, 5 wrong passwords lock that email for 15 min.
- Per page: download current HTML, upload/paste new HTML, automatic checks (WordPress/Elementor safety + responsive), Desktop/Tablet/Mobile preview, Publish, earlier versions with Restore.
- The server only ever sends the page **content** to WordPress (never title, slug, template, status, delete) and only for the 3 page ids. Other pages, posts and settings are unreachable. WordPress credentials exist only as secrets on the server.
- Checks run again on the server at publish time; if the page changed in WordPress after you opened it, the publish is refused (409).

## Run locally (test mode: reads the public site, writes nothing, no login)
    npm install
    npm run dev        # http://localhost:8081  (set PORT to change)
    npm test

## Deploy on Alpha
Secrets (never commit, never paste in chat): `WP_URL`, `WP_CMS_KEY`, `SESSION_SECRET`, `CMS_USERS`.
Create the logins: `node scripts/make-users.mjs ~/cms-logins-PRIVATE.txt` (writes passwords + the CMS_USERS and SESSION_SECRET values to one private file; delete it afterwards).

In an Alpha workspace terminal:

    git clone https://github.com/kiranlyzr/Lyzr-CMS.git && cd Lyzr-CMS
    npm ci
    forge deploy check --dir . --name lyzr-product-pages-cms
    forge deploy --dir . --name lyzr-product-pages-cms --port 8081 --env WP_URL --env WP_CMS_KEY --env SESSION_SECRET --env CMS_USERS

(Confirm the exact `--env` form with `forge deploy --help`.) A push to GitHub does not deploy: run `git pull --ff-only && npm ci && forge deploy --dir .` for each update. Changing a secret needs a redeploy.

## WordPress side: the bridge snippet
Normal WordPress logins (application passwords) are ignored on this site, so the CMS uses `wordpress/lyzr-cms-bridge.php` instead (WPCode > Add Snippet > PHP Snippet > Run Everywhere > Active). It checks a secret key sent in the `X-CMS-Key` header (the snippet stores only the key's SHA-256 hash) and can only: read/replace the content of the 3 pages in `LYZR_CMS_PAGES`, set them to draft/publish, list/read their revisions, and upload images. It cannot touch anything else, or delete.
- The repo copy has a placeholder hash. Generate a key, put its SHA-256 in the snippet (`LYZR_CMS_KEY_SHA256`) and the key itself in the `WP_CMS_KEY` secret. Changing the key = new hash in the snippet + new secret + redeploy.
- Check it: `curl -H "X-CMS-Key: <key>" https://www.lyzr.ai/wp-json/lyzr-cms/v1/ping` returns `key_valid: true` (and `authorization_header_received` tells you whether the normal login header reaches WordPress at all).
- To add a page: add its id to `LYZR_CMS_PAGES` in the snippet and to `lib/pages.config.js`.
