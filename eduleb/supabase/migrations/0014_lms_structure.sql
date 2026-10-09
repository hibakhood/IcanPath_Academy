-- Additive domain redesign. Existing IDs, enrollments, assessments and grants survive.
create table public.course_categories (
 id uuid primary key default gen_random_uuid(), name text not null unique,
 slug text not null unique check(slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
 description text, is_active boolean not null default true,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.student_profiles (
 user_id uuid primary key references public.profiles(id) on delete cascade,
 study_level text check(study_level in ('foundation','skills','professional')),
 learning_goal text check(length(learning_goal)<=1000),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.tutor_profiles (
 user_id uuid primary key references public.profiles(id) on delete cascade,
 headline text check(length(headline)<=200), bio text check(length(bio)<=5000),
 specialties text[] not null default '{}', public_listing boolean not null default false,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.contact_messages (
 id uuid primary key default gen_random_uuid(), name text not null check(length(name) between 2 and 120),
 email text not null check(length(email)<=254 and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
 phone text check(length(phone)<=40), subject text not null check(length(subject) between 1 and 200),
 message text not null check(length(message) between 10 and 5000),
 status text not null default 'new' check(status in ('new','reviewed','resolved')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.public_resources (
 id uuid primary key default gen_random_uuid(), category_id uuid references public.course_categories(id) on delete set null,
 title text not null check(length(title) between 1 and 200), description text,
 google_drive_url text not null check(public.valid_provider_url(google_drive_url,'drive')),
 is_published boolean not null default false, created_by uuid not null references public.profiles(id) on delete restrict,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.platform_settings (
 key text primary key check(key ~ '^[a-z][a-z0-9_]{0,63}$'), value jsonb not null,
 updated_by uuid references public.profiles(id) on delete set null, updated_at timestamptz not null default now()
);
alter table public.courses add column category_id uuid references public.course_categories(id) on delete set null,
 add column short_description text check(length(short_description)<=500),
 add column duration_minutes integer check(duration_minutes>0),
 add column learning_objectives text[] not null default '{}';
alter table public.lessons add column lesson_type text not null default 'recorded' check(lesson_type in ('recorded','live','recorded_live','reading','quiz','assignment'));
alter table public.live_classes add column timezone text not null default 'Africa/Lagos' check(length(timezone) between 1 and 100);
alter table public.lesson_progress add column last_position_seconds integer not null default 0 check(last_position_seconds>=0);
create index courses_category_published_idx on public.courses(category_id,published_at desc) where status='published';
create index live_classes_upcoming_idx on public.live_classes(scheduled_date,start_time) where status in ('scheduled','live');
create index contacts_queue_idx on public.contact_messages(status,created_at desc);
create index contacts_email_idx on public.contact_messages(lower(email),created_at desc);
create index resources_public_idx on public.public_resources(category_id,created_at desc) where is_published;

alter table public.course_categories enable row level security;
alter table public.student_profiles enable row level security;
alter table public.tutor_profiles enable row level security;
alter table public.contact_messages enable row level security;
alter table public.public_resources enable row level security;
alter table public.platform_settings enable row level security;
revoke all on public.course_categories,public.student_profiles,public.tutor_profiles,public.contact_messages,public.public_resources,public.platform_settings from public,anon,authenticated;
grant select on public.course_categories,public.public_resources to anon,authenticated;
grant insert,update,delete on public.course_categories,public.public_resources to authenticated;
grant select,insert,update on public.student_profiles,public.tutor_profiles to authenticated;
grant select on public.contact_messages to authenticated;
grant update(status) on public.contact_messages to authenticated;
grant select,insert,update on public.platform_settings to authenticated;
grant insert(category_id,short_description,duration_minutes,learning_objectives) on public.courses to authenticated;
grant update(category_id,short_description,duration_minutes,learning_objectives) on public.courses to authenticated;
grant insert(lesson_type) on public.lessons to authenticated;
grant update(lesson_type) on public.lessons to authenticated;
create policy categories_read on public.course_categories for select to anon,authenticated using(is_active or public.is_admin());
create policy categories_manage on public.course_categories for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy student_profile_read on public.student_profiles for select to authenticated using(user_id=auth.uid() or public.is_admin());
create policy student_profile_write on public.student_profiles for all to authenticated using((user_id=auth.uid() and public.is_active_account()) or public.is_admin()) with check((user_id=auth.uid() and public.is_student()) or public.is_admin());
create policy tutor_profile_read on public.tutor_profiles for select to authenticated using(user_id=auth.uid() or public.is_admin());
create policy tutor_profile_write on public.tutor_profiles for all to authenticated using((user_id=auth.uid() and public.is_tutor()) or public.is_admin()) with check((user_id=auth.uid() and public.is_tutor()) or public.is_admin());
create policy contacts_admin on public.contact_messages for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy public_resources_read on public.public_resources for select to anon,authenticated using(is_published or public.is_admin());
create policy public_resources_manage on public.public_resources for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy settings_admin on public.platform_settings for all to authenticated using(public.is_admin()) with check(public.is_admin());
-- Public predicates may run as anon; they return only the caller's admin status.
grant execute on function public.is_admin() to anon;

insert into public.student_profiles(user_id) select id from public.profiles where role='student';
insert into public.tutor_profiles(user_id,headline,bio,specialties) select p.id,a.headline,a.bio,coalesce(a.specialties,'{}') from public.profiles p left join public.tutor_applications a on a.user_id=p.id where p.role='tutor';
create or replace function public.provision_role_details() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if new.role='student' then insert into public.student_profiles(user_id) values(new.id) on conflict do nothing;
 elsif new.role='tutor' then insert into public.tutor_profiles(user_id) values(new.id) on conflict do nothing; end if;
 return new;
end $$;
create trigger profiles_domain_details after insert or update of role on public.profiles for each row execute function public.provision_role_details();
revoke all on function public.provision_role_details() from public,anon,authenticated;
do $$ declare t text; begin foreach t in array array['course_categories','student_profiles','tutor_profiles','contact_messages','public_resources','platform_settings'] loop execute format('create trigger %I before update on public.%I for each row execute function public.touch_updated_at()',t||'_updated_at',t); end loop; end $$;

create or replace function public.submit_contact_message(p_name text,p_email text,p_phone text,p_subject text,p_message text)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid; begin
 if length(p_email)>254 then raise exception 'Invalid enquiry.' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtext(lower(trim(p_email))));
 if (select count(*) from public.contact_messages where lower(email)=lower(trim(p_email)) and created_at>now()-interval '10 minutes')>=3 then raise exception 'Please wait before sending another enquiry.' using errcode='22023'; end if;
 insert into public.contact_messages(name,email,phone,subject,message) values(trim(p_name),lower(trim(p_email)),p_phone,trim(p_subject),trim(p_message)) returning id into v_id;
 return v_id;
end $$;
revoke all on function public.submit_contact_message(text,text,text,text,text) from public;
grant execute on function public.submit_contact_message(text,text,text,text,text) to anon,authenticated;
