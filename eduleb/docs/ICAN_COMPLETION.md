# ICAN learning platform completion

The marketing and dashboard pages now centre on ICAN preparation: enrollment, courses and lessons, recorded YouTube links, approved live classes, Drive materials, external assessments, feedback, progress, approvals, announcements and audit history.

## Curriculum

`assets/js/lms/ican-curriculum-v2.json` contains the supplied 15-paper A, B and C level syllabus, including official module headings. The marketing course page and dashboards use the same source. Lesson resources remain tutor-managed content and are not invented from module headings.

Migration `0019_ican_syllabus_update.sql` stores the updated templates. In Admin → Courses, select an active tutor and import the ICAN syllabus. The import is administrator-only, idempotent by course code, assigns the tutor and creates draft courses and module headings. Tutors add actual lesson, video, material, assessment and live-class links before submitting courses for administrator approval. Existing courses and user records are preserved.

Preview mode displays the ICAN catalogue for design review; it does not represent approved, populated production courses. Preview enrollment persists only in the current browser tab. Real assessment creation, links and grading require Supabase.

## Completed workflows

- Students browse published courses, filter by level, enroll and open their enrolled course.
- Primary quiz and assignment pages support Google Forms and Google Drive links. Students supply a response or completion reference; tutors verify, grade and release results. These are separate from optional built-in practice quizzes and written assignments.
- Private destinations are returned only after an authorized open action. Raw external assessment and submission tables have no client access. Unreleased marks and feedback stay private.
- Tutors can edit modules, lesson details and native assessment instructions and deadlines, review grade history, correct results and inspect student performance.
- Students have separate lesson-progress and assessment-results views. Materials are actual accessible lesson resources; completed classes retain access to approved recordings.
- Administrators inspect complete course content before approval, assign active tutors, import the curriculum and oversee assessments and results.
- Blank or out-of-range grades are rejected by the database. Opening a link never counts as completion.
- Earnings, revenue panels, course ratings, certificates and hosting-monitoring widgets were removed from the main dashboards. Historical financial, ratings and certificate routes now point users back to the learning workspace; underlying records remain intact.

## Database and deployment

There are 41 tables, all with RLS, and 76 policies. External assessment access uses authenticated, scoped database functions rather than raw table reads.

Local migration, permission, workflow, curriculum, assessment, frontend, seed and production-build checks passed. Browser preview testing verified the ICAN catalogue, enrollment, course modules and assessment navigation.

The workspace has no Supabase project URL or public key configured. Consequently these migrations have been tested locally but have not been applied to a hosted project. Configure the project, apply all migrations in order, disable preview mode, create/approve a tutor, import the curriculum and add the actual teaching links. Do not expose the service-role key to the browser.
