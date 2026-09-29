import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { loginSchema, registerSchema, updateProfileSchema, changePasswordSchema } from '@frequency/shared/schemas';
import { queryGet, queryRun } from '../db.js';
import { clearAuthCookie, requireAuth, setAuthCookie, signToken } from '../auth.js';

interface UserRow {
  id: string;
  full_name: string;
  department: string;
  reg_number: string;
  password_hash: string;
}

const toPublic = (row: UserRow) => ({
  id: row.id,
  fullName: row.full_name,
  department: row.department,
  regNumber: row.reg_number
});

export const authRouter = Router();

authRouter.post('/register', (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Check the highlighted fields.', details: parsed.error.flatten().fieldErrors });
    return;
  }
  const { fullName, department, regNumber, password } = parsed.data;
  const existing = queryGet<{ id: string }>('SELECT id FROM users WHERE reg_number = ?', regNumber);
  if (existing) {
    res.status(409).json({ error: 'This registration number is already registered. Try logging in.' });
    return;
  }
  const password_hash = bcrypt.hashSync(password, 12);
  const id = randomUUID();
  queryRun(
    'INSERT INTO users (id, full_name, department, reg_number, password_hash) VALUES (?, ?, ?, ?, ?)',
    id,
    fullName.trim(),
    department.trim(),
    regNumber,
    password_hash
  );
  const user = { id, fullName: fullName.trim(), department: department.trim(), regNumber };
  setAuthCookie(res, signToken(user));
  res.status(201).json({ user });
});

authRouter.post('/login', (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Enter your registration number and password.' });
    return;
  }
  const { regNumber, password } = parsed.data;
  const row = queryGet<UserRow>('SELECT * FROM users WHERE reg_number = ?', regNumber);
  if (!row || !bcrypt.compareSync(password, row.password_hash)) {
    res.status(401).json({ error: 'Invalid registration number or password.' });
    return;
  }
  const user = toPublic(row);
  setAuthCookie(res, signToken(user));
  res.json({ user });
});

authRouter.post('/logout', (_req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

authRouter.get('/me', requireAuth, (req, res) => {
  const session = (req as typeof req & { user: UserRow }).user;
  const row = queryGet<UserRow>('SELECT * FROM users WHERE id = ?', (session as unknown as { id: string }).id);
  if (!row) {
    res.status(401).json({ error: 'Account no longer exists.' });
    return;
  }
  res.json({ user: toPublic(row) });
});

function sessionId(req: unknown): string {
  return (req as { user: { id: string } }).user.id;
}

// Registration number is the immutable login identifier: editable name/department only.
authRouter.patch('/profile', requireAuth, (req, res) => {
  const parsed = updateProfileSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Check the highlighted fields.', details: parsed.error.flatten().fieldErrors });
    return;
  }
  const row = queryGet<UserRow>('SELECT * FROM users WHERE id = ?', sessionId(req));
  if (!row) {
    res.status(401).json({ error: 'Account no longer exists.' });
    return;
  }
  const fullName = parsed.data.fullName?.trim() ?? row.full_name;
  const department = parsed.data.department?.trim() ?? row.department;
  queryRun('UPDATE users SET full_name = ?, department = ? WHERE id = ?', fullName, department, row.id);
  const user = { id: row.id, fullName, department, regNumber: row.reg_number };
  setAuthCookie(res, signToken(user));
  res.json({ user });
});

authRouter.post('/password', requireAuth, (req, res) => {
  const parsed = changePasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Check the highlighted fields.', details: parsed.error.flatten().fieldErrors });
    return;
  }
  const row = queryGet<UserRow>('SELECT * FROM users WHERE id = ?', sessionId(req));
  if (!row) {
    res.status(401).json({ error: 'Account no longer exists.' });
    return;
  }
  if (!bcrypt.compareSync(parsed.data.currentPassword, row.password_hash)) {
    res.status(401).json({ error: 'Current password is incorrect.' });
    return;
  }
  queryRun('UPDATE users SET password_hash = ? WHERE id = ?', bcrypt.hashSync(parsed.data.newPassword, 12), row.id);
  res.json({ ok: true });
});
