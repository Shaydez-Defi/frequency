# Frequency - V1 (auth + dashboard + GP flow)

Frequency student tracker. Cream/deep-teal/orange mobile-first UI (430px shell,
widening to 640px on tablets and 780px on desktops),
TypeScript + React throughout.

## Current stack

- **client/**: Vite + React 18 + TypeScript + React Router 6 + Zod + one global
  `src/styles.css` (design tokens + mobile layer: safe-area insets, 16px inputs,
  sticky action bar, `prefers-reduced-motion` support). Screens in `src/screens/`,
  shared pieces in `src/components/` (`Icons`, `Bookshelf` hero, `ui` primitives).
- **server/**: Node 20+ + Express 4 + TypeScript (tsx) + built-in `node:sqlite`
  file DB -> Postgres later. Auth: bcryptjs + JWT in HttpOnly cookie.
- **shared/**: `src/gradeScale.ts` (configurable points) + `src/calc.ts` +
  `src/schemas.ts` + `src/classification.ts`, imported by both sides.
  The client math adapter (`client/src/lib/gpa.ts`) re-exports these, no duplicated logic.
- **db/schema.sql**: canonical schema. No ORM in V1.

## Data models

- `users(id, full_name, department, reg_number UNIQUE, password_hash, created_at)`
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

- Frontend: `/` `/login` `/register` `/dashboard` `/profile` `/semesters/:id`
  `/semesters/:id/edit` and the GP wizard `/semesters/new` (setup) → `courses`
  → `review` → `result`, guarded by auth + draft state.
- Backend: see `docs/api-contract.md`.

## Validation (Zod, server is authoritative)

- regNumber: trimmed, 3-32 chars, unique. Password: min 8 chars. Never store plaintext.
- course: code required, units int 1-12, grade must exist in scale, title optional.
- Duplicate `(user, level, term)` -> 409. Edit updates the record in place.
- Profile: name/department editable; regNumber immutable; password change verifies current + bcrypt-hashes the new one.

## V1 flow

Landing -> Register/Login -> Dashboard -> Calculate your GPA -> setup (count, level, semester)
-> course entry (running units, sticky review bar) -> review (Edit / Save GPA)
-> result (semester GPA + live CGPA) -> Dashboard. Semester rows open details with
per-course points, Edit (add/remove supported, server recalculates) and Delete
(confirmed, cascades, CGPA recalculated). Profile edits info, changes password, logs out.

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

- `npm test` (vitest: calc + validation + classification + profile/password units,
  API flows on scratch DBs: auth lifecycle, submit, read-one, edit, delete,
  duplicate 409, invalid 400, CGPA effects, per-student ownership)
