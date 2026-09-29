import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ApiError, api } from '../lib/api.js';
import { useAuth } from '../auth/AuthContext.js';
import { BackBar } from '../components/ui.js';

export function CompleteProfile() {
  const { refresh } = useAuth();
  const navigate = useNavigate();
  const [fullName, setFullName] = useState('');
  const [department, setDepartment] = useState('');
  const [regNumber, setRegNumber] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (!fullName.trim() || !department.trim() || !regNumber.trim()) {
      setError('Fill in your name, department, and registration number.');
      return;
    }
    setBusy(true);
    try {
      await api.googleComplete({ fullName, department, regNumber });
      await refresh();
      navigate('/dashboard');
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setError('Google session expired. Start again from Log in.');
      } else {
        setError(err instanceof ApiError ? err.message : 'Could not finish setup. Try again.');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="scr">
      <BackBar title="Complete your profile" onBack={() => navigate('/login')} />
      <p className="muted" style={{ marginTop: 0 }}>
        You signed in with Google. Your Google email is attached automatically. Add your
        academic details once to create your student record.
      </p>
      <form onSubmit={submit} noValidate>
        <div className="field">
          <label htmlFor="c-name">Full name</label>
          <input id="c-name" value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" />
        </div>
        <div className="field">
          <label htmlFor="c-dept">Department</label>
          <input id="c-dept" value={department} onChange={(e) => setDepartment(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="c-reg">Registration number</label>
          <input id="c-reg" value={regNumber} onChange={(e) => setRegNumber(e.target.value)} autoComplete="username" />
        </div>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="btn btn--primary mt8" type="submit" disabled={busy}>
          {busy ? 'Creating account…' : 'Finish Setup'}
        </button>
      </form>
      <p className="center muted mt16">
        <Link className="linklike" to="/login">
          Back to Log in
        </Link>
      </p>
    </section>
  );
}
