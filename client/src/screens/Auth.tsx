import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ApiError } from '../lib/api.js';
import { useAuth } from '../auth/AuthContext.js';
import { BackBar } from '../components/ui.js';

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
  const [regNumber, setRegNumber] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
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
