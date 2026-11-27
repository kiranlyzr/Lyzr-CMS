# Deployment

## Live now: Vercel
- Project `lyzr-product-pages-cms`, team `subs-3909s-projects`, https://lyzr-product-pages-cms.vercel.app
- The Express app is one function: `api/index.js` exports `server.js`'s app, `vercel.json` rewrites every path to it and bundles `views/**`.
- It is **not** linked to GitHub (the Vercel account has no write access to the repo), so deploys are manual from this folder:
```
vercel deploy --prod --yes --scope subs-3909s-projects
```
- **Secrets** (Production, Sensitive): `CMS_USERS`, `SESSION_SECRET`, `WP_URL` (https://www.lyzr.ai), `WP_CMS_KEY`. A changed secret needs a redeploy.
- **Limits:** request bodies up to ~4.5 MB; function time 60 s.
- Check after a deploy: visitor `/` shows only the login; `/app.js`, `/app.html`, `/server.js` are 404; `/api/pages` is 401 without a session.

## Local test mode (no login, no writes)
```
npm install
npm run dev        # http://localhost:8081, reads the public site, never writes to WordPress
npm test           # validator + bridge client tests
```
Local live testing against WordPress: `.env` with `WP_URL` and `WP_CMS_KEY` (git-ignored).

## Alternative: Alpha
Alpha runs a full web service on Cloud Run (Express, `npm start`, `$PORT`). Vercel-style `api/` folders do not work there, but `server.js` already runs as a normal server when `VERCEL` is not set. Deploy from an Alpha workspace terminal (the deploy cannot be triggered from outside; a GitHub push does not deploy):
```
git clone https://github.com/kiranlyzr/Lyzr-CMS.git && cd Lyzr-CMS && npm ci
forge deploy check --dir . --name lyzr-product-pages-cms
forge deploy --dir . --name lyzr-product-pages-cms --port 8081 --env WP_URL --env WP_CMS_KEY --env SESSION_SECRET --env CMS_USERS
```
(Confirm the `--env` form with `forge deploy --help`. Updates: `git pull --ff-only && npm ci && forge deploy --dir .`.) The Alpha "Tools API" key is only for connected integrations, not for deploying.

## Git
`git push origin main` from this folder (needs your GitHub sign-in). Never commit `.env`, login files or keys (`.gitignore` covers them).
