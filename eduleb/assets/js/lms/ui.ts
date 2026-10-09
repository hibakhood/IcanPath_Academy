/**
 * Shared rendering helpers: DOM building, formatting, and the app shell.
 *
 * Anything that writes untrusted text goes through `text()` or sets
 * `textContent`. Course titles, announcement bodies and student names are all
 * user-supplied, so no page is allowed to build HTML by concatenation.
 */

import { workspace } from "./admin-api.ts";
import { config } from "./config.ts";
import { dashboardFor, requireRole, signOut, type Session } from "./auth.ts";
import { unreadNotificationCount } from "./api.ts";
import { renderPage } from "./page.ts";
import type { AppRole, Profile } from "./types.ts";

/* ------------------------------------------------------------------ DOM ---- */

type Handler = (event: never) => unknown;
type Attrs = Record<string, string | number | boolean | null | undefined | Handler>;
type Child = Node | string | number | null | undefined | false;

/**
 * Builds an element. Children are appended as text, so they are escaped.
 *
 * An attribute named on* is attached as a listener rather than set as an
 * attribute: `onclick: handler` becomes addEventListener("click", …). There is
 * deliberately no innerHTML escape hatch — anything user-supplied must arrive as
 * a child so it is escaped.
 */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) continue;
    if (typeof value === "function") {
      node.addEventListener(key.startsWith("on") ? key.slice(2).toLowerCase() : key, value as unknown as EventListener);
    } else if (key.startsWith("on") && key.length > 2) {
      node.addEventListener(key.slice(2).toLowerCase(), value as unknown as EventListener);
    } else if (key === "class") node.className = String(value);
    else if (key === "text") node.textContent = String(value);
    else if (value === true) node.setAttribute(key, "");
    else node.setAttribute(key, String(value));
  }
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    node.append(typeof child === "string" || typeof child === "number" ? document.createTextNode(String(child)) : child);
  }
  return node;
}

/** SVG icon reference. The sprite lives in the page shell. */
export function icon(name: string): SVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "ic");
  svg.setAttribute("aria-hidden", "true");
  const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
  use.setAttribute("href", `#icon-${name}`);
  svg.append(use);
  return svg;
}

export function clear(node: HTMLElement): void {
  while (node.firstChild) node.firstChild.remove();
}

/**
 * Replaces a node's children, tolerating the `null` that conditional sections
 * return. node.replaceChildren() rejects null, which would force every page to
 * filter its own list first.
 */
export function setChildren(node: Element, ...children: Child[]): void {
  const kept: (Node | string)[] = [];
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    kept.push(typeof child === "number" ? String(child) : child);
  }
  node.replaceChildren(...kept);
}

export function mount(...children: Child[]): void {
  const root = document.getElementById("app");
  if (!root) throw new Error('Expected an element with id="app" to render into.');
  clear(root);
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    root.append(typeof child === "string" || typeof child === "number" ? document.createTextNode(String(child)) : child);
  }
}

/* ------------------------------------------------------------ formatting --- */

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Dates are shown in the reader's locale, with a numeric fallback for tests. */
export function fmtDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export function fmtDateLong(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export function fmtTime(value: string | null | undefined): string {
  if (!value) return "—";
  // A time column may arrive as HH:MM or as a full timestamp.
  if (/^\d{2}:\d{2}/.test(value)) return value.slice(0, 5);
  return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function fmtDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  return `${fmtDate(value)}, ${fmtTime(value)}`;
}

/** "10:00 AM" for the class rows on the dashboards, where a range reads better
 *  in twelve-hour time than 17:00–18:00. */
export function fmtClock(value: string | null | undefined): string {
  if (!value) return "—";
  const parts = /^(\d{2}):(\d{2})/.exec(value);
  if (!parts) return value;
  const hour = Number(parts[1]);
  const suffix = hour >= 12 ? "PM" : "AM";
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  return `${twelve}:${parts[2]} ${suffix}`;
}

const PLATFORMS: Record<string, string> = {
  google_meet: "Google Meet",
  youtube_live: "YouTube Live",
  zoom: "Zoom",
};

/** Platform ids are snake_case in the table and product names on screen. */
export function platformLabel(platform: string | null | undefined): string {
  if (!platform) return "—";
  return PLATFORMS[platform] ?? platform.replace(/_/g, " ");
}

/** "Oct / 9" date chip: month above the day, for the live-class lists. */
export function dateChip(date: string | null | undefined): HTMLElement {
  const parts = (date ?? "").split("-");
  const month = parts[1];
  const day = parts[2];
  return el(
    "div",
    { class: "dash-classes__date" },
    el("span", { class: "dash-classes__month" }, month ? (MONTHS[Number(month) - 1] ?? "") : ""),
    el("strong", {}, day ? String(Number(day)) : date ?? "—"),
  );
}

/** "in 3 days" / "2 days ago", which reads better than a raw date for deadlines. */
export function fmtRelative(value: string | null | undefined): string {
  if (!value) return "—";
  const then = new Date(value);
  if (Number.isNaN(then.getTime())) return "—";
  const days = Math.round((then.getTime() - Date.now()) / 86_400_000);
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days === -1) return "yesterday";
  if (days > 0) return `in ${days} days`;
  return `${Math.abs(days)} days ago`;
}

/** Overdue text is worth calling out rather than rendering like any other date. */
export function isPast(value: string | null | undefined): boolean {
  if (!value) return false;
  const then = new Date(value);
  return !Number.isNaN(then.getTime()) && then.getTime() < Date.now();
}

/** "student" -> "Student", without indexing a possibly-empty string. */
export function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function initials(name: string | null | undefined): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0];
  if (!first) return "?";
  if (parts.length === 1) return first.slice(0, 2).toUpperCase();
  const last = parts[parts.length - 1] ?? first;
  return (first.charAt(0) + last.charAt(0)).toUpperCase();
}

/** Reordering helper. Indexed access is unchecked under noUncheckedIndexedAccess,
 *  so the bounds check belongs here rather than at each call site. */
export function swap<T>(items: T[], a: number, b: number): void {
  if (a < 0 || b < 0 || a >= items.length || b >= items.length) return;
  const held = items[a] as T;
  items[a] = items[b] as T;
  items[b] = held;
}

export function displayName(profile: Profile | null | undefined): string {
  return profile?.full_name?.trim() || "Unnamed account";
}

/* -------------------------------------------------------------- feedback ---- */

export function loading(message = "Loading…"): HTMLElement {
  return el("p", { class: "app-empty", "aria-live": "polite" }, message);
}

/** `detail` may be plain text or a node, so a button can be offered in place of
 *  a sentence (e.g. "you have no courses yet" + a create link). */
export function emptyState(title: string, detail?: Child): HTMLElement {
  return el(
    "div",
    { class: "app-empty" },
    el("strong", {}, title),
    typeof detail === "string" ? el("span", {}, detail) : detail ?? null,
  );
}

export function errorState(error: unknown, retry?: () => void): HTMLElement {
  const message = error instanceof Error ? error.message : "Something went wrong.";
  return el(
    "div",
    { class: "app-empty app-empty--err", role: "alert" },
    el("strong", {}, "Could not load this page"),
    el("span", {}, message),
    retry ? el("button", { class: "btn btn--sm", type: "button", onclick: retry }, "Try again") : null,
  );
}

let toastHost: HTMLElement | null = null;

export function toast(message: string, kind: "ok" | "err" = "ok"): void {
  if (!toastHost) {
    toastHost = el("div", { class: "toast-host", role: "status", "aria-live": "polite" });
    document.body.append(toastHost);
  }
  const node = el("p", { class: `toast toast--${kind}` }, message);
  toastHost.append(node);
  setTimeout(() => node.remove(), 4200);
}

/**
 * Guards a destructive action. Returns false when the person cancels, so the
 * caller can `return` and skip the request.
 */
export function confirmAction(message: string): boolean {
  return window.confirm(message);
}

/** Wraps a handler so a thrown error becomes a toast instead of a dead click. */
export function action(handler: () => unknown | Promise<unknown>): (event: Event) => Promise<void> {
  return async (event: Event) => {
    const target = event.currentTarget as HTMLButtonElement | HTMLAnchorElement | null;
    if (target instanceof HTMLButtonElement) {
      target.disabled = true;
    }
    try {
      await handler();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Something went wrong.", "err");
    } finally {
      if (target instanceof HTMLButtonElement) target.disabled = false;
    }
  };
}

/* ----------------------------------------------------------------- pieces --- */

export function stat(label: string, value: string | number, hint?: string): HTMLElement {
  return el(
    "div",
    { class: "stat" },
    el("span", { class: "stat__label" }, label),
    el("strong", { class: "stat__value" }, String(value)),
    hint ? el("span", { class: "stat__hint" }, hint) : null,
  );
}

export function card(title: string, ...children: Child[]): HTMLElement {
  return el(
    "section",
    { class: "card" },
    el("div", { class: "card__body" },
      el("h2", { class: "card__title" }, title),
      ...children),
  );
}

export type Tone = "default" | "live" | "soon" | "done" | "warn";

export function pill(label: string, tone: Tone = "default"): HTMLElement {
  const suffix = tone === "default" ? "" : ` pill--${tone}`;
  return el("span", { class: `pill${suffix}` }, label);
}

export function progressBar(percentage: number): HTMLElement {
  const clamped = Math.max(0, Math.min(100, Math.round(percentage)));
  return el(
    "div",
    { class: "progress", role: "progressbar", "aria-valuenow": clamped, "aria-valuemin": "0", "aria-valuemax": "100" },
    el("span", { class: "progress__fill", style: `width:${clamped}%` }),
  );
}

export function field(label: string, control: HTMLElement, hint?: string, required = false): HTMLElement {
  const id = control.id || `f-${Math.random().toString(36).slice(2, 8)}`;
  control.id = id;
  return el(
    "div",
    { class: "field" },
    el("label", { for: id }, label, required ? el("span", { class: "req" }, "*") : null),
    control,
    hint ? el("span", { class: "hint" }, hint) : null,
  );
}

export function input(attrs: Attrs = {}): HTMLInputElement {
  return el("input", { class: "input", ...attrs });
}

export function textarea(attrs: Attrs = {}): HTMLTextAreaElement {
  return el("textarea", { class: "input", ...attrs });
}

export function select(options: Array<{ value: string; label: string }>, attrs: Attrs = {}): HTMLSelectElement {
  const node = el("select", { class: "input", ...attrs });
  for (const option of options) {
    node.append(el("option", { value: option.value }, option.label));
  }
  if (attrs.value !== undefined && attrs.value !== null) node.value = String(attrs.value);
  return node;
}

/* ------------------------------------------------------------------ shell --- */

interface NavItem {
  href: string;
  label: string;
  icon: string;
  /** Renders an unread count once one is known; hidden until then. */
  badge?: boolean;
}

/**
 * Sidebar entries. Only routes that exist and are backed by data appear here —
 * there is no messages or earnings item because neither exists in this schema.
 *
 * The announcements route is also the notification centre (its page leads with
 * "Notifications"), so it is labelled the way a learner looks for it.
 */
const NAV: Record<AppRole, NavItem[]> = {
  student: [
    { href: "/student/dashboard/", label: "Dashboard", icon: "home" },
    { href: "/student/browse/", label: "Browse courses", icon: "book" },
    { href: "/student/courses/", label: "My courses", icon: "layers" },
    { href: "/student/live/", label: "Live classes", icon: "video" },
    { href: "/student/materials/", label: "Materials", icon: "file" },
    { href: "/student/quizzes/", label: "Quizzes and assignments", icon: "check-circle" },
    { href: "/student/assignments/", label: "Past questions", icon: "edit" },
    { href: "/student/performance/", label: "Assessment results", icon: "chart" },
    { href: "/student/progress/", label: "Progress", icon: "chart" },
    { href: "/student/questions/", label: "Questions and feedback", icon: "message" },
    { href: "/student/announcements/", label: "Notifications", icon: "bell", badge: true },
    { href: "/student/profile/", label: "Profile settings", icon: "user" },
  ],
  tutor: [
    { href: "/tutor/dashboard/", label: "Dashboard", icon: "home" },
    { href: "/tutor/grading/", label: "Grades and results", icon: "check-circle" },
    { href: "/tutor/courses/", label: "My courses", icon: "book" },
    { href: "/tutor/lessons/", label: "Lessons", icon: "layers" },
    { href: "/tutor/live/", label: "Live classes", icon: "video" },
    { href: "/tutor/materials/", label: "Materials", icon: "file" },
    { href: "/tutor/quizzes/", label: "Quizzes and assignments", icon: "check-circle" },
    { href: "/tutor/assignments/", label: "Past questions", icon: "edit" },
    { href: "/tutor/performance/", label: "Student progress", icon: "chart" },
    { href: "/tutor/students/", label: "Students", icon: "users" },
    { href: "/tutor/profile/", label: "Profile settings", icon: "user" },
  ],
  admin: [
    { href: "/admin/dashboard/", label: "Dashboard", icon: "home" },
    { href: "/admin/users/", label: "All users", icon: "users" },
    { href: "/admin/tutors/", label: "Tutors", icon: "user" },
    { href: "/admin/students/", label: "Students", icon: "user" },
    { href: "/admin/assessments/", label: "Assessments", icon: "edit" },
    { href: "/admin/courses/", label: "Courses", icon: "book" },
    { href: "/admin/moderation/", label: "Approvals and reports", icon: "check-circle" },
    { href: "/admin/enrollments/", label: "Enrolments", icon: "layers" },
    { href: "/admin/live/", label: "Live classes", icon: "video" },
    { href: "/admin/announcements/", label: "Announcements", icon: "bell" },
    { href: "/admin/performance/", label: "Learning progress", icon: "chart" },
    { href: "/admin/reports/", label: "Reports and analytics", icon: "chart" },
    { href: "/admin/audit/", label: "Audit logs", icon: "file" },
    { href: "/admin/settings/", label: "System settings", icon: "settings" },
  ],
};

export interface ShellOptions {
  role: AppRole;
  title: string;
  subtitle?: string;
  /** Path prefix without a trailing slash, e.g. "/student". */
  base: string;
  /** Path relative to `base`, used to mark the active nav link. */
  active: string;
  /** Page-level buttons rendered to the right of the heading. */
  actions?: Child[];
}

function isActive(base: string, active: string, href: string): boolean {
  const target = href.slice(base.length) || "/";
  return target === active;
}

/**
 * Renders the sidebar, topbar and content region, then returns the element the
 * page should fill. Preview mode adds a banner and a persona switcher so the
 * three dashboards can be reviewed without three accounts.
 */
export function renderShell(options: ShellOptions): HTMLElement {
  const { role, title, subtitle, base, active } = options;

  const nav = el("nav", { class: "app-nav", "aria-label": `${role} sections` });
  for (const item of NAV[role]) {
    const link = el(
      "a",
      { href: item.href, class: isActive(base, active, item.href) ? "is-active" : null, "aria-current": isActive(base, active, item.href) ? "page" : null },
      icon(item.icon),
      item.label,
    );
    if (item.badge) link.append(el("span", { class: "nav-badge", "data-nav-badge": "", hidden: true }));
    if (role === "admin" && item.href === "/admin/users/") {
      const group=el("details",{class:"admin-nav-group",open:true},el("summary",{},icon("users"),"User management",icon("chevron-down")),link);
      for (const kind of ["tutors","students"]) group.append(el("a",{href:`/admin/${kind}/`,class:active===`/${kind}/`?"is-active":null},icon("user"),titleCase(kind)));
      nav.append(group);
    } else if (role === "admin" && item.href === "/admin/courses/") {
      nav.append(link);
    } else if (!(role === "admin" && ["/admin/tutors/","/admin/students/"].includes(item.href))) nav.append(link);
  }

  const side = el(
    "aside",
    { class: "app-side" },
    el(
      "a",
      { class: "app-brand", href: "/" },
      el("span", { class: "site-logo__mark", "aria-hidden": "true" }, icon("graduation-cap")),
      el("span", { class: "site-logo__text" },
        el("span", { class: "site-logo__name" }, "ICANPATH"),
        el("span", { class: "site-logo__sub", role: "img", "aria-label": "Academy" }, ...Array.from("ACADEMY", letter => el("span", { "aria-hidden": "true" }, letter)))),
    ),
    el("div", {class:"admin-identity"}, el("span", {class:"app-avatar__mark", "data-mark":""}, "?"), el("div", {}, el("strong", {"data-name":""}, "Admin User"), el("span", {}, role === "admin" ? "Super Administrator" : titleCase(role)), el("small", {}, "● Online"))),
    nav,
    el(
      "div",
      { class: "app-side__foot" },
      role === "admin" ? el("small",{class:"admin-copyright"},"ICANPATH Academy",el("br"),`© ${new Date().getFullYear()} All rights reserved.`) : null,
      el("a", { class: "btn btn--ghost btn--sm app-side__link", href: "/" }, "Back to website"),
      el("button", { class: "btn btn--ghost btn--sm app-side__link", type: "button", onclick: action(async () => {
        await signOut();
        window.location.replace("/login/");
      }) }, icon("logout"), "Log out"),
    ),
  );

  const top = el(
    "header",
    { class: "app-top" },
    el("button", { class: "btn btn--ghost btn--sm app-nav-toggle", type: "button", "data-menu": "", "aria-label": "Open menu", "aria-expanded": "false" }, icon("menu")),
    el("div", { class: "app-top__text", hidden:true },
      el("h1", {}, title),
      subtitle ? el("p", { class: "app-top__sub" }, subtitle) : null),
    el("form", {class:"admin-search",action:`${base}/search/`,method:"get"}, icon("search"),el("input",{name:"q",type:"search",placeholder:role === "admin" ? "Search for users, courses, lessons…" : "Search anything…","aria-label":role === "admin" ? "Search users, courses and lessons" : "Search your courses and lessons",minlength:2,maxlength:100}),el("button",{type:"submit","aria-label":"Search"},icon("search"))),
    el("span", { class: "app-top__spacer" }),
    role === "student"
      ? el("a", {class:"admin-top-icon",href:"/student/announcements/","aria-label":"Notifications"},icon("bell"),el("span", {class:"nav-badge","data-nav-badge":"",hidden:true}))
      : null,
    el("details", {class:"admin-account"}, el("summary", {"aria-label":"Account menu"},el("span",{class:"app-avatar__mark","data-mark":""},"?"),"⌄"),el("div",{},el("a",{href:`${base}/profile/`},"My profile"),el("a",{href:role === "admin" ? "/admin/settings/" : `${base}/profile/`},"Settings"))),
    ...(options.actions ?? []),
    el("a", { class: "app-avatar", hidden:true, href: `${base}/profile/`, "aria-label": "Your account" },
      el("span", { class: "app-avatar__mark", "data-mark": "" }, "?"),
      el("span", {}, el("strong", { "data-name": "" }, "…"), el("br"),
        el("span", {}, titleCase(role)))),
  );

  const content = el("main", { class: "app-content", id: "main" });

  const shell = el("div", { class: `app-shell admin-shell ${role}-shell ${role === "admin" ? "admin-view" : ""}` },
    el("div", { class: "app-scrim", "data-scrim": "" }),
    side,
    el("div", { class: "app-main" }, top, previewBanner(role), content));

  mount(shell);
  if (role === "admin") void workspace().then(data => {
    const notice=data.settings.find(row=>row.key==="maintenance_notice");if(notice?.value) content.before(el("div",{class:"app-notice"},String(notice.value)));
  }).catch(()=>{});
  wireMenu();
  if (NAV[role].some((item) => item.badge)) void paintNavBadge();
  return content;
}

/**
 * Fills the sidebar's unread count after the shell is on screen, so navigation
 * never waits for it. A failed call leaves the badge hidden rather than showing
 * a number the database did not confirm.
 */
async function paintNavBadge(): Promise<void> {
  try {
    const count = await unreadNotificationCount();
    if (!count) return;
    document.querySelectorAll<HTMLElement>("[data-nav-badge]").forEach((node) => {
      node.hidden = false;
      node.textContent = String(count);
    });
  } catch {
    // Decoration only: the notifications page still reports the real count.
  }
}

/** Preview mode is always labelled. An unlabelled fixture is worse than no build. */
function previewBanner(role: AppRole): HTMLElement | null {
  if (!config.preview) return null;

  const switcher = el("select", { class: "input input--sm", "aria-label": "Demo role" },
    ...(["student", "tutor", "admin"] as AppRole[]).map((r) =>
      el("option", { value: r, selected: r === role || null }, titleCase(r))));

  switcher.addEventListener("change", () => {
    localStorage.setItem("charterpath.preview.role", switcher.value);
    window.location.replace(dashboardFor(switcher.value as AppRole));
  });

  return el("div", { class: "app-notice app-notice--preview", role: "status" },
    el("strong", {}, "Demo mode. This is sample data."),
    " Changes stay in this browser only. The app needs a database connection to save real records.",
    switcher);
}

function wireMenu(): void {
  const toggle = document.querySelector<HTMLButtonElement>("[data-menu]");
  const scrim = document.querySelector<HTMLElement>("[data-scrim]");
  if (!toggle || !scrim) return;
  const side = document.querySelector<HTMLElement>(".app-side");

  const setOpen = (open: boolean) => {
    if(window.innerWidth>=992 && document.querySelector(".admin-shell")){document.querySelector(".admin-shell")?.classList.toggle("admin-collapsed",open);toggle.setAttribute("aria-expanded",String(!open));return;}
    side?.classList.toggle("is-open", open);
    scrim.classList.toggle("is-open", open);
    toggle.setAttribute("aria-expanded", String(open));
  };

  toggle.addEventListener("click", () => {
    setOpen(window.innerWidth>=992&&document.querySelector(".admin-shell")?!document.querySelector(".admin-shell")?.classList.contains("admin-collapsed"):!side?.classList.contains("is-open"));
  });
  scrim.addEventListener("click", () => setOpen(false));
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") setOpen(false);
  });
}

/** Fills the avatar in the topbar once the profile is known. */
export function paintProfile(session: Session): void {
  document.querySelectorAll<HTMLElement>("[data-mark]").forEach(mark => {
    mark.textContent = initials(session.profile.full_name);
    if (session.profile.avatar_url && /^https:\/\//.test(session.profile.avatar_url)) mark.replaceChildren(el("img",{src:session.profile.avatar_url,alt:"",referrerpolicy:"no-referrer"}));
  });
  document.querySelectorAll<HTMLElement>("[data-name]").forEach(name => name.textContent = displayName(session.profile));
}

/**
 * The entry point every page calls. Guards the route, paints the shell, then
 * hands the page a container to render into.
 */
export async function page(
  options: ShellOptions,
  render: (content: HTMLElement, session: Session) => Promise<void> | void,
): Promise<void> {
  // Sets the title and injects the icon sprite, which the shell needs before it
  // renders any icon reference.
  renderPage({ title: options.title, page: `${options.role}-${options.active.replace(/[/-]/g, "").replace(".", "")}` });

  const session = await requireRole(options.role);
  if (!session) return;

  if (options.role === "student" && session.profile.role === "tutor" && session.profile.status === "active") {
    window.location.replace(dashboardFor("tutor"));
    return;
  }

  const content = renderShell(options);
  paintProfile(session);

  // A failing render should show the error, not leave a blank panel.
  if (content.textContent?.trim()) return;
  try {
    await render(content, session);
    if (options.role === 'admin') {
      polishAdminPage(content, options);
      new MutationObserver(() => polishAdminPage(content, options)).observe(content, {childList:true, subtree:true});
    }
    if (options.role === 'student' && ['/quizzes','/practice-quizzes','/written-assignments'].some(path=>location.pathname.endsWith(path)||location.pathname.endsWith(path+'/'))) content.prepend(el('a',{class:'btn',href:'/student/performance/'},'My assessment results'));

  } catch (error) {
    clear(content);
    content.append(errorState(error));
  }
}

/** Consistent headings and accessible, filterable record lists across administration. */
function polishAdminPage(content: HTMLElement, options: ShellOptions): void {
  if (!content.querySelector('h1')) {
    const dashboardHeading = content.querySelector('.dash-header h2');
    if (dashboardHeading) dashboardHeading.replaceWith(el('h1', {}, dashboardHeading.textContent));
    else content.prepend(el('div', {class:'admin-page-heading'}, el('h1', {}, options.title), options.subtitle ? el('p', {}, options.subtitle) : null));
  }
  content.querySelectorAll<HTMLTableElement>('.app-table').forEach((table, index) => {
    if (table.dataset.adminPolished) return;
    table.dataset.adminPolished = 'true';
    const labels = Array.from(table.querySelectorAll('thead th'), cell => cell.textContent?.trim() ?? '');
    const rows = Array.from(table.querySelectorAll<HTMLTableRowElement>('tbody tr'));
    rows.forEach(row => Array.from(row.cells).forEach((cell, i) => cell.dataset.label = labels[i] ?? ''));
    const wrap = table.closest('.app-table-wrap');
    if (!wrap || wrap.querySelector('.admin-record-toolbar')) return;
    const count = el('span', {class:'admin-record-count', 'aria-live':'polite'}, `${rows.length} records`);
    const search = input({type:'search', placeholder:'Filter this list…', 'aria-label':`Filter ${options.title} list ${index + 1}`});
    const noMatches = el('p', {class:'admin-no-matches', hidden:true}, 'No records match your search.');
    search.addEventListener('input', () => {
      let visible = 0;
      rows.forEach(row => {row.hidden = !row.textContent?.toLowerCase().includes(search.value.trim().toLowerCase()); if (!row.hidden) visible++;});
      count.textContent = `${visible} of ${rows.length} records`;
      noMatches.hidden = visible > 0;
    });
    wrap.prepend(el('div', {class:'admin-record-toolbar'}, count, search));
    wrap.append(noMatches);
  });
}
