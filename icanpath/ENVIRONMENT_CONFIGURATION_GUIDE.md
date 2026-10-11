# Environment configuration

Never paste actual secrets in chat, reports, commits or browser files. Set server secrets in the hosting platform secret store and local untracked web environment only. Preserve .gitignore coverage.

| Variable | Location and visibility | Purpose |
|---|---|---|
| VITE_SUPABASE_URL | Root build environment; public | Same isolated/production project URL used by dashboard browser client |
| VITE_SUPABASE_ANON_KEY | Root build environment; public | Browser publishable/anon key, protected by RLS; never service role |
| VITE_PREVIEW_MODE | Root build environment | Set 0 for staging and production; fixtures are only for explicit localhost preview |
| NEXT_PUBLIC_SUPABASE_URL | web build/runtime; public | Same project URL as Vite; HTTPS required by header configuration |
| NEXT_PUBLIC_SUPABASE_ANON_KEY | web build/runtime; public | Public key for SSR/catalogue client |
| SUPABASE_SERVICE_ROLE_KEY | web runtime; secret | Contact submission only. Bypasses RLS; server endpoint must retain validation and limits |
| CONTACT_TRUSTED_IP_HEADER | web runtime; nonsecret deployment setting | A single verified client IP header set by a trusted proxy which strips incoming values. Never set this blindly to X-Forwarded-For. Direct public node access must be blocked |
| CONTACT_IP_HASH_SECRET | web runtime; secret | Random secret of at least 32 characters for HMAC source identifiers; use secret manager; rotation resets source identity windows |
| CSP_MODE | web build/runtime | report-only default; enforce only after compatibility and browser acceptance. Next header configuration is captured at build; rebuild for changes |
| PRODUCTION_SITE_URL | web build/runtime | Real HTTPS origin for intended HSTS boundary; configure Auth site URL separately in Supabase |
| RESEND_API_KEY | web runtime; secret | Resend API key for transactional emails (welcome and password-changed) sent by /api/emails and /api/email-webhook |
| RESEND_FROM_EMAIL | web runtime; public | Sender address on a Resend-verified sending domain, e.g. ICANPATH Academy <no-reply@yourdomain.com>. Required with RESEND_API_KEY |
| EMAIL_WEBHOOK_SECRET | web runtime; secret | Random shared secret used to authenticate the Supabase auth.users INSERT webhook that triggers the welcome email; header Authorization: Bearer <value> |
| NODE_ENV | Hosting/runtime | production for deployed builds; use next start, never public next dev |

Set public build variables before running build:web; changing runtime values alone does not rebuild Vite or Next browser bundles. Keep Vite and Next project IDs/keys aligned. No database password, SMTP credential or provider API key is required in browser code. Deployment tooling may need secure project credentials for migrations, configured through the approved operator environment, not added to public examples.

Absent contact credentials/proxy configuration intentionally produces 503. Missing provider/domain access cannot be replaced by invented values. CAPTCHA is not implemented.

## Email delivery

Authentication emails (signup confirmation and password reset links) are issued by Supabase Auth, so they are delivered via the SMTP integration configured in the Supabase dashboard, not through app code:

1. In Resend, verify a sending domain (DNS SPF/DKIM/DMARC records) so the SMTP sender is accepted.
2. In Supabase Dashboard -> Authentication -> Email, switch provider to SMTP and use smtp.resend.com (port 465 TLS), username `resend`, password = Resend API key, and a sender on the verified domain.
3. Supabase sends confirmation and reset emails through Resend automatically.

App-level transactional emails (welcome on signup, password-changed notice) are sent by the Next routes `/api/email-webhook` (fired by a Supabase database webhook on auth.users INSERT) and `/api/emails` (authorised by the caller's Supabase session token). Configure the database webhook in Supabase Dashboard -> Database -> Webhooks for schema `auth`, table `users`, event INSERT, payload "Full record", URL `https://<site>/api/email-webhook`, header `Authorization: Bearer <EMAIL_WEBHOOK_SECRET>`. Email failures never block signup or password updates.

### Auth redirect URLs

Signup confirmation and recovery links only work when Supabase is told which URLs it may redirect to. If the app URL is missing, the provider redirects to its default `http://localhost:3000` and the visitor sees an error code even though the account was created or confirmed.

In Supabase Dashboard -> Authentication -> URL Configuration:

1. Site URL: `https://icanpathacademy.vercel.app` (the deployed app, not localhost).
2. Redirect URLs (add each): `https://icanpathacademy.vercel.app/**` and, for local work, `http://localhost:5173/**`.
3. Keep confirmation enabled. `signUp` passes `emailRedirectTo` of `<site>/login/`, so a confirmed visitor lands on the sign-in page and is routed to their dashboard automatically.

A link that has already been opened shows an `otp_expired` error even though the account is confirmed (some mail scanners open links first). The app now shows a friendly "already used or expired" message instead of the raw code; sign in normally.

