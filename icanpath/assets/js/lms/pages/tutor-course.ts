/**
 * The course builder.
 *
 * One screen for the whole authoring flow: details, modules, lessons, materials,
 * quizzes, questions, assignments and live classes. Everything writes through
 * the granted columns only — status moves are refused by Postgres and must go
 * through submit_course_for_review(), so the UI offers a button rather than a
 * status dropdown.
 */

import {
  courseAssignments,
  courseLiveClasses,
  createAssignment,
  createQuestion,
  createQuiz,
  deleteAssignment,
  deleteQuestion,
  getCourse,
  listLessons,
  listManagedQuestions,
  listModules,
  listQuizzes,
  setLiveClassStatus,
  submitCourseForReview,
  updateAssignment,
  updateCourse,
  updateQuiz,
  updateQuestion,
} from "../api.ts";
import type { Assignment, Course, Lesson, ManagedQuestion, QuestionType, Quiz } from "../types.ts";
import { action, confirmAction, el, emptyState, field, fmtDate, input, loading, page, pill, select, setChildren, textarea, toast } from "../ui.ts";

const courseId = new URLSearchParams(window.location.search).get("id");

void page(
  {
    role: "tutor",
    title: "Manage course",
    base: "/tutor",
    active: "/courses/",
  },
  async (content) => {
    if (!courseId) {
      setChildren(content, emptyState("No course selected", "Open a course from your list."));
      return;
    }

    content.append(loading("Loading course…"));

    const course = await getCourse(courseId);
    if (!course) {
      setChildren(content, emptyState("Course not found"));
      return;
    }

    const [modules, lessons, quizzes, assignments, classes] = await Promise.all([
      listModules(courseId),
      listLessons(courseId),
      listQuizzes(courseId),
      courseAssignments(courseId),
      courseLiveClasses(courseId),
    ]);

    setChildren(content, 
      crumbs(course),
      detailsPanel(course),
      el("div", { class: "app-grid app-grid--wide" },
        modulesPanel(course, modules, lessons),
        await rightColumn(course, quizzes, assignments, classes)),
    );
  },
);

const crumbs = (course: Course): HTMLElement =>
  el("nav", { class: "app-crumbs", "aria-label": "Breadcrumb" },
    el("a", { href: "/tutor/courses/" }, "My courses"),
    el("span", { "aria-hidden": "true" }, "/"),
    el("span", { "aria-current": "page" }, course.title));

/* ----------------------------------------------------------------- details */

function detailsPanel(course: Course): HTMLElement {
  const titleInput = input({ value: course.title });
  const codeInput = input({ value: course.code ?? "" });
  const levelSelect = select(
    ["Foundation", "Skills", "Professional"].map((v) => ({ value: v, label: v })),
    { value: course.level ?? "Foundation" },
  );
  const descriptionInput = textarea({ rows: "3" });
  descriptionInput.value = course.description ?? "";

  const shortDescription = textarea({ rows: "2", maxlength: "500" });
  shortDescription.value = course.short_description ?? "";
  const duration = input({ type: "number", min: "1", max: "100000", value: course.duration_minutes ?? "" });
  const objectives = textarea({ rows: "4", placeholder: "Write one learning goal on each line." });
  objectives.value = (course.learning_objectives ?? []).join("\n");
  const saveButton = el("button", { class: "btn btn--primary btn--sm", type: "submit" }, "Save details");
  const form = el("form", { class: "app-form" },
    el("div", { class: "form-grid" },
      field("Title", titleInput, undefined, true),
      field("Code", codeInput),
      field("Level", levelSelect),
      field("Description", descriptionInput),
      field("Short description", shortDescription),
      field("Duration in minutes", duration),
      field("What students will learn", objectives, "Write one learning goal on each line.")),
    el("div", { class: "btn-row" }, saveButton));

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    saveButton.disabled = true;
    try {
      await updateCourse(course.id, {
        title: titleInput.value.trim(),
        code: codeInput.value.trim() || null,
        level: levelSelect.value,
        description: descriptionInput.value.trim() || null,
        short_description: shortDescription.value.trim() || null,
        duration_minutes: duration.value ? Number(duration.value) : null,
        learning_objectives: objectives.value.split("\n").map(line => line.trim()).filter(Boolean),
      });
      toast("Course updated.");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not save.", "err");
    } finally {
      saveButton.disabled = false;
    }
  });

  const submitButton = course.status === "draft"
    ? el("button", {
        class: "btn btn--gold",
        type: "button",
        onclick: action(async () => {
          if (!confirmAction(`Submit “${course.title}” for review?`)) return;
          await submitCourseForReview(course.id);
          toast("Submitted for review.");
          window.location.reload();
        }),
      }, "Submit for review")
    : null;

  return el("section", { class: "card" },
    el("div", { class: "card__body" },
      el("div", { class: "section-head section-head--split" },
        el("h2", { class: "card__title" }, "Course details"),
        course.status === "published" ? pill("Published", "done") : course.status === "pending_review" ? pill("Awaiting review", "soon") : pill("Draft", "default")),
      form,
      course.status === "published"
        ? el("p", { class: "app-course__meta" }, "You can edit published course content. You cannot remove enrolled students here.")
        : null,
      submitButton ? el("div", { class: "btn-row" }, submitButton) : null));
}

/* ------------------------------------------------------- modules and lessons */

function modulesPanel(course: Course, modules: Awaited<ReturnType<typeof listModules>>, lessons: Lesson[]): HTMLElement {
  const target = (moduleId: string, lessonId?: string) => `/tutor/lessons/?course=${encodeURIComponent(course.id)}&module=${encodeURIComponent(moduleId)}${lessonId ? `&lesson=${encodeURIComponent(lessonId)}` : ""}`;
  return el("section", { class: "card" }, el("div", { class: "card__body" },
    el("h2", { class: "card__title" }, "Modules and lessons"),
    el("p", { class: "learning-muted" }, "Choose a module or lesson to open the Lessons page."),
    ...modules.map(module => el("section", { class: "app-module" },
      el("h3", {}, el("a", { href: target(module.id) }, module.title)),
      lessons.some(l => l.module_id === module.id)
        ? el("ul", { class: "list" }, ...lessons.filter(l => l.module_id === module.id).map(lesson =>
          el("li", { class: "list__row" },
            el("a", { href: target(module.id, lesson.id), class: "list__main" }, lesson.title),
            pill(lesson.is_published ? "Published" : "Draft", lesson.is_published ? "done" : "default"))))
        : el("p", { class: "learning-muted" }, "No lessons yet. Open this module to publish a recording."))),
    !modules.length ? emptyState("No modules yet") : null));
}

async function rightColumn(
  course: Course,
  quizzes: Quiz[],
  assignments: Assignment[],
  classes: Awaited<ReturnType<typeof courseLiveClasses>>,
): Promise<HTMLElement> {
  const quizBody = el("div", {});
  const quizTitle = input({ placeholder: "Quiz title" });
  const quizInstructions=textarea({rows:3,"aria-label":"Quiz instructions"});
  const quizTime=input({type:"number",min:1,"aria-label":"Time limit (minutes)"});
  const quizDue=input({type:"datetime-local","aria-label":"Quiz deadline"});
  const quizPass = input({ type: "number", min: "0", max: "100", value: "50", "aria-label": "Pass mark percentage" });
  const quizLimit = input({ type: "number", min: "1", value: "2", "aria-label": "Attempt limit" });
  const addQuiz = el("button", { class: "btn btn--sm btn--primary", type: "submit" }, "Create quiz");

  const quizForm = el("form", { class: "app-inline-form app-inline-form--wrap" }, quizTitle, quizPass, quizLimit, quizInstructions,quizTime,quizDue,addQuiz);
  quizForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!quizTitle.value.trim()) return;
    addQuiz.disabled = true;
    try {
      await createQuiz({
        course_id: course.id,
        lesson_id: null,
        title: quizTitle.value.trim(),
        instructions: quizInstructions.value||null,
        time_limit_minutes: quizTime.value?Number(quizTime.value):null,
        passing_score: Number(quizPass.value),
        attempt_limit: Number(quizLimit.value) || 1,
        due_at: quizDue.value?new Date(quizDue.value).toISOString():null,
      });
      quizTitle.value = "";
      window.location.reload();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not create the quiz.", "err");
      addQuiz.disabled = false;
    }
  });

  if (quizzes.length === 0) quizBody.append(emptyState("No quizzes yet", "Create one below."));
  for (const quiz of quizzes) quizBody.append(await quizCard(quiz),editPanel('Edit quiz',{title:input({required:true,value:quiz.title}),instructions:textarea({rows:3,value:quiz.instructions??''}),passing_score:input({type:'number',min:0,max:100,required:true,value:quiz.passing_score}),attempt_limit:input({type:'number',min:1,required:true,value:quiz.attempt_limit}),time_limit_minutes:input({type:'number',min:1,value:quiz.time_limit_minutes??''}),due_at:input({type:'datetime-local',value:quiz.due_at?localDateTime(quiz.due_at):''})},v=>updateQuiz(quiz.id,{title:v.title,instructions:v.instructions,passing_score:Number(v.passing_score),attempt_limit:Number(v.attempt_limit),time_limit_minutes:v.time_limit_minutes?Number(v.time_limit_minutes):null,due_at:v.due_at?new Date(v.due_at).toISOString():null})));
  quizBody.append(quizForm);

  const assignmentBody = el("div", {});
  const assignmentTitle = input({ placeholder: "Assignment title" });
  const assignmentInstructions=textarea({rows:4,"aria-label":"Assignment instructions"});
  const assignmentMarks = input({ type: "number", min: "1", value: "100", "aria-label": "Maximum marks" });
  const assignmentDue = input({ type: "datetime-local", "aria-label": "Due date" });
  const addAssignment = el("button", { class: "btn btn--sm btn--primary", type: "submit" }, "Create");

  const assignmentForm = el("form", { class: "app-inline-form app-inline-form--wrap" }, assignmentTitle, assignmentInstructions,assignmentMarks, assignmentDue, addAssignment);
  assignmentForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!assignmentTitle.value.trim()) return;
    addAssignment.disabled = true;
    try {
      await createAssignment({
        course_id: course.id,
        title: assignmentTitle.value.trim(),
        instructions: assignmentInstructions.value||null,
        due_at: assignmentDue.value ? new Date(assignmentDue.value).toISOString() : null,
        max_score: Number(assignmentMarks.value) || 100,
      });
      assignmentTitle.value = "";
      window.location.reload();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not create the assignment.", "err");
      addAssignment.disabled = false;
    }
  });

  if (assignments.length === 0) assignmentBody.append(emptyState("No assignments yet", "Create one below."));
  for (const assignment of assignments) assignmentBody.append(assignmentRow(assignment),editPanel('Edit assignment',{title:input({required:true,value:assignment.title}),instructions:textarea({rows:4,value:assignment.instructions??''}),due_at:input({type:'datetime-local',value:assignment.due_at?localDateTime(assignment.due_at):''})},v=>updateAssignment(assignment.id,{title:v.title,instructions:v.instructions,due_at:v.due_at?new Date(v.due_at).toISOString():null})));
  assignmentBody.append(assignmentForm);

  return el("div", { class: "app-stack" },el('section',{class:'card'},el('div',{class:'card__body'},el('h2',{},"Publish Google Form and Drive links"),el('div',{class:'btn-row'},el('a',{class:'btn',href:`/tutor/quizzes/?course=${encodeURIComponent(course.id)}`},'Quiz links'),el('a',{class:'btn',href:`/tutor/assignments/?course=${encodeURIComponent(course.id)}`},'Assignment links')))),
    el("section", { class: "card" },
      el("div", { class: "card__body" }, el("h2", { class: "card__title" }, "Practice quizzes in the app"), quizBody)),
    el("section", { class: "card" },
      el("div", { class: "card__body" }, el("h2", { class: "card__title" }, "Written Assignments"), assignmentBody)),
    el("section", { class: "card" },
      el("div", { class: "card__body" },
        el("div", { class: "section-head section-head--split" },
          el("h2", { class: "card__title" }, "Live classes"),
          el("a", { class: "btn btn--sm", href: `/tutor/live/?course=${encodeURIComponent(course.id)}` }, "Manage")),
        classes.length === 0
          ? emptyState("No live classes scheduled")
          : el("ul", { class: "list" },
              ...classes.map((item) =>
                el("li", { class: "list__row" },
                  el("div", { class: "list__main" },
                    el("strong", {}, item.title),
                    el("span", { class: "list__meta" }, `${fmtDate(item.scheduled_date)} · ${item.status}`)),
                  el("button", {
                    class: "btn btn--sm", type: "button",
                    onclick: action(async () => {
                      if (!confirmAction(`Cancel “${item.title}”?`)) return;
                      await setLiveClassStatus(item.id, "cancelled");
                      toast("Class cancelled.");
                      window.location.reload();
                    }),
                  }, "Cancel")))))));
}

async function quizCard(quiz: Quiz): Promise<HTMLElement> {
  const questions = await listManagedQuestions(quiz.id);
  const list = el("div", { class: "list" });

  const promptInput = input({ placeholder: "Question" });
  const typeSelect = select([
    { value: "mcq", label: "Multiple choice" },
    { value: "true_false", label: "True / false" },
    { value: "short_answer", label: "Short answer" },
  ]);
  const optionsInput = input({ placeholder: "Separate each answer option with |." });
  const answerInput = input({ placeholder: "Correct answer" });
  const pointsInput = input({ type: "number", min: "1", value: "1", "aria-label": "Points" });
  const addQuestion = el("button", { class: "btn btn--sm", type: "submit" }, "Add question");

  const questionForm = el("form", { class: "app-question-form" },
    promptInput,
    el("div", { class: "app-inline-form app-inline-form--wrap" }, typeSelect, optionsInput, answerInput, pointsInput, addQuestion));

  questionForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const prompt = promptInput.value.trim();
    const answer = answerInput.value.trim();
    if (!prompt || !answer) {
      toast("A question needs a prompt and a correct answer.", "err");
      return;
    }
    addQuestion.disabled = true;
    try {
      const raw = optionsInput.value.trim();
      const type = typeSelect.value as QuestionType;
      await createQuestion({
        quiz_id: quiz.id,
        prompt,
        question_type: type,
        options: type === "mcq" && raw ? raw.split("|").map((s) => s.trim()).filter(Boolean) : null,
        correct_answer: answer,
        explanation: null,
        points: Number(pointsInput.value) || 1,
      });
      promptInput.value = "";
      answerInput.value = "";
      optionsInput.value = "";
      window.location.reload();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not add the question.", "err");
      addQuestion.disabled = false;
    }
  });

  if (questions.length === 0) list.append(el("p", { class: "app-course__meta" }, "No questions yet."));
  for (const question of questions) list.append(questionRow(question));

  const publishToggle = el("button", {
    class: "btn btn--sm", type: "button",
    onclick: action(async () => {
      if (!confirmAction(`${quiz.is_published ? "Unpublish" : "Publish"} “${quiz.title}”?`)) return;
      await (await import("../api.ts")).updateQuiz(quiz.id, { is_published: !quiz.is_published });
      toast(quiz.is_published ? "Quiz unpublished." : "Quiz published.");
      window.location.reload();
    }),
  }, quiz.is_published ? "Unpublish" : "Publish");

  return el("article", { class: "app-quiz-card" },
    el("div", { class: "section-head section-head--split" },
      el("strong", {}, quiz.title),
      el("div", { class: "btn-row" },
        pill(quiz.is_published ? "Published" : "Draft", quiz.is_published ? "done" : "default"),
        publishToggle)),
    el("p", { class: "app-course__meta" },
      `${questions.length} question${questions.length === 1 ? "" : "s"} · pass at ${quiz.passing_score}% · ${quiz.attempt_limit} attempt(s)`),
    list,
    questionForm);
}

function questionRow(question: ManagedQuestion): HTMLElement {
  return el("div", { class: "app-question" },
    el("div", { class: "section-head section-head--split" },
      el("span", {}, question.prompt),
      el("div", { class: "btn-row" },
        el("button", {
          class: "btn btn--sm", type: "button",
          onclick: action(async () => {
            const next = window.prompt("Correct answer", question.correct_answer);
            if (next === null) return;
            await updateQuestion(question.id, { correct_answer: next.trim() });
            toast("Answer updated.");
            window.location.reload();
          }),
        }, "Edit answer"),
        el("button", {
          class: "btn btn--sm", type: "button",
          onclick: action(async () => {
            if (!confirmAction("Delete this question?")) return;
            await deleteQuestion(question.id);
            toast("Question deleted.");
            window.location.reload();
          }),
        }, "Delete"))),
    el("p", { class: "app-course__meta" },
      `${question.question_type.replace(/_/g, " ")} · ${question.points} mark(s) · answer: ${question.correct_answer}`));
}

function assignmentRow(assignment: Assignment): HTMLElement {
  const publishToggle = el("button", {
    class: "btn btn--sm", type: "button",
    onclick: action(async () => {
      await updateAssignment(assignment.id, { is_published: !assignment.is_published });
      toast(assignment.is_published ? "Assignment unpublished." : "Assignment published.");
      window.location.reload();
    }),
  }, assignment.is_published ? "Unpublish" : "Publish");

  const releaseResults = el("button", {
    class: "btn btn--sm",
    type: "button",
    onclick: action(async () => {
      if (!confirmAction(`Release the marks for “${assignment.title}”? Students will be able to see their scores and feedback.`)) return;
      await updateAssignment(assignment.id, { results_published: true });
      toast("Marks released.");
      window.location.reload();
    }),
  }, assignment.results_published ? "Marks released" : "Show marks to students");

  return el("div", { class: "app-assignment" },
    el("div", { class: "section-head section-head--split" },
      el("strong", {}, assignment.title),
      el("div", { class: "btn-row" },
        pill(assignment.is_published ? "Published" : "Draft", assignment.is_published ? "done" : "default"),
        publishToggle,
        releaseResults)),
    el("p", { class: "app-course__meta" },
      `${assignment.max_score} marks${assignment.due_at ? ` · due ${fmtDate(assignment.due_at)}` : ""}` +
      (assignment.results_published ? " · results visible to students" : " · results hidden")),
    el("button", {
      class: "btn btn--sm", type: "button",
      onclick: action(async () => {
        if (!confirmAction(`Delete “${assignment.title}”?`)) return;
        await deleteAssignment(assignment.id);
        toast("Assignment deleted.");
        window.location.reload();
      }),
    }, "Delete"));
}
function editPanel(title:string,fields:Record<string,HTMLInputElement|HTMLTextAreaElement>,save:(values:Record<string,string>)=>Promise<void>):HTMLElement {
 const form=el('form',{class:'app-form'},...Object.entries(fields).map(([key,node])=>field(key.replaceAll('_',' '),node)),el('button',{class:'btn',type:'submit'},'Save changes'));
 form.addEventListener('submit',event=>{event.preventDefault();void action(async()=>{const values:Record<string,string>={};for(const [key,node]of Object.entries(fields))values[key]=node.value;await save(values);location.reload();})(event);});return el('details',{class:'app-details'},el('summary',{},title),form);
}

function localDateTime(value:string):string{const date=new Date(value);return new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,16);}
