/**
 * Copies the frozen, buildless marketing site into dist/ verbatim.
 *
 * These files are deliberately NOT rollup inputs (see vite.config.ts) so the
 * bundler can never rewrite them. This script is the only thing that places
 * them in the production output, and it copies bytes without modification.
 */
import { copyFileSync, cpSync, mkdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const SITE_ROOT = resolve(import.meta.dirname, "..");
const DIST = join(SITE_ROOT, "dist");

/** Single files copied byte-for-byte. */
const FILES = [
  "index.html",
  "ican.html",
  "course.html",
  "course_details.html",
  "about.html",
  "pricing.html",
  "contact.html",
  "404.html",
  "thank-you.html",
  "contact.php",
  "robots.txt",
  "sitemap.xml",
  "favicon.svg",
];

/** Directories copied recursively (images, vendored Bootstrap, marketing CSS/JS). */
const DIRS = ["assets/img", "assets/bootstrap"];

/** Individual files inside directories we only partially copy. */
const ASSETS = ["assets/css/ican.css", "assets/js/ican.js", "assets/js/auth-modal.js"];

mkdirSync(DIST, { recursive: true });

let count = 0;
for (const rel of [...FILES, ...ASSETS]) {
  const src = join(SITE_ROOT, rel);
  if (!statSync(src, { throwIfNoEntry: false })) {
    throw new Error(`copy-site: missing file ${rel}`);
  }
  const dest = join(DIST, rel);
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(src, dest);
  count += 1;
}

for (const rel of DIRS) {
  const src = join(SITE_ROOT, rel);
  if (!statSync(src, { throwIfNoEntry: false })) {
    throw new Error(`copy-site: missing frozen directory ${rel}`);
  }
  const dest = join(DIST, rel);
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(src, dest, { recursive: true });
  count += 1;
}

console.log(`copy-site: placed ${count} frozen entries in dist/`);
