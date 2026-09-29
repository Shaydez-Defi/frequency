import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError, api } from '../lib/api.js';
import { useAuth } from '../auth/AuthContext.js';
import { Icon } from '../components/Icons.js';

export function Profile() {
  const { user, logout, refresh } = useAuth();
  const navigate = useNavigate();

  const [fullName, setFullName] = useState<string | null>(null);
  const [department, setDepartment] = useState<string | null>(null);
  const [profileMsg, setProfileMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [profileBusy, setProfileBusy] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passMsg, setPassMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [passBusy, setPassBusy] = useState(false);

  const [googleMsg, setGoogleMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [googleBusy, setGoogleBusy] = useState(false);

  if (!user) return null;

  const saveProfile = async (e: FormEvent) => {
    e.preventDefault();
    setProfileMsg(null);
    const body: { fullName?: string; department?: string } = {};
    if ((fullName ?? user.fullName).trim() !== user.fullName) body.fullName = (fullName ?? user.fullName).trim();
    if ((department ?? user.department).trim() !== user.department) body.department = (department ?? user.department).trim();
    if (Object.keys(body).length === 0) {
      setProfileMsg({ kind: 'error', text: 'No changes to save.' });
      return;
    }
    setProfileBusy(true);
    try {
      await api.updateProfile(body);
      await refresh();
      setFullName(null);
      setDepartment(null);
      setProfileMsg({ kind: 'ok', text: 'Profile updated.' });
    } catch (err) {
      setProfileMsg({ kind: 'error', text: err instanceof ApiError ? err.message : 'Could not update. Try again.' });
    } finally {
      setProfileBusy(false);
    }
  }

  const savePassword = async (e: FormEvent) => {
    e.preventDefault();
    setPassMsg(null);
    if (newPassword !== confirmPassword) {
      setPassMsg({ kind: 'error', text: 'New passwords do not match.' });
      return;
    }
    setPassBusy(true);
    try {
      if (user.hasPassword) {
        await api.changePassword({ currentPassword, newPassword, confirmPassword });
      } else {
        await api.setupPassword({ newPassword, confirmPassword });
        await refresh();
      }
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPassMsg({ kind: 'ok', text: user.hasPassword ? 'Password changed.' : 'Password set. You can now log in with it.' });
    } catch (err) {
      setPassMsg({ kind: 'error', text: err instanceof ApiError ? err.message : 'Could not save password. Try again.' });
    } finally {
      setPassBusy(false);
    }
  };

  const onDisconnectGoogle = async () => {
    setGoogleMsg(null);
    setGoogleBusy(true);
    try {
      await api.googleDisconnect();
      await refresh();
      setGoogleMsg({ kind: 'ok', text: 'Google account disconnected.' });
    } catch (err) {
      setGoogleMsg({ kind: 'error', text: err instanceof ApiError ? err.message : 'Could not disconnect. Try again.' });
    } finally {
      setGoogleBusy(false);
    }
  };

  const onLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <section className="scr">
      <div className="topbar">
        <button className="backbtn" onClick={() => navigate('/dashboard')} aria-label="Back">
          <Icon name="back" size={18} />
        </button>
        <span className="screentitle">Profile</span>
      </div>

      <div className="card profcard">
        <div className="profav">{user.fullName.charAt(0).toUpperCase()}</div>
        <div className="profname">{user.fullName}</div>
        <div className="profdept">{user.department}</div>
      </div>

      <div className="card" style={{ padding: '6px 18px' }}>
        <div className="lrow">
          <span>Registration Number</span>
          <span className="lrow__v num">{user.regNumber}</span>
        </div>
      </div>
      <p className="muted">Your registration number identifies your account and cannot be changed.</p>

      <div className="acctlbl">Edit Profile</div>
      <form className="card" onSubmit={saveProfile} noValidate>
        <div className="field">
          <label htmlFor="p-name">Full name</label>
          <input id="p-name" value={fullName ?? user.fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" />
        </div>
        <div className="field" style={{ marginBottom: 6 }}>
          <label htmlFor="p-dept">Department</label>
          <input id="p-dept" value={department ?? user.department} onChange={(e) => setDepartment(e.target.value)} />
        </div>
        {profileMsg && (
          <p className={profileMsg.kind === 'ok' ? 'form-ok' : 'form-error'} role={profileMsg.kind === 'ok' ? 'status' : 'alert'}>
            {profileMsg.text}
          </p>
        )}
        <button className="btn btn--dark mt8" type="submit" disabled={profileBusy}>
          {profileBusy ? 'Saving…' : 'Save Changes'}
        </button>
      </form>

      <div className="acctlbl">Google Account</div>
      <div className="card">
        {user.googleEmail ? (
          <>
            <p className="muted" style={{ marginTop: 0 }}>
              Connected: <strong className="num">{user.googleEmail}</strong>
            </p>
            <p className="muted">You can log in with this Google account or your password.</p>
          </>
        ) : (
          <p className="muted" style={{ marginTop: 0 }}>
            Not connected. Link Google as a backup way to access this account.
          </p>
        )}
        {googleMsg && (
          <p className={googleMsg.kind === 'ok' ? 'form-ok' : 'form-error'} role={googleMsg.kind === 'ok' ? 'status' : 'alert'}>
            {googleMsg.text}
          </p>
        )}
        {user.googleEmail ? (
          <button className="btn btn--dark mt8" type="button" disabled={googleBusy} onClick={onDisconnectGoogle}>
            {googleBusy ? 'Working…' : 'Disconnect Google'}
          </button>
        ) : (
          <a className="btn btn--dark mt8" style={{ textDecoration: 'none' }} href="/api/auth/google?intent=link">
            Connect Google
          </a>
        )}
      </div>

      <div className="acctlbl">{user.hasPassword ? 'Change Password' : 'Set a Password'}</div>
      <form className="card" onSubmit={savePassword} noValidate>
        {user.hasPassword && (
          <div className="field">
            <label htmlFor="p-cur">Current password</label>
            <input id="p-cur" type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} autoComplete="current-password" />
          </div>
        )}
        <div className="field">
          <label htmlFor="p-new">New password</label>
          <input id="p-new" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="At least 8 characters" autoComplete="new-password" />
        </div>
        <div className="field" style={{ marginBottom: 6 }}>
          <label htmlFor="p-new2">Confirm new password</label>
          <input id="p-new2" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} autoComplete="new-password" />
        </div>
        {passMsg && (
          <p className={passMsg.kind === 'ok' ? 'form-ok' : 'form-error'} role={passMsg.kind === 'ok' ? 'status' : 'alert'}>
            {passMsg.text}
          </p>
        )}
        <button className="btn btn--dark mt8" type="submit" disabled={passBusy}>
          {passBusy ? 'Updating…' : 'Update Password'}
        </button>
      </form>

      <div className="acctlbl">Account</div>
      <div className="card" style={{ padding: '6px 18px' }}>
        <button className="lrow lrow--danger" onClick={onLogout}>
          <span>Log Out</span>
        </button>
      </div>
    </section>
  );
}
