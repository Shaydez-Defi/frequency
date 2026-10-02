import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from '@neondatabase/serverless';

const here = dirname(fileURLToPath(import.meta.url));
// Neon/Vercel Postgres exposes POSTGRES_URL; local dev and tests use file: URLs.
const rawUrl = process.env.DATABASE_URL ?? process.env.POSTGRES_URL ?? '';

export const isPostgres = rawUrl.startsWith('postgres');

export type SqlParam = string | number | null;

export interface Db {
  all<T>(sql: string, ...params: SqlParam[]): Promise<T[]>;
  get<T>(sql: string, ...params: SqlParam[]): Promise<T | undefined>;
  run(sql: string, ...params: SqlParam[]): Promise<void>;
}

interface PgClient {
  query(text: string, values?: unknown[]): Promise<{ rows: Array<Record<string, unknown>> }>;
  release(): void;
}

// ---- SQLite (local dev + tests): zero-config file database ----
// node:sqlite is imported lazily so serverless runtimes that lack the
// builtin never pay for it (the Postgres path never touches it).
interface SqliteDb {
  exec(sql: string): void;
  prepare(sql: string): {
    all(...params: unknown[]): Array<Record<string, unknown>>;
    get(...params: unknown[]): Record<string, unknown> | undefined;
    run(...params: unknown[]): void;
  };
}

let sqlite: SqliteDb | null = null;

async function sqliteConn(): Promise<SqliteDb> {
  if (!sqlite) {
    const { DatabaseSync } = await import('node:sqlite');
    const dbPath = rawUrl.replace(/^file:/, '') || join(here, '..', 'dev.db');
    const db = new DatabaseSync(dbPath) as unknown as SqliteDb;
    db.exec('PRAGMA foreign_keys = ON');
    db.exec(readFileSync(join(here, '..', '..', 'db', 'schema.sql'), 'utf8'));
    const cols = db.prepare('PRAGMA table_info(users)').all() as Array<{ name: string }>;
    const names = new Set(cols.map((c) => c.name));
    if (!names.has('department')) {
      db.exec(`ALTER TABLE users ADD COLUMN department TEXT NOT NULL DEFAULT ''`);
    }
    // Google identity linking: subject is unique when present (NULLs stay distinct).
    if (!names.has('google_id')) {
      db.exec(`ALTER TABLE users ADD COLUMN google_id TEXT`);
    }
    if (!names.has('google_email')) {
      db.exec(`ALTER TABLE users ADD COLUMN google_email TEXT`);
    }
    // Google-only auth: application passwords are gone. Records stay, secrets go.
    if (names.has('password_hash')) {
      db.exec(`ALTER TABLE users DROP COLUMN password_hash`);
    }
    if (names.has('has_password')) {
      db.exec(`ALTER TABLE users DROP COLUMN has_password`);
    }
    db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS users_google_id_unique ON users(google_id)`);
    const courseCols = db.prepare('PRAGMA table_info(courses)').all() as Array<{ name: string }>;
    const courseNames = new Set(courseCols.map((c) => c.name));
    // Optional CA/Exam scores: existing grade-only rows keep working untouched.
    if (!courseNames.has('ca_score')) {
      db.exec(`ALTER TABLE courses ADD COLUMN ca_score REAL`);
    }
    if (!courseNames.has('exam_score')) {
      db.exec(`ALTER TABLE courses ADD COLUMN exam_score REAL`);
    }
    sqlite = db;
  }
  return sqlite;
}

const sqliteDb: Db = {
  all: async <T>(sql: string, ...params: SqlParam[]): Promise<T[]> => {
    const db = await sqliteConn();
    return db.prepare(sql).all(...params) as unknown as T[];
  },
  get: async <T>(sql: string, ...params: SqlParam[]): Promise<T | undefined> => {
    const db = await sqliteConn();
    return db.prepare(sql).get(...params) as unknown as T | undefined;
  },
  run: async (sql: string, ...params: SqlParam[]): Promise<void> => {
    const db = await sqliteConn();
    db.prepare(sql).run(...params);
  }
};

// ---- Postgres (Vercel/Neon): pooled queries, one pool per isolate ----
function toPg(sql: string): string {
  let i = 0;
  return sql.replace(/\?/g, () => `$${(i += 1)}`);
}

function normalizeRow(row: Record<string, unknown>): Record<string, unknown> {
  for (const key of Object.keys(row)) {
    if (row[key] instanceof Date) row[key] = (row[key] as Date).toISOString();
  }
  return row;
}

let pool: InstanceType<typeof Pool> | null = null;
let pgReady: Promise<void> | null = null;

function pgPool(): InstanceType<typeof Pool> {
  if (!pool) pool = new Pool({ connectionString: rawUrl });
  return pool;
}

async function ensurePg(): Promise<void> {
  if (!pgReady) {
    pgReady = (async () => {
      const schema = readFileSync(join(here, '..', '..', 'db', 'schema.postgres.sql'), 'utf8');
      for (const statement of schema.split(';')) {
        if (statement.trim().length > 0) await pgPool().query(statement);
      }
      // Idempotent upgrades for databases created before Google linking existed,
      // plus removal of the retired application-password columns. Records stay.
      await pgPool().query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id TEXT`);
      await pgPool().query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS google_email TEXT`);
      await pgPool().query(`ALTER TABLE users DROP COLUMN IF EXISTS password_hash`);
      await pgPool().query(`ALTER TABLE users DROP COLUMN IF EXISTS has_password`);
      await pgPool().query(`CREATE UNIQUE INDEX IF NOT EXISTS users_google_id_unique ON users(google_id)`);
      await pgPool().query(`ALTER TABLE courses ADD COLUMN IF NOT EXISTS ca_score DOUBLE PRECISION`);
      await pgPool().query(`ALTER TABLE courses ADD COLUMN IF NOT EXISTS exam_score DOUBLE PRECISION`);
    })();
  }
  return pgReady;
}

const pgDb: Db = {
  all: async <T>(sql: string, ...params: SqlParam[]): Promise<T[]> => {
    await ensurePg();
    const { rows } = await pgPool().query(toPg(sql), params);
    return rows.map(normalizeRow) as unknown as T[];
  },
  get: async <T>(sql: string, ...params: SqlParam[]): Promise<T | undefined> => {
    await ensurePg();
    const { rows } = await pgPool().query(toPg(sql), params);
    return (rows.length > 0 ? normalizeRow(rows[0]) : undefined) as unknown as T | undefined;
  },
  run: async (sql: string, ...params: SqlParam[]): Promise<void> => {
    await ensurePg();
    await pgPool().query(toPg(sql), params);
  }
};

export const db: Db = isPostgres ? pgDb : sqliteDb;

export const queryAll = <T>(sql: string, ...params: SqlParam[]): Promise<T[]> => db.all<T>(sql, ...params);
export const queryGet = <T>(sql: string, ...params: SqlParam[]): Promise<T | undefined> =>
  db.get<T>(sql, ...params);
export const queryRun = (sql: string, ...params: SqlParam[]): Promise<void> => db.run(sql, ...params);

export async function withTransaction<T>(fn: (tx: Db) => Promise<T>): Promise<T> {
  if (!isPostgres) {
    const db = await sqliteConn();
    db.exec('BEGIN');
    try {
      const result = await fn(sqliteDb);
      db.exec('COMMIT');
      return result;
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }
  const client = (await pgPool().connect()) as unknown as PgClient;
  const tx: Db = {
    all: async <T>(sql: string, ...params: SqlParam[]): Promise<T[]> => {
      const { rows } = await client.query(toPg(sql), params);
      return rows.map(normalizeRow) as unknown as T[];
    },
    get: async <T>(sql: string, ...params: SqlParam[]): Promise<T | undefined> => {
      const { rows } = await client.query(toPg(sql), params);
      return (rows.length > 0 ? normalizeRow(rows[0]) : undefined) as unknown as T | undefined;
    },
    run: async (sql: string, ...params: SqlParam[]): Promise<void> => {
      await client.query(toPg(sql), params);
    }
  };
  await client.query('BEGIN');
  try {
    const result = await fn(tx);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
