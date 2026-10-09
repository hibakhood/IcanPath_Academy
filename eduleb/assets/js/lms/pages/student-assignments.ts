/**
 * Assignment list and the submit-and-results screen.
 *
 * Results are released by the tutor through results_published. Until then
 * my_assignment_result() returns a null score, so this page shows "awaiting
 * marking" rather than an empty box that looks broken.
 */

import {
  coursesFor,
  myAssignmentResult,
  myAssignments,
  myEnrollments,
  submitAssignment,
} from "../api.ts";
import type { Assignment } from "../types.ts";
import { el, emptyState, fmtDate, fmtDateTime, fmtRelative, isPast, loading, page, pill, setChildren, toast } from "../ui.ts";

const assignmentId = new URLSearchParams(window.location.search).get("id");

/** Enrolled courses with their published assignments, tagged with the course name. */
async function enrolledAssignments(): Promise<Array<Assignment & { course_title: string }>> {
  const enrollments = await myEnrollments();
  const courses = await coursesFor(enrollments.filter((e) => e.status === "active").map((e) => e.course_id));
  const rows = await Promise.all(courses.map(async (course) => ({
    course,
    assignments: await myAssignments(course.id),
  })));
  return rows.flatMap(({ course, assignments }) =>
    assignments.map((a) => ({ ...a, course_title: course.title })),
  );
}

void page(
  {
    role: "student",
    title: "Assignments",
    base: "/student",
    active: "/assignments/",
  },
  async (content) => {
    if (!assignmentId) {
      content.append(loading("Loading assignments…"));
      setChildren(content, await listView());
      return;
    }

    content.append(loading("Loading assignment…"));
    setChildren(content, await detailView(assignmentId));
  },
);

/* ------------------------------------------------------------------- list */

async function listView(): Promise<HTMLElement> {
  const all = await enrolledAssignments();

  if (all.length === 0) {
    return el("div", {},
      emptyState("No assignments yet", "Your tutors have not published any work for your courses."),
      el("div", { class: "btn-row btn-row--center" },
        el("a", { class: "btn btn--primary", href: "/student/courses/" }, "Back to courses")));
  }

  return el("div", {},
    el("div", { class: "section-head section-head--split" },
      el("h1", {}, "Assignments"),
      el("span", { class: "app-course__meta" }, `${all.length} published`)),
    el("div", { class: "app-table-wrap" },
      el("table", { class: "app-table" },
        el("thead", {}, el("tr", {},
          el("th", {}, "Assignment"),
          el("th", {}, "Course"),
          el("th", {}, "Marks"),
          el("th", {}, "Due"),
          el("th", {}, ""))),
        el("tbody", {},
          ...all.map((assignment) => {
            const overdue = assignment.due_at ? isPast(assignment.due_at) : false;
            return el("tr", {},
              el("td", {}, el("strong", {}, assignment.title)),
              el("td", {}, assignment.course_title),
              el("td", {}, String(assignment.max_score)),
              el("td", {},
                fmtDate(assignment.due_at),
                overdue ? el("span", { class: "list__meta" }, "Overdue") : null),
              el("td", {}, el("a", { class: "btn btn--sm", href: `/student/written-assignments/?id=${encodeURIComponent(assignment.id)}` }, "Open")));
          })))));
}

/* ----------------------------------------------------------------- detail */

async function detailView(id: string): Promise<HTMLElement> {
  const all = await enrolledAssignments();
  const assignment = all.find((a) => a.id === id);

  if (!assignment) {
    return emptyState("Assignment not found", "It may have been unpublished.");
  }

  const result = await myAssignmentResult(assignment.id);
  const overdue = assignment.due_at ? isPast(assignment.due_at) : false;
  const released = result.results_published === true;

  const responseBox = el("textarea", {
    class: "input",
    rows: "10",
    placeholder: "Write your answer here.",
    "aria-label": "Your answer",
  });
  if (result.submitted && result.response) responseBox.value = result.response;

  const submitButton = el("button", { class: "btn btn--primary", type: "submit" },
    result.submitted ? "Resubmit" : "Submit assignment");

  const form = el("form", { class: "app-form" }, responseBox, el("div", { class: "btn-row" }, submitButton));

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!responseBox.value.trim()) {
      toast("Write something before submitting.", "err");
      return;
    }
    submitButton.disabled = true;
    try {
      await submitAssignment(assignment.id, responseBox.value.trim());
      toast("Submitted. Your tutor will mark it shortly.");
      window.location.reload();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not submit.", "err");
      submitButton.disabled = false;
    }
  });

  return el("div", {},
    el("nav", { class: "app-crumbs", "aria-label": "Breadcrumb" },
      el("a", { href: "/student/written-assignments/" }, "Assignments"),
      el("span", { "aria-hidden": "true" }, "/"),
      el("span", { "aria-current": "page" }, assignment.title)),

    el("header", { class: "app-page-head" },
      el("h1", {}, assignment.title),
      el("p", { class: "app-course__meta" }, assignment.course_title),
      el("p", { class: "app-course__meta" },
        `${assignment.max_score} marks` +
        (assignment.due_at ? ` · due ${fmtDate(assignment.due_at)} (${fmtRelative(assignment.due_at)})` : "") +
        (overdue ? " · overdue" : "")),
      assignment.instructions ? el("p", {}, assignment.instructions) : null),

    result.submitted
      ? el("section", { class: "card" },
          el("div", { class: "card__body" },
            el("div", { class: "section-head section-head--split" },
              el("h2", { class: "card__title" }, "Your result"),
              pill(
                released ? (result.status === "graded" ? "Graded" : "Submitted") : "Awaiting marking",
                released && result.status === "graded" ? "done" : "soon",
              )),
            released
              ? el("div", { class: "app-result" },
                  el("p", {}, el("strong", {}, `${result.score ?? "—"} / ${result.max_score ?? assignment.max_score}`)),
                  result.feedback ? el("p", {}, result.feedback) : null)
              : el("p", { class: "app-course__meta" },
                  "Your tutor has not released the marks yet. You will see them here once they do."),
            el("p", { class: "app-course__meta" },
              `Submitted ${fmtDateTime(result.submitted_at)}` +
              (released && result.graded_at ? ` · marked ${fmtDateTime(result.graded_at)}` : ""))))
      : null,

    result.status==="graded"?el("p",{},"Your answer has been graded. You can no longer submit it again."):el("section", { class: "card" },
      el("div", { class: "card__body" },
        el("h2", { class: "card__title" }, result.submitted ? "Edit your answer" : "Your answer"),
        result.submitted
          ? el("p", { class: "app-course__meta" }, "You may resubmit until the deadline passes.")
          : null,
        form)));
}