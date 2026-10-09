/**
 * Adversarial RLS and privilege tests, run against a real PostgreSQL engine.
 *
 * Every case is written from the attacker's side: sign in as a student, a tutor
 * who should have no claim on a course, a pending tutor, a suspended account, or
 * the anonymous role, then try to do the thing the spec forbids and confirm the
 * database refuses.
 *
 *   node scripts/test-security.mjs
 */
import { as, bootstrapDatabase } from "./pg-harness.mjs";

let passed = 0;
const failures = [];
let currentGroup = "";

function group(name) {
  currentGroup = name;
  console.log(`\n${name}`);
}

function record(label, ok, detail) {
  if (ok) {
    passed += 1;
    console.log(`  pass  ${label}`);
  } else {
    failures.push(`${currentGroup} → ${label}\n        ${detail}`);
    console.log(`  FAIL  ${label}\n        ${detail}`);
  }
}

/** The query must succeed and return rows. */
async function allows(label, fn) {
  const result = await fn();
  record(label, result.ok && result.rows.length > 0,
    result.ok ? "query succeeded but returned nothing" : result.error);
}

/**
 * RLS normally hides rows rather than raising, so "must not see this" is proven
 * by an empty result set, not by an error.
 */
async function hidesRows(label, fn) {
  const result = await fn();
  record(label, result.ok && result.rows.length === 0,
    result.ok ? `leaked ${result.rows.length} row(s): ${JSON.stringify(result.rows).slice(0, 200)}`
              : result.error);
}

/** A write that changes nothing is blocked; RLS filters the row out silently. */
async function blocksWrite(label, fn) {
  const result = await fn();
  const changed = result.ok ? (result.count ?? 0) : null;
  record(label, result.ok && changed === 0,
    result.ok ? `changed ${changed} row(s)` : result.error);
}

/** The statement must succeed and change at least one row. */
async function changes(label, fn) {
  const result = await fn();
  const changed = result.ok ? (result.count ?? 0) : null;
  record(label, result.ok && changed > 0,
    result.ok ? `changed ${changed} row(s)` : result.error);
}

/** The statement must be refused outright. */
async function denies(label, fn) {
  const result = await fn();
  record(label, !result.ok, result.ok ? "unexpectedly succeeded" : null);
}

/** Refused, and for the expected reason rather than a typo. */
async function deniesBy(label, fn, pattern) {
  const result = await fn();
  record(label, !result.ok && (!pattern || pattern.test(result.error)),
    result.ok ? "unexpectedly succeeded" : `wrong error: ${result.error}`);
}

const ids = {};
async function main() {
  const db = await bootstrapDatabase();

  // ------------------------------------------------------------ fixtures ----
  // Signups go through handle_new_user, exactly as Supabase Auth would.
  const people = [
    ["studentA", "student"],
    ["studentB", "student"],
    ["tutorA", "tutor"],
    ["tutorB", "tutor"],
    ["pendingTutor", "tutor"],
    ["suspended", "student"],
    ["admin", "admin"],
  ];

  for (const [key, role] of people) {
    const { rows } = await db.query(
      `insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id`,
      [`${key}@test.local`, JSON.stringify({ requested_role: role, full_name: key })],
    );
    ids[key] = rows[0].id;
  }

  // A tutor signup is always pending until an admin approves it, so tutorA and
  // tutorB are activated here. pendingTutor is deliberately left pending and
  // suspended is deliberately left suspended — those are the cases under test.
  await db.query(`update public.profiles set status = 'active' where id in ($1, $2)`, [
    ids.tutorA,
    ids.tutorB,
  ]);
  await db.query(`update public.profiles set status = 'pending' where id = $1`, [ids.pendingTutor]);

  // Signup can never produce an admin — handle_new_user() only understands
  // 'student' and 'tutor' — so the admin fixture is promoted here, standing in for
  // bootstrap_admin() once a real project exists.
  await db.query(`update public.profiles set role = 'admin' where id = $1`, [ids.admin]);

  // No admin signup path either.
  const adminSignup = await db.query(
    `insert into auth.users (email, raw_user_meta_data)
     values ('wants-admin@test.local', '{"requested_role":"admin"}') returning id`);
  const { rows: escalate } = await db.query(
    `select role from public.profiles where id = $1`, [adminSignup.rows[0].id]);
  record("asking for admin at signup does not make you an admin",
    escalate[0].role === "student", `got role ${escalate[0].role}`);
  await db.query(
    `update public.profiles set status = 'suspended', status_note = 'test' where id = $1`,
    [ids.suspended],
  );

  // Tutor A and Tutor B each own a course. These go in as the tutors themselves,
  // because guard_course_insert() stamps created_by from auth.uid() and refuses a
  // blank one.
  const courses = {};
  for (const tutor of ["tutorA", "tutorB"]) {
    const created = await as(
      db,
      "authenticated",
      ids[tutor],
      `insert into public.courses (title) values ('Course by ${tutor}') returning id`,
    );
    if (!created.ok) throw new Error(`fixture course for ${tutor}: ${created.error}`);
    courses[tutor] = created.rows[0].id;
  }

  // A published course owned by Tutor A, with a module, lesson, quiz and assignment.
  await db.query(
    `update public.courses set status = 'published', published_at = now() where id = $1`,
    [courses.tutorA],
  );

  const { rows: modRows } = await db.query(
    `insert into public.modules (course_id, title, position) values ($1, 'Module 1', 1) returning id`,
    [courses.tutorA],
  );
  const moduleId = modRows[0].id;

  // A lesson cannot be published empty: guard_lesson_publish() requires content.
  // The YouTube URL also exercises derive_lesson_youtube_id().
  const lessonInsert = await as(
    db,
    "authenticated",
    ids.tutorA,
    `insert into public.lessons (module_id, course_id, title, position, is_published, youtube_video_url)
     values ('${moduleId}', '${courses.tutorA}', 'Lesson 1', 1, true,
             'https://www.youtube.com/watch?v=dQw4w9WgXcQ') returning id, youtube_video_id`,
  );
  if (!lessonInsert.ok) throw new Error(`fixture lesson: ${lessonInsert.error}`);
  const lessonId = lessonInsert.rows[0].id;
  const derivedId = lessonInsert.rows[0].youtube_video_id;
  if (derivedId === "dQw4w9WgXcQ") {
    passed += 1;
    console.log("  pass  YouTube id is derived from the pasted URL");
  } else {
    failures.push(`fixtures → derive youtube id\n        got ${JSON.stringify(derivedId)}`);
    console.log(`  FAIL  derive youtube id\n        got ${JSON.stringify(derivedId)}`);
  }

  const { rows: quizRows } = await db.query(
    `insert into public.quizzes (course_id, lesson_id, title, is_published) values ($1, $2, 'Quiz 1', true) returning id`,
    [courses.tutorA, lessonId],
  );
  const quizId = quizRows[0].id;

  const { rows: qRows } = await db.query(
    `insert into public.quiz_questions (quiz_id, position, prompt, question_type, options, correct_answer, points)
     values ($1, 1, 'What is 2+2?', 'mcq', '["3","4","5"]'::jsonb, '4', 1) returning id`,
    [quizId],
  );
  const questionId = qRows[0].id;

  const { rows: assignRows } = await db.query(
    `insert into public.assignments (course_id, title, created_by, is_published) values ($1, 'Assignment 1', $2, true) returning id`,
    [courses.tutorA, ids.tutorA],
  );
  const assignmentId = assignRows[0].id;

  // Student A is enrolled in Tutor A's course; Student B is not.
  await db.query(
    `insert into public.course_enrollments (course_id, student_id) values ($1, $2)`,
    [courses.tutorA, ids.studentA],
  );

  // --------------------------------------------------- anonymous role ------
  group("Anonymous role (no session at all)");

  await denies("cannot read any table", () =>
    as(db, "anon", null, `select * from public.courses`),
  );
  await denies("cannot read any profile", () =>
    as(db, "anon", null, `select * from public.profiles`),
  );
  await denies("cannot enroll itself", () =>
    as(db, "anon", null, `select public.enroll_in_course('${courses.tutorA}')`),
  );
  await denies("cannot read quiz questions", () =>
    as(db, "anon", null, `select * from public.quiz_questions`),
  );
  await denies("cannot set its own role", () =>
    as(db, "anon", null, `select public.set_user_role('${ids.studentA}', 'admin')`),
  );

  // ------------------------------------------------- student isolation ------
  group("Student data isolation");

  await allows("reads own profile", () =>
    as(db, "authenticated", ids.studentA, `select role from public.profiles where id = auth.uid()`),
  );
  await hidesRows("cannot read another student's profile", () =>
    as(db, "authenticated", ids.studentA, `select * from public.profiles where id = '${ids.studentB}'`),
  );
  await denies("cannot promote self to admin", () =>
    as(db, "authenticated", ids.studentA, `update public.profiles set role = 'admin' where id = auth.uid()`),
  );
  await blocksWrite("cannot edit another profile", () =>
    as(db, "authenticated", ids.studentA, `update public.profiles set full_name = 'hacked' where id = '${ids.studentB}'`),
  );
  await hidesRows("cannot see the audit log", () =>
    as(db, "authenticated", ids.studentA, `select * from public.audit_logs`),
  );

  group("Student course visibility");

  await allows("reads the published course it is enrolled in", () =>
    as(db, "authenticated", ids.studentA, `select title from public.courses where id = '${courses.tutorA}'`),
  );
  await hidesRows("cannot read an unpublished course it is not in", () =>
    as(db, "authenticated", ids.studentA, `select title from public.courses where id = '${courses.tutorB}'`),
  );
  await hidesRows("cannot read lessons of a course it is not enrolled in", () =>
    as(db, "authenticated", ids.studentA, `select * from public.lessons where course_id = '${courses.tutorB}'`),
  );
  await denies("cannot enroll itself in an unpublished course", () =>
    as(db, "authenticated", ids.studentA, `select public.enroll_in_course('${courses.tutorB}')`),
  );

  group("Student quiz integrity");

  await allows("reads its enrolled quiz questions", () =>
    as(db, "authenticated", ids.studentA, `select prompt from public.quiz_questions where id = '${questionId}'`),
  );
  await deniesBy(
    "cannot read correct_answer, even for its own quiz",
    () => as(db, "authenticated", ids.studentA, `select correct_answer from public.quiz_questions`),
    /permission denied|column/i,
  );
  await deniesBy(
    "cannot select correct_answer via * as well",
    () => as(db, "authenticated", ids.studentA, `select * from public.quiz_questions where id = '${questionId}'`),
    /permission denied/i,
  );
  await denies("cannot forge its own quiz attempt score", () =>
    as(db, "authenticated", ids.studentA, `update public.quiz_attempts set score = 100, passed = true`),
  );
  await denies("cannot insert a graded attempt directly", () =>
    as(db, "authenticated", ids.studentA,
      `insert into public.quiz_attempts (quiz_id, student_id, score, percentage, passed, status) values ('${quizId}', auth.uid(), 100, 100, true, 'graded')`),
  );
  await denies("cannot write answers without a real attempt", () =>
    as(db, "authenticated", ids.studentA,
      `insert into public.quiz_answers (attempt_id, question_id, is_correct) values (gen_random_uuid(), '${questionId}', true)`),
  );
  await denies("cannot submit a quiz it is not enrolled for", () =>
    as(db, "authenticated", ids.studentA, `select public.start_quiz_attempt(gen_random_uuid())`),
  );

  group("Quiz grading happens server side");

  const started = await as(db, "authenticated", ids.studentA, `select public.start_quiz_attempt('${quizId}') as attempt`);
  if (!started.ok) {
    failures.push(`${currentGroup} → start a real quiz attempt\n        ${started.error}`);
    console.log(`  FAIL  start a real quiz attempt\n        ${started.error}`);
  } else {
    passed += 1;
    console.log("  pass  start a real quiz attempt");

    const graded = await as(
      db,
      "authenticated",
      ids.studentA,
      `select public.submit_quiz_attempt('${quizId}', jsonb_build_object('${questionId}', '4')) as result`,
    );
    if (graded.ok && graded.rows[0].result.score === 1) {
      passed += 1;
      console.log("  pass  correct answer scores 1 server-side");
    } else {
      failures.push(`${currentGroup} → correct answer scores 1\n        ${graded.error ?? JSON.stringify(graded.rows)}`);
      console.log(`  FAIL  correct answer scores 1\n        ${graded.error ?? JSON.stringify(graded.rows)}`);
    }

    const again = await as(
      db,
      "authenticated",
      ids.studentA,
      `select public.submit_quiz_attempt('${quizId}', jsonb_build_object('${questionId}', '4'))`,
    );
    await denies("cannot re-submit a finished attempt", () => Promise.resolve(again));
  }

  group("Assignment submission isolation");

  await allows("submits its own assignment", () =>
    as(db, "authenticated", ids.studentA,
      `select public.submit_assignment('${assignmentId}', 'my answer') as id`),
  );
  await hidesRows("cannot read its own submission row directly", () =>
    as(db, "authenticated", ids.studentA, `select * from public.assignment_submissions`),
  );
  await denies("cannot forge its own grade", () =>
    as(db, "authenticated", ids.studentA,
      `insert into public.assignment_submissions (assignment_id, student_id, status, score) values ('${assignmentId}', auth.uid(), 'graded', 100)`),
  );
  await denies("cannot grade an assignment", () =>
    as(db, "authenticated", ids.studentA, `select public.grade_assignment(gen_random_uuid(), 100, 'nice')`),
  );
  const attributed = await db.query(
    `select student_id from public.assignment_submissions where assignment_id = $1`,
    [assignmentId],
  );
  record("submission is attributed to the caller, not to a client-supplied id",
    attributed.rows[0].student_id === ids.studentA,
    `stored student_id ${attributed.rows[0].student_id}`);

  // ------------------------------------------------------ tutor boundary ----
  group("Tutor A cannot touch Tutor B's course");

  await blocksWrite("cannot update Tutor B's course", () =>
    as(db, "authenticated", ids.tutorA, `update public.courses set title = 'mine now' where id = '${courses.tutorB}'`),
  );
  await blocksWrite("cannot delete Tutor B's course", () =>
    as(db, "authenticated", ids.tutorA, `delete from public.courses where id = '${courses.tutorB}'`),
  );
  await denies("cannot add modules to Tutor B's course", () =>
    as(db, "authenticated", ids.tutorA,
      `insert into public.modules (course_id, title, position) values ('${courses.tutorB}', 'sneaky', 1)`),
  );
  await hidesRows("cannot see Tutor B's modules", () =>
    as(db, "authenticated", ids.tutorA, `select * from public.modules where course_id = '${courses.tutorB}'`),
  );
  await changes("can update its own course", () =>
    as(db, "authenticated", ids.tutorA, `update public.courses set description = 'mine' where id = '${courses.tutorA}'`),
  );
  await denies("cannot publish its own course directly", () =>
    as(db, "authenticated", ids.tutorA, `update public.courses set status = 'published' where id = '${courses.tutorA}'`),
  );
  await denies("cannot approve its own course", () =>
    as(db, "authenticated", ids.tutorA, `select public.review_course('${courses.tutorA}', 'published', 'self approved')`),
  );
  await denies("cannot grant itself admin", () =>
    as(db, "authenticated", ids.tutorA, `select public.set_user_role(auth.uid(), 'admin')`),
  );
  await denies("cannot assign itself as a tutor elsewhere", () =>
    as(db, "authenticated", ids.tutorA,
      `insert into public.course_tutors (course_id, user_id) values ('${courses.tutorB}', auth.uid())`),
  );

  group("Tutor grading is scoped to its own courses");

  const { rows: subRows } = await db.query(
    `select id from public.assignment_submissions where assignment_id = $1 and student_id = $2`,
    [assignmentId, ids.studentA],
  );
  const submissionId = subRows[0].id;

  await allows("grades a submission in its own course", () =>
    as(db, "authenticated", ids.tutorA,
      `select public.grade_assignment('${submissionId}', 85, 'well done')`),
  );

  const { rows: otherAssign } = await db.query(
    `insert into public.assignments (course_id, title, created_by, is_published) values ('${courses.tutorB}', 'B assignment', '${ids.tutorB}', true) returning id`,
  );
  const { rows: otherSub } = await db.query(
    `insert into public.assignment_submissions (assignment_id, student_id, response_text)
     values ('${otherAssign[0].id}', '${ids.studentB}', 'B work') returning id`,
  );
  await denies("cannot grade a submission in Tutor B's course", () =>
    as(db, "authenticated", ids.tutorA, `select public.grade_assignment('${otherSub[0].id}', 0, 'ruel')`),
  );

  // ------------------------------------------------- suspended / pending ----
  group("Suspended and pending accounts are locked out");

  await deniesBy(
    "suspended student cannot enroll",
    () => as(db, "authenticated", ids.suspended, `select public.enroll_in_course('${courses.tutorA}')`),
    /suspended|not active|pending/i,
  );
  await denies("suspended student cannot start a quiz", () =>
    as(db, "authenticated", ids.suspended, `select public.start_quiz_attempt('${quizId}')`),
  );
  await denies("pending tutor cannot create a course", () =>
    as(db, "authenticated", ids.pendingTutor, `insert into public.courses (title) values ('too early')`),
  );
  await blocksWrite("pending tutor cannot manage Tutor A's course", () =>
    as(db, "authenticated", ids.pendingTutor, `update public.courses set title = 'x' where id = '${courses.tutorA}'`),
  );

  // --------------------------------------------------- tutor application ----
  group("Tutor application decisions");

  const { rows: appRows } = await db.query(
    `insert into auth.users (email, raw_user_meta_data)
     values ('applicant@test.local', '{"requested_role":"tutor","full_name":"Applicant"}') returning id`,
  );
  const applicantId = appRows[0].id;
  // handle_new_user() already filed the pending application, as it must.

  const approvedProfile = await db.query(
    `select role, status from public.profiles where id = $1`,
    [applicantId],
  );
  if (
    approvedProfile.rows[0].role === "tutor" &&
    approvedProfile.rows[0].status === "pending"
  ) {
    passed += 1;
    console.log("  pass  a new tutor signup starts pending, not active");
  } else {
    failures.push(`${currentGroup} → a new tutor signup starts pending\n        ${JSON.stringify(approvedProfile.rows[0])}`);
    console.log(`  FAIL  a new tutor signup starts pending\n        ${JSON.stringify(approvedProfile.rows[0])}`);
  }

  // Admin approves.
  await as(db, "authenticated", ids.admin,
    `select public.approve_tutor('${applicantId}', true, 'welcome')`);

  let after = await db.query(`select role, status from public.profiles where id = $1`, [applicantId]);
  if (after.rows[0].role === "tutor" && after.rows[0].status === "active") {
    passed += 1;
    console.log("  pass  approval activates the pending tutor");
  } else {
    failures.push(`${currentGroup} → approval activates the pending tutor\n        ${JSON.stringify(after.rows[0])}`);
    console.log(`  FAIL  approval activates the pending tutor\n        ${JSON.stringify(after.rows[0])}`);
  }

  // Now a second applicant, rejected: must NOT keep tutor powers.
  const { rows: app2 } = await db.query(
    `insert into auth.users (email, raw_user_meta_data)
     values ('rejected@test.local', '{"requested_role":"tutor","full_name":"Rejected"}') returning id`,
  );
  const rejectedId = app2[0].id;
  await db.query(`update public.tutor_applications set headline = 'x' where user_id = $1`, [rejectedId]);
  await as(db, "authenticated", ids.admin,
    `select public.approve_tutor('${rejectedId}', false, 'not this time')`);

  const { rows: app3 } = await db.query(
    `insert into auth.users (email, raw_user_meta_data)
     values ('rejected2@test.local', '{"requested_role":"tutor"}') returning id`,
  );
  const rejected2Id = app3[0].id;
  await db.query(`update public.tutor_applications set headline = 'x' where user_id = $1`, [rejected2Id]);
  await db.query(
    `update public.tutor_applications set status = 'rejected', review_note = 'not now'
      where user_id = $1`,
    [rejected2Id],
  );

  after = await db.query(`select role, status from public.profiles where id = $1`, [rejected2Id]);
  if (after.rows[0].role !== "tutor") {
    passed += 1;
    console.log("  pass  rejection removes tutor privileges");
  } else {
    failures.push(`${currentGroup} → rejection removes tutor privileges\n        ${JSON.stringify(after.rows[0])}`);
    console.log(`  FAIL  rejection removes tutor privileges\n        ${JSON.stringify(after.rows[0])}`);
  }

  await denies("rejected applicant cannot create a course", () =>
    as(db, "authenticated", rejected2Id, `insert into public.courses (title) values ('after rejection')`),
  );

  // -------------------------------------------------------------- admin ----
  group("Admin powers and private URLs");

  await allows("admin reads any profile", () =>
    as(db, "authenticated", ids.admin, `select * from public.profiles where id = '${ids.studentB}'`),
  );
  await as(db, "authenticated", ids.tutorB,
    `insert into public.modules (course_id, title, position) values ('${courses.tutorB}', 'B module', 1)`);
  const { rows: bModule } = await db.query(
    `select id from public.modules where course_id = $1`, [courses.tutorB]);
  await as(db, "authenticated", ids.tutorB,
    `insert into public.lessons (module_id, course_id, title, position, is_published, youtube_video_url)
     values ('${bModule[0].id}', '${courses.tutorB}', 'B lesson', 1, true, 'https://youtu.be/dQw4w9WgXcQ')`);

  await allows("tutor submits its own course for review", () =>
    as(db, "authenticated", ids.tutorB, `select public.submit_course_for_review('${courses.tutorB}')`),
  );
  await allows("admin publishes a course through review_course", () =>
    as(db, "authenticated", ids.admin, `select public.review_course('${courses.tutorB}', 'approve', 'looks good')`),
  );
  const materialPath = `courses/${courses.tutorA}/materials/`;
  const { rows: materialRows } = await db.query(
    `insert into public.lesson_materials (lesson_id, course_id, title, storage_path)
     values ($1, $2, 'Notes', $3) returning id`,
    [lessonId, courses.tutorA, `${materialPath}PLACEHOLDER`],
  );
  const materialId = materialRows[0].id;
  const materialUrl = `${materialPath}${materialId}.url`;
  await db.query(`update public.lesson_materials set storage_path = $1 where id = $2`,
    [materialUrl, materialId]);
  await as(db, "authenticated", ids.tutorA,
    `insert into storage.objects (bucket_id, name) values ('lms-private', '${materialUrl}')`);
  await allows("admin signs a private resource URL", () =>
    as(db, "authenticated", ids.admin,
      `select public.get_private_resource_url('${materialUrl}') as url`),
  );
  await allows("enrolled student signs their own course material", () =>
    as(db, "authenticated", ids.studentA,
      `select public.get_private_resource_url('${materialUrl}') as url`),
  );
  await denies("unrelated student cannot sign a private resource", () =>
    as(db, "authenticated", ids.studentB,
      `select public.get_private_resource_url('${materialUrl}')`),
  );
  await denies("student cannot sign another student's submission", () =>
    as(db, "authenticated", ids.studentA,
      `select public.get_private_resource_url('courses/${courses.tutorA}/submissions/${assignmentId}/${ids.studentB}.url')`),
  );

  // -------------------------------------------------------- storage RLS ----
  group("Private storage object policies");

  await allows("enrolled student sees their course material object", () =>
    as(db, "authenticated", ids.studentA,
      `select name from storage.objects where name = '${materialUrl}'`),
  );
  await hidesRows("unrelated student cannot see that object", () =>
    as(db, "authenticated", ids.studentB,
      `select name from storage.objects where name = '${materialUrl}'`),
  );
  await hidesRows("Tutor B cannot see Tutor A's material object", () =>
    as(db, "authenticated", ids.tutorB,
      `select name from storage.objects where name = '${materialUrl}'`),
  );
  await db.query(
    `insert into storage.objects (bucket_id, name) values ('lms-private', $1)`,
    [`courses/${courses.tutorA}/materials/not-a-uuid.url`]);
  await hidesRows("an object with a malformed name is unreachable, even for the tutor", () =>
    as(db, "authenticated", ids.tutorA,
      `select name from storage.objects where name like '%not-a-uuid.url'`),
  );
  await denies("a malformed object name cannot be signed", () =>
    as(db, "authenticated", ids.tutorA,
      `select public.get_private_resource_url('courses/${courses.tutorA}/materials/not-a-uuid.url')`),
  );
  await denies("student cannot upload material to a course", () =>
    as(db, "authenticated", ids.studentA,
      `insert into storage.objects (bucket_id, name) values ('lms-private', 'courses/${courses.tutorA}/materials/fake.url')`),
  );
  await denies("student cannot upload under another student's id", () =>
    as(db, "authenticated", ids.studentA,
      `insert into storage.objects (bucket_id, name) values ('lms-private', 'courses/${courses.tutorA}/submissions/${assignmentId}/${ids.studentB}.url')`),
  );
  await changes("student uploads their own submission object", () =>
    as(db, "authenticated", ids.studentA,
      `insert into storage.objects (bucket_id, name) values ('lms-private', 'courses/${courses.tutorA}/submissions/${assignmentId}/${ids.studentA}.url')`),
  );
  const bucket = await db.query(`select public from storage.buckets where id = 'lms-private'`);
  record("bucket is private, not public",
    bucket.rows.length === 1 && bucket.rows[0].public === false,
    JSON.stringify(bucket.rows));

  // ------------------------------------------------------------- summary ----
  console.log(`\n${"─".repeat(60)}`);
  if (failures.length === 0) {
    console.log(`RESULT: ${passed} security assertions passed, 0 failed.`);
  } else {
    console.log(`RESULT: ${passed} passed, ${failures.length} FAILED\n`);
    for (const failure of failures) console.log(`  ✗ ${failure}`);
  }

  await db.close();
  process.exit(failures.length === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
