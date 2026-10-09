import {config} from "../config.ts";
import {supabase,unwrap} from "../supabase.ts";
import { providerUrl } from "../urls.ts";
/**
 * Live class management.
 *
 * The meeting URL is written into the private bucket and referenced by path, so
 * it is never readable through PostgREST — not even by the tutor who set it.
 * Status changes go through set_live_class_status(), which refuses to un-cancel
 * and records an audit row.
 */

import { attachClassRecording, courseLiveClasses, configureLearningLink, createLiveClass, listCourses, setLiveClassStatus } from "../api.ts";
import type { Course, LiveClass } from "../types.ts";
import { action, confirmAction, el, emptyState, field, fmtDate, input, loading, page, pill, select, setChildren, textarea, toast } from "../ui.ts";

const courseFilter = new URLSearchParams(window.location.search).get("course");

void page(
  {
    role: "tutor",
    title: "Live classes",
    base: "/tutor",
    active: "/live/",
    subtitle: "Schedule classes and add recordings",
  },
  async (content) => {
    content.append(loading("Loading classes…"));

    const courses = await listCourses();
    const targets = courseFilter ? courses.filter((c) => c.id === courseFilter) : courses;
    const classes = (await Promise.all(targets.map((course) => courseLiveClasses(course.id)))).flat();

    setChildren(content, 
      filterBar(courses, courseFilter),
      classes.length === 0
        ? emptyState("No live classes", "Schedule one using the form below.")
        : el("div", { class: "app-table-wrap" },
            el("table", { class: "app-table" },
              el("thead", {}, el("tr", {},
                el("th", {}, "Class"),
                el("th", {}, "Course"),
                el("th", {}, "When"),
                el("th", {}, "Status"),
                el("th", {}, "Actions"))),
              el("tbody", {},
                ...classes.map((item) => classRow(item, targets.find((c) => c.id === item.course_id)))))),
      createPanel(targets),
    );
  },
);

function filterBar(courses: Course[], active: string | null): HTMLElement | null {
  if (courses.length < 2) return null;
  return el("div", { class: "btn-row" },
    el("a", { class: `btn btn--sm ${active ? "" : "btn--primary"}`, href: "/tutor/live/" }, "All courses"),
    ...courses.map((course) =>
      el("a", {
        class: `btn btn--sm ${active === course.id ? "btn--primary" : ""}`,
        href: `/tutor/live/?course=${encodeURIComponent(course.id)}`,
      }, course.title)));
}

function classRow(item: LiveClass, course: Course | undefined): HTMLElement {
  const meetingInput = input({ type: "url", placeholder: "Meeting link", "aria-label": `Meeting link for ${item.title}` });
  const saveMeeting = el("button", { class: "btn btn--sm", type: "button", onclick: action(async () => {
    await configureLearningLink(`courses/${item.course_id}/live/${item.id}.url`, meetingInput.value.trim(), item.platform);
    meetingInput.value = "";
    toast("Meeting link saved.");
  }) }, "Save meeting link");
  const recordingInput = input({ value: item.recording_youtube_url ?? "", placeholder: "https://youtu.be/…", "aria-label": `Recording URL for ${item.title}` });

  const attach = el("button", {
    class: "btn btn--sm", type: "button",
    onclick: action(async () => {
      const url = recordingInput.value.trim();
      if (!url) {
        toast("Enter a YouTube link first.", "err");
        return;
      }
      await attachClassRecording(item.id, url);
      toast("Recording added.");
      window.location.reload();
    }),
  }, item.recording_youtube_id ? "Replace" : "Add recording");

  const setStatus = (status: LiveClass["status"]) => async (): Promise<void> => {
    await setLiveClassStatus(item.id, status);
    toast(`Class marked ${status}.`);
    window.location.reload();
  };

  return el("tr", {},
    el("td", {},
      el("strong", {}, item.title),
      el("span", { class: "list__meta" }, item.platform.replace(/_/g, " "))),
    el("td", {}, course?.title ?? "—"),
    el("td", {},
      fmtDate(item.scheduled_date),
      el("span", { class: "list__meta" }, `${item.start_time.slice(0, 5)} to ${item.end_time.slice(0, 5)}`)),
    el("td", {},
      pill(item.status,
        item.status === "live" ? "live" : item.status === "completed" ? "done" : item.status === "cancelled" ? "warn" : "soon")),
    el("td", {},
      el("div", { class: "btn-row" },
        item.status === "scheduled"
          ? el("button", { class: "btn btn--sm", type: "button", onclick: action(setStatus("live")) }, "Go live")
          : null,
        item.status === "live"
          ? el("button", { class: "btn btn--sm", type: "button", onclick: action(setStatus("completed")) }, "Finish")
          : null,
        item.status !== "cancelled"
          ? el("button", {
              class: "btn btn--sm", type: "button",
              onclick: action(async () => {
                if (!confirmAction(`Cancel “${item.title}”? This cannot be undone.`)) return;
                await setLiveClassStatus(item.id, "cancelled");
                toast("Class cancelled.");
                window.location.reload();
              }),
            }, "Cancel")
          : null),
      item.status === "scheduled" ? el("button",{type:"button",class:"btn btn--sm",onclick:action(async()=>{if(config.preview)throw new Error("Review requests cannot be submitted until the app has a database connection.");await unwrap(supabase().rpc("request_live_review",{p_live_class_id:item.id}));toast("Submitted. Students cannot join until approved.");})},"Request admin approval") : null,
      el("div", { class: "app-inline-form" }, meetingInput, saveMeeting),
      el("div", { class: "app-inline-form" }, recordingInput, attach)));
}

function createPanel(courses: Course[]): HTMLElement | null {
  if (courses.length === 0) return null;

  const courseSelect = select(courses.map((c) => ({ value: c.id, label: c.title })));
  const titleInput = input({ placeholder: "Class title" });
  const platformSelect = select([
    { value: "youtube_live", label: "YouTube Live" },
    { value: "google_meet", label: "Google Meet" },
    { value: "zoom", label: "Zoom" },
  ]);
  const dateInput = input({ type: "date" });
  const startInput = input({ type: "time", value: "18:00" });
  const endInput = input({ type: "time", value: "19:00" });
  const pathInput = input({ type: "url", placeholder: "https://meet.google.com/…" });
  const notesInput = textarea({ rows: "2", placeholder: "Optional notes for students" });

  const submit = el("button", { class: "btn btn--primary", type: "submit" }, "Schedule class");

  const form = el("form", { class: "app-form" },
    el("div", { class: "form-grid" },
      field("Course", courseSelect, undefined, true),
      field("Title", titleInput, undefined, true),
      field("Platform", platformSelect, undefined, true),
      field("Date", dateInput, undefined, true),
      field("Start", startInput, undefined, true),
      field("End", endInput, undefined, true),
      field("Meeting link", pathInput, "Paste the link from your selected meeting platform.", true),
      field("Notes", notesInput)),
    el("div", { class: "btn-row" }, submit));

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const courseId = courseSelect.value;
    const scheduled = dateInput.value;

    if (!titleInput.value.trim()) return toast("Enter a class title.", "err");
    if (!scheduled) return toast("Choose a date.", "err");
    if (startInput.value >= endInput.value) return toast("The end time must be after the start time.", "err");
    if (!pathInput.value.trim()) return toast("Paste the meeting link.", "err");

    try { providerUrl(pathInput.value.trim(), platformSelect.value); }
    catch (error) { return toast(error instanceof Error ? error.message : "Check the meeting link.", "err"); }

    submit.disabled = true;
    try {
      await createLiveClass({
        course_id: courseId,
        lesson_id: null,
        title: titleInput.value.trim(),
        platform: platformSelect.value,
        scheduled_date: scheduled,
        start_time: startInput.value,
        end_time: endInput.value,
        meeting_url: pathInput.value.trim(),
        notes: notesInput.value.trim() || null,
      });
      toast("Class scheduled.");
      window.location.reload();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not schedule the class.", "err");
      submit.disabled = false;
    }
  });

  return el("section", { class: "card" },
    el("div", { class: "card__body" },
      el("h2", { class: "card__title" }, "Schedule a class"),
      el("p", { class: "card__text" }, "Enrolled students see the schedule and can open your meeting link."),
      form));
}