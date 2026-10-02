import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { Router } from 'express';
import { updateProfileSchema, completeGoogleProfileSchema } from '@frequency/shared/schemas';
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

// Google is the only authentication method. There is no application password:
// no registration, no login form, no change/reset, no hashing anywhere.
interface UserRow {
  id: string;
  full_name: string;
  department: string;
  reg_number: string;
  google_id: string | null;
  google_email: string | null;
}

const toPublic = (row: UserRow) => ({
  id: row.id,
  fullName: row.full_name,
  department: row.department,
  regNumber: row.reg_number,
  googleEmail: row.google_email
});

export const authRouter = Router();

authRouter.post('/logout', (_req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

authRouter.get(
  '/me',
  requireAuth,
  ah(async (req, res) => {
    const session = (req as typeof req & { user: { id: string } }).user;
    const row = await queryGet<UserRow>('SELECT * FROM users WHERE id = ?', session.id);
    if (!row) {
      res.status(401).json({ error: 'Account no longer exists.' });
      return;
    }
    res.json({ user: toPublic(row) });
  })
);

function sessionId(req: unknown): string {
  return (req as { user: { id: string } }).user.id;
}

// Registration number is the immutable login identifier: editable name/department only.
// The Google email is tied to the verified Google identity and is never editable here.
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
    res.json({ user: { ...user, googleEmail: row.google_email } });
  })
);

// ---- Google Sign-In (the only authentication method) ----

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

authRouter.get('/google', (_req, res) => {
  if (!googleConfig()) {
    res.redirect(302, '/login?error=google_not_configured');
    return;
  }
  const state = randomBytes(32).toString('hex');
  res.cookie('g_state', state, OAUTH_COOKIES);
  res.redirect(302, googleAuthUrl(state));
});

authRouter.get(
  '/google/callback',
  ah(async (req, res) => {
    const quit = (code: string, target = '/login') => {
      res.clearCookie('g_state', { path: '/' });
      res.redirect(302, `${target}?error=${code}`);
    };
    if (typeof req.query.error === 'string' && req.query.error.length > 0) {
      quit('access_denied');
      return;
    }
    const savedState = req.cookies?.g_state as string | undefined;
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

    const linked = await queryGet<UserRow>('SELECT * FROM users WHERE google_id = ?', identity.sub);
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

// Verified Google identity waiting for onboarding (read-only email + name hint).
authRouter.get('/google/pending', (req, res) => {
  const pending = readPendingCookie(req);
  if (!pending) {
    res.status(401).json({ error: 'Google session expired. Start again from Continue with Google.' });
    return;
  }
  res.json({ pending: { email: pending.email, name: pending.name } });
});

authRouter.post(
  '/google/complete',
  ah(async (req, res) => {
    const pending = readPendingCookie(req);
    if (!pending) {
      res.status(401).json({ error: 'Google session expired. Start again from Continue with Google.' });
      return;
    }
    const parsed = completeGoogleProfileSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Check the highlighted fields.', details: parsed.error.flatten().fieldErrors });
      return;
    }
    const { fullName, department, regNumber, claimExisting } = parsed.data;
    const existingSub = await queryGet<{ id: string }>('SELECT id FROM users WHERE google_id = ?', pending.sub);
    if (existingSub) {
      res.status(409).json({ error: 'This Google account is already linked to another student.' });
      return;
    }
    const existingReg = await queryGet<UserRow>('SELECT * FROM users WHERE reg_number = ?', regNumber);
    if (existingReg) {
      if (existingReg.google_id) {
        res.status(409).json({ error: 'This registration number is already registered. Continue with Google instead.' });
        return;
      }
      // Legacy (pre-Google) account with records but no Google identity. Never
      // attach silently: the owner must explicitly confirm the takeover.
      if (claimExisting !== true) {
        res.status(409).json({
          error: 'This registration number already has academic records. Confirm that you own it to link this Google account.',
          code: 'NEEDS_CLAIM'
        });
        return;
      }
      await queryRun(
        'UPDATE users SET full_name = ?, department = ?, google_id = ?, google_email = ? WHERE id = ?',
        fullName.trim(),
        department.trim(),
        pending.sub,
        pending.email,
        existingReg.id
      );
      clearPendingCookie(res);
      const user = { id: existingReg.id, fullName: fullName.trim(), department: department.trim(), regNumber };
      setAuthCookie(res, signToken(user));
      res.json({ user: { ...user, googleEmail: pending.email }, claimed: true });
      return;
    }
    const id = randomUUID();
    await queryRun(
      'INSERT INTO users (id, full_name, department, reg_number, google_id, google_email) VALUES (?, ?, ?, ?, ?, ?)',
      id,
      fullName.trim(),
      department.trim(),
      regNumber,
      pending.sub,
      pending.email
    );
    clearPendingCookie(res);
    const user = { id, fullName: fullName.trim(), department: department.trim(), regNumber };
    setAuthCookie(res, signToken(user));
    res.status(201).json({ user: { ...user, googleEmail: pending.email } });
  })
);
