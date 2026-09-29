# API contract (V1)

Base: `/api`. Cookies: `token` (HttpOnly, SameSite=Lax).

## Auth
- `POST /auth/register` { fullName, department, regNumber, password, confirmPassword } -> 201 { user }
- `POST /auth/login` { regNumber, password } -> 200 { user }
- `POST /auth/logout` -> 200
- `GET /auth/me` -> 200 { user } | 401
- `PATCH /auth/profile` { fullName?, department? } -> 200 { user } | 400 | 401 (regNumber is immutable)
- `POST /auth/password` { currentPassword, newPassword, confirmPassword } -> 200 | 400 | 401
- `POST /auth/password/setup` { newPassword, confirmPassword } -> 200 | 400 | 401 (first password for Google-created accounts only)
- `GET /auth/google?intent=login|link` -> 302 to Google (sets `g_state` + `g_intent` cookies) | 302 to `/login?error=google_not_configured`
- `GET /auth/google/callback?code=&state=` -> 302 to `/dashboard` (linked login) | `/complete-profile` (new Google identity) | `/profile?linked=1` (link flow) | `/login?error=` on failure
- `POST /auth/google/complete` { fullName, department, regNumber } -> 201 { user } | 400 | 401 (expired `g_pending`) | 409 (reg-number or Google sub taken)
- `POST /auth/google/disconnect` -> 200 | 400 (none linked) | 409 (no password set yet)

`regNumber` is an identifier only. Server hashes password with bcrypt
(cost 12) into `users.password_hash`. Never returns hash.

## Semesters
- `GET /semesters` -> 200 { semesters: [...with courses], cgpa, totalUnits, totalPoints }
- `POST /semesters` { level, term, courses: [{ code, title?, units, grade }] } -> 201 { id, gp, totalUnits }
- `GET /semesters/:id` -> 200 { semester } | 401 | 404 (ownership-checked)
- `PUT /semesters/:id` { level, term, courses } -> 200 { id, gp, totalUnits } | 400 | 401 | 404 | 409
- `DELETE /semesters/:id` -> 200 | 401 | 404 (courses cascade)

Rules:
- `UNIQUE(user_id, level, term)` -> 409 on duplicate.
- Server recalculates GP from `shared/src/gradeScale.ts`. Client GP is preview only.
- CGPA = SUM(all quality_points) / SUM(all units). 0 units -> null (no divide by zero).
- Round to 2 decimals for display only.
