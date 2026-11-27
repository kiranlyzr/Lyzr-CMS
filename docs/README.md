# Product Pages CMS: documentation

A small private CMS for editing and publishing three standalone-HTML pages on lyzr.ai: **Open Finetuner** (page id 153241), **Sovereign AI** (130050) and **Open Cowork** (154655).
Live: https://lyzr-product-pages-cms.vercel.app (sign-in required). Code: https://github.com/kiranlyzr/Lyzr-CMS

| Read this | When |
|---|---|
| [user-guide.md](user-guide.md) | You edit the pages (day to day) |
| [page-rules.md](page-rules.md) | You make the HTML (give it to Claude too) |
| [authentication.md](authentication.md) | How sign-in works, adding/removing people |
| [wordpress-bridge.md](wordpress-bridge.md) | The WordPress snippet: what it does, install, key rotation, security |
| [deployment.md](deployment.md) | Vercel (live now), Alpha (alternative), secrets, redeploying |
| [status-and-open-items.md](status-and-open-items.md) | What was tested, known issues, cleanup checklist |

> `docs/logins-PRIVATE.txt` (local only) holds the two sign-in passwords. It is git-ignored and excluded from Vercel deploys, so it never leaves this computer. Do not move it out of `.gitignore`.

## How it fits together
```
Browser --(email + password, session cookie)--> CMS on Vercel (Express, one function)
CMS --(secret key in X-CMS-Key header, HTTPS)--> WordPress bridge snippet (lyzr-cms/v1)
Bridge --> only the 3 pages: read, replace content, draft/publish, backups, image upload
```
- The CMS never sends the WordPress key to the browser. Visitors only ever see the login page.
- WordPress is not reached through its normal REST login: this site ignores application-password logins, so the CMS uses its own small route (see wordpress-bridge.md).

## Folder map
```
server.js          Express app (login, API, page gating)
api/index.js       Vercel entry (exports the app)
lib/               session.js (auth), html-check.js (validator), wp.js (bridge client), pages.config.js (the 3 pages)
views/             login.html, app.html, app.js (served only after sign-in)
wordpress/         lyzr-cms-bridge.php (the WPCode snippet, placeholder key hash)
scripts/           make-users.mjs (creates logins)
test/              html-check + bridge tests (npm test)
docs/              this folder
```
