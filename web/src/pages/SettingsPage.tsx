import { useCallback, useEffect, useState } from 'react';
import { desktop } from '../lib/desktop';
import { api, dataChanged, onDataChanged } from '../lib/api';
import { fmtDateTime, humanize, MODE_DESC, MODE_LABEL } from '../lib/format';
import type { Mode } from '../lib/types';
import { useApp } from '../components/AppContext';
import { Icon } from '../components/Icon';

type Tab = 'workspace' | 'application' | 'data';

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

function Application() {
  return (
    <div className="stack">
      <section className="panel">
        <header className="panel-head"><span className="code">APP</span><h2>SYNCHRONIA desktop</h2></header>
        <div className="panel-body">
          <dl className="dl">
            <dt>Version</dt><dd className="mono">{desktop?.version || 'development build'}</dd>
            <dt>Access</dt><dd>Single owner on this computer — no sign-in. A new private access key is created each time the app starts, and the data service only answers inside this app.</dd>
            <dt>Data folder</dt>
            <dd className="mono selectable">{desktop?.dataDir || '—'}
              {desktop && <button className="linkbtn" onClick={() => desktop!.showDataFolder()}>Show in Explorer</button>}
            </dd>
          </dl>
          <p className="faint" style={{ fontSize: 13, marginBottom: 0 }}>
            Back up the whole data folder — it holds your database (<span className="mono">synchronia.db</span>) and the key that decrypts
            license numbers (<span className="mono">secret.key</span>). Uninstalling SYNCHRONIA does not delete it.
          </p>
        </div>
      </section>
    </div>
  );
}

interface BackupInfo { file: string; reason: string; at: string; size_bytes: number }

function Backups() {
  const { toast } = useApp();
  const [list, setList] = useState<BackupInfo[] | null>(null);
  const [status, setStatus] = useState<{ integrity: string; restored: { restored: boolean; file: string } | null } | null>(null);
  const [scheduled, setScheduled] = useState('');
  const load = useCallback(() => {
    api.get<BackupInfo[]>('/system/backups').then(setList).catch(() => setList([]));
    api.get<any>('/system/status').then(setStatus).catch(() => {});
  }, []);
  useEffect(() => { load(); return onDataChanged(load); }, [load]);
  async function backup() {
    try { const b = await api.post<BackupInfo>('/system/backups'); toast(`Backup written: ${b.file}`, 'ok'); load(); } catch (e) { toast((e as Error).message, 'error'); }
  }
  async function check() {
    const r = await api.post<{ integrity: string }>('/system/integrity');
    toast(r.integrity === 'ok' ? 'Database integrity check passed' : `Integrity check failed: ${r.integrity}`, r.integrity === 'ok' ? 'ok' : 'error');
    load();
  }
  async function restore(b: BackupInfo) {
    if (!window.confirm(`Restore the backup from ${fmtDateTime(b.at)}?\n\nChanges made after it will be replaced. Your current data is backed up first, and the restore is applied when SYNCHRONIA restarts.`)) return;
    try { await api.post(`/system/backups/${encodeURIComponent(b.file)}/restore`); setScheduled(b.file); toast('Restore scheduled — restart SYNCHRONIA to apply it', 'ok'); }
    catch (e) { toast((e as Error).message, 'error'); }
  }
  const LABEL: Record<string, string> = { startup: 'Automatic (start-up)', scheduled: 'Automatic (6-hourly)', manual: 'Manual', 'pre-update': 'Before update', 'pre-restore': 'Before restore' };
  return (
    <section className="panel">
      <header className="panel-head"><span className="code">BAK</span><h2>Backups and integrity</h2></header>
      <div className="panel-body stack">
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>
          Every change is written to disk before it is reported as saved. A verified backup is taken automatically at every start and every six hours
          (the newest 15 are kept), and before any database update. Backups contain your records; keep a copy of the data folder elsewhere as well.
        </p>
        {status?.restored && <div className={`alert ${status.restored.restored ? 'info' : ''}`}>{status.restored.restored ? `Restored from ${status.restored.file} at this start.` : `The scheduled restore of ${status.restored.file} could not be verified and was skipped.`}</div>}
        <div className="row wrap">
          <button className="btn btn-primary" onClick={backup}><Icon name="download" />Back up now</button>
          <button className="btn" onClick={check}><Icon name="check" />Check database integrity</button>
          <span className={`tag ${status?.integrity === 'ok' ? 'ok' : 'red'}`}>Integrity: {status ? status.integrity : '…'}</span>
          {scheduled && desktop && <button className="btn btn-accent" onClick={() => desktop!.relaunch()}><Icon name="restore" />Restart now to restore {scheduled}</button>}
        </div>
        {!list ? <div className="skeleton" /> : list.length === 0 ? <div className="empty">No backups yet.</div> : (
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Backup</th><th>Kind</th><th>Taken</th><th>Size</th><th /></tr></thead>
            <tbody>{list.map((b) => (
              <tr key={b.file}><td className="mono" style={{ fontSize: 12 }}>{b.file}</td><td>{LABEL[b.reason] || b.reason}</td>
                <td className="num faint">{fmtDateTime(b.at)}</td><td className="num faint">{(b.size_bytes / 1024).toFixed(0)} KB</td>
                <td style={{ textAlign: 'right' }}><button className="btn btn-sm" onClick={() => restore(b)}><Icon name="restore" />Restore</button></td></tr>
            ))}</tbody>
          </table></div>
        )}
      </div>
    </section>
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
      <Backups />
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
    <div className="page">
      <div className="page-head">
        <div>
          <div className="crumb"><span className="bar" /><span className="label">System · Settings</span></div>
          <h1 className="display">Settings</h1>
        </div>
      </div>
      <div className="tabs" role="tablist">
        {(['workspace', 'data', 'application'] as Tab[]).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>{t === 'data' ? 'Data & recovery' : humanize(t)}</button>
        ))}
      </div>
      {tab === 'workspace' && <Workspace />}
      {tab === 'application' && <Application />}
      {tab === 'data' && <Data />}
    </div>
  );
}
