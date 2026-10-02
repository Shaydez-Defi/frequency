# API contract (V1, Google-only auth)

Base: `/api`. Cookies: `token` (HttpOnly, SameSite=Lax), `g_pending` (short-lived onboarding state).

## Auth (Google is the only method, no passwords anywhere)
- `GET /auth/google` -> 302 to Google (sets `g_state` CSRF cookie) | 302 to `/login?error=google_not_configured`
- `GET /auth/google/callback?code=&state=` -> 302 to `/dashboard` (linked login) | `/complete-profile` (new Google identity) | `/login?error=` on failure
- `GET /api/auth/google/pending` -> 200 { pending: { email, name } } | 401 (expired)
- `POST /auth/google/complete` { fullName, department, regNumber, claimExisting? } -> 201 { user } | 200 { user, claimed: true } (legacy claim) | 400 | 401 (expired `g_pending`) | 409 (taken reg-number, or `code: NEEDS_CLAIM` for legacy records)
- `GET /auth/me` -> 200 { user } | 401
- `PATCH /auth/profile` { fullName?, department? } -> 200 { user } | 400 | 401 (regNumber and Google email are immutable)
- `POST /auth/logout` -> 200

`googleId` (stable Google `sub`) is the link key, never the email. The verified
email is stored from the Google identity, never typed in. Legacy pre-Google
accounts keep their rows and semesters; their owner links them deliberately via
`claimExisting: true` during onboarding after an explicit on-screen confirmation.

## Semesters
- `GET /semesters` -> 200 { semesters: [...with courses], cgpa, totalUnits, totalPoints }
- `POST /semesters` { level, term, entryMode: 'grade_only' | 'scores', courses: [{ code, title?, units, grade, ca_score?, exam_score? }] } -> 201 { id, gp, totalUnits }
- `GET /semesters/:id` -> 200 { semester } | 401 | 404 (ownership-checked)
- `PUT /semesters/:id` { level, term, entryMode?, courses } -> 200 { id, gp, totalUnits } | 400 | 401 | 404 | 409
- `DELETE /semesters/:id` -> 200 | 401 | 404 (courses cascade)

Entry modes: chosen once at setup and stored per semester (`entryMode`, old rows read as `grade_only`).
`grade_only` drops stray scores; `scores` requires complete scores on every course.
Upgrading `grade_only` -> `scores` (Add Scores) recalculates and persists; downgrading is refused with 400.

Course readings include `ca_score`, `exam_score` (null when never entered), and
derived `total_score`. When both scores are present the server derives total,
grade, and points and ignores client-supplied grade/points; with neither, the
entered grade stands. Exactly one score -> 400. Ranges: CA 0-30, Exam 0-70.

Rules:
- `UNIQUE(user_id, level, term)` -> 409 on duplicate.
- Server recalculates GP from `shared/src/gradeScale.ts`. Client GP is preview only.
- CGPA = SUM(all quality_points) / SUM(all units). 0 units -> null (no divide by zero).
- Round to 2 decimals for display only.
