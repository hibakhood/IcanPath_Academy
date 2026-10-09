/**
 * Upcoming and past live classes.
 *
 * The meeting link is never stored in a column the browser can read. It lives in
 * the private bucket and is released by get_private_resource_url(), which
 * re-checks enrolment before minting a link.
 */

import { myUpcomingClasses, coursesFor, myEnrollments } from "../api.ts";
import {joinClass} from "../learning-api.ts";
import { action, el, emptyState, fmtDateLong, fmtTime, loading, page, pill, setChildren } from "../ui.ts";

void page(
  {
    role: "student",
    title: "Live classes",
    base: "/student",
    active: "/live/",
    subtitle: "Join a session or watch the recording",
  },
  async (content) => {
    content.append(loading("Loading live classes…"));

    const classes = await myUpcomingClasses();
    const courses=await coursesFor((await myEnrollments()).filter(e=>e.status==="active").map(e=>e.course_id));
    for(const item of classes)item.course_title=courses.find(c=>c.id===item.course_id)?.title;

    if (classes.length === 0) {
      setChildren(content, 
        emptyState("No live classes scheduled", "Your tutors will announce sessions here."),
        el("div", { class: "btn-row btn-row--center" },
          el("a", { class: "btn btn--primary", href: "/student/courses/" }, "Back to courses")),
      );
      return;
    }

    setChildren(content, 
      el("div", { class: "section-head section-head--split" },
        el("h1", {}, "Live classes"),
        el("span", { class: "app-course__meta" }, `${classes.length} sessions & recordings`)),

      el("div", { class: "app-grid app-grid--cards" },
        ...classes.map((item) => {
          const isLive = item.status === "live";

          return el("article", { class: "card app-live" },
            el("div", { class: "card__body" },
              el("div", { class: "section-head section-head--split" },
                el("h2", { class: "card__title" }, item.title),
                pill(
                  isLive ? "Live now" : item.status === "completed" ? "Completed" : item.status,
                  isLive ? "live" : item.status === "completed" ? "done" : "soon",
                )),
              el("p", { class: "app-course__meta" },
                `${item.course_title ?? ""} · ${fmtDateLong(item.scheduled_date)}`),
              el("p", { class: "app-course__meta" },
                `${fmtTime(item.start_time)} to ${fmtTime(item.end_time)} ${item.timezone??"Africa/Lagos"} · ${item.platform.replace(/_/g, " ")}`),
              item.notes ? el("p", {}, item.notes) : null,
              el("div", { class: "btn-row" },
                // A scheduled session has no meeting file until the tutor adds
                // one, so the button only appears when a path is known.
                item.status === "completed" && item.recording_youtube_id
                  ? el("a", {
                      class: "btn btn--sm",
                      href: `https://www.youtube.com/watch?v=${encodeURIComponent(item.recording_youtube_id)}`,
                      target: "_blank",
                      rel: "noopener noreferrer",
                    }, "Watch recording")
                  : null,
                joinButton(item.course_id, item.id, item.status))));
        })),
    );
  },
);

function joinButton(_courseId: string, liveClassId: string, status: string): HTMLButtonElement | null {
  if (status === "cancelled" || status === "completed") return null;

  const button = el("button", { class: "btn btn--primary btn--sm", type: "button" },
    status === "live" ? "Join now" : "Get class link");

  button.addEventListener(
    "click",
    action(async () => {
      // The path follows the storage convention; the RPC re-checks enrolment
      // before minting a link, so guessing a path gains nothing.
      await joinClass(liveClassId);
    }),
  );

  return button;
}