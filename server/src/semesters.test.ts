import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { createServer } from 'node:net';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

// Spawns the real server (tsx) on a scratch DB instead of importing
// node:sqlite through vite-node, which cannot resolve that builtin.
const here = dirname(fileURLToPath(import.meta.url));

let base = '';

let child: ChildProcess | null = null;
let dir = '';
const jars: Record<string, string> = { default: '' };

async function api(path: string, options: RequestInit = {}, jar = 'default') {
  const res = await fetch(base + path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(jars[jar] ? { Cookie: jars[jar] } : {}),
      ...(options.headers ?? {})
    }
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  const setCookies = res.headers.getSetCookie?.() ?? [];
  const token = setCookies.find((c) => c.startsWith('token='));
  if (token) jars[jar] = token.split(';')[0];
  if (path === '/api/auth/logout' && res.ok) jars[jar] = '';
  return { status: res.status, body };
}

async function waitForHealth(): Promise<void> {
  const deadline = Date.now() + 25000;
  for (;;) {
    try {
      const res = await fetch(`${base}/api/health`);
      if (res.ok) return;
    } catch {
      // not up yet
    }
    if (Date.now() > deadline) throw new Error('test server did not start');
    await new Promise((r) => setTimeout(r, 300));
  }
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const port = (probe.address() as AddressInfo).port;
      probe.close(() => resolve(port));
    });
  });
}

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'cgpa-test-'));
  const port = await freePort();
  base = `http://127.0.0.1:${port}`;
  child = spawn('npx tsx src/index.ts', {
    cwd: here,
    shell: true,
    env: {
      ...process.env,
      PORT: String(port),
      JWT_SECRET: 'test-secret',
      DATABASE_URL: `file:${join(dir, 'test.db')}`
    },
    stdio: 'ignore'
  });
  await waitForHealth();
});

function waitForExit(p: ChildProcess): Promise<void> {
  return new Promise((resolve) => {
    if (p.exitCode !== null) return resolve();
    const timer = setTimeout(resolve, 10000);
    p.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

// On Windows, killing the shell only stops cmd.exe and can orphan the real
// server, which keeps the temp DB locked. Kill the whole tree instead.
async function killTree(p: ChildProcess): Promise<void> {
  if (process.platform === 'win32' && p.pid) {
    await new Promise<void>((resolve) => {
      const killer = spawn('taskkill', ['/pid', String(p.pid), '/T', '/F'], { stdio: 'ignore' });
      killer.on('exit', () => resolve());
      killer.on('error', () => resolve());
    });
  } else {
    p.kill();
  }
  await waitForExit(p);
}

afterAll(async () => {
  if (child) await killTree(child);
  child = null;
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // Best effort: a locked temp file must never fail the suite.
  }
});

describe('semester submission flow', () => {
  test('registers a student for the flow', async () => {
    const r = await api('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        fullName: 'Flow Student',
        department: 'Agric Economics',
        regNumber: 'TST/FLOW01',
        password: 'password1234',
        confirmPassword: 'password1234'
      })
    });
    expect(r.status).toBe(201);
  });

  test('rejects unauthenticated semester reads', async () => {
    const saved = jars.default;
    jars.default = '';
    const r = await api('/api/semesters');
    expect(r.status).toBe(401);
    jars.default = saved;
  });

  test('saves a semester and returns the server-calculated GP', async () => {
    const r = await api('/api/semesters', {
      method: 'POST',
      body: JSON.stringify({
        level: '100',
        term: 'First Semester',
        courses: [
          { code: 'CSC 101', units: 3, grade: 'A' },
          { code: 'MTH 111', units: 3, grade: 'B' }
        ]
      })
    });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ gp: 4.5, totalUnits: 6 });
  });

  test('stores course rows, not just the GP', async () => {
    const r = await api('/api/semesters');
    expect(r.status).toBe(200);
    const semesters = r.body.semesters as Array<{ courses: unknown[] }>;
    expect(semesters).toHaveLength(1);
    expect(semesters[0].courses).toHaveLength(2);
    expect(r.body.cgpa).toBeCloseTo(4.5, 10);
  });

  test('rejects a duplicate level and semester', async () => {
    const r = await api('/api/semesters', {
      method: 'POST',
      body: JSON.stringify({
        level: '100',
        term: 'First Semester',
        courses: [{ code: 'CSC 102', units: 2, grade: 'C' }]
      })
    });
    expect(r.status).toBe(409);
  });

  test('rejects invalid course input without saving', async () => {
    const bad = await api('/api/semesters', {
      method: 'POST',
      body: JSON.stringify({
        level: '100',
        term: 'Second Semester',
        courses: [{ code: '', units: 0, grade: 'Z' }]
      })
    });
    expect(bad.status).toBe(400);
    const after = await api('/api/semesters');
    expect(after.body.semesters as unknown[]).toHaveLength(1);
  });

  test('folds a second semester into the cumulative CGPA', async () => {
    const r = await api('/api/semesters', {
      method: 'POST',
      body: JSON.stringify({
        level: '100',
        term: 'Second Semester',
        courses: [{ code: 'CSC 102', units: 3, grade: 'A' }]
      })
    });
    expect(r.status).toBe(201);
    const after = await api('/api/semesters');
    expect(after.body.semesters as unknown[]).toHaveLength(2);
    expect(after.body.cgpa).toBeCloseTo(42 / 9, 10);
    expect(after.body.totalUnits).toBe(9);
  });

  test('returns the complete record the review screen shows', async () => {
    const r = await api('/api/semesters');
    expect(r.status).toBe(200);
    const semesters = r.body.semesters as Array<{
      level: string;
      term: string;
      totalUnits: number;
      totalPoints: number;
      gp: number;
      courses: Array<{ code: string; title: string | null; units: number; grade: string; quality_points: number }>;
    }>;
    const first = semesters.find((s) => s.level === '100' && s.term === 'First Semester');
    expect(first).toMatchObject({ totalUnits: 6, totalPoints: 27, gp: 4.5 });
    expect(first?.courses).toHaveLength(2);
    expect(first?.courses[0]).toMatchObject({ code: 'CSC 101', units: 3, grade: 'A', quality_points: 15 });
  });

  test('rejects malformed payloads without saving', async () => {
    const before = await api('/api/semesters');
    const shapes = [
      { level: '200', term: 'First Semester' },
      { level: '200', term: 'First Semester', courses: 'not-an-array' },
      { level: '200', term: 'First Semester', courses: [{ code: 'CSC 201', units: 'three', grade: 'A' }] },
      'not-an-object'
    ];
    for (const shape of shapes) {
      const r = await api('/api/semesters', { method: 'POST', body: JSON.stringify(shape) });
      expect(r.status).toBe(400);
    }
    const after = await api('/api/semesters');
    expect((after.body.semesters as unknown[]).length).toBe((before.body.semesters as unknown[]).length);
  });

  test('keeps each student’s semesters private', async () => {
    const reg = await api(
      '/api/auth/register',
      {
        method: 'POST',
        body: JSON.stringify({
          fullName: 'Second Student',
          department: 'Crop Science',
          regNumber: 'TST/FLOW02',
          password: 'password1234',
          confirmPassword: 'password1234'
        })
      },
      'second'
    );
    expect(reg.status).toBe(201);
    // A fresh student starts with no records, even though another exists.
    const empty = await api('/api/semesters', {}, 'second');
    expect(empty.status).toBe(200);
    expect(empty.body.semesters as unknown[]).toHaveLength(0);
    expect(empty.body.cgpa).toBeNull();
    // Same level and term is fine for a different student (no false duplicate).
    const own = await api(
      '/api/semesters',
      {
        method: 'POST',
        body: JSON.stringify({
          level: '100',
          term: 'First Semester',
          courses: [{ code: 'AEC 101', units: 2, grade: 'B' }]
        })
      },
      'second'
    );
    expect(own.status).toBe(201);
    // The first student still sees only their own two semesters.
    const first = await api('/api/semesters');
    expect((first.body.semesters as unknown[])).toHaveLength(2);
    expect(first.body.cgpa).toBeCloseTo(42 / 9, 10);
  });

  test('reads one owned semester and hides others and malformed ids', async () => {
    const list = await api('/api/semesters');
    const mine = (list.body.semesters as Array<{ id: string }>)[0].id;
    const other = (await api('/api/semesters', {}, 'second')).body.semesters as Array<{ id: string }>;
    const own = await api(`/api/semesters/${mine}`);
    expect(own.status).toBe(200);
    expect((own.body.semester as { courses: unknown[] }).courses).toHaveLength(2);
    expect((await api(`/api/semesters/${other[0].id}`)).status).toBe(404);
    expect((await api('/api/semesters/abc')).status).toBe(404);
    const saved = jars.default;
    jars.default = '';
    expect((await api(`/api/semesters/${mine}`)).status).toBe(401);
    jars.default = saved;
  });

  test('edits a semester in place and lets the server recalculate', async () => {
    const list = await api('/api/semesters');
    const target = (list.body.semesters as Array<{ id: string; level: string; term: string }>).find(
      (s) => s.term === 'First Semester'
    )!;
    const r = await api(`/api/semesters/${target.id}`, {
      method: 'PUT',
      body: JSON.stringify({
        level: '100',
        term: 'First Semester',
        courses: [
          { code: 'CSC 101', title: 'Intro', units: 3, grade: 'B' },
          { code: 'MTH 111', units: 3, grade: 'B' },
          { code: 'PHY 101', units: 2, grade: 'A' }
        ],
        // Bogus derived values: the server must ignore these.
        gp: 5,
        totalUnits: 999,
        totalPoints: 999
      })
    });
    expect(r.status).toBe(200);
    // (3*4 + 3*4 + 2*5) / 8 = 34/8 = 4.25, not the claimed 5.
    expect(r.body).toMatchObject({ gp: 4.25, totalUnits: 8 });
    const after = await api('/api/semesters');
    expect((after.body.semesters as unknown[])).toHaveLength(2);
    // CGPA follows the edit: (34 + 15) / (8 + 3) = 49/11.
    expect(after.body.cgpa).toBeCloseTo(49 / 11, 10);
    const edited = await api(`/api/semesters/${target.id}`);
    const sem = edited.body.semester as {
      courses: Array<{ code: string; title: string | null; units: number; grade: string; quality_points: number }>;
    };
    expect(sem.courses).toHaveLength(3);
    expect(sem.courses.find((c) => c.code === 'PHY 101')).toMatchObject({ units: 2, grade: 'A', quality_points: 10 });
  });

  test('rejects edits that collide, validate badly, or target others', async () => {
    const list = await api('/api/semesters');
    const semesters = list.body.semesters as Array<{ id: string; term: string }>;
    const second = semesters.find((s) => s.term === 'Second Semester')!;
    const other = ((await api('/api/semesters', {}, 'second')).body.semesters as Array<{ id: string }>)[0];
    const clash = await api(`/api/semesters/${second.id}`, {
      method: 'PUT',
      body: JSON.stringify({ level: '100', term: 'First Semester', courses: [{ code: 'X', units: 1, grade: 'A' }] })
    });
    expect(clash.status).toBe(409);
    const bad = await api(`/api/semesters/${second.id}`, {
      method: 'PUT',
      body: JSON.stringify({ level: '100', term: 'Second Semester', courses: [{ code: '', units: 0, grade: 'Z' }] })
    });
    expect(bad.status).toBe(400);
    expect(
      (
        await api(`/api/semesters/${other.id}`, {
          method: 'PUT',
          body: JSON.stringify({ level: '100', term: 'First Semester', courses: [{ code: 'X', units: 1, grade: 'A' }] })
        })
      ).status
    ).toBe(404);
    expect(
      (
        await api('/api/semesters/missing', {
          method: 'PUT',
          body: JSON.stringify({ level: '100', term: 'First Semester', courses: [{ code: 'X', units: 1, grade: 'A' }] })
        })
      ).status
    ).toBe(404);
    // Failed edits change nothing.
    const intact = (await api(`/api/semesters/${second.id}`)).body.semester as { term: string };
    expect(intact.term).toBe('Second Semester');
  });

  test('deletes a semester with its courses and recalculates CGPA', async () => {
    const list = await api('/api/semesters');
    const semesters = list.body.semesters as Array<{ id: string; term: string }>;
    const second = semesters.find((s) => s.term === 'Second Semester')!;
    // Another student's record cannot be deleted.
    const other = ((await api('/api/semesters', {}, 'second')).body.semesters as Array<{ id: string }>)[0];
    expect((await api(`/api/semesters/${other.id}`, { method: 'DELETE' })).status).toBe(404);
    expect((await api('/api/semesters/missing', { method: 'DELETE' })).status).toBe(404);
    expect((await api(`/api/semesters/${second.id}`, { method: 'DELETE' })).status).toBe(200);
    // Gone, with its courses: no orphans, no second delete.
    expect((await api(`/api/semesters/${second.id}`)).status).toBe(404);
    expect((await api(`/api/semesters/${second.id}`, { method: 'DELETE' })).status).toBe(404);
    const after = await api('/api/semesters');
    expect((after.body.semesters as unknown[])).toHaveLength(1);
    expect(after.body.cgpa).toBeCloseTo(4.25, 10);
    // Deleting the last semester restores the empty state.
    const last = (after.body.semesters as Array<{ id: string }>)[0];
    expect((await api(`/api/semesters/${last.id}`, { method: 'DELETE' })).status).toBe(200);
    const empty = await api('/api/semesters');
    expect((empty.body.semesters as unknown[])).toHaveLength(0);
    expect(empty.body.cgpa).toBeNull();
  });
});
