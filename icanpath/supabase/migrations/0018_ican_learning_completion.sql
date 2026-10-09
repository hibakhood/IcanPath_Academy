-- External assessment destinations stay private; results remain tutor verified.
create table public.external_assessments (
 id uuid primary key default gen_random_uuid(), course_id uuid not null references public.courses(id) on delete cascade,
 kind text not null check(kind in ('quiz','assignment')), title text not null check(length(trim(title)) between 1 and 200),
 instructions text not null default '' check(length(instructions)<=5000), destination text not null,
 due_at timestamptz, max_score numeric not null default 100 check(max_score>0 and max_score<=100000),
 passing_score numeric not null default 50 check(passing_score between 0 and 100), is_published boolean not null default false,
 created_by uuid not null references public.profiles(id), created_at timestamptz not null default now(),
 check(destination ~ '^https://(forms\.gle/|docs\.google\.com/forms/|drive\.google\.com/)[^[:space:]\\]+$')
);
create table public.external_submissions (
 id uuid primary key default gen_random_uuid(), assessment_id uuid not null references public.external_assessments(id) on delete cascade,
 student_id uuid not null references public.profiles(id), response text not null check(length(trim(response)) between 1 and 5000),
 status text not null default 'submitted' check(status in ('submitted','graded')), score numeric, feedback text check(length(feedback)<=5000),
 results_published boolean not null default false, graded_by uuid references public.profiles(id), graded_at timestamptz,
 submitted_at timestamptz not null default now(), unique(assessment_id,student_id), check(status<>'graded' or score is not null)
);
alter table public.external_assessments enable row level security;
alter table public.external_submissions enable row level security;
revoke all on public.external_assessments,public.external_submissions from public,anon,authenticated;
-- Never grant raw reads: destinations and unreleased marks are projected by RPC.
create index external_course_idx on public.external_assessments(course_id,kind);
create index external_owner_idx on public.external_submissions(student_id,assessment_id);
create or replace function public.assessment_workspace(p_kind text) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_uid uuid:=public.require_active_session();begin
 if p_kind not in ('quiz','assignment') then raise exception 'Invalid assessment kind.';end if;
 return jsonb_build_object('assessments',coalesce((select jsonb_agg(to_jsonb(x)) from (select a.id,a.course_id,c.title as course,a.kind,a.title,a.instructions,a.due_at,a.max_score,a.passing_score,a.is_published,case when public.manages_course(a.course_id) then a.destination else null end as destination from external_assessments a join courses c on c.id=a.course_id where a.kind=p_kind and (public.manages_course(a.course_id) or (a.is_published and public.is_enrolled(a.course_id))) order by a.created_at desc limit 200)x),'[]'),
 'submissions',coalesce((select jsonb_agg(to_jsonb(x)) from (select s.id,s.assessment_id,s.student_id,p.full_name as student,a.course_id,c.title as course,a.title,a.max_score,s.response,s.status,s.results_published,case when public.manages_course(a.course_id) or s.results_published then s.score else null end as score,case when public.manages_course(a.course_id) or s.results_published then s.feedback else null end as feedback,s.submitted_at from external_submissions s join external_assessments a on a.id=s.assessment_id join profiles p on p.id=s.student_id join courses c on c.id=a.course_id where a.kind=p_kind and (public.manages_course(a.course_id) or s.student_id=v_uid) order by s.submitted_at desc limit 200)x),'[]'));
end $$;
create or replace function public.assessment_action(p_action text,p_id uuid default null,p_payload jsonb default '{}') returns text language plpgsql security definer set search_path=public as $$
declare v_uid uuid:=public.require_active_session();v_course uuid;v_a external_assessments;v_s external_submissions;v_id uuid;v_score numeric;
begin
 if p_action in ('create','edit') then
  if p_action='edit' then select * into v_a from external_assessments where id=p_id for update;v_course:=v_a.course_id;else v_course:=(p_payload->>'course_id')::uuid;end if;
  if not public.manages_course(v_course) then raise exception 'Access denied.' using errcode='42501';end if;
  if p_action='create' then
   insert into external_assessments(course_id,kind,title,instructions,destination,due_at,max_score,passing_score,is_published,created_by) values(v_course,p_payload->>'kind',trim(p_payload->>'title'),coalesce(p_payload->>'instructions',''),p_payload->>'destination',nullif(p_payload->>'due_at','')::timestamptz,(p_payload->>'max_score')::numeric,(p_payload->>'passing_score')::numeric,coalesce((p_payload->>'is_published')::boolean,false),v_uid) returning id into v_id;
  else
   update external_assessments set title=trim(p_payload->>'title'),instructions=coalesce(p_payload->>'instructions',''),destination=p_payload->>'destination',due_at=nullif(p_payload->>'due_at','')::timestamptz,is_published=coalesce((p_payload->>'is_published')::boolean,false) where id=p_id returning id into v_id;
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
-- Keep the original certificate checks and add verified external results.
alter function public.issue_course_certificate(uuid) rename to issue_native_certificate;
revoke all on function public.issue_native_certificate(uuid) from public,anon,authenticated;
create function public.issue_course_certificate(p_course_id uuid) returns uuid language plpgsql security definer set search_path=public as $$
declare v_uid uuid:=public.require_active_session();begin
 if not public.is_student() or not public.is_enrolled(p_course_id) then raise exception 'Access denied.';end if;
 if exists(select 1 from external_assessments a where a.course_id=p_course_id and a.is_published and not exists(select 1 from external_submissions s where s.assessment_id=a.id and s.student_id=v_uid and s.status='graded' and s.results_published and s.score>=a.max_score*a.passing_score/100)) then raise exception 'Pass all published external assessments after results are released.';end if;
 return public.issue_native_certificate(p_course_id);
end $$;
-- A graded record must have a real score even when clients bypass the UI.
create or replace function public.validate_submission_score() returns trigger language plpgsql set search_path=public as $$
begin if new.status='graded' and (new.score is null or new.score<0 or new.score>(select max_score from assignments where id=new.assignment_id)) then raise exception 'A graded submission requires a valid score.';end if;return new;end $$;
create trigger validate_submission_score before insert or update on public.assignment_submissions for each row execute function public.validate_submission_score();
revoke all on function public.validate_submission_score() from public,anon,authenticated;
do $$ declare f text;begin foreach f in array array['assessment_workspace(text)','assessment_action(text,uuid,jsonb)','issue_course_certificate(uuid)'] loop execute 'revoke all on function public.'||f||' from public,anon,authenticated';execute 'grant execute on function public.'||f||' to authenticated';end loop;end $$;

create table public.ican_curriculum_templates (
 code text primary key, title text not null, level text not null, modules jsonb not null
);
alter table public.ican_curriculum_templates enable row level security;
revoke all on public.ican_curriculum_templates from public,anon,authenticated;
grant select on public.ican_curriculum_templates to authenticated;
create policy curriculum_read on public.ican_curriculum_templates for select to authenticated using(public.is_active_account());
insert into public.ican_curriculum_templates(code,title,level,modules) select x->>'code',x->>'title',x->>'level',x->'modules' from jsonb_array_elements('[{"code":"F1","title":"Financial Accounting","level":"Foundation","modules":[]},{"code":"F2","title":"Business Management","level":"Foundation","modules":[]},{"code":"F3","title":"Business Law","level":"Foundation","modules":[]},{"code":"F4","title":"Economics","level":"Foundation","modules":[]},{"code":"S1","title":"Financial Reporting","level":"Skills","modules":[]},{"code":"S2","title":"Audit & Assurance","level":"Skills","modules":[]},{"code":"S3","title":"Taxation","level":"Skills","modules":[]},{"code":"S4","title":"Management Accounting","level":"Skills","modules":[]},{"code":"S5","title":"Performance Management","level":"Skills","modules":[]},{"code":"P1","title":"Advanced Financial Reporting","level":"Professional","modules":[]},{"code":"P2","title":"Advanced Audit & Assurance","level":"Professional","modules":[]},{"code":"P3","title":"Advanced Taxation","level":"Professional","modules":[{"title":"Introduction to advanced taxation","lessons":["The Nigerian tax framework and administering agencies","Scope of income tax: persons, companies and partnerships","Residence and the incidence of tax","Tax planning: legal and illegal, and where the line sits"]},{"title":"Personal income tax","lessons":["Residence and the basis of charge to personal income tax","Emolument and the consolidation of employment income","Deductibility of reliefs and statutory allowances","Minimum tax and the tax-neutral threshold"]},{"title":"Companies income tax","lessons":["Residence, source and the worldwide/territorial debate","Taxable profits and the treatment of capital items","Loss relief, including capital losses and group relief","Capital allowances and investment allowances"]},{"title":"Capital gains tax","lessons":["The charge and the computation of capital gains","Allowable and restriction costs","Primary and secondary residence relief","Company and share disposals"]},{"title":"Value added tax","lessons":["The VAT regime, registration and taxable supplies","Input and output tax, and the time of supply","Exempt and zero-rated supplies","VAT return preparation and the tax audit"]},{"title":"Withholding tax and PAYE","lessons":["The withholding tax regime and final withholding","Computation and remittance","PAYE: the scheme, deductions and monthly returns"]},{"title":"International taxation","lessons":["Residence and source conflicts","Double taxation agreements and relief","Transfer pricing and related party transactions","Withholding on non-resident payments"]},{"title":"Tax administration & practice","lessons":["The Federal Inland Revenue Service and its powers","Assessment, objection and appeal procedure","Penalties, interest and remission","Professional ethics for tax practitioners"]}]},{"code":"P4","title":"Advanced Management Accounting","level":"Professional","modules":[]},{"code":"P5","title":"Strategic Corporate Reporting","level":"Professional","modules":[]}]'::jsonb) x;
create function public.import_ican_curriculum(p_tutor uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_uid uuid:=public.require_active_session();t ican_curriculum_templates;m jsonb;l jsonb;c uuid;mid uuid;pos integer;lp integer;n integer:=0;
begin
 if not public.is_admin() or not exists(select 1 from profiles where id=p_tutor and role='tutor' and status='active') then raise exception 'Choose an active tutor as administrator.' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtext('ican-curriculum-import'));
 for t in select * from ican_curriculum_templates order by code loop
  if exists(select 1 from courses where code=t.code) then continue;end if;
  insert into courses(code,title,level,description) values(t.code,t.title,t.level,'ICAN '||t.level||' examination preparation. Curriculum imported from the existing marketing page.') returning id into c;
  insert into course_tutors(course_id,user_id,assigned_by) values(c,p_tutor,v_uid);
  pos:=0;for m in select * from jsonb_array_elements(t.modules) loop pos:=pos+1;
   insert into modules(course_id,title,position) values(c,m->>'title',pos) returning id into mid;
   lp:=0;for l in select * from jsonb_array_elements(m->'lessons') loop lp:=lp+1;
    insert into lessons(module_id,course_id,title,position,is_published) values(mid,c,l#>>'{}',lp,false);
   end loop;
  end loop;n:=n+1;
 end loop;
 perform public.log_audit('ican_curriculum_imported','profile',p_tutor,jsonb_build_object('courses',n));return jsonb_build_object('created',n);
end $$;
revoke all on function public.import_ican_curriculum(uuid) from public,anon;
grant execute on function public.import_ican_curriculum(uuid) to authenticated;
create function public.learning_performance() returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_uid uuid:=public.require_active_session();begin
 return jsonb_build_object(
 'quizzes',coalesce((select jsonb_agg(to_jsonb(x)) from (select a.id,a.student_id,p.full_name as student,c.title as course,q.title,a.status,a.percentage,a.passed,a.submitted_at from quiz_attempts a join quizzes q on q.id=a.quiz_id join courses c on c.id=q.course_id join profiles p on p.id=a.student_id where a.student_id=v_uid or public.manages_course(q.course_id) order by a.submitted_at desc nulls last limit 1000)x),'[]'),
 'assignments',coalesce((select jsonb_agg(to_jsonb(x)) from (select s.id,s.student_id,p.full_name as student,c.title as course,a.title,s.status,s.submitted_at,case when public.manages_course(a.course_id) or a.results_published then s.score else null end as score,a.max_score,a.results_published,case when public.manages_course(a.course_id) or a.results_published then s.feedback else null end as feedback from assignment_submissions s join assignments a on a.id=s.assignment_id join courses c on c.id=a.course_id join profiles p on p.id=s.student_id where s.student_id=v_uid or public.manages_course(a.course_id) order by s.submitted_at desc limit 1000)x),'[]'));
end $$;
revoke all on function public.learning_performance() from public,anon;
grant execute on function public.learning_performance() to authenticated;
-- Full recent activity, scoped exactly as before, with a useful history bound.

create or replace function public.tutor_student_activity()
returns setof jsonb
language sql
stable
security definer
set search_path = public
as $$
  with mine as (
    select c.id, c.title
      from public.courses c
     where c.created_by = auth.uid()
        or exists (select 1 from public.course_tutors ct
                    where ct.course_id = c.id and ct.user_id = auth.uid())
  ),
  events as (
    select s.student_id,
           s.submitted_at as occurred_at,
           'submitted “' || a.title || '”' as action,
           m.title as course_title
      from public.assignment_submissions s
      join public.assignments a on a.id = s.assignment_id
      join mine m on m.id = a.course_id
     where s.status = 'submitted'

    union all
    select s.student_id,
           s.graded_at,
           'had “' || a.title || '” marked',
           m.title
      from public.assignment_submissions s
      join public.assignments a on a.id = s.assignment_id
      join mine m on m.id = a.course_id
     where s.status = 'graded' and s.graded_at is not null

    union all
    select qa.student_id,
           qa.submitted_at,
           'submitted the quiz “' || q.title || '”',
           m.title
      from public.quiz_attempts qa
      join public.quizzes q on q.id = qa.quiz_id
      join mine m on m.id = q.course_id
     where qa.status in ('submitted', 'graded')
       and qa.submitted_at is not null

    union all
    select e.student_id,
           e.enrolled_at,
           'enrolled in this course',
           m.title
      from public.course_enrollments e
      join mine m on m.id = e.course_id
  )
  select jsonb_build_object(
    'student_id', e.student_id,
    'student_name', coalesce(p.full_name, 'A student'),
    'course_title', e.course_title,
    'action', e.action,
    'occurred_at', e.occurred_at
  )
  from events e
  left join public.profiles p on p.id = e.student_id
  where e.occurred_at is not null
  order by e.occurred_at desc
  limit 200;
$$;

-- Apply the level filter before pagination in the enrolled-user catalogue.
create function public.student_course_catalogue(p_query text default '',p_level text default '',p_page integer default 1)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_uid uuid:=public.require_active_session();begin
 if length(p_query)>200 or p_page<1 or p_page>10000 or p_level not in ('','Foundation','Skills','Professional') then raise exception 'Invalid search.';end if;
 return jsonb_build_object('total',(select count(*) from courses c where c.status='published' and (p_level='' or c.level=p_level) and (p_query='' or c.title ilike '%'||p_query||'%')),
 'courses',coalesce((select jsonb_agg(to_jsonb(x)) from (select c.id,c.title,c.description,c.level,c.thumbnail_url from courses c where c.status='published' and (p_level='' or c.level=p_level) and (p_query='' or c.title ilike '%'||p_query||'%') order by c.code nulls last,c.id limit 12 offset (p_page-1)*12)x),'[]'));
end $$;
revoke all on function public.student_course_catalogue(text,text,integer) from public,anon;
grant execute on function public.student_course_catalogue(text,text,integer) to authenticated;
