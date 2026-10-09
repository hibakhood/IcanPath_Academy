> **Current implementation:** The original marketing website is now served by Next.js alongside the redesigned LMS dashboards. Start with `npm run dev:web`, or build with `npm run build:web`. See [architecture and migration setup](docs/ARCHITECTURE.md) and [stage report](docs/STAGE_REPORT.md). The historical notes below describe the original static/Vite implementation; migrations now extend through 0014, and learning links use protected URL metadata rather than pointer downloads.

# ICANPATH Academy — ICAN tutoring website and LMS

Two deliverables in one static repository:

1. **A marketing and enrolment site** — the nine frozen pages below. No build step, no
   framework, no bundler. Edit the HTML, reload.
2. **A Supabase-backed LMS** — student, tutor and admin dashboards under `app/`, served by
   Vite and authorised entirely by Postgres.

The two are kept apart on purpose. The marketing pages are byte-frozen and copied verbatim
into `dist/`; only `app/` is ever a bundler input.

---

## Quick start

```bash
npm install
cp .env.example .env          # add real credentials, or leave preview on
npm run dev                   # http://localhost:5173
```

Review the dashboards **without** a Supabase project by enabling preview mode in `.env`:

```bash
VITE_PREVIEW_MODE=1
```

Preview mode is guarded in code (`assets/js/lms/config.ts`): it force-disables itself when
real credentials are present, and when the page is not served from localhost. It is always
visibly badged in the UI. `/login/` also offers one-click persona entry.

The **Login** and **Register** buttons in the marketing nav open the matching LMS page in a
modal rather than navigating away, so a visitor does not lose the page they were reading. The
popup is a plain-JS shim (`assets/js/auth-modal.js`) because the frozen pages are copied to
`dist/` verbatim and never processed by the bundler; it frames the real `/login/`,
`/register/`, `/forgot-password/` and `/reset-password/` routes rather than duplicating the
forms. When a link inside the frame leaves those routes — a successful sign-in, or the preview
persona picker — the page takes over and the popup closes, so there is no way to get trapped
in it. It closes on Escape, on backdrop click and on its close button, traps Tab, and returns
focus to the button that opened it.

```bash
npm run build && npm run preview   # production build on http://localhost:4173
```

## Marketing pages (frozen)

| File | Purpose |
|---|---|
| `index.html` | Home — hero, how it works, course previews, testimonials, FAQ |
| `ican.html` | ICAN programmes: the three levels, papers, plans, what is included |
| `course.html` | Filterable catalogue of every paper |
| `course_details.html` | Single course: curriculum, tabs, reviews, enrolment sidebar |
| `pricing.html` | Plan comparison table and pricing FAQ |
| `contact.html` | Enquiry form, contact details, offices |
| `thank-you.html` | Form success page |
| `404.html` | Not found |
| `contact.php` | Server-side form handler |

Plus `robots.txt`, `sitemap.xml`, `favicon.svg`, `assets/css/ican.css` and
`assets/js/ican.js`.

These 14 files are recorded in `scripts/frozen.sha256`. `npm run verify:frozen` fails the
build if any of them changes. To change one on purpose, record why:

```bash
npm run verify:frozen -- --update --reason="what you changed and why"
```

That prints every file it is about to accept and stamps the reason into the manifest header.
Editing a hash by hand defeats the only guarantee this project has about the marketing site.

The header and mobile drawer carry **Login** and **Register** links into the LMS at
`/login/` and `/register/`. The old `Talk to us` and `Browse courses` calls to action were
removed from the nav, so `npm run test:frontend` asserts the nav intent on all eight pages —
the byte manifest alone would accept any future `--update` that put the old CTAs back.

Stack: Bootstrap 5.3.2 (grid, Collapse, Tab), `assets/css/ican.css` as the design system,
`assets/js/ican.js` as vanilla JS, Fraunces + Inter Tight. The original Eduleb template's
jQuery 1.12.4, Owl Carousel, WOW.js, Magnific Popup, SuperMarquee, inview, scroll-top,
Themify and Font Awesome 4 were all removed and replaced with platform APIs. Unused files
were moved to `_legacy/`, not deleted.

The header, mobile drawer, icon sprite and footer are duplicated across the frozen pages
rather than injected at runtime, so each page works straight off the filesystem with no
server and no JavaScript. **If you change one, change all.**

## LMS

### Routes

| Route | Who | File |
|---|---|---|
| `/login/`, `/register/`, `/forgot-password/`, `/reset-password/` | anyone | `assets/js/lms/pages/auth-*.ts` |
| `/pending/`, `/suspended/` | noticed | `notice-*.ts` |
| `/student/{dashboard,courses,course,lesson,live,quizzes,quiz,assignments,announcements,profile}/` | student | `student-*.ts` |
| `/tutor/{dashboard,courses,course,grading,live,announcements,profile}/` | tutor | `tutor-*.ts` |
| `/admin/{dashboard,review,users,courses,announcements,profile}/` | admin | `admin-*.ts` |

Page shells under `app/` are generated, not hand-edited:

```bash
npm run gen:pages      # rewrites app/**/index.html and removes flat prototypes
```

Detail pages take an id in the query string — `/student/lesson/?id=<uuid>`.

### Architecture

```
app/**/index.html      generated shells; one <script type="module"> each
assets/js/lms/
  config.ts            env + the preview-mode gate
  supabase.ts          client, unwrap(), friendlyError()
  types.ts             hand-maintained shapes mirroring the SQL
  api.ts               every read and write, one function each
  preview-data.ts      fixtures shaped like real rows
  auth.ts              session, guards, persona switcher
  ui.ts                el(), formatting, shell, toasts
  page.ts              the shared document shell
  pages/*.ts           one module per route
```

`api.ts` is the only module that talks to Supabase, and every function has a preview
branch and a real branch, so a screen cannot be developed against data the database would
refuse to return. `preview-data.ts` deliberately omits the columns the database withholds
from a student (`correct_answer` and friends) for the same reason.

### Security model

The browser session decides only *what to render*. Every read and write is authorised by
Postgres, so a forged or stale session can show the wrong screen but cannot read or change
anything.

- **RLS on all 19 tables.** A student's select on a quiz question physically cannot include
  `correct_answer`: the column is not in the grant, and a RPC
  (`manage_quiz_questions`) is the only way a tutor reads the answers back.
- **Column grants, not just row policies.** Inserts and updates name the columns a role may
  touch, which is why publication status cannot be set by a client update and has to go
  through `set_course_status()` or `submit_course_for_review()`.
- **`SECURITY DEFINER` functions** own the privileged transitions — marking, grading,
  enrolment, review decisions, and issuing signed URLs. They check the caller with
  `require_active_session()` and set `search_path`.
- **Private storage.** `lms-private` is not public. The client uploads small `<uuid>.url`
  pointer objects at paths shaped like
  `courses/<course_id>/materials/<material_id>.url`; a trigger validates the name, and
  `get_private_resource_url()` re-checks access before returning a URL that expires in
  five minutes. A student can only ever reach their own submission pointer.
- **Audit log.** Review decisions, grading and every issued URL are written to
  `audit_logs` from inside Postgres, so they cannot be skipped by a client that does not
  want them recorded.

Never put a `service_role` key in `.env` or any file that reaches a browser. There is no
server-side secret store here, which is exactly why the privileged work lives in SQL.

### Database setup

```bash
supabase link --project-ref <ref>
supabase db push                 # or: psql "$DATABASE_URL" -f supabase/migrations/0001_foundations.sql …
```

Migrations are ordered and idempotent:

| File | Contents |
|---|---|
| `0001_foundations.sql` | extensions, schemas, shared enums |
| `0002_tables.sql` | the 19 tables and their indexes |
| `0003_authorisation.sql` | `profiles` and role helpers |
| `0004_triggers.sql` | profile creation, audit, notifications |
| `0005_integrity.sql` | cross-row checks and constraints |
| `0006_functions.sql` | the `SECURITY DEFINER` API |
| `0007_rls.sql` | grants, policies, helper functions |
| `0008_storage.sql` | `lms-private` bucket, name validation, policies |
| `0009_bootstrap.sql` | the first admin |

Then create the first administrator. Sign up through `/register/` first — signup can only
ever produce a student or a pending tutor — then run this in the **Supabase SQL editor**,
as the project owner:

```sql
select public.bootstrap_admin('you@example.com');
```

The function refuses to run if an admin already exists, and it is revoked from `anon` and
`authenticated`, so no app code path can ever reach it.

### Demo data

`supabase/seed.sql` fills a project with enough real rows to walk every screen: an admin,
two active tutors and one awaiting approval, three students and one suspended, two
published courses and a draft, lessons, materials, quizzes with a graded attempt,
assignments with a graded and a pending submission, live classes, enrolments, progress,
announcements and notifications. Run it in the SQL editor as the project owner. It is safe
to run more than once.

| Email | Password | Lands on |
|---|---|---|
| `admin@charterpath.test` | `AdminPass!2026` | admin review queue, users |
| `tutor@charterpath.test` | `TutorPass!2026` | tutor dashboard, grading queue, course builder |
| `kofi@charterpath.test` | `TutorPass!2026` | second tutor, owns Business Statistics |
| `pending@charterpath.test` | `TutorPass!2026` | the pending notice |
| `student@charterpath.test` | `StudentPass!2026` | student dashboard, progress, a graded quiz |
| `bello@charterpath.test` | `StudentPass!2026` | an ungraded submission to grade |
| `cynthia@charterpath.test` | `StudentPass!2026` | a completed course |
| `suspended@charterpath.test` | `StudentPass!2026` | the suspended notice |

Throwaway credentials for local review — delete the accounts before the project carries
anything real.

The seed writes no privileged column. Courses are inserted as drafts because
`guard_course_insert()` forces that, then published by calling `submit_course_for_review()`
and `review_course()` — the same path the tutor and admin screens take, so the audit trail
and enrol notifications are produced by the database rather than faked.

## Testing

```bash
npm test                # everything below, in order (see the note on runtime)
npm run db:test         # 9 migrations parse and execute in PGlite
npm run test:security   # 66 assertions against the RLS and grant model
npm run test:workflows  # 55 assertions for the end-to-end journeys
npm run verify:frozen   # 14/14 marketing files unchanged
npm run test:frontend   # 56 assertions: routes, imports, CSS, grants, fixtures
npm run test:browser    # 31 assertions in real headless Chrome (skips without Chrome)
npm run test:real       # 7 assertions: every real api branch against the schema
npm run test:seed       # 26 assertions: the demo data, and what each role can read
npm run type-check      # tsc --noEmit
npm run lint            # eslint
```

`npm test` takes roughly fifteen minutes, almost all of it PGlite applying the migrations and
evaluating policies — `test:seed` alone is about eight minutes because it applies them twice to
prove the seed is idempotent. Run the individual scripts while working.

Three of these catch mistakes nothing else would.

`scripts/test-frontend.mjs` finds what a bundler will not: a route pointing at a missing
module, an unstyled class, a table the client selects but the migration never granted, an
RPC that does not exist, or a storage path whose shape the policy would reject.

`scripts/test-browser.mjs` drives the real site in headless Chrome over the DevTools Protocol,
with nothing to install. It exists because the two worst bugs found in this project were both
invisible to every other check: a page that returned HTTP 200 with a blank body, and a popup
that closed itself the instant it opened. It asserts that every dashboard actually builds
content, and that the auth popup opens, frames the real pages, and closes by button, backdrop
and Escape while restoring focus. Set `CHROME_PATH` if Chrome is not in a standard location;
it skips cleanly when no browser is found, so it is safe in `npm test` on a machine without one.
It needs `npm run dev` running.

`scripts/test-real-branches.mjs` runs the **non-preview** branches of `api.ts` in Node
against a recording stand-in for the Supabase client, then checks every request they built
against the migrations: each column exists, each insert and update payload is granted, each
RPC is called with the right arguments. This is the only local coverage of the code that
runs against a live database. `tsc` does not catch it — writing a column no role is
granted typechecks perfectly and then fails at runtime with a permission error.

`scripts/test-seed.mjs` applies `seed.sql` to a real Postgres engine, runs it twice to
prove it is idempotent, and then impersonates each role to assert the dashboards return
data and that the row-level rules still hold over the seeded rows.

PGlite is not Postgres with a network — it does not exercise Supabase Auth, JWTs, PostgREST,
Storage, or production grants. The first live run against a real project is still required.

### Development server notes

Two things about `vite.config.ts` are load-bearing and easy to undo by accident:

- **`root` is `app/`** so `app/student/dashboard/index.html` builds to
  `dist/student/dashboard/index.html`. That puts the LMS TypeScript *outside* the root, so
  `dev-assets` middleware answers `/assets/js/lms/**` with a 302 to the `/@fs/…` URL Vite
  will actually transform. Serving those files directly is the trap: the browser gets
  `application/octet-stream`, refuses the module on strict MIME checking, and every page
  renders blank with no error beyond a MIME warning.
- **`envDir` is the project root.** Vite defaults it to `root`, which is `app/`, so without
  it a `.env` in the project root is never read and every environment variable is silently
  `undefined` — which looks exactly like having no configuration.

`VITE_PREVIEW_MODE` accepts `1`, `true`, `yes` or `on`, case-insensitively. `.env.example`
uses `1`, so `1` has to work.

## Deployment

`npm run build` emits `dist/`:

```
dist/index.html, ican.html, …    frozen marketing pages, copied byte for byte
dist/assets/                     frozen images, Bootstrap, ican.css, ican.js, auth-modal.js
dist/{student,tutor,admin}/…     built page shells
dist/build/                      hashed JS and CSS from Vite
```

Serve `dist/` from the domain root — the dashboards use absolute `/student/…` paths.
`dist/` has no `index.html` conflict: the homepage is the marketing one.

## Before going live

Everything below is placeholder and must be replaced. Search for `PLACEHOLDER`.

**Branding and contact**

- [ ] Domain — `https://www.icanpath.example` appears in `robots.txt`, `sitemap.xml`,
      canonical tags, Open Graph tags and JSON-LD.
- [ ] `MAIL_TO` and `MAIL_FROM` at the top of `contact.php`. `MAIL_FROM` must be a domain
      you actually own, or SPF/DMARC will reject the mail.
- [ ] Phone `+234 800 000 0000` and `hello@icanpath.example` sitewide.
- [ ] Office addresses.
- [ ] `assets/img/logo.png` and the store badges still carry the original artwork.

**Content**

- [ ] `SITE.diets` in `assets/js/ican.js` — the exam diet dates and countdown.
- [ ] Course catalogue in `course.html`. Prices and paper lists are illustrative; confirm
      every figure.
- [ ] The sample video embed in `course_details.html` uses a placeholder video ID.
- [ ] Testimonials and statistics are placeholders.

**Server**

- [ ] `contact.php` requires **PHP 8.1+**.
- [ ] `mail()` is unreliable for transactional mail. Swap the send block for authenticated
      SMTP (PHPMailer or Symfony Mailer) before you depend on it.
- [ ] Configure a 404 handler to serve `404.html`.
- [ ] Serve over HTTPS.
- [ ] Set the real `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in the build
      environment, and confirm `config.preview` reports `false` on the deployed bundle.

## Licence

Original template: Eduleb by ThemeWagon. Content, courses and branding here are
placeholders for a fictional tutoring brand.