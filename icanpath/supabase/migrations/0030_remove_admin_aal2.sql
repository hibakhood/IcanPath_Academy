-- =============================================================================
-- ICANPATH LMS — 0030 remove administrator AAL2 requirement
--
-- Reverts the second-factor gate added in 0025_admin_mfa.sql. Administrator
-- privilege is granted on role = 'admin' and status = 'active' alone again. The
-- /mfa/ route, the Supabase TOTP enrollment flow and the client-side AAL2 guard
-- have been removed, so there is no longer a second factor to satisfy.
--
-- Deliberate reduction of the administrator control surface for this
-- deployment. Grantee list is unchanged; only the function body moves.
-- =============================================================================

create or replace function public.is_admin()
returns boolean
language sql
volatile
security definer
set search_path = public
as $$
  select coalesce((select role = 'admin' and status = 'active'
                     from public.profiles where id = auth.uid()), false);
$$;
