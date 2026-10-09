-- =============================================================================
-- CharterPath LMS — 0005 integrity guards
--
-- Denormalised course_id columns exist so RLS can decide access with one index
-- lookup. That is only safe if the database keeps them honest, which is what
-- these triggers do: they derive the value instead of trusting it, so a row
-- can never end up pointing at a course its owner does not control.
-- =============================================================================

create or replace function public.guard_lesson_course_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_course uuid;
begin
  select course_id into v_course from public.modules where id = new.module_id;
  if v_course is null then
    raise exception 'Module not found.' using errcode = 'P0003';
  end if;
  -- Always the module's course, whatever the caller sent.
  new.course_id := v_course;
  return new;
end;
$$;

create trigger lessons_guard_course_id
  before insert or update of module_id, course_id on public.lessons
  for each row execute function public.guard_lesson_course_id();

create or replace function public.guard_material_course_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_course uuid;
begin
  select course_id into v_course from public.lessons where id = new.lesson_id;
  if v_course is null then
    raise exception 'Lesson not found.' using errcode = 'P0003';
  end if;
  new.course_id := v_course;
  if new.created_by is null or auth.uid() is not null then
    new.created_by := auth.uid();
  end if;
  return new;
end;
$$;

create trigger lesson_materials_guard_course_id
  before insert or update of lesson_id, course_id on public.lesson_materials
  for each row execute function public.guard_material_course_id();

-- A live class is created by the tutor who is doing it, never on their behalf.
create or replace function public.guard_live_class_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.created_by := auth.uid();
  -- A class cannot belong to a lesson from a different course.
  if new.lesson_id is not null then
    if not exists (
      select 1 from public.lessons l
       where l.id = new.lesson_id and l.course_id = new.course_id
    ) then
      raise exception 'That lesson does not belong to this course.' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

create trigger live_classes_guard_insert
  before insert on public.live_classes
  for each row execute function public.guard_live_class_insert();

-- Keep content authorship tied to the session.
create or replace function public.guard_author_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.created_by := auth.uid();
  if tg_table_name = 'quizzes' and new.lesson_id is not null then
    if not exists (
      select 1 from public.lessons l
       where l.id = new.lesson_id and l.course_id = new.course_id
    ) then
      raise exception 'That lesson does not belong to this course.' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

create trigger quizzes_guard_insert
  before insert on public.quizzes
  for each row execute function public.guard_author_insert();

create trigger assignments_guard_insert
  before insert on public.assignments
  for each row execute function public.guard_author_insert();

-- course_id on content rows must still match after an update, not just insert.
create or replace function public.guard_content_course_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_course uuid;
begin
  if tg_table_name = 'quizzes' then
    if new.lesson_id is not null then
      select course_id into v_course from public.lessons where id = new.lesson_id;
      if v_course is distinct from new.course_id then
        raise exception 'That lesson does not belong to this course.' using errcode = '23514';
      end if;
    end if;
  elsif tg_table_name = 'assignments' then
    if new.lesson_id is not null then
      select course_id into v_course from public.lessons where id = new.lesson_id;
      if v_course is distinct from new.course_id then
        raise exception 'That lesson does not belong to this course.' using errcode = '23514';
      end if;
    end if;
  elsif tg_table_name = 'live_classes' then
    if new.lesson_id is not null then
      select course_id into v_course from public.lessons where id = new.lesson_id;
      if v_course is distinct from new.course_id then
        raise exception 'That lesson does not belong to this course.' using errcode = '23514';
      end if;
    end if;
  end if;
  return new;
end;
$$;

create trigger quizzes_guard_update
  before update of lesson_id, course_id on public.quizzes
  for each row execute function public.guard_content_course_id();

create trigger assignments_guard_update
  before update of lesson_id, course_id on public.assignments
  for each row execute function public.guard_content_course_id();

create trigger live_classes_guard_update
  before update of lesson_id, course_id on public.live_classes
  for each row execute function public.guard_content_course_id();

-- A lesson cannot be published before it has something to watch.
create or replace function public.guard_lesson_publish()
returns trigger
language plpgsql
as $$
begin
  if new.is_published and not exists (
    select 1 from public.live_classes lc where lc.lesson_id = new.id
  ) and new.youtube_video_id is null and not exists (
    select 1 from public.lesson_materials m where m.lesson_id = new.id
  ) and not exists (
    select 1 from public.quizzes q where q.lesson_id = new.id
  ) then
    raise exception
      'Add a video, a live class, a material or a quiz before publishing this lesson.'
      using errcode = '23514';
  end if;
  new.published_at := case when new.is_published then coalesce(new.published_at, now()) end;
  return new;
end;
$$;

create trigger lessons_guard_publish
  before insert or update of is_published on public.lessons
  for each row execute function public.guard_lesson_publish();
