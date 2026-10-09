/**
 * Registration.
 *
 * Role choice is limited to student and tutor. An admin is never offered here,
 * and handle_new_user() in the database ignores anything else, so posting
 * `requested_role: "admin"` to this form would create a student.
 */

import { destinationFor, getSession, signUp } from "../auth.ts";
import { config } from "../config.ts";
import { el, field, input, select, setChildren } from "../ui.ts";
import { renderPage } from "../page.ts";

renderPage({ title: "Create account", page: "register", description: "Create a ICANPATH Academy student or tutor account." });

const root = document.getElementById("app")!;
const fullName = input({ name: "full_name", autocomplete: "name", required: true, placeholder: "Ada Mensah" });
const email = input({ type: "email", name: "email", autocomplete: "email", required: true, placeholder: "you@example.com" });
const password = input({ type: "password", name: "password", autocomplete: "new-password", required: true, minlength: "8" });
const confirmPassword = input({ type: "password", name: "confirm", autocomplete: "new-password", required: true });
const role = select([
  { value: "student", label: "Student: I want to study" },
  { value: "tutor", label: "Tutor: I want to teach" },
]);
const status = el("p", { class: "form-status", role: "status", hidden: true });
const submit = el("button", { class: "btn btn--primary btn--block", type: "submit" }, "Create account");

for (const control of [password, confirmPassword]) {
  const toggle = el("button", {type:"button", class:"auth-reveal", "aria-label":"Show password", "aria-pressed":"false", onclick:()=>{
    const visible=control.type==="password";
    control.type=visible?"text":"password";
    toggle.textContent=visible?"Hide":"Show";
    toggle.setAttribute("aria-label", visible?"Hide password":"Show password");
    toggle.setAttribute("aria-pressed",String(visible));
  }}, "Show");
  queueMicrotask(()=>{control.parentElement?.classList.add("auth-password-field");control.parentElement?.append(toggle);});
}
const form = el("form", { class: "auth-card card", novalidate: true },
  el("div", { class: "card__body" },
    el("p", {class:"auth-brand"}, "ICANPATH", el("span", {}, "ACADEMY")),
    el("h1", { class: "card__title" }, "Create your account"),
    el("p", { class: "card__text" }, "Tutor accounts are reviewed by an administrator before they can publish."),
    el("div", { class: "form-grid" },
      field("Full name", fullName, undefined, true),
      field("Email address", email, undefined, true),
      field("Password", password, "At least 8 characters.", true),
      field("Confirm password", confirmPassword, undefined, true),
      field("I am registering as", role, undefined, true),
      status),
    submit,
    el("p", { class: "auth-alt" }, "Already registered? ", el("a", { href: "/login/" }, "Sign in"))));

form.addEventListener("submit", onSubmit);
setChildren(root, el("div", { class: "auth-wrap" }, form));

if (config.preview) {
  root.append(el("p", { class: "app-notice", style: "max-width:30rem;margin:0 auto" },
    "Demo mode: this form does not create a real account."));
}

async function onSubmit(event: Event): Promise<void> {
  event.preventDefault();
  status.hidden = true;

  if (submit.disabled) return;
  email.value = email.value.trim();
  if (!fullName.value.trim()) {
    fullName.focus();
    return showError("Enter your full name.");
  }
  if (!email.value || !email.validity.valid) {
    email.focus();
    return showError("Enter a valid email address.");
  }
  // Checked here for a fast answer; the database re-checks everything.
  if (password.value.length < 8) {
    return showError("Choose a password of at least 8 characters.");
  }
  if (password.value !== confirmPassword.value) {
    return showError("Those two passwords do not match.");
  }

  submit.disabled = true;
  submit.textContent = "Creating account…";
  try {
    const result = await signUp({
      email: email.value.trim(),
      password: password.value,
      fullName: fullName.value.trim(),
      requestedRole: role.value as "student" | "tutor",
    });

    if (config.preview) {
      window.location.replace("/login/?notice=demo");
    } else if (result.needsConfirmation) {
      window.location.replace("/login/?notice=confirm");
    } else {
      const session = await getSession();
      window.location.replace(session ? destinationFor(session.profile) : "/login/?notice=created");
    }
  } catch (error) {
    showError(error instanceof Error ? error.message : "Could not create the account.");
    submit.disabled = false;
  }
}

function showError(message: string): void {
  status.textContent = message;
  status.className = "form-status form-status--err";
  status.hidden = false;
  submit.disabled = false;
  submit.textContent = "Create account";
}