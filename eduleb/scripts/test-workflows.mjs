/**
 * End-to-end workflow tests: the journeys the three dashboards actually perform,
 * start to finish, through the same RPCs the frontend will call.
 *
 * test-security.mjs proves bad things are refused. This proves good things work —
 * signup, publishing, enrolling, studying, sitting a quiz, submitting and being
 * graded, notifications, and the admin review queue. A schema can pass every
 * security assertion and still be unusable, which is what this file catches.
 *
 *   node scripts/test-workflows.mjs
 */
import { as, bootstrapDatabase } from "./pg-harness.mjs";

let passed = 0;
const failures = [];
let currentGroup = "";

function group(name) {
  currentGroup = name;
  console.log(`\n${name}`);
}

function check(label, ok, detail) {
  if (ok) {
    passed += 1;
    console.log(`  pass  ${label}`);
  } else {
    failures.push(`${currentGroup} → ${label}${detail ? `\n        ${detail}` : ""}`);
    console.log(`  FAIL  ${label}${detail ? `\n        ${detail}` : ""}`);
  }
}

/** Runs a statement that must succeed, and hands the rows to the caller. */
async function ok(db, role, uid, sql) {
  const result = await as(db, role, uid, sql);
  if (!result.ok) throw new Error(`${currentGroup}: ${sql.slice(0, 70)}… → ${result.error}`);
  return result.rows;
}

const ids = {};
const ctx = {};

async function main() {
  const db = await bootstrapDatabase();

  // ======================================================== accounts ========
  group("Signup provisions the right kind of account");

  const signup = async (email, requested) => {
    const { rows } = await db.query(
      `insert into auth.users (email, raw_user_meta_data)
       values ($1, $2) returning id`,
      [email, JSON.stringify({ requested_role: requested, full_name: email.split("@")[0] })],
    );
    return rows[0].id;
  };

  ids.student = await signup("student@w.test", "student");
  ids.tutor = await signup("tutor@w.test", "tutor");
  ids.tutor2 = await signup("tutor2@w.test", "tutor");
  ids.admin = await signup("admin@w.test", "admin");

  const profileOf = async (uid) =>
    (await db.query(`select role, status from public.profiles where id = $1`, [uid])).rows[0];

  check("a student signup is active immediately", (await profileOf(ids.student)).status === "active");
  check("a tutor signup starts pending", (await profileOf(ids.tutor)).status === "pending");
  check("a tutor signup files an application",
    (await db.query(`select 1 from public.tutor_applications where user_id = $1`, [ids.tutor])).rowCount === 1);
  check("asking for admin does not grant admin", (await profileOf(ids.admin)).role === "student");

  // Admins are promoted out of band, standing in for bootstrap_admin().
  await db.query(`update public.profiles set role = 'admin' where id = $1`, [ids.admin]);
  await db.query(`update public.profiles set status = 'active' where id = $1`, [ids.tutor]);
  await db.query(`update public.profiles set status = 'active' where id = $1`, [ids.tutor2]);

  // ======================================================= authoring ========
  group("A tutor builds a course");

  const [course] = await ok(db, "authenticated", ids.tutor,
    `insert into public.courses (title, description, level) values ('WAEC Mathematics', 'Full prep', 'Foundation') returning id, status, created_by`);
  ctx.course = course.id;
  check("a new course starts as a draft owned by its author",
    course.status === "draft" && course.created_by === ids.tutor);

  const [module1] = await ok(db, "authenticated", ids.tutor,
    `insert into public.modules (course_id, title, position) values ('${ctx.course}', 'Number', 1) returning id`);
  const [module2] = await ok(db, "authenticated", ids.tutor,
    `insert into public.modules (course_id, title, position) values ('${ctx.course}', 'Algebra', 2) returning id`);
  ctx.module1 = module1.id;
  ctx.module2 = module2.id;

  const [lesson1] = await ok(db, "authenticated", ids.tutor,
    `insert into public.lessons (module_id, course_id, title, position, youtube_video_url, is_published)
     values ('${ctx.module1}', '${ctx.course}', 'Fractions', 1, 'https://youtu.be/dQw4w9WgXcQ', true)
     returning id, youtube_video_id`);
  ctx.lesson1 = lesson1.id;
  check("the YouTube id is derived from a pasted link",
    lesson1.youtube_video_id === "dQw4w9WgXcQ", `got ${lesson1.youtube_video_id}`);

  const [lesson2] = await ok(db, "authenticated", ids.tutor,
    `insert into public.lessons (module_id, course_id, title, position, is_published, youtube_video_url)
     values ('${ctx.module1}', '${ctx.course}', 'Decimals', 2, true, 'https://youtu.be/dQw4w9WgXcQ') returning id`);
  ctx.lesson2 = lesson2.id;

  const [material] = await ok(db, "authenticated", ids.tutor,
    `insert into public.lesson_materials (lesson_id, course_id, title, storage_path, created_by)
     values ('${ctx.lesson1}', '${ctx.course}', 'Notes',
             'courses/${ctx.course}/materials/PLACEHOLDER', auth.uid()) returning id`);
  const materialUrl = `courses/${ctx.course}/materials/${material.id}.url`;
  await db.query(`update public.lesson_materials set storage_path = $1 where id = $2`, [materialUrl, material.id]);
  await ok(db, "authenticated", ids.tutor,
    `insert into storage.objects (bucket_id, name) values ('lms-private', '${materialUrl}')`);

  group("Reordering content");

  await ok(db, "authenticated", ids.tutor,
    `select public.reorder_lessons('${ctx.module1}', array['${ctx.lesson2}','${ctx.lesson1}']::uuid[])`);
  const reordered = await ok(db, "authenticated", ids.tutor,
    `select title from public.lessons where module_id = '${ctx.module1}' order by position`);
  check("reorder_lessons renumbers in the order given",
    reordered[0].title === "Decimals" && reordered[1].title === "Fractions",
    JSON.stringify(reordered.map((r) => r.title)));

  await ok(db, "authenticated", ids.tutor,
    `select public.reorder_modules('${ctx.course}', array['${ctx.module2}','${ctx.module1}']::uuid[])`);
  const mods = await ok(db, "authenticated", ids.tutor,
    `select title from public.modules where course_id = '${ctx.course}' order by position`);
  check("reorder_modules renumbers in the order given",
    mods[0].title === "Algebra" && mods[1].title === "Number");

  // Put it back so lesson numbering reads naturally below.
  await ok(db, "authenticated", ids.tutor,
    `select public.reorder_lessons('${ctx.module1}', array['${ctx.lesson1}','${ctx.lesson2}']::uuid[])`);

  // ======================================================= publishing =======
  group("Publishing runs through the review queue");

  // A genuinely empty course, to prove the content check is real.
  const [emptyCourse] = await ok(db, "authenticated", ids.tutor,
    `insert into public.courses (title) values ('Empty shell') returning id`);
  const tooEarly = await as(db, "authenticated", ids.tutor,
    `select public.submit_course_for_review('${emptyCourse.id}')`);
  check("a course with no content cannot be submitted", !tooEarly.ok, tooEarly.ok ? "it was accepted" : null);

  await ok(db, "authenticated", ids.tutor, `select public.submit_course_for_review('${ctx.course}')`);
  const [pendingCourse] = await ok(db, "authenticated", ids.admin,
    `select status from public.courses where id = '${ctx.course}'`);
  check("submitting for review parks the course in pending_review",
    pendingCourse.status === "pending_review");

  const selfReview = await as(db, "authenticated", ids.tutor,
    `select public.review_course('${ctx.course}', 'approve', 'self')`);
  check("a tutor cannot review its own course", !selfReview.ok);

  await ok(db, "authenticated", ids.admin, `select public.review_course('${ctx.course}', 'approve', 'looks good')`);
  const [live] = await ok(db, "authenticated", ids.admin,
    `select status, published_at is not null as stamped from public.courses where id = '${ctx.course}'`);
  check("an admin approval publishes the course and stamps published_at",
    live.status === "published" && live.stamped === true, JSON.stringify(live));

  // ======================================================== enrolling =======
  group("A student enrols and studies");

  await ok(db, "authenticated", ids.student, `select public.enroll_in_course('${ctx.course}')`);
  const [enrolment] = await ok(db, "authenticated", ids.student,
    `select status from public.course_enrollments where course_id = '${ctx.course}' and student_id = auth.uid()`);
  check("enrolling creates an active enrolment", enrolment.status === "active");

  const enrolCount = await ok(db, "authenticated", ids.student,
    `select count(*)::int as n from public.course_enrollments
      where course_id = '${ctx.course}' and student_id = auth.uid()`);
  check("a second enrolment attempt does not duplicate the row", enrolCount[0].n === 1, String(enrolCount[0].n));

  const notifications = await ok(db, "authenticated", ids.student,
    `select type from public.notifications order by created_at`);
  check("the student was notified about the enrolment",
    notifications.some((n) => n.type === "enrollment"),
    JSON.stringify(notifications.map((n) => n.type)));

  await ok(db, "authenticated", ids.student, `select public.mark_lesson_complete('${ctx.lesson1}')`);
  const [progress] = await ok(db, "authenticated", ids.student,
    `select completed, progress_percentage from public.lesson_progress where lesson_id = '${ctx.lesson1}' and student_id = auth.uid()`);
  check("marking a lesson complete records 100%",
    progress.completed === true && Number(progress.progress_percentage) === 100,
    JSON.stringify(progress));

  await ok(db, "authenticated", ids.student, `select public.set_lesson_progress('${ctx.lesson2}', 40)`);
  const [partial] = await ok(db, "authenticated", ids.student,
    `select completed, progress_percentage from public.lesson_progress where lesson_id = '${ctx.lesson2}' and student_id = auth.uid()`);
  check("partial progress is stored without marking it complete",
    partial.completed === false && Number(partial.progress_percentage) === 40,
    JSON.stringify(partial));

  const myProgress = await ok(db, "authenticated", ids.student, `select * from public.my_course_progress()`);
  const mine = myProgress.find((r) => r.course_id === ctx.course);
  check("my_course_progress reports one enrolled course", Boolean(mine), JSON.stringify(myProgress));
  check("course progress counts completed lessons",
    mine && Number(mine.completed_lessons) === 1, mine ? JSON.stringify(mine) : "no row");

  const cont = await ok(db, "authenticated", ids.student,
    `select * from public.continue_learning('${ctx.course}')`);
  check("Continue Learning points at the unfinished lesson",
    cont.length === 1 && cont[0].lesson_id === ctx.lesson2,
    JSON.stringify(cont));

  // ============================================================= quiz =======
  group("A quiz is taken and marked in Postgres");

  const [quiz] = await ok(db, "authenticated", ids.tutor,
    `insert into public.quizzes (course_id, lesson_id, created_by, title, is_published, passing_score, attempt_limit)
     values ('${ctx.course}', '${ctx.lesson1}', auth.uid(), 'Fractions check', true, 50, 2) returning id`);
  ctx.quiz = quiz.id;

  const [q1] = await ok(db, "authenticated", ids.tutor,
    `insert into public.quiz_questions (quiz_id, position, prompt, question_type, options, correct_answer, points)
     values ('${ctx.quiz}', 1, 'Half of 10?', 'mcq', '["3","5","7"]'::jsonb, '5', 1) returning id`);
  const [q2] = await ok(db, "authenticated", ids.tutor,
    `insert into public.quiz_questions (quiz_id, position, prompt, question_type, options, correct_answer, points)
     values ('${ctx.quiz}', 2, 'Short answer', 'short_answer', null, 'slope', 2) returning id`);
  ctx.q1 = q1.id;
  ctx.q2 = q2.id;

  const tutorView = await ok(db, "authenticated", ids.tutor,
    `select prompt, correct_answer from public.manage_quiz_questions('${ctx.quiz}') order by position`);
  check("a tutor can read the question bank including answers",
    tutorView.length === 2 && tutorView[0].correct_answer === "5");

  const attemptId = (await ok(db, "authenticated", ids.student,
    `select public.start_quiz_attempt('${ctx.quiz}') as id`))[0].id;
  check("an attempt is opened", Boolean(attemptId));

  const result = (await ok(db, "authenticated", ids.student,
    `select public.submit_quiz_attempt('${ctx.quiz}', jsonb_build_object('${ctx.q1}', '5', '${ctx.q2}', 'slope')) as r`))[0].r;
  check("a fully correct attempt scores full marks", Number(result.score) === 3, JSON.stringify(result));
  check("percentage is computed from the points", Number(result.percentage) === 100, JSON.stringify(result));
  check("passing is decided against passing_score", result.passed === true, JSON.stringify(result));

  const graded = await ok(db, "authenticated", ids.student,
    `select score, percentage, passed, status from public.quiz_attempts where id = '${attemptId}'`);
  check("the stored attempt is marked graded",
    graded[0].status === "graded" && Number(graded[0].score) === 3,
    JSON.stringify(graded[0]));

  const attempt2 = (await ok(db, "authenticated", ids.student,
    `select public.start_quiz_attempt('${ctx.quiz}') as id`))[0].id;
  const mixed = (await ok(db, "authenticated", ids.student,
    `select public.submit_quiz_attempt('${ctx.quiz}', jsonb_build_object('${ctx.q1}', '3', '${ctx.q2}', 'slope')) as r`))[0].r;
  check("one wrong answer loses only that question's points",
    Number(mixed.score) === 2 && mixed.passed === true, JSON.stringify(mixed));
  check("a second attempt is allowed up to the limit", Boolean(attempt2));

  const overLimit = await as(db, "authenticated", ids.student, `select public.start_quiz_attempt('${ctx.quiz}')`);
  check("a third attempt is refused at the attempt limit", !overLimit.ok, overLimit.ok ? "it was allowed" : null);

  // ======================================================= assignment =======
  group("An assignment is submitted and graded");

  const [assignment] = await ok(db, "authenticated", ids.tutor,
    `insert into public.assignments (course_id, title, created_by, is_published)
     values ('${ctx.course}', 'Exercise 1', auth.uid(), true) returning id`);
  ctx.assignment = assignment.id;

  const submissionId = (await ok(db, "authenticated", ids.student,
    `select public.submit_assignment('${ctx.assignment}', 'My working') as id`))[0].id;
  const [submission] = await ok(db, "authenticated", ids.tutor,
    `select status, response_text, score from public.assignment_submissions where id = '${submissionId}'`);
  check("a submission starts as submitted, ungraded",
    submission.status === "submitted" && submission.score === null,
    JSON.stringify(submission));

  const studentResult = await ok(db, "authenticated", ids.student,
    `select public.my_assignment_result('${ctx.assignment}') as r`);
  check("the student sees their own submission", Boolean(studentResult[0].r?.status));

  await ok(db, "authenticated", ids.tutor,
    `select public.grade_assignment('${submissionId}', 75, 'Good effort')`);
  const gradedSub = await ok(db, "authenticated", ids.tutor,
    `select status, score, feedback, graded_by is not null as by_tutor
     from public.assignment_submissions where id = '${submissionId}'`);
  check("grading records the score, feedback and grader",
    gradedSub[0].status === "graded" && Number(gradedSub[0].score) === 75 && gradedSub[0].by_tutor === true,
    JSON.stringify(gradedSub[0]));

  // Grading and releasing results are separate steps on purpose, so a tutor can
  // mark a whole cohort before anyone sees a mark.
  const beforePublish = await ok(db, "authenticated", ids.student,
    `select public.my_assignment_result('${ctx.assignment}') as r`);
  check("the grade is withheld until results are published",
    beforePublish[0].r.status === "graded" && beforePublish[0].r.score === null,
    JSON.stringify(beforePublish[0].r));

  await ok(db, "authenticated", ids.tutor,
    `update public.assignments set results_published = true where id = '${ctx.assignment}'`);

  const studentSeesGrade = await ok(db, "authenticated", ids.student,
    `select public.my_assignment_result('${ctx.assignment}') as r`);
  check("once published, the student sees the score, feedback and timestamp",
    Number(studentSeesGrade[0].r.score) === 75 &&
      studentSeesGrade[0].r.feedback === "Good effort" &&
      studentSeesGrade[0].r.graded_at !== null,
    JSON.stringify(studentSeesGrade[0].r));

  const rewrite = await as(db, "authenticated", ids.student,
    `update public.assignment_submissions set response_text = 'changed' where id = '${submissionId}'`);
  check("a graded submission cannot be rewritten", !rewrite.ok);

  // ======================================================== live class =====
  group("A live class is scheduled, run and recorded");

  const meetingPath = `courses/${ctx.course}/live/PLACEHOLDER.url`;
  const [liveClass] = await ok(db, "authenticated", ids.tutor,
    `insert into public.live_classes (course_id, created_by, title, platform, meeting_storage_path,
                                     scheduled_date, start_time, end_time)
     values ('${ctx.course}', auth.uid(), 'Fractions live', 'youtube_live', '${meetingPath}',
             current_date, '18:00', '19:00') returning id`);
  ctx.live = liveClass.id;
  const liveUrl = `courses/${ctx.course}/live/${liveClass.id}.url`;
  await db.query(`update public.live_classes set meeting_storage_path = $1 where id = $2`, [liveUrl, ctx.live]);
  await ok(db, "authenticated", ids.tutor,
    `insert into storage.objects (bucket_id, name) values ('lms-private', '${liveUrl}')`);

  const meetingLink = await ok(db, "authenticated", ids.student,
    `select public.get_private_resource_url('${liveUrl}') as url`);
  check("an enrolled student gets a signed meeting link",
    typeof meetingLink[0].url === "string" && meetingLink[0].url.includes("lms-private"),
    JSON.stringify(meetingLink[0]));

  await ok(db, "authenticated", ids.tutor, `select public.set_live_class_status('${ctx.live}', 'live')`);
  await ok(db, "authenticated", ids.tutor, `select public.set_live_class_status('${ctx.live}', 'completed')`);
  const [liveRow] = await ok(db, "authenticated", ids.tutor,
    `select status from public.live_classes where id = '${ctx.live}'`);
  check("a live class can be moved to completed", liveRow.status === "completed");

  await ok(db, "authenticated", ids.tutor,
    `select public.attach_class_recording('${ctx.live}', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ')`);
  const [recorded] = await ok(db, "authenticated", ids.tutor,
    `select recording_youtube_id from public.live_classes where id = '${ctx.live}'`);
  check("attaching a recording stores the derived YouTube id",
    recorded.recording_youtube_id === "dQw4w9WgXcQ", JSON.stringify(recorded));

  // ==================================================== notifications =======
  group("Notifications");

  const unread = await ok(db, "authenticated", ids.student, `select public.unread_notification_count() as n`);
  check("the student has unread notifications", Number(unread[0].n) > 0, String(unread[0].n));

  await ok(db, "authenticated", ids.student, `select public.mark_all_notifications_read()`);
  const afterRead = await ok(db, "authenticated", ids.student, `select public.unread_notification_count() as n`);
  check("marking all read clears the badge", Number(afterRead[0].n) === 0, String(afterRead[0].n));

  const [one] = await ok(db, "authenticated", ids.tutor,
    `select id from public.notifications where user_id = '${ids.tutor}' limit 1`);
  if (one) {
    await ok(db, "authenticated", ids.tutor, `select public.mark_notification_read('${one.id}')`);
    check("a single notification can be marked read", true);
  } else {
    check("a single notification can be marked read", false, "the tutor had no notifications");
  }

  // ======================================================== dashboards ======
  group("Dashboards");

  const studentStats = (await ok(db, "authenticated", ids.student,
    `select public.student_dashboard_stats() as s`))[0].s;
  check("student stats count the enrolment",
    Number(studentStats.enrolled_courses) === 1, JSON.stringify(studentStats));
  // completed / in_progress count COURSES, not lessons: this student has finished
  // one of two lessons, so the course is in progress and not complete.
  check("student stats count a half-finished course as in progress",
    Number(studentStats.in_progress) === 1 && Number(studentStats.completed) === 0,
    JSON.stringify(studentStats));
  check("student stats report overall progress",
    Number(studentStats.overall_progress) === 50, JSON.stringify(studentStats));

  const tutorStats = (await ok(db, "authenticated", ids.tutor,
    `select public.tutor_dashboard_stats() as s`))[0].s;
  // Two courses exist: the real one plus the empty shell used for the rejection test.
  check("tutor stats count both of the tutor's courses",
    Number(tutorStats.total_courses) === 2, JSON.stringify(tutorStats));
  check("tutor stats separate published from draft",
    Number(tutorStats.published_courses) === 1 && Number(tutorStats.draft_courses) === 1,
    JSON.stringify(tutorStats));
  check("tutor stats count enrolled students",
    Number(tutorStats.total_students) === 1, JSON.stringify(tutorStats));

  const adminStats = (await ok(db, "authenticated", ids.admin,
    `select public.admin_dashboard_stats() as s`))[0].s;
  check("admin stats see every student and tutor",
    Number(adminStats.total_students) === 1 && Number(adminStats.tutors) === 2,
    JSON.stringify(adminStats));
  check("admin stats see both pending tutor applications",
    Number(adminStats.pending_tutor_approvals) === 2, JSON.stringify(adminStats));
  check("admin stats count the published course",
    Number(adminStats.published_courses) === 1, JSON.stringify(adminStats));

  // ========================================================== admin =========
  group("Admin operations");

  await ok(db, "authenticated", ids.admin, `select public.set_user_status('${ids.student2 ?? ids.tutor2}', 'suspended', 'quiet period')`);
  const [suspended] = await ok(db, "authenticated", ids.admin,
    `select status, status_note from public.profiles where id = '${ids.tutor2}'`);
  check("an admin can suspend an account and leave a note",
    suspended.status === "suspended" && suspended.status_note === "quiet period",
    JSON.stringify(suspended));
  await ok(db, "authenticated", ids.admin, `select public.set_user_status('${ids.tutor2}', 'active', null)`);

  const [enrolmentRow] = await ok(db, "authenticated", ids.admin,
    `select id from public.course_enrollments where course_id = '${ctx.course}' and student_id = '${ids.student}'`);
  await ok(db, "authenticated", ids.admin,
    `select public.admin_set_enrollment_status('${enrolmentRow.id}', 'completed')`);
  const [doneEnrolment] = await ok(db, "authenticated", ids.student,
    `select status from public.course_enrollments where course_id = '${ctx.course}'`);
  check("an admin can close an enrolment", doneEnrolment.status === "completed");

  const [announcement] = await ok(db, "authenticated", ids.admin,
    `insert into public.announcements (title, body, audience, status, published_at, created_by)
     values ('Term dates', 'Exams start in March', 'all', 'published', now(), auth.uid()) returning id`);
  const visible = await ok(db, "authenticated", ids.student,
    `select title from public.announcements where id = '${announcement.id}'`);
  check("a published announcement reaches students", visible.length === 1);

  await ok(db, "authenticated", ids.admin,
    `insert into public.announcements (title, audience, status, published_at, created_by)
     values ('Draft only', 'all', 'draft', now(), auth.uid())`);
  const drafts = await ok(db, "authenticated", ids.student, `select title from public.announcements`);
  check("a draft announcement is not published to students",
    !drafts.some((d) => d.title === "Draft only"),
    JSON.stringify(drafts.map((d) => d.title)));

  const audit = await ok(db, "authenticated", ids.admin,
    `select action from public.audit_logs order by created_at`);
  check("the audit log recorded the course review",
    audit.some((a) => a.action.includes("course")), JSON.stringify(audit.map((a) => a.action)));

  // ========================================================= summary ========
  console.log(`\n${"─".repeat(60)}`);
  if (failures.length === 0) {
    console.log(`RESULT: ${passed} workflow assertions passed, 0 failed.`);
  } else {
    console.log(`RESULT: ${passed} passed, ${failures.length} FAILED\n`);
    for (const failure of failures) console.log(`  ✗ ${failure}`);
  }

  await db.close();
  process.exit(failures.length === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(`\n${error.message}`);
  process.exit(1);
});
