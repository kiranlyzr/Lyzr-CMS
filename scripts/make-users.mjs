#!/usr/bin/env node
/**
 * node scripts/make-users.mjs <out-file>
 * Makes a random password for each person, hashes it (scrypt) and writes ONE private file with the passwords to hand
 * out and the CMS_USERS value to save as a secret on Alpha. Nothing is printed. Delete the file afterwards.
 */
import { randomBytes, randomInt, scryptSync } from 'node:crypto';
import { writeFileSync, chmodSync } from 'node:fs';
const USERS = ['kiran@lyzr.com', 'vidur@lyzr.com'];
const ALPHABET = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const SCRYPT = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const b64url = (b) => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
function password() { let s = ''; for (let i = 0; i < 20; i++) { s += ALPHABET[randomInt(ALPHABET.length)]; if (i % 5 === 4 && i < 19) s += '-'; } return s; }
const out = process.argv[2];
if (!out) { console.error('usage: node scripts/make-users.mjs <out-file>'); process.exit(1); }
let text = 'PRODUCT PAGES CMS LOGINS - PRIVATE. Hand each person only their own line, then DELETE THIS FILE.\n\n';
const entries = [];
USERS.forEach((email) => {
  const pw = password(); const salt = randomBytes(16);
  entries.push(email + ':' + b64url(salt) + ':' + b64url(scryptSync(pw.normalize('NFKC'), salt, 32, SCRYPT)));
  text += '  ' + email + '   ' + pw + '\n';
});
text += '\nSave as the secret CMS_USERS on Alpha:\n  ' + entries.join(',') + '\n';
text += '\nAlso create SESSION_SECRET (any 48+ random characters):\n  ' + randomBytes(36).toString('base64url') + '\n';
writeFileSync(out, text, { mode: 0o600 }); chmodSync(out, 0o600);
console.log('written: ' + out);
