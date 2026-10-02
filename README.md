# Frequency - V1 (Google-only auth + dashboard + GP flow)

Frequency student tracker. Cream/deep-teal/orange mobile-first UI (430px shell,
widening to 640px on tablets and 780px on desktops),
TypeScript + React throughout.

## Current stack

- **client/**: Vite + React 18 + TypeScript + React Router 6 + Zod + one global
  `src/styles.css` (design tokens + mobile layer: safe-area insets, 16px inputs,
  sticky action bar, `prefers-reduced-motion` support). Screens in `src/screens/`,
  shared pieces in `src/components/` (`Icons`, `Bookshelf` hero, `ui` primitives).
- **server/**: Node 20+ + Express 4 + TypeScript (tsx) + built-in `node:sqlite`
  file DB locally, Neon Postgres in production. Auth: Google OAuth only + JWT in HttpOnly cookie. No passwords anywhere.
- **shared/**: `src/gradeScale.ts` (configurable points) + `src/calc.ts` +
  `src/schemas.ts` + `src/classification.ts`, imported by both sides.
  The client math adapter (`client/src/lib/gpa.ts`) re-exports these, no duplicated logic.
- **db/schema.sql**: canonical schema. No ORM in V1.

## Data models

- `users(id, full_name, department, reg_number UNIQUE, google_id UNIQUE NULL, google_email NULL, created_at)`
- `semesters(id, user_id FK, level, term, total_units, total_points, gp, UNIQUE(user_id, level, term))`
- `courses(id, semester_id FK, code, title?, units, grade, quality_points)`

Relations: user 1-N semesters, semester 1-N courses. Course rows are always saved.
No seed or demo records: every number on screen comes from the API.

## Calculation

- `quality_points = units * gradePoint(grade)` where `gradePoint` comes from `shared/src/gradeScale.ts`.
- `GP = sum(quality_points) / sum(units)` per semester.
- `CGPA = sum(quality_points ALL semesters) / sum(units ALL semesters)`.
- Server recalculates on save; client preview is display-only. Guard `units = 0`. Round to 2dp for display.

## Routing

- Frontend: `/` `/login` `/complete-profile` `/dashboard` `/profile` `/semesters/:id`
  `/semesters/:id/edit` and the GP wizard `/semesters/new` (setup) → `courses`
  → `review` → `result`, guarded by auth + draft state. (`/register` redirects to `/login`.)
- Backend: see `docs/api-contract.md`.

## Authentication (Google only, no passwords)

- Landing and login show a single `Continue with Google`. The same button signs in
  returning students and onboards new ones. Backend runs the OAuth code flow,
  verifies the ID token server-side, and never trusts client-supplied IDs.
- First-time Google users land on `/complete-profile` to add name, department, and
  reg-number once. The Google subject (`sub`) is the link key, never the email;
  the verified email is stored from Google and shown read-only.
- Owner of a legacy (pre-Google) account types its registration number during
  onboarding, sees an explicit takeover warning, and confirms with a checkbox.
  Records stay on the same user row, so semesters are never orphaned.
- Profile shows name, department, reg-number, and Google email. No passwords, no
  reset flows, no disconnect (Google is the only method).
- Setup: set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` (see
  `.env.example`, values stay in Vercel env, never committed). Without them,
  `/api/auth/google` redirects back to login with `?error=google_not_configured`.

## Validation (Zod, server is authoritative)

- regNumber: trimmed, 3-32 chars, unique. No passwords exist in the system.
- course: code required, units int 1-12, grade must exist in scale, title optional.
- Duplicate `(user, level, term)` -> 409. Edit updates the record in place.
- Profile: name/department editable; regNumber and Google email immutable.

## V1 flow

Landing -> Continue with Google -> (new: Complete Profile) -> Dashboard -> Calculate your GPA -> setup (count, level, semester)
-> course entry (running units, sticky review bar) -> review (Edit / Save GPA)
-> result (semester GPA + live CGPA) -> Dashboard. Semester rows open details with
per-course points, Edit (add/remove supported, server recalculates) and Delete
(confirmed, cascades, CGPA recalculated). Profile edits name/department and logs out.
Courses optionally carry CA (0-30) and Exam (0-70) scores: grade-only records keep
working, adding both later derives total, grade, and points server-side.
Semester Details has a Print Result Sheet action rendering a clean A4 document
(student, courses, totals, GPA) via the browser print dialog.

## Run

- `npm install` (root, workspaces)
- `npm run dev:server` (port 5000, needs `JWT_SECRET` - see `.env.example`)
- `npm run dev:client` (port 5173, proxies /api)

## Deploy (Vercel)

- `vercel.json` builds the server (`tsc` emit) and client, serves `client/dist`,
  runs the Express app as a serverless function (`api/[[...all]].ts`), and falls
  back to `index.html` for app routes.
- Local dev and tests use SQLite (`file:` URL). Any `postgres` URL (Vercel
  Postgres provides `POSTGRES_URL`) switches the same queries to Neon Postgres,
  including transactional semester saves. Set `JWT_SECRET` in project env.

## Test

- `npm test` (vitest: calc + validation + classification + onboarding-schema units,
  Google API flows on scratch DBs: initiation, state guards, onboarding, legacy
  claim, sessions, ownership, retired-route 404s, plus submit, read-one, edit,
  delete, duplicate 409, invalid 400, CGPA effects, per-student ownership)
