# Security remediation report

9 October 2026. Approved local remediation on branch `codex/security-remediation`. No production deployment, live database change or user data deletion occurred. The restricted backup and baseline are documented in SECURITY_BASELINE_REPORT.md. All 23 historical migrations are byte identical to the backup manifest. The original audit remains unchanged as historical evidence.

## Results

Confirmed assessment, progress and contact exploits are blocked in local regression tests. Administrator privilege now requires AAL2 in the database, and an authenticator enrollment/challenge page was added. A supplemental discovery found dashboard read functions missing role checks; these are now protected and directly tested. The existing UI and marketing files remain unchanged except for the small security flow additions. Marketing integrity: 14/14 frozen entries passed.

Final verdict: **NOT READY FOR PRODUCTION**. Local fixes are not evidence of live Supabase or deployment acceptance. CSP enforcement, image service behavior, real MFA, external provider permissions and operational controls remain launch gates.

## Findings re-audit

| Finding | Root cause and implementation | Verification | Status and remaining work |
|---|---|---|---|
| SEC-01 | Server only flagged late attempts. 0024 now denies start/resume/submission at or beyond due date or attempt expiry; server time checked after locks. Existing history preserved. | Timely start/resume/grade, deadline boundary, expired timer, duplicate denial, no late passing grade. | FIXED LOCALLY — STAGING VERIFICATION REQUIRED. Multi connection races and clock boundary transport behavior need staging. |
| SEC-02 | Submission omitted current enrollment/publication. 0024 locks active profile, course and enrollment while grading; 0029 restricts attempt/answer reads after revocation. | Cancelled enrollment, suspended student, course/quiz unpublication and revoked answer rows denied. | FIXED LOCALLY — STAGING VERIFICATION REQUIRED. Verify concurrent revocation and all transport paths. |
| SEC-03 | Draft completion accepted; aggregate scopes differed. 0024 and 0029 share published lesson/course scope in progress and dashboard read models. Both completion RPCs reject draft lessons. Existing certificate checks already require published course/lessons and remain intact. | Mixed visibility excludes old draft completions, duplicate completion safe, zero lessons returns zero, progress remains 100% at full published completion. | FIXED LOCALLY — STAGING VERIFICATION REQUIRED. Module membership is the accessible curriculum state; modules have no separate publication flag. |
| SEC-04 | Public direct RPC bypassed website limits. 0026 removes anon/authenticated execute, adds persistent atomic identity/source/global limits and service-only submission. Next route validates and hashes a single trusted proxy IP. | Direct RPC denial; varied email source limit; global cap; invalid fields; body size; foreign Origin; honeypot; mock valid route; 429 error mapping. | FIXED LOCALLY — STAGING VERIFICATION REQUIRED. Real server secret and trusted proxy configuration absent; local endpoint correctly returns 503. |
| SEC-05 | Admin role alone granted privileges. 0025 requires trusted JWT AAL2 for is_admin; protected policies/RPCs use this helper. 0028 guards dashboard readers. /mfa supports TOTP enrollment/challenge. Own profile remains available at AAL1. | AAL1 read/write denial; AAL2 permitted; students/tutors/suspended admin denied; authorized outstanding attempt closure. | FIXED LOCALLY — STAGING VERIFICATION REQUIRED. Synthetic claims do not prove real factor enrollment. Controlled rollout/recovery rehearsal mandatory. |
| SEC-06 | Browser size/MIME restrictions were insufficient. 0027 configures private bucket limit/MIME list and active own avatar writes with image metadata; legacy write policies cannot bypass avatar ownership. | Bucket fields, invalid MIME, cross user including admin writes and suspended upload denial. | PARTIALLY FIXED. Actual Storage enforcement, MIME/content sniffing and reencoding risk decision remain unverified. Filename and MIME metadata are not image-content proof. |
| SEC-07 | Security headers absent. Next headers now cover marketing and static role rewrites; CSP report only, frame denial, nosniff, referrer/permissions policies; HSTS gated to configured HTTPS production. | Seven production-build GET responses contained headers; no unsafe-inline or unsafe-eval. CSP inventory recorded nine executable scripts and 215 style attributes. | PARTIALLY FIXED. Inline/runtime style and Next bootstrap compatibility plus real HTTPS boundary must be verified before enforcing CSP. |
| SEC-08 | Proxy matcher did not match actual auth pages. Matcher aligns with login/register/recovery/MFA routes and documents public SPA shells. Private server helpers continue identity checks; database authorization is primary. | Safe auth redirects and direct shell HTTP tests pass; private data absent from unauthenticated shell responses. | FIXED LOCALLY — STAGING VERIFICATION REQUIRED. Real cookie/session expiry and refresh are outstanding. |
| SEC-09 | Legacy pointer policies/signing checked course only. 0027 adds resource visibility/review/cancellation checks; 0029 preserves live review guard in signer and blocks withdrawn resources. No old objects deleted. | Published pointer permitted; draft/cancelled pointer reads and signing denied; existing class approval regression preserved. | FIXED LOCALLY — STAGING VERIFICATION REQUIRED. Inventory actual objects, SDK signing and expiry/revocation behavior. Previously signed links may remain usable until expiry. |
| SEC-10 | Provider links can be copied. Current guarded resolver/provider validation retained; setup checklist documents external ACLs and limits. | Existing 28 provider link assertions passed; actual external account access not available. | BLOCKED — EXTERNAL CONFIGURATION REQUIRED. Link exclusivity cannot be guaranteed by the LMS. |
| SEC-11 | Production evidence unavailable. Added liveness route and provider-neutral release checks; deployment/environment/recovery/monitoring procedures delivered. | Production build, local liveness, dependency and scoped secret checks pass. | BLOCKED — EXTERNAL CONFIGURATION REQUIRED. No verified production Auth, DNS/TLS, email, backups, monitoring or real staging acceptance. |
| SEC-12 | Logout ignored returned error. Installed SDK removes local session on remote API errors but may return early on session errors. New handling clears dashboard and checks remaining session before stating local logout; unknown state reports failure honestly. | Mocked success/error, local cleanup, safe redirect and MFA routing passed. | FIXED LOCALLY — STAGING VERIFICATION REQUIRED. Real remote refresh-token reuse and network failure tests remain. |

### Supplemental dashboard authorization finding

The 0010 read models exposed global analytics and activity through SECURITY DEFINER functions without role checks. 0028 renames internal implementations, revokes browser execution and wraps public readers with active role/MFA checks. 0029 similarly protects tutor stats. Direct cross-role and AAL1 calls are denied in the regression suite. This additional issue is covered by the approved access-control scope; no unrestricted internal implementation is intentionally exposed.

## Changed files and migrations

Forward migrations: `0024_assessment_progress_security.sql`, `0025_admin_mfa.sql`, `0026_contact_boundary.sql`, `0027_storage_security.sql`, `0028_dashboard_rpc_guards.sql`, `0029_remaining_access_paths.sql`. They have only been applied to disposable local engines. Apply them to isolated staging before any production review.

Existing files changed relative to the baseline:

- `package.json`
- `eslint.config.js`
- `web/.env.example`
- `web/next.config.ts`
- `scripts/pg-harness.mjs`
- `scripts/test-domain-structure.mjs`
- `scripts/test-seed.mjs`
- `scripts/prepare-web.mjs`
- `assets/js/lms/auth.ts`
- `assets/js/lms/pages/auth-login.ts`
- `web/src/proxy.ts`
- `web/src/app/contact.php/route.ts`

New application/test tooling includes app/mfa/index.html, assets/js/lms/pages/auth-mfa.ts, web/src/app/api/health/route.ts, scripts/test-remediation.mjs, scripts/test-security-runtime.mjs, scripts/audit-csp.mjs, scripts/check-secrets.mjs and scripts/verify-release.mjs. No historical migration, marketing page or course catalogue was rewritten. No Git commit was created because the original tree is untracked; review the checksum-based change list and do not commit secrets.

## Behavior decisions

Deadlines are exclusive: at or beyond the limit, the server denies grading and does not delete or award an automatic result. Open expired attempts remain in history. An AAL2 administrator can close an outstanding attempt with a reason using admin_resolve_quiz_attempt; it does not invent a grade or reset a timer. A quiz-wide due date/time-limit change through existing authorized settings is an explicit extension affecting applicable attempts; there is no per-student hidden grace period. Tutors can offer another attempt through the approved attempt-limit workflow after closure. Confirm the product policy before adding granular per-student extensions.

Manual completion remains manual progress, not verified viewing attendance. Existing historical certificates/results are not revoked automatically by this migration.

Contact rate windows are ten minutes: three per email, five per hashed trusted source and 100 globally. These are initial protective limits, not measured production capacity; review legitimate traffic before changing them. Rotating IPs can still consume the global cap and affect availability. No CAPTCHA is claimed implemented. The Next route is the supported hardened deployment path. Legacy PHP hosting remains a separately reviewed alternative and must not be assumed equivalent to the Next shared counter model.

## Remaining launch requirements

See RELEASE_GATE_REPORT.md and PRODUCTION_READINESS_CHECKLIST.md. No browser end-to-end test with real accounts, real Storage integration, Realtime isolation or multi connection Postgres concurrency was performed. No claim of complete security or staging acceptance is made.
