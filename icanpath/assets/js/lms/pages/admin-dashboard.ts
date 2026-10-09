import {dateMetrics,dateRange,money,workspace} from "../admin-api.ts";
/**
 * Admin dashboard: analytics overview, pending approvals, recent activity,
 * top courses, upcoming live classes, and system stats.
 */

import {
  adminActivityItems,
  adminDashboardStats,
  adminSystemStats,
  adminTopCourses,
  adminUpcomingClasses,
  reviewQueueCourses,
  tutorApplications,
} from "../api.ts";
import type { ActivityItem, AnalyticsData, TopCourse, UpcomingClass } from "../types.ts";
import { action, el, field, input, select, icon, loading, page, setChildren } from "../ui.ts";

let range=dateRange();
void page(
  {
    role: "admin",
    title: "Dashboard",
    base: "/admin",
    active: "/dashboard/",
    subtitle: "Welcome back. Here is the latest activity on ICANPATH Academy.",
  },
  async (content) => {
    content.append(loading("Loading your dashboard…"));
    const draw=async()=>{

    const [stats, analytics, activity, topCourses, systemStats, upcomingClasses, queue, applications, hub] = await Promise.all([
      adminDashboardStats(),
      dateMetrics(range.start,range.end),
      adminActivityItems(),
      adminTopCourses(),
      adminSystemStats(),
      adminUpcomingClasses(),
      reviewQueueCourses(),
      tutorApplications(),
      workspace(),
    ]);

    
    const pendingApplications = applications.filter((a) => a.status === "pending");
    const pendingApprovals = [
      { label: "Tutor applications", count: pendingApplications.length, icon: "user" },
      { label: "Course submissions", count: queue.length, icon: "book" },
      { label: "Live class requests", count: hub.pending_requests, icon: "video" },
      { label: "Content reports", count: hub.open_reports, icon: "alert" },

    ];

    setChildren(content,
      el("div", { class: "dash-header" },
        el("div", {},
          el("h2", {}, "Dashboard"),
          el("p", {}, "Welcome back. Here is the latest activity on ICANPATH Academy."),
        ),
        (()=>{
          const from=input({type:"date",value:range.start,required:true,"aria-label":"Start date"});const to=input({type:"date",value:range.end,required:true,"aria-label":"End date"});
          return el("form",{class:"admin-date-form",onsubmit:(event:Event)=>{event.preventDefault();void action(async()=>{if(to.value<from.value||new Date(to.value).getTime()-new Date(from.value).getTime()>366*86400000)throw new Error("Choose a range of at most 367 days.");range={start:from.value,end:to.value};await draw();})(event);}},field("From",from),field("To",to),el("button",{class:"btn btn--sm",type:"submit"},"Apply"));
        })(),
      ),

      el("div", { class: "dash-stats" },
        statCard("Total students", stats.total_students.toLocaleString(), stats.student_growth, "users"),
        statCard("Total tutors", stats.tutors.toLocaleString(), stats.tutor_growth, "graduation-cap"),
        statCard("Total courses", stats.courses.toLocaleString(), stats.course_growth, "book"),
        statCard("Total enrolments", stats.enrollments.toLocaleString(), stats.enrollment_growth, "user-plus"),
        statCard("Live classes", String(stats.upcoming_live_classes), stats.live_class_growth, "video"),
        statCard("Published Courses", String(systemStats.published_courses), null, "check-circle"),

      ),

      el("div", {class:"admin-overview-grid"},
        analyticsCard({...analytics,revenue:[]},async(days:number)=>{range=dateRange(days);await draw();}),
        pendingApprovalsCard(pendingApprovals),
        recentActivityCard(activity),
        topCoursesCard(topCourses),
        upcomingClassesCard(upcomingClasses),

      ),
      el("p",{class:"admin-list-note"},`Chart: ${range.start} to ${range.end}, new registrations and enrollments per day. Summary cards show totals since the platform started.`),
    );
    };
    await draw();
  },
);

/** `growth` is null when the database has nothing to compare against, in which
 *  case no comparison is printed rather than an invented "0% from last month". */
function statCard(label: string, value: string, growth: number | null, iconName: string): HTMLElement {
  return el("div", { class: "dash-stat" },
    el("div", { class: "dash-stat__icon" }, icon(iconName)),
    el("div", { class: "dash-stat__body" },
      el("span", { class: "dash-stat__label" }, label),
      el("strong", { class: "dash-stat__value" }, value),
      growth === null ? null : el("span", { class: "dash-stat__growth" }, `↑ ${growth}% from last month`),
    ),
  );
}

function analyticsCard(analytics: AnalyticsData,onRange:(days:number)=>Promise<void>): HTMLElement {
  return el("section", { class: "dash-card" },
    el("div", { class: "dash-card__head" },
      el("h3", {}, "Activity overview"),
      (()=>{const period=select([{value:"30",label:"Last 30 Days"},{value:"7",label:"Last 7 Days"},{value:"90",label:"Last 90 Days"}],{"aria-label":"Time period"});period.value=String(Math.round((new Date(range.end).getTime()-new Date(range.start).getTime())/86400000)+1);period.addEventListener("change",action(async()=>onRange(Number(period.value))));return period;})(),
    ),
    el("div", { class: "dash-chart" },
      el("div", { class: "dash-chart__legend" },
        el("span", { class: "dash-chart__legend-item" }, el("span", { class: "dash-chart__dot dash-chart__dot--green" }), "Students"),
        el("span", { class: "dash-chart__legend-item" }, el("span", { class: "dash-chart__dot dash-chart__dot--blue" }), "Enrolments"),
        // Currency uses its own labelled scale, separate from student counts.
        analytics.revenue?.length
          ? el("span", { class: "dash-chart__legend-item" }, el("span", { class: "dash-chart__dot dash-chart__dot--purple" }), `Net revenue (NGN, ±${money(Math.max(1,...(analytics.revenue??[]).map(Math.abs)))})`)
          : null,
      ),
      el("div", { class: "dash-chart__area" },
        el("div", { class: "dash-chart__y-axis" },
          el("span", {}, String(chartMax(analytics))),
          el("span", {}, String(Math.round(chartMax(analytics)*0.75))),
          el("span", {}, String(Math.round(chartMax(analytics)*0.5))),
          el("span", {}, String(Math.round(chartMax(analytics)*0.25))),
          el("span", {}, "0"),
        ),
        el("div", { class: "dash-chart__plot" },
          (() => {
            const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
            svg.setAttribute("class", "dash-chart__svg");
            svg.setAttribute("viewBox", "0 0 300 120");
            svg.setAttribute("preserveAspectRatio", "none");
            const pl1 = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
            pl1.setAttribute("class", "dash-chart__line dash-chart__line--green");
            pl1.setAttribute("points", analytics.students.map((v, i) => `${(i / Math.max(1, analytics.students.length - 1)) * 300},${120 - (v / chartMax(analytics)) * 120}`).join(" "));
            svg.append(pl1);
            const pl2 = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
            pl2.setAttribute("class", "dash-chart__line dash-chart__line--blue");
            pl2.setAttribute("points", analytics.enrollments.map((v, i) => `${(i / Math.max(1, analytics.enrollments.length - 1)) * 300},${120 - (v / chartMax(analytics)) * 120}`).join(" "));
            svg.append(pl2);
            const revenue = analytics.revenue;
            if (revenue) {
              const pl3 = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
              pl3.setAttribute("class", "dash-chart__line dash-chart__line--purple");
              pl3.setAttribute("points", revenue.map((v, i) => `${(i / Math.max(1, revenue.length - 1)) * 300},${120 - ((v+Math.max(1,...revenue.map(Math.abs))) / (2*Math.max(1,...revenue.map(Math.abs)))) * 120}`).join(" "));
              svg.append(pl3);
            }
            return svg;
          })(),
          el("div", { class: "dash-chart__x-axis" },
            ...analytics.labels.filter((_,i)=>i%Math.max(1,Math.ceil(analytics.labels.length/5))===0).map((label) => el("span", {}, label)),
          ),
        ),
      ),
    ),
  );
}

function pendingApprovalsCard(items: Array<{ label: string; count: number; icon: string }>): HTMLElement {
  return el("section", { class: "dash-card" },
    el("div", { class: "dash-card__head" },
      el("h3", {}, "Pending approvals"),
      el("a",{class:"dash-card__link",href:"/admin/moderation/"},"Class and content reviews"),
    ),
    el("ul", { class: "dash-approvals" },
      ...items.map((item) =>
        el("li", { class: "dash-approvals__item" },
          el("span", { class: "dash-approvals__icon" }, icon(item.icon)),
          el("span", { class: "dash-approvals__label" }, item.label),
          el("span", { class: "dash-approvals__count" }, String(item.count)),
        ),
      ),
    ),
    el("a", { class: "btn btn--primary btn--block", href: "/admin/moderation/" }, "Review pending items"),
  );
}

function recentActivityCard(items: ActivityItem[]): HTMLElement {
  return el("section", { class: "dash-card" },
    el("div", { class: "dash-card__head" },
      el("h3", {}, "Recent activity"),
      el("a",{class:"dash-card__link",href:"/admin/audit/"},"View all"),

    ),
    el("ul", { class: "dash-activity" },
      ...items.map((item) =>
        el("li", { class: "dash-activity__item" },
          el("span", { class: "dash-activity__icon" }, icon(item.icon)),
          el("div", { class: "dash-activity__body" },
            el("span", { class: "dash-activity__message" }, item.message),
            el("span", { class: "dash-activity__time" }, item.time_ago),
          ),
        ),
      ),
    ),
  );
}

function topCoursesCard(courses: TopCourse[]): HTMLElement {
  return el("section", { class: "dash-card" },
    el("div", { class: "dash-card__head" },
      el("h3", {}, "Popular courses"),
      el("a", { class: "dash-card__link", href: "/admin/courses/" }, "View all"),
    ),
    el("ul", { class: "dash-courses" },
      ...courses.map((course) =>
        el("li", { class: "dash-courses__item" },
          course.thumbnail && (/^https:\/\//.test(course.thumbnail) || course.thumbnail.startsWith("/assets/img/")) ? el("img",{class:"dash-courses__thumb",src:course.thumbnail,alt:"",loading:"lazy",referrerpolicy:"no-referrer"}) : el("div", { class: "dash-courses__thumb" }, icon("book")),
          el("div", { class: "dash-courses__body" },
            el("strong", {}, course.title),
            el("span", { class: "dash-courses__meta" }, `${course.students.toLocaleString()} students`),
            el("div", { class: "dash-courses__progress" },
              el("span", { class: "dash-courses__progress-fill", style: `width:${course.progress}%` }),
            ),
          ),
          el("span", { class: "dash-courses__pct" }, `${course.progress}%`),
        ),
      ),
    ),
  );
}

function upcomingClassesCard(classes: UpcomingClass[]): HTMLElement {
  return el("section", { class: "dash-card" },
    el("div", { class: "dash-card__head" },
      el("h3", {}, "Upcoming live classes"),
      el("a", { class: "dash-card__link", href: "/admin/live/" }, "View all"),
    ),
    el("ul", { class: "dash-classes" },
      ...classes.map((cls) =>
        el("li", { class: "dash-classes__item" },
          el("div", { class: "dash-classes__date" },
            el("span", { class: "dash-classes__month" }, cls.date.split(" ")[0]),
            el("strong", {}, cls.date.split(" ")[1]?.replace(",", "") ?? ""),
          ),
          el("div", { class: "dash-classes__body" },
            el("strong", {}, cls.title),
            el("span", { class: "dash-classes__meta" }, cls.course),
            el("span", { class: "dash-classes__time" }, cls.time),
            el("span",{class:"admin-provider"},icon("video"),cls.platform),
          ),
        ),
      ),
    ),
  );
}


function chartMax(data:AnalyticsData):number{return Math.max(1,...data.students,...data.enrollments);}
