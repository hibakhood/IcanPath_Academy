/**
 * Learning progress dashboard (academic view). Shows overall progress,
 * per-course progress bars and simple performance numbers, all from
 * student-scoped API calls.
 */

import { myCourseProgress, myEnrollments, coursesFor } from "../api.ts";
import type { Course, CourseProgress } from "../types.ts";
import { el, icon, loading, page, progressBar, setChildren } from "../ui.ts";

void page(
  {
    role: "student",
    title: "Learning progress",
    base: "/student",
    active: "/progress/",
    subtitle: "See your progress in each course.",
  },
  async (content) => {
    content.append(loading("Loading progress…"));
    const [enrolments, progress] = await Promise.all([myEnrollments(), myCourseProgress()]);
    const activeIds = enrolments.filter((e) => e.status === "active").map((e) => e.course_id);
    const courses = await coursesFor(activeIds);

    const courseMap = new Map(courses.map((c) => [c.id, c]));
    const overall = progress.length ? Math.round(progress.reduce((s, p) => s + p.percentage, 0) / progress.length) : 0;
    const completedCourses = progress.filter((p) => p.percentage >= 100).length;
  const lessonsDone = progress.reduce((s, p) => s + p.completed_lessons, 0);
  const totalLessons = progress.reduce((s, p) => s + p.total_lessons, 0);

    content.append(el("h1",{},"Learning progress"));
    setChildren(content,el("h1",{},"Learning progress"),
      el("div", { class: "dash-stats" },
        stat("Lesson progress", `${overall}%`, "Average across your courses", "chart"),
        stat("Courses completed", completedCourses, "All published lessons complete", "check-circle"),
        stat("Lessons completed", lessonsDone, `${totalLessons} total lessons`, "layers"),
      ),

      el("section", { class: "dash-card" },
        el("div", { class: "dash-card__head" },
          el("h3", {}, "Course progress"),
          el("span", { class: "dash-card__sub" }, "See how you are doing in each course."),
        ),
        progress.length === 0
          ? el("p", { class: "app-empty" }, "You're not enrolled in any active courses yet.")
          : el("div", { class: "dash-list" }, ...progress.map((p) => courseProgressRow(p, courseMap.get(p.course_id)))),
      ),
    );
  },
);

function stat(label: string, value: string | number, hint: string, iconName: string): HTMLElement {
  return el("div", { class: "dash-stat" },
    el("div", { class: "dash-stat__icon" }, icon(iconName)),
    el("div", { class: "dash-stat__body" },
      el("span", { class: "dash-stat__label" }, label),
      el("strong", { class: "dash-stat__value" }, String(value)),
      el("span", { class: "dash-stat__hint" }, hint),
    ),
  );
}

function courseProgressRow(p: CourseProgress, course: Course | undefined): HTMLElement {
  return el("article", { class: "dash-list__item" },
    el("div", { class: "dash-list__main" },
      el("div", { class: "dash-list__head" },
        el("strong", {}, course?.title ?? p.course_id),
        el("span", { class: "pill" }, `${p.percentage}%`),
      ),
      el("div", { class: "dash-continue__bar" },
        progressBar(p.percentage),
        el("span", { class: "dash-continue__pct" }, `${p.percentage}%`),
      ),
    ),
    el("div", { class: "dash-list__foot" },
      el("span", { class: "dash-list__meta" }, `${p.completed_lessons} / ${p.total_lessons} lessons completed`),
      el("a", { class: "btn btn--sm btn--ghost", href: `/student/course/?id=${p.course_id}` }, "View course"),
    ),
  );
}
