/**
 * Drives the site in real headless Chrome and checks the two things a source
 * level test cannot:
 *
 *   1. The LMS pages actually render. Every module is TypeScript served from
 *      outside Vite's root; getting that wrong produces a blank page and only a
 *      MIME warning, so a 200 on the HTML shell proves nothing.
 *   2. The auth popup opens, frames the real pages, closes by Escape, backdrop
 *      and button, restores focus, and keeps the reset flow inside the frame.
 *
 * Uses the Chrome DevTools Protocol over Node's built-in WebSocket, so there is
 * nothing to install. If no Chrome is found it skips, so it is safe in `npm test`
 * on a machine without it.
 *
 * Run: node scripts/test-browser.mjs [baseUrl]
 */

import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = (process.argv[2] ?? "http://localhost:5173").replace(/\/$/, "");

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
].filter(Boolean);

const CHROME = CHROME_CANDIDATES.find((p) => existsSync(p));

if (!CHROME) {
  console.log("SKIP: no Chrome found (set CHROME_PATH). Browser checks not run.");
  process.exit(0);
}

let passed = 0;
const failures = [];

function check(name, ok, detail = "") {
  if (ok) {
    passed += 1;
    console.log(`  pass  ${name}`);
  } else {
    failures.push(detail ? `${name} — ${detail}` : name);
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

/* ------------------------------------------------------------------- chrome */

const profile = mkdtempSync(join(tmpdir(), "cpam-"));
const PORT = 9222 + (process.pid % 400);
const chrome = spawn(CHROME, [
  "--headless=new",
  "--disable-gpu",
  "--no-first-run",
  "--no-default-browser-check",
  "--disable-extensions",
  "--disable-background-networking",
  `--user-data-dir=${profile}`,
  `--remote-debugging-port=${PORT}`,
  "about:blank",
], { stdio: "ignore" });

/* Chrome keeps writing to the profile for a moment after kill, so a failed
   cleanup must not take the whole test run down with it. */
function cleanup() {
  try {
    chrome.kill();
  } catch { /* already gone */ }
  try {
    rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  } catch { /* temp dir, the OS will get it */ }
}
process.on("exit", cleanup);

async function targetUrl() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const list = await res.json();
      const page = list.find((t) => t.type === "page");
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    } catch { /* not listening yet */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("Chrome did not expose a debugging target");
}

/* --------------------------------------------------------------------- cdp */

const ws = new WebSocket(await targetUrl());
await new Promise((resolve, reject) => {
  ws.addEventListener("open", resolve, { once: true });
  ws.addEventListener("error", reject, { once: true });
});

let seq = 0;
const pending = new Map();
/* Errors from every frame. The favicon 404 is pre-existing and unrelated. */
const pageErrors = [];

ws.addEventListener("message", (event) => {
  const msg = JSON.parse(event.data);

  if (msg.method === "Runtime.exceptionThrown") {
    const d = msg.params.exceptionDetails;
    pageErrors.push(`exception: ${d.exception?.description ?? d.text}`);
  }
  if (msg.method === "Runtime.consoleAPICalled" && msg.params.type === "error") {
    pageErrors.push(`console: ${msg.params.args.map((a) => a.value ?? a.description).join(" ")}`);
  }
  if (msg.method === "Log.entryAdded" && msg.params.entry.level === "error") {
    const { text, url } = msg.params.entry;
    if (!/favicon/.test(url ?? "")) pageErrors.push(`log: ${text} @ ${url ?? ""}`);
  }

  const slot = pending.get(msg.id);
  if (!slot) return;
  pending.delete(msg.id);
  if (msg.error) slot.reject(new Error(msg.error.message));
  else slot.resolve(msg.result);
});

function send(method, params = {}) {
  seq += 1;
  const id = seq;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(expression) {
  const res = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (res.exceptionDetails) {
    throw new Error(res.exceptionDetails.exception?.description ?? "evaluate failed");
  }
  return res.result.value;
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function goto(path) {
  pageErrors.length = 0;
  await send("Page.navigate", { url: `${BASE}${path}` });
  await wait(1200);
}

/** Polls an expression until it is truthy, so tests do not depend on timings. */
async function until(expression, label, tries = 40) {
  for (let i = 0; i < tries; i += 1) {
    let value;
    try {
      value = await evaluate(expression);
    } catch { value = false; }
    if (value) return value;
    await wait(150);
  }
  return false;
}

await send("Runtime.enable");
await send("Log.enable");
await send("Page.enable");
/* The marketing nav CTAs are hidden on a narrow viewport; test at desktop size. */
await send("Emulation.setDeviceMetricsOverride", {
  width: 1280, height: 900, deviceScaleFactor: 1, mobile: false,
});

/* ------------------------------------------------- 1. the LMS pages render */

console.log("\nLMS pages render in dev");

await goto("/login/");
const loginRendered = await until('document.querySelectorAll("#app form").length === 1');
check("the login page builds its form", loginRendered === true);
const loginLinks = await evaluate('[...document.querySelectorAll("#app a")].map((a) => a.getAttribute("href"))');
check(
  "the login page links to register and reset",
  Array.isArray(loginLinks) && loginLinks.includes("/register/") && loginLinks.includes("/forgot-password/"),
  JSON.stringify(loginLinks),
);
check("the login brand links to the home page", Array.isArray(loginLinks) && loginLinks.includes("/"));
check(
  "the login page is marked noindex",
  await evaluate('document.querySelector(\'meta[name="robots"]\')?.content.includes("noindex") === true'),
);

await goto("/student/dashboard/");
const dashboardRendered = await until('document.querySelectorAll("#app h1, #app h2, #app .stat").length > 0');
check("the student dashboard builds content", dashboardRendered === true);
check(
  "the student dashboard renders in preview mode",
  await evaluate('document.body.classList.contains("app") && document.getElementById("app").children.length > 0'),
);

/* Every role must render too — the guard used to blank all of them at once.
   The persona has to change with the route: requireRole() sends a student back
   to the student dashboard, which would make the tutor and admin checks pass on
   the wrong page. data-page proves which shell actually came up. */
for (const role of ["student", "tutor", "admin"]) {
  await evaluate(`localStorage.setItem("charterpath.preview.role", "${role}")`);
  await goto(`/${role}/dashboard/`);
  const built = await until(`document.getElementById("app")?.children.length > 0 && document.body.dataset.page === "${role}-dashboard"`);
  check(`the ${role} dashboard renders`, built === true, await evaluate('location.pathname + " page=" + document.body.dataset.page'));
}

/* The roster is the page the new Students nav entry opens, so it must build a
   table rather than spin or throw. */
await evaluate('localStorage.setItem("charterpath.preview.role", "tutor")');
await goto("/tutor/students/");
const rosterRendered = await until('document.querySelectorAll("#app table tbody tr").length > 0 && document.body.dataset.page === "tutor-students"');
check("the tutor students roster renders", rosterRendered === true, await evaluate('location.pathname + " page=" + document.body.dataset.page'));

check(
  "no page errors while loading the LMS",
  pageErrors.length === 0,
  pageErrors.slice(0, 3).join(" | "),
);

/* ------------------------------------------------------ 2. the auth popup */

console.log("\nAuth popup");

await goto("/");
check("the marketing home page loads", (await evaluate("document.title")).length > 0);
check(
  "the popup shim is loaded",
  await evaluate('typeof FRAMED !== "undefined" && FRAMED.indexOf("/login/") !== -1'),
);
check(
  "the desktop nav CTAs are visible at this width",
  await evaluate('getComputedStyle(document.querySelector(".header-actions")).display !== "none"'),
);

await evaluate(`(() => {
  const link = document.querySelector('.header-actions a[href="/login/"]');
  link.focus();
  link.click();
  return true;
})()`);

check("clicking Login opens the popup", await until('!!document.querySelector(".cpam-backdrop")') === true);
check(
  "the popup is a labelled modal dialog",
  await evaluate(`(() => {
    const d = document.querySelector(".cpam-dialog");
    return d?.getAttribute("role") === "dialog"
      && d?.getAttribute("aria-modal") === "true"
      && !!d?.getAttribute("aria-label");
  })()`),
);
check(
  "the popup frames the real login page, same origin",
  await evaluate(`(() => {
    const f = document.querySelector(".cpam-frame");
    if (!f?.src) return false;
    const u = new URL(f.src, location.origin);
    return u.pathname === "/login/" && u.origin === location.origin;
  })()`),
);
check(
  "the framed login page actually renders its form",
  await until('document.querySelector(".cpam-frame")?.contentDocument?.querySelectorAll("#app form").length === 1') === true,
  "a blank frame is the failure this test exists for",
);
check(
  "the page behind cannot scroll while the popup is open",
  await evaluate('document.body.classList.contains("cpam-open")'),
);
check(
  "the close button takes focus on open",
  await evaluate('document.activeElement?.classList.contains("cpam-close") === true'),
);

await evaluate('document.querySelector(".cpam-close").click()');
await wait(300);
check("the close button closes the popup", await evaluate('!document.querySelector(".cpam-backdrop")'));
check("no backdrop is left behind", await evaluate('document.querySelectorAll(".cpam-backdrop").length === 0'));
check("body scrolling is restored", await evaluate('!document.body.classList.contains("cpam-open")'));
check(
  "focus returns to the link that opened the popup",
  await evaluate('document.activeElement?.getAttribute("href") === "/login/"'),
);

/* Backdrop click. */
await evaluate('document.querySelector(\'.header-actions a[href="/login/"]\').click()');
await until('!!document.querySelector(".cpam-backdrop")');
await evaluate('document.querySelector(".cpam-backdrop").dispatchEvent(new MouseEvent("mousedown", { bubbles: true }))');
await wait(300);
check("clicking the backdrop closes the popup", await evaluate('!document.querySelector(".cpam-backdrop")'));

/* Escape. */
await evaluate('document.querySelector(\'.header-actions a[href="/login/"]\').click()');
await until('!!document.querySelector(".cpam-backdrop")');
await send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
await wait(300);
check("pressing Escape closes the popup", await evaluate('!document.querySelector(".cpam-backdrop")'));

/* Ctrl-click must open a tab, not the popup. */
await evaluate(`(() => {
  const link = document.querySelector('.header-actions a[href="/register/"]');
  let seen = false;
  link.addEventListener("click", () => { seen = true; }, { once: true });
  link.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, ctrlKey: true, button: 0 }));
  return seen;
})()`);
await wait(200);
check("a ctrl-click does not open the popup", await evaluate('!document.querySelector(".cpam-backdrop")'));

/* The reset flow must stay inside the frame. A synthetic ctrl-click is not a
   real user gesture, so Chrome runs the default action and navigates rather
   than opening a tab — go back to the marketing page before continuing. */
await goto("/");
await evaluate('document.querySelector(\'.header-actions a[href="/login/"]\').click()');
await until('!!document.querySelector(".cpam-frame")?.contentDocument?.querySelector("#app form")');
await evaluate(`(async () => {
  const doc = document.querySelector(".cpam-frame").contentDocument;
  const link = doc.querySelector('a[href="/forgot-password/"]');
  if (!link) return "no link";
  link.click();
  await new Promise((r) => setTimeout(r, 1200));
  return "clicked";
})()`);
const resetPath = await until('document.querySelector(".cpam-frame")?.contentWindow.location.pathname === "/forgot-password/"');
check("asking for a reset link stays inside the popup", resetPath === true);
check("the popup is still open mid reset-flow", await evaluate('!!document.querySelector(".cpam-backdrop")'));
check("the top-level page did not navigate", await evaluate('location.pathname === "/"'));

/* Signing in inside the frame hands the page back instead of trapping it. */
await goto("/");
await evaluate('document.querySelector(\'.header-actions a[href="/register/"]\').click()');
await until('!!document.querySelector(".cpam-frame")');
check(
  "the Register button opens the register form",
  await until(`(() => {
    const f = document.querySelector(".cpam-frame");
    return f && new URL(f.src, location.origin).pathname === "/register/";
  })()`) === true,
);
check(
  "the framed register page renders its form",
  await until('document.querySelector(".cpam-frame")?.contentDocument?.querySelectorAll("#app form").length === 1') === true,
);
await evaluate('document.querySelector(\'.header-actions a[href="/login/"]\').click()');
await until('!!document.querySelector(".cpam-frame")');
check(
  "switching to Login from the nav reframes the popup",
  await until('new URL(document.querySelector(".cpam-frame").src, location.origin).pathname === "/login/"') === true,
);

/* A signed-in frame hands its destination to the shell instead of navigating
   itself, because a dashboard cannot be framed (frame-ancestors 'none'). */
await evaluate('localStorage.setItem("charterpath.preview.role", "student")');
await evaluate(`(() => {
  const frame = document.querySelector(".cpam-frame").contentWindow;
  frame.parent.postMessage({ type: "icanpath:navigate", url: "/student/dashboard/" }, location.origin);
  return true;
})()`);
check("the framed handoff closes the popup", await until('!document.querySelector(".cpam-backdrop")') === true);
check(
  "the framed handoff routes the top window",
  await until('location.pathname.startsWith("/student/dashboard")') === true,
  await evaluate("location.pathname"),
);

/* ------------------------------------------------ 3. dashboard responsiveness */

/* The marketing suite above needs a desktop width; run the dashboard
   responsiveness walk afterwards. WIDTHS may be a comma list, e.g.
   RESPONSIVE_WIDTH="390,768". SHOT_ROUTES (optional) captures screenshots to
   /tmp for the routes it names. */
const RESPONSIVE_WIDTHS = (process.env.RESPONSIVE_WIDTH ?? "390,768").split(",").map((s) => Number(s)).filter(Boolean);
const SHOT_ROUTES = (process.env.RESPONSIVE_SHOTS ?? "").split(",").filter(Boolean);

const RESPONSIVE_ROUTES = {
  student: [
    "/student/dashboard/", "/student/courses/", "/student/course/", "/student/lesson/",
    "/student/live/", "/student/practice-quizzes/", "/student/quiz/", "/student/written-assignments/",
    "/student/materials/", "/student/announcements/", "/student/progress/", "/student/browse/",
    "/student/assessments/", "/student/profile/", "/student/messages/",
    "/student/questions/", "/student/activity/", "/student/search/",
  ],
  tutor: [
    "/tutor/dashboard/", "/tutor/courses/", "/tutor/course/", "/tutor/students/", "/tutor/grading/",
    "/tutor/live/", "/tutor/announcements/", "/tutor/profile/", "/tutor/messages/",
    "/tutor/lessons/", "/tutor/course/", "/tutor/materials/", "/tutor/assignments/", "/tutor/questions/",
    "/tutor/activity/", "/tutor/attempts/", "/tutor/search/", "/tutor/assessments/",
  ],
  admin: [
    "/admin/dashboard/", "/admin/courses/", "/admin/course/", "/admin/review/", "/admin/users/",
    "/admin/tutors/", "/admin/students/", "/admin/enrollments/", "/admin/live/", "/admin/reports/",
    "/admin/audit/", "/admin/settings/", "/admin/moderation/", "/admin/search/", "/admin/announcements/",
    "/admin/profile/", "/admin/messages/",
  ],
};

const MEASURE_HIDDEN = `e.closest("details:not([open]), .app-side, .app-table-wrap, [hidden], .skip-link")`;

const RESPONSIVE_MEASURE = `(() => {
  const inner = window.innerWidth;
  const list = [];
  for (const e of document.querySelectorAll("#app *")) {
    if (${MEASURE_HIDDEN}) continue;
    const r = e.getBoundingClientRect();
    if (r.width <= 1 || r.height <= 1) continue;
    const cs = getComputedStyle(e);
    if (r.right > inner + 2 || r.left < -2) {
      if (cs.overflowX === "auto" || cs.overflowX === "hidden" || cs.overflowX === "scroll" || cs.position === "fixed") continue;
      list.push(e.tagName + "." + (e.className?.toString() || "").slice(0, 40) + " right=" + Math.round(r.right) + "w=" + Math.round(r.width));
    }
    /* Ignore a couple of pixels of CSS rounding; flag real shrink failures. */
    if (cs.overflowX === "visible" && e.scrollWidth > e.clientWidth + 8 && e.clientWidth > 0) {
      list.push(e.tagName + "." + (e.className?.toString() || "").slice(0, 40) + " text " + (e.textContent || "").trim().replace(/\\s+/g, " ").slice(0, 24));
    }
  }
  const box = [];
  const els = [...document.querySelectorAll("#app *")].filter((e) => {
    if (${MEASURE_HIDDEN}) return false;
    const r = e.getBoundingClientRect();
    const cs = getComputedStyle(e);
    return r.width > 2 && r.height > 2 && cs.position !== "fixed" && cs.position !== "absolute";
  });
  for (let i = 0; i < els.length; i += 1) {
    const a = els[i].getBoundingClientRect();
    for (let j = i + 1; j < els.length; j += 1) {
      const b = els[j].getBoundingClientRect();
      if (a.right <= b.left + 3 || b.right <= a.left + 3 || a.bottom <= b.top + 3 || b.bottom <= a.top + 3) continue;
      const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      const oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (ox > 10 && oy > 10 && !(els[i].contains(els[j]) || els[j].contains(els[i]))) {
        const label = (e) => {
          const cls = (e.className?.toString() || "").slice(0, 30);
          const href = e.tagName === "A" ? "→" + (e.getAttribute("href") || "").slice(0, 40) : "";
          const pos = getComputedStyle(e).position;
          return e.tagName + "." + cls + href + "{pos:" + pos + "}";
        };
        box.push(label(els[i]) + "><" + label(els[j]) + " x" + Math.round(ox) + "y" + Math.round(oy));
      }
    }
  }
  return JSON.stringify({ page: document.body.dataset.page, docOverflow: Math.max(0, document.documentElement.scrollWidth - inner), list: list.slice(0, 8), overlap: [...new Set(box)].slice(0, 8) });
})()`;

for (const width of RESPONSIVE_WIDTHS) {
  console.log(`\ndashboard responsiveness at ${width}px`);
  await send("Emulation.setDeviceMetricsOverride", { width, height: 920, deviceScaleFactor: 1, mobile: false });
  for (const [role, routes] of Object.entries(RESPONSIVE_ROUTES)) {
    await evaluate(`localStorage.setItem("charterpath.preview.role", "${role}")`);
    const problems = [];
    for (const route of routes) {
      await goto(route);
      const rendered = await until(`document.getElementById("app")?.children.length > 0`);
      if (!rendered) continue;
      await new Promise((r) => setTimeout(r, 80));
      const data = JSON.parse(await evaluate(RESPONSIVE_MEASURE));
      if (SHOT_ROUTES.includes(route)) {
        try {
          await send("Page.bringToFront");
          await new Promise((r) => setTimeout(r, 150));
          const img = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
          const png = img.data ?? img.result?.data;
          if (png) {
            const key = route.split("/").filter(Boolean).join("-") || "/";
            const { writeFileSync } = await import("node:fs");
            writeFileSync(`/tmp/rs-${width}-${role}-${key}.png`, Buffer.from(png, "base64"));
          } else {
            console.warn("  (shot skipped for " + route + ": " + JSON.stringify(img).slice(0, 120) + ")");
          }
        } catch (e) { console.warn("  (shot failed for " + route + ": " + e.message.slice(0, 120) + ")"); }
      }
      if (data.docOverflow > 1 || data.list.length > 0 || data.overlap.length > 0) {
        problems.push(`${route}: ${data.docOverflow}px over` + (data.list.length ? " | " + data.list.join(" ; ") : "") + (data.overlap.length ? " | OVERLAP " + data.overlap.join(" ; ") : ""));
      }
    }
    check(
      `no overlapping layout on ${role} dashboards at ${width}px`,
      problems.length === 0,
      problems.join("\n      "),
    );
  }
}

/* ------------------------------------------------------------------ result */

console.log("\n────────────────────────────────────────────────────────────");
if (failures.length > 0) {
  console.log(`RESULT: ${passed} browser assertions passed, ${failures.length} FAILED.`);
  for (const name of failures) console.log(`  - ${name}`);
  ws.close();
  cleanup();
  process.exit(1);
}
console.log(`RESULT: ${passed} browser assertions passed, 0 failed.`);

ws.close();
cleanup();
process.exit(0);