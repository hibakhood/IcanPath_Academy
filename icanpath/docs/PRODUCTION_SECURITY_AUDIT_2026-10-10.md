# Production readiness and security audit

Date: 10 October 2026. Verdict: **Not ready for public production release.**

## Scope and evidence

Reviewed the current marketing and dashboard code, authentication and session storage, Next security headers, Vercel service configuration, contact handler, database migrations and storage access controls. Ran the local regression suites, dependency audits, production build, headless browser checks and production HTTP probes. No live Supabase, Vercel account, DNS, backup recovery or external penetration test was performed. No production database changes were made. Mocked and synthetic tests do not prove deployed policies are correct.

## Results

20 of 21 local command checks passed. Browser suite: 32 assertions passed on an isolated Vite server. Database security remediation suite: 197 synthetic assertions passed. Both dependency audits returned success. The original localhost:3101 browser attempt failed before application checks; the isolated server retry passed.

## Findings and release blockers

1. **High: deployed backend security is unverified.** Local environment files only configure preview mode. Confirm actual Supabase project variables, deploy the complete migration chain to staging and test real student, tutor, pending tutor and admin accounts. Verify admin MFA, enrollment restrictions, unpublished content denial, grading authorization, private storage and signed links. Local tests cover these boundaries synthetically; they are not proof of production deployment.
2. **High operational blocker: contact form fails closed without configuration.** Production build POST /contact.php returns 503 with the current environment. Supply server-only service credentials, a trusted platform IP header and a strong hash secret, then test delivery and persistent rate limits. Cross-origin probe returns 403 as expected.
3. **Medium: Content Security Policy is report-only.** Production HTTP probes confirm there is no enforced CSP. Inline script/style dependencies need compatibility work and staging validation before enforcement. Do not enable enforcement blindly: it can break marketing and popup styling.
4. **Medium: release gate fails on an outdated marketing baseline.** verify:frozen reports 10 changed files, consistent with approved recent marketing edits. Review those changes and update the baseline intentionally. Do not disable the check or silently accept every difference.
5. **Medium operational blocker: placeholder contact and domain values remain.** Marketing links still use icanpath.example and the placeholder phone 2348000000000. Replace with verified domain, email and phone information and check privacy, terms and refund links before launch.
6. **Medium operational validation: HSTS includes subdomains and preload.** The configured header is conditional on a production HTTPS origin. Confirm every relevant subdomain supports HTTPS before enabling this value; no DNS or subdomain validation was available locally.
7. **Unverified deployment: Vercel services build and runtime.** JSON paths exist, but no actual Vercel service deployment was exercised. Two services are configured with all public traffic entering web. Both may build the parent Vite assets, so verify isolated service behavior and generated assets during a preview deployment.
8. **Remaining verification: session persistence and recovery.** Remember me uses localStorage; unselected uses sessionStorage. Browser checks exercise rendering and popup controls, not a real login, token refresh across tabs, browser restart, password reset email or MFA recovery. These require real staging accounts. Browser token storage makes XSS prevention especially important.

## Confirmed local protections

Data rendering helpers use text nodes for user content. The reviewed contact endpoint validates input, bounds request bodies and uses a server-only database call. Regression checks cover role restrictions, tutor ownership, enrollment and publication gates, assessment deadlines, private storage and admin AAL2 requirements. Production HTTP checks return DENY for normal page framing and SAMEORIGIN only for the approved authentication routes. Dashboard HTML shells are public; database policies, not possession of the HTML route, protect learning data. A 200 response for an admin shell does not grant admin access.

## Required next steps

Configure a staging deployment with real Supabase settings. Verify migrations, storage policies and real role/MFA workflows there. Replace contact placeholders, test contact delivery and rate limiting, reconcile the approved marketing baseline, and complete CSP compatibility before enforcing it. Test provider email delivery, backups and restore, deployment monitoring, and mobile browser behavior. Repeat the release gate after the fixes and staging acceptance. Do not treat this report as certification that no other vulnerability exists.
