/*
 * ICANPATH Academy service worker.
 *
 * Deliberately conservative: it only intercepts same-origin GET requests and
 * only caches the public app shell and the hashed, immutable build bundles.
 * Signed-in data always comes from Supabase at runtime and is never cached, so
 * no personal or enrolment data passes through this worker.
 *
 * Both worker-src and the registration script resolve to script-src 'self', so
 * this file loads under the site's existing Content-Security-Policy unchanged.
 */
const VERSION = "icanpath-shell-v1";

const SHELL = [
  "/",
  "/index.html",
  "/login/",
  "/login/index.html",
  "/manifest.webmanifest",
  "/register-sw.js",
  "/favicon.svg",
  "/assets/css/ican.css",
  "/assets/js/ican.js",
  "/assets/js/auth-modal.js",
  "/assets/bootstrap/css/bootstrap.min.css",
  "/assets/img/logo.png",
  "/assets/pwa/icon-192.png",
  "/assets/pwa/icon-512.png",
  "/assets/pwa/icon-maskable-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(VERSION);
      await Promise.allSettled(
        SHELL.map((url) => cache.add(new Request(url, { cache: "reload" }))),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key !== VERSION).map((key) => caches.delete(key)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    /* Network-first so pages are always fresh; fall back to the cached shell
       only when the network is actually unreachable. */
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request);
          if (response && response.ok) {
            const cache = await caches.open(VERSION);
            cache.put(request, response.clone());
          }
          return response;
        } catch {
          const cached = await caches.match(request);
          const fallback = await caches.match("/index.html");
          return cached || fallback || Response.error();
        }
      })(),
    );
    return;
  }

  /* Hashed build bundles and the frozen marketing assets are immutable, so
     serve them from cache instantly and refresh in the background. */
  const path = url.pathname;
  if (path.startsWith("/build/") || path.startsWith("/assets/")) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(VERSION);
        const cached = await cache.match(request);
        const network = fetch(request)
          .then((response) => {
            if (response && response.ok) cache.put(request, response.clone());
            return response;
          })
          .catch(() => cached);
        return cached || network;
      })(),
    );
  }
});