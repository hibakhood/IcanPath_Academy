# ICAN LMS project review and implementation plan

Reviewed 7 October 2026 against the supplied ICAN LMS brief.

## Assessment

The application is in `eduleb/`, one directory below the workspace root. It is a substantial existing LMS implementation, but it does not yet meet the brief or have verified production readiness. Preserve its useful database authorization logic and workflows while replacing incomplete public and learning experiences in stages.

Current stack: Vite, TypeScript, vanilla DOM components, Bootstrap on public pages, and Supabase JS. There is no Next.js, React, Tailwind, shadcn/ui, React Hook Form, Zod, or application server. Database enforcement through PostgreSQL RLS and privileged functions is valuable server-side authorization; frontend route guards alone are not its security boundary.

The workspace has no Git repository. Establish version control before implementation. The local `.env` contains a preview-mode setting and no Supabase credentials. No secrets were reproduced during review. Live Supabase Auth, PostgREST, Storage, email, and deployment remain unverified.

## Existing assets worth preserving

- Public marketing pages and an existing visual system; auth dialog integration.
- Student, tutor, and admin page modules and shared UI components.
- Registration, login, logout, password reset, role routing, pending tutor approval and suspended account handling.
- Course/module/lesson authoring, course review and publication, enrollments, lesson completion, quiz attempts and grading, assignment submissions and grading, announcements, notification data, and audit logs.
- Ten SQL migrations containing 19 application tables, constraints, indexes, triggers, RLS, column grants, and privileged operations.
- Local authorization, workflow, frontend contract, and seed test harnesses.

These are implemented code paths, not confirmation that every experience works against a deployed Supabase project.

## Findings, ordered by impact

### 1. Private resources do not implement the required link experience

`eduleb/assets/js/lms/api.ts:344` uploads `.url` text objects containing target links into private Storage. `pages/student-lesson.ts:117` opens a signed object URL directly; it does not resolve the text object's contents into the Google Drive destination. `pages/student-live.ts:84` follows the same pattern. Even with functioning signing, this opens or downloads a pointer file rather than joining a class or opening the intended material.

`supabase/migrations/0006_functions.sql:819` calls `storage.create_signed_url`. No project migration defines that function; the test harness defines a fake version at `scripts/pg-harness.mjs:73`. Its availability on real Supabase must be verified; local passing tests cannot establish it. Supabase documents signing through the Storage API: https://supabase.com/docs/reference/javascript/file-buckets-createsignedurl.

Replace pointers with protected URL metadata and an authorized resource resolver. Return only validated destinations after checking role, ownership, enrollment, and publication. Keep private URLs out of public course projections. Authorized students can still copy provider links, so access at YouTube/Drive/Meet/Zoom must be configured separately.

### 2. Live scheduling cannot be completed through the intended tutor workflow

`pages/tutor-live.ts:130` asks for an internal bucket path instead of a meeting URL. `api.ts:840` inserts a class referencing that path but does not upload the meeting pointer or coordinate its filename with the newly generated class ID. A tutor cannot simply paste a Meet/Zoom/YouTube Live URL and produce a working Join Class action.

Replace the path field with platform-specific URL validation, scheduling fields, and an optional lesson association. Save the destination as protected data. Test scheduling, joining, cancellation, and attaching a recording end to end.

### 3. Public discovery is disconnected from the LMS database

`course.html`, `course_details.html`, and `index.html` contain illustrative courses, pricing, lesson counts and testimonials. Public tables/functions are revoked from `anon` in `0007_rls.sql:33`, so the current public catalogue cannot query published database content. Enrollment journeys must connect actual course identities to registration and enrollment.

Add narrowly scoped published-course/tutor/resource projections. Expose curriculum titles without video, material, or meeting URLs. Replace unsupported marketing claims with approved content or empty states. Remove dead social/legal links. The marketing freeze manifest is a regression tool; intentionally update it as part of authorized content changes, or retire it as pages move to Next.js.

### 4. The contact form does not match the deployment or data requirements

`contact.php` uses PHP `mail()` and placeholder recipients. Vite/static hosting cannot execute PHP. There is no `contact_messages` table or Resend/n8n implementation in this project. Build a validated server endpoint that persists inquiries, applies abuse controls, and reports receipt accurately. Email delivery must be optional and report success only when configured and accepted by the provider.

### 5. Admin lists lack database pagination

`pages/admin-users.ts:31` fetches profiles and filters roles in the browser. Most list functions in `api.ts` have no paging bounds. Move search/filtering/counts and pagination into bounded database queries. Apply this to students, tutors, courses, enrollments, lessons, notifications, and audit logs.

### 6. Important required structures and screens are missing or partial

Missing requested tables include course categories, student/tutor profile extensions, contact messages, and public resources. The course schema lacks category relationships, learning objectives and duration fields. Required notification/settings/audit/enrollment management screens and dedicated quiz authoring experiences need a feature-by-feature audit and completion. Lesson progress is primarily completion-based; percentage and playback-position tracking need extension.

Material authoring currently sets every added material to `lecture_note` in `pages/tutor-course.ts:338`; provide all requested types and ordering. Route names use static directories and query IDs, rather than the brief's dynamic paths.

### 7. Validation and safe error handling need strengthening

Material URLs are stored without a server-side provider allowlist. `youtube_id_from_url` in `0001_foundations.sql:85` extracts IDs from unanchored substrings and a generic `?v=` parameter rather than verifying scheme and host. Use HTTPS and parsed exact host checks for each provider, including deliberate supported subdomains.

`friendlyError` in `assets/js/lms/supabase.ts:40` returns unknown backend messages directly. Map unexpected failures to friendly messages and retain technical details in controlled server logs. Review RPC EXECUTE grants individually rather than granting every helper to authenticated users.

### 8. Documentation overstates reproducibility

README says migrations are idempotent, but baseline files contain plain `create table` and `create policy` statements. Treat migrations as ordered, once-applied changes through a migration ledger. The README describes nine migrations while ten exist. Tests use emulated Auth/Storage schemas and a recording client, so their results must not be described as live Supabase integration coverage.

## Validation performed

- TypeScript: passed.
- ESLint: passed.
- Production build: passed; generated `eduleb/dist/` was rebuilt.
- Frozen marketing checks: 14/14 unchanged.
- Frontend wiring checks: 56 passed.
- Real-branch request-contract checks: 7 passed using a recording client, not live Supabase.
- Security checks: 66 passed against PGlite with Supabase stubs.
- Workflow checks: 55 passed against PGlite with Supabase stubs.
- Migration checks: all 10 applied successfully to the stubbed local database; 19 tables have RLS and 52 policies exist.
- No application source, database schema, RLS, auth, or external integrations were changed during this review.
- Live Supabase tests, browser visual QA, responsive viewport checks, accessibility audit, seed validation, email delivery and deployed runtime checks were not performed. No production-readiness claim is made.

## Recommended implementation stages

1. **Foundation and baseline:** establish Git and backups, document existing journeys and schema, introduce Next.js/React/TypeScript with Tailwind/shadcn and Zod, retain legacy pages during migration, define branding/configuration and an explicit deployment target. Use database-generated types. Add Supabase server/browser clients and verified server session/role helpers.
2. **Database and private-link repair:** add forward migrations for categories, profile extensions, course metadata, URL-based lesson materials and live classes, contact messages and public resources. Preserve existing ownership/RLS controls. Repair link opening and scheduling before building further learning features. Prove access boundaries against actual Supabase.
3. **Public discovery and authentication:** migrate public routes to reusable components and real published data, implement search/pagination, safe course curriculum projections, registration/enrollment handoff, cookie-based auth, reset/confirmation flows and role routing. Add database-backed contact receipt.
4. **Tutor/admin operations:** finish course and lesson builders, ordering, previews, approval, typed materials, live scheduling, user/enrollment management, announcements, audit/settings screens and paginated tables.
5. **Student learning:** deliver a cohesive course player, protected resources/live links, previous/next lesson navigation, progress/playback persistence, pending work and notifications.
6. **Assessments and automation:** complete quiz authoring/taking and assignment review; enforce attempts/time limits and server grading. Add optional Resend and authenticated n8n delivery with retry handling without making core workflows depend on them.
7. **Production verification:** test real student/tutor/admin journeys and adversarial access, fresh migrations, browser errors, all eight requested viewport widths, keyboard/focus/contrast, SEO exclusions, query performance, environment setup and deployment. Document actual results and remaining limitations.

At each stage run type checks, lint, build, relevant database authorization tests, and browser checks for changed flows. Do not move beyond a stage with critical authorization or workflow failures. Preserve working SQL and tests; a full rewrite of the database is unnecessary.
