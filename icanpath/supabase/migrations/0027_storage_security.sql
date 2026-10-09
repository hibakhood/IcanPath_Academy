update storage.buckets set file_size_limit=5242880,
 allowed_mime_types=array['image/jpeg','image/png','image/webp','text/plain'] where id='lms-private';
-- The bucket includes legacy text pointers, hence text/plain remains permitted.
-- Avatar policies additionally require image metadata. Content sniffing/reencoding
-- is a separate staging acceptance gate, not proof supplied by MIME metadata.

-- On the Supabase platform postgres is not a member of supabase_storage_admin,
-- so the owner role cannot be adopted; policy DDL on storage.* is nevertheless
-- expressly permitted for postgres. Adopting the owner only happens where
-- membership exists. No-op in local PGlite tests (the role is not defined).
do $adopt_storage_owner$
begin
  if current_user = 'supabase_storage_admin'
     or not exists (select 1 from pg_catalog.pg_roles where rolname = 'supabase_storage_admin') then
    return;
  end if;
  begin
    execute 'set role supabase_storage_admin';
  exception when insufficient_privilege then
    null; -- hosted projects grant postgres the right to manage storage policies
  end;
end
$adopt_storage_owner$;
drop policy lms_avatar_read on storage.objects;
create policy lms_avatar_read on storage.objects for select to authenticated using(bucket_id='lms-private' and public.is_active_account() and name ~ ('^avatars/'||auth.uid()::text||'/') and public.storage_name_is_valid(name));
drop policy lms_avatar_insert on storage.objects;
create policy lms_avatar_insert on storage.objects for insert to authenticated with check(bucket_id='lms-private' and public.is_active_account() and name ~ ('^avatars/'||auth.uid()::text||'/') and public.storage_name_is_valid(name) and metadata->>'mimetype' in ('image/jpeg','image/png','image/webp'));
drop policy lms_avatar_update on storage.objects;
create policy lms_avatar_update on storage.objects for update to authenticated using(bucket_id='lms-private' and public.is_active_account() and name ~ ('^avatars/'||auth.uid()::text||'/') and public.storage_name_is_valid(name)) with check(bucket_id='lms-private' and public.is_active_account() and name ~ ('^avatars/'||auth.uid()::text||'/') and public.storage_name_is_valid(name) and metadata->>'mimetype' in ('image/jpeg','image/png','image/webp'));
drop policy lms_avatar_delete on storage.objects;
create policy lms_avatar_delete on storage.objects for delete to authenticated using(bucket_id='lms-private' and public.is_active_account() and name ~ ('^avatars/'||auth.uid()::text||'/') and public.storage_name_is_valid(name));
reset role;
create function public.can_read_legacy_pointer(p_path text)
returns boolean language sql volatile security definer set search_path=public as $$
 select public.manages_course(public.storage_course_id(p_path)) or (
 public.is_student() and public.is_enrolled(public.storage_course_id(p_path)) and exists(select 1 from courses where id=public.storage_course_id(p_path) and status='published')
 and (exists(select 1 from lesson_materials m where m.storage_path=p_path and m.course_id=public.storage_course_id(p_path) and public.lesson_is_published(m.lesson_id))
 or exists(select 1 from live_classes c where c.meeting_storage_path=p_path and c.course_id=public.storage_course_id(p_path) and c.status not in ('cancelled','completed') and public.live_review_visible(c.id) and (c.lesson_id is null or public.lesson_is_published(c.lesson_id)))));
$$;
revoke all on function public.can_read_legacy_pointer(text) from public,anon;
grant execute on function public.can_read_legacy_pointer(text) to authenticated;
-- Adopt the storage owner role again for the legacy policy rewrite below
-- (the public function above had to run under the original role).
do $adopt_storage_owner$
begin
  if current_user = 'supabase_storage_admin'
     or not exists (select 1 from pg_catalog.pg_roles where rolname = 'supabase_storage_admin') then
    return;
  end if;
  begin
    execute 'set role supabase_storage_admin';
  exception when insufficient_privilege then
    null; -- hosted projects grant postgres the right to manage storage policies
  end;
end
$adopt_storage_owner$;
drop policy lms_private_read on storage.objects;
create policy lms_private_read on storage.objects for select to authenticated using(bucket_id='lms-private' and public.storage_name_is_valid(name) and (
 public.is_admin() or (public.storage_kind(name) in ('materials','live') and public.can_read_legacy_pointer(name))
 or (public.storage_kind(name)='submissions' and (public.manages_course(public.storage_course_id(name)) or (public.is_enrolled(public.storage_course_id(name)) and public.storage_owner(name)=auth.uid())))));

-- Legacy write policies must not bypass avatar ownership/MIME policies.
alter policy lms_private_insert on storage.objects with check (
 bucket_id='lms-private' and public.storage_name_is_valid(name) and public.storage_kind(name) in ('materials','live','submissions')
 and (public.manages_course(public.storage_course_id(name)) or (public.storage_kind(name)='submissions' and public.storage_owner(name)=auth.uid() and public.is_enrolled(public.storage_course_id(name)))));
alter policy lms_private_update on storage.objects using (
 bucket_id='lms-private' and public.storage_name_is_valid(name) and public.storage_kind(name) in ('materials','live','submissions') and public.manages_course(public.storage_course_id(name))) with check (
 bucket_id='lms-private' and public.storage_name_is_valid(name) and public.storage_kind(name) in ('materials','live','submissions') and public.manages_course(public.storage_course_id(name)));
alter policy lms_private_delete on storage.objects using (
 bucket_id='lms-private' and public.storage_name_is_valid(name) and public.storage_kind(name) in ('materials','live','submissions') and public.manages_course(public.storage_course_id(name)));
reset role;
