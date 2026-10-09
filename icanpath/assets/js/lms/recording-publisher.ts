import { createLesson, createMaterialWithTarget, listCourses, listModules, updateLesson } from "./api.ts";
import { providerUrl } from "./urls.ts";
import { el, field, input, select, setChildren, toast, action, emptyState } from "./ui.ts";
import { youtubeId } from "./youtube.ts";

export async function recordingPublisher(content: HTMLElement, materials = false, pastQuestions = false): Promise<void> {
  const courses = await listCourses();
  if (!courses.length) { content.append(emptyState("No courses assigned", "Create a course before publishing recordings.")); return; }
  const course = select(courses.map(c => ({ value: c.id, label: c.title })), { required: true });
  const params = new URLSearchParams(location.search);
  if (courses.some(c => c.id === params.get("course"))) course.value = params.get("course")!;
  const module = select([], { required: true });
  const title = input({ required: true, placeholder: "For example, Business processes, Part 1" });
  const url = input({ required: true, type: "url", placeholder: materials ? "https://drive.google.com/file/d/…/view" : "https://www.youtube.com/watch?v=…" });
  const publish = el("button", { type: "submit", class: "btn btn--primary" }, materials ? (pastQuestions ? "Publish past questions" : "Publish material") : "Publish recording");
  const form = el("form", { class: "card admin-form" },
    el("h2", {}, materials ? (pastQuestions ? "Publish past questions" : "Publish study material") : "Publish a recorded lesson"),
    el("p", { class: "learning-muted" }, materials ? "Choose a course and module, then add a document link. You can add more than one document to each module. Students enrolled in the course can download them from Materials." : "Choose a course and module, then add a lesson title and YouTube link. You can publish several recordings in each module. Enrolled students can watch them in the app."),
    field("Course", course, undefined, true), field("Module", module, undefined, true),
    field("Lesson title", title, undefined, true), field(materials ? "Google Drive document download link" : "YouTube recording link", url, materials ? "Set the Drive document sharing permissions so your students can access it." : "Use a public or unlisted YouTube video that allows playback on other websites.", true), publish);
  let version = 0;
  async function refresh(): Promise<void> {
    const current = ++version;
    publish.disabled = true; module.disabled = true;
    const modules = await listModules(course.value);
    if (current !== version) return;
    setChildren(module, ...modules.map(m => el("option", { value: m.id }, m.title)));
    if (modules.some(m => m.id === params.get("module"))) module.value = params.get("module")!;
    module.disabled = !modules.length; publish.disabled = !modules.length;
  }
  course.addEventListener("change", () => { void action(refresh)(new Event("change")); });
  form.addEventListener("submit", event => { event.preventDefault(); void action(async () => {
    const link = url.value.trim();
    if (materials) providerUrl(link, "drive");
    else if (!youtubeId(link)) throw new Error("Enter a valid YouTube video link.");
    if (!title.value.trim()) throw new Error("Enter a title for the lesson.");
    publish.disabled = true;
    try {
      const lesson = await createLesson({ course_id: course.value, module_id: module.value, title: title.value.trim(), description: null });
      if (!lesson) throw new Error("Could not create the lesson.");
      if (materials) await createMaterialWithTarget({ lesson_id: lesson.id, course_id: course.value, title: title.value.trim(), type: pastQuestions ? "practice_questions" : "lecture_note", description: null, target_url: link });
      await updateLesson(lesson.id, { youtube_video_url: materials ? null : link, is_published: true });
      title.value = ""; url.value = ""; toast(materials ? "Material published to your students." : "Recording published to your students."); await refresh();
    } finally { publish.disabled = module.disabled; }
  })(event); });
  content.append(form);
  await refresh();
}
