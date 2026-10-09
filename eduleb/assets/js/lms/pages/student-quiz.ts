/**
 * The quiz runner.
 *
 * Only the question prompt, type, options and marks are readable here — the
 * correct answers are not in the client's grant. Marking happens in Postgres
 * when the attempt is submitted, so the score shown at the end is the server's,
 * not something the browser calculated.
 */

import { attemptAnswers, listQuizQuestions, myQuiz, myQuizAttempts, startQuizAttempt, submitQuizAttempt } from "../api.ts";
import { el, emptyState, fmtDate, loading, page, pill, setChildren, toast } from "../ui.ts";

const quizId = new URLSearchParams(window.location.search).get("id");

void page(
  {
    role: "student",
    title: "Quiz",
    base: "/student",
    active: "/quizzes/",
  },
  async (content) => {
    if (!quizId) {
      setChildren(content, emptyState("No quiz selected", "Open a quiz from your courses."));
      return;
    }

    content.append(loading("Loading quiz…"));

    const [quiz, questions, attempts] = await Promise.all([
      myQuiz(quizId),
      listQuizQuestions(quizId),
      myQuizAttempts(quizId),
    ]);

    if (!quiz) {
      setChildren(content, emptyState("Quiz not found", "It may have been unpublished."));
      return;
    }

    const used = attempts.filter((a) => a.status !== "in_progress").length;
    const exhausted = used >= quiz.attempt_limit;
    const graded = attempts.find((a) => a.status === "graded");

    setChildren(content, 
      el("nav", { class: "app-crumbs", "aria-label": "Breadcrumb" },
        el("a", { href: "/student/practice-quizzes/" }, "Quizzes"),
        el("span", { "aria-hidden": "true" }, "/"),
        el("span", { "aria-current": "page" }, quiz.title)),

      el("header", { class: "app-page-head" },
        el("h1", {}, quiz.title),
        quiz.instructions ? el("p", {}, quiz.instructions) : null,
        el("p", { class: "app-course__meta" },
          `${questions.length} question${questions.length === 1 ? "" : "s"} · pass at ${quiz.passing_score}%` +
          (quiz.time_limit_minutes ? ` · ${quiz.time_limit_minutes} minute limit` : "") +
          (quiz.due_at ? ` · due ${fmtDate(quiz.due_at)}` : ""))),

      graded ? await resultPanel(graded.id, attempts.length) : null,

      exhausted
        ? emptyState("No attempts left", `You have used all ${quiz.attempt_limit} attempts.`)
        : questions.length === 0
          ? emptyState("This quiz has no questions yet")
          : await runner(quiz.id, questions),
    );
  },
);

/**
 * @param questions the student-facing shape, which carries no answers.
 */
async function runner(quizId: string, questions: Array<{ id: string; prompt: string; question_type: string; options: string[] | null; points: number }>) {
  // submit_quiz_attempt() only marks an attempt that is already open, so the
  // attempt is started here rather than at submit time — otherwise every quiz
  // fails on the first click with "no attempt in progress".
  try {
    await startQuizAttempt(quizId);
  } catch (error) {
    return emptyState("Could not start the quiz",
      error instanceof Error ? error.message : "Try again in a moment.");
  }

  const answers = new Map<string, string>();
  const host = el("form", { class: "app-quiz" });

  for (const [index, question] of questions.entries()) {
    let control: HTMLElement;

    if (question.question_type === "short_answer") {
      control = el("input", { class: "input", type: "text", name: question.id, required: true });
    } else if (question.question_type === "true_false") {
      control = el("select", { class: "input", name: question.id, required: true },
        el("option", { value: "" }, "Choose…"),
        el("option", { value: "true" }, "True"),
        el("option", { value: "false" }, "False"));
    } else {
      control = el("div", { class: "app-quiz__options", role: "radiogroup", "aria-label": question.prompt },
        ...(question.options ?? []).map((option) => {
          const id = `${question.id}-${option}`;
          const radio = el("input", { type: "radio", id, name: question.id, value: option, required: true });
          return el("label", { class: "app-quiz__option", for: id }, radio, el("span", {}, option));
        }));
    }

    host.append(
      el("fieldset", { class: "app-quiz__q" },
        el("legend", {}, `${index + 1}. ${question.prompt}`, el("span", { class: "app-quiz__pts" }, `${question.points} mark${question.points === 1 ? "" : "s"}`)),
        control),
    );

    // Read answers from the form at submit time; keeping them in a Map would
    // mean re-syncing every control on every change.
    control.addEventListener("change", () => {
      const data = new FormData(host);
      for (const [key, value] of data.entries()) answers.set(key, String(value));
    });
  }

  const submit = el("button", { class: "btn btn--primary btn--lg", type: "submit" }, "Submit answers");

  host.addEventListener("submit", async (event) => {
    event.preventDefault();
    const collected = new Map<string, string>();
    for (const [key, value] of new FormData(host).entries()) collected.set(key, String(value));

    submit.disabled = true;
    submit.textContent = "Checking your answers…";
    try {
      const result = await submitQuizAttempt(quizId, Object.fromEntries(collected));
      showResult(result);
      toast(`Scored ${result.score} of ${result.max_score}.`);
    } catch (error) {
      submit.disabled = false;
      submit.textContent = "Submit answers";
      toast(error instanceof Error ? error.message : "Could not submit the quiz.", "err");
    }
  });

  return el("div", {},
    el("h2", { class: "app-quiz__title" }, usedAttemptsHint(0)),
    host,
    el("div", { class: "btn-row" }, submit));
}

const usedAttemptsHint = (count: number): string => (count === 0 ? "Answer every question, then submit." : "");

/** Replaces the runner with the server's mark. */
function showResult(result: {
  score: number;
  max_score: number;
  percentage: number;
  passed: boolean;
  review: Array<{ question_id: string; your_answer: string; correct_answer: string; is_correct: boolean; explanation: string | null; points_awarded: number }>;
}): void {
  const host = document.querySelector(".app-quiz")?.parentElement;
  if (!host) return;

  setChildren(host, 
    el("section", { class: "card" },
      el("div", { class: "card__body" },
        el("div", { class: "section-head section-head--split" },
          el("h2", { class: "card__title" }, result.passed ? "Passed" : "Not passed"),
          pill(`${result.score} / ${result.max_score} (${result.percentage}%)`, result.passed ? "done" : "warn")),
        el("p", { class: "card__text" }, result.passed
          ? "Well done. Your result has been recorded."
          : "Review the answers below, then try again if you have attempts left."),
        el("ul", { class: "list" },
          ...result.review.map((item) =>
            el("li", { class: "list__row" },
              el("div", { class: "list__main" },
                el("strong", {}, `Your answer: ${item.your_answer || "(blank)"}`),
                el("span", { class: "list__meta" }, `Correct answer: ${item.correct_answer}`),
                item.explanation ? el("span", { class: "list__meta" }, item.explanation) : null),
              pill(item.is_correct ? `+${item.points_awarded}` : "0", item.is_correct ? "done" : "warn")))))),
    el("div", { class: "btn-row" },
      el("a", { class: "btn btn--primary", href: "/student/practice-quizzes/" }, "Back to quizzes"),
      el("button", { class: "btn", type: "button", onclick: () => window.location.reload() }, "Review questions")));
}

/**
 * A previously graded attempt. Only is_correct is shown — the client cannot read
 * the correct answers for an old attempt, and does not need to.
 */
async function resultPanel(attemptId: string, attemptsUsed: number): Promise<HTMLElement> {
  const answers = await attemptAnswers(attemptId);

  return el("section", { class: "card" },
    el("div", { class: "card__body" },
      el("h2", { class: "card__title" }, "Your previous attempt"),
      el("p", { class: "app-course__meta" }, `${attemptsUsed} of your attempts used.`),
      answers.length > 0
        ? el("ul", { class: "list" },
            ...answers.map((answer) =>
              el("li", { class: "list__row" },
                el("span", { class: "list__meta" }, `Your answer: ${answer.answer || "(blank)"}`),
                pill(answer.is_correct ? `+${answer.points_awarded}` : "0", answer.is_correct ? "done" : "warn"))))
        : el("p", { class: "app-course__meta" }, "Answers for this attempt are not available.")));
}