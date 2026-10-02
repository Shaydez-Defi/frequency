-- V1 schema for Postgres (Vercel Postgres / Neon).
-- Mirrors db/schema.sql. Same rules: reg_number UNIQUE identifier,
-- password_hash only, course rows always stored, UNIQUE(user_id, level, term).

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  full_name TEXT NOT NULL,
  department TEXT NOT NULL DEFAULT '',
  reg_number TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  google_id TEXT,
  google_email TEXT,
  has_password INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- NOTE: users_google_id_unique is created by the server migration in
-- server/src/db.ts AFTER ensuring the google columns exist, so upgrades
-- of databases created before Google linking never fail here.

CREATE TABLE IF NOT EXISTS semesters (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  level TEXT NOT NULL,
  term TEXT NOT NULL,
  total_units INTEGER NOT NULL,
  total_points DOUBLE PRECISION NOT NULL,
  gp DOUBLE PRECISION NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, level, term)
);

CREATE TABLE IF NOT EXISTS courses (
  id TEXT PRIMARY KEY,
  semester_id TEXT NOT NULL REFERENCES semesters(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  title TEXT,
  units INTEGER NOT NULL CHECK (units > 0 AND units <= 12),
  grade TEXT NOT NULL,
  quality_points DOUBLE PRECISION NOT NULL
);
