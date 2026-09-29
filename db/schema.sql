-- V1 schema: SQLite-compatible (migrates cleanly to Postgres later).
-- Rule: reg_number is an identifier (UNIQUE), never a password.
-- Rule: store password_hash only (bcrypt), never plaintext.
-- Rule: store course rows, not just GP. GP/CGPA are derived.
-- Rule: prevent duplicate (user_id, level, term) at the DB level.

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  full_name TEXT NOT NULL,
  department TEXT NOT NULL DEFAULT '',
  reg_number TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  google_id TEXT,
  google_email TEXT,
  has_password INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS users_google_id_unique ON users(google_id);

CREATE TABLE IF NOT EXISTS semesters (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  level TEXT NOT NULL,
  term TEXT NOT NULL,
  total_units INTEGER NOT NULL,
  total_points REAL NOT NULL,
  gp REAL NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (user_id, level, term)
);

CREATE TABLE IF NOT EXISTS courses (
  id TEXT PRIMARY KEY,
  semester_id TEXT NOT NULL REFERENCES semesters(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  title TEXT,
  units INTEGER NOT NULL CHECK (units > 0 AND units <= 12),
  grade TEXT NOT NULL,
  quality_points REAL NOT NULL
);
