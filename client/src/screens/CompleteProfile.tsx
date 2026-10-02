import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ApiError, api } from '../lib/api.js';
import { useAuth } from '../auth/AuthContext.js';
import { BackBar } from '../components/ui.js';

export function CompleteProfile() {
  const { refresh } = useAuth();
  const navigate = useNavigate();
  const [googleEmail, setGoogleEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [department, setDepartment] = useState('');
  const [regNumber, setRegNumber] = useState('');
  const [claim, setClaim] = useState(false);
  const [needsClaim, setNeedsClaim] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .googlePending()
      .then((r) => {
        setGoogleEmail(r.pending.email);
        if (r.pending.name) setFullName(r.pending.name);
      })
      .catch(() => setError('Google session expired. Start again from Continue with Google.'))
      .finally(() => setLoading(false));
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (!fullName.trim() || !department.trim() || !regNumber.trim()) {
      setError('Fill in your name, department, and registration number.');
      return;
    }
    setBusy(true);
    try {
      await api.googleComplete({ fullName, department, regNumber, claimExisting: needsClaim ? claim : undefined });
      await refresh();
      navigate('/dashboard');
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setError('Google session expired. Start again from Continue with Google.');
      } else if (err instanceof ApiError && err.code === 'NEEDS_CLAIM') {
        setNeedsClaim(true);
        setError('');
      } else {
        setError(err instanceof ApiError ? err.message : 'Could not finish setup. Try again.');
      }
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <p style={{ padding: 24 }}>Loading…</p>;

  return (
    <section className="scr">
      <BackBar title="Complete your profile" onBack={() => navigate('/')} />
      <p className="muted" style={{ marginTop: 0 }}>
        Signed in as <strong className="num">{googleEmail || 'your Google account'}</strong>. Add your
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
        {needsClaim && (
          <div className="card" style={{ marginBottom: 14 }}>
            <p className="muted" style={{ marginTop: 0 }}>
              This registration number already has academic records from the old login. Only continue if
              those records are yours: linking moves them under this Google account.
            </p>
            <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 14 }}>
              <input type="checkbox" checked={claim} onChange={(e) => setClaim(e.target.checked)} style={{ marginTop: 3 }} />
              Yes, these are my records. Link this Google account to them.
            </label>
          </div>
        )}
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="btn btn--primary mt8" type="submit" disabled={busy || (needsClaim && !claim)}>
          {busy ? 'Creating account…' : 'Continue'}
        </button>
      </form>
      <p className="center muted mt16">
        <Link className="linklike" to="/">
          Back home
        </Link>
      </p>
    </section>
  );
}
