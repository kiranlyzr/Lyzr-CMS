# Authentication

Email + password, for the people listed in the secret `CMS_USERS` (today: kiran@lyzr.com and vidur@lyzr.com). Microsoft sign-in is not built: the earlier Microsoft "Lyzr CMS" app needed IT admin consent. It can be added later if IT approves.

## How it works
- **Users:** `CMS_USERS` = `email:salt:hash,email:salt:hash`. Passwords are never stored; the hash is scrypt (N=32768, r=8, p=1).
- **Login:** `POST /auth/login` compares in constant time, does the same work for unknown emails, and gives one message for both ("Incorrect email or password"). It only accepts the site's own requests (Origin / Sec-Fetch-Site / `x-requested-with: cms`).
- **Lockout:** 5 wrong passwords lock that email (and address + email) for 15 minutes. The counter is in server memory (per instance), so it is a speed bump, not a permanent lock.
- **Session:** cookie `cms_session` = signed JSON + HMAC-SHA256 with `SESSION_SECRET`. HttpOnly, Secure, SameSite=Strict, 24 hours. It carries the first 12 characters of the user's password hash, so changing or removing a user in `CMS_USERS` ends their sessions at once.
- **Gating:** a visitor gets only the login page. `/app.js` is 404 and every `/api/*` call is 401 without a session. Changes (publish, status, restore) also need the `x-requested-with: cms` header, which other websites cannot send.
- **Audit:** logins, failed logins, publishes, status changes and restores are logged with who did them (Vercel logs).
- **Important Vercel detail:** do not put the editor files in a folder called `public/`: Vercel serves it to everyone. They live in `views/`.

## Create the logins
```
node scripts/make-users.mjs ~/cms-logins-PRIVATE.txt
```
Writes one private file (mode 600) with a random password per person, the `CMS_USERS` value and a new `SESSION_SECRET`. Nothing is printed. Hand each person only their own line, then delete the file.

## Add, remove or reset a person
- **Remove:** delete their entry from `CMS_USERS`, redeploy. Their session ends at once.
- **Reset a password / add someone:** edit `USERS` in `scripts/make-users.mjs` to just that person, run it, and replace or append their `email:salt:hash` entry in the existing `CMS_USERS` value. (Pasting the script's whole output replaces everyone, and every password changes.)
- Setting a secret on Vercel: `printf %s "<value>" | vercel env add CMS_USERS production --sensitive --scope subs-3909s-projects`, (remove the old one first with `vercel env rm`), then redeploy.
