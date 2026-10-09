-- =============================================================================
-- CharterPath LMS — 0003 triggers
--
-- Notifications (spec 21, 44) and audit records (spec 45) are produced in the
-- database, not by the browser, so they cannot be skipped by a client and they
-- fire for every role at once. A static site has no server runtime, so this is
-- the only place those two requirements can be met honestly.
-- =============================================================================

-- ------------------------------------------------------- bookkeeping -------

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'profiles', 'tutor_applications', 'courses', 'modules', 'lessons',
    'lesson_materials', 'live_classes', 'lesson_progress', 'quizzes',
    'assignments', 'announcements'
  ] loop
    execute format(
      'create trigger %I_touch_updated_at before update on public.%I
         for each row execute function public.touch_updated_at()', t, t);
  end loop;
end $$;

-- ----------------------------------------------- auth.users -> profiles -----

-- The only place a role is ever assigned at signup.
--
-- Security note: `raw_user_meta_data` is supplied by the person signing up, so
-- it is attacker-controlled. This trigger therefore honours exactly one value
-- ('tutor') and maps it to a *pending* tutor. The 'admin' role is never taken
-- from metadata — the first admin is inserted by 0007_seed, and any later admin
-- must be promoted by an existing admin through public.set_user_role().
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role    public.app_role;
  v_status  public.account_status;
  v_name    text;
begin
  v_name := coalesce(new.raw_user_meta_data ->> 'full_name', new.email);

  if new.raw_user_meta_data ->> 'requested_role' = 'tutor' then
    v_role   := 'tutor';
    v_status := 'pending';
  else
    v_role   := 'student';
    v_status := 'active';
  end if;

  insert into public.profiles (id, role, status, full_name)
  values (new.id, v_role, v_status, v_name);

  if v_role = 'tutor' then
    insert into public.tutor_applications (user_id) values (new.id);
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- --------------------------------------------------------- youtube ids -----

-- One trigger per table on purpose. A single shared function body cannot read
-- `new.recording_youtube_url` on `lessons` or `new.youtube_video_url` on
-- `live_classes`, because those columns do not exist there and plpgsql would
-- raise "record new has no field" the moment the trigger fired.

create or replace function public.derive_lesson_youtube_id()
returns trigger
language plpgsql
as $$
begin
  if new.youtube_video_url is distinct from old.youtube_video_url then
    new.youtube_video_id := public.youtube_id_from_url(new.youtube_video_url);
  end if;
  return new;
end;
$$;

create or replace function public.derive_recording_youtube_id()
returns trigger
language plpgsql
as $$
begin
  if new.recording_youtube_url is distinct from old.recording_youtube_url then
    new.recording_youtube_id := public.youtube_id_from_url(new.recording_youtube_url);
  end if;
  return new;
end;
$$;

create trigger lessons_derive_youtube_id
  before insert or update on public.lessons
  for each row execute function public.derive_lesson_youtube_id();

create trigger live_classes_derive_youtube_id
  before insert or update on public.live_classes
  for each row execute function public.derive_recording_youtube_id();

-- ------------------------------------------------- fan-out primitives ------

create or replace function public.log_audit(
  p_action        text,
  p_resource_type text,
  p_resource_id   uuid default null,
  p_metadata      jsonb default '{}'::jsonb
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.audit_logs (actor_id, action, resource_type, resource_id, metadata)
  values (auth.uid(), p_action, p_resource_type, p_resource_id, coalesce(p_metadata, '{}'::jsonb));
$$;

-- One notification per actively enrolled student.
create or replace function public.notify_enrolled_students(
  p_course_id uuid,
  p_type      public.notification_type,
  p_title     text,
  p_body      text default null,
  p_link_path text default null
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.notifications (user_id, type, title, body, link_path)
  select e.student_id, p_type, p_title, p_body, p_link_path
  from public.course_enrollments e
  where e.course_id = p_course_id and e.status = 'active';
$$;

-- One notification per profile holding a role (used by announcements).
create or replace function public.notify_role(
  p_role      public.app_role,
  p_type      public.notification_type,
  p_title     text,
  p_body      text default null,
  p_link_path text default null
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.notifications (user_id, type, title, body, link_path)
  select p.id, p_type, p_title, p_body, p_link_path
  from public.profiles p
  where p.role = p_role and p.status = 'active';
$$;

-- ------------------------------------------------ audit + notify: users -----

create or replace function public.audit_profile_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role then
    perform public.log_audit('role_changed', 'profile', new.id,
      jsonb_build_object('from', old.role, 'to', new.role));
  end if;
  if new.status is distinct from old.status then
    perform public.log_audit(
      case new.status when 'suspended' then 'user_suspended'
                      when 'active'    then 'user_reactivated'
                      else 'user_status_changed' end,
      'profile', new.id, jsonb_build_object('from', old.status, 'to', new.status));
  end if;
  return null;
end;
$$;

create trigger profiles_audit
  after update on public.profiles
  for each row execute function public.audit_profile_change();

-- An admin decision on a tutor application is the moment the account becomes
-- usable, so it drives the profile as well as the audit trail.
create or replace function public.handle_tutor_application_decision()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is not distinct from old.status then
    return null;
  end if;

  perform public.log_audit(
    case new.status when 'approved' then 'tutor_approved'
                    when 'rejected' then 'tutor_rejected'
                    else 'tutor_application_updated' end,
    'tutor_application', new.id, jsonb_build_object('user_id', new.user_id));

  if new.status = 'approved' then
    -- Signup already set role='tutor' with status='pending', so the guard has to
    -- match on "not already an active tutor" rather than "not a tutor".
    update public.profiles
       set role = 'tutor', status = 'active', status_note = null
     where id = new.user_id
       and (role <> 'tutor' or status <> 'active');
  elsif new.status = 'rejected' then
    -- Revoke the tutor role too. Leaving role='tutor' with status='active' would
    -- give a rejected applicant exactly the access they were refused.
    -- Scoped to accounts that are still the pending one, so an established tutor
    -- who reapplies keeps their role.
    update public.profiles
       set role = 'student', status = 'active', status_note = 'Tutor application rejected'
     where id = new.user_id and role = 'tutor' and status = 'pending';
  end if;

  insert into public.notifications (user_id, type, title, body)
  values (
    new.user_id,
    'account',
    case new.status when 'approved' then 'Your tutor account was approved'
                    when 'rejected' then 'Your tutor application was not approved'
                    else 'Tutor application updated' end,
    new.review_note
  );

  return null;
end;
$$;

create trigger tutor_applications_decision
  after update on public.tutor_applications
  for each row execute function public.handle_tutor_application_decision();

-- ------------------------------------------- audit + notify: courses ------

create or replace function public.audit_course_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is not distinct from old.status then
    return null;
  end if;

  perform public.log_audit(
    case new.status
      when 'published'     then 'course_published'
      when 'archived'      then 'course_archived'
      when 'pending_review' then 'course_submitted_for_review'
      else 'course_status_changed'
    end,
    'course', new.id, jsonb_build_object('from', old.status, 'to', new.status));

  -- Spec 46: publishing is the moment students can discover and enrol.
  if new.status = 'published' then
    perform public.notify_enrolled_students(
      new.id, 'course_status',
      'Course published: ' || new.title,
      new.title || ' is now open.',
      '/student/courses/');
  end if;

  return null;
end;
$$;

create trigger courses_audit_status
  after update on public.courses
  for each row execute function public.audit_course_status_change();

create or replace function public.notify_lesson_published()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.is_published and not coalesce(old.is_published, false) then
    perform public.notify_enrolled_students(
      new.course_id, 'lesson_published',
      'New lesson: ' || new.title,
      new.title || ' has been added to your course.',
      '/student/lesson/?id=' || new.id::text);
  end if;
  return null;
end;
$$;

create trigger lessons_notify_published
  after update on public.lessons
  for each row execute function public.notify_lesson_published();

-- ------------------------------------------------ live class lifecycle -----

create or replace function public.audit_live_class_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is not distinct from old.status then
    return null;
  end if;

  perform public.log_audit(
    case new.status
      when 'cancelled' then 'live_class_cancelled'
      when 'completed' then 'live_class_completed'
      else 'live_class_status_changed'
    end,
    'live_class', new.id, jsonb_build_object('from', old.status, 'to', new.status));

  if new.status = 'cancelled' then
    perform public.notify_enrolled_students(
      new.course_id, 'live_class_scheduled',
      'Class cancelled: ' || new.title,
      new.title || ' on ' || new.scheduled_date || ' has been cancelled.',
      '/student/live-classes/');
  end if;

  return null;
end;
$$;

create trigger live_classes_audit_status
  after update on public.live_classes
  for each row execute function public.audit_live_class_status_change();

create or replace function public.notify_live_class_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.notify_enrolled_students(
    new.course_id, 'live_class_scheduled',
    'Live class scheduled: ' || new.title,
    new.title || ' on ' || to_char(new.scheduled_date, 'Dy DD Mon') || ' at ' || new.start_time,
    '/student/live-classes/');
  return null;
end;
$$;

create trigger live_classes_notify_created
  after insert on public.live_classes
  for each row execute function public.notify_live_class_created();

-- ------------------------------------------------------- assessment -------

create or replace function public.notify_quiz_published()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.is_published and not coalesce(old.is_published, false) then
    perform public.notify_enrolled_students(
      new.course_id, 'quiz_available',
      'Quiz available: ' || new.title,
      new.title || ' is ready to attempt.',
      '/student/quizzes/');
  end if;
  return null;
end;
$$;

create trigger quizzes_notify_published
  after update on public.quizzes
  for each row execute function public.notify_quiz_published();

create or replace function public.notify_assignment_published()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.is_published and not coalesce(old.is_published, false) then
    perform public.notify_enrolled_students(
      new.course_id, 'assignment_created',
      'New assignment: ' || new.title,
      new.title || ' has been set.',
      '/student/assignments/');
  end if;
  return null;
end;
$$;

create trigger assignments_notify_published
  after update on public.assignments
  for each row execute function public.notify_assignment_published();

create or replace function public.notify_assignment_graded()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'graded' and old.status is distinct from 'graded' then
    perform public.log_audit('assignment_graded', 'assignment_submission', new.id,
      jsonb_build_object('assignment_id', new.assignment_id, 'score', new.score));
    insert into public.notifications (user_id, type, title, body, link_path)
    values (
      new.student_id, 'assignment_graded',
      'Your assignment has been marked',
      coalesce(new.feedback, 'Open it to see your result.'),
      '/student/assignments/'
    );
  end if;
  return null;
end;
$$;

create trigger assignment_submissions_notify_graded
  after update on public.assignment_submissions
  for each row execute function public.notify_assignment_graded();

-- --------------------------------------------------------- enrolment ------

create or replace function public.notify_enrollment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.log_audit('enrolled', 'course_enrollment', new.id,
    jsonb_build_object('course_id', new.course_id, 'student_id', new.student_id));

  -- The student is told they are in.
  insert into public.notifications (user_id, type, title, body, link_path)
  select new.student_id, 'enrollment',
         'You enrolled in ' || c.title,
         c.title || ' is now in My Courses.',
         '/student/courses/'
  from public.courses c where c.id = new.course_id;

  -- Spec 46: the tutor's student count rises without anyone clicking a button.
  insert into public.notifications (user_id, type, title, body, link_path)
  select t.user_id, 'enrollment',
         'New student enrolled',
         p.full_name || ' joined ' || c.title,
         '/tutor/students/'
  from public.courses c
  join public.profiles p on p.id = new.student_id
  join lateral (
    select ct.user_id from public.course_tutors ct where ct.course_id = c.id
    union
    select c.created_by where c.created_by is not null
  ) t on true
  where c.id = new.course_id;

  return null;
end;
$$;

create trigger course_enrollments_notify
  after insert on public.course_enrollments
  for each row execute function public.notify_enrollment();

-- ------------------------------------------------------ announcements ------

create or replace function public.publish_announcement()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_audience public.announcement_audience;
begin
  if new.status is distinct from 'published' then
    return null;
  end if;
  -- Only the transition into published notifies; re-saving a published item does not.
  if coalesce(old.status, 'draft')::text = 'published' then
    return null;
  end if;

  v_audience := new.audience;

  perform public.log_audit('announcement_published', 'announcement', new.id,
    jsonb_build_object('audience', v_audience));

  if v_audience = 'all' then
    perform public.notify_role('student', 'announcement', new.title, new.body, '/student/notifications/');
    perform public.notify_role('tutor',   'announcement', new.title, new.body, '/tutor/dashboard/');
    perform public.notify_role('admin',   'announcement', new.title, new.body, '/admin/dashboard/');
  elsif v_audience = 'students' then
    perform public.notify_role('student', 'announcement', new.title, new.body, '/student/notifications/');
  elsif v_audience = 'tutors' then
    perform public.notify_role('tutor', 'announcement', new.title, new.body, '/tutor/dashboard/');
  else
    perform public.notify_role('admin', 'announcement', new.title, new.body, '/admin/notifications/');
  end if;

  return null;
end;
$$;

create trigger announcements_publish
  after insert or update on public.announcements
  for each row execute function public.publish_announcement();
