import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api, ApiError, dataChanged, onDataChanged } from '../lib/api';
import { fmtDateTime, humanize, MODE_DESC, MODE_LABEL } from '../lib/format';
import type { Mode } from '../lib/types';
import { useApp } from '../components/AppContext';
import { Field } from '../components/Field';
import { Icon } from '../components/Icon';

type Tab = 'workspace' | 'account' | 'data';

function Workspace() {
  const { prefs, updatePrefs, toast } = useApp();
  if (!prefs) return <div className="skeleton" />;
  return (
    <div className="stack">
      <section className="panel">
        <header className="panel-head"><span className="code">ROLE</span><h2>Academic mode</h2></header>
        <div className="panel-body stack">
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>
            Your professional role. Change it when you transfer offices or receive a faculty appointment. It sets the
            default order of the Central Nexus and is shown in the top bar.
          </p>
          <div className="cap-grid">
            {(Object.keys(MODE_LABEL) as Mode[]).map((m) => (
              <button key={m} className="cap" style={{ textAlign: 'left', cursor: 'pointer', borderColor: prefs.academic_mode === m ? 'var(--orange-line)' : undefined, background: prefs.academic_mode === m ? 'var(--orange-dim)' : undefined }}
                aria-pressed={prefs.academic_mode === m}
                onClick={async () => { await updatePrefs({ academic_mode: m }); dataChanged(); toast(`Academic mode: ${MODE_LABEL[m]}`, 'ok'); }}>
                <h3 style={{ color: prefs.academic_mode === m ? 'var(--orange)' : undefined }}>{MODE_LABEL[m]}</h3>
                <span className="muted" style={{ fontSize: 13 }}>{MODE_DESC[m]}</span>
              </button>
            ))}
          </div>
        </div>
      </section>
      <section className="panel">
        <header className="panel-head"><span className="code">LAY</span><h2>Layout</h2></header>
        <div className="panel-body stack">
          <div className="between wrap">
            <div><div>Central Nexus widgets</div><div className="faint" style={{ fontSize: 13 }}>{prefs.layout_customised ? 'Customised order and visibility' : 'Using the default for your academic mode'}</div></div>
            <button className="btn btn-sm" disabled={!prefs.layout_customised} onClick={async () => { await updatePrefs({ dashboard_layout: null }); dataChanged(); toast('Layout reset', 'ok'); }}><Icon name="restore" />Reset</button>
          </div>
          <label className="checkline"><input type="checkbox" className="check" checked={prefs.sidebar_collapsed} onChange={(e) => updatePrefs({ sidebar_collapsed: e.target.checked })} />Collapse navigation sidebar</label>
          <label className="checkline"><input type="checkbox" className="check" checked={prefs.context_panel_open} onChange={(e) => updatePrefs({ context_panel_open: e.target.checked })} />Open the context panel by default (wide screens)</label>
        </div>
      </section>
    </div>
  );
}

function Account() {
  const { user, toast, logout } = useApp();
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (next !== confirm) { setErrors({ confirm: 'Passwords do not match' }); return; }
    setBusy(true); setErrors({});
    try {
      await api.post('/auth/password', { current_password: cur, new_password: next });
      setCur(''); setNext(''); setConfirm(''); toast('Password changed. Other sessions were signed out.', 'ok');
    } catch (err) {
      if (err instanceof ApiError) setErrors(err.details || { new_password: err.message });
    } finally { setBusy(false); }
  }
  return (
    <div className="stack">
      <section className="panel">
        <header className="panel-head"><span className="code">ACC</span><h2>Account</h2></header>
        <div className="panel-body between wrap">
          <div><div className="label">Signed in as</div><div className="mt-2">{user.email}</div></div>
          <button className="btn" onClick={logout}><Icon name="logout" />Sign out</button>
        </div>
      </section>
      <section className="panel">
        <header className="panel-head"><span className="code">SEC</span><h2>Change password</h2></header>
        <form className="panel-body form-grid" onSubmit={submit}>
          <Field label="Current password" error={errors.current_password} className="span-2">
            <input className="input" type="password" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} required />
          </Field>
          <Field label="New password" hint="At least 10 characters." error={errors.new_password || errors.password}>
            <input className="input" type="password" autoComplete="new-password" minLength={10} value={next} onChange={(e) => setNext(e.target.value)} required />
          </Field>
          <Field label="Confirm new password" error={errors.confirm}>
            <input className="input" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
          </Field>
          <div className="span-2"><button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Change password'}</button></div>
        </form>
      </section>
    </div>
  );
}

interface BinItem { type: string; label: string; id: number; title: string; deleted_at: string }
interface AuditItem { id: number; entity_type: string; entity_id: number | null; action: string; summary: string; at: string }

function Data() {
  const { toast } = useApp();
  const [bin, setBin] = useState<BinItem[] | null>(null);
  const [log, setLog] = useState<AuditItem[] | null>(null);
  const load = useCallback(() => {
    api.get<{ items: BinItem[] }>('/recycle-bin').then((d) => setBin(d.items)).catch(() => setBin([]));
    api.get<AuditItem[]>('/audit?limit=60').then(setLog).catch(() => setLog([]));
  }, []);
  useEffect(() => { load(); return onDataChanged(load); }, [load]);

  async function restore(it: BinItem) {
    try { await api.post(`/records/${it.type}/${it.id}/restore`); dataChanged(); toast(`Restored “${it.title}”`, 'ok'); }
    catch (e) { toast((e as Error).message, 'error'); }
  }

  return (
    <div className="stack">
      <section className="panel">
        <header className="panel-head"><span className="code">EXP</span><h2>Export all records</h2></header>
        <div className="panel-body between wrap">
          <p className="muted" style={{ margin: 0, fontSize: 13, maxWidth: '62ch' }}>
            Downloads every structured record you own as a single JSON file, so you are never locked in. The file includes
            decrypted licence registration numbers, so store it securely.
          </p>
          <a className="btn btn-primary" href="/api/export" download><Icon name="download" />Download export</a>
        </div>
      </section>
      <section className="panel">
        <header className="panel-head"><span className="code">BIN</span><h2>Recycle bin</h2><span className="num faint">{bin?.length ?? '…'}</span></header>
        <div className="panel-body">
          {!bin ? <div className="skeleton" /> : bin.length === 0 ? <div className="empty">The recycle bin is empty.</div> : (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Record</th><th>Type</th><th>Deleted</th><th /></tr></thead>
                <tbody>
                  {bin.map((it) => (
                    <tr key={`${it.type}-${it.id}`}>
                      <td>{it.title}</td><td className="muted">{it.label}</td><td className="num faint">{fmtDateTime(it.deleted_at)}</td>
                      <td style={{ textAlign: 'right' }}><button className="btn btn-sm" onClick={() => restore(it)}><Icon name="restore" />Restore</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
      <section className="panel">
        <header className="panel-head"><span className="code">LOG</span><h2>Audit trail</h2></header>
        <div className="panel-body">
          {!log ? <div className="skeleton" /> : log.length === 0 ? <div className="empty">No activity yet.</div> : (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>When</th><th>Action</th><th>Detail</th></tr></thead>
                <tbody>
                  {log.map((a) => (
                    <tr key={a.id}>
                      <td className="num faint" style={{ whiteSpace: 'nowrap' }}>{fmtDateTime(a.at)}</td>
                      <td><span className={`tag ${a.action === 'delete' ? 'red' : a.action === 'create' ? 'violet' : ''}`}>{humanize(a.action)}</span></td>
                      <td className="muted">{a.summary}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

export function SettingsPage() {
  const [tab, setTab] = useState<Tab>('workspace');
  return (
    <div className="page" style={{ maxWidth: 1080 }}>
      <div className="page-head">
        <div>
          <div className="crumb"><span className="bar" /><span className="label">System · Settings</span></div>
          <h1 className="display">Settings</h1>
        </div>
      </div>
      <div className="tabs" role="tablist">
        {(['workspace', 'account', 'data'] as Tab[]).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>{t === 'data' ? 'Data & recovery' : humanize(t)}</button>
        ))}
      </div>
      {tab === 'workspace' && <Workspace />}
      {tab === 'account' && <Account />}
      {tab === 'data' && <Data />}
    </div>
  );
}
