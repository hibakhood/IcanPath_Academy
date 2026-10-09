-- =============================================================================
-- CharterPath LMS — 0002 tables
--
-- The hierarchy from spec 1: admin manages tutors, tutor creates course ->
-- module -> lesson -> (recorded video | live class | learning material) ->
-- student -> progress/quiz/assignment -> result.
-- =============================================================================

-- ------------------------------------------------------------- identity -----

create table public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  role          public.app_role not null default 'student',
  status        public.account_status not null default 'active',
  full_name     text,
  phone         text,
  avatar_url    text,
  -- Student track shown on dashboards (foundation | skills | professional).
  level         text,
  -- Set when an admin suspends an account, shown in the LMS.
  status_note   text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table public.tutor_applications (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null unique references public.profiles (id) on delete cascade,
  status        public.tutor_application_status not null default 'pending',
  headline      text,
  bio           text,
  specialties   text[] not null default '{}',
  reviewed_by   uuid references public.profiles (id) on delete set null,
  reviewed_at   timestamptz,
  review_note   text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- -------------------------------------------------------------- content -----

create table public.courses (
  id            uuid primary key default gen_random_uuid(),
  code          text,
  title         text not null,
  description   text,
  level         text,
  plan          text,
  thumbnail_url text,
  status        public.course_status not null default 'draft',
  created_by    uuid not null references public.profiles (id) on delete restrict,
  submitted_at  timestamptz,
  reviewed_by   uuid references public.profiles (id) on delete set null,
  reviewed_at   timestamptz,
  published_at  timestamptz,
  archived_at   timestamptz,
  review_note   text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Spec 28: a tutor may manage a course they were explicitly assigned to.
create table public.course_tutors (
  course_id     uuid not null references public.courses (id) on delete cascade,
  user_id       uuid not null references public.profiles (id) on delete cascade,
  assigned_by   uuid references public.profiles (id) on delete set null,
  assigned_at   timestamptz not null default now(),
  primary key (course_id, user_id)
);

create table public.modules (
  id            uuid primary key default gen_random_uuid(),
  course_id     uuid not null references public.courses (id) on delete cascade,
  title         text not null,
  position      integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table public.lessons (
  id                   uuid primary key default gen_random_uuid(),
  module_id            uuid not null references public.modules (id) on delete cascade,
  -- Denormalised from the module so every RLS policy can check enrolment with a
  -- single index lookup instead of a join back through modules.
  course_id            uuid not null references public.courses (id) on delete cascade,
  title                text not null,
  description          text,
  position             integer not null default 0,
  -- YouTube only. Spec 31: never upload video to Supabase Storage.
  youtube_video_url    text,
  youtube_video_id     text,
  is_published         boolean not null default false,
  published_at         timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint lessons_youtube_url_is_parsable
    check (youtube_video_url is null or public.youtube_id_from_url(youtube_video_url) is not null)
);

-- Spec 17/34: Google Drive resources. The Drive URL is stored as an object in
-- the private `lms-private` bucket; only the path lives here, and turning that
-- path into a usable link requires a signed URL the storage policies gate.
create table public.lesson_materials (
  id            uuid primary key default gen_random_uuid(),
  lesson_id     uuid not null references public.lessons (id) on delete cascade,
  course_id     uuid not null references public.courses (id) on delete cascade,
  title         text not null,
  type          public.material_type not null default 'lecture_note',
  storage_path  text not null,
  description   text,
  position      integer not null default 0,
  created_by    uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table public.live_classes (
  id                   uuid primary key default gen_random_uuid(),
  course_id            uuid not null references public.courses (id) on delete cascade,
  lesson_id            uuid references public.lessons (id) on delete set null,
  created_by           uuid references public.profiles (id) on delete set null,
  title                text not null,
  platform             public.live_platform not null,
  -- Spec 14/16: a path in the private bucket, never the raw meeting URL. The URL
  -- itself lives in storage so it cannot be read out of this table.
  meeting_storage_path text not null,
  scheduled_date       date not null,
  start_time           time not null,
  end_time             time not null,
  status               public.live_class_status not null default 'scheduled',
  -- Spec 33: tutor attaches a recording after the class.
  recording_youtube_url text,
  recording_youtube_id  text,
  notes                text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint live_classes_time_order check (end_time > start_time),
  constraint live_classes_recording_is_parsable
    check (recording_youtube_url is null or public.youtube_id_from_url(recording_youtube_url) is not null)
);

-- --------------------------------------------------------- student state ----

create table public.course_enrollments (
  id                uuid primary key default gen_random_uuid(),
  course_id         uuid not null references public.courses (id) on delete cascade,
  student_id        uuid not null references public.profiles (id) on delete cascade,
  status            public.enrollment_status not null default 'active',
  enrolled_at       timestamptz not null default now(),
  last_activity_at  timestamptz,
  -- Spec 57 / 47: one enrolment per student per course, enforced by the database.
  unique (course_id, student_id)
);

-- Spec 10: one progress row per student per lesson. completed_at and
-- progress_percentage are maintained by RPC, never by the client.
create table public.lesson_progress (
  id                   uuid primary key default gen_random_uuid(),
  student_id           uuid not null references public.profiles (id) on delete cascade,
  lesson_id            uuid not null references public.lessons (id) on delete cascade,
  course_id            uuid not null references public.courses (id) on delete cascade,
  completed            boolean not null default false,
  completed_at         timestamptz,
  progress_percentage  integer not null default 0,
  updated_at           timestamptz not null default now(),
  unique (student_id, lesson_id),
  constraint lesson_progress_percentage_range
    check (progress_percentage between 0 and 100)
);

-- ---------------------------------------------------------- assessment ------

create table public.quizzes (
  id                  uuid primary key default gen_random_uuid(),
  course_id           uuid not null references public.courses (id) on delete cascade,
  lesson_id           uuid references public.lessons (id) on delete set null,
  created_by          uuid references public.profiles (id) on delete set null,
  title               text not null,
  instructions        text,
  time_limit_minutes  integer,
  passing_score       integer not null default 50,
  attempt_limit       integer not null default 1,
  due_at              timestamptz,
  is_published        boolean not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint quizzes_passing_score_range check (passing_score between 0 and 100),
  constraint quizzes_attempt_limit_positive check (attempt_limit >= 1)
);

create table public.quiz_questions (
  id              uuid primary key default gen_random_uuid(),
  quiz_id         uuid not null references public.quizzes (id) on delete cascade,
  position        integer not null default 0,
  prompt          text not null,
  question_type   text not null default 'mcq',
  options         jsonb,
  correct_answer  text not null,
  explanation     text,
  points          integer not null default 1,
  constraint quiz_questions_type_valid
    check (question_type in ('mcq', 'true_false', 'short_answer')),
  constraint quiz_questions_mcq_has_options
    check (question_type <> 'mcq' or (options is not null and jsonb_array_length(options) > 0))
);

-- Spec 18: an attempt is created by start_quiz_attempt() and graded by
-- submit_quiz_attempt(). score/max_score/percentage/passed are never written by
-- a client (see the column grants in 0005).
create table public.quiz_attempts (
  id              uuid primary key default gen_random_uuid(),
  quiz_id         uuid not null references public.quizzes (id) on delete cascade,
  student_id      uuid not null references public.profiles (id) on delete cascade,
  attempt_number  integer not null,
  started_at      timestamptz not null default now(),
  submitted_at    timestamptz,
  status          public.quiz_attempt_status not null default 'in_progress',
  score           numeric,
  max_score       numeric,
  percentage      numeric,
  passed          boolean,
  unique (quiz_id, student_id, attempt_number)
);

create table public.quiz_answers (
  id              uuid primary key default gen_random_uuid(),
  attempt_id      uuid not null references public.quiz_attempts (id) on delete cascade,
  question_id     uuid not null references public.quiz_questions (id) on delete cascade,
  answer          text not null,
  is_correct      boolean not null default false,
  points_awarded  numeric not null default 0,
  unique (attempt_id, question_id)
);

create table public.assignments (
  id                  uuid primary key default gen_random_uuid(),
  course_id           uuid not null references public.courses (id) on delete cascade,
  lesson_id           uuid references public.lessons (id) on delete set null,
  created_by          uuid references public.profiles (id) on delete set null,
  title               text not null,
  instructions        text,
  due_at              timestamptz,
  max_score           numeric not null default 100,
  is_published        boolean not null default false,
  -- Spec 20/36: results are hidden from students until the tutor publishes.
  results_published   boolean not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create table public.assignment_submissions (
  id                     uuid primary key default gen_random_uuid(),
  assignment_id          uuid not null references public.assignments (id) on delete cascade,
  student_id             uuid not null references public.profiles (id) on delete cascade,
  response_text          text,
  response_storage_path  text,
  submitted_at           timestamptz not null default now(),
  status                 public.submission_status not null default 'submitted',
  score                  numeric,
  feedback               text,
  graded_by              uuid references public.profiles (id) on delete set null,
  graded_at              timestamptz,
  unique (assignment_id, student_id),
  constraint assignment_submissions_has_response
    check (response_text is not null or response_storage_path is not null)
);

-- ------------------------------------------------- comms and governance -----

create table public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  type        public.notification_type not null default 'account',
  title       text not null,
  body        text,
  -- Spec 51: where the bell takes you when the notification is opened.
  link_path   text,
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);

create table public.announcements (
  id             uuid primary key default gen_random_uuid(),
  title          text not null,
  body           text,
  audience       public.announcement_audience not null default 'all',
  status         public.announcement_status not null default 'draft',
  scheduled_for  timestamptz,
  published_at   timestamptz,
  created_by     uuid references public.profiles (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- Spec 45. Append-only: insert is revoked from every client role (0005) so rows
-- can only come from the audit triggers and the SECURITY DEFINER functions.
create table public.audit_logs (
  id             uuid primary key default gen_random_uuid(),
  actor_id       uuid references public.profiles (id) on delete set null,
  action         text not null,
  resource_type  text not null,
  resource_id    uuid,
  metadata       jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now()
);

-- -------------------------------------------------------------- indexes -----

create index profiles_role_idx            on public.profiles (role);
create index profiles_status_idx          on public.profiles (status);
create index tutor_applications_status_idx on public.tutor_applications (status);

create index courses_status_idx           on public.courses (status);
create index courses_created_by_idx       on public.courses (created_by);
create index course_tutors_user_idx       on public.course_tutors (user_id);

create index modules_course_position_idx  on public.modules (course_id, position);
create index lessons_module_position_idx  on public.lessons (module_id, position);
create index lessons_course_idx           on public.lessons (course_id);
create index lessons_published_idx        on public.lessons (course_id) where is_published;

create index lesson_materials_lesson_idx   on public.lesson_materials (lesson_id);
create index lesson_materials_course_idx   on public.lesson_materials (course_id);

create index live_classes_course_idx      on public.live_classes (course_id);
create index live_classes_lesson_idx      on public.live_classes (lesson_id);
create index live_classes_scheduled_idx   on public.live_classes (scheduled_date, start_time);
create index live_classes_status_idx      on public.live_classes (status);

create index course_enrollments_student_idx on public.course_enrollments (student_id, status);
create index course_enrollments_course_idx  on public.course_enrollments (course_id);

create index lesson_progress_student_idx   on public.lesson_progress (student_id);
create index lesson_progress_course_idx    on public.lesson_progress (course_id, student_id);

create index quizzes_course_idx            on public.quizzes (course_id);
create index quizzes_published_idx         on public.quizzes (course_id) where is_published;
create index quiz_questions_quiz_idx       on public.quiz_questions (quiz_id, position);
create index quiz_attempts_quiz_student_idx on public.quiz_attempts (quiz_id, student_id);
create index quiz_attempts_student_idx     on public.quiz_attempts (student_id);
create index quiz_answers_attempt_idx      on public.quiz_answers (attempt_id);

create index assignments_course_idx        on public.assignments (course_id);
create index assignments_due_idx           on public.assignments (due_at);
create index assignment_submissions_assignment_idx on public.assignment_submissions (assignment_id);
create index assignment_submissions_student_idx    on public.assignment_submissions (student_id);

create index notifications_user_unread_idx on public.notifications (user_id, read_at);
create index notifications_user_recent_idx on public.notifications (user_id, created_at desc);
create index announcements_status_idx      on public.announcements (status);

create index audit_logs_created_idx        on public.audit_logs (created_at desc);
create index audit_logs_actor_idx          on public.audit_logs (actor_id);
create index audit_logs_resource_idx       on public.audit_logs (resource_type, resource_id);
