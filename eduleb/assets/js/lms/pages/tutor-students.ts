/**
 * Tutor students: everyone enrolled in a course this tutor teaches.
 *
 * The roster, completion and last activity come from tutor_my_students(), so
 * the page shows exactly what the database knows — a student who has only
 * enrolled reads "No activity yet" rather than being given a guessed date.
 */

import { tutorCourseMetrics, tutorDashboardStats, tutorMyStudents } from "../api.ts";
import type { TutorStudent } from "../types.ts";
import { el, emptyState, fmtDate, initials, loading, page, pill, progressBar, setChildren } from "../ui.ts";

void page(
  {
    role: "tutor",
    title: "Students",
    base: "/tutor",
    active: "/students/",
    subtitle: "Everyone enrolled in your courses",
  },
  async (content) => {
    content.append(loading("Loading your students…"));

    const [stats, metrics, students] = await Promise.all([
      tutorDashboardStats(),
      tutorCourseMetrics(),
      tutorMyStudents(),
    ]);

    const average = students.length === 0
      ? 0
      : Math.round(students.reduce((sum, row) => sum + row.progress, 0) / students.length);

    setChildren(content,
      el("div", { class: "stat-grid" },
        stat("Students", stats.total_students, "Enrolled across your courses"),
        stat("Average progress", `${average}%`, "Across published lessons"),
        stat("Courses", metrics.length, `${stats.published_courses} published`),
      ),

      el("section", { class: "card" },
        el("div", { class: "card__body" },
          el("div", { class: "section-head section-head--split" },
            el("h2", { class: "card__title" }, "All students"),
            el("a", { class: "btn btn--sm", href: "/tutor/grading/" }, "Open grading")),
          students.length === 0
            ? emptyState(
                "No students yet",
                "Students appear here as soon as they enrol in one of your courses.",
              )
            : el("div", { class: "app-table-wrap" },
                el("table", { class: "app-table" },
                  el("thead", {}, el("tr", {},
                    el("th", {}, "Student"),
                    el("th", {}, "Courses"),
                    el("th", {}, "Progress"),
                    el("th", {}, "Last activity"),
                    el("th", {}, "Status"))),
                  el("tbody", {},
                    ...students.map((row) => el("tr", {},
                      el("td", {},
                        el("span", { class: "student-cell" },
                          el("span", { class: "student-cell__avatar" }, initials(row.full_name)),
                          el("span", { class: "student-cell__body" },
                            el("strong", {}, row.full_name),
                            el("span", { class: "list__meta" }, row.level ?? "No level set")))),
                      el("td", {}, String(row.courses)),
                      el("td", {}, progressBar(row.progress), el("span", { class: "list__meta" }, `${row.progress}%`)),
                      el("td", {}, row.last_activity ? fmtDate(row.last_activity) : "No activity yet"),
                      el("td", {}, statusPill(row)),
                    ))))),
        ),
      ),
    );
  },
);

function stat(label: string, value: string | number, hint: string): HTMLElement {
  return el("div", { class: "stat" },
    el("span", { class: "stat__label" }, label),
    el("strong", { class: "stat__value" }, String(value)),
    el("span", { class: "stat__hint" }, hint),
  );
}

/** Account status as the roster shows it: only a suspended account is called out. */
function statusPill(row: TutorStudent): HTMLElement {
  if (row.status === "suspended") return pill("Suspended", "warn");
  if (row.status !== "active") return pill("Pending", "soon");
  return pill("Active", "done");
}
