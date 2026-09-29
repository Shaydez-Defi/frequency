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
