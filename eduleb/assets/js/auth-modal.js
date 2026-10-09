/* ==========================================================================
   ICANPATH Academy — auth popup
   Vanilla ES2018, loaded by the frozen marketing pages with a plain
   <script defer>, the same way assets/js/ican.js is.

   Why this file exists at all: the marketing pages are frozen and copied to
   dist/ verbatim, so Vite never processes them and they cannot load a
   TypeScript module. This shim is therefore plain JS, and it does not
   reimplement the sign-in, sign-up or reset forms. It frames the real LMS
   pages at /login/, /register/ and /reset-password/, so the auth logic keeps
   living in exactly one place: assets/js/lms/.

   If a link inside the frame leaves those three routes — a successful sign-in,
   or the persona picker in preview mode — the frame hands the URL back to the
   page and closes, so the visitor is never trapped in a box.
   ========================================================================== */

/* Routes that are allowed to stay inside the frame.
   /forgot-password/ is here because the login form links to it, and its whole
   purpose is to hand off to /reset-password/. Leaving it out would eject the
   visitor out of the popup the moment they asked for a reset link, which is the
   one path that has to work. */
const FRAMED = ["/login/", "/register/", "/forgot-password/", "/reset-password/"];

/* The label used for the frame title and for what the visitor was doing. */
const TITLES = {
  "/login/": "Sign in",
  "/register/": "Create your account",
  "/reset-password/": "Choose a new password",
  "/forgot-password/": "Reset your password",
};

/* Named popup, not open: window.open is a global and shadowing it is a lint error. */
let popup = null; /* { root, frame, opener } while a popup is showing */

/* ------------------------------------------------------------------ styles */

/*
 * Injected rather than linked. The only stylesheet the frozen pages load is
 * assets/css/ican.css, which is frozen and must reach dist/ byte for byte, and
 * app.css is bundled only for the LMS routes. Reusing the tokens below means
 * the popup matches the rest of the site without a frozen file being touched.
 */
const STYLE = `
.cpam-backdrop {
  position: fixed; inset: 0; z-index: 2147483000;
  display: flex; align-items: center; justify-content: center;
  padding: var(--sp-4, 1rem);
  background: rgba(7,59,58,0.55);
  backdrop-filter: blur(3px);
  animation: cpam-fade var(--dur-2, 240ms) var(--ease, ease);
  -webkit-overflow-scrolling: touch;
}
.cpam-dialog {
  position: relative;
  display: flex; flex-direction: column;
  width: 100%; max-width: 30rem;
  max-height: min(92vh, 46rem);
  overflow: hidden;
  background: var(--surface, #ffffff);
  border-radius: var(--r-lg, 14px);
  box-shadow: var(--sh-lg, 0 28px 60px -28px rgba(7,59,58,.3));
  animation: cpam-rise var(--dur-2, 240ms) var(--ease, ease);
}
.cpam-head {
  display: flex; align-items: center; gap: var(--sp-3, .75rem);
  padding: var(--sp-4, 1rem) var(--sp-5, 1.5rem);
  border-bottom: 1px solid var(--line, #d9f5ef);
  flex: 0 0 auto;
}
.cpam-title {
  margin: 0;
  font-family: var(--font-display, Inter, sans-serif);
  font-size: 1.125rem; font-weight: 600; line-height: 1.2;
  color: var(--brand-900, #073b3a);
}
.cpam-close {
  margin-left: auto;
  display: inline-flex; align-items: center; justify-content: center;
  width: 2.25rem; height: 2.25rem; padding: 0;
  background: var(--paper-2, #effbf8);
  border: 0; border-radius: var(--r-pill, 999px);
  color: var(--ink-700, #0d6f6a);
  font-size: 1.25rem; line-height: 1;
  cursor: pointer;
  transition: background var(--dur-1, 140ms) var(--ease, ease);
}
.cpam-close:hover { background: var(--paper-3, #d9f5ef); color: var(--brand-900, #073b3a); }
.cpam-close:focus-visible { outline: 2px solid var(--brand-500, #17a99f); outline-offset: 2px; }
.cpam-frame {
  flex: 1 1 auto; width: 100%; min-height: 32rem;
  border: 0; background: var(--paper, #ffffff);
}
.cpam-foot {
  flex: 0 0 auto;
  padding: var(--sp-3, .75rem) var(--sp-5, 1.5rem);
  border-top: 1px solid var(--line, #d9f5ef);
  font-size: var(--fs-xs, .8125rem);
  color: var(--ink-500, #17a99f);
  text-align: center;
}
.cpam-foot a { color: var(--brand-600, #0f8a83); }
body.cpam-open { overflow: hidden; }
@keyframes cpam-fade { from { opacity: 0; } to { opacity: 1; } }
@keyframes cpam-rise { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
@media (prefers-reduced-motion: reduce) {
  .cpam-backdrop, .cpam-dialog { animation: none; }
}
@media (max-width: 30rem) {
  .cpam-backdrop { padding: 0; align-items: stretch; }
  .cpam-dialog { max-width: none; max-height: none; height: 100%; border-radius: 0; }
  .cpam-frame { min-height: 0; }
}
`;

/* ------------------------------------------------------------------- open */

function injectStyle() {
  if (document.getElementById("cpam-style")) return;
  const tag = document.createElement("style");
  tag.id = "cpam-style";
  tag.textContent = STYLE;
  document.head.appendChild(tag);
}

function show(pathname, opener) {
  if (popup) dismiss();
  injectStyle();

  const previous = opener || document.activeElement;

  const backdrop = document.createElement("div");
  backdrop.className = "cpam-backdrop";

  const dialog = document.createElement("div");
  dialog.className = "cpam-dialog";
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.setAttribute("aria-label", TITLES[pathname] || "Sign in");

  const head = document.createElement("div");
  head.className = "cpam-head";

  const title = document.createElement("h2");
  title.className = "cpam-title";
  title.textContent = TITLES[pathname] || "Sign in";

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "cpam-close";
  closeBtn.setAttribute("aria-label", "Close");
  closeBtn.innerHTML = "&times;";
  closeBtn.addEventListener("click", () => dismiss());

  head.append(title, closeBtn);

  const frame = document.createElement("iframe");
  frame.className = "cpam-frame";
  frame.setAttribute("title", title.textContent);
  frame.setAttribute("loading", "eager");

  /*
   * Same origin, so reading the path is allowed. A frame that has left the
   * auth routes means the visitor finished something — signed in, picked a
   * preview role, changed their password — so the page takes over.
   *
   * The blank-document guard is not optional. An iframe fires `load` the moment
   * it is inserted, for its initial about:blank document, so without it the
   * popup opens, reads a path of "blank", decides that is not an auth route,
   * and navigates the whole page to about:blank — taking the popup with it.
   */
  frame.addEventListener("load", () => {
    let path = null;
    try {
      path = frame.contentWindow.location.pathname;
    } catch {
      return; /* cross origin: leave it be rather than break the popup */
    }
    if (!path || path === "blank") return; /* the initial empty document */
    // Next.js canonicalizes these routes without a trailing slash.
    path = path.replace(/\/$/, "") + "/";
    if (FRAMED.indexOf(path) !== -1) {
      title.textContent = TITLES[path];
      dialog.setAttribute("aria-label", title.textContent);
      frame.setAttribute("title", title.textContent);
      const destination = path === "/login/" ? "/register/" : "/login/";
      link.href = destination;
      link.textContent = destination === "/register/" ? "Need an account? Create account" : "Already registered? Sign in";
      return;
    }

    const target = frame.contentWindow.location.href;
    dismiss();
    window.location.href = target;
  });

  const foot = document.createElement("div");
  foot.className = "cpam-foot";
  const other = pathname === "/login/" ? "/register/" : "/login/";
  const link = document.createElement("a");
  link.href = other;
  link.textContent = other === "/register/" ? "Need an account? Create account" : "Already registered? Sign in";
  foot.append(link);

  /* src is set before the frame reaches the document, so the browser never has
     to load about:blank first. The guard above covers the case anyway. */
  frame.src = pathname;

  dialog.append(head, frame, foot);
  backdrop.appendChild(dialog);
  document.body.appendChild(backdrop);
  document.body.classList.add("cpam-open");

  backdrop.addEventListener("mousedown", (event) => {
    if (event.target === backdrop) dismiss();
  });

  popup = { root: backdrop, frame, opener: previous };

  closeBtn.focus();
}

/* ------------------------------------------------------------------ close */

function dismiss() {
  if (!popup) return;
  const { root, opener } = popup;
  popup = null;
  root.remove();
  document.body.classList.remove("cpam-open");
  if (opener && typeof opener.focus === "function") opener.focus();
}

/* Esc closes. Tab is kept inside the dialog so focus cannot wander behind it. */
function onKeydown(event) {
  if (!popup) return;
  if (event.key === "Escape") {
    event.preventDefault();
    dismiss();
    return;
  }
  if (event.key !== "Tab") return;

  const focusable = popup.root.querySelectorAll(
    'a[href], button:not([disabled]), iframe, input, select, textarea',
  );
  if (focusable.length === 0) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  /* Only the shell's own close button and the frame are reachable this way; the
     form controls live inside the frame, which traps its own focus. */
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

/* ------------------------------------------------------------------ wiring */

/**
 * Only the nav is hijacked. Any other link to /login/ or /register/ — a
 * "Sign in" line in body copy, say — still navigates normally, which keeps the
 * pages working without this script at all.
 */
function target(link) {
  if (!(link instanceof HTMLAnchorElement)) return null;
  const href = link.getAttribute("href") || "";
  return FRAMED.indexOf(href) === -1 ? null : href;
}

document.addEventListener("click", (event) => {
  const link = event.target.closest ? event.target.closest("a[href]") : null;
  const pathname = target(link);
  if (!pathname) return;
  /* Let the visitor open it in a new tab if they asked for one. */
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  if (event.button !== 0) return;

  event.preventDefault();
  show(pathname, link);
});

document.addEventListener("keydown", onKeydown);
