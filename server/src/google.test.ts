import { spawn, spawnSync } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { createServer } from 'node:net';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { googleConfig } from './google.js';
import { completeGoogleProfileSchema } from '@frequency/shared/schemas';

const here = dirname(fileURLToPath(import.meta.url));

// Browser-like cookie jar: every Set-Cookie survives by name so OAuth state,
// pending identity, and auth cookies round-trip across redirects.
let jar = new Map<string, string>();
let base = '';
let child: ChildProcess | null = null;
let dir = '';

function cookieHeader(): string {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
}

async function api(path: string, options: RequestInit = {}) {
  const res = await fetch(base + path, {
    ...options,
    redirect: 'manual',
    headers: {
      'Content-Type': 'application/json',
      ...(jar.size > 0 ? { Cookie: cookieHeader() } : {}),
      ...(options.headers ?? {})
    }
  });
  const setCookies = res.headers.getSetCookie?.() ?? [];
  for (const c of setCookies) {
    const pair = c.split(';')[0];
    const eq = pair.indexOf('=');
    if (eq > 0) {
      const name = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1).trim();
      if (/expires=thu, 01 jan 1970/i.test(c) || value === '') jar.delete(name);
      else jar.set(name, decodeURIComponent(value));
    }
  }
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: res.status, body, location: res.headers.get('location') ?? '' };
}

async function googleOnboard(code: string, profile: { fullName: string; department: string; regNumber: string; claimExisting?: boolean }) {
  jar.clear();
  await api('/api/auth/google');
  const state = jar.get('g_state') ?? '';
  const cb = await api(`/api/auth/google/callback?code=${code}&state=${state}`);
  const done = await api('/api/auth/google/complete', { method: 'POST', body: JSON.stringify(profile) });
  return { cb, done };
}

function seedLegacy(profile: { fullName: string; department: string; regNumber: string }) {
  const file = join(dir, 'legacy.json');
  writeFileSync(file, JSON.stringify(profile));
  const r = spawnSync('npx tsx src/testSeed.ts', [file], {
    cwd: here,
    shell: true,
    env: { ...process.env, DATABASE_URL: `file:${join(dir, 'test.db')}` },
    encoding: 'utf8'
  });
  if (r.status !== 0) throw new Error(`seed failed: ${r.stderr}`);
  return JSON.parse(r.stdout) as { id: string; existed: boolean };
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
  dir = mkdtempSync(join(tmpdir(), 'cgpa-google-'));
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
      GOOGLE_TEST_SUB: 'google-sub-001',
      GOOGLE_TEST_EMAIL: 'google.student@example.com',
      GOOGLE_TEST_NAME: 'Google Student'
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

describe('google configuration contract', () => {
  test('googleConfig stays null without credentials (graceful degradation)', () => {
    expect(googleConfig()).toBeNull();
  });

  test('complete profile schema ignores client-supplied Google identity', () => {
    const r = completeGoogleProfileSchema.safeParse({
      fullName: 'Ada Eze',
      department: 'Agric',
      regNumber: 'fehnd/2024/0001',
      sub: 'hacker-sub',
      email: 'hacker@example.com'
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect('sub' in r.data).toBe(false);
      expect('email' in r.data).toBe(false);
      expect(r.data.regNumber).toBe('FEHND/2024/0001');
    }
  });
});

describe('oauth initiation', () => {
  test('redirects to Google with client id, redirect uri, scopes, and state', async () => {
    jar.clear();
    const r = await api('/api/auth/google');
    expect(r.status).toBe(302);
    expect(r.location).toContain('accounts.google.com');
    expect(r.location).toContain('client_id=test-client-id');
    expect(r.location).toContain('scope=openid');
    expect(r.location).toContain('redirect_uri=');
    const state = jar.get('g_state') ?? '';
    expect(state).toMatch(/^[0-9a-f]{64}$/);
    expect(r.location).toContain(`state=${state}`);
  });

  test('old link intent URL still lands on the same login flow', async () => {
    jar.clear();
    const r = await api('/api/auth/google?intent=link');
    expect(r.status).toBe(302);
    expect(r.location).toContain('accounts.google.com');
  });
});

describe('oauth callback guards', () => {
  test('rejects forged state, missing code, and provider denials', async () => {
    jar.clear();
    const forged = await api('/api/auth/google/callback?code=x&state=forged-state-value-000000');
    expect(forged.status).toBe(302);
    expect(forged.location).toContain('invalid_state');
    await api('/api/auth/google');
    const state = jar.get('g_state') ?? '';
    const noCode = await api(`/api/auth/google/callback?state=${state}`);
    expect(noCode.status).toBe(302);
    expect(noCode.location).toContain('invalid_request');
    const denied = await api(`/api/auth/google/callback?error=access_denied&state=${state}`);
    expect(denied.status).toBe(302);
    expect(denied.location).toContain('access_denied');
  });
});

describe('first-time onboarding', () => {
  test('verified identity without an account lands on complete-profile with pending email', async () => {
    jar.clear();
    await api('/api/auth/google');
    const state = jar.get('g_state') ?? '';
    const cb = await api('/api/auth/google/callback?code=test-code&state=' + state);
    expect(cb.status).toBe(302);
    expect(cb.location).toContain('/complete-profile');
    expect(jar.get('g_pending')).toBeTruthy();
    const pending = await api('/api/auth/google/pending');
    expect(pending.status).toBe(200);
    expect(pending.body.pending).toMatchObject({ email: 'google.student@example.com', name: 'Google Student' });
  });

  test('completing the profile creates the student and signs in', async () => {
    const done = await api('/api/auth/google/complete', {
      method: 'POST',
      body: JSON.stringify({ fullName: 'Google Student', department: 'Crop Science', regNumber: 'GOO/2024/0001' })
    });
    expect(done.status).toBe(201);
    expect(done.body.user).toMatchObject({
      fullName: 'Google Student',
      department: 'Crop Science',
      regNumber: 'GOO/2024/0001',
      googleEmail: 'google.student@example.com'
    });
    expect(JSON.stringify(done.body)).not.toContain('google-sub-001'.slice(0, 0) + 'password');
    const me = await api('/api/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.user).toMatchObject({ regNumber: 'GOO/2024/0001' });
  });

  test('rejects invalid onboarding bodies and expired pending sessions', async () => {
    jar.clear();
    await api('/api/auth/google');
    const fresh = jar.get('g_state') ?? '';
    await api('/api/auth/google/callback?code=fresh-code&state=' + fresh);
    const bad = await api('/api/auth/google/complete', {
      method: 'POST',
      body: JSON.stringify({ fullName: 'A', department: 'Crop Science', regNumber: 'GOO/2024/0002' })
    });
    expect(bad.status).toBe(400);
    jar.clear();
    const expired = await api('/api/auth/google/complete', {
      method: 'POST',
      body: JSON.stringify({ fullName: 'Nobody', department: 'Crop Science', regNumber: 'GOO/2024/0002' })
    });
    expect(expired.status).toBe(401);
    expect((await api('/api/auth/google/pending')).status).toBe(401);
  });

  test('rejects a registration number already owned by another Google account', async () => {
    const { done } = await googleOnboard('other-code', {
      fullName: 'Copy Cat',
      department: 'Agric',
      regNumber: 'GOO/2024/0001'
    });
    expect(done.status).toBe(409);
    expect(done.body.code).not.toBe('NEEDS_CLAIM');
  });
});

describe('returning google user', () => {
  test('same Google account logs straight into the same student, never a duplicate', async () => {
    jar.clear();
    await api('/api/auth/google');
    const state = jar.get('g_state') ?? '';
    const cb = await api('/api/auth/google/callback?code=test-code&state=' + state);
    expect(cb.status).toBe(302);
    expect(cb.location).toContain('/dashboard');
    const me = await api('/api/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.user).toMatchObject({ regNumber: 'GOO/2024/0001', googleEmail: 'google.student@example.com' });
  });
});

describe('legacy account claim', () => {
  test('silently taking over an old registration number is refused', async () => {
    seedLegacy({ fullName: 'Old Student', department: 'Soil Science', regNumber: 'OLD/2024/0001' });
    const { cb, done } = await googleOnboard('claim-code', {
      fullName: 'Old Student',
      department: 'Soil Science',
      regNumber: 'OLD/2024/0001'
    });
    expect(cb.location).toContain('/complete-profile');
    expect(done.status).toBe(409);
    expect(done.body.code).toBe('NEEDS_CLAIM');
  });

  test('explicit confirmation links Google to the existing records', async () => {
    const done = await api('/api/auth/google/complete', {
      method: 'POST',
      body: JSON.stringify({
        fullName: 'Old Student',
        department: 'Soil Science',
        regNumber: 'OLD/2024/0001',
        claimExisting: true
      })
    });
    expect(done.status).toBe(200);
    expect(done.body.claimed).toBe(true);
    const me = await api('/api/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.user).toMatchObject({ regNumber: 'OLD/2024/0001', googleEmail: 'google.student@example.com' });
    // Records attach to the claimed account going forward.
    const saved = await api('/api/semesters', {
      method: 'POST',
      body: JSON.stringify({ level: '100', term: 'First Semester', courses: [{ code: 'GNS 101', units: 2, grade: 'A' }] })
    });
    expect(saved.status).toBe(201);
  });
});

describe('sessions and profile', () => {
  test('session persists, profile edits identity fields but never email or reg number', async () => {
    await googleOnboard('profile-code', { fullName: 'Profile Student', department: 'Botany', regNumber: 'PRF/2024/0001' });
    expect((await api('/api/auth/me')).status).toBe(200);
    const patch = await api('/api/auth/profile', {
      method: 'PATCH',
      body: JSON.stringify({ fullName: 'Renamed Student', department: 'Zoology', regNumber: 'HACKED/1', googleEmail: 'evil@x.com' })
    });
    expect(patch.status).toBe(200);
    expect(patch.body.user).toMatchObject({ fullName: 'Renamed Student', department: 'Zoology', regNumber: 'PRF/2024/0001' });
    expect((patch.body.user as { googleEmail: string }).googleEmail).toBe('google.student@example.com');
    expect((await api('/api/auth/profile', { method: 'PATCH', body: JSON.stringify({}) })).status).toBe(400);
  });

  test('logout clears the session and protected routes refuse', async () => {
    expect((await api('/api/auth/logout', { method: 'POST' })).status).toBe(200);
    expect((await api('/api/auth/me')).status).toBe(401);
    expect((await api('/api/semesters')).status).toBe(401);
  });
});

describe('ownership across google users', () => {
  test('one google user cannot touch another google user semester', async () => {
    await googleOnboard('owner-code', { fullName: 'Owner Student', department: 'Physics', regNumber: 'OWN/2024/0001' });
    const created = await api('/api/semesters', {
      method: 'POST',
      body: JSON.stringify({ level: '200', term: 'First Semester', courses: [{ code: 'PHY 201', units: 3, grade: 'B' }] })
    });
    expect(created.status).toBe(201);
    const semId = (created.body as { id: string }).id;
    await googleOnboard('stranger-code', { fullName: 'Stranger Student', department: 'Maths', regNumber: 'STG/2024/0001' });
    const list = await api('/api/semesters');
    expect((list.body.semesters as unknown[])).toHaveLength(0);
    expect((await api(`/api/semesters/${semId}`)).status).toBe(404);
    expect(
      (await api(`/api/semesters/${semId}`, { method: 'PUT', body: JSON.stringify({ level: '200', term: 'First Semester', courses: [] }) }))
        .status
    ).toBe(404);
    expect((await api(`/api/semesters/${semId}`, { method: 'DELETE' })).status).toBe(404);
  });
});

describe('retired password surface', () => {
  test('no password routes remain', async () => {
    jar.clear();
    for (const [method, path, body] of [
      ['POST', '/api/auth/register', { fullName: 'X', department: 'Y', regNumber: 'Z', password: 'p', confirmPassword: 'p' }],
      ['POST', '/api/auth/login', { regNumber: 'Z', password: 'p' }],
      ['POST', '/api/auth/password', { currentPassword: 'a', newPassword: 'b', confirmPassword: 'b' }],
      ['POST', '/api/auth/password/setup', { newPassword: 'b', confirmPassword: 'b' }],
      ['POST', '/api/auth/google/disconnect', {}]
    ] as Array<[string, string, Record<string, string>]>) {
      const r = await api(path, { method, body: JSON.stringify(body) });
      expect(r.status).toBe(404);
    }
  });
});
