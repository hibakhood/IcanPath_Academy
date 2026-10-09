-- Forward-only admin workspace. No payment processing or fabricated telemetry.
create table public.payment_ledger (
 id uuid primary key default gen_random_uuid(), student_id uuid not null references public.profiles(id) on delete restrict,
 course_id uuid references public.courses(id) on delete set null,
 amount_minor bigint not null check(amount_minor>0 and amount_minor<=100000000000),
 currency text not null default 'NGN' check(currency='NGN'),
 kind text not null check(kind in ('payment','refund')), reference text not null unique check(length(reference) between 3 and 120),
 note text check(length(note)<=1000), recorded_by uuid not null references public.profiles(id) on delete restrict,
 created_at timestamptz not null default now()
);
create table public.live_class_requests (
 id uuid primary key default gen_random_uuid(), live_class_id uuid not null unique references public.live_classes(id) on delete cascade,
 requested_by uuid not null references public.profiles(id) on delete restrict,
 status text not null default 'pending' check(status in ('pending','approved','rejected')),
 note text check(length(note)<=1000), reviewed_by uuid references public.profiles(id), reviewed_at timestamptz,
 created_at timestamptz not null default now()
);
create table public.content_reports (
 id uuid primary key default gen_random_uuid(), course_id uuid not null references public.courses(id) on delete cascade,
 lesson_id uuid references public.lessons(id) on delete set null, reported_by uuid not null references public.profiles(id),
 reason text not null check(length(reason) between 10 and 2000),
 status text not null default 'open' check(status in ('open','resolved','dismissed')),
 resolution text check(length(resolution)<=2000), reviewed_by uuid references public.profiles(id), reviewed_at timestamptz,
 created_at timestamptz not null default now()
);
create table public.inbox_messages (
 id uuid primary key default gen_random_uuid(), sender_id uuid not null references public.profiles(id),
 recipient_id uuid not null references public.profiles(id), subject text not null check(length(subject) between 1 and 200),
 body text not null check(length(body) between 1 and 5000), read_at timestamptz, created_at timestamptz not null default now()
);
create table public.monitoring_snapshots (
 id uuid primary key default gen_random_uuid(), measured_at timestamptz not null default now(),
 uptime_pct numeric(5,2) check(uptime_pct between 0 and 100), storage_bytes bigint check(storage_bytes>=0),
 storage_limit_bytes bigint check(storage_limit_bytes>0), bandwidth_bytes bigint check(bandwidth_bytes>=0),
 bandwidth_limit_bytes bigint check(bandwidth_limit_bytes>0), source text not null check(length(source) between 1 and 200),
 recorded_by uuid not null references public.profiles(id)
);
create table public.admin_report_runs (
 id uuid primary key default gen_random_uuid(), created_by uuid not null references public.profiles(id),
 start_date date not null, end_date date not null check(end_date>=start_date),
 snapshot jsonb not null, created_at timestamptz not null default now()
);
create index payments_time_idx on public.payment_ledger(created_at desc);
create index payments_student_idx on public.payment_ledger(student_id,created_at desc);
create index requests_queue_idx on public.live_class_requests(status,created_at);
create index reports_queue_idx on public.content_reports(status,created_at);
create index inbox_recipient_idx on public.inbox_messages(recipient_id,created_at desc);
create index monitoring_time_idx on public.monitoring_snapshots(measured_at desc);
create index report_runs_owner_idx on public.admin_report_runs(created_by,created_at desc);
do $$ declare t text; begin foreach t in array array['payment_ledger','live_class_requests','content_reports','inbox_messages','monitoring_snapshots','admin_report_runs'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated',t);
 execute format('grant select on public.%I to authenticated',t);
 execute format('create policy admin_read on public.%I for select to authenticated using(public.is_admin())',t);
 end loop; end $$;
grant select on public.payment_ledger,public.live_class_requests,public.content_reports,public.inbox_messages,public.monitoring_snapshots,public.admin_report_runs to authenticated;
drop policy admin_read on public.inbox_messages;
create policy inbox_own on public.inbox_messages for select to authenticated using(public.is_active_account() and (sender_id=auth.uid() or recipient_id=auth.uid()));
grant update(read_at) on public.inbox_messages to authenticated;
create policy inbox_read_receipt on public.inbox_messages for update to authenticated using(public.is_active_account() and recipient_id=auth.uid()) with check(recipient_id=auth.uid());

create or replace function public.admin_workspace() returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
 if not public.is_admin() then raise exception 'Access denied.' using errcode='42501'; end if;
 return jsonb_build_object(
 'payments',coalesce((select jsonb_agg(to_jsonb(x)) from (select l.*,p.full_name as student,c.title as course from payment_ledger l join profiles p on p.id=l.student_id left join courses c on c.id=l.course_id order by l.created_at desc limit 200)x),'[]'),
 'requests',coalesce((select jsonb_agg(to_jsonb(x)) from (select r.*,lc.title from live_class_requests r join live_classes lc on lc.id=r.live_class_id order by r.created_at desc limit 200)x),'[]'),
 'reports',coalesce((select jsonb_agg(to_jsonb(x)) from (select r.*,c.title as course from content_reports r join courses c on c.id=r.course_id order by r.created_at desc limit 200)x),'[]'),
 'messages',coalesce((select jsonb_agg(to_jsonb(x)) from (select m.*,p.full_name as sender,q.full_name as recipient from inbox_messages m join profiles p on p.id=m.sender_id join profiles q on q.id=m.recipient_id where m.recipient_id=auth.uid() or m.sender_id=auth.uid() order by m.created_at desc limit 200)x),'[]'),
 'enrollments',coalesce((select jsonb_agg(to_jsonb(x)) from (select e.*,p.full_name as student,c.title as course from course_enrollments e join profiles p on p.id=e.student_id join courses c on c.id=e.course_id order by e.enrolled_at desc limit 200)x),'[]'),
 'classes',coalesce((select jsonb_agg(to_jsonb(x)) from (select l.id,l.title,l.course_id,c.title as course,l.platform,l.scheduled_date,l.start_time,l.end_time,l.timezone,l.status from live_classes l join courses c on c.id=l.course_id order by l.scheduled_date desc limit 200)x),'[]'),
 'audit',coalesce((select jsonb_agg(to_jsonb(x)) from (select a.*,p.full_name as actor from audit_logs a left join profiles p on p.id=a.actor_id order by a.created_at desc limit 200)x),'[]'),
 'settings',coalesce((select jsonb_agg(to_jsonb(x)) from (select * from platform_settings order by key)x),'[]'),
 'monitoring',(select to_jsonb(x) from (select * from monitoring_snapshots order by measured_at desc limit 1)x),
 'runs',coalesce((select jsonb_agg(to_jsonb(x)-'snapshot') from (select * from admin_report_runs order by created_at desc limit 30)x),'[]'),
 'pending_requests',(select count(*) from live_class_requests where status='pending'),
 'open_reports',(select count(*) from content_reports where status='open'),
 'unread_messages',(select count(*) from inbox_messages where recipient_id=auth.uid() and read_at is null),
 'revenue',(select coalesce(sum(case when kind='payment' then amount_minor else -amount_minor end),0)/100.0 from payment_ledger)
 );
end $$;
create or replace function public.admin_date_metrics(p_start date,p_end date) returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
 if not public.is_admin() then raise exception 'Access denied.' using errcode='42501'; end if;
 if p_start is null or p_end is null or p_end<p_start or p_end-p_start>366 then raise exception 'Choose a date range of at most 367 days.'; end if;
 return (with days as(select generate_series(p_start::timestamp,p_end::timestamp,interval '1 day')::date as d),series as(
 select d,(select count(*) from profiles where role='student' and (created_at at time zone 'Africa/Lagos')::date=d) as students,
 (select count(*) from course_enrollments where (enrolled_at at time zone 'Africa/Lagos')::date=d) as enrollments,
 (select coalesce(sum(case when kind='payment' then amount_minor else -amount_minor end),0)/100.0 from payment_ledger where (created_at at time zone 'Africa/Lagos')::date=d) as revenue from days)
 select jsonb_build_object('labels',jsonb_agg(to_char(d,'YYYY-MM-DD') order by d),'students',jsonb_agg(students order by d),'enrollments',jsonb_agg(enrollments order by d),'revenue',jsonb_agg(revenue order by d)) from series);
end $$;
create or replace function public.admin_operation(p_action text,p_id uuid default null,p_payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path=public as $$
declare v_id uuid; v_class uuid; v_status text; v_data jsonb;
begin
 if not public.is_admin() then raise exception 'Access denied.' using errcode='42501'; end if;
 case p_action
 when 'enrollment' then
  if not exists(select 1 from profiles where id=(p_payload->>'student_id')::uuid and role='student' and status='active') or not exists(select 1 from courses where id=(p_payload->>'course_id')::uuid and status='published') then raise exception 'Choose an active student and a published course.'; end if;
  insert into course_enrollments(student_id,course_id) values((p_payload->>'student_id')::uuid,(p_payload->>'course_id')::uuid) on conflict(course_id,student_id) do update set status='active' returning id into v_id;
 when 'cancel_enrollment' then
  update course_enrollments set status='cancelled' where id=p_id returning id into v_id;
  if v_id is null then raise exception 'Enrollment unavailable.'; end if;
 when 'payment' then
  if not exists(select 1 from profiles where id=(p_payload->>'student_id')::uuid and role='student') then raise exception 'Choose a student.'; end if;
  insert into payment_ledger(student_id,course_id,amount_minor,kind,reference,note,recorded_by) values((p_payload->>'student_id')::uuid,nullif(p_payload->>'course_id','')::uuid,(p_payload->>'amount_minor')::bigint,p_payload->>'kind',trim(p_payload->>'reference'),p_payload->>'note',auth.uid()) returning id into v_id;
 when 'request_decision' then
  v_status:=p_payload->>'status'; if v_status not in ('approved','rejected') then raise exception 'Invalid decision.'; end if;
  update live_class_requests set status=v_status,note=p_payload->>'note',reviewed_by=auth.uid(),reviewed_at=now() where id=p_id and status='pending' returning live_class_id into v_class;
  if v_class is null then raise exception 'Request already reviewed or unavailable.'; end if;
  if v_status='rejected' then update live_classes set status='cancelled' where id=v_class; end if;
  v_id:=p_id;
 when 'report_decision' then
  v_status:=p_payload->>'status'; if v_status not in ('resolved','dismissed') then raise exception 'Invalid decision.'; end if;
  update content_reports set status=v_status,resolution=p_payload->>'note',reviewed_by=auth.uid(),reviewed_at=now() where id=p_id and status='open' returning id into v_id;
  if v_id is null then raise exception 'Report already reviewed or unavailable.'; end if;
 when 'message' then
  if not exists(select 1 from profiles where id=(p_payload->>'recipient_id')::uuid and status='active') then raise exception 'Recipient unavailable.'; end if;
  insert into inbox_messages(sender_id,recipient_id,subject,body) values(auth.uid(),(p_payload->>'recipient_id')::uuid,trim(p_payload->>'subject'),trim(p_payload->>'body')) returning id into v_id;
  insert into notifications(user_id,type,title,body,link_path) select p.id,'account',trim(p_payload->>'subject'),trim(p_payload->>'body'),'/'||p.role::text||'/messages/' from profiles p where p.id=(p_payload->>'recipient_id')::uuid;
 when 'setting' then
  if p_payload->>'key' not in ('site_name','support_email','default_timezone','maintenance_notice') then raise exception 'Unknown setting.'; end if;
  if jsonb_typeof(p_payload->'value')<>'string' or length(p_payload->>'value')>1000 then raise exception 'Enter a text setting up to 1000 characters.'; end if;
  if p_payload->>'key'='default_timezone' and not exists(select 1 from pg_timezone_names where name=p_payload->>'value') then raise exception 'Enter a valid timezone.'; end if;
  if p_payload->>'key'='support_email' and (p_payload->>'value') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Enter a valid support email.'; end if;
  insert into platform_settings(key,value,updated_by) values(p_payload->>'key',p_payload->'value',auth.uid()) on conflict(key) do update set value=excluded.value,updated_by=excluded.updated_by;
 when 'monitoring' then
  insert into monitoring_snapshots(uptime_pct,storage_bytes,storage_limit_bytes,bandwidth_bytes,bandwidth_limit_bytes,source,recorded_by) values((p_payload->>'uptime_pct')::numeric,(p_payload->>'storage_bytes')::bigint,(p_payload->>'storage_limit_bytes')::bigint,(p_payload->>'bandwidth_bytes')::bigint,(p_payload->>'bandwidth_limit_bytes')::bigint,p_payload->>'source',auth.uid()) returning id into v_id;
 when 'download_report' then
  select snapshot into v_data from admin_report_runs where id=p_id;
  if v_data is null then raise exception 'Report unavailable.'; end if;
  return jsonb_build_object('id',p_id,'data',v_data);
 when 'report' then
  v_data:=public.admin_date_metrics((p_payload->>'start')::date,(p_payload->>'end')::date);
  insert into admin_report_runs(created_by,start_date,end_date,snapshot) values(auth.uid(),(p_payload->>'start')::date,(p_payload->>'end')::date,v_data) returning id into v_id;
  perform public.log_audit('admin_report','admin_workspace',v_id,'{}');
  return jsonb_build_object('id',v_id,'data',v_data);
 else raise exception 'Unknown operation.';
 end case;
 perform public.log_audit('admin_'||p_action,'admin_workspace',v_id,jsonb_build_object('id',v_id));
 return jsonb_build_object('id',v_id);
end $$;
create or replace function public.admin_search(p_term text) returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
 if not public.is_admin() then raise exception 'Access denied.' using errcode='42501'; end if;
 if length(trim(p_term))<2 or length(p_term)>100 then return '[]'; end if;
 return coalesce((select jsonb_agg(to_jsonb(x)) from(
 (select id,full_name as title,'user' as kind,null::uuid as course_id from profiles where full_name ilike '%'||p_term||'%' limit 10)
 union all (select id,title,'course',id as course_id from courses where title ilike '%'||p_term||'%' limit 10)
 union all (select id,title,'lesson',course_id from lessons where title ilike '%'||p_term||'%' limit 10)
 )x),'[]');
end $$;
-- Users can report enrolled course content. Tutors can request review of their own scheduled classes.
create or replace function public.report_course_content(p_course_id uuid,p_lesson_id uuid,p_reason text) returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid;
begin
 if not public.is_active_account() or not public.can_access_course_content(p_course_id) then raise exception 'Access denied.' using errcode='42501'; end if;
 if p_lesson_id is not null and not exists(select 1 from lessons where id=p_lesson_id and course_id=p_course_id) then raise exception 'Lesson does not belong to course.'; end if;
 perform pg_advisory_xact_lock(hashtext(auth.uid()::text));
 if (select count(*) from content_reports where reported_by=auth.uid() and created_at>now()-interval '1 hour')>=10 then raise exception 'Please try again later.'; end if;
 insert into content_reports(course_id,lesson_id,reported_by,reason) values(p_course_id,p_lesson_id,auth.uid(),trim(p_reason)) returning id into v_id;
 perform public.notify_role('admin','account','Content report awaiting review',null,'/admin/moderation/');return v_id;
end $$;
create or replace function public.request_live_review(p_live_class_id uuid) returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid;
begin
 if not exists(select 1 from live_classes where id=p_live_class_id and public.manages_course(course_id) and status='scheduled') then raise exception 'Access denied.' using errcode='42501'; end if;
 insert into live_class_requests(live_class_id,requested_by) values(p_live_class_id,auth.uid()) returning id into v_id;
 perform public.notify_role('admin','account','Live class awaiting review',null,'/admin/moderation/');return v_id;
end $$;
-- Block pending/rejected meeting access both through row policies and the resolver.
create or replace function public.live_review_visible(p_id uuid) returns boolean language sql stable security definer set search_path=public as $$
 select not exists(select 1 from live_class_requests where live_class_id=p_id and status<>'approved');
$$;
drop policy live_classes_select on public.live_classes;
create policy live_classes_select on public.live_classes for select to authenticated using(public.manages_course(course_id) or (public.can_view_course(course_id) and public.live_review_visible(id)));
do $$ declare f text; begin foreach f in array array['admin_workspace()','admin_date_metrics(date,date)','admin_operation(text,uuid,jsonb)','admin_search(text)','report_course_content(uuid,uuid,text)','request_live_review(uuid)','live_review_visible(uuid)'] loop
 execute 'revoke all on function public.'||f||' from public,anon,authenticated';
 execute 'grant execute on function public.'||f||' to authenticated';
end loop;end $$;

-- Apply the configured default to new live classes; existing dates/timezones survive.
create or replace function public.apply_live_timezone() returns trigger language plpgsql security definer set search_path=public as $$
declare v_zone text;
begin
 select value #>> '{}' into v_zone from platform_settings where key='default_timezone';
 if v_zone is not null and exists(select 1 from pg_timezone_names where name=v_zone) and new.timezone='Africa/Lagos' then new.timezone:=v_zone;end if;
 return new;
end $$;
revoke all on function public.apply_live_timezone() from public,anon,authenticated;
create trigger live_class_default_timezone before insert on public.live_classes for each row execute function public.apply_live_timezone();
