-- Mandatory AAL2 for administrator privilege. Own profile/factor enrollment remains accessible.
create or replace function public.is_admin()
returns boolean language sql volatile security definer set search_path=public as $$
 select coalesce((select role='admin' and status='active' from profiles where id=auth.uid()),false)
 and coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'aal',
              nullif(current_setting('request.jwt.claim.aal',true),''),'aal1')='aal2';
$$;
-- No rollout bypass flag. Apply in staging first and enroll real administrators
-- through Supabase Auth before production activation. Bootstrap stays service-only.
