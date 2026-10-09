-- Private profile photos. Each account can access and replace only its own photo.
create or replace function public.storage_name_is_valid(p_name text)
returns boolean language sql immutable as $$
  select p_name ~ '^avatars/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$'
      or p_name ~ '^courses/[0-9a-f-]{36}/materials/[0-9a-f-]{36}\.url$'
      or p_name ~ '^courses/[0-9a-f-]{36}/live/[0-9a-f-]{36}\.url$'
      or p_name ~ '^courses/[0-9a-f-]{36}/submissions/[0-9a-f-]{36}/[0-9a-f-]{36}\.url$';
$$;
create policy lms_avatar_read on storage.objects for select to authenticated
  using (bucket_id='lms-private' and name ~ ('^avatars/'||auth.uid()::text||'/') and public.storage_name_is_valid(name));
create policy lms_avatar_insert on storage.objects for insert to authenticated
  with check (bucket_id='lms-private' and name ~ ('^avatars/'||auth.uid()::text||'/') and public.storage_name_is_valid(name));
create policy lms_avatar_update on storage.objects for update to authenticated
  using (bucket_id='lms-private' and name ~ ('^avatars/'||auth.uid()::text||'/') and public.storage_name_is_valid(name))
  with check (bucket_id='lms-private' and name ~ ('^avatars/'||auth.uid()::text||'/') and public.storage_name_is_valid(name));
create policy lms_avatar_delete on storage.objects for delete to authenticated
  using (bucket_id='lms-private' and name ~ ('^avatars/'||auth.uid()::text||'/') and public.storage_name_is_valid(name));
