/**
 * Announcements, read-only.
 *
 * Only an administrator writes these: the announcements policies are gated on
 * is_admin(), so a tutor has no insert, update or delete path at all. This screen
 * exists so a tutor can see what has been said rather than guessing.
 */

import { markAllNotificationsRead, myAnnouncements, notifications } from "../api.ts";
import { action, el, emptyState, fmtDateTime, loading, page, setChildren } from "../ui.ts";

void page(
  {
    role: "tutor",
    title: "Announcements",
    base: "/tutor",
    active: "/announcements/",
  },
  async (content) => {
    content.append(loading("Loading…"));

    const [announcements, alerts] = await Promise.all([myAnnouncements(), notifications()]);
    const unread = alerts.filter((n) => !n.read_at);

    setChildren(content, 
      el("div", { class: "section-head section-head--split" },
        el("h1", {}, "Notifications"),
        unread.length > 0
          ? el("button", {
              class: "btn btn--sm", type: "button",
              onclick: action(async () => {
                await markAllNotificationsRead();
                window.location.reload();
              }),
            }, `Mark all read (${unread.length})`)
          : el("span", { class: "app-course__meta" }, "No unread notifications")),

      alerts.length === 0
        ? emptyState("No notifications yet")
        : el("ul", { class: "list" },
            ...alerts.map((notification) =>
              el("li", { class: `list__row ${notification.read_at ? "" : "is-unread"}` },
                el("div", { class: "list__main" },
                  el("strong", {}, notification.title),
                  notification.body ? el("span", { class: "list__meta" }, notification.body) : null,
                  el("span", { class: "list__meta" }, fmtDateTime(notification.created_at)))))),

      el("div", { class: "section-head" }, el("h1", {}, "Announcements")),
      announcements.length === 0
        ? emptyState("No announcements")
        : el("div", { class: "app-grid app-grid--cards" },
            ...announcements.map((announcement) =>
              el("article", { class: "card" },
                el("div", { class: "card__body" },
                  el("h2", { class: "card__title" }, announcement.title),
                  el("p", { class: "app-course__meta" },
                    `For ${announcement.audience} · ${fmtDateTime(announcement.published_at)}`),
                  announcement.body ? el("p", {}, announcement.body) : null)))),

      el("p", { class: "app-course__meta" },
        "Announcements are written by the office. Contact them to post one."),
    );
  },
);