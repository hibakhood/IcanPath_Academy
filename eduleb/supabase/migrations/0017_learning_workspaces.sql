-- Role dashboards: private questions/reviews, earned certificates and tutor earnings.
create table public.course_questions (
 id uuid primary key default gen_random_uuid(), course_id uuid not null references public.courses(id) on delete cascade,
 lesson_id uuid references public.lessons(id) on delete set null, student_id uuid not null references public.profiles(id),
 question text not null check(length(question) between 10 and 2000), answer text check(length(answer) between 1 and 5000),
 answered_by uuid references public.profiles(id), answered_at timestamptz, created_at timestamptz not null default now()
);
create table public.course_reviews (
 id uuid primary key default gen_random_uuid(), course_id uuid not null references public.courses(id) on delete cascade,
 student_id uuid not null references public.profiles(id), rating integer not null check(rating between 1 and 5),
 body text not null check(length(body) between 10 and 2000), tutor_reply text check(length(tutor_reply) between 1 and 2000),
 replied_by uuid references public.profiles(id), replied_at timestamptz, created_at timestamptz not null default now(),
 unique(course_id,student_id)
);
create table public.quiz_attempt_reviews (
 id uuid primary key default gen_random_uuid(), attempt_id uuid not null unique references public.quiz_attempts(id) on delete cascade,
 status text not null default 'pending' check(status in ('pending','reviewed')), note text check(length(note)<=2000),
 reviewed_by uuid references public.profiles(id), reviewed_at timestamptz, created_at timestamptz not null default now()
);
create table public.course_certificates (
 id uuid primary key default gen_random_uuid(), student_id uuid not null references public.profiles(id),
 course_id uuid not null references public.courses(id), learner_name text not null, course_title text not null,
 issued_at timestamptz not null default now(), unique(student_id,course_id)
);
create table public.tutor_earning_entries (
 id uuid primary key default gen_random_uuid(), tutor_id uuid not null references public.profiles(id),
 payment_id uuid references public.payment_ledger(id), original_entry_id uuid references public.tutor_earning_entries(id),
 kind text not null check(kind in ('earning','reversal','payout')), amount_minor bigint not null check(amount_minor>0 and amount_minor<=100000000000),
 currency text not null default 'NGN' check(currency='NGN'), reference text not null unique check(length(reference) between 3 and 120),
 note text check(length(note)<=1000), recorded_by uuid not null references public.profiles(id), created_at timestamptz not null default now(),
 check((kind='earning' and payment_id is not null and original_entry_id is null) or (kind='reversal' and original_entry_id is not null and payment_id is null) or (kind='payout' and payment_id is null and original_entry_id is null))
);
create table public.learning_events (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id),
 course_id uuid not null references public.courses(id) on delete cascade,
 live_class_id uuid references public.live_classes(id) on delete set null,
 kind text not null check(kind='class_joined'), created_at timestamptz not null default now()
);
create index questions_queue_idx on public.course_questions(course_id,created_at desc);
create index reviews_course_idx on public.course_reviews(course_id,created_at desc);
create index quiz_reviews_pending_idx on public.quiz_attempt_reviews(status,created_at desc);
create index certificate_owner_idx on public.course_certificates(student_id,issued_at desc);
create index earnings_tutor_idx on public.tutor_earning_entries(tutor_id,created_at desc);
create index learning_events_owner_idx on public.learning_events(user_id,created_at desc);
do $$ declare t text;begin foreach t in array array['course_questions','course_reviews','quiz_attempt_reviews','course_certificates','tutor_earning_entries','learning_events'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated',t);
 end loop;end $$;
grant select on public.course_questions,public.course_reviews,public.quiz_attempt_reviews,public.course_certificates,public.tutor_earning_entries,public.learning_events to authenticated;
create policy questions_read on public.course_questions for select to authenticated using(public.is_active_account() and (student_id=auth.uid() or public.manages_course(course_id)));
create policy reviews_read on public.course_reviews for select to authenticated using(public.is_active_account() and (student_id=auth.uid() or public.manages_course(course_id)));
create or replace function public.manages_quiz_attempt(p_attempt uuid) returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.quiz_attempts a join public.quizzes q on q.id=a.quiz_id where a.id=p_attempt and public.manages_course(q.course_id));
$$;
revoke all on function public.manages_quiz_attempt(uuid) from public,anon;
grant execute on function public.manages_quiz_attempt(uuid) to authenticated;
create policy quiz_reviews_read on public.quiz_attempt_reviews for select to authenticated using(public.manages_quiz_attempt(attempt_id));
create policy certificates_read on public.course_certificates for select to authenticated using(public.is_active_account() and (student_id=auth.uid() or public.manages_course(course_id)));
create policy earnings_read on public.tutor_earning_entries for select to authenticated using(public.is_admin() or (public.is_tutor() and tutor_id=auth.uid()));
create policy events_read on public.learning_events for select to authenticated using(public.is_active_account() and (user_id=auth.uid() or public.manages_course(course_id)));
create or replace function public.queue_quiz_review() returns trigger language plpgsql security definer set search_path=public as $$
begin if new.status='graded' then insert into quiz_attempt_reviews(attempt_id) values(new.id) on conflict do nothing;end if;return new;end $$;
revoke all on function public.queue_quiz_review() from public,anon,authenticated;
create trigger quiz_attempt_review_queue after insert or update of status on public.quiz_attempts for each row execute function public.queue_quiz_review();
insert into public.quiz_attempt_reviews(attempt_id) select id from public.quiz_attempts where status='graded';
create or replace function public.learning_workspace() returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_uid uuid:=public.require_active_session();
begin return jsonb_build_object(
 'questions',coalesce((select jsonb_agg(to_jsonb(x)) from (select q.*,p.full_name as student,c.title as course from course_questions q join profiles p on p.id=q.student_id join courses c on c.id=q.course_id where q.student_id=v_uid or public.manages_course(q.course_id) order by q.created_at desc limit 100)x),'[]'),
 'reviews',coalesce((select jsonb_agg(to_jsonb(x)) from (select r.*,p.full_name as student,c.title as course from course_reviews r join profiles p on p.id=r.student_id join courses c on c.id=r.course_id where r.student_id=v_uid or public.manages_course(r.course_id) order by r.created_at desc limit 100)x),'[]'),
 'quiz_reviews',coalesce((select jsonb_agg(to_jsonb(x)) from (select r.*,q.title,p.full_name as student,a.score,a.percentage,q.course_id from quiz_attempt_reviews r join quiz_attempts a on a.id=r.attempt_id join quizzes q on q.id=a.quiz_id join profiles p on p.id=a.student_id where public.manages_course(q.course_id) order by r.created_at desc limit 100)x),'[]'),
 'certificates',coalesce((select jsonb_agg(to_jsonb(x)) from (select * from course_certificates where student_id=v_uid order by issued_at desc)x),'[]'),
 'earnings',coalesce((select jsonb_agg(to_jsonb(x)) from (select e.* from tutor_earning_entries e where (public.is_tutor() and tutor_id=v_uid) or public.is_admin() order by created_at desc limit 200)x),'[]'),
 'earned',(select coalesce(sum(case when kind='earning' then amount_minor when kind='reversal' then -amount_minor else 0 end),0)/100.0 from tutor_earning_entries where tutor_id=v_uid),
 'paid',(select coalesce(sum(amount_minor),0)/100.0 from tutor_earning_entries where tutor_id=v_uid and kind='payout'),
 'unanswered',(select count(*) from course_questions where answer is null and public.manages_course(course_id)),
 'pending_quiz_reviews',(select count(*) from quiz_attempt_reviews r join quiz_attempts a on a.id=r.attempt_id join quizzes q on q.id=a.quiz_id where r.status='pending' and public.manages_course(q.course_id)),
 'unreplied_reviews',(select count(*) from course_reviews where tutor_reply is null and public.manages_course(course_id)),
 'unread_messages',(select count(*) from inbox_messages where recipient_id=v_uid and read_at is null)
 );end $$;
create or replace function public.learning_action(p_action text,p_id uuid default null,p_payload jsonb default '{}') returns uuid language plpgsql security definer set search_path=public as $$
declare v_uid uuid:=public.require_active_session();v_id uuid;v_course uuid;
begin
 case p_action
 when 'question' then
  v_course:=(p_payload->>'course_id')::uuid;
  if not public.is_student() or not public.is_enrolled(v_course) then raise exception 'Access denied.' using errcode='42501';end if;
  if nullif(p_payload->>'lesson_id','') is not null and not exists(select 1 from lessons where id=(p_payload->>'lesson_id')::uuid and course_id=v_course and is_published) then raise exception 'Lesson unavailable.';end if;
  perform pg_advisory_xact_lock(hashtext(v_uid::text));
  if (select count(*) from course_questions where student_id=v_uid and created_at>now()-interval '1 hour')>=10 then raise exception 'Please try again later.';end if;
  insert into course_questions(course_id,lesson_id,student_id,question) values(v_course,nullif(p_payload->>'lesson_id','')::uuid,v_uid,trim(p_payload->>'question')) returning id into v_id;
 when 'review' then
  v_course:=(p_payload->>'course_id')::uuid;
  if not public.is_student() or not public.is_enrolled(v_course) then raise exception 'Access denied.' using errcode='42501';end if;
  insert into course_reviews(course_id,student_id,rating,body) values(v_course,v_uid,(p_payload->>'rating')::integer,trim(p_payload->>'body')) returning id into v_id;
 when 'answer' then
  if length(coalesce(trim(p_payload->>'answer'),''))<1 then raise exception 'Enter an answer.';end if;
  select course_id into v_course from course_questions where id=p_id for update;
  if not public.manages_course(v_course) then raise exception 'Access denied.' using errcode='42501';end if;
  update course_questions set answer=trim(p_payload->>'answer'),answered_by=v_uid,answered_at=now() where id=p_id returning id into v_id;
  insert into notifications(user_id,type,title,body,link_path) select student_id,'account','Your tutor answered your question',answer,'/student/questions/' from course_questions where id=p_id;
 when 'reply' then
  if length(coalesce(trim(p_payload->>'reply'),''))<1 then raise exception 'Enter a reply.';end if;
  select course_id into v_course from course_reviews where id=p_id for update;
  if not public.manages_course(v_course) then raise exception 'Access denied.' using errcode='42501';end if;
  update course_reviews set tutor_reply=trim(p_payload->>'reply'),replied_by=v_uid,replied_at=now() where id=p_id returning id into v_id;
 when 'quiz_review' then
  select q.course_id into v_course from quiz_attempt_reviews r join quiz_attempts a on a.id=r.attempt_id join quizzes q on q.id=a.quiz_id where r.id=p_id;
  if not public.manages_course(v_course) then raise exception 'Access denied.' using errcode='42501';end if;
  update quiz_attempt_reviews set status='reviewed',note=p_payload->>'note',reviewed_by=v_uid,reviewed_at=now() where id=p_id and status='pending' returning id into v_id;
  if v_id is null then raise exception 'Attempt already reviewed or unavailable.';end if;
 else raise exception 'Unknown action.';
 end case;
 perform public.log_audit('learning_'||p_action,'course',v_course,jsonb_build_object('id',v_id));return v_id;
end $$;
create or replace function public.issue_course_certificate(p_course_id uuid) returns uuid language plpgsql security definer set search_path=public as $$
declare v_uid uuid:=public.require_active_session();v_id uuid;
begin
 if not public.is_student() or not public.is_enrolled(p_course_id) then raise exception 'Access denied.' using errcode='42501';end if;
 if not exists(select 1 from courses where id=p_course_id and status='published') or not exists(select 1 from lessons where course_id=p_course_id and is_published) then raise exception 'Course is not ready for certification.';end if;
 if exists(select 1 from lessons l where course_id=p_course_id and is_published and not exists(select 1 from lesson_progress p where p.lesson_id=l.id and p.student_id=v_uid and p.completed)) or
 exists(select 1 from quizzes q where course_id=p_course_id and is_published and not exists(select 1 from quiz_attempts a where a.quiz_id=q.id and student_id=v_uid and status='graded' and passed)) or
 exists(select 1 from assignments a where course_id=p_course_id and is_published and (not results_published or not exists(select 1 from assignment_submissions s where assignment_id=a.id and student_id=v_uid and status='graded' and score>=a.max_score*0.5))) then raise exception 'Complete the lessons and pass all published assessments first.';end if;
 insert into course_certificates(student_id,course_id,learner_name,course_title) select v_uid,c.id,coalesce(p.full_name,'Learner'),c.title from courses c join profiles p on p.id=v_uid where c.id=p_course_id on conflict(student_id,course_id) do update set student_id=excluded.student_id returning id into v_id;
 perform public.log_audit('certificate_issued','course',p_course_id,jsonb_build_object('certificate',v_id));return v_id;
end $$;
create or replace function public.record_tutor_earning(p_tutor uuid,p_kind text,p_amount bigint,p_reference text,p_payment uuid default null,p_original uuid default null,p_note text default null) returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid;v_pay payment_ledger;v_original tutor_earning_entries;v_remaining bigint;
begin
 if not public.is_admin() then raise exception 'Access denied.' using errcode='42501';end if;
 if not exists(select 1 from profiles where id=p_tutor and role='tutor' and status='active') then raise exception 'Choose an active tutor.';end if;
 perform pg_advisory_xact_lock(hashtext(p_tutor::text));
 if p_kind='earning' then
  select * into v_pay from payment_ledger where id=p_payment for update;
  if v_pay.id is null or v_pay.kind<>'payment' then raise exception 'Choose a verified payment.';end if;
  if v_pay.course_id is null or not exists(select 1 from courses where id=v_pay.course_id and created_by=p_tutor union all select 1 from course_tutors where course_id=v_pay.course_id and user_id=p_tutor) then raise exception 'Tutor must teach the payment course.';end if;
  select v_pay.amount_minor-coalesce(sum(amount_minor),0) into v_remaining from tutor_earning_entries where payment_id=p_payment and kind='earning';
 elsif p_kind='reversal' then
  select * into v_original from tutor_earning_entries where id=p_original and tutor_id=p_tutor and kind='earning' for update;
  if v_original.id is null then raise exception 'Choose an earning to reverse.';end if;
  select v_original.amount_minor-coalesce(sum(amount_minor),0) into v_remaining from tutor_earning_entries where original_entry_id=p_original;
 elsif p_kind='payout' then
  select coalesce(sum(case when kind='earning' then amount_minor else -amount_minor end),0) into v_remaining from tutor_earning_entries where tutor_id=p_tutor;
 else raise exception 'Invalid earning type.';end if;
 if p_amount is null or p_amount<=0 or p_amount>v_remaining then raise exception 'Amount exceeds the available balance.';end if;
 insert into tutor_earning_entries(tutor_id,payment_id,original_entry_id,kind,amount_minor,reference,note,recorded_by) values(p_tutor,p_payment,p_original,p_kind,p_amount,trim(p_reference),p_note,auth.uid()) returning id into v_id;
 perform public.log_audit('tutor_earning_recorded','profile',p_tutor,jsonb_build_object('entry',v_id));return v_id;
end $$;
create or replace function public.join_learning_class(p_class uuid) returns text language plpgsql security definer set search_path=public as $$
declare v_uid uuid:=public.require_active_session();v_class live_classes;v_url text;
begin select * into v_class from live_classes where id=p_class;
 if not found or v_class.status not in ('scheduled','live') then raise exception 'Class unavailable.';end if;
 v_url:=public.resolve_learning_link(v_class.meeting_storage_path);
 insert into learning_events(user_id,course_id,live_class_id,kind) select v_uid,v_class.course_id,p_class,'class_joined' where not exists(select 1 from learning_events where user_id=v_uid and live_class_id=p_class and created_at>now()-interval '10 minutes');return v_url;
end $$;
create or replace function public.my_learning_activity() returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_uid uuid:=public.require_active_session();begin
 return coalesce((select jsonb_agg(to_jsonb(x)) from(
 select * from(
 select 'Lesson completed' as title,l.title as detail,p.completed_at as occurred_at,'book' as icon,'/student/lesson/?id='||l.id::text as href from lesson_progress p join lessons l on l.id=p.lesson_id where p.student_id=v_uid and p.completed
 union all select 'Quiz completed',q.title,a.submitted_at,'check-circle','/student/quiz/?id='||q.id::text from quiz_attempts a join quizzes q on q.id=a.quiz_id where student_id=v_uid and a.status='graded'
 union all select 'Assignment submitted',a.title,s.submitted_at,'edit','/student/assignments/' from assignment_submissions s join assignments a on a.id=s.assignment_id where student_id=v_uid
 union all select 'Live class joined',coalesce(l.title,'Live class'),e.created_at,'video','/student/live/' from learning_events e left join live_classes l on l.id=e.live_class_id where e.user_id=v_uid
 )a order by occurred_at desc limit 100)x),'[]');end $$;
create or replace function public.learning_search(p_term text) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_uid uuid:=public.require_active_session();begin
 if length(trim(p_term))<2 or length(p_term)>100 then return '[]';end if;
 return coalesce((select jsonb_agg(to_jsonb(x)) from(
 (select c.id,c.title,'course' as kind,c.id as course_id from courses c where c.title ilike '%'||p_term||'%' and (public.manages_course(c.id) or public.is_enrolled(c.id)) limit 15)
 union all (select l.id,l.title,'lesson',l.course_id from lessons l where l.title ilike '%'||p_term||'%' and (public.manages_course(l.course_id) or (l.is_published and public.is_enrolled(l.course_id))) limit 15)
 )x),'[]');end $$;
do $$ declare f text;begin foreach f in array array['learning_workspace()','learning_action(text,uuid,jsonb)','issue_course_certificate(uuid)','record_tutor_earning(uuid,text,bigint,text,uuid,uuid,text)','join_learning_class(uuid)','my_learning_activity()','learning_search(text)'] loop
 execute 'revoke all on function public.'||f||' from public,anon,authenticated';execute 'grant execute on function public.'||f||' to authenticated';
 end loop;end $$;
