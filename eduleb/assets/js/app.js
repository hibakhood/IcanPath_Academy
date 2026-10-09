/* ==========================================================================
   ICANPATH Academy App — mock data + shell behaviour for the LMS prototype.
   Same vanilla-JS approach as assets/js/ican.js. No dependencies.
   MOCK ONLY: session lives in localStorage; nothing here is secure auth.
   ========================================================================== */

const APP_DATA = {
  courses: [
    { id: "s3-taxation", code: "S3", level: "Skills", title: "Advanced Taxation", plan: "Premium", progress: 68, next: "Loss relief and group relief, Saturday at 10:00 WAT", tutor: "Course tutor" },
    { id: "s1-reporting", code: "S1", level: "Skills", title: "Financial Reporting", plan: "Standard", progress: 42, next: "IFRS 16 lease measurement, Sunday at 14:00 WAT", tutor: "Course tutor" },
    { id: "f1-accounting", code: "F1", level: "Foundation", title: "Financial Accounting", plan: "Basic", progress: 85, next: "Trial balance clinic, Sat 12:00 WAT", tutor: "Course tutor" },
    { id: "p3-tax", code: "P3", level: "Professional", title: "Advanced Taxation", plan: "Premium", progress: 24, next: "Petroleum profits tax, Sun 16:00 WAT", tutor: "Course tutor" }
  ],
  liveClasses: [
    { id: "lc1", course: "S3 · Advanced Taxation", title: "Loss relief and group relief", when: "Sat 10:00 WAT", platform: "Zoom", state: "soon" },
    { id: "lc2", course: "F1 · Financial Accounting", title: "Trial balance clinic", when: "Sat 12:00 WAT", platform: "Google Meet", state: "soon" },
    { id: "lc3", course: "S1 · Financial Reporting", title: "IFRS 16 leases", when: "Sun 14:00 WAT", platform: "YouTube Live", state: "soon" },
    { id: "lc4", course: "P3 · Advanced Taxation", title: "Petroleum profits tax", when: "Sun 16:00 WAT", platform: "Zoom", state: "soon" }
  ],
  materials: [
    { id: "m1", course: "S3", title: "S3 study pack + Pathfinder questions", kind: "Google Drive", meta: "PDF · 212 pages" },
    { id: "m2", course: "S3", title: "Recorded lesson on loss relief", kind: "YouTube", meta: "Video · 48 min" },
    { id: "m3", course: "S1", title: "Recorded lesson on IFRS 16 leases", kind: "YouTube", meta: "Video · 36 min" },
    { id: "m4", course: "F1", title: "Trial balance workbook", kind: "Google Drive", meta: "Workbook · 64 pages" },
    { id: "m5", course: "P3", title: "Case notes on petroleum profits tax", kind: "Google Drive", meta: "Notes · 28 pages" }
  ],
  quizzes: [
    { id: "q1", course: "S3", title: "Loss relief quiz", meta: "10 questions · due Sun", state: "todo" },
    { id: "q2", course: "F1", title: "Trial balance quiz", meta: "8 questions · scored 7/8", state: "done" },
    { id: "q3", course: "S1", title: "Leases quiz", meta: "12 questions · due Wed", state: "todo" }
  ],
  assignments: [
    { id: "a1", course: "S3", title: "Group relief computation", meta: "Due Sun · awaiting marking", state: "submitted" },
    { id: "a2", course: "F1", title: "Final accounts from trial balance", meta: "Graded · 82%", state: "graded" },
    { id: "a3", course: "S1", title: "Lease liability schedule", meta: "Due Wed · not started", state: "todo" }
  ],
  announcements: [
    { id: "n1", title: "November diet timetable is out", meta: "Admin · 2 days ago", body: "Live classes move to weekends only in the final three weeks before the diet." },
    { id: "n2", title: "New S3 mock exam added", meta: "Tutor · 4 days ago", body: "A full mock with model answers is now attached to Advanced Taxation." },
    { id: "n3", title: "App maintenance on Sunday from 02:00 to 03:00 WAT", meta: "Admin · 1 week ago", body: "Recorded lessons stay available; live classes are unaffected." }
  ],
  users: [
    { name: "Ada Nwosu", role: "Student", detail: "Skills · Premium", status: "Active" },
    { name: "Tunde Bakare", role: "Student", detail: "Foundation · Basic", status: "Active" },
    { name: "Course tutor", role: "Tutor", detail: "Taxation · 4 courses", status: "Active" },
    { name: "Administrator", role: "Admin", detail: "Admissions", status: "Active" },
    { name: "Chiamaka Eze", role: "Student", detail: "Professional · Premium", status: "Invited" }
  ],
  gradingQueue: [
    { student: "Ada Nwosu", item: "S3 · Group relief computation", submitted: "2 days ago", status: "Pending" },
    { student: "Tunde Bakare", item: "F1 · Bank reconciliation", submitted: "3 days ago", status: "Pending" },
    { student: "Chiamaka Eze", item: "P3 · PPT case", submitted: "5 days ago", status: "Pending" }
  ]
};

const SESSION_KEY = "charterpath.session.v1";

const AppSession = {
  get() {
    try { return JSON.parse(localStorage.getItem(SESSION_KEY) || "null"); }
    catch { return null; }
  },
  set(session) { localStorage.setItem(SESSION_KEY, JSON.stringify(session)); },
  clear() { localStorage.removeItem(SESSION_KEY); }
};

// Self-booting: registers its own DOMContentLoaded listener, so the result is
// not assigned to anything.
(() => {
  const dashboardFor = (role) =>
    role === "tutor" ? "tutor.html" : role === "admin" ? "admin.html" : "student.html";

  const initMenu = () => {
    const btn = document.querySelector("[data-app-menu]");
    const side = document.querySelector(".app-side");
    const scrim = document.querySelector("[data-app-scrim]");
    if (!btn || !side) return;
    const close = () => { side.classList.remove("is-open"); scrim?.classList.remove("is-open"); };
    btn.addEventListener("click", () => {
      const open = side.classList.toggle("is-open");
      scrim?.classList.toggle("is-open", open);
    });
    scrim?.addEventListener("click", close);
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
  };

  const initSessionBadge = (fallbackRole) => {
    const session = AppSession.get();
    const role = session?.role || fallbackRole || null;
    document.querySelectorAll("[data-session-role]").forEach(el => {
      el.textContent = role ? role[0].toUpperCase() + role.slice(1) : "Preview";
    });
    document.querySelectorAll("[data-session-name]").forEach(el => {
      el.textContent = session?.name || (role ? `Demo ${role}` : "Guest preview");
    });
    document.querySelectorAll("[data-session-mark]").forEach(el => {
      const name = session?.name || role || "G";
      el.textContent = name.trim()[0].toUpperCase();
    });
    const notice = document.querySelector("[data-auth-notice]");
    if (notice && !session) notice.hidden = false;
    document.querySelectorAll("[data-logout]").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        AppSession.clear();
        location.href = "login.html";
      });
    });
  };

  const initNav = () => {
    const links = Array.from(document.querySelectorAll(".app-nav a[href^='#']"));
    if (!links.length) return;
    const mark = () => {
      const hash = location.hash || links[0].getAttribute("href");
      links.forEach(a => a.classList.toggle("is-active", a.getAttribute("href") === hash));
    };
    window.addEventListener("hashchange", mark);
    mark();
  };

  /* ---------- list renderers (mock data -> existing brand components) ------ */
  const pill = (text, kind) => `<span class="pill pill--${kind}">${text}</span>`;

  const item = (icon, title, meta, action) => `
    <li>
      <svg class="ic" aria-hidden="true"><use href="#${icon}"></use></svg>
      <div><div class="list__title">${title}</div><div class="list__meta">${meta}</div></div>
      ${action ? `<span class="list__action">${action}</span>` : ""}
    </li>`;

  const render = () => {
    document.querySelectorAll("[data-list]").forEach(el => {
      const kind = el.dataset.list;
      const D = APP_DATA;
      if (kind === "live") {
        el.innerHTML = D.liveClasses.map(c =>
          item("icon-video", `${c.title}`, `${c.course} · ${c.when} · ${c.platform}`,
            `<a class="btn btn--primary btn--sm" href="#">Join</a>`)).join("");
      }
      if (kind === "materials") {
        el.innerHTML = D.materials.map(m =>
          item("icon-file", `${m.title}`, `${m.course} · ${m.kind} · ${m.meta}`,
            `<a class="btn btn--ghost btn--sm" href="#">Open</a>`)).join("");
      }
      if (kind === "quizzes") {
        el.innerHTML = D.quizzes.map(q =>
          item("icon-check-circle", `${q.title}`, `${q.course} · ${q.meta}`,
            q.state === "done"
              ? pill("Completed", "done")
              : `<a class="btn btn--primary btn--sm" href="#">Start</a>`)).join("");
      }
      if (kind === "assignments") {
        const label = { todo: ["To do", "soon"], submitted: ["Submitted", ""], graded: ["Graded", "done"] };
        el.innerHTML = D.assignments.map(a => {
          const [t, k] = label[a.state] || ["To do", "soon"];
          return item("icon-edit", `${a.title}`, `${a.course} · ${a.meta}`, pill(t, k));
        }).join("");
      }
      if (kind === "announcements") {
        el.innerHTML = D.announcements.map(n =>
          item("icon-bell", `${n.title}`, `${n.meta}. ${n.body}`, "")).join("");
      }
      if (kind === "courses") {
        el.innerHTML = D.courses.map(c => `
          <li>
            <svg class="ic" aria-hidden="true"><use href="#icon-layers"></use></svg>
            <div style="flex:1;min-width:0">
              <div class="list__title">${c.code} · ${c.title}</div>
              <div class="list__meta">${c.level} · ${c.plan} plan · Next: ${c.next}</div>
              <div class="progress" role="progressbar" aria-valuenow="${c.progress}" aria-valuemin="0" aria-valuemax="100" aria-label="${c.title} progress" style="margin-top:.5rem">
                <span style="width:${c.progress}%"></span>
              </div>
            </div>
            <span class="list__action">${pill(`${c.progress}%`, c.progress > 60 ? "done" : "soon")}</span>
          </li>`).join("");
      }
      if (kind === "grading") {
        el.innerHTML = D.gradingQueue.map(g =>
          item("icon-edit", `${g.item}`, `${g.student} · submitted ${g.submitted}`,
            `<a class="btn btn--primary btn--sm" href="#">Grade</a>`)).join("");
      }
      if (kind === "users") {
        el.innerHTML = D.users.map(u =>
          `<tr><td>${u.name}</td><td>${u.role}</td><td>${u.detail}</td><td>${pill(u.status, u.status === "Active" ? "done" : "soon")}</td></tr>`).join("");
      }
    });
  };

  const initAuthForms = () => {
    const form = document.querySelector("[data-auth-form]");
    if (!form) return;
    const roleInput = form.querySelector("[data-role-input]");
    form.querySelectorAll("[data-role-option]").forEach(btn => {
      btn.addEventListener("click", () => {
        form.querySelectorAll("[data-role-option]").forEach(b => b.classList.remove("is-selected"));
        btn.classList.add("is-selected");
        if (roleInput) roleInput.value = btn.dataset.roleOption;
      });
    });
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const data = new FormData(form);
      const role = (data.get("role") || "student").toString();
      const name = (data.get("name") || data.get("email") || "Demo user").toString().split("@")[0];
      AppSession.set({ role, name: name || `Demo ${role}`, at: new Date().toISOString() });
      const next = new URLSearchParams(location.search).get("next");
      location.href = next || dashboardFor(role);
    });
  };

  const initComposer = () => {
    /* Tutor/admin announcement composer: posts straight into the mock feed. */
    document.querySelectorAll("[data-announce-form]").forEach(form => {
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        const title = form.querySelector("[name='title']");
        const body = form.querySelector("[name='body']");
        if (!title || !title.value.trim()) return;
        APP_DATA.announcements.unshift({
          id: "n" + Date.now(),
          title: title.value.trim(),
          meta: "You · just now",
          body: (body && body.value.trim()) || "—"
        });
        render();
        form.reset();
      });
    });
  };

  const boot = () => {
    initMenu();
    initNav();
    render();
    initAuthForms();
    initComposer();
    initSessionBadge(document.body.dataset.appRole || null);
  };

  document.addEventListener("DOMContentLoaded", boot, { once: true });
  return { dashboardFor };
})();
