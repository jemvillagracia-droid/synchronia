import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { desktop } from '../lib/desktop';
import { api, dataChanged, onDataChanged } from '../lib/api';
import { fmtDateTime, humanize } from '../lib/format';
import { useApp } from '../components/AppContext';
import { Icon } from '../components/Icon';
import { download } from '../lib/download';
import { InstitutionSettings } from './InstitutionSettings';
import { THEMES, applyTheme } from '../lib/themes';
import { alarmPlaying, onAlarmChange, playBattleLoop, playCue, stopAlarm } from '../lib/alarm';

type Tab = 'workspace' | 'appearance' | 'documents' | 'data' | 'application';
const TABS: [Tab, string][] = [['workspace', 'Workspace and navigation'], ['appearance', 'Appearance'], ['documents', 'Document export'], ['data', 'Backup and recovery'], ['application', 'Security and privacy']];

/** Alarm sound: the original battle march (loops until you respond) or simple beeps, with volume and a preview. */
function AlarmSound() {
  const { prefs, updatePrefs, toast } = useApp();
  const [vol, setVol] = useState(prefs?.alarm_volume ?? 70);
  const [music, setMusic] = useState(alarmPlaying());
  useEffect(() => onAlarmChange(setMusic), []);
  useEffect(() => () => stopAlarm(0.2), []);
  useEffect(() => { setVol(prefs?.alarm_volume ?? 70); }, [prefs?.alarm_volume]);
  if (!prefs) return null;
  const style = prefs.alarm_style || 'battle';
  const off = prefs.notify_sound === false;
  async function preview() {
    if (music) { stopAlarm(); return; }
    if (style === 'battle') { if (!(await playBattleLoop(vol, 60))) toast('The alarm sound could not be played on this computer', 'error'); }
    else if (!(await playCue('warning', vol))) toast('The alarm sound could not be played on this computer', 'error');
  }
  return (
    <div className="alarm-set" aria-disabled={off}>
      <div className="seg" role="radiogroup" aria-label="Alarm sound">
        {([['battle', 'Battle march'], ['beep', 'Simple beeps']] as const).map(([k, l]) => (
          <button key={k} type="button" role="radio" aria-checked={style === k} disabled={off}
            onClick={async () => { stopAlarm(0.2); if (await updatePrefs({ alarm_style: k })) toast(`Alarm sound: ${l.toLowerCase()}`, 'ok'); }}>{l}</button>
        ))}
      </div>
      <label className="alarm-vol"><span>Volume</span>
        <input type="range" min={0} max={100} step={5} value={vol} disabled={off} aria-valuetext={`${vol}%`}
          onChange={(e) => setVol(Number(e.target.value))}
          onPointerUp={() => { if (vol !== prefs.alarm_volume) void updatePrefs({ alarm_volume: vol }); }}
          onKeyUp={() => { if (vol !== prefs.alarm_volume) void updatePrefs({ alarm_volume: vol }); }} />
        <b className="mono">{vol}%</b>
      </label>
      <button type="button" className="btn btn-sm" onClick={preview} disabled={off} aria-pressed={music}>
        <Icon name={music ? 'close' : 'play'} />{music ? 'Stop' : 'Preview'}
      </button>
      <p className="faint" style={{ margin: 0, fontSize: 13, flexBasis: '100%' }}>
        {style === 'battle'
          ? '“Operation Sortie”, an original battle march made for SYNCHRONIA: a short brass call at the warnings, and at “system down” the full march, looping until you choose recharge, restart, silence or dismiss (it stops by itself after 5 minutes).'
          : 'Short beeps at the warnings and at “system down”.'}
      </p>
    </div>
  );
}

function Workspace() {
  const { prefs, updatePrefs, toast } = useApp();
  if (!prefs) return <div className="skeleton" />;
  return (
    <div className="stack">
      <section className="panel">
        <header className="panel-head"><span className="code">NTF</span><h2>Notifications</h2></header>
        <div className="panel-body stack">
          <label className="checkline"><input type="checkbox" className="check" checked={prefs.notify_desktop !== false}
            onChange={async (e) => { if (await updatePrefs({ notify_desktop: e.target.checked })) toast(e.target.checked ? 'Windows notifications turned on' : 'Windows notifications turned off', 'ok'); }} />
            Windows notifications while SYNCHRONIA is in the background</label>
          <label className="checkline"><input type="checkbox" className="check" checked={prefs.notify_sound !== false}
            onChange={async (e) => { if (await updatePrefs({ notify_sound: e.target.checked })) toast(e.target.checked ? 'Timer sounds turned on' : 'Timer sounds turned off', 'ok'); }} />
            Sounds for System Timer warnings and “system down”</label>
          <AlarmSound />
          <p className="faint" style={{ margin: 0, fontSize: 13 }}>These cover the System Timer: warnings at 5 and 1 minute, “system down” when time runs out, and “recharge complete”. Alerts inside SYNCHRONIA (the warning strip and the system-down pop-up) always show. The timer page’s own Sound button still mutes a single session.</p>
        </div>
      </section>
      <section className="panel">
        <header className="panel-head"><span className="code">LAY</span><h2>Layout</h2></header>
        <div className="panel-body stack">
          <div className="between wrap">
            <div><div>Central Nexus widgets</div><div className="faint" style={{ fontSize: 13 }}>{prefs.layout_customised ? 'Customised order and visibility' : 'Using the default layout'}</div></div>
            <button className="btn btn-sm" disabled={!prefs.layout_customised} onClick={async () => { if (await updatePrefs({ dashboard_layout: null })) { dataChanged(); toast('Layout reset', 'ok'); } }}><Icon name="restore" />Reset</button>
          </div>
          <label className="checkline"><input type="checkbox" className="check" checked={prefs.sidebar_collapsed} onChange={(e) => updatePrefs({ sidebar_collapsed: e.target.checked })} />Collapse the navigation sidebar to icons (names show on hover)</label>
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
  const LABEL: Record<string, string> = { startup: 'Automatic (start-up)', scheduled: 'Automatic (6-hourly)', manual: 'Manual', 'pre-update': 'Before update', 'pre-restore': 'Before restore', imported: 'Imported' };
  async function importFile(f: File) {
    try {
      const res = await fetch('/api/system/backups/import', { method: 'POST', credentials: 'same-origin', headers: { 'X-Synchronia': '1', 'Content-Type': 'application/octet-stream' }, body: f });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || `Import failed (${res.status})`);
      toast(`Imported and verified ${d.file}. Restore it from the list when you are ready.`, 'ok');
      dataChanged();
    } catch (e) { toast((e as Error).message, 'error'); }
  }
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
          <label className="btn"><Icon name="upload" />Import a backup file…<input type="file" accept=".db" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) importFile(f); }} /></label>
          <span className={`tag ${status?.integrity === 'ok' ? 'ok' : 'red'}`}>Integrity: {status ? status.integrity : '…'}</span>
          {scheduled && desktop && <button className="btn btn-accent" onClick={() => desktop!.relaunch()}><Icon name="restore" />Restart now to restore {scheduled}</button>}
        </div>
        {!list ? <div className="skeleton" /> : list.length === 0 ? <div className="empty">No backups yet.</div> : (
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Backup</th><th>Kind</th><th>Taken</th><th>Size</th><th><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>{list.map((b) => (
              <tr key={b.file}><td className="mono" style={{ fontSize: 12 }}>{b.file}</td><td>{LABEL[b.reason] || b.reason}</td>
                <td className="num faint">{fmtDateTime(b.at)}</td><td className="num faint">{(b.size_bytes / 1024).toFixed(0)} KB</td>
                <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}><button className="btn btn-sm btn-ghost" onClick={() => download(`/api/system/backups/${encodeURIComponent(b.file)}/download`, b.file)}><Icon name="download" />Save a copy</button>{' '}
                  <button className="btn btn-sm" onClick={() => restore(b)}><Icon name="restore" />Restore</button></td></tr>
            ))}</tbody>
          </table></div>
        )}
      </div>
    </section>
  );
}

/** Copies of every backup in a folder of your choice — for example one Google Drive or OneDrive keeps on your
 *  other computers. Not synchronization: the other computer imports a copy with "Import a backup file". */
interface CopyStatus { dir: string | null; last_at?: string; last_file?: string; last_error?: string | null; last_error_at?: string; unavailable?: boolean }
function BackupCopy() {
  const { toast } = useApp();
  const [st, setSt] = useState<CopyStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => { api.get<CopyStatus>('/system/backup-copy').then(setSt).catch(() => setSt({ dir: null })); }, []);
  useEffect(() => { load(); return onDataChanged(load); }, [load]);
  async function choose() {
    const dir = await desktop?.pickFolder?.();
    if (!dir) return;
    try { setSt(await api.put<CopyStatus>('/system/backup-copy', { dir })); toast('Backups will also be copied to that folder', 'ok'); }
    catch (e: any) { toast(e.details ? `${e.message}: ${Object.values(e.details)[0]}` : e.message, 'error'); }
  }
  async function copyNow() {
    setBusy(true);
    try { const r = await api.post<{ copy: CopyStatus }>('/system/backup-copy/now'); setSt(r.copy); dataChanged(); toast(r.copy.last_error ? 'The backup was made here, but copying it failed — see below' : 'Backup made and copied', r.copy.last_error ? 'error' : 'ok'); }
    catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(false); }
  }
  async function stop() {
    try { setSt(await api.put<CopyStatus>('/system/backup-copy', { dir: '' })); toast('Stopped copying backups', 'ok'); }
    catch (e) { toast(`Not changed: ${(e as Error).message}`, 'error'); }
  }
  if (!st || st.unavailable) return null;
  const failedLast = st.last_error && (!st.last_at || (st.last_error_at || '') > st.last_at);
  return (
    <section className="panel">
      <header className="panel-head"><span className="code">CPY</span><h2>Copy backups to another folder</h2></header>
      <div className="panel-body stack">
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>
          Choose a folder that Google Drive, OneDrive or Dropbox keeps on your other computers, and every backup — automatic or manual — is copied there too.
          On the other computer, open Settings › Backup and recovery › Import a backup file. SYNCHRONIA itself still works on one computer at a time; this is a copy, not live synchronization.
        </p>
        {st.dir ? (
          <>
            <div className="row wrap" style={{ gap: 8 }}><span className="label">Folder</span><span className="mono" style={{ overflowWrap: 'anywhere' }}>{st.dir}{desktop?.platform === 'win32' ? '\\' : '/'}SYNCHRONIA Backups</span></div>
            {failedLast
              ? <div className="alert" role="alert">The last copy failed{st.last_error_at ? ` (${fmtDateTime(st.last_error_at)})` : ''}: {st.last_error} Your backups are still saved on this computer.</div>
              : st.last_at ? <div className="alert info">Last copied {fmtDateTime(st.last_at)}: <span className="mono">{st.last_file}</span></div>
                : <div className="faint" style={{ fontSize: 13 }}>Nothing copied yet — the next backup will be.</div>}
            <div className="row wrap">
              <button className="btn btn-primary" onClick={copyNow} disabled={busy}><Icon name="download" />{busy ? 'Copying…' : 'Back up and copy now'}</button>
              <button className="btn" onClick={choose}>Change folder…</button>
              <button className="btn btn-ghost" onClick={stop}>Stop copying</button>
            </div>
          </>
        ) : (
          <div className="row wrap">
            {desktop?.pickFolder ? <button className="btn btn-primary" onClick={choose}>Choose folder…</button> : <span className="faint">Available in the desktop app.</span>}
          </div>
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
      <ArchiveExport />
      <Backups />
      <BackupCopy />
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

function Appearance() {
  const { prefs, updatePrefs, toast } = useApp();
  if (!prefs) return <div className="skeleton" />;
  return (
    <div className="stack">
      <section className="panel">
        <header className="panel-head"><span className="code">THM</span><h2>Theme</h2></header>
        <div className="panel-body stack">
          <div className="theme-grid" role="radiogroup" aria-label="Colour theme">
            {THEMES.map((t) => {
              const on = (prefs.theme || 'violet') === t.key;
              return (
                <button key={t.key} type="button" role="radio" aria-checked={on} className={`theme-card ${on ? 'on' : ''}`}
                  onClick={async () => { applyTheme(t.key); await updatePrefs({ theme: t.key }); }}>
                  <span className="theme-sw" aria-hidden>{t.swatch.map((c) => <i key={c} style={{ background: c }} />)}</span>
                  <span className="theme-l"><span className="t">{t.label}</span><span className="s">{t.note}</span></span>
                </button>
              );
            })}
          </div>
          <p className="faint" style={{ margin: 0, fontSize: 13 }}>Applies at once and is remembered. Documents you export are not affected; they always print in black on white.</p>
        </div>
      </section>
      <section className="panel">
        <header className="panel-head"><span className="code">MOT</span><h2>Motion</h2></header>
        <div className="panel-body stack">
          <label className="checkline"><input type="checkbox" className="check" checked={!!prefs.reduce_motion}
            onChange={async (e) => { if (await updatePrefs({ reduce_motion: e.target.checked })) toast(e.target.checked ? 'Non-essential motion turned off' : 'Short transitions turned back on', 'ok'); }} />
            Turn off non-essential motion (pop-ups and menus appear instantly)</label>
          <p className="faint" style={{ margin: 0, fontSize: 13 }}>SYNCHRONIA already keeps motion short and avoids continuous animation. If your computer is set to reduce motion, that is followed too.</p>
        </div>
      </section>
    </div>
  );
}

export function SettingsPage() {
  const [params, setParams] = useSearchParams();
  const asked = params.get('tab') === 'institution' ? 'documents' : params.get('tab');
  const tab: Tab = TABS.some(([k]) => k === asked) ? (asked as Tab) : 'workspace';
  const setTab = (t: Tab) => setParams({ tab: t });
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="crumb"><span className="bar" /><span className="label">System · Settings</span></div>
          <h1 className="display">Settings</h1>
        </div>
      </div>
      <div className="tabs" role="tablist">
        {TABS.map(([t, label]) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>{label}</button>
        ))}
      </div>
      {tab === 'workspace' && <Workspace />}
      {tab === 'appearance' && <Appearance />}
      {tab === 'documents' && <><PaperSetting /><InstitutionSettings /></>}
      {tab === 'application' && <Application />}
      {tab === 'data' && <Data />}
    </div>
  );
}

function ArchiveExport() {
  const [secrets, setSecrets] = useState(false);
  return (
    <section className="panel">
      <header className="panel-head"><span className="code">ZIP</span><h2>Complete archive</h2></header>
      <div className="panel-body stack">
        <p className="muted" style={{ margin: 0, fontSize: 13.5, maxWidth: '75ch' }}>
          Everything in open formats, to keep or to move elsewhere: every record as JSON and as spreadsheets (CSV), generated documents and CV exports,
          CV photographs and the letterhead, with a checksum for every file. Google Drive files are not copied — they stay in your Drive, and their links are kept.
          The encryption key and any Google sign-in are never included.
        </p>
        <label className="checkline"><input type="checkbox" className="check" checked={secrets} onChange={(e) => setSecrets(e.target.checked)} />Include protected fields (licence registration numbers) in plain text</label>
        <div><button className="btn btn-primary" onClick={() => download(`/api/knowledge/archive${secrets ? '?include_secrets=1' : ''}`, `SYNCHRONIA_Archive.zip`)}><Icon name="download" />Download archive (.zip)</button></div>
      </div>
    </section>
  );
}

/** Paper size for every exported document (a syllabus or CV can still set its own). */
function PaperSetting() {
  const { prefs, updatePrefs, toast } = useApp();
  if (!prefs?.paper_sizes) return null;
  return (
    <section className="panel" style={{ marginBottom: 'var(--s-4)' }}>
      <header className="panel-head"><span className="code">PPR</span><h2>Paper size</h2></header>
      <div className="panel-body stack">
        <label className="field" style={{ maxWidth: 360 }}><span className="label">Paper for exported documents</span>
          <select className="select" value={prefs.paper_size || 'letter'} onChange={async (e) => { if (await updatePrefs({ paper_size: e.target.value })) toast(`Documents will be exported on ${prefs.paper_sizes![e.target.value]}`, 'ok'); }}>
            {Object.entries(prefs.paper_sizes).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select></label>
        <p className="faint" style={{ margin: 0, fontSize: 13 }}>Used by reports, research exports and Intelligence reports, in Word and PDF. Margins and tables adjust to the paper. A syllabus keeps its own page setup, and each CV its own paper size.</p>
      </div>
    </section>
  );
}
