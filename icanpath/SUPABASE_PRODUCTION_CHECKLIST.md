# Supabase production checklist

All control-plane items below are **NOT VERIFIED**. Local migration tests do not inspect a live project.

- [ ] Confirm separate isolated staging and production project IDs with the operator before any mutation.
- [ ] Set real HTTPS site URL and exact login/recovery redirect allowlist; remove unnecessary wildcard/localhost production entries.
- [ ] Enable email confirmation, supported password/leaked-password protection and suitable login/signup/reset rate limits.
- [ ] Test confirmation, recovery, enumeration resistance, session lifetime, refresh rotation and global logout with synthetic accounts.
- [ ] Enroll and verify administrator TOTP in controlled rollout; test actual AAL2 claims, downgrade and expiry. Preserve own account enrollment access.
- [ ] Prepare MFA recovery through a trusted operator with independent identity verification, two person approval where available, recorded factor reset and immediate reenrollment. Do not add a web privilege bypass or disable is_admin assurance.
- [ ] Verify bootstrap_admin remains inaccessible to anon/authenticated and is executed only by a trusted operator. Never create admin via signup metadata.
- [ ] Apply 0024 through 0029 only to isolated staging first. Inspect all RLS, function grants and exposed schemas against the release inventory.
- [ ] Test all four roles and two distinct students/tutors through PostgREST, including direct RPC calls and Realtime isolation.
- [ ] Verify private bucket 5 MB limit and MIME configuration, image metadata policy compatibility, content sniffing and actual invalid image rejection. text/plain remains needed for old pointer files.
- [ ] Inventory legacy pointer objects read-only; verify draft, pending review and cancelled classes cannot be listed/read/signed by students. Existing signed URLs can outlive revocation until expiry.
- [ ] Verify published access and all upload/replace/read operations using real Storage. Decide trusted reencoding before accepting untrusted image bytes.
- [ ] Verify service secret limited to server secret store; contact RPC denied to anon and authenticated.
- [ ] Verify database indexes/query plans and pooling/connection caps under representative synthetic volume.
- [ ] Verify Auth SMTP sender delivery and domain SPF/DKIM/DMARC; existing provider mail capability is not assumed.
- [ ] Confirm backup/PITR availability and retention for the actual plan; restore to isolated staging and document measured recovery times.
- [ ] Review Auth failure, administrator audit, database/Storage failure and backup failure alerts; prove notifications reach the responsible operator.

External content setup: restrict Drive to authorized Google accounts where practical; verify Google Forms identity and access; use Meet/Zoom waiting rooms, host admission and appropriate recording permissions; set YouTube privacy consciously. Test with an unauthorized external account. LMS enrollment cannot revoke a copied provider link by itself.
