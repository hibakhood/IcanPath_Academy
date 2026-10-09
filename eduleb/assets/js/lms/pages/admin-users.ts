/**
 * User administration: suspend, reactivate, change role.
 *
 * All three go through RPCs. There is no direct update path to profiles for
 * status or role — the grant is limited to full_name, phone and avatar_url, so
 * "make myself an admin" is not something a client can express.
 */

import { decideTutor, adminUserDirectory, setAccountStatus, setUserRole, tutorApplications } from "../api.ts";
import type { AppRole, Profile, TutorApplication } from "../types.ts";
import { action, confirmAction, el, emptyState, fmtDate, initials, icon, loading, page, pill, setChildren, titleCase, toast } from "../ui.ts";

type Filter = "all" | "student" | "tutor" | "admin";

const pathRole=window.location.pathname.includes("/tutors")?"tutor":window.location.pathname.includes("/students")?"student":"all";
const roleFilter = (new URLSearchParams(window.location.search).get("role") ?? pathRole) as Filter;

void page(
  {
    role: "admin",
    title: roleFilter === "tutor" ? "Tutors" : roleFilter === "student" ? "Students" : "User management",
    base: "/admin",
    active: pathRole === "tutor" ? "/tutors/" : pathRole === "student" ? "/students/" : "/users/",
    subtitle: "Accounts, roles and access",
  },
  async (content, session) => {
    content.classList.add("user-management");
    content.append(loading("Loading accounts…"));

    const [profiles, applications] = await Promise.all([adminUserDirectory(), tutorApplications()]);

    const emailByUser = new Map(applications.map((a) => [a.user_id, a.email ?? ""] as const));
    const rows = profiles.map((profile) => ({ profile, email: profile.email ?? emailByUser.get(profile.id) ?? "" }));
    const query=new URLSearchParams(location.search).get("q")?.toLowerCase()??"";
    const visible = rows.filter(r=>(roleFilter === "all" || r.profile.role === roleFilter) && (r.profile.full_name??"").toLowerCase().includes(query)).sort((a,b)=>Number(b.profile.id === session.profile.id)-Number(a.profile.id === session.profile.id));

    const label = roleFilter === "tutor" ? "Tutors" : roleFilter === "student" ? "Students" : roleFilter === "admin" ? "Administrators" : "All users";
    setChildren(content,
      el("div", {class:"admin-page-heading user-management-heading"}, el("h1", {}, "User management"), el("p", {}, "Manage accounts, roles and access.")),
      filterBar(profiles),
      el("details", {class:"user-onboarding card"},
        el("summary", {}, el("span", {class:"user-onboarding-icon"}, icon("user-plus")), el("span", {}, el("strong", {}, "Registration and tutor approval"), el("span", {class:"list__meta"}, "Manage how students and tutors join ICANPATH Academy")), icon("chevron-down")),
        el("div", {class:"user-onboarding-body"}, el("p", {}, "Students register through the website. Tutors submit an application for administrator review before gaining teaching access. Manage existing account roles in the list below."), el("a", {class:"btn btn--primary", href:"/admin/moderation/"}, "Review tutor applications"))),
      el("section", {class:"user-directory card"},
        el("div", {class:"user-directory-heading"}, el("h2", {}, label, el("span", {class:"user-directory-total"}, ` (${visible.length})`)),
          el("div", {class:"user-directory-legend"}, el("span", {}, el("i", {class:"user-role-dot"}), "Tutors and admins"), el("span", {}, el("i", {class:"user-role-dot user-role-dot--student"}), "Students"))),
        visible.length === 0 ? emptyState("No accounts", "No users match this filter.") :
          el("div", {class:"app-table-wrap user-directory-table"}, el("table", {class:"app-table"},
            el("thead", {}, el("tr", {}, ...["User", "Email", "Role", "Joined", "Actions"].map(label=>el("th", {}, label)))),
            el("tbody", {}, ...visible.map(({profile,email})=>profileRow(profile,email,session.profile.id))))))
    );
  },
);

function filterBar(profiles: Profile[]): HTMLElement {
  const count = (role: AppRole) => profiles.filter((p) => p.role === role).length;

  const link = (role: Filter, label: string, n: number) =>
    el("a", {
      class: `btn btn--sm ${roleFilter === role ? "btn--primary" : ""}`,
      href: role === "all" ? "/admin/users/" : role === "admin" ? "/admin/users/?role=admin" : `/admin/${role === "tutor" ? "tutors" : "students"}/`,
      "aria-current": roleFilter === role ? "page" : null,
    }, icon(role === "all" ? "users" : role === "student" ? "graduation-cap" : role === "tutor" ? "book" : "settings"), `${label} (${n})`);

  return el("div", { class: "btn-row admin-filter-tabs" },
    link("all", "All", profiles.length),
    link("student", "Students", count("student")),
    link("tutor", "Tutors", count("tutor")),
    link("admin", "Admins", count("admin")));
}

function profileRow(profile: Profile, email: string, currentUserId: string): HTMLElement {
  const isSelf = profile.id === currentUserId;
  const toggle = isSelf || profile.role === "tutor" || profile.status === "pending"
    ? null
    : el("button", {
        class: "btn btn--sm user-access-action", type: "button",
        onclick: action(async () => {
          const suspend = profile.status === "active";
          if (!confirmAction(
            suspend
              ? `Suspend ${profile.full_name ?? "this account"}? They will be signed out and unable to sign in.`
              : `Reactivate ${profile.full_name ?? "this account"}?`,
          )) return;
          await setAccountStatus(profile.id, suspend ? "suspended" : "active", suspend ? "Suspended by an administrator" : null);
          toast(suspend ? "Account suspended." : "Account reactivated.");
          window.location.reload();
        }),
      }, profile.status === "active" ? "Suspend" : "Reactivate");

  // An admin demoting themselves would lock the queue, so it is not offered.
  const roleSelect = el("select", { class: "input input--sm", "aria-label": `Role for ${profile.full_name ?? "account"}` },
    ...(["student", "tutor", "admin"] as AppRole[]).map((role) =>
      el("option", { value: role, selected: role === profile.role || null }, titleCase(role))));

  const applyRole = el("button", {
    class: "btn btn--sm", type: "button",
    onclick: action(async () => {
      const next = roleSelect.value as AppRole;
      if (next === profile.role) return;
      if (!confirmAction(`Change ${profile.full_name ?? "this account"} from ${profile.role} to ${next}?`)) return;
      await setUserRole(profile.id, next);
      toast("Role updated.");
      window.location.reload();
    }),
  }, "Apply");

  const avatar = el("span", {class:"user-directory-avatar", "aria-hidden":"true"}, initials(profile.full_name));
  if (profile.avatar_url && /^https:\/\//.test(profile.avatar_url)) avatar.replaceChildren(el("img", {src:profile.avatar_url, alt:"", referrerpolicy:"no-referrer"}));
  return el("tr", {},
    el("td", {}, el("div", {class:"user-directory-identity"}, avatar,
      el("div", {}, el("strong", {}, profile.full_name ?? "Unnamed account"),
        isSelf ? el("span", {class:"user-directory-you"}, "You") : null,
        el("span", {class:"list__meta"}, pill(profile.status, profile.status === "active" ? "done" : profile.status === "pending" ? "soon" : "warn")),
        profile.status_note ? el("span", {class:"list__meta"}, profile.status_note) : null))),
    el("td", {class:"user-directory-email"}, email || "—"),
    el("td", {}, isSelf ? pill("Administrator", "live") : el("div", {class:"user-directory-role"}, roleSelect, applyRole)),
    el("td", {class:"user-directory-date"}, fmtDate(profile.created_at)),
    el("td", {}, isSelf ? el("span", {class:"user-directory-self"}, "Current account") :
      profile.status === "pending" ? el("a", {class:"btn btn--sm", href:"/admin/moderation/"}, "Review application") :
      toggle ?? el("span", {class:"user-directory-self"}, "Managed tutor")));

}

/* Keeps the tutor-approval helper importable from this page for parity checks. */
void decideTutor;
export type { TutorApplication };