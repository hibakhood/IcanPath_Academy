/**
 * Shown to a tutor whose application has not been decided yet.
 *
 * A pending account is refused by is_active_account(), so every dashboard query
 * would come back empty. This page explains why instead of showing a blank shell.
 */

import { myApplication } from "../api.ts";
import { getSession, signOut } from "../auth.ts";
import { el, renderPage } from "../ui-entry.ts";
import { displayName, fmtDate, setChildren } from "../ui.ts";
import { config } from "../config.ts";

renderPage({ title: "Application pending", page: "pending" });

const root = document.getElementById("app")!;
const session = await getSession();
const application = session ? await myApplication() : null;

const card = el("div", { class: "auth-card card" },
  el("div", { class: "card__body" },
    el("span", { class: "card__tag card__tag--gold" }, "Application received"),
    el("h1", { class: "card__title" }, `Thanks, ${session ? displayName(session.profile).split(" ")[0] : "there"}.`),
    el("p", { class: "card__text" },
      "An administrator is reviewing your tutor application. You will be able to create courses once it is approved."),
    application?.headline ? el("p", { class: "auth-alt" }, `You applied as: ${application.headline}`) : null,
    application ? el("p", { class: "auth-alt" }, `Applied ${fmtDate(application.created_at)}`) : null,
    el("p", { class: "auth-alt" }, "You can start teaching once an administrator approves your application."),
    config.preview
      ? el("p", { class: "auth-alt" }, "Demo mode: choose a role at the top of the page.")
      : null,
    el("div", { class: "btn-row" },
      el("a", { class: "btn btn--primary", href: "/" }, "Back to website"),
      el("button", {
        class: "btn", type: "button",
        onclick: async () => {
          await signOut();
          window.location.replace("/login/");
        },
      }, "Sign out"))));

setChildren(root, el("div", { class: "auth-wrap" }, card));
