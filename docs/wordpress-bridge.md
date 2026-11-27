# The WordPress bridge (`wordpress/lyzr-cms-bridge.php`)

## Why it exists
Normal WordPress REST logins (application passwords) are ignored on lyzr.ai: every request comes back "not logged in", for every user and user agent, from any address. The `Authorization` header does reach WordPress (the bridge's ping shows `authorization_header_received: true`), so the cause is inside WordPress or its security layer, not a stripped header. The other CMSs (webinar, podcast, events, newsroom) use that login method and are likely affected for saves. The bridge uses its own route and key instead.

## What it can do (and nothing else)
Routes under `/wp-json/lyzr-cms/v1/`, all needing the key in the `X-CMS-Key` header except `ping`:
| Route | Does |
|---|---|
| `GET ping` | Says whether the key header arrives and is valid. Public, reveals only yes/no and the page count. |
| `GET pages`, `GET pages/<id>` | Summary / content of the allowed pages |
| `POST pages/<id>/content` | Replace the content only (never title, slug, template or status). Saves a backup first; if the backup fails nothing is changed. |
| `POST pages/<id>/status` | Set `draft` or `publish` only |
| `GET pages/<id>/revisions` (+ `/<rev>`) | List / read the bridge's own backups |
| `POST media` | Upload one image: jpg, png, gif, webp, avif (no SVG; others get 415) |

It cannot touch any other page or post, users, settings or plugins, and it cannot delete. The page list is the constant `LYZR_CMS_PAGES`.

## Backups
This site keeps **no WordPress page revisions** (a real change created none), so the bridge keeps its own: a compressed copy of the page before every change, last 20 per page, in `wp-content/uploads/lyzr-cms-backups-<12 hex>/` (unguessable folder name, `index.php` and `.htaccess` added; only the public page HTML is stored, never secrets).

## Install
WPCode > Add Snippet > PHP Snippet > paste the file > **Run Everywhere** > Active. The file in this repo has a placeholder hash; put your key's SHA-256 in `LYZR_CMS_KEY_SHA256` first:
```
KEY=$(node -e "console.log(require('crypto').randomBytes(36).toString('base64url'))")
printf %s "$KEY" | shasum -a 256        # the hash goes into the snippet; $KEY goes into the WP_CMS_KEY secret
```
The snippet stores only the hash, so reading it does not reveal the key (the key is 288 bits of randomness).
Verify: `curl -H "X-CMS-Key: <key>" https://www.lyzr.ai/wp-json/lyzr-cms/v1/ping` returns `key_valid: true`.

## Rotate the key
New key, new hash in the snippet, new `WP_CMS_KEY` secret on Vercel, redeploy. Do it if the key was ever shown or shared. (The backup folder name derives from the hash, so after rotating, old backups stay in the old folder: copy them to the new one if you need them.)

## Add a page
Add its id to `LYZR_CMS_PAGES` in the snippet **and** an entry (id, key, name, slug, root wrapper id) in `lib/pages.config.js`, then redeploy.

## Security notes
- **Site speed:** the code runs only on REST requests (registers seven routes, no database work, no front-end code). Page loads are unaffected.
- **Brute force:** 10 wrong keys from one address lock that address out for 15 minutes (transient). If the host's proxy shares one address, an attacker could lock the CMS out for 15 minutes; nothing else breaks. The key is too long to guess either way, so the lockout can be removed if that is a worry.
- **Scripts in pages:** while saving, the bridge switches off WordPress's HTML filter (it would strip `<script>` and `<style>`, because no user is logged in). Whoever holds the key can put scripts on those three pages: the same trust as an editor.
- Deactivating the snippet removes everything at once.
- PHP was not run locally (no php binary); the code was checked by reading it, and the live read/write/backup/restore/upload paths were tested on the real site (see status-and-open-items.md).
