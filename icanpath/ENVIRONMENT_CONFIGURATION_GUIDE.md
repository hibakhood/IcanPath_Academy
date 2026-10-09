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
| NODE_ENV | Hosting/runtime | production for deployed builds; use next start, never public next dev |

Set public build variables before running build:web; changing runtime values alone does not rebuild Vite or Next browser bundles. Keep Vite and Next project IDs/keys aligned. No database password, SMTP credential or provider API key is required in browser code. Deployment tooling may need secure project credentials for migrations, configured through the approved operator environment, not added to public examples.

Absent contact credentials/proxy configuration intentionally produces 503. Missing provider/domain access cannot be replaced by invented values. n8n, Resend and CAPTCHA are not implemented integrations in this release.
