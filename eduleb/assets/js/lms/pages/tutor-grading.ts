/**
 * The grading queue.
 *
 * Submissions come from a select on assignment_submissions, which RLS scopes to
 * the tutor's own courses — there is no client-side filter doing that work.
 * Marking goes through grade_assignment(), which re-checks the tutor owns the
 * course and bounds the score.
 */

import {
  courseAssignments,
  gradeSubmission,
  listCourses,
  managedSubmissions,
  visibleStudents,
} from "../api.ts";
import type { Assignment, AssignmentSubmission, Profile } from "../types.ts";
import { el, emptyState, fmtDateTime, fmtRelative, input, isPast, loading, page, pill, setChildren, textarea, toast } from "../ui.ts";

void page(
  {
    role: "tutor",
    title: "Grading",
    base: "/tutor",
    active: "/grading/",
    subtitle: "Mark submitted assignments",
  },
  async (content) => {
    content.append(loading("Loading submissions…"));

    const [submissions, courses, students] = await Promise.all([
      managedSubmissions(),
      listCourses(),
      visibleStudents(),
    ]);

    const assignments = (await Promise.all(courses.map((course) => courseAssignments(course.id)))).flat();
    const byId = new Map(assignments.map((a) => [a.id, a] as const));
    const studentById = new Map(students.map((s) => [s.id, s] as const));

    if (submissions.length === 0) {
      setChildren(content, 
        emptyState("Nothing to mark", "Submissions will appear here once students submit their work."),
        el("div", { class: "btn-row btn-row--center" },
          el("a", { class: "btn btn--primary", href: "/tutor/dashboard/" }, "Back to dashboard")),
      );
      return;
    }

    setChildren(content, 
      el("div", { class: "section-head section-head--split" },
        el("h1", {}, "Grades and past results"),
        el("span", { class: "app-course__meta" }, `${submissions.length} submission${submissions.length === 1 ? "" : "s"}`)),
      el("div", { class: "app-grid app-grid--cards" },
        ...submissions.map((submission) =>
          markCard(submission, byId.get(submission.assignment_id), studentById.get(submission.student_id)))),
    );
  },
);

function markCard(
  submission: AssignmentSubmission,
  assignment: Assignment | undefined,
  student: Profile | undefined,
): HTMLElement {
  const scoreInput = input({ type: "number", min: "0", max: String(assignment?.max_score ?? 100), step: "0.5", value:submission.score===null?"":String(submission.score), required:true, "aria-label": `Score out of ${assignment?.max_score ?? 100}` });
  const feedbackInput = textarea({ id:`fb-${submission.id}`,value:submission.feedback??"",rows: "3", placeholder: "Feedback for the student" });

  const saveButton = el("button", { class: "btn btn--primary", type: "submit" }, submission.status==="graded"?"Save corrected mark":"Save mark");

  const form = el("form", { class: "app-form" },
    el("div", { class: "form-grid" },
      el("div", { class: "field" },
        el("label", {}, `Score out of ${assignment?.max_score ?? 100}`, el("span", { class: "req" }, "*")),
        scoreInput),
      el("div", { class: "field" },
        el("label", { for: `fb-${submission.id}` }, "Feedback"),
        feedbackInput)),
    el("div", { class: "btn-row" }, saveButton));

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const max = assignment?.max_score ?? 100;
    const score = Number(scoreInput.value);

    if (scoreInput.value.trim() === "" || Number.isNaN(score)) {
      toast("Enter a score.", "err");
      return;
    }
    if (score < 0 || score > max) {
      toast(`The score must be between 0 and ${max}.`, "err");
      return;
    }

    saveButton.disabled = true;
    try {
      await gradeSubmission({ submission_id: submission.id, score, feedback: feedbackInput.value.trim() || null });
      toast("Mark saved. Students see it once you release the results.");
      window.location.reload();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not save the mark.", "err");
      saveButton.disabled = false;
    }
  });

  const overdue = assignment?.due_at ? isPast(assignment.due_at) : false;

  return el("article", { class: "card" },
    el("div", { class: "card__body" },
      el("div", { class: "section-head section-head--split" },
        el("h2", { class: "card__title" }, student?.full_name ?? "Student"),
        pill("Submitted", "soon")),
      el("p", { class: "app-course__meta" },
        `${assignment?.title ?? "Assignment"} · ${assignment?.max_score ?? "—"} marks`),
      el("p", { class: "app-course__meta" },
        `Submitted ${fmtDateTime(submission.submitted_at)} (${fmtRelative(submission.submitted_at)})` +
        (overdue ? " · after the deadline" : "")),
      submission.response_text
        ? el("blockquote", { class: "app-response" }, submission.response_text)
        : el("p", { class: "app-course__meta" }, "The student submitted a file rather than text."),
      form));
}