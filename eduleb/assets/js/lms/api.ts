import { providerUrl } from "./urls.ts";
/**
 * The data layer every screen reads and writes through.
 *
 * Each export dispatches to Supabase or to the fixtures, so pages never branch on
 * preview mode themselves. Where the database offers an RPC, that is used; where
 * it grants a column-level insert/update/delete, that is used instead. No write
 * here invents a function the migrations do not define.
 */

import { config } from "./config.ts";
import { friendlyError, supabase, unwrap } from "./supabase.ts";
import {
  previewActivityItems,
  previewAdminStats,
  previewAnalyticsData,
  previewAssignmentResult,
  previewContinueLearning,
  previewCourseProgress,
  previewPersonaId,
  previewQuizResult,
  previewSignedUrl,
  previewState,
  previewStudentStats,
  previewSystemStats,
  previewTopCourses,
  previewTutorActivity,
  previewTutorCourses,
  previewTutorStats,
  previewTutorStudents,
  previewUpcomingClasses,
} from "./preview-data.ts";
import type { ActivityItem, AdminStats, AnalyticsData, Announcement, AppNotification, Assignment, AssignmentResult, AssignmentSubmission, ContinueLearning, Course, CourseModule, CourseProgress, Enrollment, Lesson, LessonMaterial, LiveClass, ManagedQuestion, Profile, QuestionType, Quiz, QuizAnswer, QuizAttempt, QuizQuestion, QuizResult, StudentStats, SystemStats, TopCourse, TutorApplication, TutorCourseMetric, TutorStats, TutorStudent, TutorStudentActivity, UpcomingClass } from "./types.ts";

const preview = (): boolean => config.preview;

async function me(): Promise<string> {
  const { data } = await supabase().auth.getUser();
  return data.user?.id ?? "";
}

/* ------------------------------------------------------------------ profile */

export async function updateOwnProfile(input: {
  full_name: string;
  phone: string | null;
  avatar_url: string | null;
}): Promise<void> {
  if (preview()) {
    if (previewState.profile) Object.assign(previewState.profile, input);
    return;
  }
  await unwrap(supabase().from("profiles").update(input).eq("id", await me()));
}

export async function uploadProfilePhoto(file: File): Promise<string> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error("Choose a JPG, PNG or WebP image.");
  if (file.size > 5 * 1024 * 1024) throw new Error("Profile photos must be 5 MB or smaller.");
  if (preview()) {
    const url = URL.createObjectURL(file);
    if (previewState.profile) previewState.profile.avatar_url = url;
    return url;
  }
  const userId = await me();
  const ext = file.type.split("/")[1] === "jpeg" ? "jpg" : file.type.split("/")[1];
  const path = `avatars/${userId}/${crypto.randomUUID()}.${ext}`;
  await unwrap(supabase().storage.from("lms-private").upload(path, file, { contentType: file.type, upsert: false }));
  await updateOwnProfile({ full_name: (await myProfile())?.full_name ?? "", phone: (await myProfile())?.phone ?? null, avatar_url: path });
  const signed = await unwrap(supabase().storage.from("lms-private").createSignedUrl(path, 3600));
  return signed?.signedUrl ?? "";
}

export async function myProfile(): Promise<Profile | null> {
  if (preview()) return previewState.profile;
  return (await unwrap(supabase().from("profiles").select("*").eq("id", await me()).maybeSingle())) as Profile | null;
}

export async function myApplication(): Promise<TutorApplication | null> {
  if (preview()) return previewState.applications[0] ?? null;
  return (await unwrap(
    supabase().from("tutor_applications").select("*").eq("user_id", await me()).maybeSingle(),
  )) as TutorApplication | null;
}

/* ------------------------------------------------------------------ courses */

export async function listCourses(): Promise<Course[]> {
  if (preview()) {
    const mine = previewState.courses.filter(
      (c) => c.created_by === previewState.profile?.id,
    );
    return previewState.profile?.role === "admin" ? [...previewState.courses] : mine;
  }
  const profile = await myProfile();
  if (profile?.role === "tutor") {
    const ids = (await tutorCourseMetrics()).map(c => c.id);
    if (!ids.length) return [];
    return (await unwrap(supabase().from("courses").select("*").in("id", ids).order("created_at", { ascending: false }))) as Course[];
  }
  return (await unwrap(supabase().from("courses").select("*").order("created_at", { ascending: false }))) as Course[];
}

export async function getCourse(courseId: string): Promise<Course | null> {
  if (preview()) return previewState.courses.find((c) => c.id === courseId) ?? null;
  return (await unwrap(supabase().from("courses").select("*").eq("id", courseId).maybeSingle())) as Course | null;
}

/** The courses_guard_insert trigger forces created_by and status, so they are
 *  not sent — only the columns the grant lists. */
export async function createCourse(input: {
  title: string;
  description: string | null;
  code: string | null;
  level: string | null;
}): Promise<Course | null> {
  if (preview()) {
    const course: Course = {
      ...input,
      id: `c-preview-${Date.now()}`,
      plan: input.level,
      thumbnail_url: null,
      status: "draft",
      created_by: previewState.profile?.id ?? "",
      submitted_at: null,
      reviewed_at: null,
      published_at: null,
      review_note: null,
    };
    previewState.courses.push(course);
    return course;
  }
  return (await unwrap(
    supabase().from("courses").insert(input).select("*").single(),
  )) as Course;
}

/** status is not in the update grant: publication only moves via review_course. */
export async function updateCourse(
  courseId: string,
  input: { title?: string; description?: string | null; code?: string | null; level?: string | null; short_description?: string | null; duration_minutes?: number | null; learning_objectives?: string[] },
): Promise<void> {
  if (preview()) {
    const course = previewState.courses.find((c) => c.id === courseId);
    if (course) Object.assign(course, input);
    return;
  }
  await unwrap(supabase().from("courses").update(input).eq("id", courseId));
}

export async function deleteCourse(courseId: string): Promise<void> {
  if (preview()) {
    previewState.courses = previewState.courses.filter((c) => c.id !== courseId);
    return;
  }
  await unwrap(supabase().from("courses").delete().eq("id", courseId));
}

/** The admin publication path. A course is never archived or unpublished by a
 *  direct update, because status is not in the courses update grant. */
export async function setCourseStatus(
  courseId: string,
  status: "draft" | "published" | "archived",
  note?: string | null,
): Promise<void> {
  if (preview()) {
    const course = previewState.courses.find((c) => c.id === courseId);
    if (!course) return;
    course.status = status;
    if (status === "published") course.published_at = new Date().toISOString();
    if (note !== undefined && note !== null) course.review_note = note;
    return;
  }
  await unwrap(supabase().rpc("set_course_status", { p_course_id: courseId, p_status: status, p_note: note ?? null }));
}

export async function submitCourseForReview(courseId: string): Promise<void> {
  if (preview()) {
    const course = previewState.courses.find((c) => c.id === courseId);
    if (course) course.status = "pending_review";
    return;
  }
  await unwrap(supabase().rpc("submit_course_for_review", { p_course_id: courseId }));
}

/** One function covers both decisions. `p_decision` is 'approve' | 'reject'. */
export async function reviewCourse(courseId: string, decision: "approve" | "reject", note?: string | null): Promise<void> {
  if (preview()) {
    const course = previewState.courses.find((c) => c.id === courseId);
    if (!course) return;
    if (decision === "approve") {
      course.status = "published";
      course.published_at = new Date().toISOString();
      course.review_note = note ?? null;
    } else {
      course.status = "draft";
      course.review_note = note ?? null;
    }
    return;
  }
  await unwrap(supabase().rpc("review_course", { p_course_id: courseId, p_decision: decision, p_note: note ?? null }));
}

/* ------------------------------------------------------- modules and lessons */

export async function listModules(courseId: string): Promise<CourseModule[]> {
  if (preview()) {
    return previewState.modules.filter((m) => m.course_id === courseId).sort((a, b) => a.position - b.position);
  }
  return (await unwrap(supabase().from("modules").select("*").eq("course_id", courseId).order("position"))) as CourseModule[];
}

export async function createModule(courseId: string, title: string): Promise<CourseModule | null> {
  if (preview()) {
    const module: CourseModule = {
      id: `m-preview-${Date.now()}`,
      course_id: courseId,
      title,
      position: previewState.modules.filter((m) => m.course_id === courseId).length + 1,
    };
    previewState.modules.push(module);
    return module;
  }
  return (await unwrap(
    supabase().from("modules").insert({ course_id: courseId, title, position: 0 }).select("*").single(),
  )) as CourseModule;
}

export async function updateModule(moduleId: string, input: { title?: string; position?: number }): Promise<void> {
  if (preview()) {
    const module = previewState.modules.find((m) => m.id === moduleId);
    if (module) Object.assign(module, input);
    return;
  }
  await unwrap(supabase().from("modules").update(input).eq("id", moduleId));
}

export async function deleteModule(moduleId: string): Promise<void> {
  if (preview()) {
    previewState.modules = previewState.modules.filter((m) => m.id !== moduleId);
    return;
  }
  await unwrap(supabase().from("modules").delete().eq("id", moduleId));
}

export async function reorderModules(courseId: string, ids: string[]): Promise<void> {
  if (preview()) {
    ids.forEach((id, index) => {
      const module = previewState.modules.find((m) => m.id === id);
      if (module) module.position = index + 1;
    });
    return;
  }
  await unwrap(supabase().rpc("reorder_modules", { p_course_id: courseId, p_ids: ids }));
}

export async function listLessons(courseId: string): Promise<Lesson[]> {
  if (preview()) {
    return previewState.lessons.filter((l) => l.course_id === courseId).sort((a, b) => a.position - b.position);
  }
  return (await unwrap(supabase().from("lessons").select("*").eq("course_id", courseId).order("position"))) as Lesson[];
}

export async function createLesson(input: {
  module_id: string;
  course_id: string;
  title: string;
  description: string | null;
}): Promise<Lesson | null> {
  if (preview()) {
    const lesson: Lesson = {
      ...input,
      id: `l-preview-${Date.now()}`,
      position: previewState.lessons.filter((l) => l.module_id === input.module_id).length + 1,
      is_published: false,
      youtube_video_url: null,
      youtube_video_id: null,
    };
    previewState.lessons.push(lesson);
    return lesson;
  }
  return (await unwrap(
    supabase().from("lessons").insert({ ...input, position: 0, youtube_video_url: null, is_published: false }).select("*").single(),
  )) as Lesson;
}

export async function updateLesson(
  lessonId: string,
  input: { title?: string; description?: string | null; youtube_video_url?: string | null; is_published?: boolean },
): Promise<void> {
  if (preview()) {
    const lesson = previewState.lessons.find((l) => l.id === lessonId);
    if (lesson) {
      Object.assign(lesson, input);
      if (input.youtube_video_url !== undefined) {
        lesson.youtube_video_id = input.youtube_video_url?.match(/(?:v=|youtu\.be\/|\/(?:embed|shorts|live)\/)([\w-]{11})(?:[^\w-]|$)/)?.[1] ?? null;
      }
    }
    return;
  }
  await unwrap(supabase().from("lessons").update(input).eq("id", lessonId));
}

export async function deleteLesson(lessonId: string): Promise<void> {
  if (preview()) {
    previewState.lessons = previewState.lessons.filter((l) => l.id !== lessonId);
    return;
  }
  await unwrap(supabase().from("lessons").delete().eq("id", lessonId));
}

export async function reorderLessons(moduleId: string, ids: string[]): Promise<void> {
  if (preview()) {
    ids.forEach((id, index) => {
      const lesson = previewState.lessons.find((l) => l.id === id);
      if (lesson) lesson.position = index + 1;
    });
    return;
  }
  await unwrap(supabase().rpc("reorder_lessons", { p_module_id: moduleId, p_ids: ids }));
}

export async function listMaterials(lessonId: string): Promise<LessonMaterial[]> {
  if (preview()) {
    return previewState.materials.filter((m) => m.lesson_id === lessonId).sort((a, b) => a.position - b.position);
  }
  return (await unwrap(supabase().from("lesson_materials").select("*").eq("lesson_id", lessonId).order("position"))) as LessonMaterial[];
}

export async function createMaterial(input: {
  lesson_id: string;
  course_id: string;
  title: string;
  type: string;
  description: string | null;
  storage_path: string;
  /** Only for preview, where the id has to be known before the row is built. */
  id?: string;
}): Promise<LessonMaterial | null> {
  if (preview()) {
    const material: LessonMaterial = {
      ...input,
      id: input.id ?? `mat-preview-${Date.now()}`,
      created_at: new Date().toISOString(),
      position: previewState.materials.filter((m) => m.lesson_id === input.lesson_id).length + 1,
    };
    previewState.materials.push(material);
    return material;
  }
  return (await unwrap(
    supabase().from("lesson_materials").insert({ ...input, position: 0, created_by: await me() }).select("*").single(),
  )) as LessonMaterial;
}

export async function updateMaterial(
  materialId: string,
  input: { title?: string; type?: string; storage_path?: string; description?: string | null; position?: number },
): Promise<void> {
  if (preview()) {
    const material = previewState.materials.find((m) => m.id === materialId);
    if (material) Object.assign(material, input);
    return;
  }
  await unwrap(supabase().from("lesson_materials").update(input).eq("id", materialId));
}

/**
 * Writes the small pointer object a material resolves through.
 *
 * The bucket holds `<uuid>.url` text objects, not binaries: the row stores the
 * location and get_private_resource_url() checks access before signing it. The
 * storage insert policy refuses any other name, so the path shape here must stay
 * identical to storage_name_is_valid() in 0008_storage.sql.
 */
export async function uploadMaterialPointer(courseId: string, materialId: string, target: string): Promise<string> {
  const path = `courses/${courseId}/materials/${materialId}.url`;
  if (preview()) return path;

  const { error } = await supabase().storage
    .from("lms-private")
    .upload(path, new Blob([target], { type: "text/plain" }), { contentType: "text/plain", upsert: true });
  if (error) throw new Error(friendlyError(error));
  return path;
}

/**
 * Creates a material and its pointer together.
 *
 * id is server-generated, so the row is inserted first and the path is written
 * back afterwards — storage_path is in the update grant precisely so this works.
 */
export async function createMaterialWithTarget(input: {
  lesson_id: string;
  course_id: string;
  title: string;
  type: string;
  description: string | null;
  target_url: string;
}): Promise<LessonMaterial | null> {
  if (preview()) {
    // The fixture id is uuid-shaped so the preview path is byte-identical in
    // shape to the real one; a path the database would reject must never be
    // reachable during review.
    const id = crypto.randomUUID();
    const material = await createMaterial({
      id,
      lesson_id: input.lesson_id,
      course_id: input.course_id,
      title: input.title,
      type: input.type,
      description: input.description,
      storage_path: `courses/${input.course_id}/materials/${id}.url`,
    });
    if (material) sessionStorage.setItem(`ican.preview.link.${material.storage_path}`, providerUrl(input.target_url, "drive"));
    return material;
  }

  const target = providerUrl(input.target_url, "drive");
  return (await unwrap(supabase().rpc("create_link_material", {
    p_lesson: input.lesson_id, p_title: input.title, p_type: input.type,
    p_description: input.description, p_url: target,
  }))) as LessonMaterial;

}export async function deleteMaterial(materialId: string): Promise<void> {
  if (preview()) {
    previewState.materials = previewState.materials.filter((m) => m.id !== materialId);
    return;
  }
  await unwrap(supabase().from("lesson_materials").delete().eq("id", materialId));
}

export async function reorderMaterials(lessonId: string, ids: string[]): Promise<void> {
  if (preview()) {
    ids.forEach((id, index) => {
      const material = previewState.materials.find((m) => m.id === id);
      if (material) material.position = index + 1;
    });
    return;
  }
  await unwrap(supabase().rpc("reorder_materials", { p_lesson_id: lessonId, p_ids: ids }));
}

/* ------------------------------------------------------------------ quizzes */

export async function listQuizzes(courseId: string): Promise<Quiz[]> {
  if (preview()) return previewState.quizzes.filter((q) => q.course_id === courseId);
  return (await unwrap(supabase().from("quizzes").select("*").eq("course_id", courseId).order("due_at"))) as Quiz[];
}

export async function createQuiz(input: {
  course_id: string;
  lesson_id: string | null;
  title: string;
  instructions: string | null;
  time_limit_minutes: number | null;
  passing_score: number;
  attempt_limit: number;
  due_at: string | null;
}): Promise<Quiz | null> {
  if (preview()) {
    const quiz: Quiz = { ...input, id: `q-preview-${Date.now()}`, is_published: false };
    previewState.quizzes.push(quiz);
    return quiz;
  }
  return (await unwrap(
    supabase().from("quizzes").insert({ ...input, created_by: await me(), is_published: false }).select("*").single(),
  )) as Quiz;
}

export async function updateQuiz(
  quizId: string,
  input: { title?: string; instructions?: string | null; time_limit_minutes?: number | null; passing_score?: number; attempt_limit?: number; due_at?: string | null; is_published?: boolean },
): Promise<void> {
  if (preview()) {
    const quiz = previewState.quizzes.find((q) => q.id === quizId);
    if (quiz) Object.assign(quiz, input);
    return;
  }
  await unwrap(supabase().from("quizzes").update(input).eq("id", quizId));
}

export async function deleteQuiz(quizId: string): Promise<void> {
  if (preview()) {
    previewState.quizzes = previewState.quizzes.filter((q) => q.id !== quizId);
    return;
  }
  await unwrap(supabase().from("quizzes").delete().eq("id", quizId));
}

/** Student view. correct_answer is not in the grant, so it cannot appear. */
export async function listQuizQuestions(quizId: string): Promise<QuizQuestion[]> {
  if (preview()) {
    return previewState.questions
      .filter((q) => q.quiz_id === quizId)
      .sort((a, b) => a.position - b.position)
      .map(({ correct_answer: _answer, explanation: _why, ...rest }) => rest);
  }
  return (await unwrap(
    supabase().from("quiz_questions").select("id, quiz_id, position, prompt, question_type, options, points").eq("quiz_id", quizId).order("position"),
  )) as QuizQuestion[];
}

/** Tutor view. The only path to the answers, since the direct select omits them. */
export async function listManagedQuestions(quizId: string): Promise<ManagedQuestion[]> {
  if (preview()) return previewState.questions.filter((q) => q.quiz_id === quizId).sort((a, b) => a.position - b.position);
  return (await unwrap(supabase().rpc("manage_quiz_questions", { p_quiz_id: quizId }))) as ManagedQuestion[];
}

export async function createQuestion(input: {
  quiz_id: string;
  prompt: string;
  question_type: QuestionType;
  options: string[] | null;
  correct_answer: string;
  explanation: string | null;
  points: number;
}): Promise<void> {
  if (preview()) {
    previewState.questions.push({
      ...input,
      id: `qq-preview-${Date.now()}`,
      position: previewState.questions.filter((q) => q.quiz_id === input.quiz_id).length + 1,
    });
    return;
  }
  await unwrap(supabase().from("quiz_questions").insert({ ...input, position: 0 }));
}

export async function updateQuestion(
  questionId: string,
  input: { prompt?: string; options?: string[] | null; correct_answer?: string; explanation?: string | null; points?: number; position?: number },
): Promise<void> {
  if (preview()) {
    const question = previewState.questions.find((q) => q.id === questionId);
    if (question) Object.assign(question, input);
    return;
  }
  await unwrap(supabase().from("quiz_questions").update(input).eq("id", questionId));
}

export async function deleteQuestion(questionId: string): Promise<void> {
  if (preview()) {
    previewState.questions = previewState.questions.filter((q) => q.id !== questionId);
    return;
  }
  await unwrap(supabase().from("quiz_questions").delete().eq("id", questionId));
}

/* ----------------------------------------------------------------- student */

export async function studentDashboardStats(): Promise<StudentStats> {
  if (preview()) return previewStudentStats();
  return (await unwrap(supabase().rpc("student_dashboard_stats"))) as StudentStats;
}

export async function tutorDashboardStats(): Promise<TutorStats> {
  if (preview()) return previewTutorStats();
  return (await unwrap(supabase().rpc("tutor_dashboard_stats"))) as TutorStats;
}

export async function adminDashboardStats(): Promise<AdminStats> {
  if (preview()) return previewAdminStats();
  return (await unwrap(supabase().rpc("admin_dashboard_stats"))) as AdminStats;
}

export async function adminAnalyticsData(): Promise<AnalyticsData> {
  if (preview()) return previewAnalyticsData();
  return (await unwrap(supabase().rpc("admin_analytics_data"))) as AnalyticsData;
}

export async function adminActivityItems(): Promise<ActivityItem[]> {
  if (preview()) return previewActivityItems();
  return (await unwrap(supabase().rpc("admin_activity_items"))) as ActivityItem[];
}

export async function adminTopCourses(): Promise<TopCourse[]> {
  if (preview()) return previewTopCourses();
  return (await unwrap(supabase().rpc("admin_top_courses"))) as TopCourse[];
}

export async function adminSystemStats(): Promise<SystemStats> {
  if (preview()) return previewSystemStats();
  return (await unwrap(supabase().rpc("admin_system_stats"))) as SystemStats;
}

export async function adminUpcomingClasses(): Promise<UpcomingClass[]> {
  if (preview()) return previewUpcomingClasses();
  return (await unwrap(supabase().rpc("admin_upcoming_classes"))) as UpcomingClass[];
}

/** One row per course the tutor manages, with enrolment and average progress. */
export async function tutorCourseMetrics(): Promise<TutorCourseMetric[]> {
  if (preview()) return previewTutorCourses();
  return (await unwrap(supabase().rpc("tutor_my_courses"))) as TutorCourseMetric[];
}

/** What students in the tutor's own courses have just been doing. */
export async function tutorStudentActivity(): Promise<TutorStudentActivity[]> {
  if (preview()) return previewTutorActivity();
  return (await unwrap(supabase().rpc("tutor_student_activity"))) as TutorStudentActivity[];
}

/** The roster: students enrolled in the tutor's courses, with their progress. */
export async function tutorMyStudents(): Promise<TutorStudent[]> {
  if (preview()) return previewTutorStudents();
  return (await unwrap(supabase().rpc("tutor_my_students"))) as TutorStudent[];
}

export async function myCourseProgress(): Promise<CourseProgress[]> {
  if (preview()) return previewCourseProgress();
  return (await unwrap(supabase().rpc("my_course_progress"))) as CourseProgress[];
}

export async function continueLearning(courseId: string): Promise<ContinueLearning[]> {
  if (preview()) return previewContinueLearning(courseId);
  return (await unwrap(supabase().rpc("continue_learning", { p_course_id: courseId }))) as ContinueLearning[];
}

/** A student's own enrolments, which is how "my courses" is derived. */
export async function myEnrollments(): Promise<Enrollment[]> {
  if (preview()) {
    const me = previewState.profile?.id || previewPersonaId("student");
    return previewState.enrollments.filter((e) => e.student_id === me);
  }
  return (await unwrap(
    supabase().from("course_enrollments").select("*").eq("student_id", await me()),
  )) as Enrollment[];
}

export async function coursesFor(enrollmentCourseIds: string[]): Promise<Course[]> {
  if (enrollmentCourseIds.length === 0) return [];
  if (preview()) return previewState.courses.filter((c) => enrollmentCourseIds.includes(c.id));
  return (await unwrap(supabase().from("courses").select("*").in("id", enrollmentCourseIds))) as Course[];
}

export async function enrollInCourse(courseId: string): Promise<void> {
  if (preview()) {
    if (!previewState.courses.some(c=>c.id===courseId&&c.status==='published')) throw new Error('Course unavailable.');
    const row=previewState.enrollments.find(e=>e.course_id===courseId&&e.student_id===previewState.profile?.id);
    if(row)row.status='active';else previewState.enrollments.push({id:crypto.randomUUID(),course_id:courseId,student_id:previewState.profile!.id,status:'active',enrolled_at:new Date().toISOString()});
    return;
  }
  await unwrap(supabase().rpc("enroll_in_course", { p_course_id: courseId }));
}

export async function myLessons(courseId: string): Promise<Lesson[]> {
  if (preview()) {
    return previewState.lessons.filter((l) => l.course_id === courseId && l.is_published).sort((a, b) => a.position - b.position);
  }
  return (await unwrap(
    supabase().from("lessons").select("*").eq("course_id", courseId).eq("is_published", true).order("position"),
  )) as Lesson[];
}

export async function getLesson(lessonId: string): Promise<Lesson | null> {
  if (preview()) return previewState.lessons.find((l) => l.id === lessonId) ?? null;
  return (await unwrap(supabase().from("lessons").select("*").eq("id", lessonId).maybeSingle())) as Lesson | null;
}

export async function markLessonComplete(lessonId: string): Promise<void> {
  if (preview()) {
    const studentId = previewState.profile?.id ?? "";
    const existing = previewState.progress.find((p) => p.student_id === studentId && p.lesson_id === lessonId);
    if (existing) {
      existing.completed = true;
      existing.progress_percentage = 100;
    } else {
      previewState.progress.push({ student_id: studentId, lesson_id: lessonId, completed: true, progress_percentage: 100 });
    }
    return;
  }
  await unwrap(supabase().rpc("mark_lesson_complete", { p_lesson_id: lessonId }));
}

export async function isLessonComplete(lessonId: string): Promise<boolean> {
  if (preview()) {
    return previewState.progress.some(
      (p) => p.student_id === previewState.profile?.id && p.lesson_id === lessonId && p.completed,
    );
  }
  const row = await unwrap(
    supabase().from("lesson_progress").select("completed").eq("lesson_id", lessonId).eq("student_id", await me()).maybeSingle(),
  );
  return Boolean(row?.completed);
}

/** One published quiz, scoped to the caller's enrolments by RLS. */
export async function myQuiz(quizId: string): Promise<Quiz | null> {
  if (preview()) {
    const quiz = previewState.quizzes.find((q) => q.id === quizId && q.is_published);
    return quiz ?? null;
  }
  return (await unwrap(
    supabase().from("quizzes").select("*").eq("id", quizId).eq("is_published", true).maybeSingle(),
  )) as Quiz | null;
}

export async function myQuizzes(courseId: string): Promise<Quiz[]> {
  if (preview()) return previewState.quizzes.filter((q) => q.course_id === courseId && q.is_published);
  return (await unwrap(
    supabase().from("quizzes").select("*").eq("course_id", courseId).eq("is_published", true).order("due_at"),
  )) as Quiz[];
}

export async function myQuizAttempts(quizId: string): Promise<QuizAttempt[]> {
  if (preview()) {
    return previewState.attempts
      .filter((a) => a.quiz_id === quizId && a.student_id === previewState.profile?.id)
      .map(({ started_at: _s, ...rest }) => ({ ...rest, started_at: new Date().toISOString() }));
  }
  return (await unwrap(
    supabase().from("quiz_attempts").select("*").eq("quiz_id", quizId).eq("student_id", await me()).order("attempt_number"),
  )) as QuizAttempt[];
}

export async function startQuizAttempt(quizId: string): Promise<string> {
  if (preview()) return "qa-preview";
  return (await unwrap(supabase().rpc("start_quiz_attempt", { p_quiz_id: quizId }))) as string;
}

/** Takes the quiz id, not the attempt id: the database resolves the attempt. */
export async function submitQuizAttempt(quizId: string, answers: Record<string, string>): Promise<QuizResult> {
  if (preview()) return previewQuizResult();
  return (await unwrap(
    supabase().rpc("submit_quiz_attempt", { p_quiz_id: quizId, p_answers: answers }),
  )) as QuizResult;
}

/** Past attempts. Only is_correct is readable — the answers are not. */
export async function attemptAnswers(attemptId: string): Promise<QuizAnswer[]> {
  if (preview()) return [];
  return (await unwrap(supabase().from("quiz_answers").select("*").eq("attempt_id", attemptId))) as QuizAnswer[];
}

export async function myAssignments(courseId: string): Promise<Assignment[]> {
  if (preview()) return previewState.assignments.filter((a) => a.course_id === courseId && a.is_published);
  return (await unwrap(
    supabase().from("assignments").select("*").eq("course_id", courseId).eq("is_published", true).order("due_at"),
  )) as Assignment[];
}

export async function submitAssignment(assignmentId: string, responseText: string): Promise<void> {
  if (preview()) {
    const studentId = previewState.profile?.id ?? "";
    const existing = previewState.submissions.find((s) => s.assignment_id === assignmentId && s.student_id === studentId);
    if (existing) {
      Object.assign(existing, { response_text: responseText, status: "submitted", score: null, feedback: null, graded_at: null });
    } else {
      previewState.submissions.push({
        id: `sub-preview-${Date.now()}`,
        assignment_id: assignmentId,
        student_id: studentId,
        response_text: responseText,
        status: "submitted",
        score: null,
        feedback: null,
        graded_at: null,
        submitted_at: new Date().toISOString(),
      });
    }
    return;
  }
  await unwrap(
    supabase().rpc("submit_assignment", { p_assignment_id: assignmentId, p_response_text: responseText }),
  );
}

export async function myAssignmentResult(assignmentId: string): Promise<AssignmentResult> {
  if (preview()) return previewAssignmentResult(assignmentId);
  return (await unwrap(supabase().rpc("my_assignment_result", { p_assignment_id: assignmentId }))) as AssignmentResult;
}

export async function myUpcomingClasses(): Promise<LiveClass[]> {
  if (preview()) {
    const ids = new Set(previewState.enrollments.filter(e => e.student_id === previewState.profile?.id && e.status === "active").map(e => e.course_id));
    return previewState.liveClasses.filter(l => ids.has(l.course_id) && (l.status === "scheduled" || l.status === "live" || l.status === "completed"));
  }
  const enrollments = await myEnrollments();
  const ids = enrollments.filter((e) => e.status === "active").map((e) => e.course_id);
  if (ids.length === 0) return [];
  return (await unwrap(
    supabase().from("live_classes")
      .select("id, course_id, lesson_id, title, platform, scheduled_date, start_time, end_time, timezone, status, recording_youtube_url, recording_youtube_id, notes")
      .in("course_id", ids)
      .in("status", ["scheduled", "live", "completed"])
      .order("scheduled_date"),
  )) as LiveClass[];
}

export async function myAnnouncements(): Promise<Announcement[]> {
  if (preview()) return previewState.announcements.filter((a) => a.status === "published");
  return (await unwrap(supabase().from("announcements").select("*").order("published_at", { ascending: false }))) as Announcement[];
}

/* -------------------------------------------------------------- assignments */

export async function courseAssignments(courseId: string): Promise<Assignment[]> {
  if (preview()) return previewState.assignments.filter((a) => a.course_id === courseId);
  return (await unwrap(supabase().from("assignments").select("*").eq("course_id", courseId).order("due_at"))) as Assignment[];
}

export async function createAssignment(input: {
  course_id: string;
  title: string;
  instructions: string | null;
  due_at: string | null;
  max_score: number;
}): Promise<Assignment | null> {
  if (preview()) {
    const assignment: Assignment = {
      ...input,
      id: `a-preview-${Date.now()}`,
      lesson_id: null,
      is_published: false,
      results_published: false,
    };
    previewState.assignments.push(assignment);
    return assignment;
  }
  return (await unwrap(
    supabase().from("assignments").insert({ ...input, lesson_id: null, created_by: await me(), is_published: false }).select("*").single(),
  )) as Assignment;
}

export async function updateAssignment(
  assignmentId: string,
  input: { title?: string; instructions?: string | null; due_at?: string | null; max_score?: number; is_published?: boolean; results_published?: boolean },
): Promise<void> {
  if (preview()) {
    const assignment = previewState.assignments.find((a) => a.id === assignmentId);
    if (assignment) Object.assign(assignment, input);
    return;
  }
  await unwrap(supabase().from("assignments").update(input).eq("id", assignmentId));
}

/** Assignments are deletable through the table grant + assignments_delete policy,
 *  but only while no submission exists — 0005_integrity.sql refuses otherwise. */
export async function deleteAssignment(assignmentId: string): Promise<void> {
  if (preview()) {
    previewState.assignments = previewState.assignments.filter((a) => a.id !== assignmentId);
    return;
  }
  await unwrap(supabase().from("assignments").delete().eq("id", assignmentId));
}

/* --------------------------------------------------------------------- live */

export async function courseLiveClasses(courseId: string): Promise<LiveClass[]> {
  if (preview()) return previewState.liveClasses.filter((l) => l.course_id === courseId);
  return (await unwrap(
    supabase().from("live_classes")
      .select("id, course_id, lesson_id, title, platform, scheduled_date, start_time, end_time, timezone, status, recording_youtube_url, recording_youtube_id, notes")
      .eq("course_id", courseId)
      .order("scheduled_date"),
  )) as LiveClass[];
}

export async function createLiveClass(input: {
  course_id: string;
  lesson_id: string | null;
  title: string;
  platform: string;
  scheduled_date: string;
  start_time: string;
  end_time: string;
  meeting_url: string;
  notes?: string | null;
}): Promise<LiveClass | null> {
  if (preview()) {
    const live: LiveClass = {
      id: `live-preview-${Date.now()}`,
      course_id: input.course_id,
      lesson_id: input.lesson_id,
      title: input.title,
      platform: input.platform as LiveClass["platform"],
      scheduled_date: input.scheduled_date,
      start_time: input.start_time,
      end_time: input.end_time,
      status: "scheduled",
      recording_youtube_url: null,
      recording_youtube_id: null,
      notes: null,
    };
    previewState.liveClasses.push(live);
    return live;
  }
  return (await unwrap(
    supabase().rpc("schedule_link_class", {
      p_course: input.course_id, p_lesson: input.lesson_id, p_title: input.title,
      p_platform: input.platform, p_date: input.scheduled_date,
      p_start: input.start_time, p_end: input.end_time,
      p_url: providerUrl(input.meeting_url, input.platform), p_notes: input.notes ?? null,
    }),
  )) as LiveClass;
}

/** status is not in the update grant; it only moves through this function. */
export async function setLiveClassStatus(liveClassId: string, status: "scheduled" | "live" | "completed" | "cancelled"): Promise<void> {
  if (preview()) {
    const live = previewState.liveClasses.find((l) => l.id === liveClassId);
    if (live) live.status = status;
    return;
  }
  await unwrap(supabase().rpc("set_live_class_status", { p_class_id: liveClassId, p_status: status }));
}

export async function attachClassRecording(liveClassId: string, youtubeUrl: string): Promise<void> {
  if (preview()) {
    const live = previewState.liveClasses.find((l) => l.id === liveClassId);
    if (live) {
      live.recording_youtube_url = youtubeUrl;
      live.recording_youtube_id = youtubeUrl.match(/(?:v=|youtu\.be\/)([\w-]{6,})/)?.[1] ?? null;
    }
    return;
  }
  await unwrap(supabase().rpc("attach_class_recording", { p_class_id: liveClassId, p_youtube_url: youtubeUrl }));
}

/**
 * Resolve an authorized provider destination without downloading a pointer file.
 */
export async function learningResourceUrl(storagePath: string): Promise<string> {
  if (preview()) return sessionStorage.getItem(`ican.preview.link.${storagePath}`) || previewSignedUrl(storagePath);
  return (await unwrap(
    supabase().rpc("resolve_learning_link", { p_path: storagePath }),
  )) as string;
}

/** Repair an existing resource without changing its curriculum identity. */
export async function configureLearningLink(path: string, target: string, provider: string): Promise<void> {
  const url = providerUrl(target, provider);
  if (preview()) return;
  await unwrap(supabase().rpc("configure_learning_link", { p_path: path, p_url: url }));
}

/* ---------------------------------------------------------------- grading */

export async function pendingSubmissions(): Promise<AssignmentSubmission[]> {
  if (preview()) {
    const ids = new Set(previewTutorCourses().map(c => c.id));
    return previewState.submissions.filter(s => s.status === "submitted" && previewState.assignments.some(a => a.id === s.assignment_id && ids.has(a.course_id)));
  }
  return (await unwrap(
    supabase().from("assignment_submissions").select("*").eq("status", "submitted").order("submitted_at"),
  )) as AssignmentSubmission[];
}

export async function gradeSubmission(input: {
  submission_id: string;
  score: number;
  feedback: string | null;
}): Promise<void> {
  if (preview()) {
    const submission = previewState.submissions.find((s) => s.id === input.submission_id);
    if (submission) {
      Object.assign(submission, { status: "graded", score: input.score, feedback: input.feedback, graded_at: new Date().toISOString() });
    }
    return;
  }
  await unwrap(supabase().rpc("grade_assignment", { p_submission_id: input.submission_id, p_score: input.score, p_feedback: input.feedback }));
}

/** Profiles a tutor may see: students enrolled in their courses, or admins. */
export async function visibleStudents(): Promise<Profile[]> {
  if (preview()) return previewState.profiles.filter((p) => p.role === "student");
  return (await unwrap(
    supabase().from("profiles").select("*").eq("role", "student").order("full_name"),
  )) as Profile[];
}

/* ------------------------------------------------------------- tutor/admin */

export async function tutorApplications(): Promise<TutorApplication[]> {
  if (preview()) return [...previewState.applications];
  return (await unwrap(
    supabase().from("tutor_applications").select("*").order("created_at", { ascending: false }),
  )) as TutorApplication[];
}

/** Takes the user id and a boolean, not an application id. */
export async function decideTutor(userId: string, approve: boolean, note?: string | null): Promise<void> {
  if (preview()) {
    const application = previewState.applications.find((a) => a.user_id === userId);
    if (application) {
      application.status = approve ? "approved" : "rejected";
      application.review_note = note ?? null;
    }
    const profile = previewState.profiles.find((p) => p.id === userId);
    if (profile) profile.status = approve ? "active" : "active";
    return;
  }
  await unwrap(supabase().rpc("approve_tutor", { p_user_id: userId, p_decision: approve, p_note: note ?? null }));
}

export async function setAccountStatus(userId: string, status: "active" | "suspended", note?: string | null): Promise<void> {
  if (preview()) {
    const profile = previewState.profiles.find((p) => p.id === userId);
    if (profile) {
      profile.status = status;
      profile.status_note = note ?? null;
    }
    return;
  }
  await unwrap(supabase().rpc("set_user_status", { p_user_id: userId, p_status: status, p_note: note ?? null }));
}

export async function setUserRole(userId: string, role: "student" | "tutor" | "admin"): Promise<void> {
  if (preview()) {
    const profile = previewState.profiles.find((p) => p.id === userId);
    if (profile) profile.role = role;
    return;
  }
  await unwrap(supabase().rpc("set_user_role", { p_user_id: userId, p_role: role }));
}

/** Admin-only directory joins account emails without exposing auth tables to the browser. */
export async function adminUserDirectory(): Promise<(Profile & {email: string | null})[]> {
  if (preview()) return previewState.profiles.map(profile => ({...profile, email: previewState.applications.find(application => application.user_id === profile.id)?.email ?? null}));
  return await unwrap(supabase().rpc("admin_user_directory")) as (Profile & {email: string | null})[];
}

export async function listProfiles(): Promise<Profile[]> {
  if (preview()) return [...previewState.profiles];
  return (await unwrap(supabase().from("profiles").select("*").order("created_at", { ascending: false }))) as Profile[];
}

export async function reviewQueueCourses(): Promise<Course[]> {
  if (preview()) return previewState.courses.filter((c) => c.status === "pending_review");
  return (await unwrap(
    supabase().from("courses").select("*").eq("status", "pending_review").order("submitted_at"),
  )) as Course[];
}

export async function allAnnouncements(): Promise<Announcement[]> {
  if (preview()) return [...previewState.announcements];
  return (await unwrap(supabase().from("announcements").select("*").order("created_at", { ascending: false }))) as Announcement[];
}

export async function createAnnouncement(input: {
  title: string;
  body: string | null;
  audience: string;
  status: string;
  scheduled_for: string | null;
  published_at: string | null;
}): Promise<Announcement | null> {
  if (preview()) {
    const announcement: Announcement = { ...input, id: `an-preview-${Date.now() }` } as Announcement;
    previewState.announcements.unshift(announcement);
    return announcement;
  }
  return (await unwrap(
    supabase().from("announcements").insert({ ...input, created_by: await me() }).select("*").single(),
  )) as Announcement;
}

export async function updateAnnouncement(
  announcementId: string,
  input: { title?: string; body?: string | null; audience?: string; status?: string; scheduled_for?: string | null; published_at?: string | null },
): Promise<void> {
  if (preview()) {
    const announcement = previewState.announcements.find((a) => a.id === announcementId);
    if (announcement) Object.assign(announcement, input);
    return;
  }
  await unwrap(supabase().from("announcements").update(input).eq("id", announcementId));
}

export async function deleteAnnouncement(announcementId: string): Promise<void> {
  if (preview()) {
    previewState.announcements = previewState.announcements.filter((a) => a.id !== announcementId);
    return;
  }
  await unwrap(supabase().from("announcements").delete().eq("id", announcementId));
}

/* ----------------------------------------------------------- notifications */

export async function notifications(): Promise<AppNotification[]> {
  if (preview()) return previewState.notifications.filter(n => n.user_id === previewState.profile?.id);
  return (await unwrap(
    supabase().from("notifications").select("*").order("created_at", { ascending: false }).limit(50),
  )) as AppNotification[];
}

export async function markNotificationRead(notificationId: string): Promise<void> {
  if (preview()) {
    const notification = previewState.notifications.find((n) => n.id === notificationId && n.user_id === previewState.profile?.id);
    if (notification) notification.read_at = new Date().toISOString();
    return;
  }
  await unwrap(supabase().rpc("mark_notification_read", { p_notification_id: notificationId }));
}

export async function markAllNotificationsRead(): Promise<void> {
  if (preview()) {
    for (const notification of previewState.notifications) {
      if (notification.user_id === previewState.profile?.id && !notification.read_at) notification.read_at = new Date().toISOString();
    }
    return;
  }
  await unwrap(supabase().rpc("mark_all_notifications_read"));
}

/** The unread count the sidebar badge paints. Never throws at the caller: a
 *  badge that fails to load is simply not drawn. */
export async function unreadNotificationCount(): Promise<number> {
  if (preview()) return previewState.notifications.filter((n) => n.user_id === previewState.profile?.id && n.read_at === null).length;
  return (await unwrap(supabase().rpc("unread_notification_count"))) as number;
}

export { friendlyError };
export async function managedSubmissions():Promise<AssignmentSubmission[]> {
 if(config.preview){const ids=new Set(previewTutorCourses().map(c=>c.id));return previewState.submissions.filter(s=>previewState.assignments.some(a=>a.id===s.assignment_id&&ids.has(a.course_id)));}
 return await unwrap(supabase().from('assignment_submissions').select('*').order('submitted_at',{ascending:false}).limit(1000)) as AssignmentSubmission[];
}
