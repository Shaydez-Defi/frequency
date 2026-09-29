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

const here = dirname(fileURLToPath(import.meta.url));

let base = '';
let child: ChildProcess | null = null;
let dir = '';
let cookie = '';

async function api(path: string, options: RequestInit = {}) {
  const res = await fetch(base + path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(cookie ? { Cookie: cookie } : {}),
      ...(options.headers ?? {})
    }
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  const setCookies = res.headers.getSetCookie?.() ?? [];
  const token = setCookies.find((c) => c.startsWith('token='));
  if (token) cookie = token.split(';')[0];
  if (path === '/api/auth/logout' && res.ok) cookie = '';
  return { status: res.status, body };
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
  dir = mkdtempSync(join(tmpdir(), 'cgpa-auth-'));
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

afterAll(async () => {
  if (child) await killTree(child);
  child = null;
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // Best effort: a locked temp file must never fail the suite.
  }
});

const user = {
  fullName: 'Auth Student',
  department: 'Agric Economics',
  regNumber: 'TST/AUTH01',
  password: 'password1234',
  confirmPassword: 'password1234'
};

describe('authentication flow', () => {
  test('registers and never exposes password material', async () => {
    const r = await api('/api/auth/register', { method: 'POST', body: JSON.stringify(user) });
    expect(r.status).toBe(201);
    expect(r.body.user).toMatchObject({ fullName: 'Auth Student', regNumber: 'TST/AUTH01' });
    expect(JSON.stringify(r.body)).not.toContain('password');
    expect(JSON.stringify(r.body)).not.toContain('hash');
  });

  test('rejects duplicate registration numbers', async () => {
    const r = await api('/api/auth/register', { method: 'POST', body: JSON.stringify(user) });
    expect(r.status).toBe(409);
  });

  test('rejects invalid registration bodies', async () => {
    const r = await api('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ ...user, regNumber: 'TST/AUTH02', password: 'short', confirmPassword: 'short' })
    });
    expect(r.status).toBe(400);
  });

  test('logs in, persists the session, and logs out', async () => {
    const badPass = await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ regNumber: user.regNumber, password: 'wrongpass99' })
    });
    expect(badPass.status).toBe(401);
    const unknown = await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ regNumber: 'NOBODY/0000', password: 'password1234' })
    });
    expect(unknown.status).toBe(401);
    const missing = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ regNumber: '', password: '' }) });
    expect(missing.status).toBe(400);
    const ok = await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ regNumber: user.regNumber, password: user.password })
    });
    expect(ok.status).toBe(200);
    // Session persists across requests (refresh equivalent).
    expect((await api('/api/auth/me')).status).toBe(200);
    expect((await api('/api/auth/logout', { method: 'POST' })).status).toBe(200);
    // After logout the session cookie is gone: protected routes refuse.
    expect((await api('/api/auth/me')).status).toBe(401);
    expect((await api('/api/semesters')).status).toBe(401);
    // And the student can log back in.
    expect(
      (
        await api('/api/auth/login', {
          method: 'POST',
          body: JSON.stringify({ regNumber: user.regNumber, password: user.password })
        })
      ).status
    ).toBe(200);
  });
});

describe('profile and password', () => {
  test('edits name and department but never the registration number', async () => {
    const patch = await api('/api/auth/profile', {
      method: 'PATCH',
      body: JSON.stringify({ fullName: 'Renamed Student', department: 'Crop Science', regNumber: 'HACKED/0000' })
    });
    expect(patch.status).toBe(200);
    expect(patch.body.user).toMatchObject({ fullName: 'Renamed Student', department: 'Crop Science', regNumber: 'TST/AUTH01' });
    const me = await api('/api/auth/me');
    expect(me.body.user).toMatchObject({ fullName: 'Renamed Student' });
    const bad = await api('/api/auth/profile', { method: 'PATCH', body: JSON.stringify({ fullName: 'A' }) });
    expect(bad.status).toBe(400);
    const empty = await api('/api/auth/profile', { method: 'PATCH', body: JSON.stringify({}) });
    expect(empty.status).toBe(400);
  });

  test('changes the password with hashing and keeps history intact', async () => {
    await api('/api/semesters', {
      method: 'POST',
      body: JSON.stringify({ level: '200', term: 'First Semester', courses: [{ code: 'AEC 201', units: 2, grade: 'A' }] })
    });
    const wrong = await api('/api/auth/password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword: 'nope12345', newPassword: 'newpass1234', confirmPassword: 'newpass1234' })
    });
    expect(wrong.status).toBe(401);
    const weak = await api('/api/auth/password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword: user.password, newPassword: 'short', confirmPassword: 'short' })
    });
    expect(weak.status).toBe(400);
    const mismatch = await api('/api/auth/password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword: user.password, newPassword: 'newpass1234', confirmPassword: 'other1234' })
    });
    expect(mismatch.status).toBe(400);
    const ok = await api('/api/auth/password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword: user.password, newPassword: 'newpass1234', confirmPassword: 'newpass1234' })
    });
    expect(ok.status).toBe(200);
    // Old password is dead, new one works, records untouched.
    cookie = '';
    expect(
      (await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ regNumber: user.regNumber, password: user.password }) })).status
    ).toBe(401);
    expect(
      (await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ regNumber: user.regNumber, password: 'newpass1234' }) })).status
    ).toBe(200);
    const history = await api('/api/semesters');
    expect((history.body.semesters as unknown[])).toHaveLength(1);
  });
});
