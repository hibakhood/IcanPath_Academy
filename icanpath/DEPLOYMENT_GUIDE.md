# Deployment and recovery guide

Production deployment is not authorized or performed by this work. These are operator instructions for a reviewed release.

## Local and isolated staging preparation

1. Preserve a durable encrypted/access controlled copy of the backup and hash manifest. The current /private/tmp backup is temporary. Create a reviewed source commit on codex/security-remediation after inspecting the previously untracked tree; exclude secrets and generated artifacts.
2. Identify the hosting and CI providers already used. None was found locally. Use scripts/verify-release.mjs as the provider-neutral automated check runner; protect production credentials and approval gates in the selected provider. Do not grant pull request jobs production secrets.
3. Configure an isolated staging Supabase project and synthetic accounts. Set public build variables and server-only settings described in ENVIRONMENT_CONFIGURATION_GUIDE.md. Keep preview off.
4. Inspect migration history and backups. Apply the new sequential 0024 through 0029 migrations using an approved Supabase migration process against staging only. Do not reset or replay old migrations onto production. Inspect Storage schema compatibility before applying bucket configuration.
5. Verify existing administrator factor enrollment and AAL2 using real Auth. Own profile/factor flow remains available at AAL1; protected admin controls remain denied. Rehearse recovery before production enforcement.
6. Run npm ci in the root and web directories using lockfiles, then npm run verify:release with required network access. It checks local types/lint/tests/migrations/build/dependencies/secrets and does not deploy. A supported browser runner and real staging acceptance are additional mandatory checks.
7. Start the production build behind the approved trusted HTTPS proxy. Configure the verified single-IP header and prevent public direct origin access; stripping spoofed incoming headers is mandatory. Check /api/health, contact success/failure/limits and all role workflows. No body, password, token, OTP, provider link or service secret should appear in logs.
8. Keep CSP_MODE=report-only during compatibility testing. Inspect browser violations using CSP_COMPATIBILITY_INVENTORY.json as the initial source map. Resolve nine executable inline scripts, static/runtime style attributes and Next bootstrap needs through reviewed extraction, hashes or nonce-compatible serving. Rebuild and repeat full workflows before CSP_MODE=enforce. No unsafe-eval/unsafe-inline fallback is supplied.

## Production approval gate

Only after staging passes, inspect actual Auth policy, redirects, email delivery, provider ACLs, TLS/DNS, backups, monitoring and deployment permissions. Replace example contact/domain values through a separate reviewed content/configuration change. Record the release commit, build checksum, migration versions, staging evidence, owner approval and planned maintenance/rollout window. Obtain explicit production migration/infrastructure/deployment approval. Apply through the approved pipeline; no automated deployment was added here.

## Smoke and monitoring

After an authorized release, check homepage/login/MFA, real Student/Tutor/Admin synthetic journeys, access revocation, recorded video, material downloads and live links. Confirm security headers at the edge and cache protections on private output. Monitor /api/health for liveness, plus synthetic service journeys for real readiness. Subscribe to provider Auth/database/Storage/backup alerts and administrator audit anomalies. Configure alert destinations and test delivery; the repository cannot prove alerts are active.

## Forward recovery and disaster recovery

Preserve all historical migrations and records. A previous UI build alone cannot undo changed function/policy contracts. Prepare a reviewed forward correction for any failing migration; never restore broad old grants or disable AAL2 merely to clear failures. Confirm migration transactional behavior in the deployment tooling before production application.

Document owner-approved RPO/RTO, backup retention, storage coverage and who can restore. Restore a verified backup to isolated staging, compare counts and sampled synthetic workflow integrity, then measure recovery time. Restoring production or deleting old resources requires separate approval. Database backups may not include Storage object bodies or external Drive/YouTube content; verify those independently. No destructive recovery rehearsal has been run against production.

## Deployment alternatives

The tested hardened public contact handler is the Next route. Static-only or legacy PHP deployments must be reviewed independently for security headers, shared abuse limits and safe mail configuration. Do not copy Next server-only secrets into static assets. Transactional email (welcome and password-changed) is handled by the Next routes described in the environment configuration guide; the Supabase Auth confirmation and reset emails must be connected to Resend through the Supabase SMTP integration. n8n remains a planned future integration rather than a launch prerequisite inferred from the original vision.
