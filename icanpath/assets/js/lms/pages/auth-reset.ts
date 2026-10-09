/**
 * Choosing a new password, after following the emailed link.
 *
 * Supabase parses the recovery token out of the URL fragment; detectSessionInUrl
 * picks it up, so by the time this runs there is usually already a session. If
 * there is not, the link was invalid or expired and we say so rather than
 * silently failing on submit.
 */

import { getSession, notifyEmail, updatePassword } from "../auth.ts";
import { el, field, input, renderPage } from "../ui-entry.ts";
import { setChildren } from "../ui.ts";

renderPage({ title: "Choose a new password", page: "reset-password" });

const root = document.getElementById("app")!;

const session = await getSession();
if (!session) {
  setChildren(root, 
    el("div", { class: "auth-wrap" },
      el("div", { class: "auth-card card" },
        el("div", { class: "card__body" },
          el("h1", { class: "card__title" }, "That link is not valid"),
          el("p", { class: "card__text" }, "Reset links expire after a short time and can only be used once."),
          el("a", { class: "btn btn--primary btn--block", href: "/forgot-password/" }, "Request a new link")))),
  );
} else {
  render(session.profile.full_name?.split(" ")[0] ?? "there");
}

function render(firstName: string): void {
  const password = input({ type: "password", name: "password", autocomplete: "new-password", required: true, minlength: "8" });
  const confirmPassword = input({ type: "password", name: "confirm", autocomplete: "new-password", required: true });
  const status = el("p", { class: "form-status", role: "status", hidden: true });
  const submit = el("button", { class: "btn btn--primary btn--block", type: "submit" }, "Save new password");

  const form = el("form", { class: "auth-card card", novalidate: true },
    el("div", { class: "card__body" },
      el("h1", { class: "card__title" }, `Hello ${firstName}`),
      el("p", { class: "card__text" }, "Choose a new password of at least 8 characters."),
      el("div", { class: "form-grid" },
        field("New password", password, undefined, true),
        field("Confirm new password", confirmPassword, undefined, true),
        status),
      submit,
      el("p", { class: "auth-alt" }, el("a", { href: `/${session?.profile.role}/dashboard/` }, "Skip to dashboard"))));

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    status.hidden = true;

    if (password.value.length < 8) return fail("Choose a password of at least 8 characters.");
    if (password.value !== confirmPassword.value) return fail("Those two passwords do not match.");

    submit.disabled = true;
    try {
      await updatePassword(password.value);
      void notifyEmail("password_changed");
      status.textContent = "Password updated.";
      status.className = "form-status form-status--ok";
      status.hidden = false;
      setTimeout(() => {
        window.location.replace(`/${session?.profile.role}/dashboard/`);
      }, 900);
    } catch (error) {
      fail(error instanceof Error ? error.message : "Could not update the password.");
      submit.disabled = false;
    }
  });

  setChildren(root, el("div", { class: "auth-wrap" }, form));

  function fail(message: string): void {
    status.textContent = message;
    status.className = "form-status form-status--err";
    status.hidden = false;
    submit.disabled = false;
  }
}
