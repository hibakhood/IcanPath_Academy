import { el } from "./ui.ts";

/** Accept video URLs, never arbitrary iframe addresses. */
export function youtubeId(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    const host = url.hostname.toLowerCase();
    let id: string | null = null;
    if (host === "youtu.be") id = url.pathname.split("/")[1] ?? null;
    else if (["youtube.com", "www.youtube.com", "m.youtube.com", "youtube-nocookie.com", "www.youtube-nocookie.com"].includes(host)) {
      id = url.pathname === "/watch" ? url.searchParams.get("v") : /^\/(?:embed|shorts|live)\/([^/]+)/.exec(url.pathname)?.[1] ?? null;
    }
    return id && /^[\w-]{11}$/.test(id) ? id : null;
  } catch { return null; }
}

export function youtubePlayer(id: string, title: string): HTMLElement {
  return el("div", { class: "app-video" }, el("iframe", {
    src: `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?playsinline=1&rel=0`,
    title: `Recorded lesson: ${title}`, loading: "lazy", allowfullscreen: true,
    referrerpolicy: "strict-origin-when-cross-origin",
    allow: "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share",
  }));
}
