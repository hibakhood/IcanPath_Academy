/**
 * Announcement authoring, which only an administrator has any path to: the
 * announcements policies are all gated on is_admin(), so this write is refused
 * for anyone else regardless of what the browser sends.
 */

import {
  allAnnouncements,
  createAnnouncement,
  deleteAnnouncement,
  updateAnnouncement,
} from "../api.ts";
import type { Announcement } from "../types.ts";
import { action, confirmAction, el, emptyState, field, fmtDateTime, input, loading, page, pill, select, setChildren, textarea, toast } from "../ui.ts";

void page(
  {
    role: "admin",
    title: "Announcements",
    base: "/admin",
    active: "/announcements/",
    subtitle: "Share updates with students",
  },
  async (content) => {
    content.append(loading("Loading…"));

    const announcements = await allAnnouncements();

    setChildren(content, 
      el("div", {class:"admin-page-heading"}, el("h1", {}, "Announcements"), el("p", {}, "Publish announcements for student notifications.")),
      createPanel(),
      el("div", { class: "section-head" }, el("h2", {}, "Announcement history")),
      announcements.length === 0
        ? emptyState("Nothing published yet", "Write the first announcement above.")
        : el("div", { class: "app-table-wrap" },
            el("table", { class: "app-table" },
              el("thead", {}, el("tr", {},
                el("th", {}, "Title"),
                el("th", {}, "Audience"),
                el("th", {}, "Status"),
                el("th", {}, "Published"),
                el("th", {}, "Actions"))),
              el("tbody", {}, ...announcements.map((row) => announcementRow(row))))),
    );
  },
);

function createPanel(): HTMLElement {
  const titleInput = input({ placeholder: "Term dates confirmed" });
  const bodyInput = textarea({ rows: "4", placeholder: "What do people need to know?" });
  const audienceSelect = select([
    { value: "students", label: "Students" },
    { value: "all", label: "Everyone (including students)" },
  ]);
  // This is the element the admin actually ticks; the submit handler reads it,
  // so it has to be the one that ends up in the form.
  const publishNow = el("input", { type: "checkbox", id: "publish-now", checked: true });

  const submit = el("button", { class: "btn btn--primary", type: "submit" }, "Create announcement");

  const form = el("form", { class: "app-form" },
    el("div", { class: "form-grid" },
      field("Title", titleInput, undefined, true),
      field("Message", bodyInput, undefined, true),
      field("Audience", audienceSelect, undefined, true),
      el("div", { class: "field" },
        el("label", { for: "publish-now" }, "Publish immediately"),
        publishNow,
        el("span", { class: "hint" }, "Leave this unchecked to save a draft. You can publish it later."))),
    el("div", { class: "btn-row" }, submit));

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const title = titleInput.value.trim();
    if (!title) return toast("Enter a title.", "err");

    submit.disabled = true;
    try {
      await createAnnouncement({
        title,
        body: bodyInput.value.trim() || null,
        audience: audienceSelect.value,
        status: publishNow.checked ? "published" : "draft",
        scheduled_for: null,
        // published_at is granted precisely so an admin can publish from the client.
        published_at: publishNow.checked ? new Date().toISOString() : null,
      });
      toast(publishNow.checked ? "Published." : "Saved as a draft.");
      window.location.reload();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not create the announcement.", "err");
      submit.disabled = false;
    }
  });

  return el("section", { class: "card" },
    el("div", { class: "card__body" },
      el("h2", { class: "card__title" }, "New announcement"),
      form));
}

function announcementRow(announcement: Announcement): HTMLElement {
  const publish = el("button", {
    class: "btn btn--sm", type: "button",
    onclick: action(async () => {
      if (!confirmAction(`Publish “${announcement.title}” to ${announcement.audience}?`)) return;
      await updateAnnouncement(announcement.id, {
        status: "published",
        published_at: new Date().toISOString(),
      });
      toast("Published.");
      window.location.reload();
    }),
  }, announcement.status === "published" ? "Republish" : "Publish now");

  return el("tr", {},
    el("td", {},
      el("strong", {}, announcement.title),
      announcement.body ? el("span", { class: "list__meta" }, announcement.body.slice(0, 120)) : null),
    el("td", {}, announcement.audience),
    el("td", {},
      pill(announcement.status,
        announcement.status === "published" ? "done" : announcement.status === "scheduled" ? "soon" : "default")),
    el("td", {}, fmtDateTime(announcement.published_at)),
    el("td", {},
      el("div", { class: "btn-row" },
        announcement.status !== "published" ? publish : null,
        el("button", {
          class: "btn btn--sm", type: "button",
          onclick: action(async () => {
            if (!confirmAction(`Delete “${announcement.title}”?`)) return;
            await deleteAnnouncement(announcement.id);
            toast("Deleted.");
            window.location.reload();
          }),
        }, "Delete"))));
}
