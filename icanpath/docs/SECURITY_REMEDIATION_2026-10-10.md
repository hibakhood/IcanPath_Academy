# Security follow-up, 10 October 2026

## Completed locally

Removed executable inline marketing scripts and centralized copyright updates. Enforced Content Security Policy by default with self-hosted scripts and SHA-256 hashes for structured data. Added per-request nonces and no-store responses for native Next /courses pages. Kept the approved same-origin authentication framing exception and DENY elsewhere. Inline CSS remains explicitly allowed for existing style attributes and popup styles; script unsafe-inline is not permitted. Production does not allow unsafe-eval. Development allows unsafe-eval for framework debugging only.

Narrowed HSTS to the HTTPS host without unverified subdomain/preload directives. Updated public URLs to https://icanpathacademy.vercel.app. Reconciled the approved marketing baseline. Added Vercel-only trusted IP header selection for the contact endpoint; non-Vercel hosts still require an explicit trusted header.

Validation: production build and type checks passed. Lint passed. 57 frontend checks passed. 15 runtime security checks passed. 32 browser checks passed against the built production server with CSP enforced. HTTP checks verified enforced CSP, authentication framing, unique Next rendering nonce matching page markup and no-store behavior. The baseline now passes 14/14 files. No new database migrations were needed.

## Live deployment observations

The supplied Vercel homepage responds 200 and includes Supabase connectivity settings, but its currently deployed policy is report-only. An empty contact request returns 503 before storing data. These local changes are not yet deployed by this task. The user reports all migrations have run; their deployed role and MFA behavior has not been independently verified with real accounts.

## Vercel settings to complete

Redeploy these source changes. Set CSP_MODE=enforce (or remove the old report-only override). Set PRODUCTION_SITE_URL=https://icanpathacademy.vercel.app. Verify SUPABASE_SERVICE_ROLE_KEY is a server-only key for the same project as NEXT_PUBLIC_SUPABASE_URL. Add CONTACT_IP_HASH_SECRET using a cryptographically random secret of at least 32 characters. CONTACT_TRUSTED_IP_HEADER may be omitted on Vercel or set to x-vercel-forwarded-for. Do not use NEXT_PUBLIC_ or VITE_ prefixes for private settings. Public build settings VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must point to the same project as their NEXT_PUBLIC counterparts. VITE_PREVIEW_MODE must be off for production.

After redeployment, test a valid enquiry, persistent rate limits, email confirmation and reset, Remember me, token refresh, student enrollment restrictions, pending tutor access denial and admin MFA with real accounts. Verify private storage and signed URL expiry. Test monitoring and restore procedures.

Public email and phone values are intentionally deferred at the user's request and must be replaced before public enrolment. No private settings, deployed migrations or actual account data were modified during this task. Live credentials and authenticated provider access were not available, so live configuration and account testing remain open.

References: https://vercel.com/docs/headers/request-headers and installed Next CSP documentation.
