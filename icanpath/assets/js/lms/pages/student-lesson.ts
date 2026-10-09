/**
 * A single lesson: the video, its materials, and the completion control.
 *
 * Materials are fetched through learningResourceUrl(), never from a public URL.
 * The stored path is a location, not a secret, but the file behind it is in a
 * private bucket and only the RPC can release a link.
 */

import { getCourse, getLesson, isLessonComplete, listMaterials, markLessonComplete, learningResourceUrl } from "../api.ts";
import { youtubeId, youtubePlayer } from "../youtube.ts";
import { action, el, emptyState, loading, page, pill, setChildren, toast } from "../ui.ts";

const lessonId = new URLSearchParams(window.location.search).get("id");

void page(
  {
    role: "student",
    title: "Lesson",
    base: "/student",
    active: "/courses/",
  },
  async (content) => {
    if (!lessonId) {
      setChildren(content, emptyState("No lesson selected", "Open a lesson from a course."));
      return;
    }

    content.append(loading("Loading lesson…"));

    const lesson = await getLesson(lessonId);
    if (!lesson) {
      setChildren(content, emptyState("Lesson not found", "It may have been unpublished."));
      return;
    }

    const [course, materials, done] = await Promise.all([
      getCourse(lesson.course_id),
      listMaterials(lesson.id),
      isLessonComplete(lesson.id),
    ]);

    const completeButton = el(
      "button",
      {
        class: `btn ${done ? "btn--ghost" : "btn--primary"}`,
        type: "button",
        disabled: done || undefined,
      },
      done ? "Completed" : "Mark as complete",
    );

    completeButton.addEventListener(
      "click",
      action(async () => {
        await markLessonComplete(lesson.id);
        completeButton.className = "btn btn--ghost";
        completeButton.textContent = "Completed";
        completeButton.disabled = true;
        toast("Lesson marked complete.");
      }),
    );

    setChildren(content, 
      el("nav", { class: "app-crumbs", "aria-label": "Breadcrumb" },
        el("a", { href: "/student/courses/" }, "My courses"),
        el("span", { "aria-hidden": "true" }, "/"),
        course ? el("a", { href: `/student/course/?id=${encodeURIComponent(course.id)}` }, course.title) : null,
        el("span", { "aria-hidden": "true" }, "/"),
        el("span", { "aria-current": "page" }, lesson.title)),

      el("header", { class: "app-page-head" },
        el("h1", {}, lesson.title),
        lesson.description ? el("p", {}, lesson.description) : null),

      (youtubeId(lesson.youtube_video_url) || lesson.youtube_video_id)
        ? youtubePlayer((youtubeId(lesson.youtube_video_url) || lesson.youtube_video_id)!, lesson.title)
        : el("p", { class: "app-course__meta" }, "This lesson has no video. Read the materials below."),

      materials.length > 0
        ? el("section", { class: "card" },
            el("div", { class: "card__body" },
              el("h2", { class: "card__title" }, "Materials"),
              el("ul", { class: "list" },
                ...materials.map((material) =>
                  el("li", { class: "list__row" },
                    el("div", { class: "list__main" },
                      el("strong", {}, material.title),
                      material.description ? el("span", { class: "list__meta" }, material.description) : null),
                    el("div", { class: "list__aside" },
                      pill(material.type.replace(/_/g, " "), "done"),
                      openMaterialButton(material.storage_path, material.title)))))))
        : null,

      el("div", { class: "btn-row" },
        completeButton,
        course ? el("a", { class: "btn btn--ghost", href: `/student/course/?id=${encodeURIComponent(course.id)}` }, "Back to course") : null),
    );
  },
);

/**
 * Links are created on click rather than up front: a signed URL is short-lived,
 * and minting one for every row would waste them before they are followed.
 */
function openMaterialButton(storagePath: string, title: string): HTMLButtonElement {
  const button = el("button", { class: "btn btn--sm", type: "button" }, "Open");
  button.addEventListener(
    "click",
    action(async () => {
      const url = await learningResourceUrl(storagePath);
      window.open(url, "_blank", "noopener,noreferrer");
    }),
  );
  button.setAttribute("aria-label", `Open ${title}`);
  return button;
}
