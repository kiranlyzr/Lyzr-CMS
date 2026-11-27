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
Secrets (never commit, never paste in chat): `WP_URL`, `WP_USER`, `WP_PASS`, `SESSION_SECRET`, `CMS_USERS`.
Create the logins: `node scripts/make-users.mjs ~/cms-logins-PRIVATE.txt` (writes passwords + the CMS_USERS and SESSION_SECRET values to one private file; delete it afterwards).

In an Alpha workspace terminal:

    git clone https://github.com/kiranlyzr/Lyzr-CMS.git && cd Lyzr-CMS
    npm ci
    forge deploy check --dir . --name lyzr-product-pages-cms
    forge deploy --dir . --name lyzr-product-pages-cms --port 8081 --env WP_URL --env WP_USER --env WP_PASS --env SESSION_SECRET --env CMS_USERS

(Confirm the exact `--env` form with `forge deploy --help`.) A push to GitHub does not deploy: run `git pull --ff-only && npm ci && forge deploy --dir .` for each update. Changing a secret needs a redeploy.

## WordPress side
A dedicated user (for example `lyzr-cms-bot`) with the Editor role and an application password (Users > Profile > Application Passwords). Editors on a single site have `unfiltered_html`, which the pages need so WordPress keeps `<script>` and `<style>`. Do not use a personal admin account.
