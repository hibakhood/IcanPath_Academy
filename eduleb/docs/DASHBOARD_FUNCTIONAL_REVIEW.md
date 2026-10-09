> Historical review: the implementation now resolves the enrollment, external assessment, materials, recording, grading, performance and course-inspection gaps below. See [ICAN completion](ICAN_COMPLETION.md) for the current implementation and deployment requirements.

# Dashboard functional review — 7 October 2026

**Verdict: a working LMS foundation, but not yet the complete link-based ICAN platform described.** The image-based dashboards and many core workflows are implemented. Student enrollment, external assessments, recorded-class access, and several management/performance workflows remain incomplete.

## Scope and evidence

Reviewed all 55 student/tutor/admin routes in source and in the local preview browser, plus an assignment detail view. Inspected frontend/API wiring and the corresponding SQL authorization rules. Browser preview demonstrates rendering/navigation; it cannot establish production persistence, authentication delivery, real provider access or Google Form grading.

The current `.env` enables local preview and has no Supabase project configuration. All 17 migrations are available and locally tested, but none of this review applies them to a remote project. Existing local suites were rerun: 66 security, 55 workflow, 78 learning-workspace, 28 provider-link and 21 domain assertions passed (248 total). An additional isolated database probe confirmed the null-score grading defect described below. Application source was not modified during this review.

## Findings in priority order

### P1 — Students cannot self-enroll

`assets/js/lms/api.ts` defines `enrollInCourse`, but no page calls it. Student My Courses reads existing enrollments only. The public dynamic course detail page ends with a migration notice instead of an enrollment action. A newly registered student therefore needs administrator intervention to begin learning.

Add a published-course browse/detail/enroll journey with clear enrolled/unavailable states. Keep admin enrollment as a separate management workflow. Decide whether enrollment is free, approved, or tied to payment; the current ledger does not enforce paid access.

### P1 — Google Forms/Drive quizzes and assignments are missing

The tutor builder creates native quizzes/questions and native written assignments. There is no quiz/assignment provider URL field or external assessment destination in the data model. The link validator supports Drive materials, Meet, Zoom and YouTube Live; it does not accept `forms.gle` or `docs.google.com/forms`. Student assessment pages always use the native runner or textarea submission.

Support native and external assessment modes. Let tutors publish a validated Google Form or Drive destination with instructions and due dates, and let enrolled students open it. Separately record submissions, scores and feedback. Initially use tutor-verified manual result entry/import if no integration is configured; opening a link must not count as submitting, passing or completing an assessment. Course progress and certificate checks need to account for external assessments too.

### P1 — No live database connection yet

The current experience is a design preview. New feedback/certificate/earnings writes explicitly refuse to persist; older fixture writes reset after navigation. A complete student→tutor→admin journey must be verified against one configured Supabase project, with real accounts and applied migrations, before declaring the platform ready.

### P2 — Completed class recordings are unreachable

Student Live Classes calls `myUpcomingClasses`, which selects scheduled/live sessions only. Its Watch recording branch requires a completed session, so it never runs. Add upcoming/live/past sections with recordings for enrolled students. Show course names and timezones consistently. Use the same authorized join/event workflow from both the dashboard and Live Classes page.

### P2 — Null scores can be marked graded

`grade_assignment` only tests `p_score < 0 or p_score > max_score`. With NULL both conditions are unknown, so PostgreSQL allows the update. The review probe returned `{nullGradeAccepted:true,result:{status:'graded',score:null}}`. The browser form refuses blank input, but the server must enforce this too. Once marked graded, the record disappears from the pending queue even though it has no score.

Reject null scores server-side and provide a graded-history/correction workflow. Keep corrections authorized and audited.

### P2 — Study materials page does not list study materials

Student Materials loads enrolled course records, renders generic descriptions, and links to each course. It never queries actual lesson materials. Drive files can be opened from a lesson, but the centralized Materials page should list actual authorized resources with course/module/lesson/type and an Open action.

### P2 — Tutor assessment/content editing is incomplete

Assignment creation always sends `instructions:null`; there is no instructions editor. Quiz creation similarly sends null instructions/time limit/due date. Modules/lessons have limited editing controls. Tutors need ordinary edit forms for titles, instructions, deadlines, links and publishing status without deleting/recreating records.

### P2 — Performance reporting is incomplete and one label is incorrect

Student progress and tutor roster percentages measure completed published lessons, not examination readiness or assessment success. Native results/assignment feedback exist, but there is no consolidated per-student assessment history. Tutor activity View All still uses an RPC capped at six rows. Student Quizzes labels a score Best so far while selecting the first returned graded attempt rather than the maximum score. Distinguish lesson progress from assessment performance and compute accurately labelled metrics.

### P2 — Administrators cannot fully inspect a course before approval

Review cards display metadata and content counts. The admin course page adds module/lesson titles but does not expose a complete video/material/question/assignment preview. Approval controls work, but meaningful moderation requires reviewing actual content. Published content editing also lacks versioned reapproval; decide which changes must return for review.

### P3 — Communication and navigation refinements

Student/tutor Messages only receive admin messages. Course questions/answers supply a narrower tutor feedback workflow. Add compose/reply if direct messaging is desired. Search covers titles of courses/lessons, not assessments/files/messages. Some pages rely on hidden shell titles and have no visible primary heading. Long lists need filters/pagination. Replace non-ICAN demonstration content and example media before launch.

## Security assessment

The local authorization foundation is sound in the exercised cases: active-role checks, enrollment and course ownership, private question/review/inbox records, protected provider-link resolution, unpublished-content checks, hidden native answer keys, server scoring, bounded grading, admin-only role/status transitions, and audit events. All 38 application tables have row-level security enabled.

This is not production security certification. The null-grade defect shows that passing the existing suite is not exhaustive validation. Real sessions, account suspension/recovery, deployment configuration, provider sharing permissions, backup/restore and live role boundaries still need verification. Once a provider URL is released, its downstream access depends on that provider’s permissions; the LMS cannot make an otherwise shareable YouTube/Drive/meeting URL private simply by hiding it in a dashboard.

## Page-by-page assessment

“Implemented” means the UI and local backend workflow exist, not that live Supabase/provider operation has been established. “Partial” identifies a missing or mismatched part of the requested workflow.

### Student — 17 routes

| Page | Purpose | Status | Limitation |
|---|---|---|---|
| `/student/dashboard` | Continue Learning, course cards, upcoming classes, progress and activity | Implemented | Progress reflects lesson completion, not exam readiness; new actions need Supabase. |
| `/student/courses` | Enrolled course list and resume links | Partial | No browse/enroll action. A new student cannot self-enroll through this page. |
| `/student/course` | Modules, published lessons and assessment shortcuts | Implemented | Content report form precedes curriculum; assessment shortcuts are native only. |
| `/student/lesson` | Embedded YouTube lesson, lesson materials and completion | Implemented | Completion is manually declared; no watched-duration or playback resume tracking. |
| `/student/live` | Scheduled/live meetings | Partial | Completed sessions excluded, so Watch recording cannot appear; joining here does not use the dashboard attendance-event RPC. |
| `/student/materials` | Study resources | Partial | Lists courses, not actual files. Students must navigate course → lesson → material. |
| `/student/quizzes` | Published quiz list and scores | Partial | Native quizzes only; best-score label displays the first returned graded attempt rather than the maximum. |
| `/student/quiz` | Quiz runner, attempts and server scores | Partial | Native questions only; no Forms/Drive assessment destination. |
| `/student/assignments` | Assignment list, written response and released feedback | Partial | No Forms/Drive assignment link or link-based submission. |
| `/student/progress` | Per-course and overall lesson completion | Partial | No assessment-performance view or external-assessment completion; manual lesson completion can show 100% while assessments are unfinished. |
| `/student/certificates` | Server-checked course completion certificates | Implemented | Native assessment criteria only; not ICAN professional accreditation. |
| `/student/announcements` | Broadcast notices and own notifications | Implemented | No email/SMS delivery implied. |
| `/student/messages` | Private inbox | Partial | Reads admin messages; no student/tutor compose or reply workflow. |
| `/student/questions` | Course questions, tutor answers and course feedback | Implemented | Private enrolled-course feedback; persistent actions unavailable in preview. |
| `/student/activity` | Own latest learning activity | Implemented | Latest 100 events; Live Classes-page joins are absent from class-joined events. |
| `/student/search` | Enrolled course/lesson title search | Partial | Does not search study files, quizzes, assignments or messages. |
| `/student/profile` | Account name/phone and application details | Partial | No avatar editor or complete ICAN student profile preferences. |

### Tutor — 19 routes

| Page | Purpose | Status | Limitation |
|---|---|---|---|
| `/tutor/dashboard` | Courses, students, upcoming live sessions and reviews | Implemented | Revenue is manual allocated NGN earnings, not automatic payment processing. |
| `/tutor/courses` | Course creation and submission for admin review | Implemented | Preview demonstrates fixtures; initial content includes non-ICAN demo subjects. |
| `/tutor/course` | Course, modules, lessons, YouTube/Drive links and assessments | Partial | No external assessment URL editor; assignments are created with instructions=null and have no instructions editor. Quiz instructions/time limit/due date are not exposed in the form. |
| `/tutor/lessons` | Managed lesson directory | Implemented | Creation/editing returns to course builder; no dedicated lesson editor. |
| `/tutor/materials` | Managed materials directory | Implemented | Drive links are created from the lesson’s materials panel. |
| `/tutor/quizzes` | Managed quiz directory | Partial | Native quiz builder only; no Forms/Drive assessment link. |
| `/tutor/assignments` | Managed assignment directory | Partial | Native written assignments only; no external assignment link/instructions editor. |
| `/tutor/live` | Provider-link scheduling, status and recordings | Implemented | Meeting approval is optional; students cannot retrieve completed recordings through their Live Classes page. |
| `/tutor/students` | Managed student roster, lesson progress and activity | Partial | No consolidated per-student quiz/assignment performance history. |
| `/tutor/grading` | Pending assignment marking and feedback | Partial | Graded work disappears from the queue; no graded-history/regrade view. Null score accepted by server RPC. |
| `/tutor/attempts` | Quiz-attempt review acknowledgements | Implemented | Does not change automatic quiz scores or import Google Form results. |
| `/tutor/reviews` | Private course feedback and replies | Implemented | Latest 100 records; persistent replies require Supabase. |
| `/tutor/questions` | Student questions and answers | Implemented | Latest 100 records; answers create student notifications. |
| `/tutor/earnings` | Allocated earnings, payouts and balance | Implemented | Manual immutable ledger records only. |
| `/tutor/activity` | Student activity in managed courses | Partial | RPC returns latest six events; View All is not a complete activity history. |
| `/tutor/announcements` | Broadcast notices and own notifications | Implemented | Read-only announcements; no individual notification open/mark control. |
| `/tutor/messages` | Private inbox | Partial | No tutor-to-student compose or reply interface. |
| `/tutor/search` | Managed course/lesson title search | Partial | No assessment/material/student search. |
| `/tutor/profile` | Basic account and application details | Partial | No full tutor biography/specialties/avatar editing interface. |

### Admin — 19 routes

| Page | Purpose | Status | Limitation |
|---|---|---|---|
| `/admin/dashboard` | Statistics, approvals, activity, analytics and reports | Implemented | Preview is synthetic; monitoring requires recorded readings. |
| `/admin/users` | Role/status administration | Implemented | Limited profile fields; email is shown only when sourced from tutor applications. |
| `/admin/tutors` | Tutor-filtered user management | Implemented | Tutor approvals are handled on Review. |
| `/admin/students` | Student-filtered user management | Implemented | Enrollment changes are handled on Enrollments. |
| `/admin/review` | Tutor approval and course approve/return | Partial | Course decision card presents counts/description, not lesson videos/materials/questions. Needs a full content preview before approval. |
| `/admin/courses` | Course statuses and administration | Implemented | No UI for assigning additional tutors; published content can be edited without a versioned reapproval workflow. |
| `/admin/course` | Course summary and module/lesson titles | Partial | No complete read-only content preview or admin content editor. |
| `/admin/enrollments` | Admin enrollment/cancellation | Implemented | This currently supplies enrollment because students lack their own enrollment UI. |
| `/admin/live` | Class list/status controls | Implemented | Tutors schedule links; approval requests handled on Moderation. |
| `/admin/moderation` | Live requests and content reports | Implemented | Live review is optional rather than mandatory on all sessions. |
| `/admin/announcements` | Draft/publish broadcasts | Implemented | Scheduled fields exist in database but scheduling/delivery is not exposed/automated in this UI. |
| `/admin/notifications` | Own notifications and mark-read | Implemented | In-app only. |
| `/admin/messages` | Admin compose and private messages | Implemented | Student/tutor inboxes cannot reply. |
| `/admin/reports` | Date-bounded reports and CSV snapshots | Partial | Operational metrics; no comprehensive student assessment-performance report or external assessment import. |
| `/admin/audit` | Activity audit list | Implemented | Latest 200 entries; no full filtering/pagination/export workflow. |
| `/admin/settings` | Platform settings and monitoring readings | Implemented | Manual readings, not automatic host monitoring. |
| `/admin/payments` | Verified receipts/refunds and tutor earning records | Implemented | Manual ledger; does not collect fees or transfer money. |
| `/admin/search` | User/course/lesson title search | Implemented | Scoped admin results; not all resource types. |
| `/admin/profile` | Basic own account settings | Implemented | Basic profile only. |

## Recommended implementation order

1. Add external Forms/Drive assessment publishing and student self-enrollment.
2. Fix recorded-class access and server-side null-grade validation; add actual materials listing and assessment instructions/editing.
3. Complete performance history, full admin content review, activity pagination and accurate progress labels.
4. Connect Supabase and apply unapplied migrations; test real student enrollment → lesson/material/class → submission → tutor grading → released feedback, plus admin approval/suspension and access-denial cases.
5. Replace demonstration subjects/media with the intended ICAN curriculum and complete live provider/accessibility/mobile acceptance checks.

The existing dashboard designs and marketing structure can be retained throughout these changes.
