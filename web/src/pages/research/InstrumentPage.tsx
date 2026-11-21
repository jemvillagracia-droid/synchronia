import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, dataChanged, onDataChanged } from '../../lib/api';
import { fmtDate, humanize } from '../../lib/format';
import { useAutosave } from '../../lib/autosave';
import { useApp } from '../../components/AppContext';
import { Icon } from '../../components/Icon';
import { SaveIndicator } from '../../components/SaveIndicator';
import { INSTRUMENT_STAGES, exportFile } from '../../lib/research';

interface Item { text: string; reverse: boolean; note: string }
interface Dim { name: string; description: string; items: Item[] }
interface Version { id: number; version_no: number; label: string | null; stage: string; instructions: string | null; response_scale: string | null; scoring: string | null; interpretation: string | null; change_notes: string | null; structure: { dimensions: Dim[] }; created_at: string }
interface W { instrument: any; versions: Version[]; reviews: any[]; projects: { id: number; title: string }[] }
type Draft = Pick<Version, 'label' | 'instructions' | 'response_scale' | 'scoring' | 'interpretation' | 'change_notes'> & { structure: { dimensions: Dim[] } };

/** Research Instrument Laboratory: development, expert review and revision of one instrument, every version kept. */
export function InstrumentPage() {
  const { id } = useParams();
  const { openNew, openRecord, toast } = useApp();
  const [w, setW] = useState<W | null>(null);
  const [vid, setVid] = useState<number | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const load = useCallback(() => api.get<W>(`/research/instruments/${id}`).then((d) => { setW(d); setVid((v) => (v && d.versions.some((x) => x.id === v) ? v : d.versions[0]?.id ?? null)); }).catch(() => {}), [id]);
  useEffect(() => { load(); return onDataChanged(load); }, [load]);
  const v = w?.versions.find((x) => x.id === vid) || null;
  useEffect(() => { if (v) setDraft({ label: v.label, instructions: v.instructions, response_scale: v.response_scale, scoring: v.scoring, interpretation: v.interpretation, change_notes: v.change_notes, structure: v.structure }); }, [v?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const locked = v?.stage === 'final';
  const auto = useAutosave(`instrument-${vid}`, locked ? null : draft, async (x: Draft) => { await api.put(`/research/instrument-versions/${vid}`, x); });
  if (!w) return <div className="page"><div className="skeleton" style={{ height: 300 }} /></div>;
  const i = w.instrument;
  const stageIdx = INSTRUMENT_STAGES.findIndex(([k]) => k === i.stage);
  async function advance(stage: string) {
    await auto.flush();
    const msg = stage === 'final' ? 'Mark this version as the final approved instrument? It will be kept unchanged; later changes start a new revision.' : null;
    if (msg && !window.confirm(msg)) return;
    try { const d = await api.post<W>(`/research/instruments/${i.id}/advance`, { stage }); setW(d); setVid(d.versions[0].id); dataChanged(); } catch (e) { toast((e as Error).message, 'error'); }
  }
  const set = (patch: Partial<Draft>) => draft && setDraft({ ...draft, ...patch });
  const dims = draft?.structure.dimensions || [];
  const setDims = (d: Dim[]) => set({ structure: { dimensions: d } });
  let n = 0;
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="crumb"><span className="bar" /><span className="label"><Link to="/research?tab=instruments">Research Development · Instruments</Link></span></div>
          <h1 className="display">{i.title}</h1>
          <div className="sub">{humanize(i.origin)}{i.source ? ` · ${i.source}` : ''}{w.projects.length ? ` · ${w.projects.map((p) => p.title).join(', ')}` : ''}</div>
        </div>
        <div className="actions">
          <button className="btn" onClick={() => openRecord('research_instruments', i.id)}><Icon name="edit" />Details and permission</button>
          <button className="btn" onClick={() => exportFile(`/research/instruments/${i.id}/export`, { format: 'docx', version_id: vid }, toast)}><Icon name="download" />Word</button>
        </div>
      </div>
      <ol className="res-track" aria-label="Instrument development">
        {INSTRUMENT_STAGES.map(([k, l], idx) => <li key={k} className={idx < stageIdx ? 'done' : idx === stageIdx ? 'on' : ''}>{l}</li>)}
      </ol>
      <div className="row wrap" style={{ marginBottom: 'var(--s-4)' }}>
        <label className="sr-only" htmlFor="ver">Version</label>
        <select id="ver" className="select" style={{ width: 'auto' }} value={vid ?? ''} onChange={async (e) => { await auto.flush(); setVid(Number(e.target.value)); }}>
          {w.versions.map((x) => <option key={x.id} value={x.id}>v{x.version_no} · {x.label || humanize(x.stage)} · {fmtDate(x.created_at.slice(0, 10))}</option>)}
        </select>
        {!locked && <SaveIndicator state={auto.state} savedAt={auto.savedAt} error={auto.error} />}
        <span style={{ flex: 1 }} />
        {i.stage === 'initial' && <button className="btn btn-primary" onClick={() => advance('expert_review')}>Send for expert review</button>}
        {i.stage === 'expert_review' && <button className="btn btn-primary" onClick={() => advance('revision')}>Start revision from reviews</button>}
        {i.stage === 'revision' && <><button className="btn" onClick={() => advance('expert_review')}>Another expert review</button><button className="btn btn-primary" onClick={() => advance('final')}>Mark as final</button></>}
        {i.stage === 'final' && <button className="btn" onClick={() => advance('revision')}>Start a new revision</button>}
      </div>
      {locked && <div className="alert" style={{ marginBottom: 'var(--s-4)' }}>This is the final approved version. It is kept as it is; start a new revision to change it.</div>}
      {draft && v && (
        <div className="res-cols wide-left">
          <section className="panel">
            <header className="panel-head"><span className="code">ITM</span><h2>Dimensions and items</h2></header>
            <div className="panel-body stack">
              <label className="field"><span className="label">Instructions to respondents</span><textarea className="textarea" rows={2} disabled={locked} value={draft.instructions || ''} onChange={(e) => set({ instructions: e.target.value })} /></label>
              {dims.map((d, di) => (
                <fieldset key={di} className="res-dim" disabled={locked}>
                  <div className="row"><input className="input grow" value={d.name} placeholder={`Dimension or subscale ${di + 1}`} aria-label={`Dimension ${di + 1} name`} onChange={(e) => setDims(dims.map((x, j) => (j === di ? { ...x, name: e.target.value } : x)))} />
                    <button type="button" className="icon-btn sm" aria-label={`Remove dimension ${d.name || di + 1}`} onClick={() => setDims(dims.filter((_, j) => j !== di))}><Icon name="trash" /></button></div>
                  <ol className="res-items">{d.items.map((it, ii) => { n += 1; return (
                    <li key={ii} value={n}>
                      <textarea className="textarea" rows={1} value={it.text} placeholder="Item statement or question" aria-label={`Item ${n}`} onChange={(e) => setDims(dims.map((x, j) => (j === di ? { ...x, items: x.items.map((y, k) => (k === ii ? { ...y, text: e.target.value } : y)) } : x)))} />
                      <label className="checkline" style={{ fontSize: 12.5 }}><input type="checkbox" className="check" checked={it.reverse} onChange={(e) => setDims(dims.map((x, j) => (j === di ? { ...x, items: x.items.map((y, k) => (k === ii ? { ...y, reverse: e.target.checked } : y)) } : x)))} />Reverse-scored</label>
                      <button type="button" className="icon-btn sm" aria-label={`Remove item ${n}`} onClick={() => setDims(dims.map((x, j) => (j === di ? { ...x, items: x.items.filter((_, k) => k !== ii) } : x)))}><Icon name="close" /></button>
                    </li>); })}</ol>
                  <button type="button" className="btn btn-sm" onClick={() => setDims(dims.map((x, j) => (j === di ? { ...x, items: [...x.items, { text: '', reverse: false, note: '' }] } : x)))}><Icon name="plus" />Item</button>
                </fieldset>
              ))}
              {!locked && <button className="btn btn-sm" onClick={() => setDims([...dims, { name: '', description: '', items: [{ text: '', reverse: false, note: '' }] }])}><Icon name="plus" />Dimension</button>}
            </div>
          </section>
          <div className="stack">
            <section className="panel">
              <header className="panel-head"><span className="code">SCR</span><h2>Scale and scoring</h2></header>
              <div className="panel-body stack">
                <label className="field"><span className="label">Response scale</span><textarea className="textarea" rows={2} disabled={locked} value={draft.response_scale || ''} placeholder="e.g. 1 Strongly disagree – 4 Strongly agree" onChange={(e) => set({ response_scale: e.target.value })} /></label>
                <label className="field"><span className="label">Scoring instructions</span><textarea className="textarea" rows={3} disabled={locked} value={draft.scoring || ''} onChange={(e) => set({ scoring: e.target.value })} /></label>
                <label className="field"><span className="label">Interpretation notes</span><textarea className="textarea" rows={3} disabled={locked} value={draft.interpretation || ''} onChange={(e) => set({ interpretation: e.target.value })} /></label>
                <label className="field"><span className="label">What changed in this version</span><textarea className="textarea" rows={2} disabled={locked} value={draft.change_notes || ''} onChange={(e) => set({ change_notes: e.target.value })} /></label>
              </div>
            </section>
            <section className="panel">
              <header className="panel-head"><span className="code">VAL</span><h2>Expert reviews</h2><span style={{ flex: 1 }} /><button className="btn btn-sm" onClick={() => openNew('instrument_reviews', { instrument_id: i.id, version_id: vid })}><Icon name="plus" />Review</button></header>
              <div className="panel-body">{w.reviews.length === 0 ? <div className="faint">No reviews recorded. Record each validator's recommendation and comments here; attach their signed form in the Evidence tab.</div> : (
                <ul className="list">{w.reviews.map((r) => (
                  <li key={r.id}><span className={`tag ${r.recommendation === 'accept' ? 'ok' : r.recommendation === 'major_revision' || r.recommendation === 'reject' ? 'orange' : ''}`}>{humanize(r.recommendation) || 'Review'}</span>
                    <button className="rowlink grow" onClick={() => openRecord('instrument_reviews', r.id)}><span className="t">{r.validator}</span><span className="s">{[r.credentials, r.review_date && fmtDate(r.review_date), r.addressed ? 'addressed' : 'not yet addressed'].filter(Boolean).join(' · ')}</span></button></li>
                ))}</ul>)}</div>
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
