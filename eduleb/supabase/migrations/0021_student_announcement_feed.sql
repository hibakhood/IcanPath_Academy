-- Every published office announcement is delivered to the student notification
-- feed. Staff audiences may still receive their own copy, but announcements are
-- no longer hidden from students by an audience choice.

create or replace function public.publish_announcement()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is distinct from 'published' then
    return null;
  end if;
  if coalesce(old.status, 'draft')::text = 'published' then
    return null;
  end if;

  perform public.log_audit('announcement_published', 'announcement', new.id,
    jsonb_build_object('audience', new.audience));

  perform public.notify_role('student', 'announcement', new.title, new.body, '/student/announcements/');
  if new.audience = 'all' then
    perform public.notify_role('tutor', 'announcement', new.title, new.body, '/tutor/dashboard/');
    perform public.notify_role('admin', 'announcement', new.title, new.body, '/admin/dashboard/');
  elsif new.audience = 'tutors' then
    perform public.notify_role('tutor', 'announcement', new.title, new.body, '/tutor/dashboard/');
  elsif new.audience = 'admins' then
    perform public.notify_role('admin', 'announcement', new.title, new.body, '/admin/dashboard/');
  end if;
  return null;
end;
$$;

drop policy if exists announcements_select on public.announcements;
create policy announcements_select on public.announcements
  for select to authenticated
  using (
    public.is_admin()
    or (
      status = 'published'
      and published_at <= now()
      and (public.is_student() or audience = 'all'
        or (audience = 'tutors' and public.is_tutor())
        or (audience = 'admins' and public.is_admin()))
    )
  );
