import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, dataChanged, onDataChanged } from '../lib/api';
import { desktop, openReference } from '../lib/desktop';
import { fmtDate, fmtDateTime } from '../lib/format';
import { useApp } from '../components/AppContext';
import { Icon } from '../components/Icon';
import { Field } from '../components/Field';
import { AutoText } from '../components/AutoText';
import { MODULES } from '../lib/modules';

type Tab = 'library' | 'drive' | 'search';
const PROVIDER: Record<string, string> = { google_drive: 'Google Drive', url: 'Web link', local_path: 'This computer' };
const fmtBytes = (n?: number | null) => (n == null ? '' : n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1048576).toFixed(1)} MB`);

function routeFor(type: string, id: number, module: string) {
  if (type === 'courses') return `/academic/courses/${id}`;
  if (type === 'cv_profiles') return `/cv/${id}`;
  if (type === 'reports') return '/academic?tab=reports';
  return MODULES.find((m) => m.id === module)?.path || '/';
}

function Library() {
  const { toast, openRecord, openNew } = useApp();
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [provider, setProvider] = useState('');
  const [usage, setUsage] = useState('');
  const [data, setData] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { const t = setTimeout(() => setQuery(q), 250); return () => clearTimeout(t); }, [q]);
  const load = useCallback(() => { api.get<any>(`/knowledge/library?q=${encodeURIComponent(query)}&provider=${provider}&usage=${usage}`).then(setData).catch((e) => toast(e.message, 'error')); }, [query, provider, usage, toast]);
  useEffect(() => { load(); return onDataChanged(load); }, [load]);
  async function refreshDrive() {
    setBusy(true);
    try {
      const r = await api.post<any>('/integrations/google/refresh', {});
      dataChanged();
      toast(`Checked ${r.checked} Drive file${r.checked === 1 ? '' : 's'}${r.unavailable.length ? `; ${r.unavailable.length} no longer available (kept in your library, marked)` : ''}.`, r.unavailable.length ? 'info' : 'ok');
    } catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(false); }
  }
  const c = data?.counts || {};
  return (
    <div className="stack">
      <p className="muted" style={{ margin: 0, fontSize: 14 }}>Every document you have linked as evidence or reference — stored as a reference only. Files stay in Google Drive, on the web or on this computer; the same file is never listed twice.</p>
      <div className="row wrap" style={{ gap: 'var(--s-3)' }}>
        <input className="input" style={{ maxWidth: 320 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search titles and links" aria-label="Search the library" />
        <div className="seg" role="group" aria-label="Where the file is">{[['', `All (${(c.google_drive || 0) + (c.url || 0) + (c.local_path || 0)})`], ['google_drive', `Drive (${c.google_drive || 0})`], ['url', `Web (${c.url || 0})`], ['local_path', `This computer (${c.local_path || 0})`]].map(([k, l]) => <button key={k} aria-pressed={provider === k} onClick={() => setProvider(k)}>{l}</button>)}</div>
        <div className="seg" role="group" aria-label="Usage">{[['', 'Any'], ['linked', 'Linked to records'], ['unlinked', 'Not linked']].map(([k, l]) => <button key={k} aria-pressed={usage === k} onClick={() => setUsage(k)}>{l}</button>)}</div>
        <span style={{ flex: 1 }} />
        {(c.google_drive || 0) > 0 && <button className="btn btn-sm" disabled={busy} onClick={refreshDrive}><Icon name="restore" />{busy ? 'Checking…' : 'Refresh Drive details'}</button>}
        <button className="btn btn-primary btn-sm" onClick={() => openNew('file_references', { provider: 'url' })}><Icon name="plus" />Add reference</button>
      </div>
      {!data ? <div className="skeleton" style={{ height: 200 }} /> : data.items.length ? (
        <div className="lib-list">
          {data.items.map((f: any) => (
            <article key={f.id} className={`lib-item ${f.metadata?.unavailable ? 'unavailable' : ''}`}>
              <div className="lib-head">
                <span className="tag">{PROVIDER[f.provider]}</span>
                <button className="rowlink lib-title" onClick={() => openRecord('file_references', f.id)}>{f.title}</button>
                <span style={{ flex: 1 }} />
                <button className="btn btn-sm btn-ghost" disabled={f.provider === 'local_path' && !desktop} onClick={async () => { const err = await openReference(f.provider, f.url); if (err) toast(err, 'error'); }}><Icon name="link" />Open</button>
              </div>
              <div className="lib-meta">
                {[f.mime_type && f.mime_type.split('/').pop(), f.metadata?.size != null && fmtBytes(f.metadata.size), f.metadata?.modified_time && `Modified ${fmtDate(f.metadata.modified_time.slice(0, 10))}`,
                  f.metadata?.owners?.length && `Owner: ${f.metadata.owners.join(', ')}`, f.metadata_checked_at && `Details checked ${fmtDateTime(f.metadata_checked_at)}`].filter(Boolean).join(' · ') || <span className="mono">{f.url}</span>}
              </div>
              {f.metadata?.unavailable && <div className="lib-warn"><Icon name="alert" />{f.metadata.unavailable}. The reference is kept so its records still show what was linked.</div>}
              <div className="lib-used">{f.used_by.length ? <>Linked to: {f.used_by.map((u: any, i: number) => <button key={i} className="chip-link" onClick={() => openRecord(u.type, u.id)}>{u.label}: {u.title}</button>)}</> : <span className="faint">Not linked to any record</span>}</div>
            </article>
          ))}
        </div>
      ) : <div className="panel"><div className="panel-body"><div className="empty">No references{query || provider || usage ? ' match these filters' : ' yet. Link evidence from any record, or add one here'}.</div></div></div>}
    </div>
  );
}

function Drive() {
  const { toast } = useApp();
  const [s, setS] = useState<any>(null);
  const [client, setClient] = useState({ client_id: '', client_secret: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState('');
  const [found, setFound] = useState<any>(null);
  const load = useCallback(() => api.get<any>('/integrations/google').then(setS), []);
  useEffect(() => { load(); }, [load]);
  // While waiting for the browser sign-in, check back every few seconds.
  const [waiting, setWaiting] = useState(false);
  useEffect(() => {
    if (!waiting) return undefined;
    const t = setInterval(async () => { const x = await api.get<any>('/integrations/google'); setS(x); if (x.status === 'connected') { setWaiting(false); toast('Google Drive connected', 'ok'); } }, 2500);
    const stop = setTimeout(() => setWaiting(false), 10 * 60 * 1000);
    return () => { clearInterval(t); clearTimeout(stop); };
  }, [waiting, toast]);
  async function saveClient() {
    setBusy(true); setErrors({});
    try { setS(await api.put('/integrations/google/client', client)); setClient({ client_id: '', client_secret: '' }); toast('OAuth client saved', 'ok'); }
    catch (e: any) { setErrors(e.details || {}); if (!e.details) toast(e.message, 'error'); } finally { setBusy(false); }
  }
  async function connect() {
    try {
      const r = await api.post<{ url: string }>('/integrations/google/connect');
      if (desktop) await desktop.openExternal(r.url); else window.open(r.url, '_blank', 'noopener');
      setWaiting(true);
      toast('Finish signing in to Google in your browser, then return here.', 'info');
    } catch (e) { toast((e as Error).message, 'error'); }
  }
  async function disconnect() {
    if (!window.confirm('Disconnect Google Drive? SYNCHRONIA will ask Google to revoke its access and delete its saved sign-in. Your file references stay.')) return;
    const r = await api.post<any>('/integrations/google/disconnect');
    setS(r); setFound(null);
    toast(r.revoked ? 'Disconnected; access revoked at Google' : 'Disconnected; saved sign-in deleted (Google did not confirm revocation — you can also remove access at myaccount.google.com)', 'ok');
  }
  async function search(e?: React.FormEvent) {
    e?.preventDefault();
    try { setFound(await api.get<any>(`/integrations/google/files?q=${encodeURIComponent(q)}`)); } catch (err) { toast((err as Error).message, 'error'); load(); }
  }
  async function add(id: string) {
    try { const r = await api.post<any>(`/integrations/google/files/${encodeURIComponent(id)}/library`); toast(r.reused ? 'Already in your library — details refreshed' : 'Added to your library as a reference', 'ok'); dataChanged(); search(); }
    catch (err) { toast((err as Error).message, 'error'); }
  }
  if (!s) return <div className="skeleton" style={{ height: 240 }} />;
  const connected = s.status === 'connected';
  return (
    <div className="stack" style={{ gap: 'var(--s-5)' }}>
      <section className="panel"><header className="panel-head"><span className="code">GD</span><h2>Google Drive connection</h2>
        <span className={`tag ${connected ? 'st-evidenced' : s.status === 'needs_reconnect' ? 'st-self' : 'st-system'}`}>{connected ? 'Connected' : s.status === 'needs_reconnect' ? 'Needs reconnecting' : 'Not connected'}</span></header>
        <div className="panel-body stack">
          <p className="muted" style={{ margin: 0, fontSize: 14 }}>Optional. When connected, SYNCHRONIA can <b>search your Drive by file name and read file details</b> (name, type, size, owner, date modified) so you can link files as evidence.
            It <b>cannot open, download, upload, change or delete</b> your files — Google grants it read-only access to file details only. Without a connection, paste Drive share links as you do now.</p>
          {connected ? (
            <dl className="dl">
              <dt>Account</dt><dd>{[s.account_name, s.account_email].filter(Boolean).join(' · ') || '—'}</dd>
              <dt>Access granted</dt><dd>Read-only file details (drive.metadata.readonly)</dd>
              <dt>Connected</dt><dd>{fmtDateTime(s.connected_at)}</dd>
              <dt>Last used</dt><dd>{s.last_used_at ? fmtDateTime(s.last_used_at) : '—'}</dd>
              <dt>Drive files in library</dt><dd>{s.linked_files}</dd>
            </dl>
          ) : s.status_detail ? <div className="alert">{s.status_detail}</div> : null}
          {!s.client_configured ? (
            <div className="stack">
              <details className="import-details" open><summary>One-time setup: your own Google OAuth client</summary>
                <ol className="setup-steps">
                  <li>Open <b>console.cloud.google.com</b> with your Google account and create a project (any name).</li>
                  <li>Enable the <b>Google Drive API</b> (APIs &amp; Services › Library).</li>
                  <li>Configure the <b>OAuth consent screen</b> (External, add yourself as a test user).</li>
                  <li>Create credentials › <b>OAuth client ID</b> › Application type <b>Desktop app</b>.</li>
                  <li>Copy the client ID (and secret) below. They stay on this computer, encrypted.</li>
                </ol></details>
              <div className="form-grid">
                <Field label="OAuth client ID" required error={errors.client_id}><AutoText value={client.client_id} onChange={(v) => setClient({ ...client, client_id: v })} placeholder="…apps.googleusercontent.com" /></Field>
                <Field label="Client secret" hint="Desktop clients have one; it is stored encrypted." error={errors.client_secret}><input className="input" type="password" autoComplete="off" value={client.client_secret} onChange={(e) => setClient({ ...client, client_secret: e.target.value })} /></Field>
              </div>
              <div><button className="btn btn-primary" disabled={busy || !client.client_id.trim()} onClick={saveClient}><Icon name="check" />Save client</button></div>
            </div>
          ) : (
            <div className="row wrap">
              {!connected && <button className="btn btn-primary" onClick={connect} disabled={waiting}><Icon name="link" />{waiting ? 'Waiting for Google…' : s.status === 'needs_reconnect' ? 'Reconnect Google Drive' : 'Connect Google Drive'}</button>}
              {connected && <button className="btn" onClick={disconnect}><Icon name="close" />Disconnect</button>}
              {!connected && <button className="btn btn-ghost btn-sm" onClick={async () => { setS(await api.del('/integrations/google/client')); }}>Use a different OAuth client</button>}
              <span className="faint" style={{ fontSize: 13 }}>Client {s.client_id}</span>
            </div>
          )}
        </div></section>
      {connected && (
        <section className="panel"><header className="panel-head"><span className="code">FIND</span><h2>Find Drive files</h2></header>
          <div className="panel-body stack">
            <form className="row" onSubmit={search}>
              <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="File name (leave empty for recently modified)" aria-label="Search Google Drive" />
              <button className="btn btn-primary" type="submit"><Icon name="search" />Search Drive</button>
            </form>
            {found && (found.files.length ? (
              <ul className="list">{found.files.map((f: any) => (
                <li key={f.id}><span className="grow"><span className="t">{f.name}</span><span className="s">{[f.mime_type?.split('/').pop(), f.size != null && fmtBytes(f.size), f.modified_time && `modified ${fmtDate(f.modified_time.slice(0, 10))}`, f.owners?.length && f.owners.join(', ')].filter(Boolean).join(' · ')}</span></span>
                  {f.library_id ? <span className="tag st-evidenced">In library</span> : <button className="btn btn-sm" onClick={() => add(f.id)}><Icon name="plus" />Add to library</button>}</li>
              ))}</ul>
            ) : <div className="empty">No Drive files match.</div>)}
            <p className="faint" style={{ margin: 0, fontSize: 13 }}>To link a Drive file to a record, open the record’s Evidence tab and choose “Search my Google Drive”.</p>
          </div></section>
      )}
    </div>
  );
}

function UnifiedSearch() {
  const navigate = useNavigate();
  const { openRecord } = useApp();
  const [q, setQ] = useState('');
  const [module, setModule] = useState('');
  const [data, setData] = useState<any>(null);
  useEffect(() => {
    if (!q.trim()) { setData(null); return undefined; }
    const t = setTimeout(() => { api.get<any>(`/search?q=${encodeURIComponent(q)}&limit=100${module ? `&module=${module}` : ''}`).then(setData); }, 220);
    return () => clearTimeout(t);
  }, [q, module]);
  const mods = [['', 'Everything'], ['portfolio', 'Portfolio'], ['academic', 'Academic'], ['cv', 'CV'], ['intelligence', 'Documents'], ['admin', 'Administrative'], ['knowledge', 'References'], ['nexus', 'Notes and tasks']];
  const hl = (s: string) => s.split(/(\[\[.*?\]\])/g).map((part, i) => (part.startsWith('[[') ? <mark key={i}>{part.slice(2, -2)}</mark> : part));
  return (
    <div className="stack">
      <input className="input search-big" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search everything: records, syllabus content, minutes, notes, documents…" aria-label="Search everything" autoFocus />
      <div className="seg" role="group" aria-label="Limit to">{mods.map(([k, l]) => <button key={k} aria-pressed={module === k} onClick={() => setModule(k)}>{l}</button>)}</div>
      {data && (data.results.length ? (
        <ul className="list search-results">{data.results.map((r: any) => (
          <li key={`${r.type}-${r.id}`}><span className="tag">{r.label}</span>
            <button className="rowlink grow" onClick={() => (['profile', 'reports', 'courses', 'cv_profiles'].includes(r.type) ? navigate(r.type === 'profile' ? '/portfolio/profile' : routeFor(r.type, r.id, r.module)) : openRecord(r.type, r.id))}>
              <span className="t">{hl(r.title_highlighted || r.title)}</span>{r.snippet && <span className="s wrap">{hl(r.snippet)}</span>}</button></li>
        ))}</ul>
      ) : <div className="empty">Nothing found for “{q}”{module ? ' in this area' : ''}.</div>)}
      {!data && <p className="faint" style={{ margin: 0 }}>Tip: press <span className="kbd">Ctrl K</span> anywhere for quick search.</p>}
    </div>
  );
}

export function KnowledgePage() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab) || 'library';
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="crumb"><span className="bar" /><span className="label">Knowledge Management · Knowledge and References</span></div>
          <h1 className="display">Knowledge and References</h1>
          <div className="sub">Your documents stay where they are. SYNCHRONIA keeps references to them, finds them, and links them to your records. See also the <Link className="link" to="/portfolio/timeline">professional timeline</Link>.</div>
        </div>
      </div>
      <div className="tabs" role="tablist">{([['library', 'Library'], ['drive', 'Google Drive'], ['search', 'Search everything']] as [Tab, string][]).map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => setParams({ tab: k })}>{l}</button>)}</div>
      {tab === 'library' && <Library />}
      {tab === 'drive' && <Drive />}
      {tab === 'search' && <UnifiedSearch />}
    </div>
  );
}


