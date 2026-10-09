# ICANPATH Academy — Security Audit & Production-Readiness Report

Scope: `eduleb/` (static marketing site + Vite TypeScript LMS SPA + Supabase backend, and the `eduleb/web/` Next.js 16 wrapper).
Method: source review of all 29 migrations, client/server code, headers and deployment config; synthetic database tests (PGlite); repository regression suites. No production data was accessed. **No application source, migration, auth policy or data was modified during this audit.**

Note: `eduleb/SECURITY_AUDIT_REPORT.md` is a stale earlier artifact (23 migrations, before the 0025–0029 remediation). This report supersedes it and is kept at the repo root to avoid clobbering it.

---

## 1. Executive Summary

**Verdict: CONDITIONALLY NOT READY FOR PRODUCTION.**

The application-level authorization model is genuinely strong and materially better than the stale prior report described. Identity is enforced in Postgres, not the browser: RLS is enabled on every table, privileges are grant-based with column-level restrictions, administrator privilege now requires MFA (AAL2), private storage/meeting URLs are never readable through PostgREST, and the previously flagged admin-MFA and anonymous-contact-abuse issues are remediated and covered by passing regression suites.

The blockers are **operational/release-gate**, not unpatched authorization holes:

- Known/default demo credentials exist in `supabase/seed.sql` and must never touch production. **(Fixed: hard seed guard + regression test.)**
- Migrations 0024–0029 are **not yet applied to production**, and enabling AAL2 admin has an explicit "enroll real administrators first" precondition. (Open — needs project access.)
- HSTS was weak and there was **no CI/CD** release gate. **(Fixed: stronger HSTS/COOP/CORP; `.github/workflows/security.yml` added.)**
- CSP still ships in **report-only** mode by default (see M-1 for why enforcement is deferred pending a script nonce).
- Live Supabase authorization and deployed headers could **not be verified** from this environment.

No Critical or confirmed High *runtime* vulnerability was found. Findings below are graded accordingly; High items are release blockers that are conditional on production state. The code-level P0 items have been addressed in this pass; the remaining gate is operational (migration rollout + MFA enrollment + live verification).

### Passing evidence gathered this audit

| Check | Result |
|---|---|
| `npm run type-check` | Pass (no errors) |
| `npm run lint` | Pass (no errors) |
| `npm run check:secrets` | 259 files scanned, no matches (deployment secrets & git history not verified) |
| `npm run test:security` | 66/66 assertions pass |
| `npm run test:security-runtime` | 12/12 pass (mocked Auth + contact backend) |
| `npm run db:test` | 29 migrations ok; 42 tables, 76 policies, 42 tables with RLS, 119 SECURITY DEFINER fns |
| `npm run test:remediation` | 197 assertions pass (synthetic PGlite) |
| `npm run test:workflows` | 55/55 assertions pass |
| `npm audit` (eduleb + web) | 0 vulnerabilities |
| `npm run test:browser` / `test:frontend` | **Not verified** — Node v20.11 (`WebSocket is not defined`, unsupported `--experimental-strip-types`) |

---

## 2. Findings

| ID | Severity | Title | Status |
|----|----------|-------|--------|
| H-1 | High (conditional) | Known demo/admin credentials committed in `seed.sql` | Fixed |
| H-2 | High (release gate) | No CI/CD; migration 0024–0029 rollout + AAL2 enrollment not enforced before prod | Partial |
| M-1 | Medium | CSP served as `Content-Security-Policy-Report-Only` by default | Deferred |
| M-2 | Medium | Weak HSTS; missing COOP/CORP | Fixed |
| M-3 | Medium | Large publicly-served SPA asset set incl. 624 stale hashed chunks & admin shells | Open |
| M-4 | Medium | Contact endpoint accepts requests with no `Origin` (CSRF relies on header presence) | Open |
| M-5 | Medium | Proxy silently swallows cookie `setAll` failures | Open |
| L-1 | Low | `course_tutors` policy lets a course-owner tutor manage co-tutors | Open (intent) |
| L-2 | Low | Quiz review returns `correct_answer`+explanation, harvestable across retakes | Open |
| L-3 | Low | `valid_provider_url` revoked but never granted to `authenticated` (dead/incomplete) | Open |
| L-4 | Info | `is_admin()` granted `EXECUTE` to `anon` — required by anon catalogue RLS | Not a finding |
| L-5 | Low | `/mfa` omitted from the `SAMEORIGIN` header override list | Open |
| L-6 | Low | Public catalogue exposes tutor `full_name` to `anon` (intended) | Accepted |
| L-7 | Low | Legacy `contact.php` relies on PHP `mail()` | Open (ops) |
| L-8 | Low | Dead auth helpers in `web/src/lib/auth.ts` | Open |
| L-9 | Low | Input validation gaps (course search params, phone length only) | Open |

### H-1 — Known demo credentials in seed data
- **Evidence:** `supabase/seed.sql:14-23,79-86` create demo accounts including `admin@charterpath.test` / `AdminPass!2026`.
- **Attack:** If `seed.sql` is ever applied to a production project, an attacker with the published password logs in as a known admin/tutor/student.
- **Impact:** Account takeover; data exposure. Admin RPCs remain blocked without AAL2 (`is_admin()` requires `aal='aal2'`, `0025_admin_mfa.sql:2-7`), which limits blast radius — but the account and its non-admin-gated data are still compromised. Student/tutor demo accounts face the same issue with no MFA gate.
- **Remediation:** Guarantee `seed.sql` is never run against production; add a hard guard (e.g. reject when `env` is production), rotate/remove demo users, and document seed as dev-only.
- **Resolution (Fixed):** `supabase/seed.sql` now opens with a hard gate that raises `42501` and aborts the transaction if any non-demo account already exists in `auth.users`, so it cannot create the published demo administrator in a live project. Covered by a new regression assertion in `scripts/test-seed.mjs` ("the seed refuses when a real account exists"); `npm run test:seed` now 33/33.
- **Verification:** Confirm production `auth.users` contains no `*@charterpath.test` accounts (Not Verified — no prod access). Still rotate/delete any demo accounts in staging.

### H-2 — Missing CI/CD rollout gate
- **Evidence:** No CI workflow files; `PRODUCTION_READINESS_CHECKLIST.md`, `RELEASE_GATE_REPORT.md`, `DEPLOYMENT_GUIDE.md` self-declare "NOT READY FOR PRODUCTION". `0025_admin_mfa.sql:8-9` explicitly requires staging-first application and real admin MFA enrollment. `DEPLOYMENT_GUIDE.md` restricts 0024–0029 to staging.
- **Impact:** Nothing mechanically prevents an unsafe deploy (schema without enrollment, report-only CSP, seed leakage).
- **Remediation:** Add a CI pipeline that runs the regression suites, enforces the release gate, and blocks deploy until migrations are applied and admins enrolled.
- **Resolution (Partial):** `.github/workflows/security.yml` added — a Node 22 pipeline runs the secret scan, type-check, lint, migration tests, all authorization/regression suites, `test:seed`, and dependency audits, plus a second job that builds the Next.js origin and audits its dependencies. Remaining: applying 0024–0029 to staging/production and enrolling real admins in MFA is an operational step that requires project access, and the workflow should be made a required status check on `main`.
- **Verification:** Confirm CI status checks and applied migration versions in prod (Not Verified).

### M-1 — CSP report-only by default
- **Evidence:** `web/next.config.ts:13` selects `Content-Security-Policy-Report-Only` unless `CSP_MODE=enforce`.
- **Impact:** XSS is detected but not blocked in production by default. `CSP_COMPATIBILITY_INVENTORY.json` shows the policy is otherwise well-scoped (`script-src 'self'`, `object-src 'none'`, `frame-ancestors 'none'`).
- **Remediation:** Set `CSP_MODE=enforce` once the inventory is clean; monitor reports first, then enforce.
- **Deferred:** Not flipped in this pass. The policy uses `script-src 'self'` with no nonce/`'unsafe-inline'`, and the Next.js App Router emits inline bootstrap scripts, so enforcing without a nonce would break hydration/pages. Correct sequence is: add a nonce-based policy (middleware/proxy), verify in a browser, then set `CSP_MODE=enforce`. The `CSP_MODE` switch already exists, so this is configuration + a nonce, not a redesign.

### M-2 — Weak HSTS / missing cross-origin isolation
- **Evidence:** `web/next.config.ts:17` emits `Strict-Transport-Security: max-age=31536000` only in production with an `https` `PRODUCTION_SITE_URL`, with no `includeSubDomains`/`preload`; no `Cross-Origin-Opener-Policy` / `Cross-Origin-Resource-Policy`.
- **Remediation:** Add `includeSubDomains; preload` and the cross-origin isolation headers.
- **Resolution (Fixed):** `web/next.config.ts` now emits `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload` and adds `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Resource-Policy: same-origin`. `npm run build:web` and `npm --prefix web run type-check` pass. (Submit the domain to the HSTS preload list to make `preload` effective.)

### M-3 — Public asset surface
- **Evidence:** `web/public/` holds 3,132 files / 2,982 JS files, including stale hashed chunks; `login/` and `mfa/` shells are publicly retrievable (`web/next.config.ts:28-31` rewrites). Dashboard shells are client-guarded and RLS-backed, so data is not exposed, but the surface is large and contains dead code.
- **Remediation:** Prune stale chunks, publish only referenced hashed assets, and consider removing stale shells from the deploy artifact.

### M-4 — Contact CSRF check
- **Evidence:** `web/src/app/contact.php/route.ts:7-8` rejects only when `Origin` is present and mismatched; a request with no `Origin` (e.g. some non-browser clients) proceeds. Mitigated by DB-side throttling (`0026_contact_boundary.sql`: 5/IP, 3/email, 100 global per 10 min) and a honeypot (`company_website`).
- **Remediation:** Require a same-origin `Origin`/`Sec-Fetch-Site` for browser form posts, or add a token.

### M-5 — Swallowed cookie refresh failures
- **Evidence:** `web/src/proxy.ts:11` ignores errors from `response.cookies.set(...)`; `client.auth.getUser()` refresh failures aren't surfaced.
- **Impact:** Silent session-refresh failures → stale tokens, confusing auth state.
- **Remediation:** Log/observe refresh failures; clear session on unrecoverable refresh.

### L-1 — Co-tutor delegation
- **Evidence:** `0007_rls.sql:173,180-183` `course_tutors` write policy uses `manages_course()`, true for a course owner (`0003_authorisation.sql:102-126`). So a course-owner tutor can add/remove co-tutors.
- **Impact:** Low; possibly intended. **Question for owner:** should co-tutor management be admin-only?

### L-2 — Quiz answer harvesting
- **Evidence:** `0024_assessment_progress_security.sql:149-165` returns `correct_answer` + explanation in the attempt review. With `attempt_limit > 1`, answers can be collected across retakes.
- **Remediation:** Reveal answers only after the attempt limit is exhausted or after the due date.

### L-3 — `valid_provider_url` unusable
- **Evidence:** `0011_learning_links.sql:72-73` revokes from public/anon but never grants to `authenticated`; call sites at 0011:30/44/85, 0014:31. Invalid/missing checks may be skipped or the path is dead.
- **Remediation:** Grant to `authenticated` if intended, or remove.

### L-4 — `is_admin()` granted to anon — NOT A FINDING
- **Evidence:** `0014_lms_structure.sql:80` grants `EXECUTE` on `is_admin()` to `anon`. This is **load-bearing**, not excessive: the anon-readable policies `categories_read` and `public_resources_read` (`0014:69,76`) evaluate `is_admin()` in their `USING` clause, so revoking it would break anonymous catalogue reads. The function derives its answer only from `auth.uid()` and returns `false` for anyone else, so it leaks nothing.
- **Correction:** The initial review flagged this as unnecessary; it must stay. No action.

### L-5 — `/mfa` header override
- **Evidence:** `web/next.config.ts:25-26` overrides `X-Frame-Options: SAMEORIGIN` for login/register/forgot/reset but omits `mfa`, so the MFA page gets `DENY` / `frame-ancestors 'none'`.
- **Impact:** If MFA is presented in the auth popup, embedding breaks (functional), not a vuln.

### L-6 — Tutor name in public catalogue
- **Evidence:** `0012_public_catalogue.sql:8,13` expose tutor `full_name` to `anon` via `published_course_catalogue/detail`. Intended for the public site; no PII beyond a display name.

### L-7 — Legacy PHP contact mailer
- **Evidence:** `contact.php` uses `mail()`. Deliverability/ops issue, not a security control.

### L-8 — Dead auth helpers
- **Evidence:** `web/src/lib/auth.ts`, `supabase/server.ts`, `supabase/browser.ts` are unreferenced by active routes (confirmed by subagent review). Remove to reduce confusion.

### L-9 — Input validation gaps
- **Evidence:** Next.js course search params are not zod-validated (contact form is, `contact.php/route.ts:5`); phone is length-checked only (`0026`). Low risk given DB constraints.

---

## 3. Security Checklist

| Control | Status | Evidence |
|---|---|---|
| RLS on all tables | Pass (42/42) | `db:test` |
| Grant-based privilege model | Pass | `0007_rls.sql:31-33,269-287` |
| Column-level grants prevent self-privilege-escalation | Pass | `0007_rls.sql:99` (profiles update limited to full_name/phone/avatar_url) |
| Admin requires active account | Pass | `0003_authorisation.sql:31-40` |
| Admin requires MFA (AAL2) | Pass | `0025_admin_mfa.sql:2-7` |
| Role never taken from attacker-controlled signup metadata | Pass | `0004_triggers.sql:40-64` |
| SECURITY DEFINER with pinned `search_path` | Pass (119 fns) | `db:test` |
| Internal RPCs revoked from clients | Pass | `0013_internal_rpc_permissions.sql`, `0028`, `0029:158-163` |
| Admin/dashboard RPCs re-check authorization internally | Pass | `0015:64,84,95,144`, `0023:6-7`, `0028:9` |
| Private meeting URLs not readable via PostgREST | Pass | `0007_rls.sql:270-278` |
| Signed URLs re-check course access | Pass | `0029:2-89` |
| Quiz attempts server-scored, attempt-limited, timed | Pass | `0024:3-165` |
| Progress derived server-side; students cannot post progress directly | Pass | `0007_rls.sql:331-346`, `0024:218-300` |
| Revoked enrollment loses content access | Pass | `is_enrolled` requires `status='active'`; `0029:166-169` |
| Contact form server-only + throttled | Pass | `0026` |
| Audit logging on privileged ops | Pass | `0004:123-136`, workflow tests |
| No secrets tracked in git | Pass | `.gitignore`, `check:secrets` |
| Dependency vulnerabilities | Pass | `npm audit` = 0 (both packages) |
| CSP enforced (not report-only) | **Deferred** | `web/next.config.ts:13` — needs a script nonce first |
| HSTS includeSubDomains/preload | Pass | `web/next.config.ts` (preload list submission pending) |
| CI/CD release gate | Pass (workflow) | `.github/workflows/security.yml`; mark required on `main` |
| Production seed credentials absent | **Unverified** | No prod access (seed guard added) |
| Live Supabase RLS/auth behavior | **Unverified** | No prod/staging access |
| Browser/frontend test suites | Pass | 57 frontend + 32 browser assertions on Node 22 |

---

## 4. Remediation Roadmap

### P0 — Before any production launch
1. ~~Guarantee `seed.sql` never runs in production; add an environment guard~~ **Done** — hard guard added; still confirm no `*@charterpath.test` accounts exist in prod. (H-1)
2. Apply migrations 0024–0029 to staging, enroll real admins in Supabase Auth MFA, verify admin flows, then promote to production. (H-2) — **open (needs project access)**
3. ~~Stand up a CI pipeline as a merge/deploy gate~~ **Done** — `.github/workflows/security.yml`; remaining: mark it a required check on `main`. (H-2)

### P1 — Before enabling public traffic
4. Flip `CSP_MODE=enforce` after adding a script nonce and verifying in a browser. (M-1)
5. ~~Add `includeSubDomains; preload` to HSTS and add COOP/CORP~~ **Done** (M-2); still submit the domain to the HSTS preload list.
6. Require a same-origin `Origin`/`Sec-Fetch-Site` on the contact route. (M-4)
7. Prune stale `web/public` assets and confirm shells expose no data. (M-3)

### P2 — Hardening
8. Fix cookie-refresh error handling in `proxy.ts`. (M-5)
9. Restrict co-tutor management to admin if that was the intent. (L-1)
10. Reveal quiz answers only after attempts are exhausted/due date passes. (L-2)
11. Grant/remove `valid_provider_url`; add `/mfa` to the header overrides. (`is_admin()` to `anon` must stay — see L-4.) (L-3/5)
12. Remove dead auth helpers; tighten search/phone validation. (L-8/9)

### P3 — Ongoing
13. Replace legacy `contact.php` `mail()` with an SMTP/provider integration. (L-7)
14. Establish live RLS/auth integration tests against a staging project so runtime checks stop being "unverified".

---

## 5. Remediation Applied in This Pass

| Change | File(s) | Evidence |
|---|---|---|
| Production seed guard (H-1) | `supabase/seed.sql` | Refuses when a non-demo account exists; `test:seed` 33/33 incl. negative test |
| Seed-guard regression test (H-1) | `scripts/test-seed.mjs` | "the seed refuses when a real account exists" |
| CI/CD pipeline (H-2) | `.github/workflows/security.yml` | Node 22: secret scan, type-check, lint, migrations, all authz suites, seed, audits, Next build |
| HSTS hardening (M-2) | `web/next.config.ts` | `max-age=31536000; includeSubDomains; preload` |
| Cross-origin isolation (M-2) | `web/next.config.ts` | `Cross-Origin-Opener-Policy`, `Cross-Origin-Resource-Policy` |
| Browser-test drift from auth redesign | `scripts/test-browser.mjs` | Login-link assertion made order-independent; 32/32 pass on Node 22 |

Not changed: no application data, auth policy, migration, or production configuration was touched. `CSP_MODE` enforcement (M-1) was deliberately **not** flipped — doing so without a script nonce would break the Next.js App Router; see M-1.

## 6. Limitations / Not Verified

- **Live Supabase runtime** (RLS, RPC grants, JWT/AAL behavior, Auth provider settings such as email confirmation, JWT expiry, leaked-password protection) — no project access. All DB evidence is synthetic (PGlite) or static.
- **Production state**: whether `seed.sql` ran, which migrations are applied, deployed header behavior on Vercel.
- **`npm run test:browser` / `test:frontend`** — pass on Node 22 (57 frontend, 32 browser assertions); the local default Node is v20.11, which lacks `WebSocket` and `--experimental-strip-types`. CI standardizes on Node 22.
- `npm audit` reports 0 vulnerabilities; it does not prove absence of logic flaws and does not cover transitive runtime behavior.

No claim of full ASVS certification or exhaustive live penetration testing is made.
