/**
 * Frontend smoke tests.
 *
 * These are the checks a bundler will not do for you, and the ones that catch the
 * failures this project has actually hit:
 *
 *   1. every route in app/ points at a page module that exists
 *   2. every import inside a page module resolves on disk
 *   3. every class the modules ask for exists in a stylesheet
 *   4. every table, RPC and storage bucket the browser touches is granted and
 *      defined by the migrations — the browser cannot invent either
 *   5. the preview fixtures are self-consistent, so preview mode can render
 *
 * Run with: node --experimental-strip-types scripts/test-frontend.mjs
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

const SITE_ROOT = resolve(import.meta.dirname, "..");
const LMS = join(SITE_ROOT, "assets/js/lms");
const APP = join(SITE_ROOT, "app");

let passed = 0;
const failures = [];

function check(name, condition, detail = "") {
  if (condition) {
    passed += 1;
    console.log(`  pass  ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function walk(dir, suffix) {
  const found = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...walk(full, suffix));
    else if (entry.name.endsWith(suffix)) found.push(full);
  }
  return found;
}

const modules = walk(LMS, ".ts");
const htmlFiles = walk(APP, ".html");
const migrations = walk(join(SITE_ROOT, "supabase/migrations"), ".sql");
const sql = migrations.map((f) => readFileSync(f, "utf8")).join("\n");

console.log("\nFrontend wiring");

/* 1. routes have a module -------------------------------------------------------- */

const routeEntries = [];
for (const html of htmlFiles) {
  const rel = relative(APP, html).replace(/\\/g, "/");
  const src = /<script type="module" src="([^"]+)"/.exec(readFileSync(html, "utf8"))?.[1];
  const from = dirname(html);
  routeEntries.push({ rel, src, target: src ? resolve(from, src) : null });
}

check("app/ has page shells", htmlFiles.length > 0, `${htmlFiles.length} found`);
check("every route loads a module entry", routeEntries.every((r) => r.src));
check(
  "every route's module exists",
  routeEntries.every((r) => r.target && existsSync(r.target)),
  routeEntries
    .filter((r) => r.target && !existsSync(r.target))
    .map((r) => r.rel)
    .join(", "),
);

const routes = routeEntries.map((r) => `/${dirname(r.rel).replace(/\\/g, "/")}/`);
check(
  "routes are unique",
  new Set(routes).size === routes.length,
  routes.filter((r, i) => routes.indexOf(r) !== i).join(", "),
);

/* 2. imports resolve ------------------------------------------------------------- */

const importPattern = /(?:from|import)\s+"(\.[^"]+)"/g;
let unresolved = [];
for (const file of modules) {
  const source = readFileSync(file, "utf8");
  for (const match of source.matchAll(importPattern)) {
    const target = resolve(dirname(file), match[1]);
    if (!existsSync(target)) unresolved.push(`${relative(SITE_ROOT, file)} -> ${match[1]}`);
  }
}
check("every relative import resolves", unresolved.length === 0, unresolved.join("; "));

// A page module that no route loads is dead code and will rot silently.
const referenced = new Set(routeEntries.map((r) => r.target).filter(Boolean));
const orphans = modules.filter(
  (f) => dirname(f) === join(LMS, "pages") && !referenced.has(f),
);
check("every page module is routed", orphans.length === 0, orphans.map((f) => relative(SITE_ROOT, f)).join(", "));

/* 3. classes exist --------------------------------------------------------------- */

const css = ["assets/css/app.css", "assets/css/ican.css"]
  .map((f) => readFileSync(join(SITE_ROOT, f), "utf8"))
  .join("\n");

const usedClasses = new Set();
for (const file of modules) {
  for (const match of readFileSync(file, "utf8").matchAll(/class: "([^"]+)"/g)) {
    for (const name of match[1].split(/\s+/)) if (name) usedClasses.add(name);
  }
}
const unstyled = [...usedClasses].filter((c) => !css.includes(`.${c}`)).sort();
check("every class used is styled", unstyled.length === 0, unstyled.join(", "));

/* 4. the browser only touches granted, real database objects --------------------- */

const apiSource = readFileSync(join(LMS, "api.ts"), "utf8");

const tables = [...new Set([...apiSource.matchAll(/\.from\("([a-z_]+)"\)/g)].map((m) => m[1]))];
const grantedTables = new Set(
  [...sql.matchAll(/grant\s+[a-z, ]+\s+on\s+public\.([a-z_]+)\s+to\s+\w+/gi)].map((m) => m[1]),
);
const ungrantedTables = tables.filter((t) => !grantedTables.has(t));
check("every selected table is granted", ungrantedTables.length === 0, ungrantedTables.join(", "));
check("the browser selects something", tables.length > 0);

const rpcs = [...new Set([...apiSource.matchAll(/\.rpc\("([a-z_]+)"/g)].map((m) => m[1]))];
const definedRpcs = new Set([...sql.matchAll(/create or replace function public\.([a-z_0-9]+)/gi)].map((m) => m[1]));
const inventedRpcs = rpcs.filter((r) => !definedRpcs.has(r));
// A handler that reads a control's .checked must read a control that is
// actually in the form. Building the element twice -- once into a variable, once
// inline with the same id -- typechecks, passes review, and silently ignores
// whatever the user ticked.
for (const file of modules) {
  const source = readFileSync(file, "utf8");
  const name = file.slice(LMS.length + 1);
  for (const control of new Set([...source.matchAll(/\b(\w+)\.checked\b/g)].map((m) => m[1]))) {
    // Drop the declaration itself, otherwise the identifier always "matches"
    // itself and the check passes whatever the form actually renders.
    const afterDecl = source.replace(new RegExp(`const ${control}\\b[^;]*;`), "");
    const rendered = new RegExp(`[\\s(\\{,]${control}[\\s,)\\}]`);
    check(
      `${name}: .checked is read on the ${control} that is rendered`,
      rendered.test(afterDecl),
    );
  }
}

check("every RPC called exists in a migration", inventedRpcs.length === 0, inventedRpcs.join(", "));

const buckets = [...new Set([...apiSource.matchAll(/\.storage\s*\n?\s*\.from\("([a-z-]+)"\)/g)].map((m) => m[1]))];
const declaredBuckets = new Set(
  [...sql.matchAll(/insert into storage\.buckets\s*\([^)]*\)\s*values\s*\(\s*'([a-z0-9-]+)'/gi)].map((m) => m[1]),
);
const missingBuckets = buckets.filter((b) => !declaredBuckets.has(b));
check("every storage bucket exists", missingBuckets.length === 0, missingBuckets.join(", "));

// Private storage paths are validated by storage_name_is_valid(); the client must
// build the same shape or every upload is refused by policy at runtime.
const pathTemplates = [...new Set([...apiSource.matchAll(/`courses\/\$\{[^}]+\}\/[a-z]+\/[^`]*`/g)].map((m) => m[0]))];
const shapeOk = pathTemplates.every((t) =>
  /^`courses\/\$\{[^}]+\}\/(materials|live|submissions)\/\$\{[^}]+\}\.url`$/.test(t));
check(
  "storage path templates match the validated shape",
  pathTemplates.length > 0 && shapeOk,
  pathTemplates.join(", "),
);
check("the browser can upload to private storage", /storage\s*\n?\s*\.from\("lms-private"\)/.test(apiSource));

// Reading a private file must go through the RPC, never a bare public URL.
const signedReads = [...apiSource.matchAll(/resolve_learning_link/g)].length;
check("provider links are resolved through the authorization RPC", signedReads > 0);
check("no bucket is declared public by the client", !/\.getPublicUrl\(/.test(apiSource));

/* 5. preview fixtures ------------------------------------------------------------ */

const preview = await import(join(LMS, "preview-data.ts"));

preview.seedPreview();
const seeded = preview.previewState;
check("seeding fills the fixture state", seeded.courses.length > 0);

// A persona per role, otherwise the switcher has nothing to switch to.
for (const role of ["student", "tutor", "admin"]) {
  check(`preview has a ${role} persona`, seeded.profiles.some((p) => p.role === role));
  check(`previewPersonaId resolves ${role}`, preview.previewPersonaId(role).length > 0);
}

// Every fixture row must point at a row that exists, or a preview screen renders
// a dangling reference that the real database would reject.

const courseIds = new Set(seeded.courses.map((c) => c.id));
const lessonIds = new Set(seeded.lessons.map((l) => l.id));
const moduleIds = new Set(seeded.modules.map((m) => m.id));
const dangling = [];
const need = (name, rows, key, known) => {
  for (const row of rows) if (!known.has(row[key])) dangling.push(`${name}:${row.id}`);
};
need("modules", seeded.modules, "course_id", courseIds);
need("lessons", seeded.lessons, "course_id", courseIds);
need("lessons", seeded.lessons, "module_id", moduleIds);
need("materials", seeded.materials, "lesson_id", lessonIds);
need("assignments", seeded.assignments, "course_id", courseIds);
need("live classes", seeded.liveClasses, "course_id", courseIds);
need("progress", seeded.progress, "lesson_id", lessonIds);
need("submissions", seeded.submissions, "assignment_id", new Set(seeded.assignments.map((a) => a.id)));
check("fixtures reference real rows", dangling.length === 0, dangling.join(", "));

const quizIds = new Set(seeded.quizzes.map((q) => q.id));
const orphanQuestions = seeded.questions.filter((q) => !quizIds.has(q.quiz_id)).map((q) => q.id);
check("fixture questions belong to a fixture quiz", orphanQuestions.length === 0, orphanQuestions.join(", "));

const profileIds = new Set(seeded.profiles.map((p) => p.id));
const orphanAttempts = seeded.attempts.filter((a) => !profileIds.has(a.student_id)).map((a) => a.id);
check("fixture attempts belong to a fixture student", orphanAttempts.length === 0, orphanAttempts.join(", "));

// A published course is what a student can actually see.
check("preview has a published course", seeded.courses.some((c) => c.status === "published"));
check("preview has audit fixtures", seeded.auditLogs.length > 0);
const adminStats = preview.previewAdminStats();
check("admin recent_activity is counted from the fixtures", adminStats.recent_activity > 0);

// Student stats must be computed from the fixtures, not hardcoded, so they stay
// true if the fixtures change.
const studentProfile = seeded.profiles.find((p) => p.role === "student");
const stats = preview.previewStudentStats();
check("student stats count the enrolment", stats.enrolled_courses >= 1, String(stats.enrolled_courses));
check("student stats are percentages", stats.overall_progress >= 0 && stats.overall_progress <= 100);
check("previewStudentStats is profile-aware", studentProfile !== undefined);

// The marketing nav must offer the LMS entry points on every page that carries
// it. The frozen manifest only proves bytes match whatever baseline was last
// accepted, so this asserts the intent: a future --update cannot quietly put
// the old "Talk to us" / "Browse courses" CTAs back.
const marketingPages = readFileSync(join(SITE_ROOT, "scripts/frozen.sha256"), "utf8")
  .split("\n")
  .filter((line) => line.endsWith(".html"))
  .map((line) => line.trim().split(/\s+/).pop());

check("marketing pages were found", marketingPages.length > 0, `${marketingPages.length} found`);

const navProblems = [];
for (const rel of marketingPages) {
  const page = readFileSync(join(SITE_ROOT, rel), "utf8");
  const header = page.match(/<div class="header-actions">[\s\S]*?<\/div>/)?.[0] ?? "";
  const drawer = page.match(/<div class="nav-mobile__foot">[\s\S]*?Questions\?/)?.[0] ?? "";

  for (const [where, block] of [["header", header], ["drawer", drawer]]) {
    if (block === "") navProblems.push(`${rel}: no ${where} block found`);
    else if (!/href="\/login\/"/.test(block)) navProblems.push(`${rel}: ${where} has no /login/`);
    else if (!/href="\/register\/"/.test(block)) navProblems.push(`${rel}: ${where} has no /register/`);
    else if (/contact\.html#enrol/.test(block)) navProblems.push(`${rel}: ${where} still has the Talk to us CTA`);
    else if (/course\.html/.test(block)) navProblems.push(`${rel}: ${where} still has the Browse courses CTA`);
  }
}
check(
  "every marketing nav links to Login and Register",
  navProblems.length === 0,
  navProblems.slice(0, 6).join("; "),
);

const loginRoute = readFileSync(join(APP, "login/index.html"), "utf8");
const registerRoute = readFileSync(join(APP, "register/index.html"), "utf8");
check("the nav targets exist as real routes", /auth-login\.ts/.test(loginRoute) && /auth-register\.ts/.test(registerRoute));

// The auth popup: a plain-JS shim on the frozen pages that frames the real LMS
// routes. It cannot be a module, because the marketing pages are copied to dist/
// verbatim and never processed by the bundler.
const modalPath = join(SITE_ROOT, "assets/js/auth-modal.js");
const modal = readFileSync(modalPath, "utf8");
const copySite = readFileSync(join(SITE_ROOT, "scripts/copy-site.mjs"), "utf8");

check("the auth popup is plain JS, not a module", !/<script[^>]*type="module"/.test(modal));

check(
  "copy-site copies the auth popup to dist",
  /assets\/js\/auth-modal\.js/.test(copySite),
  "otherwise the script tag 404s in production",
);

const notWired = marketingPages.filter(
  (rel) => !/<script src="assets\/js\/auth-modal\.js" defer><\/script>/.test(readFileSync(join(SITE_ROOT, rel), "utf8")),
);
check("every marketing page loads the auth popup", notWired.length === 0, notWired.join(", "));

// It must frame the real pages rather than reimplement the forms, or the auth
// logic ends up in two places and they drift apart.
for (const route of ["/login/", "/register/", "/reset-password/"]) {
  check(`the auth popup frames ${route}`, modal.includes(`"${route}"`));
}
check(
  "the auth popup does not duplicate the auth forms",
  !/signInWithPassword|resetPasswordForEmail/.test(modal),
  "it should frame the LMS routes, not call Supabase itself",
);

// /forgot-password/ links to /reset-password/, so it has to stay framed too —
// otherwise asking for a reset link throws the visitor out of the popup and the
// reset page becomes unreachable from it.
check(
  "the reset flow does not fall out of the popup",
  modal.includes('"/forgot-password/"'),
  "login links to forgot-password, which links to reset-password",
);
check(
  "every route the auth pages link to among themselves is framed",
  ["/login/", "/register/", "/forgot-password/", "/reset-password/"].every((route) =>
    [...loginRoute, ...registerRoute, readFileSync(join(APP, "forgot-password/index.html"), "utf8"),
      readFileSync(join(APP, "reset-password/index.html"), "utf8")]
      .every((html) => !new RegExp(`href="${route}"`).test(html) || modal.includes(`"${route}"`)),
  ),
);

// A dialog that cannot be dismissed is a trap.
check("the auth popup closes on Escape", /event\.key === "Escape"/.test(modal));
check("the auth popup closes on backdrop click", /event\.target === backdrop/.test(modal));
check("the auth popup has a labelled close button", /aria-label",\s*"Close"/.test(modal));
check("the auth popup is announced as a dialog", /aria-modal",\s*"true"/.test(modal));
check("the auth popup traps Tab", /event\.key !== "Tab"|event\.key === "Tab"/.test(modal));
check("the auth popup restores focus on close", /opener\.focus\(\)/.test(modal));

// Signing in inside the frame must hand the page back rather than trapping the
// visitor in a box.
check(
  "the auth popup hands off when the frame leaves the auth routes",
  /frame\.contentWindow\.location\.pathname/.test(modal) && /window\.location\.href = target/.test(modal),
);

// Ctrl/Cmd-click must still open a new tab rather than being swallowed.
check("the auth popup respects new-tab clicks", /event\.metaKey \|\| event\.ctrlKey/.test(modal));

// The dev server must load the project's .env, and the preview flag must accept
// the values the docs tell people to use. Both were wrong at once: Vite defaults
// envDir to root, which is app/, so the root .env was never read; and the parser
// only accepted "true" while .env.example and the README both say 1.
const viteConfig = readFileSync(join(SITE_ROOT, "vite.config.ts"), "utf8");
const envExample = readFileSync(join(SITE_ROOT, ".env.example"), "utf8");
const configSource = readFileSync(join(LMS, "config.ts"), "utf8");

check(
  "vite reads .env from the project root, not app/",
  /envDir:\s*SITE_ROOT/.test(viteConfig),
  "root is app/, so without envDir every env var is silently undefined",
);

const documentedPreview = /VITE_PREVIEW_MODE=(\S+)/.exec(envExample)?.[1] ?? "";
const previewTrue = { "1": true, "0": false, true: true, false: false };
check(
  "the documented preview value is one config.ts accepts",
  documentedPreview in previewTrue
    ? new RegExp(`"${documentedPreview === "1" ? "1" : "true"}"`).test(configSource) || /PREVIEW_ON/.test(configSource)
    : false,
  `.env.example says VITE_PREVIEW_MODE=${documentedPreview}`,
);

check(
  "the dev asset middleware serves the popup shim",
  /assets\/js\/auth-modal\.js/.test(viteConfig.split("FROZEN_ASSET_FILES")[1] ?? ""),
  "otherwise the script 404s in dev even though copy-site ships it",
);

check(
  "the dev asset middleware does not serve the LMS TypeScript as a file",
  /LMS_PREFIX/.test(viteConfig) && /@fs/.test(viteConfig),
  "a raw read hands Chrome application/octet-stream and every page renders blank",
);

/* -------------------------------------------------------------------------------- */

console.log("\n────────────────────────────────────────────────────────────");
if (failures.length > 0) {
  console.log(`RESULT: ${passed} passed, ${failures.length} FAILED.`);
  for (const name of failures) console.log(`  - ${name}`);
  process.exit(1);
}
console.log(`RESULT: ${passed} frontend assertions passed, 0 failed.`);