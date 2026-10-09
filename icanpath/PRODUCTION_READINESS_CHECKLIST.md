# Production readiness checklist

Unchecked items are release blockers or explicit unresolved acceptance tasks. NOT READY FOR PRODUCTION.

## Verified locally

- [x] Backup snapshot, checksum manifest and dedicated branch created.
- [x] Historical migrations preserved; forward migration chain validates.
- [x] Quiz deadline/expiry and current access denial covered by regression tests.
- [x] Draft progress denied and aggregate scope consistent.
- [x] Administrator AAL2 enforcement and cross-role readers covered by synthetic claims.
- [x] Trusted contact path with persistent limits; direct client RPC denied.
- [x] Avatar ownership and active account policies tested locally.
- [x] Security headers on production-build responses; CSP report only.
- [x] Failed logout clears sensitive display and gives accurate state feedback.
- [x] Existing functional suites, TypeScript, lint and production build pass.
- [x] Dependency audits and scoped secret scan pass.
- [x] Public liveness route and provider-neutral release verification prepared.

## Staging and production acceptance

- [ ] Configure real isolated Supabase staging; preview off; Vite/Next project alignment verified.
- [ ] Complete Student registration through email/login/enrollment/content/assessments/progress/notifications/logout with real services.
- [ ] Complete Tutor application/approval/course/modules/recordings/materials/live classes/quiz/grading/review flow.
- [ ] Complete Administrator login/MFA/approvals/users/enrollment/payments where implemented/announcements/audit/settings/logout.
- [ ] Exercise mobile/tablet/desktop navigation and course video under report-only and then enforced CSP.
- [ ] Resolve inventoried inline script/style and Next bootstrap CSP violations without blanket unsafe allowances.
- [ ] Run real cross-role PostgREST, Realtime, Storage and bounded multi connection race tests.
- [ ] Verify image content validation and provider resource ACLs, not just filename/MIME metadata.
- [ ] Supply trusted proxy/IP hashing/server secret contact configuration; test distributed rate behavior and email-rotating sources.
- [ ] Verify production domain/TLS/DNS/HSTS and replace example domain/contact values.
- [ ] Verify email sender and Auth policy settings; test recovery and token revocation.
- [ ] Select existing CI/deployment provider; bind verify:release into protected CI and require human production approval. No new provider chosen without evidence.
- [ ] Set uptime checks for /api/health and synthetic login/content checks; health is process liveness only.
- [ ] Configure centralized redacted error logs and alerts for Auth failures, admin actions, backend errors and backup failures.
- [ ] Set owner-approved recovery objectives and rehearse isolated backup restore; record measured outcomes.
- [ ] Measure query plans, pagination, connection pooling and performance with representative synthetic data before optimization.
- [ ] Review privacy retention for contact messages, audit logs, photos and exports; no existing data has been purged automatically.
- [ ] Approve release only after outstanding high-risk and acceptance gates pass; separately authorize production changes.
