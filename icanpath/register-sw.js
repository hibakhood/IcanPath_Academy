/*
 * Registers the ICANPATH Academy service worker.
 *
 * Kept out of line so it stays an external, same-origin module script: allowed
 * by the site's script-src 'self' policy without needing a hash or nonce.
 */
if ("serviceWorker" in navigator && window.isSecureContext) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
  });
}