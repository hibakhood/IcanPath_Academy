/**
 * Writes the HTML shell for every dashboard page.
 *
 * Each page is a near-empty document that imports one TypeScript module. Keeping
 * the HTML generated means the shell, icon sprite and asset paths cannot drift
 * between 30 pages, and adding a page is one entry in PAGES below.
 *
 * Run with: node scripts/gen-pages.mjs
 */
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const SITE_ROOT = resolve(import.meta.dirname, "..");
const MODULES = "assets/js/lms/pages";

/** route path under app/ -> the module that renders it. */
const PAGES = {
  // auth and notices — these render outside the dashboard shell
  "login/index.html": "auth-login",
  "register/index.html": "auth-register",
  "forgot-password/index.html": "auth-forgot",
  "reset-password/index.html": "auth-reset",
  "pending/index.html": "notice-pending",
  "suspended/index.html": "notice-suspended",

  "student/browse/index.html": "student-browse",
  "student/assessments/index.html": "external-assessments",
  "tutor/assessments/index.html": "external-assessments",
  "admin/assessments/index.html": "external-assessments",
  "student/performance/index.html": "learning-performance",
  "tutor/performance/index.html": "learning-performance",
  "admin/performance/index.html": "learning-performance",
  "student/practice-quizzes/index.html": "student-quizzes",
  "student/written-assignments/index.html": "student-assignments",
  // student
  "student/dashboard/index.html": "student-dashboard",
  "student/courses/index.html": "student-courses",
  "student/course/index.html": "student-course",
  "student/lesson/index.html": "student-lesson",
  "student/live/index.html": "student-live",
  "student/quizzes/index.html": "external-assessments",
  "student/quiz/index.html": "student-quiz",
  "student/assignments/index.html": "external-assessments",
  "student/materials/index.html": "student-materials",
  "student/progress/index.html": "student-progress",
  "student/certificates/index.html": "student-certificates",
  "student/announcements/index.html": "student-announcements",
  "student/profile/index.html": "shared-profile",

  "student/messages/index.html": "shared-inbox",
  "student/questions/index.html": "learning-workspace",
  "student/activity/index.html": "learning-workspace",
  "student/search/index.html": "learning-workspace",


  // tutor
  "tutor/dashboard/index.html": "tutor-dashboard",
  "tutor/courses/index.html": "tutor-courses",
  "tutor/course/index.html": "tutor-course",
  "tutor/students/index.html": "tutor-students",
  "tutor/grading/index.html": "tutor-grading",
  "tutor/live/index.html": "tutor-live",
  "tutor/announcements/index.html": "tutor-announcements",
  "tutor/profile/index.html": "shared-profile",

  "tutor/messages/index.html": "shared-inbox",
  "tutor/lessons/index.html": "learning-workspace",
  "tutor/materials/index.html": "learning-workspace",
  "tutor/quizzes/index.html": "external-assessments",
  "tutor/assignments/index.html": "external-assessments",
  "tutor/reviews/index.html": "learning-redirect",
  "tutor/questions/index.html": "learning-workspace",
  "tutor/earnings/index.html": "learning-redirect",
  "tutor/activity/index.html": "learning-workspace",
  "tutor/attempts/index.html": "learning-workspace",
  "tutor/search/index.html": "learning-workspace",


  // admin
  "admin/dashboard/index.html": "admin-dashboard",
  "admin/review/index.html": "admin-review",
  "admin/users/index.html": "admin-users",
  "admin/courses/index.html": "admin-courses",
  "admin/course/index.html": "admin-course",
  "admin/announcements/index.html": "admin-announcements",
  "admin/profile/index.html": "shared-profile",
  "admin/tutors/index.html": "admin-users",
  "admin/students/index.html": "admin-users",
  "admin/enrollments/index.html": "admin-workspace",
  "admin/live/index.html": "admin-workspace",
  "admin/notifications/index.html": "admin-retired",
  "admin/reports/index.html": "admin-workspace",
  "admin/audit/index.html": "admin-workspace",
  "admin/settings/index.html": "admin-workspace",
  "admin/messages/index.html": "admin-retired",
  "admin/payments/index.html": "admin-retired",
  "admin/moderation/index.html": "admin-workspace",
  "admin/search/index.html": "admin-workspace",

};

/**
 * The entry path is relative to the generated file, not absolute.
 *
 * Vite's root is app/, so an absolute "/assets/..." src would be looked up at
 * app/assets/... and fail to resolve. A relative path is resolved by the bundler
 * from the file's real location, which works in both dev and build.
 */
/** Relative path from app/<route>/index.html up to the module. */
function entrySrc(route, module) {
  const depth = route.split("/").length; // one segment per directory level
  const up = "../".repeat(depth);
  return `${up}${MODULES}/${module}.ts`;
}

const template = (route, module) => `<!DOCTYPE html>
<html lang="en-NG">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body>
<noscript>
  <p style="padding:2rem;font-family:system-ui,sans-serif">This dashboard needs JavaScript enabled.</p>
</noscript>
<div id="app"></div>
<script type="module" src="${entrySrc(route, module)}"></script>
</body>
</html>
`;

let written = 0;
for (const [rel, module] of Object.entries(PAGES)) {
  const dest = join(SITE_ROOT, "app", rel);
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, template(rel, module));
  written += 1;
}

// The flat prototype pages are replaced by the routes above.
const REMOVED = ["student.html", "tutor.html", "admin.html", "login.html", "register.html", "app.js"];
let removed = 0;
for (const old of REMOVED) {
  const path = join(SITE_ROOT, "app", old);
  if (existsSync(path)) {
    rmSync(path);
    removed += 1;
  }
}

console.log(`gen-pages: wrote ${written} page shells, removed ${removed} flat prototypes`);