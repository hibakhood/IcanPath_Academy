-- Trusted server only; public browser credentials cannot submit enquiries directly.
revoke execute on function public.submit_contact_message(text,text,text,text,text) from anon,authenticated,public;
grant execute on function public.submit_contact_message(text,text,text,text,text) to service_role;
create table public.contact_rate_limits (
 key text primary key check(length(key) between 1 and 150), window_start timestamptz not null, requests integer not null check(requests>0)
);
alter table public.contact_rate_limits enable row level security;
revoke all on public.contact_rate_limits from public,anon,authenticated;
create function public.submit_trusted_contact(p_source text,p_name text,p_email text,p_phone text,p_subject text,p_message text)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_key text; v_max integer; v_count integer; v_now timestamptz:=clock_timestamp();
begin
 if p_source !~ '^[a-f0-9]{64}$' or length(trim(p_name)) not between 2 and 120
 or length(p_email)>254 or p_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
 or length(coalesce(p_phone,''))>40 or length(trim(p_subject)) not between 1 and 200 or length(trim(p_message)) not between 10 and 5000
 then raise exception 'Invalid enquiry.' using errcode='22023';end if;
 -- Stable sorted lock order avoids deadlocks. Rejecting a request rolls back all counters.
 for v_key,v_max in select * from (values ('global',100),('ip:'||p_source,5),('email:'||md5(lower(trim(p_email))),3)) as limits(k,m) order by k loop
  insert into contact_rate_limits(key,window_start,requests) values(v_key,v_now,1)
  on conflict(key) do update set window_start=case when contact_rate_limits.window_start<=v_now-interval '10 minutes' then v_now else contact_rate_limits.window_start end,
   requests=case when contact_rate_limits.window_start<=v_now-interval '10 minutes' then 1 else contact_rate_limits.requests+1 end returning requests into v_count;
  if v_count>v_max then raise exception 'Please wait before sending another enquiry.' using errcode='P0001';end if;
 end loop;
 delete from contact_rate_limits where window_start<v_now-interval '1 day';
 return public.submit_contact_message(p_name,p_email,p_phone,p_subject,p_message);
end $$;
revoke all on function public.submit_trusted_contact(text,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.submit_trusted_contact(text,text,text,text,text,text) to service_role;
