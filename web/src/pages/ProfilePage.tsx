import { useEffect, useState, type FormEvent } from 'react';
import { api, ApiError, dataChanged } from '../lib/api';
import { fmtDateTime } from '../lib/format';
import { useApp } from '../components/AppContext';
import { Field } from '../components/Field';
import { Icon } from '../components/Icon';
import { PortfolioShell } from './PortfolioPage';
import { AutoText } from '../components/AutoText';
import { useDirty } from '../lib/dirty';

type Profile = Record<string, string | null> & { updated_at?: string };

const SECTIONS: { title: string; code: string; fields: { name: string; label: string; long?: boolean; hint?: string; type?: string }[] }[] = [
  {
    title: 'Identity', code: 'ID',
    fields: [
      { name: 'full_name', label: 'Full name' },
      { name: 'professional_title', label: 'Professional title', hint: 'e.g. Administrative Aide IV' },
      { name: 'academic_designation', label: 'Academic designation', hint: 'e.g. LPT, MAEd' },
      { name: 'specialization', label: 'Academic specialization' },
      { name: 'research_interests', label: 'Research interests', long: true },
      { name: 'biography', label: 'Professional biography', long: true, hint: 'Used later for short CV biographies.' },
    ],
  },
  {
    title: 'Current role', code: 'POS',
    fields: [
      { name: 'current_position', label: 'Current position' },
      { name: 'current_office', label: 'Office or department' },
      { name: 'current_institution', label: 'Institution' },
      { name: 'career_goal', label: 'Next appointment target', hint: 'e.g. Instructor I. Shown on the Central Nexus.' },
    ],
  },
  {
    title: 'Contact', code: 'CON',
    fields: [
      { name: 'email', label: 'Professional email', type: 'email' },
      { name: 'phone', label: 'Phone', type: 'tel' },
      { name: 'website', label: 'Website or ORCID', type: 'url' },
      { name: 'address', label: 'Address' },
    ],
  },
];

export function ProfilePage() {
  const { toast, setProfileName } = useApp();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [draft, setDraft] = useState<Profile>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get<Profile>('/profile').then((p) => { setProfile(p); setDraft(p); });
  }, []);

  const dirty = profile && SECTIONS.some((s) => s.fields.some((f) => (draft[f.name] || '') !== (profile[f.name] || '')));

  useDirty('profile', !!dirty);

  async function save(e: FormEvent) {
    e.preventDefault();
    const body: Record<string, string | null> = {};
    for (const s of SECTIONS) for (const f of s.fields) body[f.name] = draft[f.name] ?? null;
    setBusy(true); setErrors({});
    try {
      const p = await api.put<Profile>('/profile', body);
      setProfile(p); setDraft(p); setProfileName(p.full_name); dataChanged(); toast('Professional profile saved', 'ok');
    } catch (err) {
      if (err instanceof ApiError) { setErrors(err.details || {}); toast(err.message, 'error'); }
    } finally { setBusy(false); }
  }

  return (
    <PortfolioShell title="Professional Profile" crumb="Profile" sub="The foundation of your academic identity. CVs and reports draw on it. Professional photographs are managed in the CV Studio (Phase 3).">
      {!profile ? <div className="skeleton" style={{ height: 200 }} /> : (
        <form onSubmit={save} className="stack">
          {SECTIONS.map((s) => (
            <section key={s.title} className="panel">
              <header className="panel-head"><span className="code">{s.code}</span><h2>{s.title}</h2></header>
              <div className="panel-body form-grid">
                {s.fields.map((f) => (
                  <Field key={f.name} label={f.label} hint={f.hint} error={errors[f.name]} className={f.long ? 'span-2' : ''}>
                    {f.long
                      ? <textarea className="textarea" value={draft[f.name] || ''} onChange={(e) => setDraft((d) => ({ ...d, [f.name]: e.target.value }))} />
                      : f.type ? <input className="input" type={f.type} value={draft[f.name] || ''} onChange={(e) => setDraft((d) => ({ ...d, [f.name]: e.target.value }))} />
                      : <AutoText value={draft[f.name] || ''} onChange={(v) => setDraft((d) => ({ ...d, [f.name]: v }))} />}
                  </Field>
                ))}
              </div>
            </section>
          ))}
          <div className="panel" style={{ position: 'sticky', bottom: 'var(--s-4)', zIndex: 2 }}>
            <div className="panel-body between wrap" style={{ padding: 'var(--s-3) var(--s-4)' }}>
              <span className="faint" style={{ fontSize: 13 }}>
                {dirty ? 'Unsaved changes' : profile.updated_at ? `Last saved ${fmtDateTime(profile.updated_at)}` : ''}
              </span>
              <div className="row">
                <button type="button" className="btn btn-ghost" disabled={!dirty || busy} onClick={() => { setDraft(profile); setErrors({}); }}>Discard</button>
                <button type="submit" className="btn btn-primary" disabled={!dirty || busy}><Icon name="check" />{busy ? 'Saving…' : 'Save profile'}</button>
              </div>
            </div>
          </div>
        </form>
      )}
    </PortfolioShell>
  );
}
