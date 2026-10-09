import {config} from '../config.ts';
import {supabase,unwrap} from '../supabase.ts';
/**
 * Every course on the platform, from an admin's point of view.
 *
 * Admins can read courses they do not own, so this is the one screen that sees
 * the whole catalogue. It can archive and unarchive, but it cannot edit a
 * tutor's content: courses_update is scoped by manages_course().
 */

import { courseAssignments, listProfiles, listCourses, reviewCourse, setCourseStatus } from "../api.ts";
import type { Course } from "../types.ts";
import { action, confirmAction, el, emptyState, fmtDate, loading, page, pill, select, setChildren, titleCase, toast } from "../ui.ts";

void page(
  {
    role: "admin",
    title: "All courses",
    base: "/admin",
    active: "/courses/",
    subtitle: "All courses on the platform",
  },
  async (content) => {
    const teachers=(await listProfiles()).filter(p=>p.role==='tutor'&&p.status==='active');
    const teacher=select(teachers.map(p=>({value:p.id,label:p.full_name??p.id})),{'aria-label':'Tutor for imported ICAN courses'});
    const importer=el('details',{class:'card admin-syllabus-import'},el('summary',{},'Import ICAN syllabus'),el('div',{class:'card__body'},el('h2',{},'Assign syllabus drafts'),el('p',{},"Create drafts for the 15 ICAN courses, with their module headings. Courses with an existing code are skipped. Add lesson and material links before submitting a course for approval."),teacher,el('button',{type:'button',class:'btn',onclick:action(async()=>{if(config.preview)throw new Error("The demo already includes the 15 ICAN courses. Connect the database to import course drafts for real accounts.");await unwrap(supabase().rpc('import_ican_curriculum',{p_tutor:teacher.value}));location.reload();})},"Import ICAN courses and assign a tutor")));
    content.append(loading("Loading courses…"));

    const query=new URLSearchParams(location.search).get("q")?.toLowerCase()??"";
    const courses = (await listCourses()).filter(c=>c.title.toLowerCase().includes(query));
    const withCounts = await Promise.all(
      courses.map(async (course) => ({ course, assignments: await courseAssignments(course.id) })),
    );

    setChildren(content, 
      el("div", { class: "section-head section-head--split" },
        el("h1", {}, "Courses"),
        el("span", { class: "app-course__meta" }, `${courses.length} total`)),

      courses.length === 0
        ? emptyState("No courses yet", "Tutors create these from their own dashboard.")
        : el("div", { class: "app-table-wrap" },
            el("table", { class: "app-table" },
              el("thead", {}, el("tr", {},
                el("th", {}, "Course"),
                el("th", {}, "Level"),
                el("th", {}, "Assignments"),
                el("th", {}, "Status"),
                el("th", {}, "Published"),
                el("th", {}, "Actions"))),
              el("tbody", {},
                ...withCounts.map(({ course, assignments }) => courseRow(course, assignments.length))))),

      el("p", { class: "app-course__meta" },
        "Archiving keeps the content but removes it from students. To change what a course contains, the tutor must edit it."),
    );
    content.append(importer);
  },
);

function courseRow(course: Course, assignmentCount: number): HTMLElement {
  const statusSelect = select(
    (["draft", "published", "archived"] as const).map((s) => ({ value: s, label: titleCase(s) })),
    { value: course.status === "pending_review" ? "draft" : course.status },
  );

  if (course.status === "pending_review") {
    statusSelect.disabled = true;
    const firstOption = statusSelect.options.item(0);
    if (firstOption) firstOption.textContent = "Pending review";
  }

  const apply = el("button", {
    class: "btn btn--sm", type: "button",
    onclick: action(async () => {
      const next = statusSelect.value;
      if (next === course.status) return;
      if (!confirmAction(`Set “${course.title}” to ${next}?`)) return;
      await setCourseStatus(course.id, next as "draft" | "published" | "archived");
      toast(`Course is now ${next}.`);
      window.location.reload();
    }),
  }, "Apply");

  return el("tr", {},
    el("td", {},
      el("a", {href:`/admin/course/?id=${encodeURIComponent(course.id)}`}, course.title),
      course.code ? el("span", { class: "list__meta" }, course.code) : null,
      course.review_note ? el("span", { class: "list__meta" }, `Note: ${course.review_note}`) : null),
    el("td", {}, course.level ?? "—"),
    el("td", {}, String(assignmentCount)),
    el("td", {},
      pill(course.status,
        course.status === "published" ? "done" : course.status === "pending_review" ? "soon" : course.status === "archived" ? "warn" : "default")),
    el("td", {}, fmtDate(course.published_at)),
    el("td", {},
      el("div", { class: "app-inline-form" }, statusSelect, apply),
      course.status === "pending_review"
        ? el("a", { class: "btn btn--sm", href: `/admin/review/?course=${encodeURIComponent(course.id)}` }, "Review")
        : el("button", {
            class: "btn btn--sm", type: "button",
            onclick: action(async () => {
              if (!confirmAction(`Return “${course.title}” to the tutor as a draft?`)) return;
              await reviewCourse(course.id, "reject", "Returned by an administrator");
              toast("Returned to the tutor.");
              window.location.reload();
            }),
          }, "Return to tutor")));
}
