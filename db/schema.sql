-- V1 schema: SQLite-compatible (migrates cleanly to Postgres later).
-- Rule: Google is the only authentication (google_id UNIQUE when present).
-- Rule: reg_number is an identifier (UNIQUE), never a password.
-- Rule: store course rows, not just GP. GP/CGPA are derived.
-- Rule: prevent duplicate (user_id, level, term) at the DB level.

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  full_name TEXT NOT NULL,
  department TEXT NOT NULL DEFAULT '',
  reg_number TEXT NOT NULL UNIQUE,
  google_id TEXT UNIQUE,
  google_email TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- NOTE: users_google_id_unique is created by the server migration in
-- server/src/db.ts AFTER ensuring the google columns exist, so upgrades
-- of databases created before Google linking never fail here.

CREATE TABLE IF NOT EXISTS semesters (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  level TEXT NOT NULL,
  term TEXT NOT NULL,
  entry_mode TEXT NOT NULL DEFAULT 'grade_only',
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
  units INTEGER NOT NULL CHECK (units > 0 AND units <= 20),
  grade TEXT NOT NULL,
  quality_points REAL NOT NULL,
  ca_score REAL,
  exam_score REAL
);
