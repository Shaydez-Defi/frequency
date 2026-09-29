# API contract (V1)

Base: `/api`. Cookies: `token` (HttpOnly, SameSite=Lax).

## Auth
- `POST /auth/register` { fullName, department, regNumber, password, confirmPassword } -> 201 { user }
- `POST /auth/login` { regNumber, password } -> 200 { user }
- `POST /auth/logout` -> 200
- `GET /auth/me` -> 200 { user } | 401
- `PATCH /auth/profile` { fullName?, department? } -> 200 { user } | 400 | 401 (regNumber is immutable)
- `POST /auth/password` { currentPassword, newPassword, confirmPassword } -> 200 | 400 | 401

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
