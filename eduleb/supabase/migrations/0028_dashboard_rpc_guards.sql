-- Supplemental remediation: dashboard read models also need trusted authorization.
-- Preserve their result contracts; remove client execution of internal implementations.
do $$ declare f record; n text; body text; begin
 for f in select p.proname,p.proretset from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace where ns.nspname='public' and p.proname in
 ('admin_analytics_data','admin_activity_items','admin_top_courses','admin_system_stats','admin_upcoming_classes','admin_dashboard_stats','tutor_my_courses','tutor_student_activity','tutor_my_students') loop
 n:='_secure_'||f.proname;
 execute format('alter function public.%I() rename to %I',f.proname,n);
 execute format('revoke all on function public.%I() from public,anon,authenticated',n);
 body:='begin perform public.require_active_session(); if not '||case when f.proname like 'admin_%' then 'public.is_admin()' else '(public.is_tutor() or public.is_admin())' end||' then raise exception ''Access denied.'' using errcode=''42501''; end if; '||case when f.proretset then 'return query select * from public.'||quote_ident(n)||'();' else 'return public.'||quote_ident(n)||'();' end||' end';
 execute format('create function public.%I() returns %s language plpgsql security definer set search_path=public as %L',f.proname,case when f.proretset then 'setof jsonb' else 'jsonb' end,body);
 execute format('revoke all on function public.%I() from public,anon',f.proname);
 execute format('grant execute on function public.%I() to authenticated',f.proname);
 end loop;
end $$;
