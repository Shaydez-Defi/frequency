import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { ApiError, api } from '../lib/api.js';
import type { PublicUser } from '../lib/api.js';

interface AuthState {
  user: PublicUser | null;
  loading: boolean;
  error: string | null;
  register: (input: { fullName: string; department: string; regNumber: string; password: string; confirmPassword: string }) => Promise<void>;
  login: (input: { regNumber: string; password: string }) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .me()
      .then((r) => setUser(r.user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const register: AuthState['register'] = useCallback(async (input) => {
    setError(null);
    try {
      const r = await api.register(input);
      setUser(r.user);
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Registration failed.';
      setError(msg);
      throw e;
    }
  }, []);

  const login: AuthState['login'] = useCallback(async (input) => {
    setError(null);
    try {
      const r = await api.login(input);
      setUser(r.user);
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Login failed.';
      setError(msg);
      throw e;
    }
  }, []);

  const logout = useCallback(async () => {
    await api.logout().catch(() => undefined);
    setUser(null);
  }, []);

  const refresh = useCallback(async () => {
    const r = await api.me();
    setUser(r.user);
  }, []);

  const value = useMemo(() => ({ user, loading, error, register, login, logout, refresh }), [user, loading, error, register, login, logout, refresh]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
