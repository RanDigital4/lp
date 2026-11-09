# RND LP Platform — Setup Guide (Hindi)

## Package contents
- `index.html`, `styles.css`, `script.js`: public landing page and navigation.
- `register.html`, `auth.css`, `register.js`: registration and strong-password validation.
- `login.html`, `auth.css`, `login.js`: login and password reset.
- `dashboard.html`, `dashboard.css`, `dashboard.js`: LP submission, reward ledger and withdrawal request.
- `admin.html`, `dashboard.css`, `admin.js`: manual admin review.
- `firebase.js`: Firebase project configuration.
- `app-config.js`: admin email and reward tiers.
- `database.rules.json`: starter Realtime Database security rules.

## Important limitations
This is a static GitHub Pages application using Firebase Authentication and Realtime Database. It does not itself:
- verify an LP position automatically on-chain;
- lock LP tokens or prevent a user from removing liquidity;
- transfer RND tokens to a wallet;
- guarantee a reward or return.

Admin must independently verify the DEX position and evidence. The six-month clock begins when admin approves. At the end of six months, admin must check that the position was maintained and click **Confirm LP maintained & unlock**. User can then submit a withdrawal request. Admin must send RND separately from a secure wallet and enter the real transaction hash before marking the request paid.

Do not call the displayed reward balance an on-chain wallet balance. It is an internal reward ledger record until a real transaction is sent.

## Step 1 — Firebase Authentication
1. Open https://console.firebase.google.com/
2. Open project `lprnd-ddd35`.
3. Authentication → Sign-in method → enable **Email/Password**.
4. Do not enable Email link/passwordless unless you intentionally want passwordless login.
5. Authentication → Settings → Authorized domains → add `lp.randigital.in`.
6. In Authentication password policy (if available), set a strong policy. The registration page also requires 12 characters, upper/lowercase, number and symbol.

## Step 2 — Set the admin email
1. Open `app-config.js`.
2. Replace `REPLACE_WITH_ADMIN_EMAIL` with the exact email address used by the authorized admin's Firebase Authentication account.
3. Open `database.rules.json`.
4. Replace every occurrence of `REPLACE_WITH_ADMIN_EMAIL` with that same email.
5. Do not use an email that is not controlled by the project owner. Enable 2-step verification on the Google account.

## Step 3 — Realtime Database rules
1. Firebase Console → Realtime Database → Rules.
2. Back up/export the current rules first.
3. Paste the contents of `database.rules.json` after replacing the admin email.
4. Click Publish.
5. Test with a normal user and the admin account. Never use Test Mode or public read/write rules.

## Step 4 — Upload to GitHub
1. Back up the current `RanDigital4/lp` repository first.
2. Upload/replace the files from this ZIP in the repository root (same folder as current `index.html`).
3. Keep all files at the root, not inside an extra nested folder.
4. GitHub Pages deploys from `main` and `/(root)`.
5. Open https://lp.randigital.in and test signup/login.

## Step 5 — First test
1. Register a test user with a strong password.
2. Verify the email from the inbox.
3. Log in and submit a test LP application. Do not submit fake claims as real program participation.
4. Sign in with the configured admin account and open `/admin.html`.
5. Admin checks the actual position, then approves/rejects.
6. Approval creates an internal reward-ledger entry and starts a six-calendar-month timer.
7. After six months, admin rechecks the LP is still active and in good standing, then clicks unlock.
8. User can submit a withdrawal request.
9. Admin sends the actual RND transaction from a secure wallet and records the transaction hash in Admin Panel.

## Reward tiers currently configured
$100=20, $200=40, $300=60, $400=70, $500=80, $600=100, $700=120, $800=140, $900=160, $1,000=180 RND.
These are editable in `app-config.js`, but the same policy must be reflected in final published program terms and admin procedures.

## Security notes
- Firebase web config is public client configuration, not a private service-account credential.
- Never upload Firebase service-account JSON, private keys, seed phrases or admin passwords.
- Client-side checks are not a substitute for server-side verification. Admin-only database rules protect reward records from normal users.
- This package uses manual admin review and does not use Cloud Functions.
- LP continuity cannot be automatically proven by this static website. Admin must verify the DEX position at approval and before unlock. A smart-contract lock / trusted on-chain verifier is required for automated enforcement.
- Review legal/compliance obligations and final terms before opening a public token reward campaign.
