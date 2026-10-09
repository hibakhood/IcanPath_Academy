/**
 * Barrel for the auth pages, which render outside the dashboard shell and so do
 * not need the session-aware helpers in ui.ts.
 */

export { renderPage } from "./page.ts";
export { el, field, input, textarea, select, toast, action, confirmAction } from "./ui.ts";