import { useEffect, useState } from 'react';
import { Overlay } from './Overlay';
import { Icon } from './Icon';
import { Field, SpecInput, isLongField } from './Field';
import { api, ApiError, dataChanged } from '../lib/api';
import { fmtDate, fmtDateTime, humanize } from '../lib/format';
import type { RecordRow } from '../lib/types';
import { useApp } from './AppContext';

const VERIFICATION_LABEL: Record<string, { text: string; cls: string }> = {
  self_reported: { text: 'Self-reported', cls: '' },
  user_confirmed: { text: 'User confirmed', cls: 'violet' },
  evidence_verified: { text: 'Evidence verified', cls: 'ok' },
};

interface HistoryItem { id: number; action: string; summary: string; at: string; changes: Record<string, [any, any]> | null }

/** View, edit, delete (to recycle bin) and inspect history of any registered record. */
export function RecordDrawer({ type, id, onClose, onCreated }: { type: string; id: number | null; onClose: () => void; onCreated?: (r: RecordRow) => void }) {
  const isNew = id === null;
  const { schema, toast } = useApp();
  const spec = schema?.[type];
  const [row, setRow] = useState<RecordRow | null>(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'details' | 'history'>('details');
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, any>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<HistoryItem[] | null>(null);
  const [refOptions, setRefOptions] = useState<Record<string, { id: number; label: string }[]>>({});
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (isNew) return;
    api.get<RecordRow>(`/records/${type}/${id}`).then(setRow).catch((e) => setError(e.message));
  }, [type, id, isNew]);

  // Create mode: start with an empty draft (required enums default to their first value).
  useEffect(() => {
    if (!isNew || !spec || editing) return;
    const d: Record<string, any> = {};
    for (const [name, f] of Object.entries(spec.fields)) {
      if (f.type === 'json') continue;
      d[name] = f.type === 'bool' ? false : f.type === 'enum' && f.required ? f.values![0] : name === 'verification' ? 'self_reported' : null;
    }
    setDraft(d); setEditing(true);
  }, [isNew, spec, editing]);

  useEffect(() => {
    if (tab === 'history' && !isNew) api.get<HistoryItem[]>(`/records/${type}/${id}/history`).then(setHistory).catch(() => setHistory([]));
  }, [tab, type, id, row?.updated_at]);

  useEffect(() => {
    if (!editing || !spec) return;
    for (const [name, f] of Object.entries(spec.fields)) {
      if (f.type === 'ref' && f.resource && !refOptions[name]) {
        api.get<{ items: RecordRow[] }>(`/records/${f.resource}?limit=200&sort=updated_at`).then((d) =>
          setRefOptions((o) => ({ ...o, [name]: d.items.map((x) => ({ id: x.id, label: x._title })) })));
      }
    }
  }, [editing, spec, refOptions]);

  function startEdit() {
    if (!row || !spec) return;
    const d: Record<string, any> = {};
    for (const [name, f] of Object.entries(spec.fields)) {
      if (f.type === 'json') continue;
      d[name] = f.type === 'secret' ? '' : row[name];
    }
    setDraft(d); setErrors({}); setEditing(true);
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

  async function save() {
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
    } catch (e) {
      if (e instanceof ApiError) { setErrors(e.details || {}); if (!e.details) toast(e.message, 'error'); }
    } finally { setBusy(false); }
  }

  async function remove() {
    setBusy(true);
    try {
      await api.del(`/records/${type}/${id}`);
      dataChanged(); toast('Moved to recycle bin — restore it from Settings › Data', 'ok'); onClose();
    } catch (e) { toast((e as Error).message, 'error'); setBusy(false); }
  }

  const display = (name: string, v: any) => {
    const f = spec?.fields[name];
    if (v === null || v === undefined || v === '') return null;
    if (!f) return String(v);
    if (f.type === 'bool') return v ? 'Yes' : 'No';
    if (f.type === 'date') return fmtDate(v);
    if (f.type === 'enum') return humanize(v);
    if (f.type === 'json') return JSON.stringify(v, null, 2);
    return String(v);
  };

  const form = spec && editing ? (
                <form className="form-grid" onSubmit={(e) => { e.preventDefault(); save(); }} id="record-form">
                  {Object.entries(spec.fields).filter(([, f]) => f.type !== 'json').map(([name, f]) => (
                    <Field key={name} label={humanize(f.type === 'ref' ? name.replace(/_id$/, '') : name)} required={f.required} error={errors[name]}
                      className={isLongField(name, f) ? 'span-2' : ''}
                      hint={f.type === 'secret' ? `Stored encrypted.${row ? ` Current: ${row[`${name}_masked`] || 'none'}` : ''}` : name === 'verification' ? '“Evidence verified” is set only once supporting evidence is linked.' : undefined}>
                      <SpecInput name={name} spec={f} value={draft[name]} refOptions={refOptions[name]}
                        onChange={(v) => setDraft((d) => ({ ...d, [name]: v }))} />
                    </Field>
                  ))}
                </form>
  ) : null;

  const ver = row?.verification ? VERIFICATION_LABEL[row.verification] : null;

  return (
    <Overlay onClose={onClose} label={spec ? spec.label : 'Record'}>
      <aside className="drawer">
        <div className="modal-head">
          <span className="label">{spec?.label || humanize(type)}</span>
          <span style={{ flex: 1 }} />
          <button className="icon-btn sm" onClick={onClose} aria-label="Close"><Icon name="close" /></button>
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
              <button className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
              <button className="btn btn-primary" type="submit" form="record-form" disabled={busy}>{busy ? 'Saving…' : 'Save record'}</button>
            </div>
          </>
        )}
        {row && spec && (
          <>
            <div style={{ padding: 'var(--s-4) var(--s-4) 0' }}>
              <h2 className="display" style={{ fontSize: 34, margin: 0 }}>{row._title}</h2>
              <div className="row wrap mt-3">
                {ver && <span className={`tag ${ver.cls}`}>{ver.text}</span>}
                {row.status && <span className="tag">{humanize(row.status)}</span>}
                <span className="faint" style={{ fontSize: 12 }}>Recorded {fmtDateTime(row.created_at)} · Updated {fmtDateTime(row.updated_at)}</span>
              </div>
              <div className="tabs" style={{ marginTop: 'var(--s-4)', marginBottom: 0 }} role="tablist">
                <button role="tab" aria-selected={tab === 'details'} onClick={() => setTab('details')}>Details</button>
                <button role="tab" aria-selected={tab === 'history'} onClick={() => { setTab('history'); setEditing(false); }}>Version history</button>
              </div>
            </div>
            <div className="modal-body" style={{ flex: 1 }}>
              {tab === 'details' && !editing && (
                <dl className="dl">
                  {Object.keys(spec.fields).map((name) => {
                    const f = spec.fields[name];
                    const v = f.type === 'secret' ? row[`${name}_masked`] : display(name, row[name]);
                    return (
                      <div key={name} style={{ display: 'contents' }}>
                        <dt>{humanize(f.type === 'ref' ? name.replace(/_id$/, '') : name)}</dt>
                        <dd className={v ? '' : 'none'}>{v || '—'}</dd>
                      </div>
                    );
                  })}
                </dl>
              )}
              {tab === 'details' && editing && form}
              {tab === 'history' && (
                history === null ? <div className="skeleton" /> : (
                  <ol className="list">
                    {history.map((h) => (
                      <li key={h.id} style={{ alignItems: 'flex-start', flexDirection: 'column', gap: 4 }}>
                        <div className="between" style={{ width: '100%' }}>
                          <span className={`tag ${h.action === 'delete' ? 'red' : h.action === 'create' ? 'violet' : ''}`}>{h.action}</span>
                          <span className="faint num" style={{ fontSize: 12 }}>{fmtDateTime(h.at)}</span>
                        </div>
                        {h.changes && Object.keys(h.changes).length > 0 && (
                          <div className="table-wrap" style={{ width: '100%' }}>
                            <table className="table">
                              <thead><tr><th>Field</th><th>Before</th><th>After</th></tr></thead>
                              <tbody>
                                {Object.entries(h.changes).map(([k, [b, a]]) => (
                                  <tr key={k}><td>{humanize(k.replace(/_enc$/, ''))}</td><td className="faint">{b === null ? '—' : String(b)}</td><td>{a === null ? '—' : String(a)}</td></tr>
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
                  <button key="cancel" type="button" className="btn btn-ghost" onClick={() => setEditing(false)} disabled={busy}>Cancel</button>
                  <button key="save" className="btn btn-primary" type="submit" form="record-form" disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button>
                </>
              ) : confirmDelete ? (
                <>
                  <span className="muted" style={{ fontSize: 13 }}>Move to recycle bin? You can restore it later.</span>
                  <div className="row">
                    <button className="btn btn-ghost btn-sm" onClick={() => setConfirmDelete(false)}>Keep</button>
                    <button className="btn btn-danger btn-sm" onClick={remove} disabled={busy}>Move to bin</button>
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
