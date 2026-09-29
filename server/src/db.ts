import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const here = dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DATABASE_URL?.replace(/^file:/, '') ?? join(here, '..', 'dev.db');

export const db = new DatabaseSync(dbPath);
db.exec('PRAGMA foreign_keys = ON');

type SqlParam = string | number | null;

export function queryAll<T>(sql: string, ...params: SqlParam[]): T[] {
  return db.prepare(sql).all(...params) as unknown as T[];
}

export function queryGet<T>(sql: string, ...params: SqlParam[]): T | undefined {
  return db.prepare(sql).get(...params) as unknown as T | undefined;
}

export function queryRun(sql: string, ...params: SqlParam[]): void {
  db.prepare(sql).run(...params);
}

const schemaPath = join(here, '..', '..', 'db', 'schema.sql');
const schema = readFileSync(schemaPath, 'utf8');
db.exec(schema);

// Backfill older DBs created before department existed.
const cols = queryAll<{ name: string }>(`PRAGMA table_info(users)`);
if (!cols.some((c) => c.name === 'department')) {
  db.exec(`ALTER TABLE users ADD COLUMN department TEXT NOT NULL DEFAULT ''`);
}
