# Status and open items (27 Nov 2026)

## Built and tested
- Login, gating, session, lockout: tested locally and on the live Vercel site (visitor sees only login; wrong password 401; missing header 403; valid login opens the editor).
- HTML validator: 22 tests; Open Finetuner and Open Cowork pass, Sovereign AI is flagged (see below).
- Bridge on the real site (via Open Cowork, restored afterwards to its exact original): key accepted/refused, page not on the list refused (403), bad status 400, short body 400, content replace, backup created and holds the previous version, restore from backup, image upload OK, SVG and `.php` refused (415).
- CMS end-to-end on Open Cowork: open page, publish unchanged HTML (200).
- Drafting: tested with the local test server only.

## Not tested yet
- CMS-level publish / change / stale-edit refusal / restore on **Open Finetuner** (a test was prepared with backup and safety restore, but needs the owner's go-ahead because it writes to a second live page).
- **Draft toggle** on real WordPress (it would take a live page offline).
- Bridge PHP was never run locally (no php binary).

## Known issues
- **Sovereign AI has a broken script live:** WordPress rewrote `&&` to `&#038;&#038;` in one script, so it does not run. The CMS blocks Sovereign from being published or set live until `&&` is replaced (nested ifs or `a?b:false`).
- **Open Cowork's first publish moves its 31 embedded images** into the media library (this is the intended behaviour; the page loses weight). A test run already did this once and the original was restored; the 31 uploaded images (`open-cowork-<hash>`) and `cms-bridge-test.png` are still in the media library and can be deleted.
- WordPress application-password login is ignored site-wide (see wordpress-bridge.md): the webinar, podcast, events and newsroom CMSs likely cannot save. Worth a ticket with WPMU DEV; the bridge pattern could be reused for them.
- Microsoft sign-in not built (needs IT consent for the Entra app).
- Vercel deploys are manual (not connected to GitHub).

## Cleanup checklist
- [ ] Hand each person their own password from `cms-logins-product-pages-PRIVATE.txt`, then delete the file.
- [ ] Delete `vidur-cms.rtf`; revoke the `vidur-cms` application password in WordPress (its password appeared in a chat session).
- [ ] Revoke the old `kiranlyzr` application password if not done.
- [ ] Delete the test images from the media library (see above).
- [ ] Fix the `&&` in Sovereign AI's script.
- [ ] Decide whether to run the Open Finetuner test.
