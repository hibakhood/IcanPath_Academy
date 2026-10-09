-- Internal fan-out/audit primitives execute through authorized definer RPCs and
-- triggers only. They must not be callable directly through PostgREST.
revoke execute on function public.log_audit(text,text,uuid,jsonb) from public,anon,authenticated;
revoke execute on function public.notify_enrolled_students(uuid,public.notification_type,text,text,text) from public,anon,authenticated;
revoke execute on function public.notify_role(public.app_role,public.notification_type,text,text,text) from public,anon,authenticated;
