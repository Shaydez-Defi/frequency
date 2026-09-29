import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ApiError } from '../lib/api.js';
import { useAuth } from '../auth/AuthContext.js';
import { BackBar } from '../components/ui.js';

const LOGIN_ERRORS: Record<string, string> = {
  google_not_configured: 'Google sign-in is not set up yet. Use your registration number and password.',
  access_denied: 'Google sign-in was cancelled. Try again.',
  invalid_state: 'That Google attempt expired. Start again.',
  invalid_request: 'That Google attempt was incomplete. Start again.',
  google_failed: 'Google could not verify that attempt. Try again.',
  email_unverified: 'That Google account has an unverified email address.',
  google_conflict: 'That Google account belongs to a different student.'
};

export function GoogleButton() {
  return (
    <a className="gbtn" href="/api/auth/google?intent=login">
      <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
        <path
          fill="#4285F4"
          d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        />
        <path
          fill="#34A853"
          d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        />
        <path
          fill="#FBBC05"
          d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.44 8.55 1 10.22 1 12s.44 3.45 1.18 4.93l3.66-2.84z"
        />
        <path
          fill="#EA4335"
          d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        />
      </svg>
      Continue with Google
    </a>
  );
}

export function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [fullName, setFullName] = useState('');
  const [department, setDepartment] = useState('');
  const [regNumber, setRegNumber] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (!fullName.trim() || !department.trim() || !regNumber.trim()) {
      setError('Fill in your name, department, and registration number.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      await register({ fullName, department, regNumber, password, confirmPassword: confirm });
      navigate('/dashboard');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Registration failed. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="scr">
      <BackBar title="Create your account" onBack={() => navigate('/')} />
      <form onSubmit={submit} noValidate>
        <div className="field">
          <label htmlFor="r-name">Full name</label>
          <input id="r-name" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Charles Okafor" autoComplete="name" />
        </div>
        <div className="field">
          <label htmlFor="r-dept">Department</label>
          <input id="r-dept" value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="Human Nutrition & Dietetics" />
        </div>
        <div className="field">
          <label htmlFor="r-reg">Registration number</label>
          <input id="r-reg" value={regNumber} onChange={(e) => setRegNumber(e.target.value)} placeholder="FEHND/2023/0042" autoComplete="username" />
        </div>
        <div className="field">
          <label htmlFor="r-pass">Password</label>
          <input id="r-pass" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" autoComplete="new-password" />
        </div>
        <div className="field">
          <label htmlFor="r-pass2">Confirm password</label>
          <input id="r-pass2" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="••••••••" autoComplete="new-password" />
        </div>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="btn btn--primary mt8" type="submit" disabled={busy}>
          {busy ? 'Creating account…' : 'Create Account'}
        </button>
      </form>
      <p className="center muted mt16">
        Already have an account?{' '}
        <Link className="linklike" to="/login">
          Log in
        </Link>
      </p>
    </section>
  );
}

export function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [regNumber, setRegNumber] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(LOGIN_ERRORS[params.get('error') ?? ''] ?? '');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (!regNumber.trim() || !password) {
      setError('Enter your registration number and password.');
      return;
    }
    setBusy(true);
    try {
      await login({ regNumber, password });
      navigate('/dashboard');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Login failed. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="scr">
      <BackBar title="Welcome back" onBack={() => navigate('/')} />
      <GoogleButton />
      <div className="ordivider" aria-hidden="true">
        <span>OR</span>
      </div>
      <form onSubmit={submit} noValidate>
        <div className="field">
          <label htmlFor="l-reg">Registration number</label>
          <input id="l-reg" value={regNumber} onChange={(e) => setRegNumber(e.target.value)} placeholder="FEHND/2023/0042" autoComplete="username" />
        </div>
        <div className="field">
          <label htmlFor="l-pass">Password</label>
          <input id="l-pass" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" autoComplete="current-password" />
        </div>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="btn btn--primary mt8" type="submit" disabled={busy}>
          {busy ? 'Logging in…' : 'Log In'}
        </button>
      </form>
      <p className="center muted mt16">
        Don&apos;t have an account?{' '}
        <Link className="linklike" to="/register">
          Create account
        </Link>
      </p>
    </section>
  );
}
