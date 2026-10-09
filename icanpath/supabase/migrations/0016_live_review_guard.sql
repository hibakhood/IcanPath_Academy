-- Retain enrollment/ownership guards and also require an approved class review.
create or replace function public.resolve_learning_link(p_path text)
returns text language plpgsql security definer set search_path = public as $$
declare v_uid uuid := public.require_active_session(); v_link public.learning_links; v_material public.lesson_materials; v_class public.live_classes;
begin
 select * into v_link from public.learning_links where path=p_path;
 if not found then raise exception 'This resource needs its provider link configured by a tutor.' using errcode='P0001'; end if;
 if not public.can_access_course_content(v_link.course_id) then raise exception 'Access denied.' using errcode='42501'; end if;
 if v_link.material_id is not null then
   select * into v_material from public.lesson_materials where id=v_link.material_id;
   if v_material.storage_path <> p_path or (not public.manages_course(v_link.course_id) and not public.lesson_is_published(v_material.lesson_id)) then raise exception 'Access denied.' using errcode='42501'; end if;
 else
   select * into v_class from public.live_classes where id=v_link.live_class_id;
   if v_class.meeting_storage_path <> p_path or (not public.manages_course(v_link.course_id) and (v_class.status in ('cancelled','completed') or not public.live_review_visible(v_class.id) or (v_class.lesson_id is not null and not public.lesson_is_published(v_class.lesson_id)))) then raise exception 'Class unavailable.' using errcode='42501'; end if;
 end if;
 perform public.log_audit('learning_link_opened','course',v_link.course_id,jsonb_build_object('user',v_uid));
 return v_link.destination;
end $$;

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
create or replace function public.storage_live_review_allowed(p_name text) returns boolean language plpgsql stable security definer set search_path=public as $$
begin
 if public.storage_kind(p_name)<>'live' then return true; end if;
 if public.manages_course(public.storage_course_id(p_name)) then return true; end if;
 return public.live_review_visible(regexp_replace(split_part(p_name,'/',4),'\.url$','')::uuid);
exception when others then return false; end $$;
revoke all on function public.storage_live_review_allowed(text) from public,anon;
grant execute on function public.storage_live_review_allowed(text) to authenticated;
-- storage.objects is owned by supabase_storage_admin on Supabase; adopt that
-- role so the CREATE POLICY below is allowed (no-op in local PGlite tests).
do $adopt_storage_owner$
begin
  if current_user = 'supabase_storage_admin'
     or not exists (select 1 from pg_catalog.pg_roles where rolname = 'supabase_storage_admin') then
    return;
  end if;
  begin
    execute 'set role supabase_storage_admin';
  exception when insufficient_privilege then
    if not exists (select 1 from pg_catalog.pg_roles where rolname = session_user and rolsuper) then
      raise exception 'Need to be postgres to adopt owner role supabase_storage_admin';
    end if;
    execute format('grant %I to %I', 'supabase_storage_admin', session_user);
    execute 'set role supabase_storage_admin';
  end;
end
$adopt_storage_owner$;
create policy live_review_storage_guard on storage.objects as restrictive for select to authenticated using(bucket_id<>'lms-private' or public.storage_live_review_allowed(name));
reset role;
