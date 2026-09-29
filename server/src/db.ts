import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
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
const sqlite = !isPostgres
  ? new DatabaseSync(rawUrl.replace(/^file:/, '') || join(here, '..', 'dev.db'))
  : null;

if (sqlite) {
  sqlite.exec('PRAGMA foreign_keys = ON');
  sqlite.exec(readFileSync(join(here, '..', '..', 'db', 'schema.sql'), 'utf8'));
  const cols = sqlite.prepare('PRAGMA table_info(users)').all() as Array<{ name: string }>;
  if (!cols.some((c) => c.name === 'department')) {
    sqlite.exec(`ALTER TABLE users ADD COLUMN department TEXT NOT NULL DEFAULT ''`);
  }
}

const sqliteDb: Db = {
  all: async <T>(sql: string, ...params: SqlParam[]): Promise<T[]> => {
    return sqlite!.prepare(sql).all(...params) as unknown as T[];
  },
  get: async <T>(sql: string, ...params: SqlParam[]): Promise<T | undefined> => {
    return sqlite!.prepare(sql).get(...params) as unknown as T | undefined;
  },
  run: async (sql: string, ...params: SqlParam[]): Promise<void> => {
    sqlite!.prepare(sql).run(...params);
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
    sqlite!.exec('BEGIN');
    try {
      const result = await fn(sqliteDb);
      sqlite!.exec('COMMIT');
      return result;
    } catch (err) {
      sqlite!.exec('ROLLBACK');
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
