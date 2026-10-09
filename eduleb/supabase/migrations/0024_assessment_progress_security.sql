-- SEC-01/02/03. Forward-only remediation; no historical records removed.
-- Deadlines are exclusive: requests at or after the deadline are denied.
create or replace function public.require_quiz_access(p_quiz_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare v_uid uuid:=public.require_active_session(); v_course uuid;
begin
 -- Caller locks quiz first; lock profile, course and enrollment through grading.
 perform 1 from profiles where id=v_uid and role='student' and status='active' for share;
 if not found then raise exception 'An active student account is required.' using errcode='42501'; end if;
 select course_id into v_course from quizzes where id=p_quiz_id and is_published;
 if not found then raise exception 'This quiz is not available.' using errcode='42501'; end if;
 perform 1 from courses where id=v_course and status='published' for share;
 if not found then raise exception 'This course is not available.' using errcode='42501'; end if;
 perform 1 from course_enrollments where course_id=v_course and student_id=v_uid and status='active' for share;
 if not found then raise exception 'You are not enrolled in this course.' using errcode='42501'; end if;
end $$;
revoke all on function public.require_quiz_access(uuid) from public,anon,authenticated;
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

  perform public.require_quiz_access(p_quiz_id);
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

  if v_quiz.due_at is not null and clock_timestamp() >= v_quiz.due_at then
    raise exception 'The deadline for this quiz has passed.' using errcode='42501';
  end if;

  select * into v_attempt
    from public.quiz_attempts
   where quiz_id = p_quiz_id and student_id = v_uid and status = 'in_progress'
   order by attempt_number desc
   limit 1;
  if found then
    if v_quiz.time_limit_minutes is not null and clock_timestamp() >= v_attempt.started_at + make_interval(mins=>v_quiz.time_limit_minutes) then
      raise exception 'This attempt has expired. Contact your tutor.' using errcode='42501';
    end if;
    return v_attempt.id;  -- resume only while valid
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

  perform public.require_quiz_access(p_quiz_id);

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

  if jsonb_typeof(p_answers) is distinct from 'object' or octet_length(p_answers::text)>100000 then
    raise exception 'Invalid quiz answers.' using errcode='22023';
  end if;
  if (v_quiz.due_at is not null and clock_timestamp() >= v_quiz.due_at)
     or (v_quiz.time_limit_minutes is not null and clock_timestamp() >= v_attempt.started_at + make_interval(mins=>v_quiz.time_limit_minutes)) then
    raise exception 'This attempt has expired. Contact your tutor.' using errcode='42501';
  end if;
  v_late := false;

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

-- Modules have no independent publication flag: a published course and lesson
-- with valid module membership form the accessible curriculum scope.
create or replace function public.lesson_is_published(p_lesson_id uuid)
returns boolean language sql volatile security definer set search_path=public as $$
 select exists(select 1 from lessons l join modules m on m.id=l.module_id and m.course_id=l.course_id
 join courses c on c.id=l.course_id where l.id=p_lesson_id and l.is_published and c.status='published');
$$;
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

  if not public.is_student() or not public.lesson_is_published(p_lesson_id) then
    raise exception 'This lesson is not available.' using errcode='42501';
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
  if p_percentage is null or p_percentage < 0 or p_percentage > 100 then
    raise exception 'Progress must be between 0 and 100.' using errcode = '22003';
  end if;

  select course_id into v_course from public.lessons where id = p_lesson_id;
  if not found then
    raise exception 'Lesson not found.' using errcode = 'P0002';
  end if;
  if not public.is_enrolled(v_course) then
    raise exception 'You are not enrolled in this course.' using errcode = '42501';
  end if;

  if not public.is_student() or not public.lesson_is_published(p_lesson_id) then
    raise exception 'This lesson is not available.' using errcode='42501';
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
     where e.student_id = auth.uid() and e.status = 'active' and public.is_student() and exists(select 1 from courses c where c.id=e.course_id and c.status='published')
  ),
  lessons as (
    select l.course_id, l.id
      from public.lessons l
      join mine m on m.course_id = l.course_id
     where public.lesson_is_published(l.id)
  ),
  done as (
    select lp.course_id, count(*) filter (where lp.completed) as completed_lessons
      from public.lesson_progress lp
      join mine m on m.course_id = lp.course_id
     where lp.student_id = auth.uid() and public.lesson_is_published(lp.lesson_id)
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
create or replace function public.admin_top_courses()
returns setof jsonb
language sql
stable
security definer
set search_path = public
as $$
  with stats as (
    select c.id,
           c.title,
           c.thumbnail_url,
           count(distinct e.student_id)::integer as students,
           (select count(*) from public.lessons l
             where l.course_id = c.id and public.lesson_is_published(l.id))::integer as lessons
      from public.courses c
      left join public.course_enrollments e
        on e.course_id = c.id and e.status = 'active'
     group by c.id
  ),
  completion as (
    select lp.course_id,
           count(*) filter (where lp.completed and public.lesson_is_published(lp.lesson_id))::integer as completed
      from public.lesson_progress lp
      join public.course_enrollments e
        on e.course_id = lp.course_id
       and e.student_id = lp.student_id
       and e.status = 'active'
     group by lp.course_id
  )
  select jsonb_build_object(
    'id', s.id,
    'title', s.title,
    'students', s.students,
    'progress', case when s.students * s.lessons = 0 then 0
                     else round(100.0 * coalesce(k.completed, 0) / (s.students * s.lessons)) end,
    'thumbnail', s.thumbnail_url
  )
  from stats s
  left join completion k on k.course_id = s.id
  order by s.students desc, s.title
  limit 5;
$$;
create or replace function public.tutor_my_courses()
returns setof jsonb
language sql
stable
security definer
set search_path = public
as $$
  with mine as (
    select c.id, c.title, c.code, c.status, c.thumbnail_url
      from public.courses c
     where c.created_by = auth.uid()
        or exists (select 1 from public.course_tutors ct
                    where ct.course_id = c.id and ct.user_id = auth.uid())
  ),
  course_rows as (
    select m.*,
           (select count(distinct e.student_id) from public.course_enrollments e
             where e.course_id = m.id and e.status = 'active')::integer as students,
           (select count(*) from public.lessons l
             where l.course_id = m.id and public.lesson_is_published(l.id))::integer as lessons,
           (select count(*) from public.lesson_progress lp
              join public.course_enrollments e
                on e.course_id = lp.course_id
               and e.student_id = lp.student_id
               and e.status = 'active'
             where lp.course_id = m.id and lp.completed and public.lesson_is_published(lp.lesson_id))::integer as completed
      from mine m
  )
  select jsonb_build_object(
    'id', id,
    'title', title,
    'code', code,
    'status', status,
    'thumbnail_url', thumbnail_url,
    'students', students,
    'progress', case when students * lessons = 0 then 0
                     else round(100.0 * completed / (students * lessons)) end
  )
  from course_rows
  order by case status when 'published' then 0
                       when 'pending_review' then 1
                       when 'draft' then 2
                       else 3 end,
           title;
$$;
create or replace function public.tutor_my_students()
returns setof jsonb
language sql
stable
security definer
set search_path = public
as $$
  with mine as (
    select c.id
      from public.courses c
     where c.created_by = auth.uid()
        or exists (select 1 from public.course_tutors ct
                    where ct.course_id = c.id and ct.user_id = auth.uid())
  ),
  per_enrollment as (
    select e.student_id,
           e.course_id,
           (select count(*) from public.lessons l
             where l.course_id = e.course_id and public.lesson_is_published(l.id)) as lessons_total,
           (select count(*) from public.lesson_progress lp
             where lp.student_id = e.student_id
               and lp.course_id = e.course_id
               and lp.completed and public.lesson_is_published(lp.lesson_id)) as lessons_done
      from public.course_enrollments e
     where e.status = 'active'
       and e.course_id in (select id from mine)
  ),
  roster as (
    select student_id,
           count(*)::integer as courses,
           sum(lessons_done)::integer as lessons_done,
           sum(lessons_total)::integer as lessons_total
      from per_enrollment
     group by student_id
  ),
  last_activity as (
    select x.student_id, max(x.occurred_at) as occurred_at
      from (
        select s.student_id, s.submitted_at as occurred_at
          from public.assignment_submissions s
          join public.assignments a on a.id = s.assignment_id
         where a.course_id in (select id from mine)
        union all
        select qa.student_id, qa.submitted_at
          from public.quiz_attempts qa
          join public.quizzes q on q.id = qa.quiz_id
         where q.course_id in (select id from mine)
        union all
        select e.student_id, e.enrolled_at
          from public.course_enrollments e
         where e.course_id in (select id from mine)
      ) x
     where x.occurred_at is not null
     group by x.student_id
  )
  select jsonb_build_object(
    'student_id', r.student_id,
    'full_name', coalesce(p.full_name, 'Unnamed student'),
    'level', p.level,
    'status', p.status::text,
    'courses', r.courses,
    'lessons_done', r.lessons_done,
    'lessons_total', r.lessons_total,
    'progress', case when coalesce(r.lessons_total, 0) = 0 then 0
                     else round(100.0 * r.lessons_done / r.lessons_total) end,
    'last_activity', la.occurred_at
  )
  from roster r
  join public.profiles p on p.id = r.student_id
  left join last_activity la on la.student_id = r.student_id
  order by p.full_name;
$$;

create function public.admin_resolve_quiz_attempt(p_attempt_id uuid,p_action text,p_note text)
returns void language plpgsql security definer set search_path=public as $$
declare v_attempt quiz_attempts;
begin
 perform public.require_active_session();
 if not public.is_admin() then raise exception 'Access denied.' using errcode='42501';end if;
 if length(trim(coalesce(p_note,'')))<10 or length(p_note)>1000 or p_action is distinct from 'close' then raise exception 'Choose close and give a reason.';end if;
 select * into v_attempt from quiz_attempts where id=p_attempt_id;
 perform 1 from quizzes where id=v_attempt.quiz_id for update;
 select * into v_attempt from quiz_attempts where id=p_attempt_id for update;
 if not found or v_attempt.status<>'in_progress' then raise exception 'No open attempt found.';end if;
 update quiz_attempts set status='submitted',submitted_at=clock_timestamp(),passed=false where id=p_attempt_id;
 perform public.log_audit('quiz_attempt_closed','quiz',v_attempt.quiz_id,jsonb_build_object('attempt_id',p_attempt_id,'reason',p_note));
end $$;
revoke all on function public.admin_resolve_quiz_attempt(uuid,text,text) from public,anon;
grant execute on function public.admin_resolve_quiz_attempt(uuid,text,text) to authenticated;
-- Explicit extension can be made through existing authorized quiz settings;
-- it affects the quiz, not a hidden student override. Started-at is never reset.
