/**
 * Runs supabase/seed.sql against a real Postgres engine (PGlite) after the
 * migrations, then checks that the demo dataset is coherent and that the RPCs
 * the dashboards call actually return it.
 *
 * The seed is the thing a reviewer relies on when they open the app, so "the
 * file parses" is not the bar. It has to run, twice, and leave a dataset where
 * every role sees a non-empty dashboard and nothing dangles.
 *
 *   node scripts/test-seed.mjs
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { MIGRATIONS_DIR, SUPABASE_STUBS, as, migrationFiles } from "./pg-harness.mjs";

const SITE_ROOT = resolve(import.meta.dirname, "..");
const SEED = readFileSync(join(SITE_ROOT, "supabase/seed.sql"), "utf8");

const ADMIN = "d1c0de00-0000-4000-8000-000000000001";
const TUTOR = "d1c0de00-0000-4000-8000-000000000002";
const STUDENT = "d1c0de00-0000-4000-8000-000000000011";
const STUDENT2 = "d1c0de00-0000-4000-8000-000000000012";

let passed = 0;
const failures = [];
function check(name, condition, detail = "") {
  if (condition) {
    passed += 1;
    console.log(`  pass  ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const db = await PGlite.create();
await db.exec(SUPABASE_STUBS);

// The harness stubs auth.users with only the columns the migrations read. The
// seed writes the full Supabase shape, so widen it, and stand in for bcrypt.
await db.exec(`
  alter table auth.users
    add column if not exists instance_id uuid,
    add column if not exists aud text,
    add column if not exists role text,
    add column if not exists encrypted_password text,
    add column if not exists email_confirmed_at timestamptz,
    add column if not exists raw_app_meta_data jsonb default '{}'::jsonb,
    add column if not exists updated_at timestamptz default now(),
    add column if not exists confirmation_token text,
    add column if not exists email_change text,
    add column if not exists email_change_token_new text,
    add column if not exists recovery_token text;

  create or replace function crypt(p_password text, p_salt text) returns text
    language sql immutable as $$ select 'hashed-' || md5(p_password) $$;

  create or replace function gen_salt(p_type text default 'bf') returns text
    language sql immutable as $$ select 'salt' $$;
`);

for (const file of migrationFiles()) {
  await db.exec(readFileSync(join(MIGRATIONS_DIR, file), "utf8"));
}

// Synthetic database fixtures represent an MFA verified administrator.
// This does not enroll a real factor or modify production Auth settings.
await db.exec("select set_config('request.jwt.claim.aal', 'aal2', false)");
console.log("Running the seed");
try {
  await db.exec(SEED);
  console.log("ok    the seed applied");
} catch (error) {
  console.log(`FAIL  the seed did not apply — ${error.message}`);
  process.exit(1);
}

// Re-running has to be a no-op, not a duplicate-key error.
console.log("\nIdempotency");
const before = await db.query("select count(*)::int n from public.lessons");
try {
  await db.exec(SEED);
  const after = await db.query("select count(*)::int n from public.lessons");
  check("the seed can be run twice", after.rows[0].n === before.rows[0].n, `${before.rows[0].n} then ${after.rows[0].n}`);
} catch (error) {
  check("the seed can be run twice", false, error.message);
}

console.log("\nAccounts");
const profiles = await db.query(
  "select role, status, count(*)::int n from public.profiles group by 1, 2 order by 1, 2",
);
const byRole = (role, status) =>
  profiles.rows.find((r) => r.role === role && r.status === status)?.n ?? 0;
check("there is an active admin", byRole("admin", "active") === 1);
check("there are active tutors", byRole("tutor", "active") === 2);
check("there is a pending tutor", byRole("tutor", "pending") === 1);
check("there are active students", byRole("student", "active") === 3);
check("there is a suspended student", byRole("student", "suspended") === 1);

const authRows = await db.query("select count(*)::int n from auth.users where encrypted_password like 'hashed-%'");
check("every demo account has a password", authRows.rows[0].n === 8, `${authRows.rows[0].n} of 8`);

console.log("\nContent");
const counts = await db.query(`
  select
    (select count(*) from public.courses where status = 'published')          as published,
    (select count(*) from public.courses where status = 'draft')              as drafts,
    (select count(*) from public.modules)                                     as modules,
    (select count(*) from public.lessons where is_published)                  as published_lessons,
    (select count(*) from public.lessons where not is_published)              as draft_lessons,
    (select count(*) from public.quizzes)                                     as quizzes,
    (select count(*) from public.quiz_questions)                              as questions,
    (select count(*) from public.assignments)                                 as assignments,
    (select count(*) from public.live_classes)                                as live,
    (select count(*) from public.course_enrollments)                          as enrolments,
    (select count(*) from public.notifications)                               as notifications
`);
const c = counts.rows[0];
check("two courses are published", c.published === 2, String(c.published));
check("one course is a draft", c.drafts === 1, String(c.drafts));
check("lessons exist, published and not", c.published_lessons >= 6 && c.draft_lessons >= 1);
check("both quizzes have questions", c.quizzes === 2 && c.questions === 5);
check("assignments, live classes and enrolments exist", c.assignments === 2 && c.live === 2 && c.enrolments === 4);
check("notifications exist", c.notifications >= 3);

// Anything a screen would render as a link has to point at a real row.
const dangling = await db.query(`
  select 'lesson' as kind, l.id::text from public.lessons l
   where not exists (select 1 from public.modules m where m.id = l.module_id)
  union all
  select 'material', m.id::text from public.lesson_materials m
   where not exists (select 1 from public.lessons l where l.id = m.lesson_id)
  union all
  select 'question', q.id::text from public.quiz_questions q
   where not exists (select 1 from public.quizzes z where z.id = q.quiz_id)
  union all
  select 'submission', s.id::text from public.assignment_submissions s
   where not exists (select 1 from public.assignments a where a.id = s.assignment_id)
  union all
  select 'progress', p.id::text from public.lesson_progress p
   where not exists (select 1 from public.lessons l where l.id = p.lesson_id)
`);
check("no fixture points at a missing row", dangling.rows.length === 0, dangling.rows.map((r) => r.kind).join(", "));

const authorship = await db.query(
  "select count(*)::int n from public.quizzes where created_by is null",
);
check("content keeps its author", authorship.rows[0].n === 0);

console.log("\nWhat the dashboards read");
// The RPCs below are the ones the student, tutor and admin pages call first.
const studentStats = await as(db, "authenticated", STUDENT, "select public.student_dashboard_stats() j");
check("the student dashboard returns stats", studentStats.ok && studentStats.rows[0].j?.enrolled_courses > 0,
  studentStats.ok ? JSON.stringify(studentStats.rows[0].j) : studentStats.error);

const tutorStats = await as(db, "authenticated", TUTOR, "select public.tutor_dashboard_stats() j");
check("the tutor dashboard returns stats", tutorStats.ok && tutorStats.rows[0].j?.total_courses >= 2,
  tutorStats.ok ? JSON.stringify(tutorStats.rows[0].j) : tutorStats.error);

const adminStats = await as(db, "authenticated", ADMIN, "select public.admin_dashboard_stats() j");
check("the admin dashboard counts recent activity", adminStats.ok && adminStats.rows[0].j?.recent_activity > 0,
  adminStats.ok ? JSON.stringify(adminStats.rows[0].j) : adminStats.error);

// Nothing here records payments, so revenue has to arrive null rather than a
// measured zero. The dashboards print an em dash for it.
check(
  "admin revenue is reported as null, not zero",
  adminStats.ok && adminStats.rows[0].j?.total_revenue === null && adminStats.rows[0].j?.revenue_growth === null,
  adminStats.ok ? JSON.stringify(adminStats.rows[0].j) : adminStats.error,
);

const analytics = await as(db, "authenticated", ADMIN, "select public.admin_analytics_data() j");
check(
  "admin analytics charts students and enrolments only",
  analytics.ok && Array.isArray(analytics.rows[0].j?.students) && analytics.rows[0].j?.revenue === null,
  analytics.ok ? JSON.stringify(analytics.rows[0].j) : analytics.error,
);

const system = await as(db, "authenticated", ADMIN, "select public.admin_system_stats() j");
check(
  "admin system stats admit what is not measured",
  system.ok && system.rows[0].j?.uptime === null && system.rows[0].j?.storage_used === null
    && typeof system.rows[0].j?.active_students === "number",
  system.ok ? JSON.stringify(system.rows[0].j) : system.error,
);

// The tutor dashboard's three read models: courses with a real completion
// fraction, a roster counted from enrolments, and what students just did.
const tutorCourses = await as(db, "authenticated", TUTOR, "select public.tutor_my_courses() j");
check(
  "the tutor's courses carry enrolment and progress",
  tutorCourses.ok && tutorCourses.rows.length >= 1 &&
    tutorCourses.rows.every((r) => typeof r.j?.students === "number" && typeof r.j?.progress === "number"),
  tutorCourses.ok ? JSON.stringify(tutorCourses.rows.map((r) => r.j)) : tutorCourses.error,
);

const tutorRoster = await as(db, "authenticated", TUTOR, "select public.tutor_my_students() j");
check(
  "the tutor's roster is counted from enrolments",
  tutorRoster.ok && tutorRoster.rows.length >= 1 &&
    tutorRoster.rows.every((r) => r.j?.courses >= 1 && r.j?.progress >= 0 && r.j?.lessons_total >= 0),
  tutorRoster.ok ? JSON.stringify(tutorRoster.rows.map((r) => r.j)) : tutorRoster.error,
);

const tutorActivity = await as(db, "authenticated", TUTOR, "select public.tutor_student_activity() j");
check(
  "recent student activity is read from the tutor's own courses",
  tutorActivity.ok && tutorActivity.rows.length >= 1 && tutorActivity.rows.every((r) => r.j?.student_name),
  tutorActivity.ok ? JSON.stringify(tutorActivity.rows.map((r) => r.j)) : tutorActivity.error,
);

const catalogue = await as(db, "authenticated", STUDENT,
  "select count(*)::int n from public.courses where status = 'published'");
check("the catalogue lists published courses", catalogue.ok && catalogue.rows[0].n === 2, JSON.stringify(catalogue));

const enrolled = await as(db, "authenticated", STUDENT,
  `select count(*)::int n from public.course_enrollments where status = 'active'`);
check("the student is enrolled", enrolled.ok && enrolled.rows[0].n === 2, JSON.stringify(enrolled));

const queue = await as(db, "authenticated", TUTOR,
  "select count(*)::int n from public.assignment_submissions where status = 'submitted'");
check("the tutor has a grading queue", queue.ok && queue.rows[0].n >= 1, JSON.stringify(queue));

const reviewQueue = await as(db, "authenticated", ADMIN,
  "select count(*)::int n from public.courses where status = 'pending_review'");
check("nothing is left in the admin review queue", reviewQueue.ok && reviewQueue.rows[0].n === 0, JSON.stringify(reviewQueue));

// A second student must not see another student's submission, which is the whole
// point of the column grants. If this ever passes with the wrong row, the seed
// has hidden a policy hole.
const leak = await as(db, "authenticated", STUDENT2, `
  select count(*)::int n from public.assignment_submissions
   where assignment_id = 'd1c0de00-0000-4000-8000-000000000181'`);
check("a student cannot read another student's submission", leak.ok && leak.rows[0].n === 0, JSON.stringify(leak));

// A student is meant to see that a question exists -- the runner lists them --
// so the guarantee is narrower than "no rows": the answer column is not granted.
const questionsVisible = await as(db, "authenticated", STUDENT, `
  select id, prompt, points from public.quiz_questions
   where quiz_id = 'd1c0de00-0000-4000-8000-000000000141'`);
check("a student can list a quiz's questions", questionsVisible.ok && questionsVisible.rows.length === 3, JSON.stringify(questionsVisible.error ?? questionsVisible.rows.length));

const answers = await as(db, "authenticated", STUDENT, `
  select correct_answer from public.quiz_questions
   where quiz_id = 'd1c0de00-0000-4000-8000-000000000141'`);
check("a student cannot select the answer column", !answers.ok, "the column was returned");

const tutorAnswers = await as(db, "authenticated", TUTOR, `
  select count(*)::int n from public.manage_quiz_questions('d1c0de00-0000-4000-8000-000000000141')`);
check("a tutor reads answers through the RPC", tutorAnswers.ok && tutorAnswers.rows[0].n === 3, JSON.stringify(tutorAnswers));

console.log("\n────────────────────────────────────────────────────────────");
if (failures.length) {
  console.log(`RESULT: ${passed} passed, ${failures.length} FAILED.`);
  for (const f of failures) console.log(`  - ${f}`);
  process.exitCode = 1;
} else {
  console.log(`RESULT: ${passed} seed assertions passed, 0 failed.`);
}
await db.close();
