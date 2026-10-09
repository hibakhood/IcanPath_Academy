# Security regression results

9 October 2026. Every command below was executed and its individual exit code recorded. No failed test was suppressed or auth/RLS disabled. PGlite runs migrations with Auth/Storage stubs; frontend/Auth/contact mocks are not real provider integration.

| Command | Final exit code | Result | Local evidence log |
|---|---|---|---|
| `npm run db:test` | 0 | PASS | `/private/tmp/final-security-0.log` |
| `npm run test:security` | 0 | PASS | `/private/tmp/final-security-1.log` |
| `npm run test:workflows` | 0 | PASS | `/private/tmp/final-security-2.log` |
| `npm run test:learning` | 0 | PASS | `/private/tmp/verified-security-3.log` |
| `npm run test:ican` | 0 | PASS | `/private/tmp/verified-security-4.log` |
| `npm run test:admin` | 0 | PASS | `/private/tmp/verified-security-5.log` |
| `npm run test:domain` | 0 | PASS | `/private/tmp/verified-security-6.log` |
| `node scripts/test-auth.mjs` | 0 | PASS | `/private/tmp/verified-security-7.log` |
| `npm run test:real` | 0 | PASS | `/private/tmp/verified-security-8.log` |
| `npm run test:frontend` | 0 | PASS | `/private/tmp/verified-security-9.log` |
| `npm run test:links` | 0 | PASS | `/private/tmp/verified-security-10.log` |
| `npm run test:seed` | 0 | PASS | `/private/tmp/verified-security-11.log` |
| `npm run verify:frozen` | 0 | PASS | `/private/tmp/verified-security-12.log` |
| `npm run type-check` | 0 | PASS | `/private/tmp/verified-security-13.log` |
| `npm run lint` | 0 | PASS | `/private/tmp/final-security-4.log` |
| `npm run test:remediation` | 0 | PASS | `/private/tmp/final-security-3.log` |
| `node scripts/test-security-runtime.mjs` | 0 | PASS | `/private/tmp/verified-security-16.log` |
| `npm run build:web` | 0 | PASS | `/private/tmp/verified-security-17.log` |
| `npm run check:secrets` | 0 | PASS | `/private/tmp/final-security-5.log` |

New database regressions: **197 assertions passed**. Runtime Auth/contact/header configuration: **12 checks passed**. Existing security: 66; workflows: 55; learning: 78; ICAN: 62; admin: 60; domain: 22; frontend: 56; links: 28; seed: 32; real branch mocks: 7. TypeScript, lint and production build passed. Frozen marketing check: 14/14 unchanged. Six new migrations applied successfully; all 23 old migrations match backup hashes.

Both npm audits completed with zero reported vulnerabilities. Scoped secret pattern scan completed with no matches; it does not certify deployment secrets, Git history or all possible credential formats.

## Failures encountered and corrected

Discovery lint failed on 12 Node global errors in the root audit probe; configured its Node scope. New MFA script had one prefer-const lint error, corrected. New synthetic fixtures initially used nonexistent youtube_url and material_type columns; corrected to actual schema fields. Admin regression caught a lost live review condition in the new signer; restored it and resource helper check. Domain test expected the now deliberately revoked anonymous contact RPC; updated it to assert denial and test trusted submission. Seed test required explicit synthetic AAL2; added this only to the test harness. No production factor or claim was changed. Complete suite subsequently passed, followed by targeted reruns after the final Storage policy correction.

## Production-build HTTP smoke

Local Next production server on 127.0.0.1:3102, no live Supabase credentials. Seven GET responses (home, login, three role dashboards, MFA and /api/health) returned 200 with security headers and report-only CSP. These role responses are static shells, not authenticated data success. Foreign Origin contact POST returned 403; unconfigured trusted endpoint 503; oversized body 413. Real contact success tested only through a mocked RPC.

## Not executed or not verified

Real GoTrue verification/recovery/MFA/refresh-token revocation; live Storage API limits/content inspection/signing; Realtime subscriptions; real email delivery; provider account sharing; cross-connection database races; actual hosted browser flows and mobile acceptance; production load measurements; deployment TLS/DNS; monitoring alerts; backup restore. The broad test:browser command was not run; it requires its supported browser runner. Do not interpret the local regression suite as completing these checks.
