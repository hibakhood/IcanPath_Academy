/**
 * Announcements plus the notification centre.
 *
 * Two separate things that read alike to a person: announcements are
 * broadcast by an administrator, notifications are addressed to this account.
 */

import { markAllNotificationsRead, markNotificationRead, myAnnouncements, notifications } from "../api.ts";
import { action, el, emptyState, fmtDateTime, loading, page, setChildren } from "../ui.ts";

void page(
  {
    role: "student",
    title: "Announcements",
    base: "/student",
    active: "/announcements/",
    subtitle: "Notices from the office and your notifications",
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
              class: "btn btn--sm",
              type: "button",
              onclick: action(async () => {
                await markAllNotificationsRead();
                window.location.reload();
              }),
            }, `Mark all read (${unread.length})`)
          : el("span", { class: "app-course__meta" }, "No unread notifications")),

      alerts.length === 0
        ? emptyState("No notifications yet")
        : el("ul", { class: "list" },
            ...alerts.map((notification) => {
              const row = el("li", { class: `list__row ${notification.read_at ? "" : "is-unread"}` },
                el("div", { class: "list__main" },
                  el("strong", {}, notification.title),
                  notification.body ? el("span", { class: "list__meta" }, notification.body) : null,
                  el("span", { class: "list__meta" }, fmtDateTime(notification.created_at))),
                el("div", { class: "list__aside" },
                  notification.read_at
                    ? null
                    : el("button", {
                        class: "btn btn--sm",
                        type: "button",
                        onclick: action(async () => {
                          await markNotificationRead(notification.id);
                          window.location.reload();
                        }),
                      }, "Mark as read"),
                  notification.link_path
                    ? el("a", { class: "btn btn--sm btn--ghost", href: notification.link_path }, "Open")
                    : null));
              return row;
            })),

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
    );
  },
);