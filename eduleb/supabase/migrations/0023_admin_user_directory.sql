-- Contact details are available only to active platform administrators.
create or replace function public.admin_user_directory()
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $$
begin
 if not public.is_admin() then
  raise exception 'Access denied.' using errcode = '42501';
 end if;
 return coalesce((select jsonb_agg(to_jsonb(p) || jsonb_build_object('email', u.email) order by p.created_at desc)
  from public.profiles p left join auth.users u on u.id = p.id), '[]'::jsonb);
end;
$$;
revoke all on function public.admin_user_directory() from public, anon;
grant execute on function public.admin_user_directory() to authenticated;
