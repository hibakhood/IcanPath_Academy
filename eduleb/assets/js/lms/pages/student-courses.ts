import { coursePhoto } from "../course-photo.ts";
/**
 * Student course list and the enrolled-course view.
 *
 * A student's courses are derived from their own enrolments rather than a
 * catalogue query, so the page cannot show something they are not entitled to.
 */

import {
  continueLearning,
  coursesFor,
  myCourseProgress,
  myEnrollments,
} from "../api.ts";
import { el, emptyState, errorState, fmtDate, loading, page, progressBar, setChildren } from "../ui.ts";
import type { ContinueLearning } from "../types.ts";

void page(
  {
    role: "student",
    title: "My courses",
    base: "/student",
    active: "/courses/",
    subtitle: "Everything you are enrolled in",
  },
  async (content) => {
    content.append(loading("Loading your courses…"));

    const [enrollments, progress] = await Promise.all([myEnrollments(), myCourseProgress()]);
    const active = enrollments.filter((e) => e.status === "active");
    const courses = await coursesFor(active.map((e) => e.course_id));

    if (courses.length === 0) {
      setChildren(content, 
        emptyState("You are not enrolled in any courses yet", "Browse and enroll in a published ICAN course to get started."),
        el("div", { class: "btn-row btn-row--center" },
          el("a", { class: "btn btn--primary", href: "/student/browse/" }, "Browse courses")),
      );
      return;
    }

    const cards = await Promise.all(
      courses.map(async (course) => {
        const row = progress.find((p) => p.course_id === course.id);
        const next = await continueLearning(course.id);

        return el("article", { class: "card app-course" },
          el("img", {class:"app-course-photo",src:coursePhoto(course.title,course.thumbnail_url),alt:"",loading:"lazy",decoding:"async"}),
          el("div", { class: "card__body" },
            el("div", { class: "section-head section-head--split" },
              el("div", {},
                course.code ? el("span", { class: "card__tag card__tag--gold" }, course.code) : null,
                el("h2", { class: "card__title" }, course.title)),
              el("span", { class: "app-course__level" }, course.level ?? "—")),
            course.description ? el("p", { class: "card__text" }, course.description) : null,
            row
              ? el("div", { class: "app-course__progress" },
                  progressBar(row.percentage),
                  el("span", { class: "app-course__meta" },
                    `${row.completed_lessons} of ${row.total_lessons} lessons · ${row.percentage}%`))
              : null,
            el("div", { class: "btn-row" },
              el("a", { class: "btn btn--primary btn--sm", href: `/student/course/?id=${encodeURIComponent(course.id)}` }, "Open course"),
              resumeLink(next))));
      }),
    );

    setChildren(content, 
      el("div", { class: "section-head section-head--split" },
        el("h1", {}, "My courses"),el("a",{class:"btn",href:"/student/browse/"},"Browse courses"),
        el("span", { class: "app-course__meta" }, `${courses.length} enrolled`)),
      ...cards,
      courses.some((c) => c.status !== "published")
        ? el("p", { class: "app-course__meta" }, `Updated ${fmtDate(new Date().toISOString())}.`)
        : null,
    );
  },
).catch((error) => {
  const root = document.getElementById("app");
  if (root) setChildren(root, errorState(error));
});
/** One unfinished lesson, if there is one. */
function resumeLink(next: ContinueLearning[]): HTMLElement {
  const item = next[0];
  if (!item) return el("span", { class: "app-course__meta" }, "You have finished all available lessons");
  const href = `/student/lesson/?id=${encodeURIComponent(item.lesson_id)}`;
  return el("a", { class: "btn btn--sm", href }, `Resume “${item.lesson_title}”`);
}
