/**
 * Tutor course list, with the create form.
 *
 * Creating a course is a plain insert: courses_guard_insert() overwrites
 * created_by and forces status = 'draft', so those are never sent.
 */

import { createCourse, listCourses, submitCourseForReview } from "../api.ts";
import { config } from "../config.ts";
import { action, confirmAction, el, emptyState, field, fmtDate, input, loading, page, select, setChildren, textarea, toast } from "../ui.ts";
import { courseBadge } from "../course-badge.ts";

void page(
  {
    role: "tutor",
    title: "My courses",
    base: "/tutor",
    active: "/courses/",
  },
  async (content) => {
    content.append(loading("Loading your courses…"));

    const courses = await listCourses();

    const titleInput = input({ name: "title", required: true, placeholder: "For example, Financial Reporting" });
    const codeInput = input({ name: "code", placeholder: "For example, B1" });
    const levelSelect = select([
      { value: "Foundation", label: "Foundation" },
      { value: "Skills", label: "Skills" },
      { value: "Professional", label: "Professional" },
    ]);
    const descriptionInput = textarea({ name: "description", rows: "4", placeholder: "What does this course cover?" });

    const createButton = el("button", { class: "btn btn--primary", type: "submit" }, "Create course");

    const createForm = el("form", { class: "app-form tutor-create-form" },
      el("div", { class: "form-grid form-grid--2" },
        field("Course title", titleInput, undefined, true),
        field("Course code", codeInput, "Optional. Shown to students."),
        field("Level", levelSelect, undefined, true),
        field("Description", descriptionInput)),
      el("div", { class: "btn-row" }, createButton));

    createForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      createButton.disabled = true;
      try {
        const course = await createCourse({
          title: titleInput.value.trim(),
          code: codeInput.value.trim() || null,
          level: levelSelect.value,
          description: descriptionInput.value.trim() || null,
        });
        toast(`Created “${course?.title ?? "course"}”.`);
        window.location.replace(`/tutor/course/?id=${encodeURIComponent(course?.id ?? "")}`);
      } catch (error) {
        toast(error instanceof Error ? error.message : "Could not create the course.", "err");
        createButton.disabled = false;
      }
    });

    setChildren(content, 
      el("div", { class: "section-head section-head--split" },
        el("div", {}, el("h1", {}, "My courses"), el("p", { class: "learning-muted" }, "Manage your ICAN courses and prepare lessons for your students.")),
        el("span", { class: "app-course__meta" }, `${courses.length} total`)),

      courses.length === 0
        ? emptyState("No courses yet", "Create your first course using the form below.")
        : el("div", { class: "tutor-catalogue" },
            ...courses.map((course) =>
              el("article", { class: "tutor-course-tile" },
                el("div", { class: "tutor-course-tile__top" },
                  el("span", { class: "tutor-course-tile__code" }, course.code || "ICAN"),
                  courseBadge(course)),
                el("div", { class: "tutor-course-tile__body" },
                  el("span", { class: "tutor-course-tile__level" }, course.level || "ICAN course"),
                  el("h2", {}, el("a", { href: `/tutor/course/?id=${encodeURIComponent(course.id)}` }, course.title)),
                  el("p", {}, course.description || "Organize lessons, materials and assessments for your students."),
                  course.status === "draft" && course.review_note
                    ? el("p", { class: "tutor-course-tile__note" }, `Review feedback: ${course.review_note}`) : null),
                el("div", { class: "tutor-course-tile__footer" },
                  el("span", { class: "tutor-course-tile__date" }, course.published_at ? `Published ${fmtDate(course.published_at)}` : "Not published yet"),
                  el("div", { class: "tutor-course-tile__actions" },
                    el("a", { class: "btn btn--sm", href: `/tutor/course/?id=${encodeURIComponent(course.id)}` }, "Manage course"),
                    course.status === "draft"
                      ? el("button", {
                          class: "btn btn--sm learning-outline", type: "button",
                          onclick: action(async () => {
                            if (!confirmAction(`Submit “${course.title}” for review? You can keep editing until an administrator decides.`)) return;
                            await submitCourseForReview(course.id);
                            toast("Submitted for review.");
                            window.location.reload();
                          }),
                        }, "Submit for review") : null))))),

      el("section", { class: "card tutor-create-panel" },
        el("div", { class: "card__body" },
          el("h2", { class: "card__title" }, "Create a course"),
          el("p", { class: "card__text" },
            config.preview
              ? "Demo mode: changes stay in this browser only."
              : "A new course starts as a draft. Add modules, lessons, quizzes and assignments, then submit it for review."),
          createForm)));
  },
);