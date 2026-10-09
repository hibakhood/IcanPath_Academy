/**
 * Every published quiz across the student's courses, with attempt counts.
 *
 * Assembled from enrolments rather than a single wide query, so the page shows
 * only what RLS would let this account see anyway.
 */

import { coursesFor, myEnrollments, myQuizzes, myQuizAttempts } from "../api.ts";
import { el, emptyState, fmtDate, fmtRelative, isPast, loading, page, pill, setChildren } from "../ui.ts";

void page(
  {
    role: "student",
    title: "Quizzes",
    base: "/student",
    active: "/quizzes/",
    subtitle: "Test yourself and track your scores",
  },
  async (content) => {
    content.append(loading("Loading quizzes…"));

    const enrollments = await myEnrollments();
    const courses = await coursesFor(enrollments.filter((e) => e.status === "active").map((e) => e.course_id));

    const rows = await Promise.all(
      courses.map(async (course) => ({
        course,
        quizzes: await myQuizzes(course.id),
      })),
    );

    const entries = rows.flatMap(({ course, quizzes }) =>
      quizzes.map((quiz) => ({ quiz, courseTitle: course.title })),
    );

    if (entries.length === 0) {
      setChildren(content, 
        emptyState("No quizzes published", "Your tutors will publish quizzes here when they are ready."),
        el("div", { class: "btn-row btn-row--center" },
          el("a", { class: "btn btn--primary", href: "/student/courses/" }, "Back to courses")),
      );
      return;
    }

    const withAttempts = await Promise.all(
      entries.map(async ({ quiz, courseTitle }) => ({ quiz, courseTitle, attempts: await myQuizAttempts(quiz.id) })),
    );

    setChildren(content, 
      el("div", { class: "section-head section-head--split" },
        el("h1", {}, "Quizzes"),
        el("span", { class: "app-course__meta" }, `${entries.length} available`)),

      el("div", { class: "app-grid app-grid--cards" },
        ...withAttempts.map(({ quiz, courseTitle, attempts }) => {
          const done = attempts.filter(a=>a.status==="graded").sort((a,b)=>(b.percentage??0)-(a.percentage??0))[0];
          const remaining = Math.max(0, quiz.attempt_limit - attempts.filter((a) => a.status !== "in_progress").length);
          const overdue = quiz.due_at ? isPast(quiz.due_at) : false;

          return el("article", { class: "card" },
            el("div", { class: "card__body" },
              el("div", { class: "section-head section-head--split" },
                el("h2", { class: "card__title" }, quiz.title),
                done
                  ? pill(`${done.percentage}%`, done.passed ? "done" : "warn")
                  : remaining === 0
                    ? pill("No attempts left", "warn")
                    : pill(`${remaining} left`, "soon")),
              el("p", { class: "app-course__meta" }, courseTitle),
              el("p", { class: "app-course__meta" },
                `${quiz.attempt_limit} attempt${quiz.attempt_limit === 1 ? "" : "s"} · pass at ${quiz.passing_score}%` +
                (quiz.time_limit_minutes ? ` · ${quiz.time_limit_minutes} min` : "")),
              quiz.due_at
                ? el("p", { class: "app-course__meta" },
                    `Due ${fmtDate(quiz.due_at)} (${fmtRelative(quiz.due_at)})`,
                    overdue ? el("span", { class: "list__meta" }, "Overdue") : null)
                : null,
              done ? el("p", { class: "app-course__meta" }, `Best so far: ${done.score} of ${done.max_score}`) : null,
              el("div", { class: "btn-row" },
                remaining > 0
                  ? el("a", { class: "btn btn--sm btn--primary", href: `/student/quiz/?id=${encodeURIComponent(quiz.id)}` },
                      done ? "Retake" : "Start quiz")
                  : el("a", { class: "btn btn--sm", href: `/student/quiz/?id=${encodeURIComponent(quiz.id)}` }, "View result"))));
        })),
    );
  },
);