-- =============================================================================
-- CharterPath LMS — 0008 bootstrap
--
-- There is exactly one way an 'admin' role comes into existence, and it is not
-- self-service: signup can only ever produce a student or a pending tutor (see
-- handle_new_user in 0003). The first administrator is granted by hand.
-- =============================================================================

create or replace function public.bootstrap_admin(p_email text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id    uuid;
  v_count integer;
begin
  if exists (select 1 from public.profiles where role = 'admin') then
    raise exception 'An administrator already exists, so this will not run again.';
  end if;

  select id into v_id from auth.users where email = lower(trim(p_email));
  if v_id is null then
    raise exception 'No account with that email. Create the account in the app first.';
  end if;

  update public.profiles
     set role = 'admin', status = 'active', status_note = null
   where id = v_id;

  perform public.log_audit('first_admin_bootstrapped', 'profile', v_id,
    jsonb_build_object('email', lower(trim(p_email))));

  return v_id;
end;
$$;

-- Nobody can call this from the app. Only the project owner, running it in the
-- Supabase SQL editor, can.
revoke execute on function public.bootstrap_admin(text) from public, anon, authenticated;
