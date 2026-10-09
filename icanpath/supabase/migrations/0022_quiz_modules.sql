alter table public.external_assessments add column module_id uuid references public.modules(id) on delete set null;
create or replace function public.assessment_workspace(p_kind text) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_uid uuid:=public.require_active_session();begin
 if p_kind not in ('quiz','assignment') then raise exception 'Invalid assessment kind.';end if;
 return jsonb_build_object('assessments',coalesce((select jsonb_agg(to_jsonb(x)) from (select a.id,a.course_id,a.module_id,a.created_at,c.title as course,a.kind,a.title,a.instructions,a.due_at,a.max_score,a.passing_score,a.is_published,case when public.manages_course(a.course_id) then a.destination else null end as destination from external_assessments a join courses c on c.id=a.course_id where a.kind=p_kind and (public.manages_course(a.course_id) or (a.is_published and public.is_enrolled(a.course_id))) order by a.created_at desc limit 200)x),'[]'),
 'submissions',coalesce((select jsonb_agg(to_jsonb(x)) from (select s.id,s.assessment_id,s.student_id,p.full_name as student,a.course_id,c.title as course,a.title,a.max_score,s.response,s.status,s.results_published,case when public.manages_course(a.course_id) or s.results_published then s.score else null end as score,case when public.manages_course(a.course_id) or s.results_published then s.feedback else null end as feedback,s.submitted_at from external_submissions s join external_assessments a on a.id=s.assessment_id join profiles p on p.id=s.student_id join courses c on c.id=a.course_id where a.kind=p_kind and (public.manages_course(a.course_id) or s.student_id=v_uid) order by s.submitted_at desc limit 200)x),'[]'));
end $$;
create or replace function public.assessment_action(p_action text,p_id uuid default null,p_payload jsonb default '{}') returns text language plpgsql security definer set search_path=public as $$
declare v_uid uuid:=public.require_active_session();v_course uuid;v_a external_assessments;v_s external_submissions;v_id uuid;v_score numeric;
begin
 if p_action in ('create','edit') then
  if p_action='edit' then select * into v_a from external_assessments where id=p_id for update;v_course:=v_a.course_id;else v_course:=(p_payload->>'course_id')::uuid;end if;
  if not public.manages_course(v_course) then raise exception 'Access denied.' using errcode='42501';end if;
  if nullif(p_payload->>'module_id','') is not null and not exists(select 1 from public.modules where id=(p_payload->>'module_id')::uuid and course_id=v_course) then raise exception 'Choose a module from this course.'; end if;
  if p_action='create' then
   insert into external_assessments(course_id,module_id,kind,title,instructions,destination,due_at,max_score,passing_score,is_published,created_by) values(v_course,nullif(p_payload->>'module_id','')::uuid,p_payload->>'kind',trim(p_payload->>'title'),coalesce(p_payload->>'instructions',''),p_payload->>'destination',nullif(p_payload->>'due_at','')::timestamptz,(p_payload->>'max_score')::numeric,(p_payload->>'passing_score')::numeric,coalesce((p_payload->>'is_published')::boolean,false),v_uid) returning id into v_id;
  else
   update external_assessments set module_id=nullif(p_payload->>'module_id','')::uuid,title=trim(p_payload->>'title'),instructions=coalesce(p_payload->>'instructions',''),destination=p_payload->>'destination',due_at=nullif(p_payload->>'due_at','')::timestamptz,is_published=coalesce((p_payload->>'is_published')::boolean,false) where id=p_id returning id into v_id;
  end if;
 elsif p_action in ('open','submit') then
  select * into v_a from external_assessments where id=p_id for update;v_course:=v_a.course_id;
  if v_a.id is null or not (public.manages_course(v_course) or (public.is_student() and v_a.is_published and public.is_enrolled(v_course))) then raise exception 'Access denied.' using errcode='42501';end if;
  if p_action='open' then perform public.log_audit('assessment_link_opened','course',v_course,'{}');return v_a.destination;end if;
  if not public.is_student() or not public.is_enrolled(v_course) then raise exception 'Access denied.';end if;
  if v_a.due_at is not null and now()>v_a.due_at then raise exception 'The deadline has passed.';end if;
  insert into external_submissions(assessment_id,student_id,response) values(p_id,v_uid,trim(p_payload->>'response')) on conflict(assessment_id,student_id) do update set response=excluded.response,submitted_at=now() where external_submissions.status='submitted' returning id into v_id;
  if v_id is null then raise exception 'This submission has already been graded.';end if;
 elsif p_action='grade' then
  select * into v_s from external_submissions where id=p_id for update;select * into v_a from external_assessments where id=v_s.assessment_id;v_course:=v_a.course_id;
  if not public.manages_course(v_course) then raise exception 'Access denied.' using errcode='42501';end if;
  v_score:=(p_payload->>'score')::numeric;
  if v_score is null or v_score<0 or v_score>v_a.max_score then raise exception 'Enter a score within the allowed range.';end if;
  update external_submissions set status='graded',score=v_score,feedback=p_payload->>'feedback',results_published=coalesce((p_payload->>'results_published')::boolean,false),graded_by=v_uid,graded_at=now() where id=p_id returning id into v_id;
  if (p_payload->>'results_published')::boolean then insert into notifications(user_id,type,title,body,link_path) values(v_s.student_id,'assignment_graded','Assessment results released',v_a.title,case when v_a.kind='quiz' then '/student/quizzes/' else '/student/assignments/' end);end if;
 else raise exception 'Unknown assessment action.';end if;
 perform public.log_audit('assessment_'||p_action,'course',v_course,jsonb_build_object('id',v_id));return v_id::text;
end $$;
