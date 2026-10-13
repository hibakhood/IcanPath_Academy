/**
 * Single source of truth for the PWA head snippet.
 *
 * The marketing homepage is frozen and cannot be edited, and the built LMS
 * pages are never hand-authored beyond vite inputs, so the manifest link,
 * install metadata, service-worker registration and the in-app install prompt
 * are injected in three places: into every app page by vite (pwa-head.mjs ->
 * vite.config.ts), into the published copy of the homepage (prepare-web.mjs),
 * and into the dev stream of the homepage (vite.config.ts dev middleware). All
 * three read this module so the snippet can never drift.
 *
 * Security note: the registration and the install prompt are EXTERNAL
 * same-origin scripts, so they satisfy the existing script-src 'self' policy
 * without touching hashes or nonces. The service worker script itself is
 * subject to worker-src, which falls back to script-src 'self' and therefore
 * also allows loading of the worker.
 */

const MANIFEST_LINK = '  <link rel="manifest" href="/manifest.webmanifest">\n';
const THEME_COLOR = '  <meta name="theme-color" content="#0a5350">\n';
const INSTALL_META =
  '  <meta name="mobile-web-app-capable" content="yes">\n' +
  '  <meta name="apple-mobile-web-app-capable" content="yes">\n' +
  '  <meta name="apple-mobile-web-app-status-bar-style" content="default">\n' +
  '  <meta name="apple-mobile-web-app-title" content="ICANPATH Academy">\n';
const TOUCH_ICON = '  <link rel="apple-touch-icon" href="/assets/img/brand/icon-192.png">\n';
const SW_SCRIPT = '  <script type="module" src="/register-sw.js"></script>\n';
const INSTALL_SCRIPT = '  <script src="/install-prompt.js" defer></script>\n';

/** Raw HTML, inserted verbatim just before `</head>`. */
export const PWA_HEAD_HTML =
  MANIFEST_LINK +
  THEME_COLOR +
  INSTALL_META +
  TOUCH_ICON +
  SW_SCRIPT +
  INSTALL_SCRIPT;

/** Vite tag array form, injected into every built app page. */
export const PWA_TAGS = [
  { tag: "link", attrs: { rel: "manifest", href: "/manifest.webmanifest" } },
  { tag: "meta", attrs: { name: "theme-color", content: "#0a5350" } },
  { tag: "meta", attrs: { name: "mobile-web-app-capable", content: "yes" } },
  { tag: "meta", attrs: { name: "apple-mobile-web-app-capable", content: "yes" } },
  {
    tag: "meta",
    attrs: { name: "apple-mobile-web-app-status-bar-style", content: "default" },
  },
  { tag: "meta", attrs: { name: "apple-mobile-web-app-title", content: "ICANPATH Academy" } },
  { tag: "link", attrs: { rel: "apple-touch-icon", href: "/assets/img/brand/icon-192.png" } },
  { tag: "script", attrs: { type: "module", src: "/register-sw.js" } },
  { tag: "script", attrs: { src: "/install-prompt.js", defer: true } },
];