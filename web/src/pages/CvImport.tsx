import { useRef, useState } from 'react';
import { ApiError, api, dataChanged } from '../lib/api';
import { fmtDate, humanize } from '../lib/format';
import { useApp } from '../components/AppContext';
import { Icon } from '../components/Icon';
import { Overlay } from '../components/Overlay';
import { AutoText } from '../components/AutoText';

interface Item { key: string; section: string; resource: string; values: Record<string, any>; missing: string[]; hint: string | null; source: string[]; duplicate_of: number | null; include: boolean }
interface ProfileProp { field: string; value: string; current: string | null; apply: boolean; note?: string }
interface Preview { source: string; format: string; profile: ProfileProp[]; items: Item[]; skipped: { heading: string; reason: string; lines: string[] }[] }

const LABEL: Record<string, string> = { education: 'Education', employment: 'Employment', licenses: 'Licences', trainings: 'Trainings and speaking', memberships: 'Memberships and organisations', awards: 'Awards', publications: 'Publications' };
/** The fields shown for quick editing per record type (everything else is kept as read). */
const KEY_FIELDS: Record<string, [string, string][]> = {
  education: [['degree', 'Degree'], ['institution', 'Institution'], ['start_date', 'From'], ['graduation_date', 'Completed']],
  employment: [['position', 'Position'], ['institution', 'Institution'], ['start_date', 'From'], ['end_date', 'To']],
  licenses: [['license_type', 'Licence'], ['issuing_authority', 'Issued by'], ['registration_date', 'Registered']],
  trainings: [['title', 'Title'], ['organizer', 'Organiser / venue'], ['start_date', 'Date']],
  memberships: [['organization', 'Organisation'], ['membership_type', 'Membership / role']],
  awards: [['title', 'Award'], ['issuer', 'Given by'], ['date_received', 'Date']],
  publications: [['title', 'Title'], ['authors', 'Authors'], ['venue', 'Venue / anthology'], ['publication_date', 'Date']],
};
const dateish = (k: string) => /date$/.test(k);
const showDate = (v: string) => (v ? fmtDate(v) : '');

export function CvImportButton() {
  const { toast } = useApp();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [p, setP] = useState<Preview | null>(null);
  const [saving, setSaving] = useState(false);
  const [failures, setFailures] = useState<Record<string, string>>({});
  const [open, setOpen] = useState<string | null>(null);

  async function read(f: File) {
    if (!/\.(pdf|docx)$/i.test(f.name)) { toast(`“${f.name}” is not a PDF or Word (.docx) file.`, 'error'); return; }
    setBusy(true);
    try {
      const res = await fetch('/api/portfolio/import-cv', { method: 'POST', credentials: 'same-origin', headers: { 'X-Synchronia': '1', 'Content-Type': 'application/octet-stream', 'X-Filename': encodeURIComponent(f.name) }, body: f });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || `Could not read the file (${res.status})`);
      setP(d); setFailures({});
    } catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(false); }
  }
  const setItem = (key: string, patch: Partial<Item>) => p && setP({ ...p, items: p.items.map((i) => (i.key === key ? { ...i, ...patch } : i)) });
  const setVal = (it: Item, k: string, v: string) => {
    const values = { ...it.values, [k]: v || undefined };
    if (!v) delete values[k];
    setItem(it.key, { values, missing: it.missing.filter((m) => !(m === k && v)) });
  };
  async function commit() {
    if (!p) return;
    setSaving(true); setFailures({});
    try {
      const r = await api.post<{ created: Record<string, number>; profile_updated: string[] }>('/portfolio/import-cv/commit', p);
      const n = Object.values(r.created).reduce((a, b) => a + b, 0);
      toast(`Imported ${n} record${n === 1 ? '' : 's'}${r.profile_updated.length ? ` and ${r.profile_updated.length} profile detail${r.profile_updated.length === 1 ? '' : 's'}` : ''}. All are marked self-reported until you confirm them or link evidence.`, 'ok');
      setP(null); dataChanged();
    } catch (e) {
      const f = e instanceof ApiError ? (e.details as any)?.failures : null;
      if (f) setFailures(Object.fromEntries(f.map((x: any) => [x.key, Object.values(x.details || {}).join('; ') || x.error])));
      toast((e as Error).message, 'error');
    } finally { setSaving(false); }
  }
  const chosen = p ? p.items.filter((i) => i.include).length : 0;
  const groups = p ? [...new Set(p.items.map((i) => i.resource))] : [];

  return (
    <>
      <input ref={input} type="file" hidden accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) read(f); }} />
      <button className="btn" disabled={busy} onClick={() => input.current?.click()}><Icon name="upload" />{busy ? 'Reading CV…' : 'Import from existing CV'}</button>
      {p && (
        <Overlay onClose={() => !saving && setP(null)} label="Import from CV">
          <aside className="drawer wide">
            <div className="modal-head"><span className="label">Import from CV · {p.source}</span><span style={{ flex: 1 }} />
              <button className="icon-btn sm" onClick={() => setP(null)} aria-label="Close" disabled={saving}><Icon name="close" /></button></div>
            <div className="modal-body stack" style={{ gap: 'var(--s-5)' }}>
              <div>
                <h2 className="display" style={{ fontSize: 30, margin: 0 }}>Review before importing</h2>
                <p className="muted" style={{ margin: '6px 0 0', fontSize: 14 }}>Nothing is saved yet. Tick what to bring into your portfolio and correct anything that was read wrongly. Dates keep the precision your CV gives — a year stays a year. Imported records are marked <b>self-reported</b>; things already in your portfolio are unticked.</p>
              </div>
              {p.profile.length > 0 && (
                <section>
                  <h3 className="label">Profile</h3>
                  <ul className="list">{p.profile.map((x, i) => (
                    <li key={i}><input type="checkbox" className="check" checked={x.apply} onChange={(e) => setP({ ...p, profile: p.profile.map((y, j) => (j === i ? { ...y, apply: e.target.checked } : y)) })} aria-label={`Use ${humanize(x.field)} from the CV`} />
                      <span className="grow"><span className="t">{humanize(x.field)}: {x.value}</span><span className="s">{x.current ? `Currently: ${x.current}` : 'Not set yet'}{x.note ? ` · ${x.note}` : ''}</span></span></li>
                  ))}</ul>
                </section>
              )}
              {groups.map((g) => (
                <section key={g}>
                  <h3 className="label">{LABEL[g] || humanize(g)} ({p.items.filter((i) => i.resource === g).length})</h3>
                  <div className="imp-items">
                    {p.items.filter((i) => i.resource === g).map((it) => (
                      <div key={it.key} className={`imp-item ${it.include ? 'on' : ''} ${it.missing.length ? 'needs' : ''}`}>
                        <div className="imp-head">
                          <label className="row" style={{ gap: 8 }}><input type="checkbox" className="check" checked={it.include} disabled={it.missing.length > 0 && !it.include && false}
                            onChange={(e) => setItem(it.key, { include: e.target.checked })} />
                            <span className="imp-title">{it.values[KEY_FIELDS[it.resource]?.[0]?.[0]] || '(untitled)'}</span></label>
                          {it.duplicate_of && <span className="tag st-system">Already in portfolio</span>}
                          {it.missing.length > 0 && <span className="tag st-self">Needs {it.missing.map(humanize).join(', ')}</span>}
                          <span className="faint" style={{ fontSize: 12.5 }}>{it.section}</span>
                        </div>
                        {it.include && (
                          <div className="imp-fields">
                            {(KEY_FIELDS[it.resource] || []).map(([k, l]) => (
                              <label key={k} className={`imp-field ${it.missing.includes(k) ? 'miss' : ''}`}><span>{l}{dateish(k) && it.values[k] ? ` · ${showDate(it.values[k])}` : ''}</span>
                                <AutoText value={String(it.values[k] ?? '')} onChange={(v) => setVal(it, k, v)} placeholder={dateish(k) ? 'YYYY, YYYY-MM or YYYY-MM-DD' : it.missing.includes(k) ? 'Required' : ''} /></label>
                            ))}
                          </div>
                        )}
                        {it.hint && it.include && <div className="faint" style={{ fontSize: 12.5 }}>{it.hint}</div>}
                        {failures[it.key] && <div className="err" role="alert">{failures[it.key]}</div>}
                        <button className="linkbtn" style={{ marginLeft: 0 }} onClick={() => setOpen(open === it.key ? null : it.key)}>{open === it.key ? 'Hide' : 'Show'} what the CV says</button>
                        {open === it.key && <pre className="imp-src">{it.source.join('\n')}</pre>}
                      </div>
                    ))}
                  </div>
                </section>
              ))}
              {p.skipped.length > 0 && (
                <section>
                  <h3 className="label">Not imported</h3>
                  {p.skipped.map((s) => <div key={s.heading} className="imp-skip"><b>{s.heading}</b> — {s.reason}<pre className="imp-src">{s.lines.join('\n')}</pre></div>)}
                </section>
              )}
            </div>
            <div className="modal-foot">
              <span className="faint">{chosen} of {p.items.length} records selected</span><span style={{ flex: 1 }} />
              <button className="btn btn-ghost" onClick={() => setP(null)} disabled={saving}>Cancel</button>
              <button className="btn btn-primary" onClick={commit} disabled={saving || (!chosen && !p.profile.some((x) => x.apply)) || p.items.some((i) => i.include && i.missing.length)}>
                {saving ? 'Importing…' : `Import ${chosen} record${chosen === 1 ? '' : 's'}`}</button>
            </div>
          </aside>
        </Overlay>
      )}
    </>
  );
}
