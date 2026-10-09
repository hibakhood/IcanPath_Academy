-- =============================================================================
-- CharterPath LMS — demo data
--
-- Fills a project with enough real rows to walk every dashboard: accounts for
-- each role, published and draft courses, modules, lessons, materials, quizzes
-- with a graded attempt, assignments with a graded and a pending submission,
-- live classes, enrolments, progress, announcements and notifications.
--
--   Run it in the Supabase SQL editor, as the project owner.
--   It is safe to run more than once: every demo row is removed before it is
--   recreated, so edits here take effect on the next run.
--
-- Accounts are created directly in auth.users so the whole dataset is one
-- script. Every account gets the same password:
--
--   admin@charterpath.test      AdminPass!2026
--   tutor@charterpath.test      TutorPass!2026
--   kofi@charterpath.test       TutorPass!2026
--   pending@charterpath.test    TutorPass!2026   (awaits approval)
--   student@charterpath.test    StudentPass!2026
--   bello@charterpath.test       StudentPass!2026
--   cynthia@charterpath.test    StudentPass!2026
--   suspended@charterpath.test  StudentPass!2026 (suspended, for the notice page)
--
-- These are throwaway credentials for local review. Delete the accounts before
-- this project carries anything real.
--
-- Two notes on what this script cannot do:
--
--   1. Materials and live classes store a path into the private bucket, never
--      the file itself. The objects are uploaded by the tutor UI, so the seeded
--      rows point at paths whose content does not exist yet -- opening one asks
--      storage for an object it cannot find. Create a material through
--      /tutor/course/ to see the pointer upload work end to end.
--   2. Nothing here writes a privileged column. Courses go in as drafts because
--      guard_course_insert() forces that, and are published by calling the same
--      RPCs the app calls. Authorship comes from set_config('request.jwt.claim.sub')
--      so guard_course_insert() and guard_author_insert() record a real author
--      instead of null.
-- =============================================================================

begin;

-- bcrypt lives in pgcrypto, which a Supabase project already has. Guarded
-- because the function is what hashes the demo passwords.
do $$ begin
  create extension if not exists pgcrypto with schema extensions;
exception when others then
  raise notice 'pgcrypto is already present; continuing.';
end $$;

-- --------------------------------------------------------------- accounts ---

-- Profiles are created by the on_auth_user_created trigger, so the roles below
-- are set afterwards. Signup can only ever produce a student or a pending
-- tutor; an admin is granted by hand (see 0009_bootstrap.sql).
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
)
select
  '00000000-0000-0000-0000-000000000000',
  u.id,
  'authenticated',
  'authenticated',
  u.email,
  crypt(u.password, gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', u.full_name),
  now() - interval '60 days',
  now(),
  '',
  '',
  '',
  ''
from (values
  ('d1c0de00-0000-4000-8000-000000000001'::uuid, 'admin@charterpath.test',     'AdminPass!2026',   'Grace Owusu'),
  ('d1c0de00-0000-4000-8000-000000000002'::uuid, 'tutor@charterpath.test',     'TutorPass!2026',   'Ama Serwaa'),
  ('d1c0de00-0000-4000-8000-000000000003'::uuid, 'kofi@charterpath.test',      'TutorPass!2026',   'Kofi Mensah'),
  ('d1c0de00-0000-4000-8000-000000000004'::uuid, 'pending@charterpath.test',   'TutorPass!2026',   'Efua Danso'),
  ('d1c0de00-0000-4000-8000-000000000011'::uuid, 'student@charterpath.test',   'StudentPass!2026', 'Ada Obi'),
  ('d1c0de00-0000-4000-8000-000000000012'::uuid, 'bello@charterpath.test',     'StudentPass!2026', 'Bello Musa'),
  ('d1c0de00-0000-4000-8000-000000000013'::uuid, 'cynthia@charterpath.test',  'StudentPass!2026', 'Cynthia Adjei'),
  ('d1c0de00-0000-4000-8000-000000000014'::uuid, 'suspended@charterpath.test', 'StudentPass!2026', 'Yaw Boateng')
) as u(id, email, password, full_name)
where not exists (select 1 from auth.users existing where existing.id = u.id);

update public.profiles p
   set role = d.role,
       status = d.status,
       full_name = d.full_name,
       level = d.level,
       status_note = d.status_note
  from (values
  ('d1c0de00-0000-4000-8000-000000000001'::uuid, 'admin'::public.app_role,     'active'::public.account_status,   'Grace Owusu',   null, null),
  ('d1c0de00-0000-4000-8000-000000000002'::uuid, 'tutor'::public.app_role,     'active'::public.account_status,   'Ama Serwaa',    null, null),
  ('d1c0de00-0000-4000-8000-000000000003'::uuid, 'tutor'::public.app_role,     'active'::public.account_status,   'Kofi Mensah',   null, null),
  ('d1c0de00-0000-4000-8000-000000000004'::uuid, 'tutor'::public.app_role,     'pending'::public.account_status, 'Efua Danso',    null, 'Waiting on a decision from the office'),
  ('d1c0de00-0000-4000-8000-000000000011'::uuid, 'student'::public.app_role,   'active'::public.account_status,   'Ada Obi',       'professional', null),
  ('d1c0de00-0000-4000-8000-000000000012'::uuid, 'student'::public.app_role,   'active'::public.account_status,   'Bello Musa',    'foundation',   null),
  ('d1c0de00-0000-4000-8000-000000000013'::uuid, 'student'::public.app_role,   'active'::public.account_status,   'Cynthia Adjei', 'skills',       null),
  ('d1c0de00-0000-4000-8000-000000000014'::uuid, 'student'::public.app_role,   'suspended'::public.account_status,'Yaw Boateng',   null, 'Fees outstanding since September')
) as d(id, role, status, full_name, level, status_note)
where p.id = d.id;

-- The pending tutor also has an application waiting in the review queue.
insert into public.tutor_applications (id, user_id, status, headline, bio, specialties, reviewed_at)
select
  'd1c0de00-0000-4000-8000-000000000104'::uuid,
  'd1c0de00-0000-4000-8000-000000000004'::uuid,
  'pending',
  'ICAN Level 3 tutor, 6 years in practice',
  'I taught audit and tax at a training firm for six years before moving into private practice.',
  array['audit', 'taxation'],
  null
on conflict (id) do nothing;

-- The two active tutors applied once and were approved.
insert into public.tutor_applications (id, user_id, status, headline, bio, specialties, reviewed_by, reviewed_at, review_note)
values
  ('d1c0de00-0000-4000-8000-000000000102'::uuid, 'd1c0de00-0000-4000-8000-000000000002'::uuid, 'approved',
   'Financial reporting and audit', 'Eleven years of practice, four in industry.',
   array['financial reporting', 'audit'], 'd1c0de00-0000-4000-8000-000000000001'::uuid, now() - interval '50 days', null),
  ('d1c0de00-0000-4000-8000-000000000103'::uuid, 'd1c0de00-0000-4000-8000-000000000003'::uuid, 'approved',
   'Statistics for ICAN candidates', 'I teach the quantitative papers and the exam technique around them.',
   array['statistics', 'business mathematics'], 'd1c0de00-0000-4000-8000-000000000001'::uuid, now() - interval '45 days', null)
on conflict (id) do nothing;

-- ---------------------------------------------------------------- courses ---

-- Removed first, oldest first, so the demo can be rebuilt from scratch. Child
-- rows cascade from courses and lessons.
delete from public.courses where id in (
  'd1c0de00-0000-4000-8000-000000000101',
  'd1c0de00-0000-4000-8000-000000000102',
  'd1c0de00-0000-4000-8000-000000000103'
);

-- guard_course_insert() forces status to draft, nulls the review fields and takes
-- created_by from the session, so the rows go in bare and are published through
-- the RPCs further down.
select set_config('request.jwt.claim.sub', 'd1c0de00-0000-4000-8000-000000000002', true);

insert into public.courses (id, code, title, description, level, plan)
values
  ('d1c0de00-0000-4000-8000-000000000101', 'ACC301', 'Financial Accounting',
   'The three financial statements, how they are built, and how to read them.',
   'professional', 'standard'),
  ('d1c0de00-0000-4000-8000-000000000103', 'TXN204', 'Taxation',
   'Personal and company taxation for the ICAN tax papers.',
   'professional', 'premium')
on conflict (id) do nothing;

select set_config('request.jwt.claim.sub', 'd1c0de00-0000-4000-8000-000000000003', true);

insert into public.courses (id, code, title, description, level, plan)
values
  ('d1c0de00-0000-4000-8000-000000000102', 'BND302', 'Business Statistics',
   'The quantitative papers: distributions, inference and regression, read the way the examiner reads them.',
   'skills', 'standard')
on conflict (id) do nothing;

-- course_tutors has a composite key, so it needs its own cleanup.
delete from public.course_tutors
 where course_id in ('d1c0de00-0000-4000-8000-000000000101',
                     'd1c0de00-0000-4000-8000-000000000102',
                     'd1c0de00-0000-4000-8000-000000000103');

insert into public.course_tutors (course_id, user_id, assigned_by, assigned_at)
values
  ('d1c0de00-0000-4000-8000-000000000101', 'd1c0de00-0000-4000-8000-000000000002', 'd1c0de00-0000-4000-8000-000000000001', now() - interval '54 days'),
  ('d1c0de00-0000-4000-8000-000000000101', 'd1c0de00-0000-4000-8000-000000000003', 'd1c0de00-0000-4000-8000-000000000001', now() - interval '54 days'),
  ('d1c0de00-0000-4000-8000-000000000102', 'd1c0de00-0000-4000-8000-000000000003', 'd1c0de00-0000-4000-8000-000000000001', now() - interval '39 days'),
  ('d1c0de00-0000-4000-8000-000000000103', 'd1c0de00-0000-4000-8000-000000000002', 'd1c0de00-0000-4000-8000-000000000001', now() - interval '20 days')
on conflict do nothing;

-- ------------------------------------------------------- modules, lessons ---

insert into public.modules (id, course_id, title, position)
values
  ('d1c0de00-0000-4000-8000-000000000111', 'd1c0de00-0000-4000-8000-000000000101', 'Foundations of accounting', 1),
  ('d1c0de00-0000-4000-8000-000000000112', 'd1c0de00-0000-4000-8000-000000000101', 'Reporting and analysis', 2),
  ('d1c0de00-0000-4000-8000-000000000113', 'd1c0de00-0000-4000-8000-000000000102', 'Descriptive statistics', 1),
  ('d1c0de00-0000-4000-8000-000000000114', 'd1c0de00-0000-4000-8000-000000000103', 'Personal taxation', 1)
on conflict (id) do nothing;

-- Every lesson is inserted unpublished and published further down, once the
-- quizzes, assignments and live classes it needs exist. guard_lesson_publish()
-- refuses to publish a lesson with no video, material, quiz or live class, so
-- publishing early would fail -- and would be the wrong order anyway.
insert into public.lessons (id, module_id, course_id, title, description, position,
                            youtube_video_url)
values
  ('d1c0de00-0000-4000-8000-000000000121', 'd1c0de00-0000-4000-8000-000000000111', 'd1c0de00-0000-4000-8000-000000000101',
   'The accounting equation', 'Assets, liabilities and equity, and why the equation holds.', 1,
   'https://www.youtube.com/watch?v=dQw4w9WgXcQ'),

  ('d1c0de00-0000-4000-8000-000000000122', 'd1c0de00-0000-4000-8000-000000000111', 'd1c0de00-0000-4000-8000-000000000101',
   'Double entry', 'Debit and credit, and the rules behind them.', 2,
   'https://www.youtube.com/watch?v=dQw4w9WgXcQ'),

  ('d1c0de00-0000-4000-8000-000000000123', 'd1c0de00-0000-4000-8000-000000000111', 'd1c0de00-0000-4000-8000-000000000101',
   'Accruals and prepayments', 'Why profit and cash disagree, and how to reconcile them.', 3,
   null),

  ('d1c0de00-0000-4000-8000-000000000124', 'd1c0de00-0000-4000-8000-000000000112', 'd1c0de00-0000-4000-8000-000000000101',
   'The income statement', 'Structure and presentation of a profit and loss account.', 1,
   'https://www.youtube.com/watch?v=dQw4w9WgXcQ'),

  ('d1c0de00-0000-4000-8000-000000000125', 'd1c0de00-0000-4000-8000-000000000113', 'd1c0de00-0000-4000-8000-000000000102',
   'Averages and spread', 'Mean, median, and the measures of dispersion around them.', 1,
   'https://www.youtube.com/watch?v=dQw4w9WgXcQ'),

  ('d1c0de00-0000-4000-8000-000000000126', 'd1c0de00-0000-4000-8000-000000000113', 'd1c0de00-0000-4000-8000-000000000102',
   'Probability distributions', 'The binomial and normal, and when to use which.', 2,
   null),

  -- Unpublished, so the tutor dashboard has a draft and the publish button has
  -- something to act on.
  ('d1c0de00-0000-4000-8000-000000000127', 'd1c0de00-0000-4000-8000-000000000114', 'd1c0de00-0000-4000-8000-000000000103',
   'Residence and remittance', 'Which income is taxable, and when it is taxed.', 1,
   'https://www.youtube.com/watch?v=dQw4w9WgXcQ')
on conflict (id) do nothing;

-- ------------------------------------------------------------- materials ---

-- storage_path is the pointer the client uploaded, not a file. See the note at
-- the top: create a material through /tutor/course/ to have storage filled in
-- for real.
insert into public.lesson_materials (id, lesson_id, course_id, title, type, storage_path, description, position, created_by)
values
  ('d1c0de00-0000-4000-8000-000000000131', 'd1c0de00-0000-4000-8000-000000000122', 'd1c0de00-0000-4000-8000-000000000101',
   'Double entry worked examples', 'practice_questions',
   'courses/d1c0de00-0000-4000-8000-000000000101/materials/d1c0de00-0000-4000-8000-000000000131.url',
   'Twenty short exercises with answers.', 1, 'd1c0de00-0000-4000-8000-000000000002'),

  ('d1c0de00-0000-4000-8000-000000000132', 'd1c0de00-0000-4000-8000-000000000124', 'd1c0de00-0000-4000-8000-000000000101',
   'Income statement format', 'lecture_note',
   'courses/d1c0de00-0000-4000-8000-000000000101/materials/d1c0de00-0000-4000-8000-000000000132.url',
   'The layout to copy when you draft your own.', 1, 'd1c0de00-0000-4000-8000-000000000002')
on conflict (id) do nothing;

-- ----------------------------------------------------------------- quizzes ---

select set_config('request.jwt.claim.sub', 'd1c0de00-0000-4000-8000-000000000002', true);

insert into public.quizzes (id, course_id, lesson_id, title, instructions,
                            time_limit_minutes, passing_score, attempt_limit, due_at, is_published)
values
  ('d1c0de00-0000-4000-8000-000000000141', 'd1c0de00-0000-4000-8000-000000000101', 'd1c0de00-0000-4000-8000-000000000123',
   'Accruals check', 'Five questions, twenty marks. One attempt before the mock sits.',
   20, 40, 2, now() + interval '14 days', true),

  ('d1c0de00-0000-4000-8000-000000000142', 'd1c0de00-0000-4000-8000-000000000102', 'd1c0de00-0000-4000-8000-000000000126',
   'Distributions drill', 'Answer in full sentences where the question asks for an explanation.',
   30, 50, 3, now() + interval '7 days', true)
on conflict (id) do nothing;

-- correct_answer is deliberately part of this insert: it is the only place the
-- answers are written, and manage_quiz_questions() is the only way back out.
insert into public.quiz_questions (id, quiz_id, position, prompt, question_type, options, correct_answer, explanation, points)
values
  ('d1c0de00-0000-4000-8000-000000000151', 'd1c0de00-0000-4000-8000-000000000141', 1,
   'A payment received in advance is classified as', 'mcq',
   '["A liability", "An asset", "Income", "Equity"]'::jsonb, 'A liability',
   'Cash received before the service is performed is a liability.', 4),

  ('d1c0de00-0000-4000-8000-000000000152', 'd1c0de00-0000-4000-8000-000000000141', 2,
   'Depreciation reduces profit but not cash.', 'true_false', null, 'true',
   'It is a non-cash charge: it lowers profit and is added back in the cash flow.', 4),

  ('d1c0de00-0000-4000-8000-000000000153', 'd1c0de00-0000-4000-8000-000000000141', 3,
   'State the adjusting entry for a prepaid expense at the year end.', 'short_answer',
   null, 'Debit prepaid expense, credit the expense account',
   'The unexpired portion is moved out of the expense account.', 4),

  ('d1c0de00-0000-4000-8000-000000000154', 'd1c0de00-0000-4000-8000-000000000142', 1,
   'The median of 3, 7, 7, 12, 20 is', 'mcq',
   '["3", "7", "12", "20"]'::jsonb, '7',
   'The middle value of five ordered observations.', 5),

  ('d1c0de00-0000-4000-8000-000000000155', 'd1c0de00-0000-4000-8000-000000000142', 2,
   'Name the two properties that make the normal distribution a good model for measurement error.',
   'short_answer', null, 'Symmetry about the mean and known variance',
   'Both follow from the central limit theorem.', 10)
on conflict (id) do nothing;

-- A graded attempt, so the student sees a result and the tutor sees a review.
insert into public.quiz_attempts (id, quiz_id, student_id, attempt_number, started_at, submitted_at, status, score, max_score, percentage, passed)
values ('d1c0de00-0000-4000-8000-000000000161', 'd1c0de00-0000-4000-8000-000000000141',
        'd1c0de00-0000-4000-8000-000000000011', 1, now() - interval '3 days', now() - interval '3 days' + interval '14 minutes',
        'graded', 8, 12, 66.67, true)
on conflict (id) do nothing;

insert into public.quiz_answers (id, attempt_id, question_id, answer, is_correct, points_awarded)
values
  ('d1c0de00-0000-4000-8000-000000000171', 'd1c0de00-0000-4000-8000-000000000161', 'd1c0de00-0000-4000-8000-000000000151',
   'A liability', true, 4),
  ('d1c0de00-0000-4000-8000-000000000172', 'd1c0de00-0000-4000-8000-000000000161', 'd1c0de00-0000-4000-8000-000000000152',
   'false', false, 0),
  ('d1c0de00-0000-4000-8000-000000000173', 'd1c0de00-0000-4000-8000-000000000161', 'd1c0de00-0000-4000-8000-000000000153',
   'Credit the expense and debit prepaid', false, 4)
on conflict (id) do nothing;

-- --------------------------------------------------------------- lessons ---

-- Published now that every one of them has a video, a material, a quiz or a
-- live class behind it, which is what guard_lesson_publish() insists on.
update public.lessons set is_published = true
 where id in (
   'd1c0de00-0000-4000-8000-000000000121',
   'd1c0de00-0000-4000-8000-000000000122',
   'd1c0de00-0000-4000-8000-000000000123',
   'd1c0de00-0000-4000-8000-000000000124',
   'd1c0de00-0000-4000-8000-000000000125',
   'd1c0de00-0000-4000-8000-000000000126'
 );

-- ----------------------------------------------------------- publication ---

-- The long way round on purpose: submit_course_for_review() refuses a course
-- with no modules or lessons, and only review_course() may publish one. Running
-- the same sequence the tutor and admin screens run means the audit trail and
-- the enrol notifications are produced by the database rather than faked.
select set_config('request.jwt.claim.sub', 'd1c0de00-0000-4000-8000-000000000002', true);
select public.submit_course_for_review('d1c0de00-0000-4000-8000-000000000101');
select public.submit_course_for_review('d1c0de00-0000-4000-8000-000000000103');

select set_config('request.jwt.claim.sub', 'd1c0de00-0000-4000-8000-000000000003', true);
select public.submit_course_for_review('d1c0de00-0000-4000-8000-000000000102');

select set_config('request.jwt.claim.sub', 'd1c0de00-0000-4000-8000-000000000001', true);
select public.review_course('d1c0de00-0000-4000-8000-000000000101', 'approve');
select public.review_course('d1c0de00-0000-4000-8000-000000000102', 'approve');

-- Taxation goes back to a draft, so the tutor dashboard shows work in progress
-- and nothing is sitting in the admin review queue.
select public.review_course('d1c0de00-0000-4000-8000-000000000103', 'request_changes', 'Outline the tax papers before this goes for review.');

-- ------------------------------------------------------------ assignments ---

insert into public.assignments (id, course_id, lesson_id, title, instructions, due_at, max_score,
                                is_published, results_published)
values
  ('d1c0de00-0000-4000-8000-000000000181', 'd1c0de00-0000-4000-8000-000000000101', 'd1c0de00-0000-4000-8000-000000000124',
   'Draft an income statement', 'Take the figures in the accompanying note and lay out a full profit and loss account.',
   now() - interval '2 days', 20, true, true),

  ('d1c0de00-0000-4000-8000-000000000182', 'd1c0de00-0000-4000-8000-000000000101', 'd1c0de00-0000-4000-8000-000000000122',
   'Double entry drill', 'Post the twenty transactions and bring the trial balance back into balance.',
   now() + interval '5 days', 30, true, false)
on conflict (id) do nothing;

insert into public.assignment_submissions (id, assignment_id, student_id, response_text, submitted_at, status, score, feedback, graded_by, graded_at)
values
  -- Graded, so the student dashboard and the results screen have content.
  ('d1c0de00-0000-4000-8000-000000000191', 'd1c0de00-0000-4000-8000-000000000181', 'd1c0de00-0000-4000-8000-000000000011',
   'I have set out the statement in the standard vertical format, with the comparatives alongside.',
   now() - interval '4 days', 'graded', 16,
   'Correct presentation. Watch the gross profit line: you have put it below the operating expenses.',
   'd1c0de00-0000-4000-8000-000000000002', now() - interval '3 days'),

  -- Left ungraded, so /tutor/grading/ has a real queue item.
  ('d1c0de00-0000-4000-8000-000000000192', 'd1c0de00-0000-4000-8000-000000000182', 'd1c0de00-0000-4000-8000-000000000012',
   'All twenty postings are in the file. The trial balance agrees at 48,300.',
   now() - interval '1 day', 'submitted', null, null, null, null)
on conflict (id) do nothing;

-- ------------------------------------------------------------ live classes ---

-- meeting_storage_path is a pointer into the private bucket, never the meeting
-- URL itself. Create these through /tutor/live/ to have storage filled in.
insert into public.live_classes (id, course_id, lesson_id, title, platform, meeting_storage_path,
                                 scheduled_date, start_time, end_time, status, recording_youtube_url, notes)
values
  ('d1c0de00-0000-4000-8000-000000000201', 'd1c0de00-0000-4000-8000-000000000101', 'd1c0de00-0000-4000-8000-000000000123',
   'Accruals walkthrough', 'google_meet',
   'courses/d1c0de00-0000-4000-8000-000000000101/live/d1c0de00-0000-4000-8000-000000000201.url',
   current_date + 3, '18:00', '19:30', 'scheduled', null,
   'Bring the mock questions; we work through 1 to 5 together.'),

  ('d1c0de00-0000-4000-8000-000000000202', 'd1c0de00-0000-4000-8000-000000000101', 'd1c0de00-0000-4000-8000-000000000122',
   'Double entry clinic', 'youtube_live',
   'courses/d1c0de00-0000-4000-8000-000000000101/live/d1c0de00-0000-4000-8000-000000000202.url',
   current_date - 7, '18:00', '19:30', 'completed',
   'https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'Recording attached a week after the class.')
on conflict (id) do nothing;

-- --------------------------------------- enrolments, progress, results ---

insert into public.course_enrollments (id, course_id, student_id, status, enrolled_at, last_activity_at)
values
  ('d1c0de00-0000-4000-8000-000000000211', 'd1c0de00-0000-4000-8000-000000000101', 'd1c0de00-0000-4000-8000-000000000011',
   'active', now() - interval '30 days', now() - interval '3 days'),
  ('d1c0de00-0000-4000-8000-000000000212', 'd1c0de00-0000-4000-8000-000000000102', 'd1c0de00-0000-4000-8000-000000000011',
   'active', now() - interval '20 days', now() - interval '6 days'),
  ('d1c0de00-0000-4000-8000-000000000213', 'd1c0de00-0000-4000-8000-000000000101', 'd1c0de00-0000-4000-8000-000000000012',
   'active', now() - interval '15 days', now() - interval '1 day'),
  -- Completed, so the dashboard has a finished course rather than only active ones.
  ('d1c0de00-0000-4000-8000-000000000214', 'd1c0de00-0000-4000-8000-000000000102', 'd1c0de00-0000-4000-8000-000000000013',
   'completed', now() - interval '60 days', now() - interval '10 days')
on conflict (id) do nothing;

insert into public.lesson_progress (id, student_id, lesson_id, course_id, completed, completed_at, progress_percentage)
values
  ('d1c0de00-0000-4000-8000-000000000221', 'd1c0de00-0000-4000-8000-000000000011', 'd1c0de00-0000-4000-8000-000000000121',
   'd1c0de00-0000-4000-8000-000000000101', true, now() - interval '28 days', 100),
  ('d1c0de00-0000-4000-8000-000000000222', 'd1c0de00-0000-4000-8000-000000000011', 'd1c0de00-0000-4000-8000-000000000122',
   'd1c0de00-0000-4000-8000-000000000101', true, now() - interval '24 days', 100),
  ('d1c0de00-0000-4000-8000-000000000223', 'd1c0de00-0000-4000-8000-000000000011', 'd1c0de00-0000-4000-8000-000000000123',
   'd1c0de00-0000-4000-8000-000000000101', true, now() - interval '5 days', 100),
  -- In progress: started, not finished, so "continue learning" has somewhere to point.
  ('d1c0de00-0000-4000-8000-000000000224', 'd1c0de00-0000-4000-8000-000000000011', 'd1c0de00-0000-4000-8000-000000000124',
   'd1c0de00-0000-4000-8000-000000000101', false, null, 40),
  ('d1c0de00-0000-4000-8000-000000000225', 'd1c0de00-0000-4000-8000-000000000012', 'd1c0de00-0000-4000-8000-000000000121',
   'd1c0de00-0000-4000-8000-000000000101', true, now() - interval '14 days', 100),
  ('d1c0de00-0000-4000-8000-000000000226', 'd1c0de00-0000-4000-8000-000000000013', 'd1c0de00-0000-4000-8000-000000000125',
   'd1c0de00-0000-4000-8000-000000000102', true, now() - interval '9 days', 100)
on conflict (id) do nothing;

-- ---------------------------------------- announcements and notifications ---

insert into public.announcements (id, title, body, audience, status, published_at, created_by)
values
  ('d1c0de00-0000-4000-8000-000000000301', 'Mock exam timetable is up',
   'The December mock runs over two weekends. Check the live classes page for your slot.', 'all', 'published',
   now() - interval '2 days', 'd1c0de00-0000-4000-8000-000000000001'),
  ('d1c0de00-0000-4000-8000-000000000302', 'New lecture notes for Financial Accounting',
   'Double entry worked examples have been added to the lesson.', 'students', 'published',
   now() - interval '6 days', 'd1c0de00-0000-4000-8000-000000000002'),
  ('d1c0de00-0000-4000-8000-000000000303', 'Tutor briefing on marking',
   'Short call on the marking scale before the mock.', 'tutors', 'published',
   now() - interval '1 day', 'd1c0de00-0000-4000-8000-000000000001')
on conflict (id) do nothing;

insert into public.notifications (id, user_id, type, title, body, link_path, read_at, created_at)
values
  ('d1c0de00-0000-4000-8000-000000000311', 'd1c0de00-0000-4000-8000-000000000011', 'quiz_result', 'Accruals check marked',
   'You scored 8 of 12.', '/student/quiz/?id=d1c0de00-0000-4000-8000-000000000141', null, now() - interval '3 days'),
  ('d1c0de00-0000-4000-8000-000000000312', 'd1c0de00-0000-4000-8000-000000000011', 'live_class_scheduled', 'Accruals walkthrough scheduled',
   'Three days from now, 18:00.', '/student/live/', null, now() - interval '1 day'),
  ('d1c0de00-0000-4000-8000-000000000313', 'd1c0de00-0000-4000-8000-000000000012', 'assignment_created', 'Double entry drill set',
   'Due in five days.', '/student/assignments/', now() - interval '12 hours', now() - interval '2 days'),
  ('d1c0de00-0000-4000-8000-000000000314', 'd1c0de00-0000-4000-8000-000000000002', 'assignment_created', 'New submission to grade',
   'Bello Musa submitted Double entry drill.', '/tutor/grading/', null, now() - interval '1 day')
on conflict (id) do nothing;

-- ----------------------------------------------------------- audit trail ---

-- The admin dashboard counts the last seven days, so the timestamps matter.
insert into public.audit_logs (id, actor_id, action, resource_type, resource_id, metadata, created_at)
values
  ('d1c0de00-0000-4000-8000-000000000401', 'd1c0de00-0000-4000-8000-000000000001', 'course_submitted_for_review', 'course',
   'd1c0de00-0000-4000-8000-000000000101', '{"title":"Financial Accounting"}'::jsonb, now() - interval '55 days'),
  ('d1c0de00-0000-4000-8000-000000000402', 'd1c0de00-0000-4000-8000-000000000001', 'course_published', 'course',
   'd1c0de00-0000-4000-8000-000000000101', '{}'::jsonb, now() - interval '54 days'),
  ('d1c0de00-0000-4000-8000-000000000403', 'd1c0de00-0000-4000-8000-000000000001', 'tutor_approved', 'profile',
   'd1c0de00-0000-4000-8000-000000000002', '{}'::jsonb, now() - interval '50 days'),
  ('d1c0de00-0000-4000-8000-000000000404', 'd1c0de00-0000-4000-8000-000000000001', 'tutor_approved', 'profile',
   'd1c0de00-0000-4000-8000-000000000003', '{}'::jsonb, now() - interval '45 days'),
  ('d1c0de00-0000-4000-8000-000000000405', 'd1c0de00-0000-4000-8000-000000000002', 'assignment_graded', 'submission',
   'd1c0de00-0000-4000-8000-000000000191', '{"score":16,"max":20}'::jsonb, now() - interval '3 days'),
  ('d1c0de00-0000-4000-8000-000000000406', 'd1c0de00-0000-4000-8000-000000000001', 'announcement_published', 'announcement',
   'd1c0de00-0000-4000-8000-000000000301', '{}'::jsonb, now() - interval '2 days'),
  ('d1c0de00-0000-4000-8000-000000000407', 'd1c0de00-0000-4000-8000-000000000001', 'user_suspended', 'profile',
   'd1c0de00-0000-4000-8000-000000000014', '{"reason":"Fees outstanding"}'::jsonb, now() - interval '8 days')
on conflict (id) do nothing;

-- ---------------------------------------------------------------- summary ---

commit;

-- ------------------------------------------------------------------ done ---

select 'accounts' as what, count(*) as n from public.profiles
union all select 'courses', count(*) from public.courses where status = 'published'
union all select 'lessons', count(*) from public.lessons
union all select 'quizzes', count(*) from public.quizzes
union all select 'assignments', count(*) from public.assignments
union all select 'live classes', count(*) from public.live_classes
union all select 'enrolments', count(*) from public.course_enrollments
order by 1;