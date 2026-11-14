import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { Editor, JSONContent } from '@tiptap/react';
import { ApiError, api, dataChanged } from '../../lib/api';
import { download } from '../../lib/download';
import { fmtTime12, humanize, relTime } from '../../lib/format';
import { useDirty } from '../../lib/dirty';
import { useApp } from '../../components/AppContext';
import { Icon } from '../../components/Icon';
import { DocEditor, type Page } from '../../components/DocEditor';

interface DocView {
  syllabus: { id: number; course_id: number; version_label: string; academic_year: string | null; semester: string | null; status: string; updated_at: string };
  course: { id: number; code: string; title: string } | null;
  document: JSONContent; page: Page; words: number; page_sizes: Record<string, string>;
  snapshots: { id: number; words: number; reason: string; created_at: string }[];
}
type SaveState = 'saved' | 'pending' | 'saving' | 'error' | 'conflict';

/** A syllabus opened as one document, edited like a word processor. Saves automatically. */
export function SyllabusPage() {
  const { id } = useParams();
  const { toast, openRecord } = useApp();
  const navigate = useNavigate();
  const [v, setV] = useState<DocView | null>(null);
  const [error, setError] = useState('');
  const [state, setState] = useState<SaveState>('saved');
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [words, setWords] = useState(0);
  const [page, setPage] = useState<Page | null>(null);
  const [busy, setBusy] = useState('');
  const [history, setHistory] = useState(false);
  const [version, setVersion] = useState(0); // remounts the editor after a restore
  const doc = useRef<JSONContent | null>(null);
  const base = useRef<string>('');
  const timer = useRef<number | undefined>(undefined);
  const saving = useRef<Promise<void> | null>(null);
  const editor = useRef<Editor | null>(null);

  const load = useCallback(() => api.get<DocView>(`/academic/syllabi/${id}/document`).then((d) => {
    setV(d); setPage(d.page); setWords(d.words); doc.current = d.document; base.current = d.syllabus.updated_at; setState('saved'); setError('');
  }).catch((e) => setError(e.message)), [id]);
  useEffect(() => { load(); }, [load]);
  useDirty(`syllabus-${id}`, state === 'pending' || state === 'saving' || state === 'error');

  const save = useCallback(async (nextPage?: Page) => {
    window.clearTimeout(timer.current);
    if (saving.current) await saving.current;
    if (!doc.current) return;
    setState('saving');
    const run = (async () => {
      try {
        const r = await api.put<{ updated_at: string; words: number; page: Page }>(`/academic/syllabi/${id}/document`, { document: doc.current, page: nextPage || page, base_updated_at: base.current });
        base.current = r.updated_at; setWords(r.words); setSavedAt(new Date()); setState('saved'); dataChanged();
      } catch (e) {
        if (e instanceof ApiError && e.status === 409) { setState('conflict'); toast(e.message, 'error'); } else { setState('error'); }
      }
    })();
    saving.current = run;
    await run;
    saving.current = null;
  }, [id, page, toast]);

  const onChange = useCallback((d: JSONContent) => {
    doc.current = d;
    setState((s) => (s === 'conflict' ? s : 'pending'));
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => { save(); }, 1200);
  }, [save]);

  // Ctrl+S saves now; leaving the page saves what is pending.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) { e.preventDefault(); save(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [save]);
  useEffect(() => () => { if (timer.current) { window.clearTimeout(timer.current); void save(); } }, [save]);

  async function exportAs(format: 'docx' | 'pdf') {
    setBusy(format);
    try {
      await save();
      const r = await api.post<{ file_name: string; download: string; validation?: { summary: string } }>(`/academic/syllabi/${id}/document/export`, { format });
      download(r.download, r.file_name);
      toast(`Saved ${r.file_name}${r.validation ? ` — ${r.validation.summary}` : ''}`, 'ok');
    } catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(''); }
  }

  async function restore(snapId: number, at: string) {
    if (!window.confirm(`Restore the syllabus as it was ${relTime(at)}? The current text is kept as a recovery point.`)) return;
    try {
      await save();
      const d = await api.post<DocView>(`/academic/syllabi/${id}/snapshots/${snapId}/restore`);
      setV(d); setPage(d.page); setWords(d.words); doc.current = d.document; base.current = d.syllabus.updated_at; setState('saved'); setVersion((n) => n + 1); setHistory(false);
      toast('Restored. The text you replaced is kept as a recovery point.', 'ok'); dataChanged();
    } catch (e) { toast((e as Error).message, 'error'); }
  }

  if (error) return <div className="page"><div className="alert">{error}</div><button className="btn mt-4" onClick={() => navigate(-1)}>Back</button></div>;
  if (!v || !page) return <div className="page"><div className="skeleton" style={{ height: 400 }} /></div>;
  const status = { saved: savedAt ? `Saved ${fmtTime12(savedAt, false)}` : 'All changes saved', pending: 'Editing…', saving: 'Saving…', error: 'Not saved — retrying when you type', conflict: 'Changed elsewhere' }[state];

  return (
    <div className="page doc-page">
      <div className="doc-head">
        <div className="doc-title">
          <div className="crumb"><span className="bar" /><span className="label"><Link to="/academic">Academic Workspace</Link> · <Link to={`/academic/courses/${v.syllabus.course_id}`}>{v.course?.code}</Link> · Syllabus</span></div>
          <h1>{v.course?.code} · {v.syllabus.version_label}</h1>
          <div className="faint" style={{ fontSize: 13 }}>{[v.course?.title, v.syllabus.academic_year, humanize(v.syllabus.semester || ''), humanize(v.syllabus.status)].filter(Boolean).join(' · ')}</div>
        </div>
        <div className="doc-actions">
          <span className={`doc-status ${state}`} role="status" aria-live="polite">{status} · {words.toLocaleString('en')} words</span>
          {state === 'conflict' && <button className="btn btn-sm" onClick={() => { if (window.confirm('Reload the latest saved version? Your unsaved text here will be replaced.')) { load(); setVersion((n) => n + 1); } }}>Reload</button>}
          {state === 'error' && <button className="btn btn-sm" onClick={() => save()}>Save now</button>}
          <label className="sr-only" htmlFor="pg-size">Paper size</label>
          <select id="pg-size" className="select select-sm" value={page.size} onChange={(e) => { const p = { ...page, size: e.target.value as Page['size'] }; setPage(p); save(p); }}>
            {Object.entries(v.page_sizes).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <div className="seg" role="group" aria-label="Orientation">
            <button aria-pressed={!page.landscape} onClick={() => { const p = { ...page, landscape: false }; setPage(p); save(p); }}>Portrait</button>
            <button aria-pressed={page.landscape} onClick={() => { const p = { ...page, landscape: true }; setPage(p); save(p); }}>Landscape</button>
          </div>
          <button className="btn btn-sm" onClick={() => setHistory((h) => !h)} aria-expanded={history}><Icon name="history" />Recovery points</button>
          <button className="btn btn-sm" onClick={() => openRecord('syllabi', v.syllabus.id)}><Icon name="edit" />Details</button>
          <button className="btn btn-sm btn-primary" onClick={() => exportAs('docx')} disabled={!!busy}><Icon name="download" />{busy === 'docx' ? 'Exporting…' : 'Word'}</button>
          <button className="btn btn-sm" onClick={() => exportAs('pdf')} disabled={!!busy}><Icon name="download" />{busy === 'pdf' ? 'Exporting…' : 'PDF'}</button>
        </div>
      </div>
      {history && (
        <div className="panel doc-history">
          <header className="panel-head"><h2>Recovery points</h2><span className="faint" style={{ fontSize: 12.5 }}>Kept automatically while you write (at most every 10 minutes), and before every restore.</span></header>
          <div className="panel-body">
            {v.snapshots.length === 0 ? <div className="faint">None yet.</div> : (
              <ul className="list">{v.snapshots.map((sn) => (
                <li key={sn.id}><span className="grow"><span className="t">{new Date(sn.created_at).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })}</span>
                  <span className="s">{humanize(sn.reason)} · {sn.words.toLocaleString('en')} words</span></span>
                  <button className="btn btn-sm" onClick={() => restore(sn.id, sn.created_at)}><Icon name="restore" />Restore</button></li>
              ))}</ul>
            )}
          </div>
        </div>
      )}
      <DocEditor key={version} initial={doc.current || v.document} onChange={onChange} page={page} label={`Syllabus ${v.course?.code} ${v.syllabus.version_label}`} editorRef={(e) => { editor.current = e; }} />
    </div>
  );
}
