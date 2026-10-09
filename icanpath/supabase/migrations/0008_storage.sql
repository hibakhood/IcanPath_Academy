-- =============================================================================
-- CharterPath LMS — 0007 private storage
--
-- Meeting URLs (Meet / Zoom / YouTube Live) and Google Drive links are not
-- stored in a table the browser can read. They live as small text objects in
-- this private bucket, and a URL is only ever released as a short-lived signed
-- link after an authorisation check (spec 14, 16, 17, 42, 63).
--
-- Object naming convention, enforced by the policies below:
--   courses/<course_id>/materials/<material_id>.url
--   courses/<course_id>/live/<live_class_id>.url
--   courses/<course_id>/submissions/<assignment_id>/<student_id>.url
-- =============================================================================

insert into storage.buckets (id, name, public)
values ('lms-private', 'lms-private', false)
on conflict (id) do update set public = false;

-- course_id is always segment 2 of the object name. The regex is checked first
-- in every policy below so a malformed name can never raise a cast error and
-- abort an otherwise valid query.
create or replace function public.storage_course_id(p_name text)
returns uuid
language plpgsql
immutable
as $$
begin
  if p_name !~ '^courses/[0-9a-f-]{36}/' then
    return null;
  end if;
  return split_part(p_name, '/', 2)::uuid;
exception when others then
  return null;
end;
$$;

create or replace function public.storage_kind(p_name text)
returns text
language sql
immutable
as $$
  select case
    when p_name ~ '^courses/[0-9a-f-]{36}/materials/'   then 'materials'
    when p_name ~ '^courses/[0-9a-f-]{36}/live/'        then 'live'
    when p_name ~ '^courses/[0-9a-f-]{36}/submissions/' then 'submissions'
    else null
  end;
$$;

-- The student id encoded in a submission object's filename, or null.
create or replace function public.storage_owner(p_name text)
returns uuid
language plpgsql
immutable
as $$
begin
  if p_name !~ '^courses/[0-9a-f-]{36}/submissions/[0-9a-f-]{36}/[0-9a-f-]{36}\.url$' then
    return null;
  end if;
  -- The .url suffix has to come off before the segment will cast.
  return regexp_replace(split_part(p_name, '/', 5), '\.url$', '')::uuid;
exception when others then
  return null;
end;
$$;

-- Policies are inert until RLS is switched on for the table. Supabase enables
-- this itself, but stating it here keeps the migration self-contained and means a
-- bucket can never end up readable by anyone with the anon key.
alter table storage.objects enable row level security;

-- Full-path validation. storage_kind() only checks the prefix, which is enough to
-- tell materials from submissions but would let an object with a junk filename
-- through. This is the strict form every policy uses.
create or replace function public.storage_name_is_valid(p_name text)
returns boolean
language sql
immutable
as $$
  select p_name ~ '^courses/[0-9a-f-]{36}/materials/[0-9a-f-]{36}\.url$'
      or p_name ~ '^courses/[0-9a-f-]{36}/live/[0-9a-f-]{36}\.url$'
      or p_name ~ '^courses/[0-9a-f-]{36}/submissions/[0-9a-f-]{36}/[0-9a-f-]{36}\.url$';
$$;

-- Reading an object (which is what createSignedUrl needs). Enrolled students
-- may read materials and live-class pointers for their courses; a submission is
-- readable only by the student who uploaded it, or by that course's tutors.
create policy lms_private_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'lms-private'
    and public.storage_name_is_valid(name)
    and (
      public.is_admin()
      or (
        public.storage_kind(name) in ('materials', 'live')
        and public.can_access_course_content(public.storage_course_id(name))
      )
      or (
        public.storage_kind(name) = 'submissions'
        and (
          public.manages_course(public.storage_course_id(name))
          or (
            public.is_enrolled(public.storage_course_id(name))
            and public.storage_owner(name) = auth.uid()
          )
        )
      )
    )
  );

-- Uploading. A tutor may put a material or a meeting pointer in their course;
-- a student may only ever upload a submission under their own student id.
create policy lms_private_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'lms-private'
    and public.storage_name_is_valid(name)
    and (
      public.manages_course(public.storage_course_id(name))
      or (
        public.storage_kind(name) = 'submissions'
        and public.storage_owner(name) = auth.uid()
        and public.is_enrolled(public.storage_course_id(name))
      )
    )
  );

create policy lms_private_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'lms-private'
    and public.storage_name_is_valid(name)
    and public.manages_course(public.storage_course_id(name))
  )
  with check (
    bucket_id = 'lms-private'
    and public.storage_name_is_valid(name)
    and public.manages_course(public.storage_course_id(name))
  );

create policy lms_private_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'lms-private'
    and public.storage_name_is_valid(name)
    and (
      public.is_admin()
      or public.manages_course(public.storage_course_id(name))
    )
  );
