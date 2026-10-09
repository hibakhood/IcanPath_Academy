-- Public read projections deliberately exclude private learning destinations.
create or replace function public.published_course_catalogue(p_query text default '', p_page integer default 1)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_result jsonb;
begin
 if length(p_query)>200 or p_page<1 or p_page>10000 then raise exception 'Invalid search.' using errcode='22023'; end if;
 select jsonb_build_object('total',(select count(*) from public.courses c where status='published' and (p_query='' or c.title ilike '%'||p_query||'%' or c.description ilike '%'||p_query||'%')),'courses',coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb)) into v_result
 from (select c.id,c.title,c.description,c.level,c.thumbnail_url,p.full_name as tutor_name from public.courses c join public.profiles p on p.id=c.created_by where c.status='published' and (p_query='' or c.title ilike '%'||p_query||'%' or c.description ilike '%'||p_query||'%') order by c.published_at desc nulls last,c.id limit 12 offset (p_page-1)*12) x;
 return v_result;
end $$;
create or replace function public.published_course_detail(p_course uuid)
returns jsonb language sql stable security definer set search_path=public as $$
 select jsonb_build_object('id',c.id,'title',c.title,'description',c.description,'level',c.level,'tutor_name',p.full_name,'modules',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'title',m.title,'lessons',coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'title',l.title) order by l.position,l.id) from public.lessons l where l.module_id=m.id and l.is_published),'[]'::jsonb)) order by m.position,m.id) from public.modules m where m.course_id=c.id),'[]'::jsonb)) from public.courses c join public.profiles p on p.id=c.created_by where c.id=p_course and c.status='published'
$$;
revoke all on function public.published_course_catalogue(text,integer), public.published_course_detail(uuid) from public;
grant execute on function public.published_course_catalogue(text,integer), public.published_course_detail(uuid) to anon, authenticated;
