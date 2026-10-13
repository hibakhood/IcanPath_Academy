/*
 * ICANPATH Academy — in-app install prompt.
 *
 * Chrome, Edge, Samsung Internet and other Chromium browsers fire
 * `beforeinstallprompt` when the site is installable but no longer show a
 * prompt of their own, so this file captures that event and offers an explicit
 * "Install" button. iOS Safari has no such event at all, so it shows the
 * Share -> "Add to Home Screen" steps instead.
 *
 * Deliberately a plain, dependency-free script served same-origin so it runs
 * under the site's existing Content-Security-Policy (`script-src 'self'`). It
 * styles itself with an injected <style> element, which `style-src
 * 'unsafe-inline'` already permits. It stays hidden inside an already-installed
 * app and remembers a dismissal.
 *
 * Loaded through scripts/pwa-head.mjs, so it appears on the homepage and every
 * app page without editing a frozen file.
 */
(function () {
  "use strict";

  var DISMISSED = "icanpath.install.dismissed";
  var MARK = "pwa-install";
  var ICON = "/assets/img/brand/icon-192.png";

  var STYLE =
    "." + MARK + "{position:fixed;left:50%;bottom:calc(1rem + env(safe-area-inset-bottom,0px));transform:translateX(-50%);z-index:2147483000;" +
    "display:flex;align-items:center;gap:.75rem;width:min(30rem,calc(100vw - 2rem));padding:.75rem 1rem;" +
    "background:#fff;color:#0b2b2a;border:1px solid rgba(10,83,80,.16);border-radius:14px;" +
    "box-shadow:0 18px 40px -18px rgba(7,60,58,.55),0 4px 14px -8px rgba(7,60,58,.4);font-family:inherit}" +
    "." + MARK + "__icon{width:40px;height:40px;border-radius:10px;flex:0 0 auto;object-fit:contain}" +
    "." + MARK + "__text{display:flex;flex-direction:column;gap:.15rem;min-width:0;flex:1 1 auto}" +
    "." + MARK + "__text strong{font-size:.95rem;line-height:1.2}" +
    "." + MARK + "__hint{font-size:.8rem;line-height:1.3;color:#3d5b59}" +
    "." + MARK + "__action{flex:0 0 auto;border:0;cursor:pointer;background:#0a5350;color:#fff;font:inherit;font-weight:600;" +
    "font-size:.85rem;padding:.5rem .9rem;border-radius:10px;white-space:nowrap}" +
    "." + MARK + "__action:hover{background:#073c3a}" +
    "." + MARK + "__action:disabled{opacity:.7;cursor:default}" +
    "." + MARK + "__close{flex:0 0 auto;border:0;background:transparent;color:#5b7674;font-size:1.25rem;line-height:1;cursor:pointer;padding:.25rem .4rem;border-radius:8px}" +
    "." + MARK + "__close:hover{background:rgba(10,83,80,.08);color:#0a5350}" +
    "@media (max-width:30rem){." + MARK + "{left:1rem;right:1rem;transform:none;width:auto}}" +
    "@media (prefers-reduced-motion:no-preference){." + MARK + "{animation:" + MARK + "-in .3s ease-out}" +
    "@keyframes " + MARK + "-in{from{opacity:0}to{opacity:1}}}";

  function isStandalone() {
    return (
      (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) ||
      window.navigator.standalone === true
    );
  }

  function isIos() {
    var ua = window.navigator.userAgent || "";
    /* iPadOS 13+ reports itself as a Mac; the touch points give it away. */
    return /iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
  }

  function isDismissed() {
    try {
      return window.localStorage.getItem(DISMISSED) === "1";
    } catch {
      return false;
    }
  }

  function remember() {
    try {
      window.localStorage.setItem(DISMISSED, "1");
    } catch {
      /* Private mode: the prompt simply returns next visit. */
    }
  }

  if (isStandalone() || isDismissed()) return;

  var banner = null;

  function addStyle() {
    if (document.getElementById(MARK + "-style")) return;
    var node = document.createElement("style");
    node.id = MARK + "-style";
    node.textContent = STYLE;
    document.head.appendChild(node);
  }

  function remove() {
    if (banner && banner.parentNode) banner.parentNode.removeChild(banner);
    banner = null;
  }

  function show(options) {
    if (banner || !document.body) return;
    addStyle();

    var icon = document.createElement("img");
    icon.className = MARK + "__icon";
    icon.src = ICON;
    icon.alt = "";
    icon.width = 40;
    icon.height = 40;

    var title = document.createElement("strong");
    title.textContent = "Install ICANPATH Academy";

    var hint = document.createElement("span");
    hint.className = MARK + "__hint";
    hint.textContent = options.hint;

    var text = document.createElement("div");
    text.className = MARK + "__text";
    text.appendChild(title);
    text.appendChild(hint);

    banner = document.createElement("div");
    banner.className = MARK;
    banner.setAttribute("role", "complementary");
    banner.setAttribute("aria-label", "Install the ICANPATH Academy app");
    banner.appendChild(icon);
    banner.appendChild(text);

    if (options.action) {
      var button = document.createElement("button");
      button.type = "button";
      button.className = MARK + "__action";
      button.textContent = options.action;
      button.addEventListener("click", options.onAction);
      banner.appendChild(button);
    }

    var close = document.createElement("button");
    close.type = "button";
    close.className = MARK + "__close";
    close.setAttribute("aria-label", "Dismiss install prompt");
    close.innerHTML = "&times;";
    close.addEventListener("click", function () {
      remember();
      remove();
    });
    banner.appendChild(close);

    document.body.appendChild(banner);
  }

  function ready(fn) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", fn, { once: true });
    } else {
      fn();
    }
  }

  if (isIos()) {
    ready(function () {
      show({ hint: "Tap Share, then choose \u201CAdd to Home Screen\u201D." });
    });
    return;
  }

  window.addEventListener("beforeinstallprompt", function (event) {
    /* Stop the browser's own mini-infobar so ours is the only prompt shown. */
    event.preventDefault();
    var prompt = event;
    ready(function () {
      show({
        hint: "Add it to your home screen for full-screen access.",
        action: "Install",
        onAction: function () {
          var button = banner && banner.querySelector("." + MARK + "__action");
          if (button) {
            button.disabled = true;
            button.textContent = "Installing\u2026";
          }
          prompt.prompt();
          Promise.resolve(prompt.userChoice).then(
            function (choice) {
              if (choice && choice.outcome === "accepted") remember();
              remove();
            },
            function () {
              remove();
            },
          );
        },
      });
    });
  });

  window.addEventListener("appinstalled", function () {
    remember();
    remove();
  });
})();
