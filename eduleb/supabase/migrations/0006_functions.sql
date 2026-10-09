-- =============================================================================
-- CharterPath LMS — 0004 write paths (SECURITY DEFINER)
--
-- Every operation here derives identity from auth.uid(). None of these
-- functions accept a user_id, student_id, role or tutor_id parameter, so a
-- tampered request body cannot impersonate anybody (spec 50). Anything that
-- must not be client-writable — grades, status transitions, audit rows,
-- notifications — is only reachable through these functions; the column
-- grants in 0005 remove the direct route.
--
-- Each function pins search_path and rejects an anonymous caller.
-- =============================================================================

-- Every function starts here. Keeps the "no session" case identical everywhere.
create or replace function public.require_active_session()
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'You must be signed in.' using errcode = '28000';
  end if;
  if not public.is_active_account() then
    raise exception 'This account is not active. Contact an administrator.'
      using errcode = '42501';
  end if;
  return v_uid;
end;
$$;

-- A course is always born a draft owned by its creator. A tutor cannot insert
-- itself as published, and cannot insert itself as the author of someone
-- else's course.
create or replace function public.guard_course_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.created_by   := auth.uid();
  new.status       := 'draft';
  new.submitted_at := null;
  new.published_at := null;
  new.archived_at  := null;
  new.reviewed_by  := null;
  new.reviewed_at  := null;
  new.review_note  := null;
  return new;
end;
$$;

create trigger courses_guard_insert
  before insert on public.courses
  for each row execute function public.guard_course_insert();

-- A graded submission is final. Stops a student rewriting their work after the
-- tutor has marked it, even though the RLS policy would also block it.
create or replace function public.guard_graded_submission()
returns trigger
language plpgsql
as $$
begin
  if old.status = 'graded' then
    if new.response_text is distinct from old.response_text
       or new.response_storage_path is distinct from old.response_storage_path
       or new.status is distinct from old.status then
      raise exception 'This submission has already been graded and cannot be changed.'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create trigger assignment_submissions_guard_graded
  before update on public.assignment_submissions
  for each row execute function public.guard_graded_submission();

-- ============================================================ enrolment ====

-- Spec 47. The student is always the caller.
create or replace function public.enroll_in_course(p_course_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid        uuid := public.require_active_session();
  v_course     public.courses%rowtype;
  v_enrollment uuid;
begin
  select * into v_course from public.courses where id = p_course_id;
  if not found then
    raise exception 'Course not found.' using errcode = 'P0002';
  end if;
  -- Spec 48: only published courses are open to students.
  if v_course.status <> 'published' then
    raise exception 'This course is not open for enrolment.' using errcode = '42501';
  end if;
  if not public.is_student() and not public.is_admin() then
    raise exception 'Only students can enrol.' using errcode = '42501';
  end if;

  select id into v_enrollment
    from public.course_enrollments
   where course_id = p_course_id and student_id = v_uid;

  if found then
    -- Re-enrolling reactivates rather than failing, and never makes a second row.
    update public.course_enrollments
       set status = 'active', enrolled_at = now()
     where id = v_enrollment;
    return v_enrollment;
  end if;

  insert into public.course_enrollments (course_id, student_id)
  values (p_course_id, v_uid)
  returning id into v_enrollment;

  return v_enrollment;
end;
$$;

-- Spec 10/11. Upsert, so no duplicate progress rows (spec 10).
create or replace function public.mark_lesson_complete(p_lesson_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := public.require_active_session();
  v_lesson public.lessons%rowtype;
begin
  select * into v_lesson from public.lessons where id = p_lesson_id;
  if not found then
    raise exception 'Lesson not found.' using errcode = 'P0002';
  end if;
  if not public.is_enrolled(v_lesson.course_id) then
    raise exception 'You are not enrolled in this course.' using errcode = '42501';
  end if;

  insert into public.lesson_progress
    (student_id, lesson_id, course_id, completed, completed_at, progress_percentage)
  values (v_uid, p_lesson_id, v_lesson.course_id, true, now(), 100)
  on conflict (student_id, lesson_id) do update
    set completed           = true,
        completed_at         = coalesce(public.lesson_progress.completed_at, now()),
        progress_percentage  = 100,
        updated_at           = now();

  update public.course_enrollments
     set last_activity_at = now()
   where course_id = v_lesson.course_id and student_id = v_uid;
end;
$$;

create or replace function public.set_lesson_progress(
  p_lesson_id  uuid,
  p_percentage integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := public.require_active_session();
  v_course uuid;
begin
  if p_percentage < 0 or p_percentage > 100 then
    raise exception 'Progress must be between 0 and 100.' using errcode = '22003';
  end if;

  select course_id into v_course from public.lessons where id = p_lesson_id;
  if not found then
    raise exception 'Lesson not found.' using errcode = 'P0002';
  end if;
  if not public.is_enrolled(v_course) then
    raise exception 'You are not enrolled in this course.' using errcode = '42501';
  end if;

  insert into public.lesson_progress
    (student_id, lesson_id, course_id, completed, completed_at, progress_percentage)
  values (
    v_uid, p_lesson_id, v_course, p_percentage >= 100, case when p_percentage >= 100 then now() end,
    greatest(0, least(100, p_percentage))
  )
  on conflict (student_id, lesson_id) do update
    set progress_percentage = greatest(
          public.lesson_progress.progress_percentage,
          excluded.progress_percentage
        ),
        completed = public.lesson_progress.completed or excluded.completed,
        completed_at = coalesce(public.lesson_progress.completed_at, excluded.completed_at),
        updated_at = now();

  update public.course_enrollments
     set last_activity_at = now()
   where course_id = v_course and student_id = v_uid;
end;
$$;

-- Spec 11. Progress is derived from lesson rows, never stored as a number
-- somebody typed.
create or replace function public.my_course_progress()
returns table (
  course_id          uuid,
  course_title       text,
  course_code        text,
  total_lessons      bigint,
  completed_lessons  bigint,
  percentage         integer
)
language sql
stable
security definer
set search_path = public
as $$
  with mine as (
    select e.course_id from public.course_enrollments e
     where e.student_id = auth.uid() and e.status = 'active'
  ),
  lessons as (
    select l.course_id, l.id
      from public.lessons l
      join mine m on m.course_id = l.course_id
     where l.is_published
  ),
  done as (
    select lp.course_id, count(*) filter (where lp.completed) as completed_lessons
      from public.lesson_progress lp
      join mine m on m.course_id = lp.course_id
     where lp.student_id = auth.uid()
     group by lp.course_id
  )
  select
    c.id,
    c.title,
    c.code,
    count(l.id)::bigint                                            as total_lessons,
    coalesce(d.completed_lessons, 0)::bigint                      as completed_lessons,
    case when count(l.id) = 0 then 0
         else round(coalesce(d.completed_lessons, 0) * 100.0 / count(l.id))::integer
    end                                                             as percentage
  from public.courses c
  join mine m on m.course_id = c.id
  left join lessons l on l.course_id = c.id
  left join done d on d.course_id = c.id
 group by c.id, c.title, c.code, d.completed_lessons
 order by c.title;
$$;

-- Spec 6/12. The first lesson the student has not completed, in module then
-- lesson order, so "Continue learning" never opens the course homepage.
create or replace function public.continue_learning(p_course_id uuid)
returns table (
  course_id        uuid,
  course_title     text,
  course_code      text,
  module_id        uuid,
  module_title     text,
  lesson_id        uuid,
  lesson_title     text,
  total_lessons    bigint,
  completed_lessons bigint,
  percentage       integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null or not public.is_enrolled(p_course_id) then
    return;  -- no row, rather than an error that would leak whether it exists
  end if;

  return query
  with mine as (
    select e.course_id from public.course_enrollments e
     where e.student_id = v_uid and e.course_id = p_course_id and e.status = 'active'
  ),
  ordered as (
    select
      l.id as lesson_id,
      l.title as lesson_title,
      m.id as module_id,
      m.title as module_title,
      m.position as module_position,
      l.position as lesson_position,
      (select count(*) from public.lesson_progress lp
        where lp.lesson_id = l.id and lp.student_id = v_uid and lp.completed) as is_done
    from public.lessons l
    join public.modules m on m.id = l.module_id
    join mine mi on mi.course_id = l.course_id
   where l.is_published
  ),
  counts as (
    select count(*)::bigint as total,
           count(*) filter (where is_done = 1)::bigint as completed
      from ordered
  )
  select
    c.id, c.title, c.code,
    o.module_id, o.module_title,
    o.lesson_id, o.lesson_title,
    cn.total, cn.completed,
    case when cn.total = 0 then 0
         else round(cn.completed * 100.0 / cn.total)::integer end
  from ordered o
  join public.courses c on c.id = p_course_id
  cross join counts cn
  where o.is_done = 0
  order by o.module_position, o.lesson_position
  limit 1;
end;
$$;

-- ============================================================== quizzes ====

-- Spec 18. Idempotent: a second call returns the attempt already in progress
-- instead of creating another, so a double-click cannot burn an attempt
-- (spec 57). The row lock serialises two genuinely concurrent calls.
create or replace function public.start_quiz_attempt(p_quiz_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid       uuid := public.require_active_session();
  v_quiz      public.quizzes%rowtype;
  v_attempt   public.quiz_attempts%rowtype;
  v_used      integer;
  v_next      integer;
begin
  -- Serialise concurrent starts for the same quiz.
  perform 1 from public.quizzes where id = p_quiz_id for update;

  select * into v_quiz from public.quizzes where id = p_quiz_id;
  if not found then
    raise exception 'Quiz not found.' using errcode = 'P0002';
  end if;
  if not v_quiz.is_published then
    raise exception 'This quiz is not available.' using errcode = '42501';
  end if;
  if not public.is_enrolled(v_quiz.course_id) then
    raise exception 'You are not enrolled in this course.' using errcode = '42501';
  end if;

  select * into v_attempt
    from public.quiz_attempts
   where quiz_id = p_quiz_id and student_id = v_uid and status = 'in_progress'
   order by attempt_number desc
   limit 1;
  if found then
    return v_attempt.id;  -- resume rather than duplicate
  end if;

  select count(*)::integer into v_used
    from public.quiz_attempts
   where quiz_id = p_quiz_id and student_id = v_uid
     and status in ('submitted', 'graded');

  if v_used >= v_quiz.attempt_limit then
    raise exception 'You have used all % attempt(s) for this quiz.', v_quiz.attempt_limit
      using errcode = '42501';
  end if;

  select coalesce(max(attempt_number), 0) + 1 into v_next
    from public.quiz_attempts
   where quiz_id = p_quiz_id and student_id = v_uid;

  insert into public.quiz_attempts (quiz_id, student_id, attempt_number)
  values (p_quiz_id, v_uid, v_next)
  returning id into v_attempt.id;

  return v_attempt.id;
end;
$$;

-- Spec 19. The browser sends answers keyed by question id. It never sends a
-- score: the correct answers are read from the database here and the marking
-- happens in Postgres, so the result cannot be forged from the client.
create or replace function public.submit_quiz_attempt(
  p_quiz_id  uuid,
  p_answers  jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid       uuid := public.require_active_session();
  v_quiz      public.quizzes%rowtype;
  v_attempt   public.quiz_attempts%rowtype;
  v_question  record;
  v_given     text;
  v_score     numeric := 0;
  v_max       numeric := 0;
  v_correct   boolean;
  v_pct       numeric;
  v_late      boolean;
  v_review    jsonb := '[]'::jsonb;
  v_row       jsonb;
begin
  perform 1 from public.quizzes where id = p_quiz_id for update;

  select * into v_attempt
    from public.quiz_attempts
   where quiz_id = p_quiz_id and student_id = v_uid and status = 'in_progress'
   order by attempt_number desc
   limit 1
   for update;

  if not found then
    raise exception 'There is no attempt in progress for this quiz.' using errcode = '42501';
  end if;

  select * into v_quiz from public.quizzes where id = p_quiz_id;

  if v_quiz.time_limit_minutes is not null
     and now() > v_attempt.started_at + make_interval(mins => v_quiz.time_limit_minutes) then
    v_late := true;
  else
    v_late := false;
  end if;

  for v_question in
    select id, correct_answer, explanation, points
      from public.quiz_questions
     where quiz_id = p_quiz_id
     order by position, id
  loop
    v_given   := p_answers ->> v_question.id::text;
    v_correct := (lower(trim(coalesce(v_given, ''))) = lower(trim(v_question.correct_answer)));

    if v_correct then
      v_score := v_score + v_question.points;
    end if;
    v_max := v_max + v_question.points;

    insert into public.quiz_answers
      (attempt_id, question_id, answer, is_correct, points_awarded)
    values (v_attempt.id, v_question.id, coalesce(v_given, ''), v_correct,
            case when v_correct then v_question.points else 0 end)
    on conflict (attempt_id, question_id) do update
      set answer         = excluded.answer,
          is_correct     = excluded.is_correct,
          points_awarded = excluded.points_awarded;

    v_review := v_review || jsonb_build_object(
      'question_id',     v_question.id,
      'your_answer',     v_given,
      'correct_answer',  v_question.correct_answer,
      'is_correct',      v_correct,
      'points_awarded',  case when v_correct then v_question.points else 0 end,
      'explanation',     v_question.explanation
    );
  end loop;

  if v_max = 0 then
    v_pct := 0;
  else
    v_pct := round(v_score * 100.0 / v_max, 2);
  end if;

  -- 'graded', not 'submitted': the score, percentage and per-question review are
  -- all computed above, so nothing is left for a tutor to do. Leaving it
  -- 'submitted' would show the work as pending grading on the tutor dashboard
  -- forever, with no process that ever clears it.
  update public.quiz_attempts
     set status       = 'graded',
         submitted_at = now(),
         score        = v_score,
         max_score    = v_max,
         percentage   = v_pct,
         passed       = v_pct >= v_quiz.passing_score
   where id = v_attempt.id;

  insert into public.notifications (user_id, type, title, body, link_path)
  values (
    v_uid, 'quiz_result',
    'Quiz result: ' || v_quiz.title,
    'You scored ' || v_pct || '% — ' || case when v_pct >= v_quiz.passing_score then 'passed' else 'not passed' end || '.',
    '/student/quizzes/'
  );

  perform public.log_audit('quiz_submitted', 'quiz', p_quiz_id,
    jsonb_build_object('attempt_id', v_attempt.id, 'percentage', v_pct));

  select jsonb_build_object(
    'attempt_id',      v_attempt.id,
    'attempt_number',  v_attempt.attempt_number,
    'score',           v_score,
    'max_score',       v_max,
    'percentage',      v_pct,
    'passing_score',   v_quiz.passing_score,
    'passed',          v_pct >= v_quiz.passing_score,
    'time_limit_exceeded', v_late,
    'review',          v_review
  ) into v_row;

  return v_row;
end;
$$;

-- ========================================================== assignments ====

create or replace function public.submit_assignment(
  p_assignment_id         uuid,
  p_response_text         text,
  p_response_storage_path text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid        uuid := public.require_active_session();
  v_assignment public.assignments%rowtype;
  v_existing   uuid;
begin
  select * into v_assignment from public.assignments where id = p_assignment_id;
  if not found then
    raise exception 'Assignment not found.' using errcode = 'P0002';
  end if;
  if not v_assignment.is_published then
    raise exception 'This assignment is not available.' using errcode = '42501';
  end if;
  -- Spec 36: only students enrolled in the course may submit.
  if not public.is_enrolled(v_assignment.course_id) then
    raise exception 'You are not enrolled in this course.' using errcode = '42501';
  end if;
  if p_response_text is null and p_response_storage_path is null then
    raise exception 'Add your answer before submitting.' using errcode = '22023';
  end if;

  select id into v_existing
    from public.assignment_submissions
   where assignment_id = p_assignment_id and student_id = v_uid;

  if found then
    -- Resubmitting before marking replaces the work, it does not add a row.
    update public.assignment_submissions
       set response_text         = p_response_text,
           response_storage_path = p_response_storage_path,
           submitted_at          = now(),
           status                = 'submitted'
     where id = v_existing;
    return v_existing;
  end if;

  insert into public.assignment_submissions
    (assignment_id, student_id, response_text, response_storage_path)
  values (p_assignment_id, v_uid, p_response_text, p_response_storage_path)
  returning id into v_existing;

  return v_existing;
end;
$$;

-- Tutor grading. RLS on assignment_submissions already restricts updates to
-- the teaching tutors and admins; this function additionally stamps who marked
-- it and when, and writes the audit row.
create or replace function public.grade_assignment(
  p_submission_id uuid,
  p_score         numeric,
  p_feedback      text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid       uuid := public.require_active_session();
  v_sub       public.assignment_submissions%rowtype;
  v_assignment public.assignments%rowtype;
begin
  select * into v_sub from public.assignment_submissions where id = p_submission_id;
  if not found then
    raise exception 'Submission not found.' using errcode = 'P0002';
  end if;

  select * into v_assignment from public.assignments where id = v_sub.assignment_id;

  if not (public.manages_course(v_assignment.course_id)) then
    raise exception 'You cannot grade submissions for this course.' using errcode = '42501';
  end if;
  if p_score < 0 or p_score > v_assignment.max_score then
    raise exception 'Score must be between 0 and % .', v_assignment.max_score using errcode = '22003';
  end if;

  update public.assignment_submissions
     set status    = 'graded',
         score     = p_score,
         feedback  = p_feedback,
         graded_by = v_uid,
         graded_at = now()
   where id = p_submission_id;

  perform public.log_audit('assignment_graded', 'assignment_submission', p_submission_id,
    jsonb_build_object('assignment_id', v_sub.assignment_id, 'score', p_score));
end;
$$;

-- ================================================== course review flow ======

-- Spec 41, tutor side.
create or replace function public.submit_course_for_review(p_course_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := public.require_active_session();
  v_course public.courses%rowtype;
  v_modules integer;
  v_lessons integer;
begin
  select * into v_course from public.courses where id = p_course_id;
  if not found then
    raise exception 'Course not found.' using errcode = 'P0002';
  end if;
  if not public.manages_course(p_course_id) then
    raise exception 'You can only submit your own courses for review.' using errcode = '42501';
  end if;
  if v_course.status <> 'draft' then
    raise exception 'Only a draft course can be submitted for review.' using errcode = '42501';
  end if;

  -- Refuse an empty submission rather than letting admin review nothing.
  select count(*) into v_modules from public.modules where course_id = p_course_id;
  select count(*) into v_lessons from public.lessons where course_id = p_course_id;
  if v_modules = 0 or v_lessons = 0 then
    raise exception 'Add at least one module and one lesson before submitting for review.'
      using errcode = '23514';
  end if;

  update public.courses
     set status = 'pending_review', submitted_at = now()
   where id = p_course_id;
end;
$$;

-- Spec 41, admin side. All three admin decisions live here so the audit trail
-- and the student/tutor notifications stay consistent.
create or replace function public.review_course(
  p_course_id uuid,
  p_decision  text,
  p_note      text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := public.require_active_session();
  v_course public.courses%rowtype;
  v_tutor  uuid;
begin
  if not public.is_admin() then
    raise exception 'Only administrators can review courses.' using errcode = '42501';
  end if;

  select * into v_course from public.courses where id = p_course_id;
  if not found then
    raise exception 'Course not found.' using errcode = 'P0002';
  end if;
  if v_course.status <> 'pending_review' then
    raise exception 'This course is not awaiting review.' using errcode = '42501';
  end if;

  v_tutor := v_course.created_by;

  if p_decision = 'approve' then
    update public.courses
       set status = 'published', published_at = now(),
           reviewed_by = v_uid, reviewed_at = now(), review_note = p_note
     where id = p_course_id;

  elsif p_decision = 'reject' then
    update public.courses
       set status = 'draft', reviewed_by = v_uid, reviewed_at = now(), review_note = p_note
     where id = p_course_id;

  elsif p_decision = 'request_changes' then
    update public.courses
       set status = 'draft', reviewed_by = v_uid, reviewed_at = now(), review_note = p_note
     where id = p_course_id;

  else
    raise exception 'Unknown decision: %', p_decision using errcode = '22023';
  end if;

  insert into public.notifications (user_id, type, title, body, link_path)
  values (
    v_tutor, 'course_status',
    case p_decision
      when 'approve'         then 'Course approved: ' || v_course.title
      when 'reject'          then 'Course rejected: ' || v_course.title
      else 'Changes requested: ' || v_course.title
    end,
    coalesce(p_note, 'See the review notes on your course.'),
    '/tutor/courses/'
  );
end;
$$;

-- Spec 40: publish / unpublish / archive outside the review queue.
create or replace function public.set_course_status(
  p_course_id uuid,
  p_status    public.course_status,
  p_note      text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := public.require_active_session();
begin
  if not public.is_admin() then
    raise exception 'Only administrators can change publication status.' using errcode = '42501';
  end if;

  update public.courses
     set status = p_status,
         published_at = case when p_status = 'published' then now() else published_at end,
         archived_at  = case when p_status = 'archived'  then now() else archived_at  end,
         review_note  = coalesce(p_note, review_note)
   where id = p_course_id;

  if not found then
    raise exception 'Course not found.' using errcode = 'P0002';
  end if;
end;
$$;

-- ============================================================ live classes ==

create or replace function public.set_live_class_status(
  p_class_id uuid,
  p_status   public.live_class_status
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := public.require_active_session();
  v_class public.live_classes%rowtype;
begin
  select * into v_class from public.live_classes where id = p_class_id;
  if not found then
    raise exception 'Live class not found.' using errcode = 'P0002';
  end if;
  if not public.manages_course(v_class.course_id) then
    raise exception 'You cannot manage this class.' using errcode = '42501';
  end if;
  if v_class.status = 'cancelled' and p_status <> 'cancelled' then
    raise exception 'A cancelled class cannot be reinstated.' using errcode = '42501';
  end if;

  update public.live_classes set status = p_status where id = p_class_id;
end;
$$;

create or replace function public.attach_class_recording(
  p_class_id     uuid,
  p_youtube_url  text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := public.require_active_session();
  v_class public.live_classes%rowtype;
begin
  select * into v_class from public.live_classes where id = p_class_id;
  if not found then
    raise exception 'Live class not found.' using errcode = 'P0002';
  end if;
  if not public.manages_course(v_class.course_id) then
    raise exception 'You cannot manage this class.' using errcode = '42501';
  end if;
  if public.youtube_id_from_url(p_youtube_url) is null then
    raise exception 'That does not look like a YouTube video link.' using errcode = '22023';
  end if;

  update public.live_classes
     set recording_youtube_url = p_youtube_url,
         recording_youtube_id  = public.youtube_id_from_url(p_youtube_url)
   where id = p_class_id;
end;
$$;

-- Spec 16. Signed URL only after an authorisation check, and only for a path
-- that actually belongs to a row the caller may reach — so guessing a path in
-- the bucket is not enough.
create or replace function public.get_private_resource_url(
  p_path text,
  p_seconds integer default 300
)
returns text
language plpgsql
security definer
set search_path = public, storage
as $$
declare
  v_uid      uuid := public.require_active_session();
  v_course   uuid;
  v_kind     text;
  v_resource uuid;
  v_signed   text;
  v_owner    text;
begin
  if p_path !~ '^courses/[0-9a-f-]{36}/(live|materials|submissions)/[0-9a-f-]{36}' then
    raise exception 'Unknown resource path.' using errcode = '22023';
  end if;

  v_course := split_part(p_path, '/', 2)::uuid;
  v_kind   := split_part(p_path, '/', 3);
  -- The filename is "<uuid>.url", so the extension has to come off before the
  -- segment will cast to uuid.
  v_resource := regexp_replace(split_part(p_path, '/', 4), '\.url$', '')::uuid;

  -- The core check. Not "is enrolled somewhere", but "in this course".
  if not public.can_access_course_content(v_course) then
    raise exception 'You do not have access to this resource.' using errcode = '42501';
  end if;

  if v_kind = 'materials' then
    if not exists (
      select 1 from public.lesson_materials m
       where m.id = v_resource and m.course_id = v_course
         and m.storage_path = p_path
    ) then
      raise exception 'Resource not found.' using errcode = 'P0002';
    end if;

  elsif v_kind = 'live' then
    if not exists (
      select 1 from public.live_classes l
       where l.id = v_resource and l.course_id = v_course
         and l.meeting_storage_path = p_path
    ) then
      raise exception 'Resource not found.' using errcode = 'P0002';
    end if;

  else  -- submissions: courses/<course>/submissions/<assignment>/<owner>.url
    v_owner := regexp_replace(split_part(p_path, '/', 5), '\.url$', '');

    if not exists (
      select 1 from public.assignments a
       where a.id = v_resource and a.course_id = v_course
    ) then
      raise exception 'Resource not found.' using errcode = 'P0002';
    end if;

    -- A student may only ever reach their own uploaded file; the teaching
    -- tutors may reach any file in their course.
    if not public.manages_course(v_course) and v_owner <> v_uid::text then
      raise exception 'Resource not found.' using errcode = 'P0002';
    end if;
  end if;

  select storage.create_signed_url('lms-private', p_path, least(greatest(p_seconds, 30), 3600))
    into v_signed;

  if v_signed is null then
    raise exception 'Could not create a link for this resource.' using errcode = '55000';
  end if;

  perform public.log_audit('private_resource_issued', 'storage_object', v_resource,
    jsonb_build_object('path', p_path, 'seconds', p_seconds));

  return v_signed;
end;
$$;

-- ====================================================== users and roles ====

create or replace function public.approve_tutor(
  p_user_id uuid,
  p_decision boolean,
  p_note     text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := public.require_active_session();
begin
  if not public.is_admin() then
    raise exception 'Only administrators can approve tutors.' using errcode = '42501';
  end if;

  update public.tutor_applications
     -- The cast is required: an unadorned CASE resolves to text, and text is not
     -- assignable to an enum column.
     set status       = (case when p_decision then 'approved' else 'rejected' end)::public.tutor_application_status,
         reviewed_by  = v_uid,
         reviewed_at  = now(),
         review_note  = p_note
   where user_id = p_user_id and status = 'pending';

  if not found then
    raise exception 'No pending application for that account.' using errcode = 'P0002';
  end if;
end;
$$;

create or replace function public.set_user_status(
  p_user_id uuid,
  p_status  public.account_status,
  p_note    text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only administrators can change account status.' using errcode = '42501';
  end if;

  update public.profiles set status = p_status, status_note = p_note where id = p_user_id;
  if not found then
    raise exception 'Account not found.' using errcode = 'P0002';
  end if;
end;
$$;

-- Spec 39. An admin cannot demote themselves, which would risk leaving the
-- platform with no administrator.
create or replace function public.set_user_role(
  p_user_id uuid,
  p_role    public.app_role
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := public.require_active_session();
begin
  if not public.is_admin() then
    raise exception 'Only administrators can change roles.' using errcode = '42501';
  end if;
  if p_user_id = v_uid then
    raise exception 'You cannot change your own role.' using errcode = '42501';
  end if;

  update public.profiles set role = p_role where id = p_user_id;
  if not found then
    raise exception 'Account not found.' using errcode = 'P0002';
  end if;

  -- Promoting someone to tutor closes out any application still sitting open,
  -- so /admin/tutors does not keep listing them as pending.
  if p_role = 'tutor' then
    update public.tutor_applications
       set status = 'approved', reviewed_by = v_uid, reviewed_at = now()
     where user_id = p_user_id and status = 'pending';
    update public.profiles set status = 'active' where id = p_user_id and status = 'pending';
  end if;
end;
$$;

create or replace function public.admin_set_enrollment_status(
  p_enrollment_id uuid,
  p_status        public.enrollment_status
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only administrators can change enrolments.' using errcode = '42501';
  end if;

  update public.course_enrollments set status = p_status where id = p_enrollment_id;
  if not found then
    raise exception 'Enrolment not found.' using errcode = 'P0002';
  end if;
end;
$$;

-- ====================================================== notifications =====

create or replace function public.mark_notification_read(p_notification_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.notifications
     set read_at = coalesce(read_at, now())
   where id = p_notification_id and user_id = auth.uid();
end;
$$;

create or replace function public.mark_all_notifications_read()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.notifications
     set read_at = now()
   where user_id = auth.uid() and read_at is null;
end;
$$;

create or replace function public.unread_notification_count()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer from public.notifications
   where user_id = auth.uid() and read_at is null;
$$;

-- ============================================================== reordering ==

-- Reordering writes every position in one transaction, so a half-applied order
-- is not possible. The id list must be exactly the set of children, which
-- stops a tutor from smuggling a foreign id into another course's ordering.
create or replace function public.reorder_modules(p_course_id uuid, p_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_i integer;
begin
  if not public.manages_course(p_course_id) then
    raise exception 'You cannot reorder this course.' using errcode = '42501';
  end if;
  if (select count(*) from public.modules where course_id = p_course_id)
     <> coalesce(array_length(p_ids, 1), 0) then
    raise exception 'The list must contain every module exactly once.' using errcode = '22023';
  end if;
  if exists (
    select 1 from unnest(p_ids) x
     where not exists (select 1 from public.modules m where m.id = x and m.course_id = p_course_id)
  ) then
    raise exception 'One or more modules do not belong to this course.' using errcode = '42501';
  end if;

  for v_i in 1 .. coalesce(array_length(p_ids, 1), 0) loop
    update public.modules set position = v_i where id = p_ids[v_i];
  end loop;
end;
$$;

create or replace function public.reorder_lessons(p_module_id uuid, p_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_i integer; v_course uuid;
begin
  select course_id into v_course from public.modules where id = p_module_id;
  if not found then
    raise exception 'Module not found.' using errcode = 'P0002';
  end if;
  if not public.manages_course(v_course) then
    raise exception 'You cannot reorder these lessons.' using errcode = '42501';
  end if;
  if (select count(*) from public.lessons where module_id = p_module_id)
     <> coalesce(array_length(p_ids, 1), 0) then
    raise exception 'The list must contain every lesson exactly once.' using errcode = '22023';
  end if;

  for v_i in 1 .. coalesce(array_length(p_ids, 1), 0) loop
    update public.lessons set position = v_i
     where id = p_ids[v_i] and module_id = p_module_id;
  end loop;
end;
$$;

create or replace function public.reorder_materials(p_lesson_id uuid, p_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_i integer; v_course uuid;
begin
  select course_id into v_course from public.lessons where id = p_lesson_id;
  if not found then
    raise exception 'Lesson not found.' using errcode = 'P0002';
  end if;
  if not public.manages_course(v_course) then
    raise exception 'You cannot reorder these materials.' using errcode = '42501';
  end if;
  if (select count(*) from public.lesson_materials where lesson_id = p_lesson_id)
     <> coalesce(array_length(p_ids, 1), 0) then
    raise exception 'The list must contain every material exactly once.' using errcode = '22023';
  end if;

  for v_i in 1 .. coalesce(array_length(p_ids, 1), 0) loop
    update public.lesson_materials set position = v_i
     where id = p_ids[v_i] and lesson_id = p_lesson_id;
  end loop;
end;
$$;

-- ====================================================== dashboard figures ===
--
-- Spec 5, 25, 38: every tile is computed here from the caller's own rows. The
-- browser receives a finished number and cannot influence it, and no dashboard
-- ever needs a hardcoded statistic.

create or replace function public.student_dashboard_stats()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with enrolled as (
    select course_id from public.course_enrollments
     where student_id = auth.uid() and status = 'active'
  ),
  totals as (
    select l.course_id, count(*)::bigint as lessons
      from public.lessons l
      join enrolled e on e.course_id = l.course_id
     where l.is_published
     group by l.course_id
  ),
  done as (
    select lp.course_id, count(*) filter (where lp.completed)::bigint as completed
      from public.lesson_progress lp
      join enrolled e on e.course_id = lp.course_id
     where lp.student_id = auth.uid()
     group by lp.course_id
  ),
  per_course as (
    select t.course_id,
           t.lessons,
           coalesce(d.completed, 0) as completed
      from totals t
      left join done d on d.course_id = t.course_id
  )
  select jsonb_build_object(
    'enrolled_courses',     (select count(*) from enrolled),
    'in_progress',         (select count(*) from per_course
                              where lessons > 0 and completed < lessons),
    'completed',           (select count(*) from per_course
                              where lessons > 0 and completed >= lessons),
    'upcoming_live_classes', (select count(*) from public.live_classes lc
                                join enrolled e on e.course_id = lc.course_id
                               where lc.status = 'scheduled'
                                 and lc.scheduled_date >= current_date),
    'pending_quizzes',     (select count(*) from public.quizzes q
                              join enrolled e on e.course_id = q.course_id
                              left join public.quiz_attempts qa
                                on qa.quiz_id = q.id and qa.student_id = auth.uid()
                             where q.is_published
                               and not exists (
                                 select 1 from public.quiz_attempts x
                                  where x.quiz_id = q.id
                                    and x.student_id = auth.uid()
                                    and x.status in ('submitted', 'graded')
                               )),
    'pending_assignments', (select count(*) from public.assignments a
                              join enrolled e on e.course_id = a.course_id
                              left join public.assignment_submissions s
                                on s.assignment_id = a.id and s.student_id = auth.uid()
                             where a.is_published and s.id is null),
    'unread_notifications', public.unread_notification_count(),
    'overall_progress',    coalesce((
                              select round(
                                sum(completed) * 100.0 / nullif(sum(lessons), 0)
                              )::integer
                                from per_course), 0)
  );
$$;

create or replace function public.tutor_dashboard_stats()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with mine as (
    select c.id, c.status from public.courses c
     where c.created_by = auth.uid()
        or exists (select 1 from public.course_tutors ct
                    where ct.course_id = c.id and ct.user_id = auth.uid())
  )
  select jsonb_build_object(
    'total_courses',    (select count(*) from mine),
    'published_courses',(select count(*) from mine where status = 'published'),
    'draft_courses',    (select count(*) from mine where status = 'draft'),
    'pending_reviews',  (select count(*) from mine where status = 'pending_review'),
    'total_students',   (select count(distinct e.student_id)
                           from public.course_enrollments e join mine on mine.id = e.course_id
                          where e.status = 'active'),
    'upcoming_live_classes', (select count(*) from public.live_classes lc join mine on mine.id = lc.course_id
                               where lc.status in ('scheduled', 'live')
                                 and lc.scheduled_date >= current_date),
    'pending_grading',  (select count(*) from public.assignment_submissions s
                           join public.assignments a on a.id = s.assignment_id
                           join mine on mine.id = a.course_id
                          where s.status = 'submitted'),
    -- Attempts a student has opened but not submitted. The old key counted
    -- status = 'submitted', which is now unreachable for an auto-graded quiz and
    -- so was always zero.
    'in_progress_attempts', (select count(*) from public.quiz_attempts qa
                           join public.quizzes q on q.id = qa.quiz_id
                           join mine on mine.id = q.course_id
                          where qa.status = 'in_progress')
  );
$$;

create or replace function public.admin_dashboard_stats()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'total_students',       (select count(*) from public.profiles where role = 'student'),
    'active_students',      (select count(*) from public.profiles where role = 'student' and status = 'active'),
    'tutors',               (select count(*) from public.profiles where role = 'tutor'),
    'pending_tutor_approvals', (select count(*) from public.tutor_applications where status = 'pending'),
    'courses',              (select count(*) from public.courses),
    'published_courses',    (select count(*) from public.courses where status = 'published'),
    'courses_awaiting_review', (select count(*) from public.courses where status = 'pending_review'),
    'enrollments',          (select count(*) from public.course_enrollments),
    'upcoming_live_classes',(select count(*) from public.live_classes
                              where status in ('scheduled','live') and scheduled_date >= current_date),
    'recent_activity',      (select count(*) from public.audit_logs
                              where created_at > now() - interval '7 days')
  );
$$;

-- Tutor view of their own quiz questions. Direct selects on quiz_questions are
-- column-restricted so a student can never read correct_answer, and this is how
-- the authoring screens get the full row back.
create or replace function public.manage_quiz_questions(p_quiz_id uuid)
returns setof public.quiz_questions
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.manages_course((select course_id from public.quizzes where id = p_quiz_id)) then
    raise exception 'You cannot manage this quiz.' using errcode = '42501';
  end if;
  return query
    select * from public.quiz_questions where quiz_id = p_quiz_id order by position, id;
end;
$$;

-- Spec 20: a student sees their own submission, but the mark and the feedback
-- stay hidden until the tutor publishes results. Direct selects on
-- assignment_submissions are denied to students, so this is the only route.
create or replace function public.my_assignment_result(p_assignment_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid        uuid := auth.uid();
  v_assignment public.assignments%rowtype;
  v_sub        public.assignment_submissions%rowtype;
begin
  if v_uid is null then
    raise exception 'You must be signed in.' using errcode = '28000';
  end if;

  select * into v_assignment from public.assignments where id = p_assignment_id;
  if not found then
    raise exception 'Assignment not found.' using errcode = 'P0002';
  end if;
  if not public.is_enrolled(v_assignment.course_id) then
    raise exception 'You are not enrolled in this course.' using errcode = '42501';
  end if;

  select * into v_sub
    from public.assignment_submissions
   where assignment_id = p_assignment_id and student_id = v_uid;

  if not found then
    return jsonb_build_object('submitted', false);
  end if;

  return jsonb_build_object(
    'submitted',    true,
    'response',     v_sub.response_text,
    'submitted_at', v_sub.submitted_at,
    'status',       v_sub.status,
    'results_published', v_assignment.results_published,
    'score',        case when v_assignment.results_published then v_sub.score    else null end,
    'feedback',     case when v_assignment.results_published then v_sub.feedback else null end,
    'max_score',    v_assignment.max_score,
    'graded_at',    case when v_assignment.results_published then v_sub.graded_at else null end
  );
end;
$$;
