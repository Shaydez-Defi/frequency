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

// Several students hitting one server at the same time: parallel reads,
// parallel creates, and parallel updates must all complete with strict
// per-user isolation and no lost writes.
const here = dirname(fileURLToPath(import.meta.url));

let base = '';
let child: ChildProcess | null = null;
let dir = '';

async function raw(path: string, options: RequestInit = {}, cookies = '') {
  const res = await fetch(base + path, {
    ...options,
    redirect: 'manual',
    headers: {
      'Content-Type': 'application/json',
      ...(cookies ? { Cookie: cookies } : {}),
      ...(options.headers ?? {})
    }
  });
  const setCookies = res.headers.getSetCookie?.() ?? [];
  const merged = [cookies, ...setCookies.map((c) => c.split(';')[0])].filter(Boolean).join('; ');
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: res.status, body, cookies: merged, location: res.headers.get('location') ?? '' };
}

function stateOf(cookies: string): string {
  return cookies.split('; ').find((c) => c.startsWith('g_state='))?.slice('g_state='.length) ?? '';
}

async function onboardAs(code: string, regNumber: string): Promise<string> {
  let cookies = '';
  let r = await raw('/api/auth/google');
  cookies = r.cookies;
  r = await raw(`/api/auth/google/callback?code=${code}&state=${stateOf(cookies)}`, {}, cookies);
  cookies = r.cookies;
  r = await raw(
    '/api/auth/google/complete',
    {
      method: 'POST',
      body: JSON.stringify({ fullName: `Load ${code}`, department: 'Load Dept', regNumber })
    },
    cookies
  );
  if (r.status !== 201) throw new Error(`onboard ${code} failed: ${r.status}`);
  return r.cookies;
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

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'cgpa-conc-'));
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
      GOOGLE_TEST_SUB: 'google-sub-load',
      GOOGLE_TEST_EMAIL: 'load@example.com',
      GOOGLE_TEST_NAME: 'Load Student'
    },
    stdio: 'ignore'
  });
  await waitForHealth();
});

afterAll(async () => {
  if (child) await killTree(child);
  child = null;
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // Best effort.
  }
});

const USERS = ['load-a', 'load-b', 'load-c', 'load-d', 'load-e'];

describe('concurrent students', () => {
  test('parallel onboarding, creation, and reads stay isolated and complete', async () => {
    const authCookies = await Promise.all(USERS.map((u, i) => onboardAs(u, `LOD/2024/000${i + 1}`)));
    const created = await Promise.all(
      authCookies.map((cookies, i) =>
        raw(
          '/api/semesters',
          {
            method: 'POST',
            body: JSON.stringify({
              level: '100',
              term: 'First Semester',
              entryMode: 'grade_only',
              courses: [{ code: `LOD${i + 1}01`, units: 3, grade: 'B' }]
            })
          },
          cookies
        )
      )
    );
    for (const r of created) expect(r.status).toBe(201);
    const histories = await Promise.all(authCookies.map((cookies) => raw('/api/semesters', {}, cookies)));
    for (const h of histories) {
      expect(h.status).toBe(200);
      expect((h.body.semesters as unknown[])).toHaveLength(1);
      expect(h.body.cgpa).toBeCloseTo(4, 10);
    }
    // Nobody sees anyone else's semester id.
    const ids = new Set(
      histories.flatMap((h) => (h.body.semesters as Array<{ id: string }>).map((s) => s.id))
    );
    expect(ids.size).toBe(USERS.length);
    const victims = [...ids];
    for (let i = 0; i < authCookies.length; i++) {
      const other = victims[(i + 1) % victims.length];
      const r = await raw(`/api/semesters/${other}`, {}, authCookies[i]);
      expect(r.status).toBe(404);
    }
  });

  test('parallel updates to different semesters do not clobber each other', async () => {
    const authCookies = await Promise.all(USERS.map((u, i) => onboardAs(`${u}-up`, `UPD/2024/000${i + 1}`)));
    const created = await Promise.all(
      authCookies.map((cookies, i) =>
        raw(
          '/api/semesters',
          {
            method: 'POST',
            body: JSON.stringify({
              level: '200',
              term: 'First Semester',
              entryMode: 'scores',
              courses: [{ code: `UPD${i + 1}01`, units: 2, grade: 'A', ca_score: 20, exam_score: 50 }]
            })
          },
          cookies
        )
      )
    );
    const updates = await Promise.all(
      created.map((c, i) =>
        raw(
          `/api/semesters/${(c.body as { id: string }).id}`,
          {
            method: 'PUT',
            body: JSON.stringify({
              level: '200',
              term: 'First Semester',
              entryMode: 'scores',
              courses: [{ code: `UPD${i + 1}01`, units: 2, grade: 'A', ca_score: 25, exam_score: 60 }]
            })
          },
          authCookies[i]
        )
      )
    );
    for (const u of updates) {
      expect(u.status).toBe(200);
      expect(u.body).toMatchObject({ gp: 5, totalUnits: 2 });
    }
  });
});
