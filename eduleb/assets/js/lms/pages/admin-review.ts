/**
 * The admin review queue: courses awaiting a decision, and tutor applications.
 *
 * Two functions do the deciding. review_course(p_course_id, p_decision, p_note)
 * for content, and approve_tutor(p_user_id, p_decision, p_note) for people —
 * the latter takes a user id and a boolean, and the trigger on
 * tutor_applications is what actually flips the profile to an active tutor.
 */

import {
  courseAssignments,
  courseLiveClasses,
  listLessons,
  listModules,
  listQuizzes,
  reviewCourse,
  decideTutor,
  reviewQueueCourses,
  tutorApplications,
} from "../api.ts";
import type { TutorApplication } from "../types.ts";
import { action, confirmAction, el, emptyState, fmtDate, fmtRelative, loading, page, pill, setChildren, textarea, toast } from "../ui.ts";

const params = new URLSearchParams(window.location.search);
const focusCourse = params.get("course");
const focusApplication = params.get("application");

void page(
  {
    role: "admin",
    title: "Pending reviews",
    base: "/admin",
    active: "/review/",
    subtitle: "Review courses and tutor applications.",
  },
  async (content) => {
    content.append(loading("Loading the queue…"));

    const [queue, applications] = await Promise.all([reviewQueueCourses(), tutorApplications()]);
    const pendingApplications = applications.filter((a) => a.status === "pending");

    const ordered = focusCourse ? [...queue].sort((a, b) => (a.id === focusCourse ? -1 : b.id === focusCourse ? 1 : 0)) : queue;
    const orderedApps = focusApplication
      ? [...pendingApplications].sort((a, b) => (a.id === focusApplication ? -1 : b.id === focusApplication ? 1 : 0))
      : pendingApplications;

    setChildren(content, 
      el("div", { class: "section-head section-head--split" },
        el("h1", {}, "Pending reviews"),
        el("span", { class: "app-course__meta" },
          `${queue.length} course${queue.length === 1 ? "" : "s"} · ${pendingApplications.length} application${pendingApplications.length === 1 ? "" : "s"}`)),

      el("h2", { class: "app-section-title" }, "Tutor applications"),
      orderedApps.length === 0
        ? emptyState("No tutor applications waiting")
        : el("div", { class: "app-grid app-grid--cards" },
            ...orderedApps.map((application) => applicationCard(application))),

      el("h2", { class: "app-section-title" }, "Courses awaiting review"),
      ordered.length === 0
        ? emptyState("No courses awaiting review", "Courses appear here when tutors submit them for review.")
        : el("div", { class: "app-stack" }, ...await Promise.all(ordered.map((c) => courseReviewCard(c)))),
    );
  },
);

/* --------------------------------------------------------- applications */

function applicationCard(application: TutorApplication): HTMLElement {
  const noteInput = textarea({ rows: "2", placeholder: "Optional note to the applicant" });

  const decide = (approve: boolean) => async (): Promise<void> => {
    const label = approve ? "approve" : "reject";
    if (!confirmAction(`${approve ? "Approve" : "Reject"} ${application.full_name ?? "this applicant"} as a tutor?`)) return;
    await decideTutor(application.user_id, approve, noteInput.value.trim() || null);
    toast(`Application ${label}d.`);
    window.location.reload();
  };

  return el("article", { class: "card" },
    el("div", { class: "card__body" },
      el("div", { class: "section-head section-head--split" },
        el("h2", { class: "card__title" }, application.full_name ?? "Applicant"),
        pill("Pending", "soon")),
      el("p", { class: "app-course__meta" }, `${application.email ?? "—"} · applied ${fmtRelative(application.created_at)}`),
      application.headline ? el("p", {}, application.headline) : null,
      application.bio ? el("p", { class: "card__text" }, application.bio) : null,
      el("div", { class: "field" },
        el("label", { for: `note-${application.id}` }, "Note"),
        Object.assign(noteInput, { id: `note-${application.id}` })),
      el("div", { class: "btn-row" },
        el("button", { class: "btn btn--primary", type: "button", onclick: action(decide(true)) }, "Approve as tutor"),
        el("button", { class: "btn", type: "button", onclick: action(decide(false)) }, "Reject"))));
}

/* ---------------------------------------------------------------- courses */

async function courseReviewCard(course: { id: string; title: string; code: string | null; description: string | null; level: string | null; submitted_at: string | null }): Promise<HTMLElement> {
  const [modules, lessons, quizzes, assignments, classes] = await Promise.all([
    listModules(course.id),
    listLessons(course.id),
    listQuizzes(course.id),
    courseAssignments(course.id),
    courseLiveClasses(course.id),
  ]);

  const publishedLessons = lessons.filter((l) => l.is_published).length;
  const noteInput = textarea({ rows: "2", placeholder: "Note to the tutor, shown on their course" });

  const decide = (decision: "approve" | "reject") => async (): Promise<void> => {
    if (!confirmAction(
      decision === "approve"
        ? `Publish “${course.title}”? Enrolled students gain access immediately.`
        : `Send “${course.title}” back to the tutor? They can keep editing it.`,
    )) return;
    await reviewCourse(course.id, decision, noteInput.value.trim() || null);
    toast(decision === "approve" ? "Course published." : "Course returned to the tutor.");
    window.location.reload();
  };

  return el("article", { class: "card" },
    el("div", { class: "card__body" },
      el("div", { class: "section-head section-head--split" },
        el("h2", { class: "card__title" }, course.title),
        pill(course.code ?? course.level ?? "Course", "default")),
      el("a",{class:"btn",href:`/admin/course/?id=${encodeURIComponent(course.id)}`},"View course content"),
      el("p", { class: "app-course__meta" }, `Submitted ${fmtDate(course.submitted_at)} · ${fmtRelative(course.submitted_at)}`),
      course.description ? el("p", {}, course.description) : null,
      el("p", { class: "app-course__meta" },
        `${modules.length} module(s) · ${lessons.length} lesson(s), ${publishedLessons} published · ` +
        `${quizzes.length} quiz(s) · ${assignments.length} assignment(s) · ${classes.length} live class(es)`),
      el("p", { class: "app-course__meta" },
        assignments.some((a) => a.results_published)
          ? "Marks have already been released on at least one assignment."
          : "No marks released yet."),
      el("div", { class: "field" },
        el("label", { for: `note-${course.id}` }, "Note"),
        Object.assign(noteInput, { id: `note-${course.id}` })),
      el("div", { class: "btn-row" },
        el("button", { class: "btn btn--primary", type: "button", onclick: action(decide("approve")) }, "Approve and publish"),
        el("button", { class: "btn", type: "button", onclick: action(decide("reject")) }, "Return to tutor"))));
}