-- Private profile photos. Each account can access and replace only its own photo.
create or replace function public.storage_name_is_valid(p_name text)
returns boolean language sql immutable as $$
  select p_name ~ '^avatars/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$'
      or p_name ~ '^courses/[0-9a-f-]{36}/materials/[0-9a-f-]{36}\.url$'
      or p_name ~ '^courses/[0-9a-f-]{36}/live/[0-9a-f-]{36}\.url$'
      or p_name ~ '^courses/[0-9a-f-]{36}/submissions/[0-9a-f-]{36}/[0-9a-f-]{36}\.url$';
$$;

-- storage.objects is owned by supabase_storage_admin on Supabase; adopt that
-- role so the CREATE POLICY statements below are allowed (no-op in local PGlite
-- tests).
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
create policy lms_avatar_read on storage.objects for select to authenticated
  using (bucket_id='lms-private' and name ~ ('^avatars/'||auth.uid()::text||'/') and public.storage_name_is_valid(name));
create policy lms_avatar_insert on storage.objects for insert to authenticated
  with check (bucket_id='lms-private' and name ~ ('^avatars/'||auth.uid()::text||'/') and public.storage_name_is_valid(name));
create policy lms_avatar_update on storage.objects for update to authenticated
  using (bucket_id='lms-private' and name ~ ('^avatars/'||auth.uid()::text||'/') and public.storage_name_is_valid(name))
  with check (bucket_id='lms-private' and name ~ ('^avatars/'||auth.uid()::text||'/') and public.storage_name_is_valid(name));
create policy lms_avatar_delete on storage.objects for delete to authenticated
  using (bucket_id='lms-private' and name ~ ('^avatars/'||auth.uid()::text||'/') and public.storage_name_is_valid(name));
reset role;
