/**
 * The account page, shared by all three roles.
 *
 * Only name, phone and avatar are editable. Role and status are not in the
 * update grant, so this screen cannot offer them — a client asking for a role
 * change would have that column refused by Postgres.
 */

import { myApplication, myProfile, updateOwnProfile, uploadProfilePhoto } from "../api.ts";
import { config } from "../config.ts";
import { signOut } from "../auth.ts";
import { action, displayName, el, field, initials, input, loading, page, pill, setChildren, titleCase, toast } from "../ui.ts";

void page(
  {
    role: (window.location.pathname.split("/")[1] || "student") as "student" | "tutor" | "admin",
    title: "Your account",
    base: `/${window.location.pathname.split("/")[1]}`,
    active: "/profile/",
  },
  async (content, session) => {
    content.append(loading("Loading your account…"));

    const [profile, application] = await Promise.all([myProfile(), myApplication()]);
    const role = session.profile.role;

    const nameInput = input({ name: "full_name", value: profile?.full_name ?? "", autocomplete: "name" });
    const phoneInput = input({ name: "phone", type: "tel", value: profile?.phone ?? "", autocomplete: "tel" });
    const photoInput = input({ name: "avatar", type: "file", accept: "image/jpeg,image/png,image/webp" });
    const photoMessage = el("p", { class: "app-course__meta" }, "JPG, PNG or WebP · up to 5 MB");
    photoInput.addEventListener("change", action(async () => {
      const file = photoInput.files?.[0];
      if (!file) return;
      try {
        const url = await uploadProfilePhoto(file);
        const avatar = content.querySelector<HTMLElement>("[data-profile-avatar]");
        if (avatar) avatar.replaceChildren(el("img", { src: url, alt: "" }));
        photoMessage.textContent = config.preview ? "Your photo has been updated in this demo. It is not saved to your account." : "Profile photo updated.";
        photoInput.value = "";
      } catch (error) {
        toast(error instanceof Error ? error.message : "Could not upload photo.", "err");
      }
    }));

    const form = el("form", { class: "app-form" },
      el("div", { class: "form-grid" },
        field("Full name", nameInput, undefined, true),
        field("Phone", phoneInput, "Optional contact number.")),
      el("div", { class: "btn-row" },
        el("button", { class: "btn btn--primary", type: "submit" }, "Save changes")));

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const button = form.querySelector("button");
      if (button instanceof HTMLButtonElement) button.disabled = true;
      try {
        await updateOwnProfile({
          full_name: nameInput.value.trim(),
          phone: phoneInput.value.trim() || null,
          avatar_url: profile?.avatar_url ?? null,
        });
        toast("Account updated.");
        window.location.reload();
      } catch (error) {
        toast(error instanceof Error ? error.message : "Could not save.", "err");
        if (button instanceof HTMLButtonElement) button.disabled = false;
      }
    });

    setChildren(content, 
      el("header", { class: "app-account-head" },
        el("span", { class: "app-avatar__mark app-avatar__mark--lg", "data-profile-avatar": "" }, profile?.avatar_url?.startsWith("blob:") || profile?.avatar_url?.startsWith("https:") ? el("img", { src: profile.avatar_url, alt: "" }) : initials(profile?.full_name)),
        el("div", {},
          el("h1", {}, displayName(profile)),
          el("p", { class: "app-course__meta" },
            titleCase(role) +
            (profile?.level ? ` · ${profile.level} track` : "")))),

      profile?.status === "suspended" && profile.status_note
        ? el("div", { class: "app-notice app-notice--warn", role: "alert" },
            el("strong", {}, "Your account is suspended. "),
            profile.status_note)
        : null,

      role === "tutor" && application
        ? el("section", { class: "card" },
            el("div", { class: "card__body" },
              el("div", { class: "section-head section-head--split" },
                el("h2", { class: "card__title" }, "Tutor application"),
                pill(application.status, application.status === "approved" ? "done" : application.status === "rejected" ? "warn" : "soon")),
              application.headline ? el("p", {}, application.headline) : null,
              application.bio ? el("p", { class: "card__text" }, application.bio) : null,
              application.review_note ? el("p", { class: "app-course__meta" }, `Note: ${application.review_note}`) : null))
        : null,

      el("section", { class: "card" },
        el("div", { class: "card__body" },
          el("h2", { class: "card__title" }, "Your details"),
          field("Profile photo", photoInput, "JPG, PNG or WebP · up to 5 MB"),
          photoMessage,
          form)),

      el("section", { class: "card" },
        el("div", { class: "card__body" },
          el("h2", { class: "card__title" }, "Sign in details"),
          el("p", { class: "card__text" },
            config.preview
              ? "You are using sample data. Changes are not saved to the database."
              : "You are signed in securely."),
          el("div", { class: "btn-row" },
            el("button", {
              class: "btn",
              type: "button",
              onclick: action(async () => {
                await signOut();
                window.location.replace("/login/");
              }),
            }, "Sign out")))),
    );
  },
);
