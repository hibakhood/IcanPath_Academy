import curriculum from './ican-curriculum-v2.json' with {type:'json'};
/**
 * Fixture data for preview mode.
 *
 * Shaped exactly like the rows the real queries return — including the columns
 * the database deliberately withholds, which are absent here too, so a screen
 * developed against this cannot come to depend on them.
 */

import type {
  ActivityItem,
  AdminStats,
  AnalyticsData,
  Announcement,
  AppNotification,
  AppRole,
  Assignment,
  AssignmentResult,
  AssignmentSubmission,
  AuditEntry,
  ContinueLearning,
  Course,
  CourseModule,
  CourseProgress,
  Enrollment,
  Lesson,
  LessonMaterial,
  LiveClass,
  Profile,
  QuestionType,
  Quiz,
  QuizAttempt,
  StudentStats,
  SystemStats,
  TopCourse,
  TutorApplication,
  TutorCourseMetric,
  TutorStats,
  TutorStudent,
  TutorStudentActivity,
  UpcomingClass,
} from "./types.ts";

const now = new Date();
const shift = (days: number, hour = 9): Date => {
  const d = new Date(now);
  d.setDate(d.getDate() + days);
  d.setHours(hour, 0, 0, 0);
  return d;
};
const at = (days: number, hour = 9): string => shift(days, hour).toISOString();
const dateOnly = (days: number): string => shift(days).toISOString().slice(0, 10);

export interface PreviewState {
  role: AppRole;
  profile: Profile | null;
  profiles: Profile[];
  courses: Course[];
  modules: CourseModule[];
  lessons: Lesson[];
  materials: LessonMaterial[];
  liveClasses: LiveClass[];
  quizzes: Quiz[];
  questions: Array<{ id: string; quiz_id: string; position: number; prompt: string; question_type: QuestionType; options: string[] | null; correct_answer: string; explanation: string | null; points: number }>;
  assignments: Assignment[];
  submissions: AssignmentSubmission[];
  enrollments: Enrollment[];
  announcements: Announcement[];
  notifications: AppNotification[];
  auditLogs: AuditEntry[];
  applications: TutorApplication[];
  progress: Array<{ student_id: string; lesson_id: string; completed: boolean; progress_percentage: number }>;
  attempts: QuizAttempt[];
}

export const previewState: PreviewState = {
  role: "student",
  profile: null,
  profiles: [],
  courses: [],
  modules: [],
  lessons: [],
  materials: [],
  liveClasses: [],
  quizzes: [],
  questions: [],
  assignments: [],
  submissions: [],
  enrollments: [],
  announcements: [],
  notifications: [],
  auditLogs: [],
  applications: [],
  progress: [],
  attempts: [],
};

const person = (
  id: string,
  role: AppRole,
  full_name: string,
  status: Profile["status"] = "active",
  level: string | null = null,
): Profile => ({
  id,
  role,
  status,
  full_name,
  phone: null,
  avatar_url: null,
  level,
  status_note: status === "suspended" ? "You have an unpaid fee. Contact the office." : null,
  created_at: at(-120),
});

export function seedPreview(): void {
  const student = person("p-student", "student", "Ada Mensah", "active", "Foundation");
  const tutor = person("p-tutor", "tutor", "Kwame Boateng");
  const tutor2 = person("p-tutor2", "tutor", "Efua Danso");
  const pendingTutor = person("p-pending", "tutor", "Kofi Asante", "pending");
  const admin = person("p-admin", "admin", "Grace Owusu");
  const student2 = person("p-student2", "student", "Yaw Antwi", "active", "Skills");
  const student3 = person("p-student3", "student", "Adwoa Serwaa", "active", "Professional");
  const suspended = person("p-suspended", "student", "Ama Darko", "suspended");

  previewState.profiles = [student, tutor, tutor2, pendingTutor, admin, student2, student3, suspended];

  const maths: Course = {
    id: "c-maths",
    code: "ICAN-MATH-01",
    title: "WAEC Mathematics",
    description: "Full preparation for the WAEC Mathematics examination, from number through to calculus.",
    level: "Foundation",
    plan: "Foundation",
    thumbnail_url: null,
    status: "published",
    created_by: tutor.id,
    submitted_at: at(-42),
    reviewed_at: at(-40),
    published_at: at(-40),
    review_note: "Meets the content standard.",
  };
  const english: Course = {
    id: "c-english",
    code: "ICAN-ENG-02",
    title: "English Language",
    description: "Comprehension, grammar and essay craft for the WAEC and GCE papers.",
    level: "Foundation",
    plan: "Foundation",
    thumbnail_url: null,
    status: "published",
    created_by: tutor2.id,
    submitted_at: at(-32),
    reviewed_at: at(-30),
    published_at: at(-30),
    review_note: null,
  };
  const draft: Course = {
    id: "c-physics",
    code: "ICAN-PHY-05",
    title: "Physics",
    description: "Not yet submitted for review.",
    level: "Skills",
    plan: "Skills",
    thumbnail_url: null,
    status: "draft",
    created_by: tutor.id,
    submitted_at: null,
    reviewed_at: null,
    published_at: null,
    review_note: null,
  };
  const inReview: Course = {
    ...draft,
    id: "c-chemistry",
    code: "ICAN-CHM-06",
    title: "Chemistry",
    description: "Awaiting an administrator decision.",
    status: "pending_review",
    submitted_at: at(-3),
  };
  const cost: Course = {
    id: "c-cost",
    code: "ICAN-CST-03",
    title: "Cost & Management Accounting",
    description: "Marginal costing, budgeting and variance analysis for the skills level.",
    level: "Skills",
    plan: "Skills",
    thumbnail_url: null,
    status: "published",
    created_by: tutor.id,
    submitted_at: at(-36),
    reviewed_at: at(-34),
    published_at: at(-34),
    review_note: null,
  };
  const strategy: Course = {
    id: "c-strategy",
    code: "ICAN-STR-04",
    title: "Corporate Strategy",
    description: "Environmental analysis and strategic choice for the professional paper.",
    level: "Professional",
    plan: "Professional",
    thumbnail_url: null,
    status: "published",
    created_by: tutor.id,
    submitted_at: at(-20),
    reviewed_at: at(-18),
    published_at: at(-18),
    review_note: null,
  };

  previewState.courses = [maths, english, cost, strategy, draft, inReview];

  previewState.modules = [
    { id: "m-number", course_id: maths.id, title: "Number", position: 1 },
    { id: "m-algebra", course_id: maths.id, title: "Algebra", position: 2 },
    { id: "m-comprehension", course_id: english.id, title: "Comprehension", position: 1 },
    { id: "m-costing", course_id: cost.id, title: "Costing methods", position: 1 },
    { id: "m-budget", course_id: cost.id, title: "Budgeting", position: 2 },
    { id: "m-strategy", course_id: strategy.id, title: "Strategy analysis", position: 1 },
  ];

  previewState.lessons = [
    { id: "l-fractions", module_id: "m-number", course_id: maths.id, title: "Fractions", description: "Adding and subtracting fractions, and finding equivalent forms.", position: 1, is_published: true, youtube_video_url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", youtube_video_id: "dQw4w9WgXcQ" },
    { id: "l-decimals", module_id: "m-number", course_id: maths.id, title: "Decimals", description: "Place value and rounding.", position: 2, is_published: true, youtube_video_url: null, youtube_video_id: null },
    { id: "l-quadratics", module_id: "m-algebra", course_id: maths.id, title: "Quadratic equations", description: "Factorising and the quadratic formula.", position: 1, is_published: false, youtube_video_url: null, youtube_video_id: null },
    { id: "l-percentages", module_id: "m-algebra", course_id: maths.id, title: "Percentages", description: "Percentage change and reverse percentages.", position: 2, is_published: true, youtube_video_url: null, youtube_video_id: null },
    { id: "l-essay", module_id: "m-comprehension", course_id: english.id, title: "Essay writing", description: "Structuring an argument under timed conditions.", position: 1, is_published: true, youtube_video_url: null, youtube_video_id: null },
    { id: "l-marginal", module_id: "m-costing", course_id: cost.id, title: "Marginal costing", description: "Absorption against marginal profit.", position: 1, is_published: true, youtube_video_url: null, youtube_video_id: null },
    { id: "l-budgeting", module_id: "m-budget", course_id: cost.id, title: "Flexible budgets", description: "Budgets that flex with activity.", position: 1, is_published: true, youtube_video_url: null, youtube_video_id: null },
    { id: "l-env", module_id: "m-strategy", course_id: strategy.id, title: "Environmental analysis", description: "PESTLE and industry mapping.", position: 1, is_published: true, youtube_video_url: null, youtube_video_id: null },
    { id: "l-choices", module_id: "m-strategy", course_id: strategy.id, title: "Strategic choices", description: "Where to compete and how to win.", position: 2, is_published: true, youtube_video_url: null, youtube_video_id: null },
  ];

  previewState.materials = [
    { id: "mat-notes", lesson_id: "l-fractions", course_id: maths.id, title: "Fractions notes", type: "lecture_note", description: "Worked examples.", storage_path: `courses/${maths.id}/materials/mat-notes.url`, position: 1 },
    { id: "mat-practice", lesson_id: "l-decimals", course_id: maths.id, title: "Practice questions", type: "practice_questions", description: null, storage_path: `courses/${maths.id}/materials/mat-practice.url`, position: 1 },
  ];

  previewState.liveClasses = [
    { id: "live-fractions", course_id: maths.id, lesson_id: "l-fractions", title: "Fractions live session", platform: "youtube_live", scheduled_date: dateOnly(2), start_time: "18:00:00", end_time: "19:00:00", status: "scheduled", recording_youtube_url: null, recording_youtube_id: null, notes: null, course_title: maths.title },
    { id: "live-comprehension", course_id: english.id, lesson_id: null, title: "Comprehension clinic", platform: "google_meet", scheduled_date: dateOnly(4), start_time: "17:00:00", end_time: "18:00:00", status: "scheduled", recording_youtube_url: null, recording_youtube_id: null, notes: null, course_title: english.title },
    { id: "live-budget", course_id: cost.id, lesson_id: null, title: "Budgeting workshop", platform: "zoom", scheduled_date: dateOnly(6), start_time: "18:30:00", end_time: "19:30:00", status: "scheduled", recording_youtube_url: null, recording_youtube_id: null, notes: null, course_title: cost.title },
    { id: "live-strategy", course_id: strategy.id, lesson_id: null, title: "Strategy review", platform: "youtube_live", scheduled_date: dateOnly(9), start_time: "16:00:00", end_time: "17:00:00", status: "scheduled", recording_youtube_url: null, recording_youtube_id: null, notes: null, course_title: strategy.title },
    { id: "live-essay", course_id: english.id, lesson_id: null, title: "Essay clinic", platform: "google_meet", scheduled_date: dateOnly(-7), start_time: "17:00:00", end_time: "18:00:00", status: "completed", recording_youtube_url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", recording_youtube_id: "dQw4w9WgXcQ", notes: "Went over introductions.", course_title: english.title },
  ];

  previewState.quizzes = [
    { id: "q-fractions", course_id: maths.id, lesson_id: "l-fractions", title: "Fractions check", instructions: "Answer every question. You may attempt this twice.", time_limit_minutes: 15, passing_score: 50, attempt_limit: 2, due_at: at(5), is_published: true, course_title: maths.title },
    { id: "q-algebra", course_id: maths.id, lesson_id: "l-quadratics", title: "Algebra practice", instructions: null, time_limit_minutes: null, passing_score: 60, attempt_limit: 1, due_at: null, is_published: false, course_title: maths.title },
    { id: "q-budget", course_id: cost.id, lesson_id: "l-budgeting", title: "Budgeting check", instructions: "Twenty minutes, one attempt.", time_limit_minutes: 20, passing_score: 50, attempt_limit: 1, due_at: at(9), is_published: true, course_title: cost.title },
    { id: "q-strategy", course_id: strategy.id, lesson_id: "l-env", title: "Strategy check", instructions: null, time_limit_minutes: 25, passing_score: 55, attempt_limit: 1, due_at: at(12), is_published: true, course_title: strategy.title },
  ];

  previewState.questions = [
    { id: "qq-half", quiz_id: "q-fractions", position: 1, prompt: "What is half of 10?", question_type: "mcq", options: ["3", "5", "7"], correct_answer: "5", explanation: "10 ÷ 2 = 5.", points: 1 },
    { id: "qq-sum", quiz_id: "q-fractions", position: 2, prompt: "Simplify 1/2 + 1/2", question_type: "mcq", options: ["1", "1/2", "2"], correct_answer: "1", explanation: "Two halves make a whole.", points: 1 },
    { id: "qq-denominator", quiz_id: "q-fractions", position: 3, prompt: "Name the denominator of 3/7", question_type: "short_answer", options: null, correct_answer: "7", explanation: "The bottom number is the denominator.", points: 2 },
    { id: "qq-fixed", quiz_id: "q-budget", position: 1, prompt: "A cost that does not change with activity is…", question_type: "mcq", options: ["Variable", "Fixed", "Semi-variable"], correct_answer: "Fixed", explanation: "Fixed costs stay constant across the relevant range.", points: 2 },
    { id: "qq-flex", quiz_id: "q-budget", position: 2, prompt: "A flexed budget adjusts for activity.", question_type: "true_false", options: ["True", "False"], correct_answer: "True", explanation: "That is the point of flexing a budget.", points: 1 },
    { id: "qq-soar", quiz_id: "q-strategy", position: 1, prompt: "Which tool scans the wider environment?", question_type: "mcq", options: ["PESTLE", "BCG", "Ansoff"], correct_answer: "PESTLE", explanation: "PESTLE reads the macro environment.", points: 2 },
  ];

  previewState.assignments = [
    { id: "a-ex1", course_id: maths.id, lesson_id: null, title: "Exercise 1", instructions: "Show all working.", due_at: at(7), max_score: 20, is_published: true, results_published: true, course_title: maths.title },
    { id: "a-ex2", course_id: maths.id, lesson_id: null, title: "Exercise 2", instructions: null, due_at: at(14), max_score: 50, is_published: true, results_published: false, course_title: maths.title },
    { id: "a-essay", course_id: english.id, lesson_id: null, title: "Essay plan", instructions: "One page.", due_at: at(3), max_score: 30, is_published: true, results_published: false, course_title: english.title },
    { id: "a-pack", course_id: english.id, lesson_id: null, title: "Comprehension pack", instructions: "Answer all five passages.", due_at: at(8), max_score: 25, is_published: true, results_published: false, course_title: english.title },
    { id: "a-case", course_id: cost.id, lesson_id: null, title: "Case study", instructions: "Two pages, cite your assumptions.", due_at: at(10), max_score: 40, is_published: true, results_published: false, course_title: cost.title },
  ];

  previewState.submissions = [
    { id: "sub-ex1-ada", assignment_id: "a-ex1", student_id: student.id, response_text: "My working for exercise 1.", status: "graded", score: 18, feedback: "Good effort. Watch the signs in part two.", graded_at: at(-2), submitted_at: at(-4) },
    { id: "sub-ex2-ada", assignment_id: "a-ex2", student_id: student.id, response_text: "Submitted ahead of the deadline.", status: "submitted", score: null, feedback: null, graded_at: null, submitted_at: at(-3) },
    { id: "sub-ex1-yaw", assignment_id: "a-ex1", student_id: student2.id, response_text: "Second student's answers.", status: "submitted", score: null, feedback: null, graded_at: null, submitted_at: at(-1) },
    { id: "sub-case-ada", assignment_id: "a-case", student_id: student.id, response_text: "Case study with worked assumptions.", status: "submitted", score: null, feedback: null, graded_at: null, submitted_at: at(-2) },
    { id: "sub-case-yaw", assignment_id: "a-case", student_id: student2.id, response_text: "My case study submission.", status: "submitted", score: null, feedback: null, graded_at: null, submitted_at: at(-1) },
  ];

  previewState.enrollments = [
    { id: "en-1", course_id: maths.id, student_id: student.id, status: "active", enrolled_at: at(-38) },
    { id: "en-2", course_id: english.id, student_id: student.id, status: "active", enrolled_at: at(-28) },
    { id: "en-3", course_id: maths.id, student_id: student2.id, status: "active", enrolled_at: at(-20) },
    { id: "en-4", course_id: cost.id, student_id: student.id, status: "active", enrolled_at: at(-26) },
    { id: "en-5", course_id: strategy.id, student_id: student.id, status: "active", enrolled_at: at(-16) },
    { id: "en-6", course_id: cost.id, student_id: student2.id, status: "active", enrolled_at: at(-14) },
    { id: "en-7", course_id: cost.id, student_id: student3.id, status: "active", enrolled_at: at(-9) },
    { id: "en-8", course_id: strategy.id, student_id: student3.id, status: "active", enrolled_at: at(-9) },
  ];

  previewState.progress = [
    { student_id: student.id, lesson_id: "l-fractions", completed: true, progress_percentage: 100 },
    { student_id: student.id, lesson_id: "l-decimals", completed: false, progress_percentage: 40 },
    { student_id: student.id, lesson_id: "l-percentages", completed: true, progress_percentage: 100 },
    { student_id: student.id, lesson_id: "l-essay", completed: true, progress_percentage: 100 },
    { student_id: student.id, lesson_id: "l-marginal", completed: true, progress_percentage: 100 },
    { student_id: student.id, lesson_id: "l-budgeting", completed: true, progress_percentage: 100 },
    { student_id: student.id, lesson_id: "l-env", completed: true, progress_percentage: 100 },
    { student_id: student.id, lesson_id: "l-choices", completed: false, progress_percentage: 30 },
    { student_id: student2.id, lesson_id: "l-fractions", completed: true, progress_percentage: 100 },
    { student_id: student2.id, lesson_id: "l-marginal", completed: true, progress_percentage: 100 },
    { student_id: student2.id, lesson_id: "l-budgeting", completed: false, progress_percentage: 55 },
    { student_id: student3.id, lesson_id: "l-marginal", completed: true, progress_percentage: 100 },
    { student_id: student3.id, lesson_id: "l-env", completed: false, progress_percentage: 20 },
  ];

  previewState.attempts = [
    { id: "qa-fractions-1", quiz_id: "q-fractions", student_id: student.id, attempt_number: 1, started_at: at(-4, 14), submitted_at: at(-4), status: "graded", score: 3, max_score: 4, percentage: 75, passed: true },
    { id: "qa-budget-1", quiz_id: "q-budget", student_id: student.id, attempt_number: 1, started_at: at(0, 10), submitted_at: null, status: "in_progress", score: null, max_score: null, percentage: null, passed: null },
  ];

  previewState.announcements = [
    { id: "an-terms", title: "Term dates confirmed", body: "Examinations begin on 12 March. Register at the front desk.", audience: "all", status: "published", scheduled_for: null, published_at: at(-3) },
    { id: "an-tutors", title: "Tutor briefing", body: "Tutors, please review the new marking guide.", audience: "tutors", status: "published", scheduled_for: null, published_at: at(-1) },
  ];

  previewState.notifications = [
    { id: "n-enrol", type: "enrollment", title: "You enrolled in WAEC Mathematics", body: "Your first lesson is ready.", link_path: "/student/courses/", read_at: null, created_at: at(-6) },
    { id: "n-enrol-cost", type: "enrollment", title: "You enrolled in Cost & Management Accounting", body: "Start with marginal costing.", link_path: "/student/courses/", read_at: null, created_at: at(-5) },
    { id: "n-lesson", type: "lesson_published", title: "New lesson in Corporate Strategy", body: "Strategic choices is now available.", link_path: "/student/courses/", read_at: null, created_at: at(-3) },
    { id: "n-quiz", type: "quiz_available", title: "Budgeting check is waiting", body: "One attempt, twenty minutes.", link_path: "/student/quizzes/", read_at: null, created_at: at(-3) },
    { id: "n-quiz-result", type: "quiz_result", title: "Fractions check was marked", body: "You scored 75% and passed.", link_path: "/student/quizzes/", read_at: null, created_at: at(-4) },
    { id: "n-assign", type: "assignment_created", title: "New assignment: Case study", body: "Due in ten days.", link_path: "/student/assignments/", read_at: null, created_at: at(-2) },
    { id: "n-graded", type: "assignment_graded", title: "Exercise 1 has been graded", body: "You scored 18 of 20.", link_path: "/student/assignments/", read_at: null, created_at: at(-2) },
    { id: "n-announce", type: "announcement", title: "Term dates confirmed", body: "Examinations begin on 12 March.", link_path: "/student/announcements/", read_at: null, created_at: at(-3) },
    { id: "n-reminder", type: "live_class_reminder", title: "Fractions live session starts soon", body: "It starts at 18:00.", link_path: "/student/live/", read_at: null, created_at: at(-1) },
    { id: "n-live", type: "live_class_scheduled", title: "Fractions live session scheduled", body: "It starts at 18:00.", link_path: "/student/live/", read_at: at(-1), created_at: at(-4) },
  ];

  for (const notification of previewState.notifications) notification.user_id = student.id;

  previewState.auditLogs = [
    { id: "audit-1", actor_id: tutor.id, action: "course_submitted_for_review", resource_type: "course", resource_id: maths.id, metadata: {}, created_at: at(-2, 11) },
    { id: "audit-2", actor_id: admin.id, action: "tutor_approved", resource_type: "profile", resource_id: tutor.id, metadata: {}, created_at: at(-4, 10) },
    { id: "audit-3", actor_id: tutor2.id, action: "assignment_published", resource_type: "assignment", resource_id: maths.id, metadata: {}, created_at: at(-9, 9) },
  ];

  previewState.applications = [
    { id: "ta-kofi", user_id: pendingTutor.id, status: "pending", headline: "Mathematics, ICT", bio: "Taught for six years.", specialties: null, review_note: null, created_at: at(-3), full_name: "Kofi Asante", email: "kofi@example.test" },
  ];
  const original=previewState.courses[0]!;
  previewState.courses=curriculum.map((c,i)=>({...original,id:i===0?'c-maths':`ican-${c.code.toLowerCase()}`,code:c.code,title:c.title,description:`ICAN ${c.level} examination preparation.`,level:c.level,created_by:tutor.id,status:'published'}));
  previewState.modules=[];previewState.lessons=[];
  for(const c of curriculum){const course=previewState.courses.find(x=>x.code===c.code)!;c.modules.forEach((title,i)=>{const id=`ican-${c.code}-m${i+1}`;previewState.modules.push({id,course_id:course.id,title,position:i+1});});}
  previewState.materials=[];previewState.liveClasses=[];previewState.quizzes=[];previewState.questions=[];previewState.assignments=[];previewState.submissions=[];previewState.progress=[];previewState.attempts=[];previewState.notifications=[];
  previewState.enrollments=previewState.courses.slice(0,3).map((c,i)=>({id:`ican-en-${i}`,course_id:c.id,student_id:student.id,status:'active',enrolled_at:at(-2)}));
  // Browser-only preview changes survive navigation within the local tab session.
  if(typeof window!=='undefined')try{const saved=sessionStorage.getItem('ican.preview.curriculum.v2');if(saved){const data=JSON.parse(saved) as PreviewState;if(data.courses?.length&&data.profiles?.length)Object.assign(previewState,data);}window.addEventListener('beforeunload',()=>sessionStorage.setItem('ican.preview.curriculum.v2',JSON.stringify(previewState)));}catch{/* Preview persistence is optional when browser storage is unavailable. */}

}

/* -------------------------------------------------------- derived readings */

/** Falls back to the student persona so the fixtures work before auth runs. */
const myEnrolledCourseIds = (): string[] =>
  previewState.enrollments
    .filter(
      (e) =>
        e.student_id === (previewState.profile?.id || previewPersonaId("student")) &&
        e.status === "active",
    )
    .map((e) => e.course_id);

/** The fixture id for a role, so the preview helpers work before auth runs. */
export function previewPersonaId(role: "student" | "tutor" | "admin"): string {
  return previewState.profiles.find((p) => p.role === role)?.id ?? "";
}

export function previewStudentStats(): StudentStats {
  const me = previewState.profile?.id || previewPersonaId("student");
  const enrolled = myEnrolledCourseIds();
  const mine = previewState.progress.filter((p) => p.student_id === me);
  const done = mine.filter((p) => p.completed).length;
  const publishedLessons = previewState.lessons.filter(
    (l) => enrolled.includes(l.course_id) && l.is_published,
  );
  const totalLessons = publishedLessons.length;

  // Counted, not hardcoded: my_course_progress() derives these from
  // lesson_progress, so the fixtures must do the same or preview lies.
  const finishedCourses = enrolled.filter((courseId) => {
    const courseLessons = publishedLessons.filter((l) => l.course_id === courseId);
    if (courseLessons.length === 0) return false;
    return courseLessons.every((lesson) =>
      mine.some((p) => p.lesson_id === lesson.id && p.completed),
    );
  }).length;

  return {
    enrolled_courses: enrolled.length,
    in_progress: Math.max(0, enrolled.length - finishedCourses),
    completed: finishedCourses,
    upcoming_live_classes: previewState.liveClasses.filter(
      (l) => enrolled.includes(l.course_id) && l.status === "scheduled",
    ).length,
    pending_quizzes: previewState.quizzes.filter(
      (q) =>
        q.is_published &&
        enrolled.includes(q.course_id) &&
        !previewState.attempts.some(
          (a) => a.quiz_id === q.id && a.student_id === me && (a.status === "submitted" || a.status === "graded"),
        ),
    ).length,
    pending_assignments: previewState.assignments.filter(
      (a) =>
        a.is_published &&
        enrolled.includes(a.course_id) &&
        !previewState.submissions.some((s) => s.assignment_id === a.id && s.student_id === me),
    ).length,
    overall_progress: totalLessons === 0 ? 0 : Math.round((done / totalLessons) * 100),
    unread_notifications: previewState.notifications.filter((n) => n.user_id === (previewState.profile?.id ?? previewPersonaId("student")) && n.read_at === null).length,
  };
}

export function previewTutorStats(): TutorStats {
  const me = previewState.profile?.id || previewPersonaId("tutor");
  const mine = previewState.courses.filter((c) => c.created_by === me);
  const myCourseIds = mine.map((c) => c.id);
  const mySubmissionCount = (studentId: string) =>
    previewState.submissions.filter((s) =>
      previewState.assignments.some((a) => a.id === s.assignment_id && myCourseIds.includes(a.course_id) && s.student_id === studentId),
    ).length;
  return {
    total_courses: mine.length,
    published_courses: mine.filter((c) => c.status === "published").length,
    draft_courses: mine.filter((c) => c.status === "draft").length,
    pending_reviews: mine.filter((c) => c.status === "pending_review").length,
    total_students: new Set(
      previewState.enrollments
        .filter((e) => myCourseIds.includes(e.course_id))
        .map((e) => e.student_id),
    ).size,
    upcoming_live_classes: previewState.liveClasses.filter(
      (l) => myCourseIds.includes(l.course_id) && (l.status === "scheduled" || l.status === "live"),
    ).length,
    pending_grading: previewState.submissions.filter((s) => {
      const assignment = previewState.assignments.find((a) => a.id === s.assignment_id);
      return assignment ? myCourseIds.includes(assignment.course_id) && s.status === "submitted" && mySubmissionCount(s.student_id) >= 0 : false;
    }).length,
    in_progress_attempts: previewState.attempts.filter((a) => {
      const quiz = previewState.quizzes.find((q) => q.id === a.quiz_id);
      return quiz ? myCourseIds.includes(quiz.course_id) && a.status === "in_progress" : false;
    }).length,
  };
}

/** tutor_my_courses(): enrolment and completion are counted from the same rows
 *  the SQL counts, so preview and database agree when the fixtures change. */
export function previewTutorCourses(): TutorCourseMetric[] {
  const me = previewState.profile?.id || previewPersonaId("tutor");
  const order: Record<string, number> = { published: 0, pending_review: 1, draft: 2, archived: 3 };

  return previewState.courses
    .filter((c) => c.created_by === me)
    .map((course) => {
      const students = new Set(
        previewState.enrollments
          .filter((e) => e.course_id === course.id && e.status === "active")
          .map((e) => e.student_id),
      );
      const lessons = previewState.lessons.filter((l) => l.course_id === course.id && l.is_published);
      const completed = previewState.progress.filter(
        (p) => p.completed && students.has(p.student_id) && lessons.some((l) => l.id === p.lesson_id),
      ).length;
      const denominator = students.size * lessons.length;
      return {
        id: course.id,
        title: course.title,
        code: course.code,
        status: course.status,
        thumbnail_url: course.thumbnail_url,
        students: students.size,
        progress: denominator === 0 ? 0 : Math.round((completed / denominator) * 100),
      };
    })
    .sort((a, b) => (order[a.status] ?? 4) - (order[b.status] ?? 4) || a.title.localeCompare(b.title));
}

/** tutor_student_activity(): submissions, marked work, quiz attempts and
 *  enrolments across the tutor's own courses, newest first. */
export function previewTutorActivity(): TutorStudentActivity[] {
  const me = previewState.profile?.id || previewPersonaId("tutor");
  const courseIds = new Set(previewState.courses.filter((c) => c.created_by === me).map((c) => c.id));
  const nameOf = (id: string) => previewState.profiles.find((p) => p.id === id)?.full_name ?? "A student";
  const titleOf = (id: string) => previewState.courses.find((c) => c.id === id)?.title ?? "a course";
  const rows: TutorStudentActivity[] = [];

  for (const submission of previewState.submissions) {
    const assignment = previewState.assignments.find((a) => a.id === submission.assignment_id);
    if (!assignment || !courseIds.has(assignment.course_id)) continue;
    if (submission.status === "submitted") {
      rows.push({
        student_id: submission.student_id,
        student_name: nameOf(submission.student_id),
        course_title: titleOf(assignment.course_id),
        action: `submitted “${assignment.title}”`,
        occurred_at: submission.submitted_at,
      });
    } else if (submission.status === "graded" && submission.graded_at) {
      rows.push({
        student_id: submission.student_id,
        student_name: nameOf(submission.student_id),
        course_title: titleOf(assignment.course_id),
        action: `had “${assignment.title}” marked`,
        occurred_at: submission.graded_at,
      });
    }
  }

  for (const attempt of previewState.attempts) {
    if (!attempt.submitted_at) continue;
    if (attempt.status !== "submitted" && attempt.status !== "graded") continue;
    const quiz = previewState.quizzes.find((q) => q.id === attempt.quiz_id);
    if (!quiz || !courseIds.has(quiz.course_id)) continue;
    rows.push({
      student_id: attempt.student_id,
      student_name: nameOf(attempt.student_id),
      course_title: titleOf(quiz.course_id),
      action: `submitted the quiz “${quiz.title}”`,
      occurred_at: attempt.submitted_at,
    });
  }

  for (const enrollment of previewState.enrollments) {
    if (!courseIds.has(enrollment.course_id)) continue;
    rows.push({
      student_id: enrollment.student_id,
      student_name: nameOf(enrollment.student_id),
      course_title: titleOf(enrollment.course_id),
      action: "enrolled in this course",
      occurred_at: enrollment.enrolled_at,
    });
  }

  return rows.sort((a, b) => b.occurred_at.localeCompare(a.occurred_at)).slice(0, 6);
}

/** tutor_my_students(): the roster, counted from the same enrolments, lessons
 *  and progress rows the SQL counts, so preview and database agree. */
export function previewTutorStudents(): TutorStudent[] {
  const me = previewState.profile?.id || previewPersonaId("tutor");
  const mine = new Set(previewState.courses.filter((c) => c.created_by === me).map((c) => c.id));
  const lessonCourse = new Map(previewState.lessons.map((l) => [l.id, l.course_id]));
  const publishedByCourse = new Map<string, number>();
  for (const lesson of previewState.lessons) {
    if (!lesson.is_published || !mine.has(lesson.course_id)) continue;
    publishedByCourse.set(lesson.course_id, (publishedByCourse.get(lesson.course_id) ?? 0) + 1);
  }

  const rows = new Map<string, TutorStudent>();
  for (const enrollment of previewState.enrollments) {
    if (enrollment.status !== "active" || !mine.has(enrollment.course_id)) continue;
    const total = publishedByCourse.get(enrollment.course_id) ?? 0;
    const done = previewState.progress.filter(
      (p) =>
        p.student_id === enrollment.student_id &&
        p.completed &&
        lessonCourse.get(p.lesson_id) === enrollment.course_id,
    ).length;

    const profile = previewState.profiles.find((p) => p.id === enrollment.student_id);
    const row = rows.get(enrollment.student_id);
    if (row) {
      row.courses += 1;
      row.lessons_total += total;
      row.lessons_done += done;
    } else {
      rows.set(enrollment.student_id, {
        student_id: enrollment.student_id,
        full_name: profile?.full_name ?? "Unnamed student",
        level: profile?.level ?? null,
        status: profile?.status ?? "active",
        courses: 1,
        lessons_total: total,
        lessons_done: done,
        progress: 0,
        last_activity: null,
      });
    }
  }

  const lastActivity = (studentId: string): string | null => {
    const stamps: string[] = [];
    for (const submission of previewState.submissions) {
      const assignment = previewState.assignments.find((a) => a.id === submission.assignment_id);
      if (submission.student_id === studentId && assignment && mine.has(assignment.course_id)) {
        stamps.push(submission.submitted_at);
      }
    }
    for (const attempt of previewState.attempts) {
      const quiz = previewState.quizzes.find((q) => q.id === attempt.quiz_id);
      if (attempt.student_id === studentId && attempt.submitted_at && quiz && mine.has(quiz.course_id)) {
        stamps.push(attempt.submitted_at);
      }
    }
    for (const enrollment of previewState.enrollments) {
      if (enrollment.student_id === studentId && mine.has(enrollment.course_id)) stamps.push(enrollment.enrolled_at);
    }
    return stamps.sort().at(-1) ?? null;
  };

  for (const row of rows.values()) {
    row.progress = row.lessons_total === 0 ? 0 : Math.round((row.lessons_done / row.lessons_total) * 100);
    row.last_activity = lastActivity(row.student_id);
  }

  return [...rows.values()].sort((a, b) => a.full_name.localeCompare(b.full_name));
}

export function previewAdminStats(): AdminStats {
  return {
    total_students: previewState.profiles.filter((p) => p.role === "student").length,
    active_students: previewState.profiles.filter((p) => p.role === "student" && p.status === "active").length,
    tutors: previewState.profiles.filter((p) => p.role === "tutor").length,
    pending_tutor_approvals: previewState.applications.filter((a) => a.status === "pending").length,
    courses: previewState.courses.length,
    published_courses: previewState.courses.filter((c) => c.status === "published").length,
    courses_awaiting_review: previewState.courses.filter((c) => c.status === "pending_review").length,
    enrollments: previewState.enrollments.length,
    upcoming_live_classes: previewState.liveClasses.filter((l) => l.status === "scheduled" || l.status === "live").length,
    recent_activity: previewState.auditLogs.filter((a) => Date.now() - new Date(a.created_at).getTime() < 7 * 86_400_000).length,
    total_revenue: 24850,
    student_growth: 12.5,
    tutor_growth: 8.4,
    course_growth: 15.7,
    enrollment_growth: 20.3,
    live_class_growth: 28.6,
    revenue_growth: 18.7,
  };
}

export function previewAnalyticsData(): AnalyticsData {
  const students = previewState.profiles.filter((p) => p.role === "student").length;
  const enrollments = previewState.enrollments.filter((e) => e.status === "active").length;
  return {
    labels: ["Current"],
    students: [students],
    enrollments: [enrollments],
    revenue: [],
  };
}

export function previewActivityItems(): ActivityItem[] {
  return previewState.auditLogs.slice(0, 7).map((row) => ({ id: row.id, type: "other" as const, message: row.action.replaceAll("_", " "), time_ago: "recently", icon: "check" }));
}

export function previewTopCourses(): TopCourse[] {
  return previewState.courses.slice(0, 5).map((course) => ({ id: course.id, title: course.title, students: previewState.enrollments.filter((e) => e.course_id === course.id && e.status === "active").length, progress: 0, thumbnail: "" }));
}

export function previewSystemStats(): SystemStats {
  return {
    active_students: 1876,
    active_students_pct: 76,
    active_tutors: 98,
    active_tutors_pct: 69,
    published_courses: 276,
    published_courses_pct: 85,
    uptime: "99.9%",
    uptime_status: "Excellent",
    storage_used: "256 GB",
    storage_pct: 48,
    bandwidth_used: "1.2 TB",
    bandwidth_pct: 62,
  };
}

export function previewUpcomingClasses(): UpcomingClass[] {
  return previewState.liveClasses.filter((row) => row.status === "scheduled" || row.status === "live").map((row) => ({
    id: row.id, title: row.title, course: previewState.courses.find((course) => course.id === row.course_id)?.title ?? "ICAN course",
    date: row.scheduled_date, time: row.start_time, platform: row.platform, platform_icon: "video",
  }));
}

export function previewCourseProgress(): CourseProgress[] {
  const me = previewState.profile?.id || previewPersonaId("student");
  return myEnrolledCourseIds()
    .map((courseId) => {
      const course = previewState.courses.find((c) => c.id === courseId);
      const lessons = previewState.lessons.filter((l) => l.course_id === courseId && l.is_published);
      const done = lessons.filter((l) =>
        previewState.progress.some((p) => p.student_id === me && p.lesson_id === l.id && p.completed),
      ).length;
      return {
        course_id: courseId,
        course_title: course?.title ?? "Course",
        course_code: course?.code ?? null,
        total_lessons: lessons.length,
        completed_lessons: done,
        percentage: lessons.length === 0 ? 0 : Math.round((done / lessons.length) * 100),
      };
    })
    .filter((row) => row.total_lessons > 0);
}

export function previewContinueLearning(courseId: string): ContinueLearning[] {
  const course = previewState.courses.find((c) => c.id === courseId);
  if (!course) return [];
  const published = previewState.lessons.filter((l) => l.course_id === courseId && l.is_published);
  const next = published.find(
    (l) =>
      !previewState.progress.some(
        (p) => p.student_id === previewState.profile?.id && p.lesson_id === l.id && p.completed,
      ),
  );
  if (!next) return [];
  const module = previewState.modules.find((m) => m.id === next.module_id);
  const done = published.filter(
    (l) => previewState.progress.some((p) => p.student_id === previewState.profile?.id && p.lesson_id === l.id && p.completed),
  ).length;
  return [{
    course_id: course.id,
    course_title: course.title,
    course_code: course.code,
    module_id: module?.id ?? "",
    module_title: module?.title ?? "",
    lesson_id: next.id,
    lesson_title: next.title,
    total_lessons: published.length,
    completed_lessons: done,
    percentage: published.length === 0 ? 0 : Math.round((done / published.length) * 100),
  }];
}

export function previewAssignmentResult(assignmentId: string): AssignmentResult {
  const submission = previewState.submissions.find(
    (s) => s.assignment_id === assignmentId && s.student_id === previewState.profile?.id,
  );
  const assignment = previewState.assignments.find((a) => a.id === assignmentId);
  if (!submission) return { submitted: false };

  const released = assignment?.results_published ?? false;
  return {
    submitted: true,
    response: submission.response_text,
    submitted_at: submission.submitted_at,
    status: submission.status,
    results_published: released,
    score: released ? submission.score : null,
    feedback: released ? submission.feedback : null,
    max_score: assignment?.max_score ?? 100,
    graded_at: released ? submission.graded_at : null,
  };
}

export function previewQuizResult() {
  return {
    attempt_id: "qa-fractions-1",
    attempt_number: 1,
    score: 3,
    max_score: 4,
    percentage: 75,
    passing_score: 50,
    passed: true,
    time_limit_exceeded: false,
    review: previewState.questions
      .filter((q) => q.quiz_id === "q-fractions")
      .map((q) => ({
        question_id: q.id,
        your_answer: q.correct_answer,
        correct_answer: q.correct_answer,
        is_correct: true,
        explanation: q.explanation,
        points_awarded: q.points,
      })),
  };
}

export const previewSignedUrl = (path: string): string =>
  `https://signed.example.invalid/${path}?expires=${Math.floor(Date.now() / 1000) + 300}`;
