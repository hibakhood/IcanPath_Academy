/**
 * One enrolled course: its modules, lessons, quizzes, assignments and materials.
 */

import { getCourse, listModules, myAssignments, myLessons, myQuizzes } from "../api.ts";
import { youtubeId, youtubePlayer } from "../youtube.ts";
import {config} from "../config.ts";
import {supabase,unwrap} from "../supabase.ts";
import { action, textarea, toast, el, emptyState, fmtDate, loading, page, pill, setChildren } from "../ui.ts";

const courseId = new URLSearchParams(window.location.search).get("id");

void page(
  {
    role: "student",
    title: "Course",
    base: "/student",
    active: "/courses/",
  },
  async (content) => {
    if (!courseId) {
      setChildren(content, emptyState("No course selected", "Open a course from your list."));
      return;
    }

    content.append(loading("Loading course…"));

    const [course, modules, lessons, quizzes, assignments] = await Promise.all([
      getCourse(courseId),
      listModules(courseId),
      myLessons(courseId),
      myQuizzes(courseId),
      myAssignments(courseId),
    ]);

    if (!course) {
      setChildren(content, emptyState("Course not found", "It may have been unpublished."));
      return;
    }

    const sections = modules.map((module) => {
      const inModule = lessons.filter((l) => l.module_id === module.id);
      return el("details", { class: "app-module student-module-library" },
        el("summary", { class: "app-module__title" }, module.title, el("span", { class: "list__meta" }, `${inModule.filter(l=>l.youtube_video_url || l.youtube_video_id).length} recordings`)),
        inModule.length === 0
          ? el("p", { class: "app-course__meta" }, "No lessons published in this module yet.")
          : el("ul", { class: "list" },
              ...inModule.map((lesson) => {
                const videoId = youtubeId(lesson.youtube_video_url) || lesson.youtube_video_id;
                const recording = videoId ? el("details", { class: "module-recording" },
                  el("summary", {}, `Watch recording: ${lesson.title}`)) : null;
                if (recording && videoId) recording.addEventListener("toggle", () => {
                  if (recording.open && !recording.querySelector("iframe")) recording.append(youtubePlayer(videoId, lesson.title));
                  if (!recording.open) recording.querySelector(".app-video")?.remove();
                });
                return el("li", { class: "module-lesson" },
                  el("div", { class: "list__row" },
                  el("div", { class: "list__main" },
                    el("strong", {}, lesson.title),
                    lesson.description ? el("span", { class: "list__meta" }, lesson.description) : null),
                  el("div", { class: "list__aside" },
                    lesson.youtube_video_url ? pill("Video", "done") : null,
                    el("a", { class: "btn btn--sm btn--primary", href: `/student/lesson/?id=${encodeURIComponent(lesson.id)}` }, "Lesson and materials"))),
                  recording);
              })));
    });

    setChildren(content, 
      el("nav", { class: "app-crumbs", "aria-label": "Breadcrumb" },
        el("a", { href: "/student/courses/" }, "My courses"),
        el("span", { "aria-hidden": "true" }, "/"),
        el("span", { "aria-current": "page" }, course.title)),

      el("header", { class: "app-page-head" },
        course.code ? el("span", { class: "card__tag card__tag--gold" }, course.code) : null,
        el("h1", {}, course.title),
        course.description ? el("p", {}, course.description) : null,
        el("p", { class: "app-course__meta" }, `${course.level ?? "—"} · published ${fmtDate(course.published_at)}`)),

      (()=>{const reason=textarea({required:true,minlength:10,maxlength:2000,placeholder:"Describe the issue with this course","aria-label":"Content issue"});const form=el("form",{class:"card admin-form"},el("h2",{},"Report a content issue"),reason,el("button",{type:"submit",class:"btn btn--sm"},"Submit report"));form.addEventListener("submit",event=>{event.preventDefault();void action(async()=>{if(config.preview)throw new Error("Reports cannot be submitted until the app has a database connection.");await unwrap(supabase().rpc("report_course_content",{p_course_id:course.id,p_lesson_id:null,p_reason:reason.value.trim()}));reason.value="";toast("Your report has been sent to an administrator.");})(event);});return form;})(),
      ...(sections.length > 0
        ? sections
        : [emptyState("No published lessons yet", "Your tutor has not published this content.")]),

      quizzes.length > 0
        ? el("section", { class: "card" },
            el("div", { class: "card__body" },
              el("h2", { class: "card__title" }, "Practice quizzes in the app"),
              el("ul", { class: "list" },
                ...quizzes.map((quiz) =>
                  el("li", { class: "list__row" },
                    el("div", { class: "list__main" },
                      el("strong", {}, quiz.title),
                      el("span", { class: "list__meta" },
                        `${quiz.attempt_limit} attempt${quiz.attempt_limit === 1 ? "" : "s"} · pass at ${quiz.passing_score}%${quiz.due_at ? ` · due ${fmtDate(quiz.due_at)}` : ""}`)),
                    el("a", { class: "btn btn--sm btn--primary", href: `/student/quiz/?id=${encodeURIComponent(quiz.id)}` }, "Start"))))))
        : null,

      assignments.length > 0
        ? el("section", { class: "card" },
            el("div", { class: "card__body" },
              el("h2", { class: "card__title" }, "Written Assignments"),
              el("ul", { class: "list" },
                ...assignments.map((assignment) =>
                  el("li", { class: "list__row" },
                    el("div", { class: "list__main" },
                      el("strong", {}, assignment.title),
                      el("span", { class: "list__meta" },
                        `${assignment.max_score} marks${assignment.due_at ? ` · due ${fmtDate(assignment.due_at)}` : ""}`)),
                    el("a", { class: "btn btn--sm", href: `/student/written-assignments/?id=${encodeURIComponent(assignment.id)}` }, "Open"))))))
        : null,
    );
    content.append(el('section',{class:'card'},el('div',{class:'card__body'},el('h2',{},"Linked quizzes and assignments"),el('div',{class:'btn-row'},el('a',{class:'btn',href:`/student/quizzes/?course=${encodeURIComponent(courseId)}`},'Course quizzes'),el('a',{class:'btn',href:`/student/assignments/?course=${encodeURIComponent(courseId)}`},"Course past questions")))));
  },
);
