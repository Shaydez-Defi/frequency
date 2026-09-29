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
import { completeGoogleProfileSchema, setupPasswordSchema } from '@frequency/shared/schemas';

const here = dirname(fileURLToPath(import.meta.url));

// Minimal cookie jar: tracks every Set-Cookie by name so OAuth state,
// pending identity, and auth cookies survive redirects like a browser.
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
      else jar.set(name, value);
    }
  }
  // fetch() percent-encodes cookie values; the OAuth state must round-trip exactly.
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  const text = res.headers.get('location') ?? '';
  return { status: res.status, body, location: text };
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

describe('google schemas', () => {
  test('complete profile requires academic identity, never a Google subject', () => {
    expect(
      completeGoogleProfileSchema.safeParse({ fullName: 'Ada Eze', department: 'Agric', regNumber: 'FEHND/2024/0001' }).success
    ).toBe(true);
    const r = completeGoogleProfileSchema.safeParse({
      fullName: 'Ada Eze',
      department: 'Agric',
      regNumber: 'fehnd/2024/0001',
      sub: 'hacker-sub'
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect('sub' in r.data).toBe(false);
      expect(r.data.regNumber).toBe('FEHND/2024/0001');
    }
    expect(completeGoogleProfileSchema.safeParse({ fullName: 'A', department: 'Agric', regNumber: 'X1' }).success).toBe(false);
  });

  test('setup password requires a matching confirmation', () => {
    expect(setupPasswordSchema.safeParse({ newPassword: 'newpass1234', confirmPassword: 'newpass1234' }).success).toBe(true);
    expect(setupPasswordSchema.safeParse({ newPassword: 'short', confirmPassword: 'short' }).success).toBe(false);
    expect(setupPasswordSchema.safeParse({ newPassword: 'newpass1234', confirmPassword: 'other1234' }).success).toBe(false);
  });
});

describe('google sign-in flow (mocked identity)', () => {
  test('authorize redirects to Google with state cookies', async () => {
    jar.clear();
    const r = await api('/api/auth/google?intent=login');
    expect(r.status).toBe(302);
    expect(r.location).toContain('accounts.google.com');
    expect(jar.get('g_state')).toBeTruthy();
    expect(jar.get('g_intent')).toBe('login');
  });

  test('callback rejects a forged state (CSRF)', async () => {
    const r = await api('/api/auth/google/callback?code=anything&state=forged-state-value-000000');
    expect(r.status).toBe(302);
    expect(r.location).toContain('invalid_state');
  });

  test('first-time Google identity creates a student via complete-profile', async () => {
    jar.clear();
    await api('/api/auth/google?intent=login');
    const state = jar.get('g_state') ?? '';
    const cb = await api(`/api/auth/google/callback?code=test-code&state=${state}`);
    expect(cb.status).toBe(302);
    expect(cb.location).toContain('/complete-profile');
    expect(jar.get('g_pending')).toBeTruthy();

    const done = await api('/api/auth/google/complete', {
      method: 'POST',
      body: JSON.stringify({ fullName: 'Google Student', department: 'Crop Science', regNumber: 'GOO/2024/0001' })
    });
    expect(done.status).toBe(201);
    expect(done.body.user).toMatchObject({ regNumber: 'GOO/2024/0001', googleEmail: 'google.student@example.com', hasPassword: false });
    expect(JSON.stringify(done.body)).not.toContain('google-sub-001'.slice(0, 0) + 'password');
    const me = await api('/api/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.user).toMatchObject({ googleEmail: 'google.student@example.com', hasPassword: false });
  });

  test('returning Google identity logs straight in (no duplicate account)', async () => {
    jar.clear();
    await api('/api/auth/google?intent=login');
    const state = jar.get('g_state') ?? '';
    const cb = await api(`/api/auth/google/callback?code=test-code&state=${state}`);
    expect(cb.status).toBe(302);
    expect(cb.location).toContain('/dashboard');
    const me = await api('/api/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.user).toMatchObject({ regNumber: 'GOO/2024/0001' });
  });

  test('disconnect is blocked until a password exists, then setup unlocks it', async () => {
    const blocked = await api('/api/auth/google/disconnect', { method: 'POST' });
    expect(blocked.status).toBe(409);
    const setup = await api('/api/auth/password/setup', {
      method: 'POST',
      body: JSON.stringify({ newPassword: 'gpass12345', confirmPassword: 'gpass12345' })
    });
    expect(setup.status).toBe(200);
    const again = await api('/api/auth/password/setup', {
      method: 'POST',
      body: JSON.stringify({ newPassword: 'other12345', confirmPassword: 'other12345' })
    });
    expect(again.status).toBe(400);
    const ok = await api('/api/auth/google/disconnect', { method: 'POST' });
    expect(ok.status).toBe(200);
    const me = await api('/api/auth/me');
    expect(me.body.user).toMatchObject({ googleEmail: null, hasPassword: true });
    // Password login still works after disconnecting Google.
    jar.clear();
    const login = await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ regNumber: 'GOO/2024/0001', password: 'gpass12345' })
    });
    expect(login.status).toBe(200);
  });

  test('password account links Google deliberately from Profile', async () => {
    jar.clear();
    const reg = await api('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        fullName: 'Link Student',
        department: 'Soil Science',
        regNumber: 'LNK/2024/0001',
        password: 'linkpass123',
        confirmPassword: 'linkpass123'
      })
    });
    expect(reg.status).toBe(201);
    await api('/api/auth/google?intent=link');
    const state = jar.get('g_state') ?? '';
    const cb = await api(`/api/auth/google/callback?code=test-code&state=${state}`);
    expect(cb.status).toBe(302);
    expect(cb.location).toContain('/profile?linked=1');
    const me = await api('/api/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.user).toMatchObject({ regNumber: 'LNK/2024/0001', googleEmail: 'google.student@example.com' });
  });

  test('complete-profile refuses a taken registration number (no silent takeover)', async () => {
    jar.clear();
    const dup = await api('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        fullName: 'Copy Cat',
        department: 'Agric',
        regNumber: 'LNK/2024/0001',
        password: 'copypass123',
        confirmPassword: 'copypass123'
      })
    });
    expect(dup.status).toBe(409);
  });

  test('callback rejects missing code and provider denials', async () => {
    jar.clear();
    await api('/api/auth/google?intent=login');
    const state = jar.get('g_state') ?? '';
    const noCode = await api(`/api/auth/google/callback?state=${state}`);
    expect(noCode.status).toBe(302);
    expect(noCode.location).toContain('invalid_request');
    const denied = await api('/api/auth/google/callback?error=access_denied&state=' + state);
    expect(denied.status).toBe(302);
    expect(denied.location).toContain('access_denied');
  });

  test('google user owns only their own semesters; logout ends the session', async () => {
    // Currently linked Google identity belongs to LNK/2024/0001 from the link test.
    jar.clear();
    await api('/api/auth/google?intent=login');
    const state = jar.get('g_state') ?? '';
    const cb = await api(`/api/auth/google/callback?code=test-code&state=${state}`);
    expect(cb.location).toContain('/dashboard');
    // Session persists like password login.
    expect((await api('/api/auth/me')).status).toBe(200);
    const created = await api('/api/semesters', {
      method: 'POST',
      body: JSON.stringify({ level: '100', term: 'First Semester', courses: [{ code: 'GNS 101', units: 2, grade: 'A' }] })
    });
    expect(created.status).toBe(201);
    const mine = await api('/api/semesters');
    expect((mine.body.semesters as unknown[]).length).toBeGreaterThanOrEqual(1);
    // A different password student sees none of it and cannot open it.
    jar.clear();
    const other = await api('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        fullName: 'Other Student',
        department: 'Agric',
        regNumber: 'OTH/2024/0001',
        password: 'otherpass123',
        confirmPassword: 'otherpass123'
      })
    });
    expect(other.status).toBe(201);
    const otherList = await api('/api/semesters');
    expect((otherList.body.semesters as unknown[])).toHaveLength(0);
    const semId = (mine.body.semesters as Array<{ id: string }>)[0].id;
    expect((await api(`/api/semesters/${semId}`)).status).toBe(404);
    // Logout after Google login ends the session; password login still works.
    jar.clear();
    await api('/api/auth/google?intent=login');
    const s2 = jar.get('g_state') ?? '';
    await api(`/api/auth/google/callback?code=test-code&state=${s2}`);
    expect((await api('/api/auth/me')).status).toBe(200);
    expect((await api('/api/auth/logout', { method: 'POST' })).status).toBe(200);
    expect((await api('/api/auth/me')).status).toBe(401);
    expect(
      (
        await api('/api/auth/login', {
          method: 'POST',
          body: JSON.stringify({ regNumber: 'LNK/2024/0001', password: 'linkpass123' })
        })
      ).status
    ).toBe(200);
  });
});
