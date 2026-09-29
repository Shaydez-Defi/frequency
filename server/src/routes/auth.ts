import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import {
  loginSchema,
  registerSchema,
  updateProfileSchema,
  changePasswordSchema,
  completeGoogleProfileSchema,
  setupPasswordSchema
} from '@frequency/shared/schemas';
import { queryGet, queryRun } from '../db.js';
import { ah } from '../ah.js';
import { exchangeCode, googleAuthUrl, googleConfig, verifyIdentity } from '../google.js';
import {
  clearAuthCookie,
  clearPendingCookie,
  readPendingCookie,
  requireAuth,
  setAuthCookie,
  setPendingCookie,
  signToken
} from '../auth.js';

interface UserRow {
  id: string;
  full_name: string;
  department: string;
  reg_number: string;
  password_hash: string;
  google_id: string | null;
  google_email: string | null;
  has_password: number;
}

const toPublic = (row: UserRow) => ({
  id: row.id,
  fullName: row.full_name,
  department: row.department,
  regNumber: row.reg_number
});

const hasPassword = (row: UserRow): boolean => Number(row.has_password) === 1;

const toExtended = (row: UserRow) => ({
  ...toPublic(row),
  googleEmail: row.google_email,
  hasPassword: hasPassword(row)
});

export const authRouter = Router();

authRouter.post(
  '/register',
  ah(async (req, res) => {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Check the highlighted fields.', details: parsed.error.flatten().fieldErrors });
      return;
    }
    const { fullName, department, regNumber, password } = parsed.data;
    const existing = await queryGet<{ id: string }>('SELECT id FROM users WHERE reg_number = ?', regNumber);
    if (existing) {
      res.status(409).json({ error: 'This registration number is already registered. Try logging in.' });
      return;
    }
    const password_hash = bcrypt.hashSync(password, 12);
    const id = randomUUID();
    await queryRun(
      'INSERT INTO users (id, full_name, department, reg_number, password_hash) VALUES (?, ?, ?, ?, ?)',
      id,
      fullName.trim(),
      department.trim(),
      regNumber,
      password_hash
    );
    const user = { id, fullName: fullName.trim(), department: department.trim(), regNumber };
    setAuthCookie(res, signToken(user));
    res.status(201).json({ user: { ...user, googleEmail: null, hasPassword: true } });
  })
);

authRouter.post(
  '/login',
  ah(async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Enter your registration number and password.' });
      return;
    }
    const { regNumber, password } = parsed.data;
    const row = await queryGet<UserRow>('SELECT * FROM users WHERE reg_number = ?', regNumber);
    if (!row || !bcrypt.compareSync(password, row.password_hash)) {
      res.status(401).json({ error: 'Invalid registration number or password.' });
      return;
    }
    const user = toPublic(row);
    setAuthCookie(res, signToken(user));
    res.json({ user: { ...user, googleEmail: row.google_email, hasPassword: hasPassword(row) } });
  })
);

authRouter.post('/logout', (_req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

authRouter.get(
  '/me',
  requireAuth,
  ah(async (req, res) => {
    const session = (req as typeof req & { user: UserRow }).user;
    const row = await queryGet<UserRow>(
      'SELECT * FROM users WHERE id = ?',
      (session as unknown as { id: string }).id
    );
    if (!row) {
      res.status(401).json({ error: 'Account no longer exists.' });
      return;
    }
    res.json({ user: toExtended(row) });
  })
);

function sessionId(req: unknown): string {
  return (req as { user: { id: string } }).user.id;
}

// Registration number is the immutable login identifier: editable name/department only.
authRouter.patch(
  '/profile',
  requireAuth,
  ah(async (req, res) => {
    const parsed = updateProfileSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Check the highlighted fields.', details: parsed.error.flatten().fieldErrors });
      return;
    }
    const row = await queryGet<UserRow>('SELECT * FROM users WHERE id = ?', sessionId(req));
    if (!row) {
      res.status(401).json({ error: 'Account no longer exists.' });
      return;
    }
    const fullName = parsed.data.fullName?.trim() ?? row.full_name;
    const department = parsed.data.department?.trim() ?? row.department;
    await queryRun('UPDATE users SET full_name = ?, department = ? WHERE id = ?', fullName, department, row.id);
  const user = { id: row.id, fullName, department, regNumber: row.reg_number };
  setAuthCookie(res, signToken(user));
  res.json({ user: { ...user, googleEmail: row.google_email, hasPassword: hasPassword(row) } });
  })
);

authRouter.post(
  '/password',
  requireAuth,
  ah(async (req, res) => {
    const parsed = changePasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Check the highlighted fields.', details: parsed.error.flatten().fieldErrors });
      return;
    }
    const row = await queryGet<UserRow>('SELECT * FROM users WHERE id = ?', sessionId(req));
    if (!row) {
      res.status(401).json({ error: 'Account no longer exists.' });
      return;
    }
    if (!hasPassword(row)) {
      res.status(400).json({ error: 'No password is set yet. Set one first.' });
      return;
    }
    if (!bcrypt.compareSync(parsed.data.currentPassword, row.password_hash)) {
      res.status(401).json({ error: 'Current password is incorrect.' });
      return;
    }
    await queryRun(
      'UPDATE users SET password_hash = ? WHERE id = ?',
      bcrypt.hashSync(parsed.data.newPassword, 12),
      row.id
    );
    res.json({ ok: true });
  })
);

// First password for accounts created through Google sign-in.
authRouter.post(
  '/password/setup',
  requireAuth,
  ah(async (req, res) => {
    const parsed = setupPasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Check the highlighted fields.', details: parsed.error.flatten().fieldErrors });
      return;
    }
    const row = await queryGet<UserRow>('SELECT * FROM users WHERE id = ?', sessionId(req));
    if (!row) {
      res.status(401).json({ error: 'Account no longer exists.' });
      return;
    }
    if (hasPassword(row)) {
      res.status(400).json({ error: 'A password is already set. Change it instead.' });
      return;
    }
    await queryRun(
      'UPDATE users SET password_hash = ?, has_password = 1 WHERE id = ?',
      bcrypt.hashSync(parsed.data.newPassword, 12),
      row.id
    );
    res.json({ ok: true });
  })
);

// ---- Google Sign-In (additional method; password login is unchanged) ----

const OAUTH_COOKIES = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  maxAge: 10 * 60 * 1000,
  path: '/'
};

function statesMatch(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

function currentSessionUser(req: unknown): { id: string } | null {
  const token = (req as { cookies?: Record<string, string> }).cookies?.token;
  if (!token) return null;
  try {
    const secret = process.env.JWT_SECRET ?? 'dev-secret-change-me';
    const payload = jwt.verify(token, secret) as { id: string };
    return typeof payload.id === 'string' ? { id: payload.id } : null;
  } catch {
    return null;
  }
}

authRouter.get('/google', (req, res) => {
  if (!googleConfig()) {
    res.redirect(302, '/login?error=google_not_configured');
    return;
  }
  const intent = req.query.intent === 'link' ? 'link' : 'login';
  const state = randomBytes(32).toString('hex');
  res.cookie('g_state', state, OAUTH_COOKIES);
  res.cookie('g_intent', intent, OAUTH_COOKIES);
  res.redirect(302, googleAuthUrl(state));
});

authRouter.get(
  '/google/callback',
  ah(async (req, res) => {
    const quit = (code: string, target = '/login') => {
      res.clearCookie('g_state', { path: '/' });
      res.clearCookie('g_intent', { path: '/' });
      res.redirect(302, `${target}?error=${code}`);
    };
    if (typeof req.query.error === 'string' && req.query.error.length > 0) {
      quit('access_denied');
      return;
    }
    const savedState = req.cookies?.g_state as string | undefined;
    const intent = req.cookies?.g_intent === 'link' ? 'link' : 'login';
    const { code, state } = req.query;
    if (!savedState || typeof state !== 'string' || !statesMatch(state, savedState)) {
      quit('invalid_state');
      return;
    }
    if (!code || typeof code !== 'string') {
      quit('invalid_request');
      return;
    }
    let identity;
    try {
      identity = await verifyIdentity(await exchangeCode(code));
    } catch {
      quit('google_failed');
      return;
    }
    if (!identity.emailVerified) {
      quit('email_unverified');
      return;
    }
    res.clearCookie('g_state', { path: '/' });
    res.clearCookie('g_intent', { path: '/' });

    const linked = await queryGet<UserRow>('SELECT * FROM users WHERE google_id = ?', identity.sub);
    const session = currentSessionUser(req);
    const me = session ? await queryGet<UserRow>('SELECT * FROM users WHERE id = ?', session.id) : undefined;

    if (me) {
      if (linked && linked.id === me.id) {
        const user = toPublic(me);
        setAuthCookie(res, signToken(user));
        res.redirect(302, '/dashboard');
        return;
      }
      if (intent === 'link' && !linked) {
        await queryRun('UPDATE users SET google_id = ?, google_email = ? WHERE id = ?', identity.sub, identity.email, me.id);
        res.redirect(302, '/profile?linked=1');
        return;
      }
      if (intent === 'link') {
        res.redirect(302, '/profile?error=already_linked');
        return;
      }
      res.redirect(302, '/dashboard');
      return;
    }

    if (linked) {
      const user = toPublic(linked);
      setAuthCookie(res, signToken(user));
      res.redirect(302, '/dashboard');
      return;
    }
    setPendingCookie(res, { sub: identity.sub, email: identity.email, name: identity.name });
    res.redirect(302, '/complete-profile');
  })
);

authRouter.post(
  '/google/complete',
  ah(async (req, res) => {
    const pending = readPendingCookie(req);
    if (!pending) {
      res.status(401).json({ error: 'Google session expired. Start again from Log in.' });
      return;
    }
    const parsed = completeGoogleProfileSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Check the highlighted fields.', details: parsed.error.flatten().fieldErrors });
      return;
    }
    const { fullName, department, regNumber } = parsed.data;
    const existingReg = await queryGet<{ id: string }>('SELECT id FROM users WHERE reg_number = ?', regNumber);
    if (existingReg) {
      res.status(409).json({ error: 'This registration number is already registered. Log in instead, then connect Google from Profile.' });
      return;
    }
    const existingSub = await queryGet<{ id: string }>('SELECT id FROM users WHERE google_id = ?', pending.sub);
    if (existingSub) {
      res.status(409).json({ error: 'This Google account is already linked to another student.' });
      return;
    }
    const id = randomUUID();
    await queryRun(
      'INSERT INTO users (id, full_name, department, reg_number, password_hash, google_id, google_email, has_password) VALUES (?, ?, ?, ?, ?, ?, ?, 0)',
      id,
      fullName.trim(),
      department.trim(),
      regNumber,
      bcrypt.hashSync(randomUUID(), 4),
      pending.sub,
      pending.email
    );
    clearPendingCookie(res);
    const user = { id, fullName: fullName.trim(), department: department.trim(), regNumber };
    setAuthCookie(res, signToken(user));
    res.status(201).json({ user: { ...user, googleEmail: pending.email, hasPassword: false } });
  })
);

authRouter.post(
  '/google/disconnect',
  requireAuth,
  ah(async (req, res) => {
    const row = await queryGet<UserRow>('SELECT * FROM users WHERE id = ?', sessionId(req));
    if (!row) {
      res.status(401).json({ error: 'Account no longer exists.' });
      return;
    }
    if (!row.google_id) {
      res.status(400).json({ error: 'No Google account is connected.' });
      return;
    }
    if (!hasPassword(row)) {
      res.status(409).json({ error: 'Set a password first so you can still log in.' });
      return;
    }
    await queryRun('UPDATE users SET google_id = NULL, google_email = NULL WHERE id = ?', row.id);
    res.json({ ok: true, user: { ...toPublic(row), googleEmail: null, hasPassword: true } });
  })
);
