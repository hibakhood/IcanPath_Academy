-- =============================================================================
-- CharterPath LMS — 0010 dashboard read models
--
-- The read-only functions the rebuilt dashboards call. Like the three
-- dashboard_stats() functions in 0006, every figure is computed here from rows
-- the caller is entitled to, so the browser receives a finished number and
-- cannot influence it.
--
-- What this file deliberately does not invent: there is no payments table, so
-- revenue and its growth come back as null rather than as zero. Zero would
-- claim a measured amount; null says the platform does not track it. The same
-- rule covers uptime, storage and bandwidth, which nothing here measures.
-- =============================================================================

-- ------------------------------------------------------ admin analytics -----
--
-- Six months of cumulative counts. Students and enrolments are real rows;
-- revenue is null so the chart can be drawn without a series that does not
-- exist rather than with a flat invented line.

create or replace function public.admin_analytics_data()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with months as (
    select generate_series(
             date_trunc('month', now()) - interval '5 months',
             date_trunc('month', now()),
             interval '1 month'
           ) as month
  ),
  series as (
    select m.month,
           (select count(*) from public.profiles p
             where p.role = 'student' and p.created_at < m.month + interval '1 month')::integer as students,
           (select count(*) from public.course_enrollments e
             where e.enrolled_at < m.month + interval '1 month')::integer as enrollments
      from months m
  )
  select jsonb_build_object(
    'labels',      coalesce((select jsonb_agg(to_char(month, 'Mon FMDD') order by month)
                               from months), '[]'::jsonb),
    'students',    coalesce((select jsonb_agg(students order by month)
                               from series), '[]'::jsonb),
    'enrollments', coalesce((select jsonb_agg(enrollments order by month)
                               from series), '[]'::jsonb),
    'revenue',     null
  );
$$;

-- ------------------------------------------------------- admin activity -----
--
-- The audit trail, worded for a person. Every message is built from the row
-- that was acted on, so nothing here can describe something that did not
-- happen; actions without a readable row fall back to their own name.

create or replace function public.admin_activity_items()
returns setof jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', a.id,
    'type', case a.action
      when 'tutor_approved'            then 'tutor_approved'
      when 'tutor_rejected'            then 'tutor_application'
      when 'tutor_application_updated' then 'tutor_application'
      when 'course_submitted_for_review' then 'course_submitted'
      when 'course_published'          then 'course_published'
      when 'course_archived'           then 'course_archived'
      when 'live_class_completed'      then 'live_class'
      when 'live_class_cancelled'      then 'live_class'
      when 'live_class_status_changed' then 'live_class'
      when 'enrolled'                  then 'enrollment'
      when 'quiz_submitted'            then 'quiz'
      when 'assignment_graded'         then 'grading'
      when 'announcement_published'    then 'announcement'
      when 'user_suspended'            then 'account'
      when 'user_reactivated'          then 'account'
      when 'user_status_changed'       then 'account'
      when 'role_changed'              then 'account'
      when 'first_admin_bootstrapped'  then 'account'
      else 'other'
    end,
    'icon', case a.action
      when 'tutor_approved'            then 'user-check'
      when 'tutor_rejected'            then 'user'
      when 'tutor_application_updated' then 'user'
      when 'course_submitted_for_review' then 'book'
      when 'course_published'          then 'book'
      when 'course_archived'           then 'book'
      when 'live_class_completed'      then 'video'
      when 'live_class_cancelled'      then 'video'
      when 'live_class_status_changed' then 'video'
      when 'enrolled'                  then 'user-plus'
      when 'quiz_submitted'            then 'check-circle'
      when 'assignment_graded'         then 'edit'
      when 'announcement_published'    then 'bell'
      when 'user_suspended'            then 'alert'
      when 'user_reactivated'          then 'user'
      when 'user_status_changed'       then 'settings'
      when 'role_changed'              then 'shield'
      when 'first_admin_bootstrapped'  then 'shield'
      else 'activity'
    end,
    'message', case a.action
      when 'tutor_approved' then 'Tutor ' || coalesce(tp.full_name, 'applicant') || ' approved'
      when 'tutor_rejected' then 'Tutor application from ' || coalesce(tp.full_name, 'an applicant') || ' rejected'
      when 'tutor_application_updated' then 'Tutor application from ' || coalesce(tp.full_name, 'an applicant') || ' updated'
      when 'course_submitted_for_review' then 'Course "' || coalesce(c.title, 'untitled') || '" submitted for review'
      when 'course_published' then 'Course "' || coalesce(c.title, 'untitled') || '" published'
      when 'course_archived' then 'Course "' || coalesce(c.title, 'untitled') || '" archived'
      when 'live_class_completed' then 'Live class "' || coalesce(lc.title, 'untitled') || '" completed'
      when 'live_class_cancelled' then 'Live class "' || coalesce(lc.title, 'untitled') || '" cancelled'
      when 'live_class_status_changed' then 'Live class "' || coalesce(lc.title, 'untitled') || '" rescheduled'
      when 'enrolled' then 'A student enrolled in "' || coalesce(ec.title, 'a course') || '"'
      when 'quiz_submitted' then 'A quiz was submitted in "' || coalesce(qc.title, 'a course') || '"'
      when 'assignment_graded' then 'A submission was marked in "' || coalesce(ac.title, 'a course') || '"'
      when 'announcement_published' then 'Announcement "' || coalesce(an.title, 'untitled') || '" published'
      when 'role_changed' then 'Role changed for ' || coalesce(p.full_name, 'an account')
      when 'user_suspended' then coalesce(p.full_name, 'An account') || ' suspended'
      when 'user_reactivated' then coalesce(p.full_name, 'An account') || ' reactivated'
      when 'user_status_changed' then 'Status changed for ' || coalesce(p.full_name, 'an account')
      when 'first_admin_bootstrapped' then 'First administrator bootstrapped'
      else initcap(replace(a.action, '_', ' '))
    end,
    'time_ago', case
      when age(now(), a.created_at) < interval '1 minute' then 'just now'
      when age(now(), a.created_at) < interval '1 hour'
        then (extract(epoch from age(now(), a.created_at)) / 60)::integer::text || ' min ago'
      when age(now(), a.created_at) < interval '24 hours'
        then (extract(epoch from age(now(), a.created_at)) / 3600)::integer::text || ' hours ago'
      when age(now(), a.created_at) < interval '7 days'
        then (extract(epoch from age(now(), a.created_at)) / 86400)::integer::text || ' days ago'
      else to_char(a.created_at, 'Mon DD, YYYY')
    end
  )
  from public.audit_logs a
  left join public.profiles p
    on a.resource_type = 'profile' and p.id = a.resource_id
  left join public.courses c
    on a.resource_type = 'course' and c.id = a.resource_id
  left join public.live_classes lc
    on a.resource_type = 'live_class' and lc.id = a.resource_id
  left join public.tutor_applications ta
    on a.resource_type = 'tutor_application' and ta.id = a.resource_id
  left join public.profiles tp
    on tp.id = ta.user_id
  left join public.course_enrollments ce
    on a.resource_type = 'course_enrollment' and ce.id = a.resource_id
  left join public.courses ec
    on ec.id = ce.course_id
  left join public.quizzes q
    on a.resource_type = 'quiz' and q.id = a.resource_id
  left join public.courses qc
    on qc.id = q.course_id
  left join public.announcements an
    on a.resource_type = 'announcement' and an.id = a.resource_id
  left join public.assignment_submissions s
    on a.resource_type = 'assignment_submission' and s.id = a.resource_id
  left join public.assignments asg
    on asg.id = s.assignment_id
  left join public.courses ac
    on ac.id = asg.course_id
  where a.action <> 'private_resource_issued'
  order by a.created_at desc
  limit 8;
$$;

-- -------------------------------------------------------- admin courses -----
--
-- Progress is the honest fraction: completed lesson rows over the lessons every
-- active student could have completed. A course with no lessons or no students
-- reports 0 rather than dividing by zero.

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
             where l.course_id = c.id and l.is_published)::integer as lessons
      from public.courses c
      left join public.course_enrollments e
        on e.course_id = c.id and e.status = 'active'
     group by c.id
  ),
  completion as (
    select lp.course_id,
           count(*) filter (where lp.completed)::integer as completed
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

-- ------------------------------------------------------- system figures -----
--
-- The counts are queryable. Uptime, storage and bandwidth have no source in
-- this database and come back null; the dashboard prints an em dash for them.

create or replace function public.admin_system_stats()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'active_students', (select count(*) from public.profiles
                         where role = 'student' and status = 'active'),
    'active_students_pct', (select round(100.0 * count(*) filter (where status = 'active')
                                         / nullif(count(*), 0))::integer
                             from public.profiles where role = 'student'),
    'active_tutors', (select count(*) from public.profiles
                       where role = 'tutor' and status = 'active'),
    'active_tutors_pct', (select round(100.0 * count(*) filter (where status = 'active')
                                       / nullif(count(*), 0))::integer
                           from public.profiles where role = 'tutor'),
    'published_courses', (select count(*) from public.courses where status = 'published'),
    'published_courses_pct', (select round(100.0 * count(*) filter (where status = 'published')
                                           / nullif(count(*), 0))::integer
                               from public.courses),
    'uptime', null,
    'uptime_status', null,
    'storage_used', null,
    'storage_pct', null,
    'bandwidth_used', null,
    'bandwidth_pct', null
  );
$$;

-- --------------------------------------------------- upcoming live class ----

create or replace function public.admin_upcoming_classes()
returns setof jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', lc.id,
    'title', lc.title,
    'course', coalesce(c.title, 'Course'),
    'date', to_char(lc.scheduled_date, 'Mon FMDD, YYYY'),
    'time', to_char(lc.start_time, 'HH12:MI AM'),
    'platform', case lc.platform
                  when 'google_meet' then 'Google Meet'
                  when 'youtube_live' then 'YouTube Live'
                  else initcap(lc.platform::text)
                end,
    'platform_icon', 'video'
  )
  from public.live_classes lc
  left join public.courses c on c.id = lc.course_id
  where lc.status in ('scheduled', 'live')
    and lc.scheduled_date >= current_date
  order by lc.scheduled_date, lc.start_time
  limit 8;
$$;

-- ------------------------------------------------------ tutor read models ----
--
-- The tutor dashboard reads their own courses and what students in them have
-- been doing. Both check that the caller manages the course — the same rule
-- manages_course() enforces — so one tutor never sees another's rows.

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
             where l.course_id = m.id and l.is_published)::integer as lessons,
           (select count(*) from public.lesson_progress lp
              join public.course_enrollments e
                on e.course_id = lp.course_id
               and e.student_id = lp.student_id
               and e.status = 'active'
             where lp.course_id = m.id and lp.completed)::integer as completed
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

create or replace function public.tutor_student_activity()
returns setof jsonb
language sql
stable
security definer
set search_path = public
as $$
  with mine as (
    select c.id, c.title
      from public.courses c
     where c.created_by = auth.uid()
        or exists (select 1 from public.course_tutors ct
                    where ct.course_id = c.id and ct.user_id = auth.uid())
  ),
  events as (
    select s.student_id,
           s.submitted_at as occurred_at,
           'submitted “' || a.title || '”' as action,
           m.title as course_title
      from public.assignment_submissions s
      join public.assignments a on a.id = s.assignment_id
      join mine m on m.id = a.course_id
     where s.status = 'submitted'

    union all
    select s.student_id,
           s.graded_at,
           'had “' || a.title || '” marked',
           m.title
      from public.assignment_submissions s
      join public.assignments a on a.id = s.assignment_id
      join mine m on m.id = a.course_id
     where s.status = 'graded' and s.graded_at is not null

    union all
    select qa.student_id,
           qa.submitted_at,
           'submitted the quiz “' || q.title || '”',
           m.title
      from public.quiz_attempts qa
      join public.quizzes q on q.id = qa.quiz_id
      join mine m on m.id = q.course_id
     where qa.status in ('submitted', 'graded')
       and qa.submitted_at is not null

    union all
    select e.student_id,
           e.enrolled_at,
           'enrolled in this course',
           m.title
      from public.course_enrollments e
      join mine m on m.id = e.course_id
  )
  select jsonb_build_object(
    'student_id', e.student_id,
    'student_name', coalesce(p.full_name, 'A student'),
    'course_title', e.course_title,
    'action', e.action,
    'occurred_at', e.occurred_at
  )
  from events e
  left join public.profiles p on p.id = e.student_id
  where e.occurred_at is not null
  order by e.occurred_at desc
  limit 6;
$$;

-- ------------------------------------------------------ tutor's students ----
--
-- The roster behind /tutor/students/: everyone actively enrolled in a course
-- this tutor teaches, with the completion the tutor would otherwise have to
-- work out by hand and the last thing they did. Progress is completed published
-- lessons over enrolled students times published lessons — the same fraction
-- tutor_my_courses() reports for a whole course.

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
             where l.course_id = e.course_id and l.is_published) as lessons_total,
           (select count(*) from public.lesson_progress lp
             where lp.student_id = e.student_id
               and lp.course_id = e.course_id
               and lp.completed) as lessons_done
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

-- ------------------------------------------------------ dashboard figures ----
--
-- 0006's version stopped at the counters. The rebuilt tiles also show how the
-- last 30 days compare with the 30 before them, and the admin tiles want a
-- revenue line. Growth is null when the earlier window is empty — a percentage
-- of nothing is not a percentage — and revenue is null because nothing here
-- records payments.

create or replace function public.admin_dashboard_stats()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with windows as (
    select
      (select count(*) from public.profiles
        where role = 'student' and created_at >= now() - interval '30 days')::numeric as students_cur,
      (select count(*) from public.profiles
        where role = 'student' and created_at >= now() - interval '60 days'
          and created_at < now() - interval '30 days')::numeric as students_prev,
      (select count(*) from public.profiles
        where role = 'tutor' and created_at >= now() - interval '30 days')::numeric as tutors_cur,
      (select count(*) from public.profiles
        where role = 'tutor' and created_at >= now() - interval '60 days'
          and created_at < now() - interval '30 days')::numeric as tutors_prev,
      (select count(*) from public.courses
        where created_at >= now() - interval '30 days')::numeric as courses_cur,
      (select count(*) from public.courses
        where created_at >= now() - interval '60 days'
          and created_at < now() - interval '30 days')::numeric as courses_prev,
      (select count(*) from public.course_enrollments
        where enrolled_at >= now() - interval '30 days')::numeric as enrollments_cur,
      (select count(*) from public.course_enrollments
        where enrolled_at >= now() - interval '60 days'
          and enrolled_at < now() - interval '30 days')::numeric as enrollments_prev,
      (select count(*) from public.live_classes
        where created_at >= now() - interval '30 days')::numeric as classes_cur,
      (select count(*) from public.live_classes
        where created_at >= now() - interval '60 days'
          and created_at < now() - interval '30 days')::numeric as classes_prev
  )
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
                              where created_at > now() - interval '7 days'),
    'student_growth', case when w.students_prev = 0 then null
                           else round((w.students_cur - w.students_prev) * 100.0 / w.students_prev, 1) end,
    'tutor_growth', case when w.tutors_prev = 0 then null
                         else round((w.tutors_cur - w.tutors_prev) * 100.0 / w.tutors_prev, 1) end,
    'course_growth', case when w.courses_prev = 0 then null
                          else round((w.courses_cur - w.courses_prev) * 100.0 / w.courses_prev, 1) end,
    'enrollment_growth', case when w.enrollments_prev = 0 then null
                              else round((w.enrollments_cur - w.enrollments_prev) * 100.0 / w.enrollments_prev, 1) end,
    'live_class_growth', case when w.classes_prev = 0 then null
                              else round((w.classes_cur - w.classes_prev) * 100.0 / w.classes_prev, 1) end,
    'total_revenue', null,
    'revenue_growth', null
  )
  from windows w;
$$;

-- ------------------------------------------------------------- privileges ---
--
-- 0007 grants EXECUTE on everything that existed then, and revokes the default
-- PUBLIC grant. These functions are new, so they repeat that here: without it
-- the anon key could read the admin analytics.

do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in (
         'admin_analytics_data', 'admin_activity_items', 'admin_top_courses',
         'admin_system_stats', 'admin_upcoming_classes',
         'tutor_my_courses', 'tutor_student_activity', 'tutor_my_students'
       )
  loop
    execute format('revoke execute on function %s from public', f.sig);
    execute format('revoke execute on function %s from anon', f.sig);
    execute format('grant execute on function %s to authenticated', f.sig);
  end loop;
end $$;
