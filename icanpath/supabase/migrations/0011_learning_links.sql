-- Forward-only migration. Existing pointer objects remain intact for recovery.
create table public.learning_links (
  path text primary key,
  course_id uuid not null references public.courses(id) on delete cascade,
  material_id uuid unique references public.lesson_materials(id) on delete cascade,
  live_class_id uuid unique references public.live_classes(id) on delete cascade,
  destination text not null,
  created_at timestamptz not null default now(),
  check (num_nonnulls(material_id, live_class_id) = 1)
);
alter table public.learning_links enable row level security;
revoke all on public.learning_links from public, anon, authenticated;

create or replace function public.valid_provider_url(p_url text, p_provider text)
returns boolean language sql immutable set search_path = public as $$
 select coalesce(case p_provider
 when 'drive' then p_url ~ '^https://drive\.google\.com/[^[:space:]\\]+$'
 when 'google_meet' then p_url ~ '^https://meet\.google\.com/[a-z]{3}-[a-z]{4}-[a-z]{3}([?][^[:space:]\\]*)?$'
 when 'zoom' then p_url ~ '^https://([a-zA-Z0-9-]+\.)*zoom\.us/(j|my|wc)/[^[:space:]\\]+$'
 when 'youtube_live' then p_url ~ '^https://(www\.|m\.)?youtube\.com/(watch\?|live/)[^[:space:]\\]+$' or p_url ~ '^https://youtu\.be/[A-Za-z0-9_-]{11}([?][^[:space:]\\]*)?$'
 else false end, false)
$$;

create or replace function public.create_link_material(p_lesson uuid, p_title text, p_type public.material_type, p_description text, p_url text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := public.require_active_session(); v_course uuid; v_id uuid := gen_random_uuid(); v_path text; v_row public.lesson_materials;
begin
 select course_id into v_course from public.lessons where id = p_lesson;
 if v_course is null or not public.manages_course(v_course) then raise exception 'Access denied.' using errcode='42501'; end if;
 if not public.valid_provider_url(p_url,'drive') or length(trim(p_title)) not between 1 and 200 then raise exception 'Invalid resource details.' using errcode='22023'; end if;
 v_path := 'courses/' || v_course || '/materials/' || v_id || '.url';
 insert into public.lesson_materials(id, lesson_id, course_id, title, type, description, storage_path, created_by)
 values(v_id,p_lesson,v_course,trim(p_title),p_type,p_description,v_path,v_uid) returning * into v_row;
 insert into public.learning_links(path, course_id, material_id, destination) values(v_path,v_course,v_id,p_url);
 perform public.log_audit('material_added','lesson_material',v_id,'{}'::jsonb);
 return to_jsonb(v_row);
end $$;

create or replace function public.schedule_link_class(p_course uuid, p_lesson uuid, p_title text, p_platform public.live_platform, p_date date, p_start time, p_end time, p_url text, p_notes text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := public.require_active_session(); v_id uuid := gen_random_uuid(); v_path text; v_row public.live_classes;
begin
 if not public.manages_course(p_course) then raise exception 'Access denied.' using errcode='42501'; end if;
 if not public.valid_provider_url(p_url,p_platform::text) or length(trim(p_title)) not between 1 and 200 or p_end <= p_start or p_date is null then raise exception 'Invalid class details.' using errcode='22023'; end if;
 if p_lesson is not null and not exists(select 1 from public.lessons where id=p_lesson and course_id=p_course) then raise exception 'Invalid lesson.' using errcode='22023'; end if;
 v_path := 'courses/' || p_course || '/live/' || v_id || '.url';
 insert into public.live_classes(id, course_id, lesson_id, title, platform, scheduled_date, start_time, end_time, meeting_storage_path, created_by, notes)
 values(v_id,p_course,p_lesson,trim(p_title),p_platform,p_date,p_start,p_end,v_path,v_uid,p_notes) returning * into v_row;
 insert into public.learning_links(path, course_id, live_class_id, destination) values(v_path,p_course,v_id,p_url);
 perform public.log_audit('live_class_created','live_class',v_id,'{}'::jsonb);
 return to_jsonb(v_row) - 'meeting_storage_path';
end $$;

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
   if v_class.meeting_storage_path <> p_path or (not public.manages_course(v_link.course_id) and (v_class.status in ('cancelled','completed') or (v_class.lesson_id is not null and not public.lesson_is_published(v_class.lesson_id)))) then raise exception 'Class unavailable.' using errcode='42501'; end if;
 end if;
 perform public.log_audit('learning_link_opened','course',v_link.course_id,jsonb_build_object('user',v_uid));
 return v_link.destination;
end $$;

revoke all on function public.valid_provider_url(text,text), public.create_link_material(uuid,text,public.material_type,text,text), public.schedule_link_class(uuid,uuid,text,public.live_platform,date,time,time,text,text), public.resolve_learning_link(text) from public, anon;
grant execute on function public.create_link_material(uuid,text,public.material_type,text,text), public.schedule_link_class(uuid,uuid,text,public.live_platform,date,time,time,text,text), public.resolve_learning_link(text) to authenticated;

-- Existing resource rows can be configured without recreating curriculum.
create or replace function public.configure_learning_link(p_path text, p_url text)
returns void language plpgsql security definer set search_path=public as $$
declare v_uid uuid := public.require_active_session(); v_course uuid; v_material uuid; v_class uuid; v_provider text;
begin
 select m.id,m.course_id,'drive' into v_material,v_course,v_provider from public.lesson_materials m where m.storage_path=p_path;
 if not found then
  select l.id,l.course_id,l.platform::text into v_class,v_course,v_provider from public.live_classes l where l.meeting_storage_path=p_path;
 end if;
 if v_course is null or not public.manages_course(v_course) then raise exception 'Access denied.' using errcode='42501'; end if;
 if not public.valid_provider_url(p_url,v_provider) then raise exception 'Invalid provider link.' using errcode='22023'; end if;
 insert into public.learning_links(path,course_id,material_id,live_class_id,destination) values(p_path,v_course,v_material,v_class,p_url)
 on conflict(path) do update set destination=excluded.destination;
 perform public.log_audit('learning_link_configured','course',v_course,jsonb_build_object('user',v_uid));
end $$;
revoke all on function public.configure_learning_link(text,text) from public,anon;
grant execute on function public.configure_learning_link(text,text) to authenticated;

-- Extract only from supported HTTPS YouTube hosts or an explicit 11-char ID.
create or replace function public.youtube_id_from_url(p_url text)
returns text language sql immutable set search_path=public as $$
 select case
 when p_url ~ '^[A-Za-z0-9_-]{11}$' then p_url
 when p_url ~ '^https://youtu\.be/[A-Za-z0-9_-]{11}([?&#][^[:space:]\\]*)?$' then substring(p_url from '^https://youtu\.be/([A-Za-z0-9_-]{11})')
 when p_url ~ '^https://(www\.|m\.)?youtube\.com/(watch\?|embed/|shorts/|live/|v/)[^[:space:]\\]+$' then
  case when p_url ~ '/watch\?' then substring(p_url from '[?&]v=([A-Za-z0-9_-]{11})(?:[&#]|$)')
  else substring(p_url from '/(?:embed|shorts|live|v)/([A-Za-z0-9_-]{11})(?:[?&#]|$)') end
 else null end
$$;
