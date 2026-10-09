/**
 * Shapes returned by the database, mirrored from supabase/migrations.
 *
 * Hand-maintained rather than generated, and deliberately limited to what the UI
 * reads. Anything not granted to the client is absent here on purpose: if a
 * column is missing, the screen must not expect it.
 */

export type AppRole = "student" | "tutor" | "admin";
export type AccountStatus = "pending" | "active" | "suspended";
export type CourseStatus = "draft" | "pending_review" | "published" | "archived";
export type LiveClassStatus = "scheduled" | "live" | "completed" | "cancelled";
export type LivePlatform = "youtube_live" | "google_meet" | "zoom";
export type SubmissionStatus = "submitted" | "graded";
export type EnrollmentStatus = "active" | "completed" | "cancelled";
export type QuestionType = "mcq" | "true_false" | "short_answer";
export type AnnouncementAudience = "all" | "students" | "tutors" | "admins";

export interface Profile {
  id: string;
  role: AppRole;
  status: AccountStatus;
  full_name: string | null;
  phone: string | null;
  avatar_url: string | null;
  /** Student track: foundation | skills | professional. */
  level: string | null;
  /** Set by an admin when an account is suspended; shown to the account holder. */
  status_note: string | null;
  created_at: string;
}

export interface Course {
  short_description?: string | null;
  duration_minutes?: number | null;
  learning_objectives?: string[];
  id: string;
  code: string | null;
  title: string;
  description: string | null;
  level: string | null;
  plan: string | null;
  thumbnail_url: string | null;
  status: CourseStatus;
  created_by: string;
  submitted_at: string | null;
  reviewed_at: string | null;
  published_at: string | null;
  review_note: string | null;
}

export interface CourseModule {
  id: string;
  course_id: string;
  title: string;
  position: number;
}

export interface Lesson {
  id: string;
  module_id: string;
  course_id: string;
  title: string;
  description: string | null;
  position: number;
  is_published: boolean;
  youtube_video_url: string | null;
  youtube_video_id: string | null;
}

/** The grant for lessons has no duration column, so neither does this shape. */
export interface LessonMaterial {
  created_at?: string;
  id: string;
  lesson_id: string;
  course_id: string;
  title: string;
  type: string;
  storage_path: string;
  description: string | null;
  position: number;
}

/**
 * `meeting_storage_path` is deliberately absent: it is not granted to the
 * client, so the meeting link can only be reached through signedResourceUrl().
 */
export interface LiveClass {
  id: string;
  course_id: string;
  lesson_id: string | null;
  title: string;
  platform: LivePlatform;
  scheduled_date: string;
  start_time: string;
  end_time: string;
  status: LiveClassStatus;
  recording_youtube_url: string | null;
  recording_youtube_id: string | null;
  notes: string | null;
  course_title?: string;
  timezone?: string;
}

export interface Quiz {
  id: string;
  course_id: string;
  lesson_id: string | null;
  title: string;
  instructions: string | null;
  time_limit_minutes: number | null;
  passing_score: number;
  attempt_limit: number;
  due_at: string | null;
  is_published: boolean;
  course_title?: string;
}

/** The student-facing view: `correct_answer` is not in the select grant. */
export interface QuizQuestion {
  id: string;
  quiz_id: string;
  position: number;
  prompt: string;
  question_type: QuestionType;
  options: string[] | null;
  points: number;
}

/** The tutor-facing view, which manage_quiz_questions() does grant. */
export interface ManagedQuestion extends QuizQuestion {
  correct_answer: string;
  explanation: string | null;
}

export interface QuizAttempt {
  id: string;
  quiz_id: string;
  student_id: string;
  attempt_number: number;
  started_at: string;
  submitted_at: string | null;
  status: "in_progress" | "submitted" | "graded";
  score: number | null;
  max_score: number | null;
  percentage: number | null;
  passed: boolean | null;
  quiz_title?: string;
}

/**
 * A marked answer. `is_correct` is all a student ever sees for a past attempt:
 * correct_answer is not readable by the client.
 */
export interface QuizAnswer {
  id: string;
  attempt_id: string;
  question_id: string;
  answer: string;
  is_correct: boolean;
  points_awarded: number;
}

export interface Assignment {
  id: string;
  course_id: string;
  lesson_id: string | null;
  title: string;
  instructions: string | null;
  due_at: string | null;
  max_score: number;
  is_published: boolean;
  results_published: boolean;
  course_title?: string;
}

export interface AssignmentSubmission {
  id: string;
  assignment_id: string;
  student_id: string;
  response_text: string | null;
  status: SubmissionStatus;
  score: number | null;
  feedback: string | null;
  graded_at: string | null;
  submitted_at: string;
}

export interface Enrollment {
  id: string;
  course_id: string;
  student_id: string;
  status: EnrollmentStatus;
  enrolled_at: string;
}

export interface Announcement {
  id: string;
  title: string;
  body: string | null;
  audience: AnnouncementAudience;
  status: "draft" | "scheduled" | "published" | "archived";
  scheduled_for: string | null;
  published_at: string | null;
}

export interface AppNotification {
  user_id?: string;
  id: string;
  type: string;
  title: string;
  body: string | null;
  link_path: string | null;
  read_at: string | null;
  created_at: string;
}

/** Read-only: the client cannot insert or update an application. */
export interface TutorApplication {
  id: string;
  user_id: string;
  status: "pending" | "approved" | "rejected";
  headline: string | null;
  bio: string | null;
  specialties: string[] | null;
  review_note: string | null;
  created_at: string;
  full_name?: string | null;
  email?: string | null;
}

/** my_course_progress() */
export interface CourseProgress {
  course_id: string;
  course_title: string;
  course_code: string | null;
  total_lessons: number;
  completed_lessons: number;
  percentage: number;
}

/** continue_learning(p_course_id) */
export interface ContinueLearning {
  course_id: string;
  course_title: string;
  course_code: string | null;
  module_id: string;
  module_title: string;
  lesson_id: string;
  lesson_title: string;
  total_lessons: number;
  completed_lessons: number;
  percentage: number;
}

/** my_assignment_result(p_assignment_id). The key is `response`, not
 *  `response_text` — score and feedback come back null until the tutor
 *  publishes the results. */
export interface AssignmentResult {
  submitted: boolean;
  response?: string | null;
  submitted_at?: string | null;
  status?: SubmissionStatus;
  results_published?: boolean;
  score?: number | null;
  feedback?: string | null;
  max_score?: number;
  graded_at?: string | null;
}

/** One row of audit_logs, which is how recent_activity is counted. */
export interface AuditEntry {
  id: string;
  actor_id: string | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

/** A review row returned by submit_quiz_attempt(), which is the only moment a
 *  student receives the correct answers. */
export interface QuizReviewItem {
  question_id: string;
  your_answer: string;
  correct_answer: string;
  is_correct: boolean;
  explanation: string | null;
  points_awarded: number;
}

export interface QuizResult {
  attempt_id: string;
  attempt_number: number;
  score: number;
  max_score: number;
  percentage: number;
  passing_score: number;
  passed: boolean;
  time_limit_exceeded: boolean;
  review: QuizReviewItem[];
}

/** student_dashboard_stats() */
export interface StudentStats {
  enrolled_courses: number;
  in_progress: number;
  completed: number;
  upcoming_live_classes: number;
  pending_quizzes: number;
  pending_assignments: number;
  overall_progress: number;
  unread_notifications: number;
}

/** tutor_dashboard_stats() */
export interface TutorStats {
  total_courses: number;
  published_courses: number;
  draft_courses: number;
  pending_reviews: number;
  total_students: number;
  upcoming_live_classes: number;
  pending_grading: number;
  in_progress_attempts: number;
}

/** admin_dashboard_stats()
 *
 *  There is no payments table, so revenue and its growth are null rather than
 *  zero: zero would claim a measured £0, null says "this platform does not
 *  track that". A growth figure is also null when there was nothing to compare
 *  against. */
export interface AdminStats {
  total_students: number;
  active_students: number;
  tutors: number;
  pending_tutor_approvals: number;
  courses: number;
  published_courses: number;
  courses_awaiting_review: number;
  enrollments: number;
  upcoming_live_classes: number;
  recent_activity: number;
  total_revenue: number | null;
  student_growth: number | null;
  tutor_growth: number | null;
  course_growth: number | null;
  enrollment_growth: number | null;
  live_class_growth: number | null;
  revenue_growth: number | null;
}

export interface AnalyticsData {
  labels: string[];
  students: number[];
  enrollments: number[];
  /** null in the real database: there is no billing data to chart. */
  revenue: number[] | null;
}

export interface ActivityItem {
  id: string;
  type:
    | "tutor_application"
    | "course_submitted"
    | "course_archived"
    | "live_class"
    | "student_registered"
    | "course_published"
    | "payment"
    | "tutor_approved"
    | "account"
    | "enrollment"
    | "quiz"
    | "announcement"
    | "grading"
    | "other";
  message: string;
  time_ago: string;
  icon: string;
}

export interface TopCourse {
  id: string;
  title: string;
  students: number;
  progress: number;
  thumbnail: string | null;
}

/** admin_system_stats()
 *
 *  The counts come from the tables. Uptime, storage and bandwidth have no
 *  source in this database and are null in the real branch — the dashboard
 *  prints an em dash for them rather than inventing a figure. */
export interface SystemStats {
  active_students: number;
  active_students_pct: number;
  active_tutors: number;
  active_tutors_pct: number;
  published_courses: number;
  published_courses_pct: number;
  uptime: string | null;
  uptime_status: string | null;
  storage_used: string | null;
  storage_pct: number | null;
  bandwidth_used: string | null;
  bandwidth_pct: number | null;
}

export interface UpcomingClass {
  id: string;
  title: string;
  course: string;
  date: string;
  time: string;
  platform: string;
  platform_icon: string;
}

/** tutor_my_courses() — one row per course the caller manages, with the
 *  enrolment count and average completion the tutor dashboard shows. */
export interface TutorCourseMetric {
  id: string;
  title: string;
  code: string | null;
  status: CourseStatus;
  thumbnail_url: string | null;
  students: number;
  progress: number;
}

/** tutor_student_activity() — the latest things students in the caller's
 *  courses did. `action` is a lowercase verb phrase, so the screen renders
 *  "Ada Mensah submitted “Exercise 1”" without re-casing anything. */
export interface TutorStudentActivity {
  student_id: string;
  student_name: string;
  course_title: string;
  action: string;
  occurred_at: string;
}

/** tutor_my_students() — everyone actively enrolled in a course the caller
 *  teaches, with completion counted the way tutor_my_courses() counts a whole
 *  course. `last_activity` is null when a student has only enrolled. */
export interface TutorStudent {
  student_id: string;
  full_name: string;
  level: string | null;
  status: string;
  courses: number;
  lessons_done: number;
  lessons_total: number;
  progress: number;
  last_activity: string | null;
}
