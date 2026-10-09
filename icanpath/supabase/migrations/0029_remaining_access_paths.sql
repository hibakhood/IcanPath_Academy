-- Close remaining read-model and legacy signer paths.
create or replace function public.can_access_course_content(p_course_id uuid)
returns boolean language sql volatile security definer set search_path=public as $$
 select public.manages_course(p_course_id) or (public.is_enrolled(p_course_id) and exists(select 1 from courses where id=p_course_id and status='published'));
$$;
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

  if v_kind in ('materials','live') and not public.can_read_legacy_pointer(p_path) then
    raise exception 'This resource is not available.' using errcode='42501';
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
         and (public.manages_course(v_course) or public.live_review_visible(l.id))
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
create or replace function public.student_dashboard_stats()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with enrolled as (
    select course_id from public.course_enrollments
     where student_id = auth.uid() and status = 'active' and public.is_student() and exists(select 1 from courses c where c.id=course_id and c.status='published')
  ),
  totals as (
    select l.course_id, count(*)::bigint as lessons
      from public.lessons l
      join enrolled e on e.course_id = l.course_id
     where public.lesson_is_published(l.id)
     group by l.course_id
  ),
  done as (
    select lp.course_id, count(*) filter (where lp.completed)::bigint as completed
      from public.lesson_progress lp
      join enrolled e on e.course_id = lp.course_id
     where lp.student_id = auth.uid() and public.lesson_is_published(lp.lesson_id)
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

alter function public.tutor_dashboard_stats() rename to _secure_tutor_dashboard_stats;
revoke all on function public._secure_tutor_dashboard_stats() from public,anon,authenticated;
create function public.tutor_dashboard_stats() returns jsonb language plpgsql security definer set search_path=public as $$
begin perform public.require_active_session();if not (public.is_tutor() or public.is_admin()) then raise exception 'Access denied.' using errcode='42501';end if;return public._secure_tutor_dashboard_stats();end $$;
revoke all on function public.tutor_dashboard_stats() from public,anon;
grant execute on function public.tutor_dashboard_stats() to authenticated;

-- Retain history, but revoked learners cannot fetch protected attempt reviews.
alter policy quiz_attempts_select on public.quiz_attempts using (
 public.is_admin() or (student_id=auth.uid() and public.is_student() and exists(
 select 1 from quizzes q where q.id=quiz_id and q.is_published and public.is_enrolled(q.course_id)
 and exists(select 1 from courses c where c.id=q.course_id and c.status='published'))));
