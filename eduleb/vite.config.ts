/**
 * ICANPATH Academy LMS build.
 *
 * Only `app/**\/*.html` are build inputs. The nine marketing pages, contact.php,
 * robots.txt, sitemap.xml and favicon.svg are NOT inputs: they are copied
 * verbatim into dist/ by scripts/copy-site.mjs so they can never be rewritten
 * by the bundler.
 */
import { createReadStream, existsSync, readdirSync, statSync } from "node:fs";
import { extname, join, relative, resolve, sep } from "node:path";
import { defineConfig, type Plugin } from "vite";

const SITE_ROOT = resolve(import.meta.dirname);
const APP_DIR = join(SITE_ROOT, "app");

/**
 * Every .html under app/, keyed by its path *within* app/ so that
 * `app/student/dashboard/index.html` is emitted to
 * `dist/student/dashboard/index.html` and is served at /student/dashboard/.
 */
function appEntries(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...appEntries(full));
    else if (entry.name.endsWith(".html")) {
      found.push(relative(APP_DIR, full).replace(/\\/g, "/"));
    }
  }
  return found;
}

const MIME: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".mp4": "video/mp4",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

/**
 * Serves the frozen marketing assets in development.
 *
 * The frozen marketing assets, and only those.
 *
 * Vite's root is app/, so the files scripts/copy-site.mjs puts in dist/assets/
 * would 404 in dev. This middleware serves exactly that list — and nothing
 * else. In particular it must not answer for /assets/js/lms/**, which are
 * TypeScript modules the bundler has to transform: serving them as a static
 * file hands the browser application/octet-stream, and Chrome refuses to
 * execute a module with the wrong MIME type, so every page renders blank.
 */
const FROZEN_ASSET_DIRS = ["assets/img", "assets/bootstrap"];
const FROZEN_ASSET_FILES = [
  "assets/css/ican.css",
  "assets/js/ican.js",
  "assets/js/auth-modal.js",
];

/** The TypeScript the LMS routes are built from. Lives outside Vite's root. */
const LMS_PREFIX = "/assets/js/lms/";

function isFrozenAsset(url: string): string | null {
  const file = resolve(SITE_ROOT, `.${url}`);
  if (FROZEN_ASSET_FILES.includes(relative(SITE_ROOT, file).replace(/\\/g, "/"))) return file;
  const inDir = FROZEN_ASSET_DIRS.some(
    (dir) => file.startsWith(join(SITE_ROOT, dir) + sep) && !file.includes(`${sep}lms${sep}`),
  );
  if (!inDir || !existsSync(file) || !statSync(file).isFile()) return null;
  return file;
}

/**
 * Vite's root is app/, so two things need help in development: the frozen
 * marketing assets, which must be served verbatim, and the LMS TypeScript,
 * which Vite cannot serve at /assets/... because it sits outside its root.
 *
 * Neither may be answered with a raw file read. Serving the TypeScript as a
 * static file hands the browser application/octet-stream, and Chrome refuses to
 * execute a module served with the wrong MIME type — every page renders blank
 * with no error in the console beyond the MIME warning.
 */
function serveDevAssets(): Plugin {
  return {
    name: "charterpath:serve-dev-assets",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url?.split("?")[0];
        if (!url || !url.startsWith("/assets/")) return next();

        if (url.startsWith(LMS_PREFIX)) {
          const abs = resolve(SITE_ROOT, `.${url}`);
          const encoded = abs.split(sep).map(encodeURIComponent).join("/");
          const query = req.url?.slice(url.length) ?? "";
          res.statusCode = 302;
          res.setHeader("Location", `/@fs${encoded}${query}`);
          res.end();
          return;
        }

        const file = isFrozenAsset(url);
        if (!file) return next();

        res.setHeader("Content-Type", MIME[extname(file)] ?? "application/octet-stream");
        createReadStream(file).pipe(res);
      });
    },
  };
}

/**
 * Serves the frozen marketing *pages* in development.
 *
 * dist/ gets these from scripts/copy-site.mjs, but there is no app/index.html,
 * so http://localhost:5173/ would answer 404 while the production build shows
 * the homepage. Serving them here keeps one command enough to review the whole
 * site: the marketing pages and the dashboards side by side.
 */
function serveSitePages(): Plugin {
  const pages = [
    "index.html",
    "ican.html",
    "course.html",
    "course_details.html",
    "about.html",
    "pricing.html",
    "contact.html",
    "thank-you.html",
    "404.html",
  ];
  return {
    name: "charterpath:serve-site-pages",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url?.split("?")[0];
        if (!url || url.startsWith("/assets/") || url.startsWith("/build/")) return next();

        // "/" is the homepage; anything else has to be one of the named pages.
        const wanted = url === "/" ? "index.html" : url.replace(/^\//, "");
        if (!pages.includes(wanted)) return next();

        const file = join(SITE_ROOT, wanted);
        if (!existsSync(file)) return next();

        res.setHeader("Content-Type", "text/html; charset=utf-8");
        createReadStream(file).pipe(res);
      });
    },
  };
}

const input = Object.fromEntries(
  appEntries(APP_DIR).map((rel) => [rel, resolve(APP_DIR, rel)]),
);

export default defineConfig({
  plugins: [serveSitePages(), serveDevAssets()],
  // Root is app/ so that app/student/dashboard/index.html emits to
  // dist/student/dashboard/index.html, i.e. the URL /student/dashboard/.
  // There is deliberately no app/index.html: dist/ index.html belongs to the
  // frozen marketing homepage.
  root: APP_DIR,
  // Vite defaults envDir to root, which is app/ — so a .env at the project root
  // would be ignored and every page would think it has no configuration. This
  // is what makes .env, VITE_SUPABASE_URL and VITE_PREVIEW_MODE actually load.
  envDir: SITE_ROOT,
  // Assets are copied verbatim by scripts/copy-site.mjs, never by the bundler.
  publicDir: false,
  appType: "mpa",
  server: {
    port: 5173,
    // The LMS imports the shared marketing design system from ../assets.
    fs: { allow: [SITE_ROOT] },
  },
  build: {
    outDir: resolve(SITE_ROOT, "dist"),
    // dist/assets/ belongs to the frozen marketing site. Bundled chunks go to
    // dist/build/ so the two can never collide on a filename.
    assetsDir: "build",
    emptyOutDir: true,
    target: "es2022",
    sourcemap: false,
    chunkSizeWarningLimit: 700,
    rollupOptions: { input },
  },
});
