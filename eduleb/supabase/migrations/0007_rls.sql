-- =============================================================================
-- CharterPath LMS — 0006 row level security
--
-- The enforcement layer (spec 2, 49, 50, 63). Every policy derives identity
-- from auth.uid() or from the SECURITY DEFINER helpers in 0001 — never from a
-- value the browser supplied.
--
-- Grants are as important as policies. RLS decides *which rows*, grants decide
-- *which columns and which commands*. Where a client must not write something
-- (a grade, a role, a status, a correct answer, an audit row) the column is
-- simply not granted, so the operation fails at the database even if a policy
-- were somehow satisfied.
-- =============================================================================

-- --------------------------------------------------------------- enable -----

do $$
declare t text;
begin
  foreach t in array array[
    'profiles', 'tutor_applications', 'courses', 'course_tutors', 'modules', 'lessons',
    'lesson_materials', 'live_classes', 'course_enrollments', 'lesson_progress',
    'quizzes', 'quiz_questions', 'quiz_attempts', 'quiz_answers', 'assignments',
    'assignment_submissions', 'notifications', 'announcements', 'audit_logs'
  ] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- The site is entirely behind authentication: the anon key gets nothing.
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all functions in schema public from anon;

-- --------------------------------------------------- helpers for RLS below --
--
-- Defined before the policies that call them. RLS expressions are resolved when
-- a query runs, but keeping them ahead of their use keeps the file readable.

create or replace function public.course_id_of(p_assignment_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select a.course_id from public.assignments a where a.id = p_assignment_id;
$$;

create or replace function public.lesson_is_published(p_lesson_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select is_published from public.lessons where id = p_lesson_id), false);
$$;

-- ---------------------------------------------------- function privileges ---

-- Postgres grants EXECUTE to PUBLIC on new functions by default. Left alone,
-- that would let the anon key call set_user_role() and friends. The bodies also
-- check permissions, so this is the second lock rather than the only one.
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
  loop
    execute format('revoke execute on function %s from public', f.sig);
  end loop;
end $$;

-- Authenticated gets every helper and RPC (each one still enforces its own
-- role and ownership checks inside). Anon gets none.
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
  loop
    execute format('grant execute on function %s to authenticated', f.sig);
  end loop;
end $$;

-- -------------------------------------------------------------- profiles ---

revoke all on public.profiles from authenticated;
grant select on public.profiles to authenticated;
-- Spec 22: a user may edit their own name, phone and avatar. role, status and
-- status_note are not granted, so "change my role" is impossible for a student.
grant update (full_name, phone, avatar_url) on public.profiles to authenticated;

create policy profiles_select on public.profiles
  for select to authenticated
  using (
    id = auth.uid()
    or public.is_admin()
    or (
      role = 'student'
      and exists (
        select 1
          from public.course_enrollments e
          join public.courses c on c.id = e.course_id
         where e.student_id = profiles.id
           and public.manages_course(c.id)
      )
    )
  );

create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- ------------------------------------------------------ tutor_applications -

revoke all on public.tutor_applications from authenticated;
grant select on public.tutor_applications to authenticated;

create policy tutor_applications_select on public.tutor_applications
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- Insert and update are absent on purpose: the signup trigger creates the
-- application and public.approve_tutor() decides it. No client write path.

-- ---------------------------------------------------------------- courses ---

revoke all on public.courses from authenticated;
grant select on public.courses to authenticated;
grant insert (code, title, description, level, plan, thumbnail_url, created_by, status)
  on public.courses to authenticated;
grant update (code, title, description, level, plan, thumbnail_url)
  on public.courses to authenticated;
grant delete on public.courses to authenticated;

-- created_by is tested first, straight off the row, with no table scan. That
-- matters for `insert(...).select(...)`: the RETURNING clause is checked against
-- this policy, and can_view_course() would otherwise look for a courses row that
-- the current statement has not made visible to its own snapshot yet.
create policy courses_select on public.courses
  for select to authenticated
  using (created_by = auth.uid() or public.can_view_course(id));

-- courses_guard_insert overwrites created_by and status, so the with-check can
-- rely on them: a tutor always owns what they create and it always starts draft.
create policy courses_insert on public.courses
  for insert to authenticated
  with check (public.is_tutor() and created_by = auth.uid() and status = 'draft');

-- Only the teaching tutors (and admins) may edit. status is not in the column
-- grant, so publication changes can only come from review_course().
create policy courses_update on public.courses
  for update to authenticated
  using (public.manages_course(id))
  with check (public.manages_course(id));

create policy courses_delete on public.courses
  for delete to authenticated
  using (public.manages_course(id) and status in ('draft', 'archived'));

-- ----------------------------------------------------------- course_tutors -

revoke all on public.course_tutors from authenticated;
grant select, insert, delete on public.course_tutors to authenticated;
grant update (assigned_by, assigned_at) on public.course_tutors to authenticated;

create policy course_tutors_select on public.course_tutors
  for select to authenticated
  using (user_id = auth.uid() or public.manages_course(course_id));

create policy course_tutors_write on public.course_tutors
  for all to authenticated
  using (public.manages_course(course_id))
  with check (public.manages_course(course_id));

-- ---------------------------------------------------------------- modules ---

revoke all on public.modules from authenticated;
grant select on public.modules to authenticated;
grant insert (course_id, title, position) on public.modules to authenticated;
grant update (title, position) on public.modules to authenticated;
grant delete on public.modules to authenticated;

create policy modules_select on public.modules
  for select to authenticated
  using (public.can_view_course(course_id));

create policy modules_insert on public.modules
  for insert to authenticated
  with check (public.manages_course(course_id));

create policy modules_update on public.modules
  for update to authenticated
  using (public.manages_course(course_id))
  with check (public.manages_course(course_id));

create policy modules_delete on public.modules
  for delete to authenticated
  using (public.manages_course(course_id));

-- ---------------------------------------------------------------- lessons ---

revoke all on public.lessons from authenticated;
grant select on public.lessons to authenticated;
grant insert (module_id, course_id, title, description, position, youtube_video_url, is_published)
  on public.lessons to authenticated;
grant update (title, description, position, youtube_video_url, is_published)
  on public.lessons to authenticated;
grant delete on public.lessons to authenticated;

-- Students only ever see published lessons; tutors see their drafts.
create policy lessons_select on public.lessons
  for select to authenticated
  using (public.can_view_course(course_id) and (public.manages_course(course_id) or is_published));

create policy lessons_insert on public.lessons
  for insert to authenticated
  with check (public.manages_course(course_id));

create policy lessons_update on public.lessons
  for update to authenticated
  using (public.manages_course(course_id))
  with check (public.manages_course(course_id));

create policy lessons_delete on public.lessons
  for delete to authenticated
  using (public.manages_course(course_id));

-- -------------------------------------------------------- lesson_materials -

revoke all on public.lesson_materials from authenticated;
grant select on public.lesson_materials to authenticated;
grant insert (lesson_id, course_id, title, type, storage_path, description, position, created_by)
  on public.lesson_materials to authenticated;
grant update (title, type, storage_path, description, position)
  on public.lesson_materials to authenticated;
grant delete on public.lesson_materials to authenticated;

-- storage_path is deliberately readable: it is a location, not a secret. The
-- Drive URL behind it needs a signed URL from get_private_resource_url().
create policy lesson_materials_select on public.lesson_materials
  for select to authenticated
  using (public.can_view_course(course_id) and (public.manages_course(course_id) or lesson_is_published(lesson_id)));

create policy lesson_materials_insert on public.lesson_materials
  for insert to authenticated
  with check (public.manages_course(course_id));

create policy lesson_materials_update on public.lesson_materials
  for update to authenticated
  using (public.manages_course(course_id))
  with check (public.manages_course(course_id));

create policy lesson_materials_delete on public.lesson_materials
  for delete to authenticated
  using (public.manages_course(course_id));

-- ------------------------------------------------------------ live_classes --

revoke all on public.live_classes from authenticated;
-- meeting_storage_path is not in this list. Nobody can read it through PostgREST,
-- including tutors — the URL is only ever released by get_private_resource_url(),
-- which re-checks access. This is spec 14/16/42 ("do not unnecessarily expose
-- private meeting URLs") enforced structurally rather than by convention.
grant select (
  id, course_id, lesson_id, created_by, title, platform, scheduled_date,
  start_time, end_time, status, recording_youtube_url, recording_youtube_id,
  notes, created_at, updated_at
) on public.live_classes to authenticated;
grant insert (
  course_id, lesson_id, created_by, title, platform, meeting_storage_path,
  scheduled_date, start_time, end_time, status, notes
) on public.live_classes to authenticated;
-- status is absent: it moves only through set_live_class_status(), which refuses
-- to un-cancel and records the audit row.
grant update (title, platform, meeting_storage_path, scheduled_date, start_time, end_time, notes)
  on public.live_classes to authenticated;
grant delete on public.live_classes to authenticated;

create policy live_classes_select on public.live_classes
  for select to authenticated
  using (public.can_view_course(course_id));

create policy live_classes_insert on public.live_classes
  for insert to authenticated
  with check (public.manages_course(course_id));

create policy live_classes_update on public.live_classes
  for update to authenticated
  using (public.manages_course(course_id))
  with check (public.manages_course(course_id));

create policy live_classes_delete on public.live_classes
  for delete to authenticated
  using (public.manages_course(course_id) and status <> 'live');

-- ------------------------------------------------------ course_enrollments --

revoke all on public.course_enrollments from authenticated;
grant select on public.course_enrollments to authenticated;
-- No insert, no update: enrolment is enroll_in_course(), and any status change is
-- admin_set_enrollment_status(). Spec 47 — a student cannot enrol somebody else
-- because the row they would have to name is never written by a client.
grant delete on public.course_enrollments to authenticated;

create policy course_enrollments_select on public.course_enrollments
  for select to authenticated
  using (
    student_id = auth.uid()
    or public.is_admin()
    or public.manages_course(course_id)
  );

create policy course_enrollments_delete on public.course_enrollments
  for delete to authenticated
  using (public.is_admin());

-- --------------------------------------------------------- lesson_progress --

revoke all on public.lesson_progress from authenticated;
grant select on public.lesson_progress to authenticated;
-- Writes come from mark_lesson_complete() / set_lesson_progress() so that
-- progress_percentage is derived rather than posted (spec 11, 22).
grant update on public.lesson_progress to authenticated;

create policy lesson_progress_select on public.lesson_progress
  for select to authenticated
  using (
    student_id = auth.uid()
    or public.is_admin()
    or public.manages_course(course_id)
  );

create policy lesson_progress_update on public.lesson_progress
  for update to authenticated
  using (public.manages_course(course_id))
  with check (public.manages_course(course_id));

-- ----------------------------------------------------------------- quizzes --

revoke all on public.quizzes from authenticated;
grant select on public.quizzes to authenticated;
grant insert (course_id, lesson_id, created_by, title, instructions, time_limit_minutes,
              passing_score, attempt_limit, due_at, is_published) on public.quizzes to authenticated;
grant update (title, instructions, time_limit_minutes, passing_score, attempt_limit,
              due_at, is_published) on public.quizzes to authenticated;
grant delete on public.quizzes to authenticated;

create policy quizzes_select on public.quizzes
  for select to authenticated
  using (public.manages_course(course_id) or (is_published and public.is_enrolled(course_id)));

create policy quizzes_insert on public.quizzes
  for insert to authenticated
  with check (public.manages_course(course_id));

create policy quizzes_update on public.quizzes
  for update to authenticated
  using (public.manages_course(course_id))
  with check (public.manages_course(course_id));

create policy quizzes_delete on public.quizzes
  for delete to authenticated
  using (public.manages_course(course_id));

-- ----------------------------------------------------------- quiz_questions --

revoke all on public.quiz_questions from authenticated;
-- correct_answer and explanation are not granted. A student taking a quiz cannot
-- read them, not even with the anon key or by tampering with the query. The
-- answers are returned by submit_quiz_attempt() once the attempt is finished.
grant select (id, quiz_id, position, prompt, question_type, options, points)
  on public.quiz_questions to authenticated;
grant insert (quiz_id, position, prompt, question_type, options, correct_answer, explanation, points)
  on public.quiz_questions to authenticated;
grant update (position, prompt, question_type, options, correct_answer, explanation, points)
  on public.quiz_questions to authenticated;
grant delete on public.quiz_questions to authenticated;

create policy quiz_questions_select on public.quiz_questions
  for select to authenticated
  using (
    public.manages_course((select course_id from public.quizzes where id = quiz_id))
    or public.is_enrolled((select course_id from public.quizzes where id = quiz_id))
  );

create policy quiz_questions_insert on public.quiz_questions
  for insert to authenticated
  with check (public.manages_course((select course_id from public.quizzes where id = quiz_id)));

create policy quiz_questions_update on public.quiz_questions
  for update to authenticated
  using (public.manages_course((select course_id from public.quizzes where id = quiz_id)))
  with check (public.manages_course((select course_id from public.quizzes where id = quiz_id)));

create policy quiz_questions_delete on public.quiz_questions
  for delete to authenticated
  using (public.manages_course((select course_id from public.quizzes where id = quiz_id)));

-- ------------------------------------------------------------ quiz_attempts --

revoke all on public.quiz_attempts from authenticated;
grant select on public.quiz_attempts to authenticated;
-- Deliberately no insert and no update. An attempt is opened by
-- start_quiz_attempt() and marked by submit_quiz_attempt(); score, percentage
-- and passed are computed in Postgres (spec 19).

create policy quiz_attempts_select on public.quiz_attempts
  for select to authenticated
  using (student_id = auth.uid() or public.is_admin());

-- -------------------------------------------------------------- quiz_answers -

revoke all on public.quiz_answers from authenticated;
grant select on public.quiz_answers to authenticated;

create policy quiz_answers_select on public.quiz_answers
  for select to authenticated
  using (
    exists (
      select 1 from public.quiz_attempts a
       where a.id = attempt_id and (a.student_id = auth.uid() or public.is_admin())
    )
  );

-- -------------------------------------------------------------- assignments -

revoke all on public.assignments from authenticated;
grant select on public.assignments to authenticated;
grant insert (course_id, lesson_id, created_by, title, instructions, due_at, max_score, is_published)
  on public.assignments to authenticated;
grant update (title, instructions, due_at, max_score, is_published, results_published)
  on public.assignments to authenticated;
grant delete on public.assignments to authenticated;

create policy assignments_select on public.assignments
  for select to authenticated
  using (public.manages_course(course_id) or (is_published and public.is_enrolled(course_id)));

create policy assignments_insert on public.assignments
  for insert to authenticated
  with check (public.manages_course(course_id));

create policy assignments_update on public.assignments
  for update to authenticated
  using (public.manages_course(course_id))
  with check (public.manages_course(course_id));

create policy assignments_delete on public.assignments
  for delete to authenticated
  using (public.manages_course(course_id));

-- --------------------------------------------------- assignment_submissions -

revoke all on public.assignment_submissions from authenticated;
grant select on public.assignment_submissions to authenticated;
grant update (score, feedback, status, graded_by, graded_at)
  on public.assignment_submissions to authenticated;
-- No insert and no update of the response columns: submission is
-- submit_assignment(). Spec 20/22 — a student may only ever see their own work,
-- and my_assignment_result() is what lets them see it at all.

-- Students are absent from this table's policies entirely. Tutors see the
-- students in their own courses; admins see everyone.
create policy assignment_submissions_select on public.assignment_submissions
  for select to authenticated
  using (public.is_admin() or public.manages_course(course_id_of(assignment_id)));

create policy assignment_submissions_update on public.assignment_submissions
  for update to authenticated
  using (public.is_admin() or public.manages_course(course_id_of(assignment_id)))
  with check (public.is_admin() or public.manages_course(course_id_of(assignment_id)));

-- ------------------------------------------------------------ notifications --

revoke all on public.notifications from authenticated;
grant select on public.notifications to authenticated;
-- Only read_at is writable, and only on your own row (spec 21).
grant update (read_at) on public.notifications to authenticated;
-- No insert: notifications are produced by the triggers in 0003, so a client
-- cannot fabricate one addressed to somebody else.

create policy notifications_select on public.notifications
  for select to authenticated
  using (user_id = auth.uid());

create policy notifications_update on public.notifications
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ------------------------------------------------------------ announcements -

revoke all on public.announcements from authenticated;
grant select on public.announcements to authenticated;
-- published_at is granted on purpose: without it an admin could create an
-- announcement but never publish one, because the timestamp is written by the
-- client on the way from draft to published.
grant insert (title, body, audience, status, scheduled_for, published_at, created_by)
  on public.announcements to authenticated;
grant update (title, body, audience, status, scheduled_for, published_at)
  on public.announcements to authenticated;
grant delete on public.announcements to authenticated;

-- Spec 43/48: only an admin writes announcements, and only a published one whose
-- audience includes the reader is visible.
create policy announcements_select on public.announcements
  for select to authenticated
  using (
    public.is_admin()
    or (
      status = 'published'
      and published_at <= now()
      and (
        audience = 'all'
        or (audience = 'students' and public.is_student())
        or (audience = 'tutors'   and public.is_tutor())
        or (audience = 'admins'   and public.is_admin())
      )
    )
  );

create policy announcements_insert on public.announcements
  for insert to authenticated
  with check (public.is_admin() and created_by = auth.uid());

create policy announcements_update on public.announcements
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy announcements_delete on public.announcements
  for delete to authenticated
  using (public.is_admin());

-- --------------------------------------------------------------- audit_logs --

revoke all on public.audit_logs from authenticated;
grant select on public.audit_logs to authenticated;
-- Insert, update and delete are not granted to any client role. Rows can only be
-- written by log_audit() and the audit triggers (spec 45).

create policy audit_logs_select on public.audit_logs
  for select to authenticated
  using (public.is_admin());
