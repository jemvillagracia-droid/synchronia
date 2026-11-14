import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { JSONContent } from '@tiptap/react';
import { ApiError, api, dataChanged } from '../../lib/api';
import { fmtTime12, humanize, relTime } from '../../lib/format';
import { useDirty } from '../../lib/dirty';
import { useApp } from '../../components/AppContext';
import { Icon } from '../../components/Icon';
import { DocEditor } from '../../components/DocEditor';
import { askText } from '../../components/AskText';
import { exportFile } from '../../lib/research';

interface Section { id: number; heading: string; section_key: string | null; status: string; notes: string | null; body: JSONContent | null; words: number; updated_at: string }
interface View { document: any; project: { id: number; title: string } | null; sections: Section[]; words: number; checklist: { ok: boolean; label: string }[]; kind_label: string }
const STATUS: [string, string][] = [['not_started', 'Not started'], ['drafting', 'Drafting'], ['complete', 'Complete'], ['not_applicable', 'Not applicable']];
const EMPTY: JSONContent = { type: 'doc', content: [{ type: 'paragraph' }] };

/** Proposal, concept paper, methodology document or manuscript, written section by section. */
export function DocumentPage() {
  const { id } = useParams();
  const { toast, openRecord } = useApp();
  const [v, setV] = useState<View | null>(null);
  const [error, setError] = useState('');
  const [cur, setCur] = useState<number | null>(null);
  const [state, setState] = useState<'saved' | 'pending' | 'saving' | 'error' | 'conflict'>('saved');
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [history, setHistory] = useState<{ id: number; words: number; reason: string; created_at: string }[] | null>(null);
  const [ver, setVer] = useState(0);
  const body = useRef<JSONContent | null>(null);
  const base = useRef('');
  const timer = useRef<number | undefined>(undefined);

  const load = useCallback(() => api.get<View>(`/research/documents/${id}`).then((d) => { setV(d); setError(''); setCur((c) => c ?? d.sections[0]?.id ?? null); }).catch((e) => setError(e.message)), [id]);
  useEffect(() => { load(); }, [load]);
  const section = v?.sections.find((s) => s.id === cur) || null;
  useEffect(() => { if (section) { base.current = section.updated_at; body.current = section.body; } }, [section?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useDirty(`research-doc-${id}`, state === 'pending' || state === 'saving' || state === 'error');

  const save = useCallback(async (extra: Record<string, unknown> = {}) => {
    window.clearTimeout(timer.current);
    if (!section) return;
    setState('saving');
    try {
      const r = await api.put<{ updated_at: string; status: string; words: number }>(`/research/sections/${section.id}`, { ...(body.current ? { body: body.current } : {}), ...extra, base_updated_at: base.current });
      base.current = r.updated_at; setSavedAt(new Date()); setState('saved');
      setV((x) => x && { ...x, sections: x.sections.map((s) => (s.id === section.id ? { ...s, status: r.status, words: r.words, updated_at: r.updated_at, body: body.current } : s)) });
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) { setState('conflict'); toast(e.message, 'error'); } else setState('error');
    }
  }, [section, toast]);
  const onChange = useCallback((d: JSONContent) => { body.current = d; setState('pending'); window.clearTimeout(timer.current); timer.current = window.setTimeout(() => { save(); }, 1200); }, [save]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) { e.preventDefault(); save(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [save]);

  async function pick(sid: number) {
    if (state === 'pending' || state === 'error') await save();
    setCur(sid); setHistory(null); setState('saved'); setVer((n) => n + 1);
    load();
  }
  async function setStatus(status: string) { await save({ status }); load(); dataChanged(); }
  async function addSection() {
    const heading = await askText('Heading of the new section');
    if (!heading?.trim()) return;
    try { const d = await api.post<View>(`/research/documents/${id}/sections`, { heading: heading.trim() }); setV(d); } catch (e) { toast((e as Error).message, 'error'); }
  }
  async function showHistory() {
    if (!section) return;
    if (history) { setHistory(null); return; }
    setHistory(await api.get(`/research/sections/${section.id}/versions`));
  }
  async function restore(vid: number, at: string) {
    if (!section || !window.confirm(`Restore “${section.heading}” as it was ${relTime(at)}? The current text is kept as a recovery point.`)) return;
    try { const d = await api.post<View>(`/research/sections/${section.id}/versions/${vid}/restore`); setV(d); setHistory(null); setVer((n) => n + 1); toast('Restored', 'ok'); } catch (e) { toast((e as Error).message, 'error'); }
  }
  async function exportAs(format: 'docx' | 'pdf') { await save(); await exportFile(`/research/documents/${id}/export`, { format }, toast); }

  if (error) return <div className="page"><div className="alert">{error}</div><Link to="/research?tab=writing" className="btn mt-4">Back</Link></div>;
  if (!v) return <div className="page"><div className="skeleton" style={{ height: 400 }} /></div>;
  const d = v.document;
  const statusText = { saved: savedAt ? `Saved ${fmtTime12(savedAt, false)}` : 'All changes saved', pending: 'Editing…', saving: 'Saving…', error: 'Not saved — retrying when you type', conflict: 'Changed elsewhere' }[state];
  return (
    <div className="page doc-page">
      <div className="doc-head">
        <div className="doc-title">
          <div className="crumb"><span className="bar" /><span className="label"><Link to="/research?tab=writing">Research Development</Link>{v.project && <> · <Link to={`/research/projects/${v.project.id}?tab=writing`}>{v.project.title}</Link></>} · {v.kind_label}</span></div>
          <h1>{d.title}</h1>
          <div className="faint" style={{ fontSize: 13 }}>{[humanize(d.status), d.target, `${v.words.toLocaleString('en')}${d.word_limit ? ` of ${Number(d.word_limit).toLocaleString('en')}` : ''} words`].filter(Boolean).join(' · ')}</div>
        </div>
        <div className="doc-actions">
          <span className={`doc-status ${state}`} role="status" aria-live="polite">{statusText}</span>
          {state === 'conflict' && <button className="btn btn-sm" onClick={() => { load(); setVer((n) => n + 1); setState('saved'); }}>Reload</button>}
          <button className="btn btn-sm" onClick={() => openRecord('research_documents', d.id)}><Icon name="edit" />Details</button>
          <button className="btn btn-sm btn-primary" onClick={() => exportAs('docx')}><Icon name="download" />Word</button>
          <button className="btn btn-sm" onClick={() => exportAs('pdf')}><Icon name="download" />PDF</button>
        </div>
      </div>
      <div className="rdoc">
        <aside className="rdoc-side">
          <nav aria-label="Sections"><ol className="rdoc-sections">{v.sections.map((s) => (
            <li key={s.id}><button className={`rdoc-sec ${s.id === cur ? 'on' : ''} st-${s.status}`} onClick={() => pick(s.id)} aria-current={s.id === cur ? 'true' : undefined}>
              <span className="h">{s.heading}</span><span className="m">{STATUS.find(([k]) => k === s.status)?.[1]}{s.words ? ` · ${s.words} words` : ''}</span></button></li>
          ))}</ol></nav>
          <button className="btn btn-sm" onClick={addSection}><Icon name="plus" />Section</button>
          <section className="rdoc-check" aria-label="Completion checklist">
            <h3 className="label">Checklist</h3>
            <ul>{v.checklist.map((c, i) => <li key={i} className={c.ok ? 'ok' : ''}><span aria-hidden>{c.ok ? '✓' : '○'}</span> {c.label}</li>)}</ul>
          </section>
        </aside>
        <div className="rdoc-main">
          {section ? (
            <>
              <div className="row wrap" style={{ marginBottom: 'var(--s-2)' }}>
                <h2 className="rdoc-h">{section.heading}</h2><span style={{ flex: 1 }} />
                <label className="sr-only" htmlFor="sec-status">Section status</label>
                <select id="sec-status" className="select select-sm" value={section.status} onChange={(e) => setStatus(e.target.value)}>{STATUS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
                <button className="btn btn-sm" onClick={showHistory} aria-expanded={!!history}><Icon name="history" />Recovery points</button>
              </div>
              {history && (
                <div className="panel doc-history"><div className="panel-body">{history.length === 0 ? <div className="faint">None yet — kept automatically while you write (at most every 10 minutes).</div> : (
                  <ul className="list">{history.map((h) => <li key={h.id}><span className="grow"><span className="t">{new Date(h.created_at).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })}</span><span className="s">{humanize(h.reason)} · {h.words} words</span></span>
                    <button className="btn btn-sm" onClick={() => restore(h.id, h.created_at)}><Icon name="restore" />Restore</button></li>)}</ul>)}</div></div>
              )}
              {section.status === 'not_applicable' ? <div className="empty">Marked not applicable — left out of the exported document. Change the status to write it.</div> : (
                <DocEditor key={`${section.id}-${ver}`} initial={section.body || EMPTY} onChange={onChange} page={{ size: 'letter', landscape: false }} label={`${section.heading} section`} />
              )}
              {section.section_key === 'references' && <p className="faint" style={{ fontSize: 12.5 }}>Leave this section empty to list the project's linked literature in APA 7 style when exporting.</p>}
              <label className="field mt-4"><span className="label">Notes for this section (not exported)</span>
                <textarea className="textarea" rows={3} defaultValue={section.notes || ''} key={`n-${section.id}`} onBlur={(e) => { if ((e.target.value || null) !== section.notes) save({ notes: e.target.value }); }} /></label>
            </>
          ) : <div className="empty">This document has no sections. Add one.</div>}
        </div>
      </div>
    </div>
  );
}
