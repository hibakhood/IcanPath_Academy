/**
 * Password reset request.
 *
 * The confirmation message is the same whether or not the address exists, so
 * this form cannot be used to find registered accounts.
 */

import { config } from "../config.ts";
import { requestPasswordReset } from "../auth.ts";
import { el, field, input, renderPage } from "../ui-entry.ts";
import { setChildren } from "../ui.ts";

renderPage({ title: "Reset password", page: "forgot-password", description: "Request a password reset link." });

const root = document.getElementById("app")!;
const email = input({ type: "email", name: "email", autocomplete: "email", required: true, placeholder: "you@example.com" });
const status = el("p", { class: "form-status", role: "status", hidden: true });
const submit = el("button", { class: "btn btn--primary btn--block", type: "submit" }, "Send reset link");

const form = el("form", { class: "auth-card card" },
  el("div", { class: "card__body" },
    el("h1", { class: "card__title" }, "Reset your password"),
    el("p", { class: "card__text" }, "We will email you a link to choose a new one."),
    el("div", { class: "form-grid" }, field("Email address", email, undefined, true), status),
    submit,
    el("p", { class: "auth-alt" }, "Remember your password? ", el("a", { href: "/login/" }, "Sign in"))));

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  status.hidden = true;
  submit.disabled = true;
  try {
    await requestPasswordReset(email.value.trim());
    status.textContent = config.preview ? "This is a demo. No reset email was sent." : "If that address has an account, a reset link is on its way.";
    status.className = "form-status form-status--ok";
    status.hidden = false;
    form.querySelector(".form-grid")?.replaceChildren(status);
  } catch (error) {
    status.textContent = error instanceof Error ? error.message : "Could not send the link.";
    status.className = "form-status form-status--err";
    status.hidden = false;
  } finally {
    submit.disabled = false;
  }
});

setChildren(root, el("div", { class: "auth-wrap" }, form));
