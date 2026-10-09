# ICANPATH Academy Security Audit Report

Audit date: 9 October 2026. Scope: local source, all 23 migrations, synthetic database tests, local HTTP responses and production build. No production data was accessed. No application source, authentication policy or migration was modified. Build output and audit artifacts were generated.

## Executive Summary

**NOT READY FOR PRODUCTION.** Existing authorization tests are strong and all 41 public tables have RLS enabled. No exposed secret or unrestricted administrator operation was confirmed. However, supplemental tests reproduced assessment timing, revoked enrollment and draft progress failures. Administrator operations lack MFA assurance enforcement. Anonymous contact abuse controls are bypassable. Live authentication, provider sharing and production recovery remain unverified.

Passing repository tests does not override the newly reproduced failures. No claim of full ASVS certification or exhaustive live penetration testing is made.

## Application security inventory

Inspected root: `/Users/kakanfoinn/Documents/Projects/icanpath-academy/icanpath`. Paths below refer to this root.

| Component | Actual implementation and trust boundary |
|---|---|
| Frontend | Static marketing HTML and Vite TypeScript dashboard SPA; Next.js wrapper and some React pages. Not a fully SSR dashboard application. |
| Frameworks | Next.js 16.4.0, React 19.2, Tailwind 4, Radix Slot and Zod. Most existing dashboard markup is custom rather than a complete shadcn component migration. |
| Authentication | Supabase browser authentication with persistent browser sessions; SSR cookie helpers exist but the active dashboard rewrite serves a static shell. Database auth.uid derives identity from the request JWT. |
| Database | 41 public tables; 76 public policies and 9 Storage policies; 105 SECURITY DEFINER functions, all with explicit search_path. Actual provider configuration may differ from migrations. |
| Anonymous RPCs | is_admin (boolean only), published_course_catalogue, published_course_detail, submit_contact_message. Raw lessons access was denied in the synthetic anonymous probe. |
| Content | YouTube embeddings and provider links for Drive, Forms, Meet, Zoom and YouTube Live. Private learning_links table plus guarded resolver RPCs; legacy private Storage pointer files remain supported. |
| Uploads | lms-private bucket: profile photos and legacy pointer objects, controlled by path and ownership policies. Provider file service not exercised. |
| Email and automation | No implemented n8n or Resend integration found. Supabase Auth email delivery requires provider configuration. No webhook endpoints to validate for those absent integrations. |
| Additional domains | Native quizzes, written submissions, external assessments, notifications, inbox, certificates, payment ledger, tutor earnings, audit logs and report snapshots exist. |
| Backend routes | Next POST /contact.php; most sensitive dashboard operations are Supabase RPCs or RLS constrained table operations. Legacy contact.php also exists for PHP hosting; the local Next deployment uses the route handler. |

### Roles and sensitive operations

| Actor | Authorized intent | Enforcement inspected |
|---|---|
| Anonymous | Marketing, published catalogue, registration, login, password recovery, public enquiry | Restricted catalogue projections and contact RPC; provider Auth configuration not verified |
| Student | Own profile, enrollment, course resources, own attempts/submissions/progress, notifications | auth.uid, active account and course enrollment checks in RLS/RPCs; exceptions SEC-01 through SEC-03 |
| Pending tutor | Submit application and update own application/profile; no teaching access | Tutor status checks and review workflow tested locally |
| Active tutor | Manage assigned courses/modules/lessons, links and schedules; grade assigned students; submit courses for review | Course ownership/assignment checks; self approval and other course changes denied in existing tests |
| Admin | Review tutors/courses, manage users/enrollments, announcements, moderation, reporting and settings | Database role and active status checks; account bootstrap is privileged; no AAL2 enforcement |
| service_role | Trusted administration and server operations only | Bypasses RLS by design; must never be in the browser. No exposed service key found in scoped scan |

### Route inventory

Static role routes below are UI shells, not authorization endpoints. Some are retired or redirecting pages. Sensitive information must remain protected at the database boundary. Query parameters such as course IDs require the same checks as any direct API call.

- **student:** `/student/activity`, `/student/announcements`, `/student/assessments`, `/student/assignments`, `/student/browse`, `/student/certificates`, `/student/course`, `/student/courses`, `/student/dashboard`, `/student/lesson`, `/student/live`, `/student/materials`, `/student/messages`, `/student/performance`, `/student/practice-quizzes`, `/student/profile`, `/student/progress`, `/student/questions`, `/student/quiz`, `/student/quizzes`, `/student/search`, `/student/written-assignments`.
- **tutor:** `/tutor/activity`, `/tutor/announcements`, `/tutor/assessments`, `/tutor/assignments`, `/tutor/attempts`, `/tutor/course`, `/tutor/courses`, `/tutor/dashboard`, `/tutor/earnings`, `/tutor/grading`, `/tutor/lessons`, `/tutor/live`, `/tutor/materials`, `/tutor/messages`, `/tutor/performance`, `/tutor/profile`, `/tutor/questions`, `/tutor/quizzes`, `/tutor/reviews`, `/tutor/search`, `/tutor/students`.
- **admin:** `/admin/announcements`, `/admin/assessments`, `/admin/audit`, `/admin/course`, `/admin/courses`, `/admin/dashboard`, `/admin/enrollments`, `/admin/live`, `/admin/messages`, `/admin/moderation`, `/admin/notifications`, `/admin/payments`, `/admin/performance`, `/admin/profile`, `/admin/reports`, `/admin/review`, `/admin/search`, `/admin/settings`, `/admin/students`, `/admin/tutors`, `/admin/users`.
- **Authentication:** `/login`, `/register`, `/forgot-password`, `/reset-password`, `/pending`, `/suspended`.
- **Public:** root marketing HTML pages, `/courses`, catalogue pages and `POST /contact.php`.

### Database inventory and access map

All listed tables have RLS enabled in the migrated local engine. Policy names describe the code access map; full SELECT/INSERT/UPDATE/DELETE expressions, WITH CHECK conditions, grants and function permissions are included in `SECURITY_AUDIT_INVENTORY.json`. Grants alone never mean a row is accessible. Tables with no client grant/policy are accessed through restricted RPCs.

**Coverage limit:** every table and policy was inventoried; existing suites exercise representative anonymous/student/tutor/admin and cross ownership operations. This is not a claim that all four roles performed every CRUD operation on every table. Full live PostgREST, Realtime and Storage matrix tests remain outstanding.

| Table | RLS | Client table grants | Policy access map |
|---|---|---|---|
| admin_report_runs | Yes | authenticated: SELECT | SELECT: admin_read |
| announcements | Yes | authenticated: DELETE,SELECT | DELETE: announcements_delete; INSERT: announcements_insert; SELECT: announcements_select; UPDATE: announcements_update |
| assignment_submissions | Yes | authenticated: SELECT | SELECT: assignment_submissions_select; UPDATE: assignment_submissions_update |
| assignments | Yes | authenticated: DELETE,SELECT | DELETE: assignments_delete; INSERT: assignments_insert; SELECT: assignments_select; UPDATE: assignments_update |
| audit_logs | Yes | authenticated: SELECT | SELECT: audit_logs_select |
| contact_messages | Yes | authenticated: SELECT | ALL: contacts_admin |
| content_reports | Yes | authenticated: SELECT | SELECT: admin_read |
| course_categories | Yes | anon: SELECT; authenticated: DELETE,INSERT,SELECT,UPDATE | ALL: categories_manage; SELECT: categories_read |
| course_certificates | Yes | authenticated: SELECT | SELECT: certificates_read |
| course_enrollments | Yes | authenticated: DELETE,SELECT | DELETE: course_enrollments_delete; SELECT: course_enrollments_select |
| course_questions | Yes | authenticated: SELECT | SELECT: questions_read |
| course_reviews | Yes | authenticated: SELECT | SELECT: reviews_read |
| course_tutors | Yes | authenticated: DELETE,INSERT,SELECT | SELECT: course_tutors_select; ALL: course_tutors_write |
| courses | Yes | authenticated: DELETE,SELECT | DELETE: courses_delete; INSERT: courses_insert; SELECT: courses_select; UPDATE: courses_update |
| external_assessments | Yes | No table grants to anon/authenticated | No client policy; RPC only |
| external_submissions | Yes | No table grants to anon/authenticated | No client policy; RPC only |
| ican_curriculum_templates | Yes | authenticated: SELECT | SELECT: curriculum_read |
| inbox_messages | Yes | authenticated: SELECT | SELECT: inbox_own; UPDATE: inbox_read_receipt |
| learning_events | Yes | authenticated: SELECT | SELECT: events_read |
| learning_links | Yes | No table grants to anon/authenticated | No client policy; RPC only |
| lesson_materials | Yes | authenticated: DELETE,SELECT | DELETE: lesson_materials_delete; INSERT: lesson_materials_insert; SELECT: lesson_materials_select; UPDATE: lesson_materials_update |
| lesson_progress | Yes | authenticated: SELECT,UPDATE | SELECT: lesson_progress_select; UPDATE: lesson_progress_update |
| lessons | Yes | authenticated: DELETE,SELECT | DELETE: lessons_delete; INSERT: lessons_insert; SELECT: lessons_select; UPDATE: lessons_update |
| live_class_requests | Yes | authenticated: SELECT | SELECT: admin_read |
| live_classes | Yes | authenticated: DELETE | DELETE: live_classes_delete; INSERT: live_classes_insert; SELECT: live_classes_select; UPDATE: live_classes_update |
| modules | Yes | authenticated: DELETE,SELECT | DELETE: modules_delete; INSERT: modules_insert; SELECT: modules_select; UPDATE: modules_update |
| monitoring_snapshots | Yes | authenticated: SELECT | SELECT: admin_read |
| notifications | Yes | authenticated: SELECT | SELECT: notifications_select; UPDATE: notifications_update |
| payment_ledger | Yes | authenticated: SELECT | SELECT: admin_read |
| platform_settings | Yes | authenticated: INSERT,SELECT,UPDATE | ALL: settings_admin |
| profiles | Yes | authenticated: SELECT | SELECT: profiles_select; UPDATE: profiles_update_own |
| public_resources | Yes | anon: SELECT; authenticated: DELETE,INSERT,SELECT,UPDATE | ALL: public_resources_manage; SELECT: public_resources_read |
| quiz_answers | Yes | authenticated: SELECT | SELECT: quiz_answers_select |
| quiz_attempt_reviews | Yes | authenticated: SELECT | SELECT: quiz_reviews_read |
| quiz_attempts | Yes | authenticated: SELECT | SELECT: quiz_attempts_select |
| quiz_questions | Yes | authenticated: DELETE | DELETE: quiz_questions_delete; INSERT: quiz_questions_insert; SELECT: quiz_questions_select; UPDATE: quiz_questions_update |
| quizzes | Yes | authenticated: DELETE,SELECT | DELETE: quizzes_delete; INSERT: quizzes_insert; SELECT: quizzes_select; UPDATE: quizzes_update |
| student_profiles | Yes | authenticated: INSERT,SELECT,UPDATE | SELECT: student_profile_read; ALL: student_profile_write |
| tutor_applications | Yes | authenticated: SELECT | SELECT: tutor_applications_select |
| tutor_earning_entries | Yes | authenticated: SELECT | SELECT: earnings_read |
| tutor_profiles | Yes | authenticated: INSERT,SELECT,UPDATE | SELECT: tutor_profile_read; ALL: tutor_profile_write |

SECURITY DEFINER functions were checked for explicit search_path and anonymous execute grants. This does not establish that every function has correct business logic: the confirmed assessment failures are in definer functions. SQL triggers derive creator/ownership values, protected columns have restricted grants, and score/feedback writes use authorized RPCs. No client supplied administrator role promotion was observed in the tested paths.

## Security Findings

### SEC-01: Quiz deadlines and timers do not prevent a passing result

- **Severity:** High
- **Status:** Confirmed
- **Affected location:** [supabase/migrations/0006_functions.sql:333](/Users/kakanfoinn/Documents/Projects/icanpath-academy/icanpath/supabase/migrations/0006_functions.sql:333); [supabase/migrations/0006_functions.sql:432](/Users/kakanfoinn/Documents/Projects/icanpath-academy/icanpath/supabase/migrations/0006_functions.sql:432)
- **Evidence:** A synthetic quiz with due_at one day in the past allowed start. An attempt started one hour earlier, with a one minute limit, returned percentage=100, passed=true and time_limit_exceeded=true.
- **Description and realistic scenario:** A learner can keep answering after the allowed time and receive a normal passing result. The flag is informational; the server never enforces the limit or due date. This concerns native quizzes, not Google Forms.
- **Business impact:** Unfair results and unreliable examination preparation scores.
- **Recommended remediation:** Enforce due_at before starting and submitting; calculate the permitted deadline from server timestamps. Apply the agreed late submission rule before grading, with a transaction and existing locks preserved.
- **Verification:** Test before, at and after the deadline; expired attempts must not obtain a normal passing result. Test resumed attempts and concurrent requests.

### SEC-02: Quiz submission continues after enrollment is cancelled

- **Severity:** Medium
- **Status:** Confirmed
- **Affected location:** [supabase/migrations/0006_functions.sql:394](/Users/kakanfoinn/Documents/Projects/icanpath-academy/icanpath/supabase/migrations/0006_functions.sql:394)
- **Evidence:** After creating an in progress attempt, the synthetic enrollment was changed to cancelled. submit_quiz_attempt still returned 100%, passed=true and the answer review.
- **Description and realistic scenario:** Submission verifies the active account and ownership of the attempt but does not recheck current enrollment and quiz publication. A learner whose course access is revoked can finish an old attempt.
- **Business impact:** Assessment access and answer review remain available after course access is removed.
- **Recommended remediation:** Recheck enrollment, course access and quiz publication inside the submission transaction before grading or returning answers. Define how administrators close outstanding attempts.
- **Verification:** Start an attempt, cancel enrollment, submit and expect denial. Repeat after unpublishing the quiz or course, and with a suspended account.

### SEC-03: Students can complete unpublished lessons

- **Severity:** Medium
- **Status:** Confirmed
- **Affected location:** [supabase/migrations/0006_functions.sql:164](/Users/kakanfoinn/Documents/Projects/icanpath-academy/icanpath/supabase/migrations/0006_functions.sql:164); [supabase/migrations/0006_functions.sql:212](/Users/kakanfoinn/Documents/Projects/icanpath-academy/icanpath/supabase/migrations/0006_functions.sql:212)
- **Evidence:** set_lesson_progress(unpublished_lesson_id,100) succeeded for an enrolled student. The stored record had completed=true and progress_percentage=100.
- **Description and realistic scenario:** The function checks enrollment but not lesson publication. The completion numerator and published lesson denominator use different scopes. Progress is otherwise self reported, so it must not be presented as proof of video attendance.
- **Business impact:** Inaccurate progress and possible inflated aggregates. Values above 100% are a code inference, not a separately reproduced result.
- **Recommended remediation:** Require published, accessible lessons and use the same published lesson scope for both aggregate counts. Keep manual completion if intended, but describe it accurately.
- **Verification:** Reject progress changes for draft lessons; verify published lesson completion still works; add mixed draft and published aggregation tests.

### SEC-04: Anonymous contact RPC permits rate limit bypass

- **Severity:** Medium
- **Status:** Confirmed
- **Affected location:** [supabase/migrations/0014_lms_structure.sql:94](/Users/kakanfoinn/Documents/Projects/icanpath-academy/icanpath/supabase/migrations/0014_lms_structure.sql:94); [web/src/app/contact.php/route.ts:4](/Users/kakanfoinn/Documents/Projects/icanpath-academy/icanpath/web/src/app/contact.php/route.ts:4)
- **Evidence:** Four anonymous calls with four distinct synthetic email addresses succeeded. The RPC limit is three messages per supplied email in ten minutes. It is executable by anon.
- **Description and realistic scenario:** An attacker can call the RPC directly and rotate email addresses. The website origin check and honeypot do not protect this direct path. Only four safe local calls were made; no load test was performed.
- **Business impact:** Spam, administrator workload and growing database costs.
- **Recommended remediation:** Validate a server verified abuse challenge and enforce trusted source and global limits. Restrict database execution to the trusted submission path once that path exists; do not merely add a browser check.
- **Verification:** Test direct RPC calls cannot bypass the trusted checks. Test repeated and varied emails, valid messages and distributed abuse limits.

### SEC-05: Administrator operations do not require MFA assurance

- **Severity:** High
- **Status:** Confirmed
- **Affected location:** [supabase/migrations/0006_functions.sql:661](/Users/kakanfoinn/Documents/Projects/icanpath-academy/icanpath/supabase/migrations/0006_functions.sql:661); [assets/js/lms/auth.ts:91](/Users/kakanfoinn/Documents/Projects/icanpath-academy/icanpath/assets/js/lms/auth.ts:91)
- **Evidence:** Administrator checks use role and active status. No MFA enrollment, challenge or AAL2 enforcement was found in application authentication or migrations.
- **Description and realistic scenario:** A stolen administrator password or single factor session can perform powerful approvals and management operations. This is a missing control, not evidence of a compromised account. Provider console MFA is a separate control and was not verified.
- **Business impact:** Broad platform control after administrator account takeover.
- **Recommended remediation:** Add administrator MFA enrollment and challenge, then enforce verified AAL2 for sensitive RPCs and policies using trusted JWT assurance. Include controlled recovery and bootstrap procedures.
- **Verification:** An active admin at AAL1 must be denied sensitive operations; the same admin at AAL2 must succeed. Test recovery, expiry and direct RPC calls.

### SEC-06: Profile photo size and content controls are only visible in the browser

- **Severity:** Medium
- **Status:** Potential
- **Affected location:** [assets/js/lms/api.ts:56](/Users/kakanfoinn/Documents/Projects/icanpath-academy/icanpath/assets/js/lms/api.ts:56); [supabase/migrations/0020_profile_avatars.sql:11](/Users/kakanfoinn/Documents/Projects/icanpath-academy/icanpath/supabase/migrations/0020_profile_avatars.sql:11); [supabase/migrations/0008_storage.sql:15](/Users/kakanfoinn/Documents/Projects/icanpath-academy/icanpath/supabase/migrations/0008_storage.sql:15)
- **Evidence:** The browser enforces image MIME types and 5 MB. Repository bucket creation does not specify file_size_limit or allowed_mime_types. RLS checks ownership and filename extension. Actual Storage service limits were not accessible.
- **Description and realistic scenario:** A direct upload may bypass browser size and MIME validation. Filename extensions do not verify image contents. No stored XSS, malicious file serving or unlimited provider upload was demonstrated.
- **Business impact:** Unexpected storage consumption and untrusted files.
- **Recommended remediation:** Verify and configure bucket limits; validate or reencode image content through a trusted upload path if stronger assurance is required. Review active account requirements and cleanup of replaced photos.
- **Verification:** Use a staging Storage API to reject oversized files, mismatched MIME types and invalid image bytes while accepting valid images. Test cross user uploads.

### SEC-07: Application responses lack browser security headers

- **Severity:** Medium
- **Status:** Confirmed
- **Affected location:** [web/next.config.ts:3](/Users/kakanfoinn/Documents/Projects/icanpath-academy/icanpath/web/next.config.ts:3)
- **Evidence:** Local GET /index.html and /admin/dashboard returned no CSP, frame protection, nosniff, Referrer Policy or Permissions Policy. Next configuration contains no headers function.
- **Description and realistic scenario:** Pages lack application supplied clickjacking and browser containment controls. This does not prove an exploitable XSS. A production edge may add headers, but that was not available to inspect.
- **Business impact:** Greater impact if an injection occurs; possible framing of authenticated controls.
- **Recommended remediation:** Add tested security headers and a CSP compatible with Supabase connections, YouTube embeds and existing scripts. Start CSP in report only mode, resolve violations, then enforce. Apply HSTS at the verified HTTPS production boundary.
- **Verification:** Inspect production responses, test attempted framing, and exercise login, video playback, forms and dashboards under enforced CSP. Local HTTP cannot verify TLS or HSTS deployment.

### SEC-08: SSR refresh proxy does not match the active authentication routes

- **Severity:** Low
- **Status:** Confirmed
- **Affected location:** [web/src/proxy.ts:15](/Users/kakanfoinn/Documents/Projects/icanpath-academy/icanpath/web/src/proxy.ts:15); [web/next.config.ts:6](/Users/kakanfoinn/Documents/Projects/icanpath-academy/icanpath/web/next.config.ts:6)
- **Evidence:** Proxy matcher is /auth/:path*, while login and registration rewrites use /login and /register and dashboards use role routes. An unauthenticated GET /admin/dashboard returned a static shell without personal data.
- **Description and realistic scenario:** The SSR helper does not establish a protection boundary for these static dashboards. They depend on browser guards and database authorization. Browser session refresh is enabled, so a refresh failure in active dashboards was not reproduced.
- **Business impact:** Confusing security assumptions and future risk if private server content is added under these routes.
- **Recommended remediation:** Document the SPA security boundary. If SSR protection is intended, align matcher and routes, verify identity server side, and prevent personalized response caching. Preserve database authorization either way.
- **Verification:** Verify matching routes run the proxy and private server output is denied without a valid user. A public empty dashboard shell alone is not a data exposure.

### SEC-09: Legacy Storage pointer read policy ignores resource publication and cancellation

- **Severity:** Medium
- **Status:** Potential
- **Affected location:** [supabase/migrations/0008_storage.sql:88](/Users/kakanfoinn/Documents/Projects/icanpath-academy/icanpath/supabase/migrations/0008_storage.sql:88); [supabase/migrations/0011_learning_links.sql:1](/Users/kakanfoinn/Documents/Projects/icanpath-academy/icanpath/supabase/migrations/0011_learning_links.sql:1)
- **Evidence:** The legacy read policy authorizes materials and live pointer objects at course level. It does not join the referenced resource to check publication or cancellation. Later migrations introduce guarded learning link RPCs while retaining legacy storage paths.
- **Description and realistic scenario:** If old private pointer files remain, an enrolled learner may read a draft material or cancelled meeting pointer through Storage rather than the new resolver. No live bucket objects or file contents were accessible to confirm this condition.
- **Business impact:** Conditional disclosure of withdrawn educational resources or meeting links.
- **Recommended remediation:** Inventory existing pointer objects and readers. Make legacy reads check the referenced record and its visibility, or retire the legacy path after a verified migration. Do not delete data blindly.
- **Verification:** Seed draft and cancelled pointers in staging; confirm direct Storage listing and signed download are denied while current authorized resources remain accessible.

### SEC-10: External links remain transferable outside the LMS

- **Severity:** Informational
- **Status:** Confirmed
- **Affected location:** [assets/js/lms/youtube.ts:1](/Users/kakanfoinn/Documents/Projects/icanpath-academy/icanpath/assets/js/lms/youtube.ts:1); [supabase/migrations/0011_learning_links.sql:54](/Users/kakanfoinn/Documents/Projects/icanpath-academy/icanpath/supabase/migrations/0011_learning_links.sql:54)
- **Evidence:** The app resolves provider links after access checks. YouTube, Drive, Meet and Zoom retain their own access rules; links or video IDs are necessarily available to the authorized browser.
- **Description and realistic scenario:** An authorized learner can share a provider link. Whether another person can use it depends on provider sharing, meeting and account settings. No actual provider ACLs were inspected.
- **Business impact:** LMS enrollment alone cannot guarantee exclusive access to external content.
- **Recommended remediation:** State this limit accurately. Configure Drive membership, meeting waiting rooms and host controls; use stronger video hosting if exclusive playback is required.
- **Verification:** Test each real provider resource as an unauthorized provider account and after LMS enrollment cancellation; record the residual external access.

### SEC-11: Production identity, recovery and operational settings are not verified

- **Severity:** High
- **Status:** Not Verified
- **Affected location:** [web/.env.example:1](/Users/kakanfoinn/Documents/Projects/icanpath-academy/icanpath/web/.env.example:1); [web/src/app/contact.php/route.ts:8](/Users/kakanfoinn/Documents/Projects/icanpath-academy/icanpath/web/src/app/contact.php/route.ts:8)
- **Evidence:** No configured live Supabase project or production host was available. The local contact endpoint returned 503 because its backend configuration was absent. Marketing configuration includes example domain and contact values.
- **Description and realistic scenario:** Email verification, password strength and leaked password checks, Auth rate limits, redirect allowlists, refresh expiry, logout revocation, provider ACLs, TLS, backup restores, deployment permissions and alerts cannot be approved from source alone.
- **Business impact:** Launch may have broken core flows or inadequate recovery and account protection. This is an evidence gap, not a claim that every production control is absent.
- **Recommended remediation:** Create a staging acceptance gate with real configuration, verified domain and email delivery, provider settings, restricted deployment credentials, backup restore rehearsal and monitored health checks. Replace example contact details before launch.
- **Verification:** Complete the outstanding verification matrix below and capture sanitized evidence from the actual deployment.

### SEC-12: Logout discards the authentication service error

- **Severity:** Low
- **Status:** Potential
- **Affected location:** [assets/js/lms/auth.ts:140](/Users/kakanfoinn/Documents/Projects/icanpath-academy/icanpath/assets/js/lms/auth.ts:140)
- **Evidence:** signOut awaits the Supabase call but does not inspect its returned error before clearing local UI state.
- **Description and realistic scenario:** During a provider failure, the UI may report logout without proving remote session revocation. Actual SDK local cleanup and server revocation on failure were not tested against GoTrue.
- **Business impact:** Uncertain logout feedback and recovery behavior.
- **Recommended remediation:** Handle signOut errors explicitly and distinguish local session clearing from server revocation. Follow the installed SDK behavior without displaying tokens.
- **Verification:** Test successful logout, failed network requests and provider errors; inspect local session removal and reuse of revoked refresh tokens in staging.

## Security Checklist

Pass below means the specific local evidence passed, not production certification.

| Security Area | Status | Severity | Action Required |
|---|---|---|---|
| Authentication | Fail | High | Enforce administrator MFA; verify provider policies and recovery |
| Authorization | Fail | Medium | Recheck enrollment at quiz submission; test all live RPC paths |
| Supabase RLS | Fail | Medium | Address draft progress and conditional legacy Storage reads; retain tested ownership rules |
| API Security | Fail | Medium | Protect direct contact RPC from abuse; verify live upload controls |
| Secrets Management | Not Verified | High if exposed | Scoped scan found no credentials; Git history and deployment secrets unavailable |
| Content Protection | Not Verified | Medium | Verify real provider ACLs and legacy bucket objects |
| Quiz Security | Fail | High | Enforce due dates and timers; retest cancellation and concurrency |
| Dependency Security | Pass | Informational | Both npm audits reported zero known vulnerabilities at audit time; maintain monitoring |
| Browser Security | Fail | Medium | Add and test CSP and other headers; verify production HTTPS |
| Production Configuration | Not Verified | High | Staging acceptance and actual host/config review required |
| Logging and Monitoring | Not Verified | Medium | Database audit logging exists; alert delivery and operational monitoring not demonstrated |
| Backup and Recovery | Not Verified | High | Inspect configured backups and perform a safe restore rehearsal |

## Verification evidence and execution record

### Completed local checks

| Command or check | Result | Scope |
|---|---|---|
| `npm run db:test` | Passed; 23 migrations, 41 public RLS tables, 76 public policies, 105 definer functions | PGlite with Supabase schema stubs |
| `npm run test:security` | 66 assertions passed | Database role and ownership regression |
| `npm run test:workflows` | 55 assertions passed | Synthetic workflows |
| `npm run test:learning` | 78 assertions passed | Learning workspaces |
| `npm run test:ican` | 62 assertions passed | Curriculum and completion workflows |
| `npm run test:admin` | 60 assertions passed | Admin workspace |
| `npm run test:domain` | 21 assertions passed | Domain structure |
| `node scripts/test-auth.mjs` | Passed | Mock authentication flows, safe redirects, pending/suspended states |
| `npm run test:real` | 7 assertions passed | Mocked real branch, not a live Supabase project |
| `npm run test:frontend` | 56 assertions passed | Frontend helpers |
| `npm run test:links` | 28 assertions passed | Provider links and authorization |
| `npm run test:seed` | 32 assertions passed | Seed validation |
| `npm run verify:frozen` | 14/14 unchanged | Marketing integrity check |
| `npm run type-check` | Passed | TypeScript |
| `npm run lint` | Passed | ESLint; not a comprehensive dedicated SAST engine |
| `npm run build:web` | Passed Vite and Next production build | Generated output only; unresolved runtime image reference warning for course/4.jpg, source asset exists |
| `npm audit --json; npm --prefix web audit --json` | Both completed: zero known vulnerabilities | Registry scan; initial restricted network attempt failed DNS resolution, authorized retry succeeded |
| `Scoped file/config and secret pattern inspection` | No matching exposed JWT/private key/provider secret found | Current source and configuration; no values printed; no historic Git proof |
| `git ls-files` | Returned zero tracked files | No reviewable tracked history for this app snapshot |
| `Local HTTP GET /index.html and /admin/dashboard` | 200; absent security headers; admin response contains static shell only | No cookie; no personal data fetched |
| `Local POST /contact.php with foreign Origin` | 403 | Origin check runtime confirmed |
| `Local POST /contact.php without configured backend` | 503 | Safe unavailable feedback; not proof of live valid submission |
| `node /private/tmp/icanpath-audit-probes.mjs` | Completed; reproduced SEC-01 through SEC-04; anonymous raw lessons SELECT denied | Disposable synthetic database only. Initial fixture failed because author trigger overwrote a null auth identity; fixed fixture, not app code, then reran |

The extra probe uses synthetic users and isolated in memory data. Historical timestamps and cancellation were set only in that disposable database. No provider account, real student record or production database was modified. Logs were retained locally under `/private/tmp/audit-*.log` and `/private/tmp/icanpath-audit-probes.log`. The reproducible probe is included as `SECURITY_AUDIT_PROBES.mjs`; its import points to this inspected app root.

### Inspection results and limits

- Input validation: Zod constrains the Next contact form; SQL constraints and RPC validation handle learning resources. The contact route checks Origin when supplied, caps declared and streamed body size, and has a honeypot. Direct RPC abuse remains possible.
- SQL and HTML safety: no confirmed SQL injection, command injection, SSRF, path traversal or prototype pollution was identified in reviewed paths. SQL RPCs use typed arguments; rendering utilities escape content. These are scoped inspection results, not exhaustive proof against every payload.
- Assessment protection: scores are calculated in database functions, answer keys are hidden from raw student question reads, direct attempt score updates are denied, and grading is scoped to assigned courses. Immediate post submission answer review is an intentional product behavior; consider delaying review for high stakes assessments.
- Concurrency: quiz and contact functions contain row/advisory locks and uniqueness constraints. Existing sequential regression tests do not substitute for multi connection Postgres race tests. No claim that all concurrency cases passed.
- Links: approved provider URL validation and video ID extraction were tested. Cancelled/completed live classes are rejected by the current resolver. Stale scheduled sessions and exact time window policy need explicit staging acceptance.
- Browser sessions: tokens persist in browser storage. This is a deliberate SPA model, not an exposed service credential. It increases the impact of XSS; do not claim HttpOnly server cookies protect active SPA sessions.
- Source maps and third party assets: no confirmed token exposure was found. Production source map serving and actual CDN policies require inspection at the deployed host. Public source code is not itself a credential leak.
- Performance: course scoped indexes and limits exist in parts of the data layer. Large dataset pagination, query plans, N+1 behavior, connection limits and load tolerance were not measured against realistic production data. Treat recommendations here as readiness work, not proven denial of service exploits.
- Dependencies: lockfiles were present, dependency scans were clean, and no unnecessary packages were installed. Registry vulnerability data does not certify every install script or dependency provenance. CI credentials and deploy permissions were unavailable.
- Privacy: audit log, profile, submission and inbox policies were inspected. Retention, deletion procedures, access reviews and handling of exported reports need operational approval. No unrelated personal data was accessed.

### Outstanding live verification matrix

| Required evidence | Why not verified | Acceptance test |
|---|---|---|
| Email confirmation, password policy, leaked password protection, login/reset throttles and account enumeration | No configured GoTrue project | Use synthetic accounts; test weak passwords, nonexistent users, reset delivery, throttles and confirmation gating without aggressive requests |
| Session expiration, refresh, fixation, cookie attributes and global logout | Active dashboards use browser sessions; real Auth unavailable | Verify token rotation, expiry, logout and refresh reuse; check cookie paths only for actual SSR flows |
| Four role CRUD matrix via PostgREST plus Realtime | Local PGlite stubs do not implement those transports | Test anonymous, two students, two tutors, pending tutor and admin across every table and RPC; confirm subscription isolation |
| Storage upload and signed URL behavior | Storage schema stub only | Check limits, MIME/content validation, ACLs, draft/cancelled legacy pointers, expiry and cross user access |
| Google Drive, Forms, Meet, Zoom and YouTube permissions | No real provider resources or account configuration | Test external unauthorized accounts and revoked enrollment; define external assessment identity, grading and link sharing limits |
| n8n and Resend | No integration found | If later added, verify signed/authenticated webhooks, replay handling, least privilege keys, sender SPF/DKIM/DMARC, redacted logs and duplicate delivery |
| Production TLS, DNS, headers, CORS, reverse proxy and DDoS limits | Only localhost inspected | Inspect deployed responses/configuration and verify no development server or debug endpoints are public |
| Backups, restore, migration rollback and disaster recovery | Hosting control plane unavailable | Restore a backup to isolated staging; document recovery objectives and safe forward migration procedure |
| CI permissions, deploy gates, monitoring and incident response | No operational evidence provided | Least privilege deployment, automated checks, security event alerts and a tested response runbook |
| Concurrency and scale | Embedded local engine and small fixtures | Run bounded concurrent transactions on isolated staging, inspect plans and pagination with synthetic volume |

## Remediation Roadmap

### P0: Immediate blockers

No confirmed Critical vulnerability, exposed secret, unrestricted privileged action or major personal data disclosure was found in the scoped evidence. This is not a reason to skip deployment secret and production access review. Rotate any credential later confirmed exposed.

### P1: Before production

1. SEC-01: enforce native quiz timing and deadlines.
2. SEC-05: require administrator MFA assurance at sensitive database operations.
3. SEC-11: complete staging Auth, production configuration, monitoring and backup acceptance gates.
4. Resolve SEC-02 and SEC-03 before relying on access revocation or progress results. Medium severity, but directly relevant to the core learning workflow.

### P2: Security hardening

1. SEC-04: trusted contact abuse controls.
2. SEC-07: tested browser security headers and CSP.
3. SEC-06 and SEC-09: validate real Storage controls and legacy resources, then make the smallest needed policy/configuration change.
4. Verify provider sharing and assessment identity controls from SEC-10; conduct the live four role and concurrency matrices.

### P3: Future improvements

1. SEC-08 and SEC-12: clarify SPA/SSR boundaries and improve logout failure handling.
2. Automate regression tests for the reproduced failures and schedule dependency scans.
3. Add measured pagination, query planning and capacity monitoring as data grows; establish photo cleanup and data retention routines.

## Final Production Readiness Verdict

**NOT READY FOR PRODUCTION**

This decision is based on reproduced assessment and progress failures, confirmed lack of administrator MFA enforcement, bypassable contact abuse checks and missing application browser protections. Actual production configuration and recovery have not been examined, so readiness cannot be claimed even after local regression tests pass. Complete the prioritized fixes with approval, then rerun the specific regression and staging acceptance tests.

**Approval boundary:** this audit applies no fixes and performs no deployment. Authentication and RLS changes require the user approval requested in the supplied audit instructions.

## References

- [OWASP ASVS 5.0](https://owasp.org/projects/asvs): validation, authentication, authorization, browser and data protection review framework. This is a scoped assessment, not certification.
- [OWASP Top 10 2025](https://top10.owasp.org/2025/): findings relate to broken access control, authentication failures, insecure design, security misconfiguration and logging readiness.
- [OWASP API Security Top 10 2023](https://api-security.owasp.org/editions/2023/en/0x11-t10/): object/function authorization, resource consumption and sensitive business flow review.
- [Supabase production checklist](https://supabase.com/docs/guides/deployment/going-into-prod) and [product security](https://supabase.com/docs/guides/security/product-security): provider configuration acceptance.
- [Supabase MFA](https://supabase.com/docs/guides/auth/auth-mfa): trusted assurance checks for sensitive operations.
- [Next.js headers](https://nextjs.org/docs/app/api-reference/config/next-config-js/headers): application response header configuration.
