// Test-only helper: inserts a legacy (pre-Google, password-era) student row
// with academic records intact and NO Google identity attached. Used by
// google.test.ts to prove the deliberate claim flow. Never routed, never
// deployed: run it explicitly with `npx tsx src/testSeed.ts <profile.json>`
// and a DATABASE_URL pointing at a scratch database. The JSON travels via
// file (not argv) so Windows shells cannot mangle the quoting.
//
// Example:
//   DATABASE_URL=file:/tmp/x.db npx tsx src/testSeed.ts /tmp/legacy.json
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { queryGet, queryRun } from './db.js';

async function main() {
  const input = JSON.parse(readFileSync(process.argv[2] ?? '', 'utf8')) as {
    fullName?: string;
    department?: string;
    regNumber?: string;
  };
  if (!input.fullName || !input.department || !input.regNumber) {
    console.error('testSeed needs { fullName, department, regNumber }');
    process.exit(1);
  }
  const existing = await queryGet<{ id: string }>('SELECT id FROM users WHERE reg_number = ?', input.regNumber);
  if (existing) {
    console.log(JSON.stringify({ id: existing.id, existed: true }));
    return;
  }
  const id = randomUUID();
  await queryRun(
    'INSERT INTO users (id, full_name, department, reg_number, google_id, google_email) VALUES (?, ?, ?, ?, NULL, NULL)',
    id,
    input.fullName,
    input.department,
    input.regNumber
  );
  console.log(JSON.stringify({ id, existed: false }));
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  }
);
