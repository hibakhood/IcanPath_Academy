-- =============================================================================
-- CharterPath LMS — 0003 authorisation helpers
--
-- Every RLS policy in 0007 is built out of these. They are SECURITY DEFINER so
-- that a policy on `profiles` can ask "what role does this user hold?" without
-- recursing back into the profiles policies; the read happens as the definer,
-- and the function itself re-derives the subject from auth.uid() every time, so
-- there is no way to ask about anybody else.
--
-- They are VOLATILE, not STABLE, and that is load-bearing. An
-- `insert(...).select(...)` checks the row it just wrote against the table's
-- SELECT policy, and a STABLE function would be evaluated against the snapshot
-- taken at the start of the statement — before that row existed. Marking them
-- stable makes every `insert().select()` in the app fail with "violates row-level
-- security policy", so they must see the current statement's writes.
-- =============================================================================

create or replace function public.current_role()
returns public.app_role
language sql
volatile
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

-- Role checks also require an active account. Without that, a tutor who applied
-- but is still pending -- or an account an admin has suspended -- keeps every
-- write permission its role implies.
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

create or replace function public.is_tutor()
returns boolean
language sql
volatile
security definer
set search_path = public
as $$
  select coalesce((select role = 'tutor' and status = 'active'
                     from public.profiles where id = auth.uid()), false);
$$;

create or replace function public.is_student()
returns boolean
language sql
volatile
security definer
set search_path = public
as $$
  select coalesce((select role = 'student' and status = 'active'
                     from public.profiles where id = auth.uid()), false);
$$;

-- Active = may use the LMS. Pending tutors and suspended accounts are not.
create or replace function public.is_active_account()
returns boolean
language sql
volatile
security definer
set search_path = public
as $$
  select coalesce((select status = 'active' from public.profiles where id = auth.uid()), false);
$$;

-- True when the caller may read the course's content: it is published, or the
-- caller owns it, is assigned to teach it, or is an admin.
create or replace function public.can_view_course(p_course_id uuid)
returns boolean
language sql
volatile
security definer
set search_path = public
as $$
  select
    public.is_active_account()
    and (
      public.is_admin()
      or exists (
        select 1 from public.courses c
        where c.id = p_course_id
          and (c.status = 'published' or c.created_by = auth.uid())
      )
      or exists (
        select 1 from public.course_tutors ct
        where ct.course_id = p_course_id and ct.user_id = auth.uid()
      )
    );
$$;

-- True only for a tutor who created or is explicitly assigned to the course.
-- Spec 28: Tutor A must never be able to modify Tutor B's course.
create or replace function public.manages_course(p_course_id uuid)
returns boolean
language sql
volatile
security definer
set search_path = public
as $$
  -- Gated on is_tutor() so a pending applicant or a suspended account cannot
  -- reach a course through course_tutors either.
  select
    public.is_admin()
    or (
      public.is_tutor()
      and (
        exists (
          select 1 from public.courses c
          where c.id = p_course_id and c.created_by = auth.uid()
        )
        or exists (
          select 1 from public.course_tutors ct
          where ct.course_id = p_course_id and ct.user_id = auth.uid()
        )
      )
    );
$$;

create or replace function public.is_enrolled(p_course_id uuid)
returns boolean
language sql
volatile
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.course_enrollments e
    where e.course_id = p_course_id
      and e.student_id = auth.uid()
      and e.status = 'active'
  ) and public.is_active_account();
$$;

-- May the caller open protected material for this course? Enrolled students,
-- the teaching tutors, or an admin — but not merely because they know the id.
create or replace function public.can_access_course_content(p_course_id uuid)
returns boolean
language sql
volatile
security definer
set search_path = public
as $$
  select public.manages_course(p_course_id) or public.is_enrolled(p_course_id);
$$;
