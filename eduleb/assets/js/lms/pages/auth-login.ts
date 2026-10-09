/**
 * Sign-in.
 *
 * Failures are reported by message, never by whether an account exists, so this
 * page cannot be used to discover which emails are registered.
 */

import { destinationFor, getSession, setPreviewRole, signIn, type Session } from "../auth.ts";
import { config } from "../config.ts";
import { el, field, input, setChildren, titleCase, toast } from "../ui.ts";
import { renderPage } from "../page.ts";

renderPage({ title: "Sign in", page: "login", description: "Sign in to your ICANPATH Academy dashboard." });

const root = document.getElementById("app")!;
const email = input({ type: "email", name: "email", autocomplete: "email", required: true, placeholder: "you@example.com" });
const password = input({ type: "password", name: "password", autocomplete: "current-password", required: true });
const remember = input({ type: "checkbox", name: "remember", checked: true });
const reveal = el("button", { type: "button", class: "auth-reveal", "aria-label": "Show password", "aria-pressed": "false", onclick: () => {
  const visible = password.type === "password";
  password.type = visible ? "text" : "password";
  reveal.textContent = visible ? "Hide" : "Show";
  reveal.setAttribute("aria-label", visible ? "Hide password" : "Show password");
  reveal.setAttribute("aria-pressed", String(visible));
}}, "Show");
const status = el("p", { class: "form-status", role: "status", hidden: true });
const submit = el("button", { class: "btn btn--primary btn--block", type: "submit" }, "Sign in");

/**
 * A confirmed session skips the form entirely — except in preview, where a
 * fixture session always exists and would make this page unreachable.
 */
const existing = config.preview ? null : await getSession();
if (existing && new URLSearchParams(window.location.search).get("notice") !== "logout-failed") {
  window.location.replace(destinationFor(existing.profile, new URLSearchParams(window.location.search).get("next")));
} else {
  render();
}

function render(): void {
  const form = el("form", { class: "auth-card card", novalidate: true },
    el("div", { class: "card__body" },
      el("p", {class:"auth-brand"}, "ICANPATH", el("span", {}, "ACADEMY")),
      el("h1", { class: "card__title" }, "Sign in"),
      el("p", { class: "card__text" }, "Use the email and password you registered with."),
      el("div", { class: "form-grid" },
        field("Email address", email, undefined, true),
        field("Password", password, undefined, true),
        status),
      el("div", {class:"auth-options"}, el("label", {}, remember, "Remember me"), el("a", {href:"/forgot-password/"}, "Forgot password?")),
      submit,
      el("p", { class: "auth-alt" },
        "No account yet? ",
        el("a", { href: "/register/" }, "Create account"),
)));

  password.parentElement?.append(reveal);
  password.parentElement?.classList.add("auth-password-field");

  const notice = new URLSearchParams(window.location.search).get("notice");
  if (notice === "logout-failed" || notice === "logout-local" || notice === "confirm" || notice === "created" || notice === "demo") {
    status.textContent = notice === "logout-failed" ? "Logout could not be confirmed. Your dashboard was cleared. Please try again or close this tab." : notice === "logout-local" ? "You are signed out on this device. Logout on other devices could not be confirmed." : notice === "confirm" ? "Check your inbox to confirm your email, then sign in."
      : notice === "demo" ? "This is a demo. No account was created. Choose a demo dashboard below."
      : "Your account is ready. Sign in to continue.";
    status.className = "form-status form-status--ok";
    status.hidden = false;
  }
  form.addEventListener("submit", onSubmit);

  setChildren(root, el("div", { class: "auth-wrap" }, form));

  if (config.preview) {
    root.append(el("p", { class: "app-notice", style: "max-width:30rem;margin:0 auto" },
      "Demo mode: you can use any password."));
    root.append(personaPicker());
  }
}

/** In preview the reviewer picks who to be instead of signing in. */
function personaPicker(): HTMLElement {
  const roles = ["student", "tutor", "admin"] as const;

  return el("div", { class: "auth-personas", style: "max-width:30rem;margin:1rem auto 0" },
    el("p", { class: "auth-alt" }, "Or try a demo dashboard:"),
    el("div", { class: "btn-row" },
      ...roles.map((role) =>
        el("button", {
          class: "btn btn--sm",
          type: "button",
          onclick: () => {
            setPreviewRole(role);
            window.location.href = `/${role}/dashboard/`;
          },
        }, titleCase(role)))));
}

async function onSubmit(event: Event): Promise<void> {
  event.preventDefault();
  status.hidden = true;
  if (submit.disabled) return;
  email.value = email.value.trim();
  if (!email.value || !email.validity.valid) {
    showError("Enter a valid email address.");
    email.focus();
    return;
  }
  if (!password.value) {
    showError("Enter your password.");
    password.focus();
    return;
  }
  submit.disabled = true;
  submit.textContent = "Signing in…";

  try {
    localStorage.setItem("icanpath.remember", remember.checked ? "yes" : "no");
    const profile: Session["profile"] = await signIn(email.value.trim(), password.value);
    toast(`Welcome back, ${profile.full_name?.split(" ")[0] ?? "there"}.`);

    window.location.replace(destinationFor(profile, new URLSearchParams(window.location.search).get("next")));
  } catch (error) {
    // One message for every failure mode, so this page cannot enumerate accounts.
    showError(error instanceof Error ? error.message : "Could not sign in.");
    submit.disabled = false;
    submit.textContent = "Sign in";
    password.value = "";
    password.focus();
  }
}

function showError(message: string): void {
  status.textContent = message;
  status.className = "form-status form-status--err";
  status.hidden = false;
}