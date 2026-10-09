-- =============================================================================
-- CharterPath LMS — 0001 foundations
-- Enums and the helpers that do not depend on any table.
--
-- The authorisation helpers that read `profiles` live in 0003, after the tables
-- exist, because Postgres validates a function body when it is created.
--
-- gen_random_uuid() is part of core from PostgreSQL 13 onwards, so no extension
-- is required here.
-- =============================================================================

-- ---------------------------------------------------------------- enums -----

do $$ begin
  create type public.app_role as enum ('student', 'tutor', 'admin');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.account_status as enum ('pending', 'active', 'suspended');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.course_status as enum ('draft', 'pending_review', 'published', 'archived');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.live_class_status as enum ('scheduled', 'live', 'completed', 'cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.live_platform as enum ('youtube_live', 'google_meet', 'zoom');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.material_type as enum (
    'lecture_note', 'practice_questions', 'solution', 'presentation', 'additional_resource'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.quiz_attempt_status as enum ('in_progress', 'submitted', 'graded');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.submission_status as enum ('submitted', 'graded');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.enrollment_status as enum ('active', 'completed', 'cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.announcement_audience as enum ('all', 'students', 'tutors', 'admins');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.announcement_status as enum ('draft', 'scheduled', 'published', 'archived');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.tutor_application_status as enum ('pending', 'approved', 'rejected');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.notification_type as enum (
    'enrollment', 'lesson_published', 'live_class_scheduled', 'live_class_reminder',
    'quiz_available', 'assignment_created', 'announcement', 'quiz_result',
    'assignment_graded', 'account', 'course_status'
  );
exception when duplicate_object then null; end $$;

-- -------------------------------------------------------------- helpers -----

-- The signed-in user's id, or null. Wrapped so policies read clearly.
create or replace function public.current_user_id()
returns uuid
language sql
stable
as $$
  select auth.uid();
$$;

-- YouTube id from any of the URL shapes a tutor might paste. Pure string work,
-- so it is immutable and safe to use from a trigger or a check constraint.
create or replace function public.youtube_id_from_url(p_url text)
returns text
language sql
immutable
as $$
  select nullif(
    (
      case
        when p_url ~* 'youtu\.be/([A-Za-z0-9_-]{11})'
          then substring(p_url from 'youtu\.be/([A-Za-z0-9_-]{11})')
        when p_url ~* '[?&]v=([A-Za-z0-9_-]{11})'
          then substring(p_url from '[?&]v=([A-Za-z0-9_-]{11})')
        when p_url ~* 'youtube\.com/(embed|shorts|live|v)/([A-Za-z0-9_-]{11})'
          then substring(p_url from 'youtube\.com/(?:embed|shorts|live|v)/([A-Za-z0-9_-]{11})')
        when p_url ~* '^[A-Za-z0-9_-]{11}$'
          then p_url
        else null
      end
    ),
    ''
  );
$$;
