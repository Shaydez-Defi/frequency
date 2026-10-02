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
const jars: Record<string, Map<string, string>> = { default: new Map() };

function cookieHeader(jar: string): string {
  return [...jars[jar].entries()].map(([k, v]) => `${k}=${v}`).join('; ');
}

async function api(path: string, options: RequestInit = {}, jar = 'default') {
  if (!jars[jar]) jars[jar] = new Map();
  const res = await fetch(base + path, {
    ...options,
    redirect: 'manual',
    headers: {
      'Content-Type': 'application/json',
      ...(jars[jar].size > 0 ? { Cookie: cookieHeader(jar) } : {}),
      ...(options.headers ?? {})
    }
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  const setCookies = res.headers.getSetCookie?.() ?? [];
  for (const c of setCookies) {
    const pair = c.split(';')[0];
    const eq = pair.indexOf('=');
    if (eq > 0) {
      const name = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1).trim();
      if (/expires=thu, 01 jan 1970/i.test(c) || value === '') jars[jar].delete(name);
      else jars[jar].set(name, decodeURIComponent(value));
    }
  }
  return { status: res.status, body, location: res.headers.get('location') ?? '' };
}

// Google-only auth: each code maps to a distinct stub identity.
async function onboard(
  jar: string,
  code: string,
  profile: { fullName: string; department: string; regNumber: string }
) {
  jars[jar] = new Map();
  await api('/api/auth/google', {}, jar);
  const state = jars[jar].get('g_state') ?? '';
  await api(`/api/auth/google/callback?code=${code}&state=${state}`, {}, jar);
  const done = await api('/api/auth/google/complete', { method: 'POST', body: JSON.stringify(profile) }, jar);
  if (done.status !== 201) throw new Error(`onboard failed: ${done.status} ${JSON.stringify(done.body)}`);
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
      DATABASE_URL: `file:${join(dir, 'test.db')}`,
      GOOGLE_CLIENT_ID: 'test-client-id',
      GOOGLE_CLIENT_SECRET: 'test-client-secret',
      GOOGLE_REDIRECT_URI: 'http://localhost/callback',
      GOOGLE_TEST_SUB: 'google-sub-flow',
      GOOGLE_TEST_EMAIL: 'flow.student@example.com',
      GOOGLE_TEST_NAME: 'Flow Student'
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
  test('onboards a student through Google for the flow', async () => {
    await onboard('default', 'flow-a', {
      fullName: 'Flow Student',
      department: 'Agric Economics',
      regNumber: 'TST/FLOW01'
    });
    const me = await api('/api/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.user).toMatchObject({ regNumber: 'TST/FLOW01' });
  });

  test('rejects unauthenticated semester reads', async () => {
    const saved = jars.default;
    jars.default = new Map();
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
    await onboard('second', 'flow-b', {
      fullName: 'Second Student',
      department: 'Crop Science',
      regNumber: 'TST/FLOW02'
    });
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
    jars.default = new Map();
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

describe('optional CA and exam scores', () => {
  test('grade-only semesters save and read back with null scores', async () => {
    const created = await api('/api/semesters', {
      method: 'POST',
      body: JSON.stringify({
        level: '300',
        term: 'First Semester',
        entryMode: 'grade_only',
        courses: [{ code: 'HND315', title: 'Metabolic Studies', units: 3, grade: 'A' }]
      })
    });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ gp: 5, totalUnits: 3 });
    const read = await api(`/api/semesters/${(created.body as { id: string }).id}`);
    expect(read.status).toBe(200);
    const semester = read.body.semester as { entryMode: string; courses: Array<Record<string, unknown>> };
    expect(semester.entryMode).toBe('grade_only');
    const course = semester.courses[0];
    expect(course).toMatchObject({ code: 'HND315', grade: 'A', quality_points: 15, ca_score: null, exam_score: null, total_score: null });
  });

  test('grade-only creation ignores stray scores', async () => {
    const created = await api('/api/semesters', {
      method: 'POST',
      body: JSON.stringify({
        level: '301',
        term: 'First Semester',
        entryMode: 'grade_only',
        courses: [{ code: 'HND316', units: 2, grade: 'B', ca_score: 20, exam_score: 40 }]
      })
    });
    expect(created.status).toBe(201);
    const read = await api(`/api/semesters/${(created.body as { id: string }).id}`);
    const course = (read.body.semester as { courses: Array<Record<string, unknown>> }).courses[0];
    expect(course).toMatchObject({ grade: 'B', ca_score: null, exam_score: null, total_score: null });
    expect((await api(`/api/semesters/${(created.body as { id: string }).id}`, { method: 'DELETE' })).status).toBe(200);
  });

  test('scores semesters require complete scores on every course', async () => {
    const missing = await api('/api/semesters', {
      method: 'POST',
      body: JSON.stringify({
        level: '302',
        term: 'First Semester',
        entryMode: 'scores',
        courses: [{ code: 'HND317', units: 2, grade: 'A' }]
      })
    });
    expect(missing.status).toBe(400);
    const created = await api('/api/semesters', {
      method: 'POST',
      body: JSON.stringify({
        level: '302',
        term: 'First Semester',
        entryMode: 'scores',
        courses: [{ code: 'HND317', units: 2, grade: 'F', ca_score: 24, exam_score: 61 }]
      })
    });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ gp: 5, totalUnits: 2 });
    const read = await api(`/api/semesters/${(created.body as { id: string }).id}`);
    const semester = read.body.semester as { entryMode: string; courses: Array<Record<string, unknown>> };
    expect(semester.entryMode).toBe('scores');
    expect(semester.courses[0]).toMatchObject({ grade: 'A', ca_score: 24, exam_score: 61, total_score: 85 });
    expect((await api(`/api/semesters/${(created.body as { id: string }).id}`, { method: 'DELETE' })).status).toBe(200);
  });

  test('adding both scores later derives and persists grade, points, and GPA', async () => {
    const list = await api('/api/semesters');
    const target = (list.body.semesters as Array<{ id: string; term: string }>).find((s) => s.term === 'First Semester')!;
    const countBefore = (list.body.semesters as unknown[]).length;
    const saved = await api(`/api/semesters/${target.id}`, {
      method: 'PUT',
      body: JSON.stringify({
        level: '300',
        term: 'First Semester',
        entryMode: 'scores',
        courses: [{ code: 'HND315', title: 'Metabolic Studies', units: 3, grade: 'F', ca_score: 24, exam_score: 61 }]
      })
    });
    // Client-sent F is overridden by the derived A; GPA follows.
    expect(saved.status).toBe(200);
    expect(saved.body).toMatchObject({ gp: 5, totalUnits: 3 });
    const read = await api(`/api/semesters/${target.id}`);
    const semester = read.body.semester as { entryMode: string; courses: Array<Record<string, unknown>> };
    // Same semester updated in place, now in scores mode.
    expect(semester.entryMode).toBe('scores');
    expect((await api('/api/semesters')).body.semesters as unknown[]).toHaveLength(countBefore);
    const course = semester.courses[0];
    expect(course).toMatchObject({ grade: 'A', quality_points: 15, ca_score: 24, exam_score: 61, total_score: 85 });
    const history = await api('/api/semesters');
    expect(history.body.cgpa).toBeCloseTo(5, 10);
  });

  test('partial conversion is rejected and the semester stays grade_only', async () => {
    const created = await api('/api/semesters', {
      method: 'POST',
      body: JSON.stringify({
        level: '303',
        term: 'First Semester',
        entryMode: 'grade_only',
        courses: [
          { code: 'HND318', units: 2, grade: 'B' },
          { code: 'HND319', units: 2, grade: 'C' }
        ]
      })
    });
    const id = (created.body as { id: string }).id;
    const partial = await api(`/api/semesters/${id}`, {
      method: 'PUT',
      body: JSON.stringify({
        level: '303',
        term: 'First Semester',
        entryMode: 'scores',
        courses: [
          { code: 'HND318', units: 2, grade: 'B', ca_score: 20, exam_score: 45 },
          { code: 'HND319', units: 2, grade: 'C' }
        ]
      })
    });
    expect(partial.status).toBe(400);
    const read = await api(`/api/semesters/${id}`);
    const semester = read.body.semester as { entryMode: string; gp: number; courses: Array<Record<string, unknown>> };
    expect(semester.entryMode).toBe('grade_only');
    expect(semester.gp).toBeCloseTo(3.5, 10);
    expect(semester.courses[0]).toMatchObject({ grade: 'B', ca_score: null });
    expect((await api(`/api/semesters/${id}`, { method: 'DELETE' })).status).toBe(200);
  });

  test('downgrading a scores semester back to grade_only is refused', async () => {
    const list = await api('/api/semesters');
    const target = (list.body.semesters as Array<{ id: string; term: string }>).find((s) => s.term === 'First Semester')!;
    const down = await api(`/api/semesters/${target.id}`, {
      method: 'PUT',
      body: JSON.stringify({
        level: '300',
        term: 'First Semester',
        entryMode: 'grade_only',
        courses: [{ code: 'HND315', units: 3, grade: 'A' }]
      })
    });
    expect(down.status).toBe(400);
    const read = await api(`/api/semesters/${target.id}`);
    expect((read.body.semester as { entryMode: string }).entryMode).toBe('scores');
  });

  test('rejects one-sided, negative, and over-maximum scores without saving', async () => {
    const list = await api('/api/semesters');
    const target = (list.body.semesters as Array<{ id: string }>)[0].id;
    const shapes = [
      [{ code: 'HND315', units: 3, grade: 'A', ca_score: 24 }],
      [{ code: 'HND315', units: 3, grade: 'A', exam_score: 61 }],
      [{ code: 'HND315', units: 3, grade: 'A', ca_score: -1, exam_score: 50 }],
      [{ code: 'HND315', units: 3, grade: 'A', ca_score: 31, exam_score: 50 }],
      [{ code: 'HND315', units: 3, grade: 'A', ca_score: 20, exam_score: 71 }]
    ];
    for (const courses of shapes) {
      const r = await api(`/api/semesters/${target}`, {
        method: 'PUT',
        body: JSON.stringify({ level: '300', term: 'First Semester', courses })
      });
      expect(r.status).toBe(400);
    }
    // Nothing persisted from the rejected attempts.
    const read = await api(`/api/semesters/${target}`);
    const course = (read.body.semester as { courses: Array<Record<string, unknown>> }).courses[0];
    expect(course).toMatchObject({ grade: 'A', ca_score: 24, exam_score: 61, total_score: 85 });
  });

  test('grade-only edits still work and keep scores null', async () => {
    const created = await api('/api/semesters', {
      method: 'POST',
      body: JSON.stringify({
        level: '300',
        term: 'Second Semester',
        courses: [{ code: 'HND316', units: 2, grade: 'B' }]
      })
    });
    expect(created.status).toBe(201);
    const id = (created.body as { id: string }).id;
    const saved = await api(`/api/semesters/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ level: '300', term: 'Second Semester', courses: [{ code: 'HND316', units: 2, grade: 'A' }] })
    });
    expect(saved.status).toBe(200);
    expect(saved.body).toMatchObject({ gp: 5 });
    const read = await api(`/api/semesters/${id}`);
    const course = (read.body.semester as { courses: Array<Record<string, unknown>> }).courses[0];
    expect(course).toMatchObject({ grade: 'A', ca_score: null, exam_score: null, total_score: null });
  });
});

describe('result sheet payload', () => {
  test('carries every field the printable sheet needs, and nobody elses', async () => {
    const list = await api('/api/semesters');
    const target = (list.body.semesters as Array<{ id: string; term: string }>).find((s) => s.term === 'First Semester')!;
    const semester = await api(`/api/semesters/${target.id}`);
    expect(semester.status).toBe(200);
    const s = semester.body.semester as {
      level: string;
      term: string;
      entryMode: string;
      totalUnits: number;
      totalPoints: number;
      gp: number;
      courses: Array<Record<string, unknown>>;
    };
    expect(s).toMatchObject({ level: '300', term: 'First Semester', entryMode: 'scores', totalUnits: 3, totalPoints: 15, gp: 5 });
    expect(Object.keys(s.courses[0]).join(',')).toContain('ca_score');
    const me = await api('/api/auth/me');
    expect(me.body.user).toMatchObject({ fullName: 'Flow Student', regNumber: 'TST/FLOW01', department: 'Agric Economics' });
    // Another student cannot open this result sheet.
    expect((await api(`/api/semesters/${target.id}`, {}, 'second')).status).toBe(404);
  });
});
