import { useState, type FormEvent } from 'react';
import { api, ApiError } from '../lib/api';
import type { User } from '../lib/types';
import { BrandMark } from '../components/Icon';
import { Field } from '../components/Field';

function Rings() {
  return (
    <svg className="rings" viewBox="0 0 600 600" aria-hidden="true">
      <g fill="none">
        <circle cx="300" cy="300" r="290" stroke="rgba(255,255,255,.06)" />
        <circle cx="300" cy="300" r="230" stroke="rgba(139,108,240,.35)" strokeDasharray="2 10" />
        <circle cx="300" cy="300" r="170" stroke="rgba(255,255,255,.08)" />
        <circle cx="300" cy="300" r="110" stroke="rgba(240,138,36,.45)" strokeDasharray="60 14 6 14" />
        <path d="M300 60 L508 420 H92 Z" stroke="rgba(240,138,36,.35)" />
        <path d="M300 10V590M10 300H590" stroke="rgba(255,255,255,.05)" />
        <circle cx="300" cy="300" r="26" fill="rgba(139,108,240,.55)" />
      </g>
    </svg>
  );
}

export function AuthScreen({ setup, onAuthed }: { setup: boolean; onAuthed: (u: User) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [name, setName] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErrors({}); setFormError('');
    if (setup && password !== confirm) { setErrors({ confirm: 'Passwords do not match' }); return; }
    setBusy(true);
    try {
      const res = setup
        ? await api.post<{ user: User }>('/auth/setup', { email, password, full_name: name })
        : await api.post<{ user: User }>('/auth/login', { email, password });
      onAuthed(res.user);
    } catch (err) {
      if (err instanceof ApiError) { setErrors(err.details || {}); setFormError(err.message); }
      else setFormError('Could not reach the SYNCHRONIA server.');
    } finally { setBusy(false); }
  }

  return (
    <div className="auth">
      <div className="auth-hero">
        <Rings />
        <div className="row" style={{ position: 'relative' }}>
          <BrandMark className="brand-mark" />
          <span className="label">The Academic Ascension System</span>
        </div>
        <div style={{ position: 'relative' }}>
          <div className="wordmark display">SYNCHRONIA</div>
          <div className="tagline">Synchronize · Evolve · Transcend</div>
        </div>
        <div className="meta hide-mobile">
          {[['01', 'Academic Workspace'], ['02', 'Professional Portfolio'], ['03', 'Curriculum Vitae Studio'], ['04', 'Intelligence']].map(([c, l]) => (
            <div key={c}><div className="num" style={{ color: 'var(--violet-2)', fontSize: 12 }}>{c}</div><div className="label" style={{ color: 'var(--text-2)' }}>{l}</div></div>
          ))}
        </div>
      </div>
      <form className="auth-form" onSubmit={submit} noValidate>
        <div>
          <div className="label" style={{ color: 'var(--orange)' }}>{setup ? 'Initialisation' : 'Authentication'}</div>
          <h1 className="display mt-2">{setup ? 'Begin synchronization' : 'Sign in'}</h1>
          <p className="muted" style={{ fontSize: 13 }}>
            {setup ? 'Create the owner account for this SYNCHRONIA installation. Your records stay in your own database.' : 'Welcome back.'}
          </p>
        </div>
        {formError && !Object.keys(errors).length && <div className="alert" role="alert">{formError}</div>}
        {setup && (
          <Field label="Full name" hint="Starts your professional profile.">
            <input className="input" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
        )}
        <Field label="Email" error={errors.email}>
          <input className="input" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
        </Field>
        <Field label="Password" error={errors.password} hint={setup ? 'At least 10 characters.' : undefined}>
          <input className="input" type="password" autoComplete={setup ? 'new-password' : 'current-password'} value={password} onChange={(e) => setPassword(e.target.value)} required />
        </Field>
        {setup && (
          <Field label="Confirm password" error={errors.confirm}>
            <input className="input" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
          </Field>
        )}
        <button className="btn btn-primary" style={{ height: 42 }} disabled={busy}>{busy ? 'Synchronizing…' : setup ? 'Create account' : 'Sign in'}</button>
      </form>
    </div>
  );
}
