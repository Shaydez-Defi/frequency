import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';

const COOKIE = 'token';

export interface SessionUser {
  id: string;
  fullName: string;
  department: string;
  regNumber: string;
}

export function signToken(user: SessionUser): string {
  const secret = process.env.JWT_SECRET ?? 'dev-secret-change-me';
  const expiresIn = process.env.JWT_EXPIRES_IN ?? '7d';
  return jwt.sign(user, secret, { expiresIn } as jwt.SignOptions);
}

export function setAuthCookie(res: Response, token: string): void {
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/'
  });
}

export function clearAuthCookie(res: Response): void {
  res.clearCookie(COOKIE, { path: '/' });
}

export interface PendingGoogle {
  sub: string;
  email: string;
  name: string;
}

const PENDING_COOKIE = 'g_pending';

// Short-lived signed holder for a verified Google identity that has no
// linked student account yet. The subject always comes from Google, never
// from client input: only this server can mint the cookie.
export function setPendingCookie(res: Response, pending: PendingGoogle): void {
  const secret = process.env.JWT_SECRET ?? 'dev-secret-change-me';
  const token = jwt.sign(pending, secret, { expiresIn: '15m' });
  res.cookie(PENDING_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 15 * 60 * 1000,
    path: '/'
  });
}

export function readPendingCookie(req: Request): PendingGoogle | null {
  const token = req.cookies?.[PENDING_COOKIE];
  if (!token) return null;
  try {
    const secret = process.env.JWT_SECRET ?? 'dev-secret-change-me';
    const payload = jwt.verify(token, secret) as PendingGoogle;
    if (!payload.sub || !payload.email) return null;
    return { sub: payload.sub, email: payload.email, name: payload.name ?? '' };
  } catch {
    return null;
  }
}

export function clearPendingCookie(res: Response): void {
  res.clearCookie(PENDING_COOKIE, { path: '/' });
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const token = req.cookies?.[COOKIE] ?? req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    res.status(401).json({ error: 'Not authenticated.' });
    return;
  }
  try {
    const secret = process.env.JWT_SECRET ?? 'dev-secret-change-me';
    const payload = jwt.verify(token, secret) as SessionUser;
    (req as Request & { user: SessionUser }).user = payload;
    next();
  } catch {
    res.status(401).json({ error: 'Session expired. Please log in again.' });
  }
}
