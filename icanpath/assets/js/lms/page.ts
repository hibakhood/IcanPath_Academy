/**
 * Page HTML template.
 *
 * Every authenticated page is the same document with a different data-page
 * value. Keeping one shape means the shell, the icon sprite and the asset
 * paths are written once, and a change to the navigation applies everywhere.
 *
 * `base` is the site root as the browser sees it. Pages sit at different
 * depths (`/student/dashboard/`), so asset paths are absolute to survive the
 * deep route without a server rewrite.
 */

// ican.css and app.css are imported rather than linked so the bundler emits
// them. Only app.css is imported: ican.css is frozen and must reach dist/ byte
// for byte via scripts/copy-site.mjs, so it is linked by absolute URL instead.
import "../../css/app.css";
import { ICONS } from "./icons.ts";

export interface PageMeta {
  title: string;
  /** Matches the `data-page` value a page module is registered under. */
  page: string;
  description?: string;
}

export function renderPage(meta: PageMeta): void {
  document.title = `${meta.title} | ICANPATH Academy`;

  const head = document.head;
  head.insertAdjacentHTML(
    "beforeend",
    `<meta name="description" content="${escapeAttr(meta.description ?? meta.title)}">
     <meta name="robots" content="noindex, nofollow">
     <meta name="theme-color" content="#0a5350">
     <link rel="icon" href="/favicon.svg" type="image/svg+xml">
     <link rel="preconnect" href="https://fonts.googleapis.com">
     <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
     <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap">
     <link rel="stylesheet" href="/assets/css/ican.css">`,
  );

  const sprite = ICONS.map(
    (i) => `<symbol id="icon-${i.id}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${i.path}</symbol>`,
  ).join("");

  document.body.className = "app";
  document.body.dataset.page = meta.page;
  document.body.innerHTML = `
    <svg width="0" height="0" aria-hidden="true" focusable="false" style="position:absolute">${sprite}</svg>
    <a class="skip-link" href="#main">Skip to main content</a>
    <div id="app"></div>
  `;
}

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}