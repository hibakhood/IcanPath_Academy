/**
 * Shown to a suspended account.
 *
 * The status lives on the profile, and the note an administrator wrote is
 * rendered here so the reason is not a guess.
 */

import { getSession, signOut } from "../auth.ts";
import { el, renderPage } from "../ui-entry.ts";
import { displayName, setChildren } from "../ui.ts";

renderPage({ title: "Account suspended", page: "suspended" });

const root = document.getElementById("app")!;
const session = await getSession();

const profile = session?.profile;

setChildren(root, 
  el("div", { class: "auth-wrap" },
    el("div", { class: "auth-card card" },
      el("div", { class: "card__body" },
        el("span", { class: "card__tag" }, "Access suspended"),
        el("h1", { class: "card__title" }, `Your account is suspended, ${profile ? displayName(profile).split(" ")[0] : "there"}.`),
        profile?.status_note
          ? el("p", { class: "card__text" }, profile.status_note)
          : el("p", { class: "card__text" }, "An administrator has suspended this account."),
        el("p", { class: "auth-alt" }, "Courses, materials and submissions are not available while suspended."),
        el("p", { class: "auth-alt" }, "Contact the office if you think this is a mistake."),
        el("div", { class: "btn-row" },
          el("a", { class: "btn btn--primary", href: "/" }, "Back to website"),
          el("button", {
            class: "btn", type: "button",
            onclick: async () => {
              await signOut();
              window.location.replace("/login/");
            },
          }, "Sign out"))))));
