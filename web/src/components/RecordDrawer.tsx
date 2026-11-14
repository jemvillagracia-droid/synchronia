import { useEffect, useState, type FormEvent } from 'react';
import { Overlay } from './Overlay';
import { Icon } from './Icon';
import { Field, SpecInput, isLongField } from './Field';
import { api, ApiError, dataChanged } from '../lib/api';
import { fmtDate, fmtDateTime, humanize } from '../lib/format';
import { FORMS, VERIFICATION_INFO, type FormSection } from '../lib/forms';
import { desktop, openReference } from '../lib/desktop';
import type { RecordRow, ResourceSpec } from '../lib/types';
import { useApp } from './AppContext';
import { useDirty, confirmDiscard } from '../lib/dirty';

interface HistoryItem { id: number; action: string; summary: string; at: string; changes: Record<string, [any, any]> | null }
interface EvidenceItem { link_id: number; id: number; provider: string; external_id: string | null; url: string | null; title: string; linked_at: string }

const PROVIDERS = [
  { id: 'google_drive', label: 'Google Drive link' },
  { id: 'url', label: 'Web link' },
  { id: 'local_path', label: 'File on this PC' },
] as const;

function labelFor(type: string, name: string) {
  const f = FORMS[type];
  return f?.labels?.[name] || humanize(name.replace(/_id$/, ''));
}

function sectionsFor(type: string, spec: ResourceSpec): FormSection[] {
  const layout = FORMS[type];
  const all = Object.keys(spec.fields).filter((n) => spec.fields[n].type !== 'json');
  if (!layout) return [{ title: 'Details', fields: all }];
  const placed = new Set(layout.sections.flatMap((s) => s.fields));
  const rest = all.filter((n) => !placed.has(n));
  return [...layout.sections.map((s) => ({ ...s, fields: s.fields.filter((n) => spec.fields[n]) })), ...(rest.length ? [{ title: 'Other', fields: rest }] : [])];
}

/** View, create, edit, verify, evidence, delete (to recycle bin) and inspect history of any registered record. */
export function RecordDrawer({ type, id, onClose, onCreated, defaults }: { type: string; id: number | null; onClose: () => void; onCreated?: (r: RecordRow) => void; defaults?: Record<string, any> }) {
  const isNew = id === null;
  const { schema, toast } = useApp();
  const spec = schema?.[type];
  const takesEvidence = !!spec?.fields.verification;
  const [row, setRow] = useState<RecordRow | null>(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'details' | 'evidence' | 'history'>('details');
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, any>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<HistoryItem[] | null>(null);
  const [evidence, setEvidence] = useState<EvidenceItem[] | null>(null);
  const [refOptions, setRefOptions] = useState<Record<string, { id: number; label: string }[]>>({});
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [revealed, setRevealed] = useState<Record<string, string>>({});

  const reload = () => api.get<RecordRow>(`/records/${type}/${id}`).then(setRow).catch((e) => setError(e.message));
  useEffect(() => { if (!isNew) reload(); }, [type, id, isNew]); // eslint-disable-line react-hooks/exhaustive-deps

  // Create mode: start with an empty draft (required enums default to their first value).
  useEffect(() => {
    if (!isNew || !spec || editing) return;
    const d: Record<string, any> = {};
    for (const [name, f] of Object.entries(spec.fields)) {
      if (f.type === 'json') continue;
      d[name] = f.type === 'bool' ? false : f.type === 'enum' && f.required ? f.values![0] : name === 'verification' ? 'self_reported' : null;
    }
    setDraft({ ...d, ...(defaults || {}) }); setEditing(true);
  }, [isNew, spec, editing]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (tab === 'history' && !isNew) api.get<HistoryItem[]>(`/records/${type}/${id}/history`).then(setHistory).catch(() => setHistory([]));
  }, [tab, type, id, isNew, row?.updated_at, row?._evidence_count]);

  useEffect(() => {
    if (!isNew && takesEvidence) api.get<EvidenceItem[]>(`/records/${type}/${id}/evidence`).then(setEvidence).catch(() => setEvidence([]));
  }, [type, id, isNew, takesEvidence]);

  // Reference options are needed both for editing and for showing linked record names.
  useEffect(() => {
    if (!spec) return;
    for (const [name, f] of Object.entries(spec.fields)) {
      if (f.type === 'ref' && f.resource && !refOptions[name]) {
        api.get<{ items: RecordRow[] }>(`/records/${f.resource}?limit=200&sort=updated_at`).then((d) =>
          setRefOptions((o) => ({ ...o, [name]: d.items.map((x) => ({ id: x.id, label: x._title })) })));
      }
    }
  }, [spec, refOptions]);

  function startEdit() {
    if (!row || !spec) return;
    const d: Record<string, any> = {};
    for (const [name, f] of Object.entries(spec.fields)) {
      if (f.type === 'json') continue;
      d[name] = f.type === 'secret' ? '' : row[name];
    }
    setDraft(d); setErrors({}); setEditing(true); setTab('details');
  }

  async function create() {
    if (!spec) return;
    const body: Record<string, any> = {};
    for (const [k, v] of Object.entries(draft)) if (v !== null && v !== '') body[k] = v;
    setBusy(true); setErrors({});
    try {
      const created = await api.post<RecordRow>(`/records/${type}`, body);
      dataChanged(); toast(`${spec.label} saved`, 'ok'); onCreated?.(created); onClose();
    } catch (e) {
      if (e instanceof ApiError) { setErrors(e.details || {}); if (!e.details) toast(e.message, 'error'); }
    } finally { setBusy(false); }
  }

  async function save(e?: FormEvent) {
    e?.preventDefault();
    if (isNew) return create();
    if (!spec || !row) return;
    const patch: Record<string, any> = {};
    for (const [k, v] of Object.entries(draft)) {
      if (spec.fields[k].type === 'secret' && !v) continue;
      if ((row[k] ?? null) !== (v === '' ? null : v)) patch[k] = v;
    }
    if (!Object.keys(patch).length) { setEditing(false); return; }
    setBusy(true); setErrors({});
    try {
      const updated = await api.patch<RecordRow>(`/records/${type}/${id}`, patch);
      setRow(updated); setEditing(false); dataChanged(); toast('Saved', 'ok');
    } catch (err) {
      if (err instanceof ApiError) { setErrors(err.details || {}); if (!err.details) toast(err.message, 'error'); }
    } finally { setBusy(false); }
  }

  async function setVerification(v: string) {
    try {
      const updated = await api.patch<RecordRow>(`/records/${type}/${id}`, { verification: v });
      setRow(updated); dataChanged(); toast(`Marked ${VERIFICATION_INFO[v].label.toLowerCase()}`, 'ok');
    } catch (e) { toast((e as Error).message, 'error'); }
  }

  async function remove() {
    setBusy(true);
    try {
      await api.del(`/records/${type}/${id}`);
      dataChanged(); toast('Moved to recycle bin — restore it from Settings › Data', 'ok'); onClose();
    } catch (e) { toast((e as Error).message, 'error'); setBusy(false); }
  }

  async function reveal(field: string) {
    try {
      const r = await api.get<{ value: string }>(`/records/${type}/${id}/secret/${field}`);
      setRevealed((x) => ({ ...x, [field]: r.value }));
    } catch (e) { toast((e as Error).message, 'error'); }
  }

  const display = (name: string, v: any) => {
    const f = spec?.fields[name];
    if (v === null || v === undefined || v === '') return null;
    if (!f) return String(v);
    if (f.type === 'bool') return v ? 'Yes' : 'No';
    if (f.type === 'date') return fmtDate(v);
    if (f.type === 'enum') return humanize(v);
    if (f.type === 'ref') return refOptions[name]?.find((o) => o.id === v)?.label || `#${v}`;
    return String(v);
  };

  const sections = spec ? sectionsFor(type, spec) : [];

  const form = spec && editing ? (
    <form className="stack" onSubmit={save} id="record-form">
      {sections.map((sec) => (
        <fieldset key={sec.title} className="fieldset">
          <legend className="label">{sec.title}</legend>
          <div className="form-grid">
            {sec.fields.map((name) => {
              const f = spec.fields[name];
              const hint = f.type === 'secret'
                ? `${FORMS[type]?.hints?.[name] || 'Stored encrypted.'}${row ? ` Current: ${row[`${name}_masked`] || 'none'}. Leave blank to keep it.` : ''}`
                : name === 'verification' ? '“Evidenced” is set from the Evidence tab once files are linked.' : FORMS[type]?.hints?.[name];
              return (
                <Field key={name} label={labelFor(type, name)} required={f.required} error={errors[name]} className={isLongField(name, f) ? 'span-2' : ''} hint={hint}>
                  <SpecInput name={name} spec={f} value={draft[name]} refOptions={refOptions[name]} placeholder={FORMS[type]?.placeholders?.[name]}
                    onChange={(v) => setDraft((d) => ({ ...d, [name]: v }))} />
                </Field>
              );
            })}
          </div>
        </fieldset>
      ))}
    </form>
  ) : null;

  // Unsaved-change guard: compare the draft with the stored record (or with an empty new record).
  const isDirty = editing && !!spec && Object.entries(draft).some(([k, v]) => {
    const f = spec.fields[k];
    if (!f) return false;
    if (isNew) return v !== null && v !== '' && v !== false && !(k === 'verification' && v === 'self_reported') && !(defaults && k in defaults) && !(f.type === 'enum' && f.required && v === f.values?.[0]);
    if (f.type === 'secret') return !!v;
    return (row?.[k] ?? null) !== (v === '' ? null : v);
  });
  useDirty(`record-${type}-${id ?? 'new'}`, isDirty);
  const guardedClose = () => { if (isDirty && !confirmDiscard()) return; onClose(); };

  const ver = row?.verification ? VERIFICATION_INFO[row.verification] : null;
  const recommended = spec?.recommended || [];
  const missing: string[] = row?._missing || [];
  const evidenceCount = evidence?.length ?? row?._evidence_count ?? 0;

  return (
    <Overlay onClose={guardedClose} label={spec ? spec.label : 'Record'}>
      <aside className="drawer">
        <div className="modal-head">
          <span className="label">{spec?.label || humanize(type)}</span>
          <span style={{ flex: 1 }} />
          <button className="icon-btn sm" onClick={guardedClose} aria-label="Close"><Icon name="close" /></button>
        </div>
        {error && <div className="modal-body"><div className="alert">{error}</div></div>}
        {!row && !error && !isNew && <div className="modal-body"><div className="skeleton" /><div className="skeleton" style={{ width: '60%' }} /></div>}

        {isNew && spec && (
          <>
            <div style={{ padding: 'var(--s-4) var(--s-4) 0' }}>
              <h2 className="display" style={{ fontSize: 34, margin: 0 }}>New {spec.label.toLowerCase()}</h2>
              <p className="faint" style={{ fontSize: 13, marginBottom: 0 }}>Saved records are self-reported until you confirm them or link supporting evidence.</p>
            </div>
            <div className="modal-body" style={{ flex: 1 }}>{form}</div>
            <div className="modal-foot">
              <button key="cancel" type="button" className="btn btn-ghost" onClick={guardedClose} disabled={busy}>Cancel</button>
              <span className="kbd hide-mobile" title="Ctrl+Enter saves">Ctrl ↵</span>
              <button key="create" className="btn btn-primary" type="submit" form="record-form" disabled={busy}>{busy ? 'Saving…' : 'Save record'}</button>
            </div>
          </>
        )}

        {row && spec && (
          <>
            <div style={{ padding: 'var(--s-4) var(--s-4) 0' }}>
              <h2 className="display" style={{ fontSize: 34, margin: 0, overflowWrap: 'anywhere' }}>{row._title}</h2>
              <div className="row wrap mt-3">
                {ver && <span className={`tag ${ver.cls}`}>{ver.label}</span>}
                {takesEvidence && <span className={`tag ${evidenceCount ? 'ok' : ''}`}>{evidenceCount ? `${evidenceCount} evidence` : 'No evidence'}</span>}
                {row.is_current && <span className="tag orange">Current</span>}
                <span className="faint" style={{ fontSize: 12 }}>Recorded {fmtDateTime(row.created_at)} · Updated {fmtDateTime(row.updated_at)}</span>
              </div>
              <div className="tabs" style={{ marginTop: 'var(--s-4)', marginBottom: 0 }} role="tablist">
                <button role="tab" aria-selected={tab === 'details'} onClick={() => setTab('details')}>Details</button>
                {takesEvidence && <button role="tab" aria-selected={tab === 'evidence'} onClick={() => { setTab('evidence'); setEditing(false); }}>Evidence ({evidenceCount})</button>}
                <button role="tab" aria-selected={tab === 'history'} onClick={() => { setTab('history'); setEditing(false); }}>Version history</button>
              </div>
            </div>
            <div className="modal-body" style={{ flex: 1 }}>
              {tab === 'details' && !editing && (
                <>
                  {takesEvidence && ver && (
                    <div className="verify-box">
                      <div className="between wrap">
                        <div>
                          <div className="label">Verification</div>
                          <div className="mt-2" style={{ fontSize: 13, color: 'var(--text-2)' }}>{ver.desc}</div>
                        </div>
                        <div className="row wrap">
                          {row.verification === 'self_reported' && <button className="btn btn-sm" onClick={() => setVerification('user_confirmed')}><Icon name="check" />Confirm accurate</button>}
                          {row.verification !== 'evidence_verified' && evidenceCount > 0 && <button className="btn btn-sm btn-primary" onClick={() => setVerification('evidence_verified')}><Icon name="check" />Mark evidenced</button>}
                          {row.verification !== 'evidence_verified' && evidenceCount === 0 && <button className="btn btn-sm" onClick={() => setTab('evidence')}><Icon name="link" />Attach evidence</button>}
                          {row.verification !== 'self_reported' && <button className="btn btn-sm btn-ghost" onClick={() => setVerification('self_reported')}>Revert</button>}
                        </div>
                      </div>
                    </div>
                  )}
                  {recommended.length > 0 && (
                    <div>
                      <div className="between"><span className="label">Record completeness</span><span className="num muted">{recommended.length - missing.length}/{recommended.length}</span></div>
                      <div className="meter mt-2"><span style={{ width: `${((recommended.length - missing.length) / recommended.length) * 100}%` }} /></div>
                      {missing.length > 0 && <div className="faint mt-2" style={{ fontSize: 12 }}>Add: {missing.map((m) => labelFor(type, m)).join(', ')}</div>}
                    </div>
                  )}
                  {sections.map((sec) => (
                    <section key={sec.title}>
                      <h3 className="label" style={{ margin: '0 0 var(--s-2)' }}>{sec.title}</h3>
                      <dl className="dl">
                        {sec.fields.map((name) => {
                          const f = spec.fields[name];
                          if (f.type === 'secret') {
                            const masked = row[`${name}_masked`];
                            return (
                              <div key={name} style={{ display: 'contents' }}>
                                <dt>{labelFor(type, name)}</dt>
                                <dd className={masked ? 'mono' : 'none'}>
                                  {revealed[name] ?? masked ?? '—'}
                                  {masked && !revealed[name] && <button className="linkbtn" onClick={() => reveal(name)}>Reveal</button>}
                                  {revealed[name] && <button className="linkbtn" onClick={() => setRevealed(({ [name]: _hidden, ...x }) => x)}>Hide</button>}
                                </dd>
                              </div>
                            );
                          }
                          const v = name === 'verification' ? ver?.label : display(name, row[name]);
                          return (
                            <div key={name} style={{ display: 'contents' }}>
                              <dt>{labelFor(type, name)}</dt>
                              <dd className={v ? '' : 'none'}>{v || '—'}</dd>
                            </div>
                          );
                        })}
                      </dl>
                    </section>
                  ))}
                </>
              )}
              {tab === 'details' && editing && form}
              {tab === 'evidence' && (
                <EvidencePanel type={type} id={id!} items={evidence}
                  onChange={(items, rec) => { setEvidence(items); if (rec) setRow(rec); else reload(); dataChanged(); }} />
              )}
              {tab === 'history' && (
                history === null ? <div className="skeleton" /> : (
                  <ol className="list">
                    {history.map((h) => (
                      <li key={h.id} style={{ alignItems: 'flex-start', flexDirection: 'column', gap: 4 }}>
                        <div className="between" style={{ width: '100%' }}>
                          <span className={`tag ${h.action === 'delete' ? 'red' : h.action === 'create' ? 'violet' : ''}`}>{h.action === 'export' ? 'access' : h.action}</span>
                          <span className="faint num" style={{ fontSize: 12 }}>{fmtDateTime(h.at)}</span>
                        </div>
                        <span className="muted" style={{ fontSize: 13 }}>{h.summary}</span>
                        {h.changes && Object.keys(h.changes).length > 0 && (
                          <div className="table-wrap" style={{ width: '100%' }}>
                            <table className="table">
                              <thead><tr><th>Field</th><th>Before</th><th>After</th></tr></thead>
                              <tbody>
                                {Object.entries(h.changes).map(([k, [b, a]]) => (
                                  <tr key={k}><td>{labelFor(type, k.replace(/_enc$/, ''))}</td><td className="faint">{b === null ? '—' : String(b)}</td><td>{a === null ? '—' : String(a)}</td></tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </li>
                    ))}
                  </ol>
                )
              )}
            </div>
            <div className="modal-foot">
              {editing ? (
                <>
                  <button key="cancel" type="button" className="btn btn-ghost" onClick={() => { if (isDirty && !confirmDiscard()) return; setEditing(false); }} disabled={busy}>Cancel</button>
                  <span className="kbd hide-mobile" title="Ctrl+Enter saves">Ctrl ↵</span>
                  <button key="save" className="btn btn-primary" type="submit" form="record-form" disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button>
                </>
              ) : confirmDelete ? (
                <>
                  <span className="muted" style={{ fontSize: 13 }}>Move to recycle bin? You can restore it later.</span>
                  <div className="row">
                    <button key="keep" type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmDelete(false)}>Keep</button>
                    <button key="bin" type="button" className="btn btn-danger btn-sm" onClick={remove} disabled={busy}>Move to bin</button>
                  </div>
                </>
              ) : (
                <>
                  <button key="delete" type="button" className="btn btn-danger btn-sm" onClick={() => setConfirmDelete(true)}><Icon name="trash" />Delete</button>
                  <button key="edit" type="button" className="btn btn-sm" onClick={(e) => { e.preventDefault(); startEdit(); }}><Icon name="edit" />Edit</button>
                </>
              )}
            </div>
          </>
        )}
      </aside>
    </Overlay>
  );
}

function EvidencePanel({ type, id, items, onChange }: {
  type: string; id: number; items: EvidenceItem[] | null; onChange: (items: EvidenceItem[], record?: RecordRow) => void;
}) {
  const { toast } = useApp();
  const [mode, setMode] = useState<'new' | 'existing' | 'drive'>('new');
  const [drive, setDrive] = useState<{ status: string } | null>(null);
  const [dq, setDq] = useState('');
  const [found, setFound] = useState<{ id: string; name: string; mime_type: string; modified_time: string | null; library_id: number | null }[] | null>(null);
  useEffect(() => { api.get<{ status: string }>('/integrations/google').then(setDrive).catch(() => setDrive(null)); }, []);
  async function searchDrive(e?: FormEvent) {
    e?.preventDefault();
    try { setFound((await api.get<any>(`/integrations/google/files?q=${encodeURIComponent(dq)}`)).files); } catch (err) { toast((err as Error).message, 'error'); }
  }
  async function attachDrive(fileId: string) {
    setBusy(true);
    try {
      const r = await api.post<{ reference: { id: number } }>(`/integrations/google/files/${encodeURIComponent(fileId)}/library`);
      const next = await api.post<EvidenceItem[]>(`/records/${type}/${id}/evidence`, { file_ref_id: r.reference.id });
      onChange(next); toast('Drive file linked (as a reference — nothing was copied)', 'ok');
    } catch (err) { toast((err as Error).message, 'error'); } finally { setBusy(false); }
  }
  const [provider, setProvider] = useState<'google_drive' | 'url' | 'local_path'>('google_drive');
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [existing, setExisting] = useState<RecordRow[] | null>(null);
  const [pick, setPick] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (mode === 'existing' && !existing) api.get<{ items: RecordRow[] }>('/records/file_references?limit=500').then((d) => setExisting(d.items));
  }, [mode, existing]);

  async function browse() {
    const p = await desktop?.pickFile();
    if (p) { setUrl(p); if (!title) setTitle(p.split(/[\\/]/).pop() || p); }
  }

  async function attach(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setErrors({});
    try {
      const body = mode === 'existing' ? { file_ref_id: Number(pick) } : { provider, title, url };
      const next = await api.post<EvidenceItem[]>(`/records/${type}/${id}/evidence`, body);
      onChange(next); setTitle(''); setUrl(''); setPick(''); setExisting(null);
      toast('Evidence linked', 'ok');
    } catch (err) {
      if (err instanceof ApiError) { setErrors(err.details || {}); if (!err.details) toast(err.message, 'error'); }
    } finally { setBusy(false); }
  }

  async function detach(linkId: number) {
    try {
      const r = await api.del<{ items: EvidenceItem[]; record: RecordRow }>(`/records/${type}/${id}/evidence/${linkId}`);
      onChange(r.items, r.record); toast('Evidence unlinked', 'ok');
    } catch (e) { toast((e as Error).message, 'error'); }
  }

  async function open(it: EvidenceItem) {
    const err = await openReference(it.provider, it.url);
    if (err) toast(err, 'error');
  }

  const linkedIds = new Set((items || []).map((i) => i.id));

  return (
    <div className="stack">
      <p className="muted" style={{ margin: 0, fontSize: 13 }}>
        SYNCHRONIA stores <strong>references</strong> to your documents. Google Drive stays your document repository; nothing is copied or uploaded.
      </p>
      {items === null ? <div className="skeleton" /> : items.length === 0 ? (
        <div className="empty"><strong>No supporting evidence linked.</strong>Link a certificate, transcript, special order or other proof below.</div>
      ) : (
        <ul className="list">
          {items.map((it) => (
            <li key={it.link_id}>
              <span className="tag">{PROVIDERS.find((p) => p.id === it.provider)?.label || it.provider}</span>
              <span className="grow">
                <span className="t">{it.title}</span>
                <span className="s mono" style={{ fontSize: 11.5 }}>{it.url}</span>
              </span>
              <button className="btn btn-sm btn-ghost" onClick={() => open(it)} disabled={it.provider === 'local_path' && !desktop}>Open</button>
              <button className="icon-btn sm" onClick={() => detach(it.link_id)} aria-label={`Unlink ${it.title}`}><Icon name="close" /></button>
            </li>
          ))}
        </ul>
      )}

      <form className="fieldset stack" onSubmit={attach}>
        <legend className="label">Attach evidence</legend>
        <div className="seg" role="group" aria-label="Evidence source">
          <button type="button" aria-pressed={mode === 'new'} onClick={() => setMode('new')}>New reference</button>
          <button type="button" aria-pressed={mode === 'existing'} onClick={() => setMode('existing')}>Already in SYNCHRONIA</button>
          {drive?.status === 'connected' && <button type="button" aria-pressed={mode === 'drive'} onClick={() => setMode('drive')}>Search my Google Drive</button>}
        </div>
        {mode === 'new' ? (
          <>
            <div className="seg" role="group" aria-label="Reference type">
              {PROVIDERS.filter((p) => p.id !== 'local_path' || desktop).map((p) => (
                <button key={p.id} type="button" aria-pressed={provider === p.id} onClick={() => { setProvider(p.id); setUrl(''); }}>{p.label}</button>
              ))}
            </div>
            <Field label="Title" required error={errors.title}>
              <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Certificate of Completion" />
            </Field>
            {provider === 'local_path' ? (
              <Field label="File" required error={errors.url} hint="The file stays where it is; SYNCHRONIA remembers its location.">
                <div className="row">
                  <input className="input mono" value={url} readOnly placeholder="No file chosen" />
                  <button type="button" className="btn" onClick={browse}>Browse…</button>
                </div>
              </Field>
            ) : (
              <Field label={provider === 'google_drive' ? 'Google Drive share link' : 'Web address'} required error={errors.url}
                hint={provider === 'google_drive' ? 'In Drive: Share › Copy link. Stored as a reference (file ID and link); nothing is copied. Connect Drive in Knowledge and References to search it instead.' : undefined}>
                <input className="input" type="url" value={url} onChange={(e) => setUrl(e.target.value)}
                  placeholder={provider === 'google_drive' ? 'https://drive.google.com/file/d/…' : 'https://'} />
              </Field>
            )}
          </>
        ) : mode === 'drive' ? (
          <div className="stack" style={{ gap: 'var(--s-2)' }}>
            <div className="row">
              <input className="input" value={dq} onChange={(e) => setDq(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); searchDrive(); } }} placeholder="File name in your Drive" aria-label="Search Google Drive by file name" />
              <button type="button" className="btn" onClick={() => searchDrive()}><Icon name="search" />Search</button>
            </div>
            {found && (found.length ? (
              <ul className="list">{found.map((f) => (
                <li key={f.id}><span className="grow"><span className="t">{f.name}</span><span className="s">{[f.mime_type?.split('/').pop(), f.modified_time && `modified ${f.modified_time.slice(0, 10)}`, f.library_id && 'in your library'].filter(Boolean).join(' · ')}</span></span>
                  <button type="button" className="btn btn-sm" disabled={busy || (f.library_id != null && linkedIds.has(f.library_id))} onClick={() => attachDrive(f.id)}><Icon name="link" />{f.library_id != null && linkedIds.has(f.library_id) ? 'Linked' : 'Link'}</button></li>
              ))}</ul>
            ) : <div className="empty">No files with that name.</div>)}
          </div>
        ) : (
          <Field label="Existing reference" required error={errors.file_ref_id}>
            <select className="select" value={pick} onChange={(e) => setPick(e.target.value)}>
              <option value="">Choose…</option>
              {(existing || []).filter((r) => !linkedIds.has(r.id)).map((r) => <option key={r.id} value={r.id}>{r._title} — {humanize(r.provider)}</option>)}
            </select>
          </Field>
        )}
        {mode !== 'drive' && <div><button className="btn btn-primary" disabled={busy || (mode === 'existing' && !pick)}><Icon name="link" />{busy ? 'Linking…' : 'Link evidence'}</button></div>}
      </form>
    </div>
  );
}
