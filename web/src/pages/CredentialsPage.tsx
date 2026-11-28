// Professional Portfolio › DBM-CHED Credentials: the faculty position reclassification checklist (JC No. 01 s. 2026,
// Annex A). Portfolio records are claimed under their indicators, each claim carries the documents the guidelines
// require (secured / missing / pending / not applicable), planned goals are kept apart from earned points, and a
// tracker workbook can be imported in one step.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, dataChanged, onDataChanged, uploadFile } from '../lib/api';
import { download } from '../lib/download';
import { useApp } from '../components/AppContext';
import { Icon } from '../components/Icon';
import { Overlay } from '../components/Overlay';
import { useSearchParams } from 'react-router-dom';

type DocStatus = 'secured' | 'missing' | 'pending' | 'na' | 'unset';
interface Doc { index: number; label: string; short: string; status: DocStatus }
interface Claim { claim_id: number; type: string; id: number | null; title: string; date: string | null; evidence: number; quantity: number; note: string | null; status: 'claimed' | 'planned'; docs: Doc[]; missing?: boolean }
interface Suggestion { type: string; id: number; title: string; date: string | null; evidence: number; quantity: number; note: string | null }
interface Indicator { code: string; title: string; points: number | null; unit: 'each' | 'hour' | 'year' | 'rating'; evidence: string[]; evidence_short: string[]; claims: Claim[]; suggestions: Suggestion[]; estimated: number }
interface Criterion { code: string; title: string; max: number; bonus: boolean; estimated: number; indicators: Indicator[] }
interface Kra { code: string; title: string; max: number; estimated: number; criteria: Criterion[] }
interface Action { claim_id: number; indicator: string; kra: string; record: string; document: string; status: DocStatus; value: number }
interface Checklist {
  source: string; total: number; projected: number; note: string; kras: Kra[]; actions: Action[];
  counts: { claims: number; planned: number; suggestions: number; docs_total: number; docs_secured: number; docs_missing: number; docs_pending: number; docs_unchecked: number };
}
interface ImportRow { key: string; type: string; label: string; title: string; record: Record<string, unknown>; indicator: string | null; indicator_title: string | null; planned: boolean; docs: Record<string, string>; existing_id: number | null; remark: string | null; why: string | null; keep?: boolean }
interface ImportPlan { sheets: { sheet: string; kind: string; rows: ImportRow[] }[]; skipped: { sheet: string; why: string }[]; total: number }

const DOC_LABEL: Record<Exclude<DocStatus, 'unset'>, string> = { secured: 'Secured', missing: 'Missing', pending: 'Pending', na: 'N/A' };
const UNIT: Record<string, string> = { each: '', hour: ' per hour', year: ' per year', rating: ' × rating ÷ 100' };
const pts = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0$/, ''));
const short = (code: string) => code.replace(/^[IV]+\./, '');

type Tab = 'overview' | 'requirements' | 'documents' | 'goals';
const TABS: [Tab, string][] = [['overview', 'Overview'], ['requirements', 'Requirements by KRA'], ['documents', 'Documents'], ['goals', 'Planned goals']];

export function CredentialsPage() {
  const { toast, openRecord } = useApp();
  const [params, setParams] = useSearchParams();
  const tab = (TABS.some(([k]) => k === params.get('tab')) ? params.get('tab') : 'overview') as Tab;
  const go = (t: Tab) => setParams(t === 'overview' ? {} : { tab: t });
  const [c, setC] = useState<Checklist | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>(() => { try { return JSON.parse(localStorage.getItem('synchronia-jc-open') || '{"I":true}'); } catch { return { I: true }; } });
  const [relevant, setRelevant] = useState(() => { try { return localStorage.getItem('synchronia-jc-all') !== '1'; } catch { return true; } });
  const [docFilter, setDocFilter] = useState<'todo' | 'missing' | 'pending' | 'unset' | 'all'>('todo');
  const [busy, setBusy] = useState('');
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const latest = useRef(0);
  const load = useCallback(() => { const n = ++latest.current; api.get<Checklist>('/portfolio/jc').then((x) => { if (n === latest.current) setC(x); }).catch((e) => toast((e as Error).message, 'error')); }, [toast]);
  useEffect(() => { load(); return onDataChanged(load); }, [load]);
  const toggle = (k: string) => setOpen((o) => { const n = { ...o, [k]: !o[k] }; try { localStorage.setItem('synchronia-jc-open', JSON.stringify(n)); } catch { /* this session only */ } return n; });
  const showAll = (v: boolean) => { setRelevant(!v); try { localStorage.setItem('synchronia-jc-all', v ? '1' : '0'); } catch { /* this session only */ } };

  async function call(fn: () => Promise<unknown>, ok?: string) {
    try { await fn(); if (ok) toast(ok, 'ok'); dataChanged(); } catch (e) { toast((e as Error).message, 'error'); load(); }
  }
  /** Updates one document's status on screen at once, then saves it. */
  function setDoc(cl: Claim, d: Doc, status: DocStatus) {
    setC((x) => x && { ...x, kras: x.kras.map((k) => ({ ...k, criteria: k.criteria.map((cr) => ({ ...cr, indicators: cr.indicators.map((i) => ({ ...i, claims: i.claims.map((q) => (q.claim_id === cl.claim_id ? { ...q, docs: q.docs.map((y) => (y.index === d.index ? { ...y, status } : y)) } : q)) })) })) })) });
    void call(() => api.put(`/portfolio/jc/claims/${cl.claim_id}`, { docs: { [d.index]: status === 'unset' ? null : status } }));
  }
  async function exportAs(format: 'docx' | 'pdf' | 'xlsx') {
    setBusy(format);
    try { const r = await api.post<{ download: string; file_name: string }>('/portfolio/jc/export', { format }); download(r.download, r.file_name); toast(`Exported ${r.file_name}`, 'ok'); }
    catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(''); }
  }
  async function readTracker(f: File) {
    setBusy('import');
    try {
      const p = await uploadFile<ImportPlan>('/portfolio/jc/import/read', f, { ext: /\.xlsx$/i, refuse: 'is not an Excel workbook (.xlsx). Open it in Excel and use Save As → Excel Workbook.', maxMb: 30 });
      setPlan({ ...p, sheets: p.sheets.map((s) => ({ ...s, rows: s.rows.map((r) => ({ ...r, keep: true })) })) });
    } catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(''); if (file.current) file.current.value = ''; }
  }
  async function claimAll() {
    if (!c) return;
    const all = c.kras.flatMap((k) => k.criteria.flatMap((cr) => cr.indicators.flatMap((i) => i.suggestions.map((s) => ({ indicator: i.code, type: s.type, id: s.id, quantity: s.quantity })))));
    if (!all.length) return;
    setBusy('claim');
    let n = 0;
    for (const x of all) { try { await api.post('/portfolio/jc/claims', x); n++; } catch { /* already claimed or no longer there */ } }
    setBusy(''); toast(`Claimed ${n} record${n === 1 ? '' : 's'} — check each one’s documents next`, 'ok'); dataChanged();
  }

  const claims = useMemo(() => (c ? c.kras.flatMap((k) => k.criteria.flatMap((cr) => cr.indicators.flatMap((i) => i.claims.map((cl) => ({ ...cl, ind: i, kra: k.code }))))) : []), [c]);
  const head = (
    <div className="page-head">
      <div>
        <div className="crumb"><span className="bar" /><span className="label">Professional Development · Credentials Tracker</span></div>
        <h1 className="display">Credentials Tracker</h1>
        <div className="sub">Faculty position reclassification — DBM-CHED JC No. 01, s. 2026 (Enhanced IG of JC No. 3, s. 2022), Annex A. Every requirement, the record you claim for it, and each document still to secure.</div>
      </div>
      <div className="actions">
        <input ref={file} type="file" accept=".xlsx" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void readTracker(f); }} />
        <button className="btn" onClick={() => file.current?.click()} disabled={busy === 'import'}><Icon name="upload" />{busy === 'import' ? 'Reading…' : 'Import tracker (Excel)'}</button>
        <button className="btn" onClick={() => exportAs('xlsx')} disabled={!!busy}><Icon name="download" />Excel</button>
        <button className="btn" onClick={() => exportAs('docx')} disabled={!!busy}><Icon name="download" />Word</button>
        <button className="btn" onClick={() => exportAs('pdf')} disabled={!!busy}><Icon name="download" />PDF</button>
      </div>
    </div>
  );
  if (!c) return <div className="page">{head}<div className="skeleton" style={{ height: 320 }} /></div>;
  const docsPct = c.counts.docs_total ? Math.round((c.counts.docs_secured / c.counts.docs_total) * 100) : 0;
  const todo = claims.filter((cl) => cl.status === 'claimed').flatMap((cl) => cl.docs.filter((d) => docFilter === 'all' || (docFilter === 'todo' ? d.status !== 'secured' && d.status !== 'na' : d.status === docFilter)).map((d) => ({ cl, d })));
  const goals = claims.filter((cl) => cl.status === 'planned');
  const relevantInd = (i: Indicator) => !relevant || i.claims.length > 0 || i.suggestions.length > 0;
  return (
    <div className="page jc-page">
      {head}
      <div className="tabs" role="tablist">
        {TABS.map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => go(k)}>
            {l}{k === 'documents' && c.counts.docs_missing + c.counts.docs_pending + c.counts.docs_unchecked > 0 ? ` · ${c.counts.docs_missing + c.counts.docs_pending + c.counts.docs_unchecked}` : ''}{k === 'goals' && goals.length ? ` · ${goals.length}` : ''}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <>
          <div className="jc-summary">
            <div className="jc-total"><span className="label">Estimated points</span><b>{pts(c.total)}</b><span className="faint">of 400 · four KRAs × 100</span>
              {c.projected > 0 && <button className="jc-proj linkish" onClick={() => go('goals')}>+{pts(c.projected)} when planned goals are completed</button>}</div>
            <div className="jc-kras">
              {c.kras.map((k) => (
                <button key={k.code} className="jc-kra-tile" onClick={() => { if (!open[k.code]) toggle(k.code); go('requirements'); window.setTimeout(() => document.getElementById(`kra-${k.code}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60); }}>
                  <span className="code">KRA {k.code}</span><span className="t">{k.title}</span>
                  <span className="meter" aria-hidden><i style={{ width: `${Math.min(100, (k.estimated / k.max) * 100)}%` }} /></span>
                  <span className="n"><b>{pts(k.estimated)}</b> / {k.max}</span>
                </button>
              ))}
            </div>
            <button className="jc-docs" onClick={() => go('documents')}>
              <span className="label">Documents</span>
              <span className="jc-docbar" aria-label={`${c.counts.docs_secured} of ${c.counts.docs_total} documents secured`}>
                {(['secured', 'pending', 'missing', 'unchecked'] as const).map((k) => { const n = c.counts[`docs_${k}` as const]; return n ? <i key={k} className={k} style={{ flexGrow: n }} /> : null; })}
              </span>
              <span className="faint">{c.counts.docs_secured} secured ({docsPct}%) · {c.counts.docs_missing} missing · {c.counts.docs_pending} pending · {c.counts.docs_unchecked} not yet checked</span>
            </button>
          </div>
          {c.counts.suggestions > 0 && (
            <div className="alert info jc-sugg-bar">
              <span><b>{c.counts.suggestions}</b> record{c.counts.suggestions === 1 ? '' : 's'} in your portfolio match a requirement and are not claimed yet.</span>
              <span className="row" style={{ gap: 8 }}>
                <button className="btn btn-sm" onClick={() => { showAll(false); go('requirements'); }}>Review them</button>
                <button className="btn btn-sm btn-primary" onClick={claimAll} disabled={busy === 'claim'}>{busy === 'claim' ? 'Claiming…' : 'Claim all'}</button>
              </span>
            </div>
          )}
          {!claims.length && !c.counts.suggestions && (
            <div className="empty"><strong>Nothing tracked yet.</strong>Import your tracker workbook, or add records to the Professional Portfolio — they appear here, matched to their requirement.</div>
          )}
          {c.actions.length > 0 && (
            <section className="panel jc-actions">
              <header className="panel-head"><span className="code">NXT</span><h2>Documents to secure next</h2><button className="btn btn-sm btn-ghost" style={{ marginLeft: 'auto' }} onClick={() => go('documents')}>All documents</button></header>
              <ul className="list">
                {c.actions.slice(0, 8).map((a, i) => (
                  <li key={`${a.claim_id}-${i}`}>
                    <span className={`jc-dot ${a.status}`} aria-hidden />
                    <span className="t" style={{ flex: 1 }}>{a.document}<span className="s">{a.record} · {a.indicator}</span></span>
                    <span className={`tag ${a.status === 'missing' ? 'red' : ''}`}>{a.status === 'unset' ? 'not checked' : a.status}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <p className="faint" style={{ fontSize: 12.5 }}>{c.note}</p>
        </>
      )}

      {tab === 'requirements' && (
        <>
          <div className="jc-legend" aria-hidden>
            <span><span className="jc-box secured"><Icon name="check" size={10} /></span> Secured</span><span><span className="jc-box" /> Not yet</span>
            <span><span className="jc-box pending">…</span> Pending</span><span><span className="jc-box missing">✕</span> Missing</span><span><span className="jc-box na">—</span> N/A</span>
            <span className="faint">Click a box to tick it · right-click for pending, missing or N/A</span>
          </div>

          <div className="between wrap" style={{ gap: 8, marginBottom: 'var(--s-3)' }}>
            <div className="seg" role="group" aria-label="Which requirements">
              <button aria-pressed={relevant} onClick={() => showAll(false)}>What applies to me</button>
              <button aria-pressed={!relevant} onClick={() => showAll(true)}>All 83 requirements</button>
            </div>
            <span className="row" style={{ gap: 8 }}>
              <button className="btn btn-sm btn-ghost" onClick={() => { const all = Object.fromEntries(c.kras.map((k) => [k.code, true])); setOpen(all); }}>Expand all</button>
              <button className="btn btn-sm btn-ghost" onClick={() => setOpen({})}>Collapse all</button>
            </span>
          </div>
          {c.kras.map((k) => {
            const crits = k.criteria.map((cr) => ({ ...cr, indicators: cr.indicators.filter(relevantInd) })).filter((cr) => cr.indicators.length);
            return (
              <section key={k.code} id={`kra-${k.code}`} className="panel jc-kra">
                <header className="panel-head">
                  <button className="jc-head" aria-expanded={!!open[k.code]} onClick={() => toggle(k.code)}>
                    <span className="code">KRA {k.code}</span><h2>{k.title}</h2>
                    <span className="jc-score"><b>{pts(k.estimated)}</b> / {k.max}</span><Icon name={open[k.code] ? 'up' : 'down'} size={16} />
                  </button>
                </header>
                {open[k.code] && (
                  <div className="panel-body stack">
                    {!crits.length && <div className="faint">Nothing claimed or suggested here yet. Choose “All 83 requirements” to claim something without a portfolio record.</div>}
                    {crits.map((cr) => (
                      <div key={cr.code} className="jc-crit">
                        <h3>Criterion {cr.code.split('.').pop()} — {cr.title}<span className="jc-crit-score"><b>{pts(cr.estimated)}</b> / {cr.max}{cr.bonus ? ' bonus' : ''}</span></h3>
                        <div className="jc-scroll">
                          <table className="jc-grid">
                            <colgroup><col style={{ width: '9%' }} /><col /><col style={{ width: '13%' }} /><col style={{ width: '9%' }} /><col style={{ width: '9%' }} /><col style={{ width: '1%' }} /></colgroup>
                            <thead><tr><th>Code</th><th>Requirement</th><th>Points</th><th>Records</th><th>Estimate</th><th aria-label="Actions" /></tr></thead>
                            {cr.indicators.map((ind) => <IndicatorRows key={ind.code} ind={ind} onCall={call} onDoc={setDoc} openRecord={openRecord} />)}
                          </table>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </>
      )}

      {tab === 'documents' && (
        <section className="panel">
          <div style={{ padding: 'var(--s-3) var(--s-4) 0' }}><div className="jc-legend" aria-hidden>
              <span><span className="jc-box secured"><Icon name="check" size={10} /></span> Secured</span><span><span className="jc-box" /> Not yet</span>
              <span><span className="jc-box pending">…</span> Pending</span><span><span className="jc-box missing">✕</span> Missing</span><span><span className="jc-box na">—</span> N/A</span>
              <span className="faint">Click a box to tick it · right-click for pending, missing or N/A</span>
            </div>
          </div>
          <header className="panel-head"><span className="code">DOC</span><h2>Documents</h2>
            <div className="seg" role="group" aria-label="Show" style={{ marginLeft: 'auto' }}>
              {([['todo', 'To do'], ['missing', 'Missing'], ['pending', 'Pending'], ['unset', 'Not checked'], ['all', 'All']] as const).map(([k, l]) => <button key={k} aria-pressed={docFilter === k} onClick={() => setDocFilter(k)}>{l}</button>)}
            </div>
          </header>
          <div className="panel-body">
            {!todo.length ? <div className="empty"><strong>{docFilter === 'todo' ? 'Every document is secured or not applicable.' : 'Nothing here.'}</strong></div> : (
              <ul className="jc-doclist jc-doctable">
                {todo.map(({ cl, d }) => (
                  <li key={`${cl.claim_id}-${d.index}`}>
                    <DocBox status={d.status} label={`${d.label} — ${cl.title}`} onSet={(st) => setDoc(cl, d, st)} />
                    <span className="lbl">{d.label}<span className="s">{cl.title} · {cl.ind.code}</span></span>
                    <span className={`jc-state ${d.status}`}>{d.status === 'unset' ? 'Not checked' : DOC_LABEL[d.status]}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}

      {tab === 'goals' && (
        <section className="panel">
          <header className="panel-head"><span className="code">GOL</span><h2>Planned goals</h2><span className="faint" style={{ marginLeft: 'auto' }}>+{pts(c.projected)} points when completed</span></header>
          <div className="panel-body">
            {!goals.length ? <div className="empty"><strong>No planned goals.</strong>Mark any claim as planned (a degree in progress, a book being written) to see what it will add.</div> : (
              <ul className="list">
                {goals.map((g) => (
                  <li key={g.claim_id}>
                    <span className="t" style={{ flex: 1 }}>{g.title}<span className="s">{g.ind.code} — {g.ind.title}{g.note ? ` · ${g.note}` : ''}</span></span>
                    <span className="tag">+{pts(g.ind.points == null ? 0 : g.ind.unit === 'rating' ? (g.ind.points * g.quantity) / 100 : g.ind.points * g.quantity)} pts</span>
                    <button className="btn btn-sm" onClick={() => call(() => api.put(`/portfolio/jc/claims/${g.claim_id}`, { status: 'claimed' }), 'Marked as earned')}>Mark earned</button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}
      <p className="faint" style={{ fontSize: 12 }}>Source: {c.source}.</p>
      {plan && <ImportDialog plan={plan} setPlan={setPlan} onDone={() => { setPlan(null); dataChanged(); }} />}
    </div>
  );
}

/**
 * A document checkbox. Click: secured ⇄ not yet. Right-click (or the keys P, N, M, Delete while focused): pending,
 * not applicable, missing, or clear.
 */
function DocBox({ status, label, onSet }: { status: DocStatus; label: string; onSet: (s: DocStatus) => void }) {
  const [menu, setMenu] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!menu) return undefined;
    const close = (e: Event) => { if (!ref.current?.contains(e.target as Node)) setMenu(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenu(false); };
    document.addEventListener('pointerdown', close); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', esc); };
  }, [menu]);
  const name = status === 'unset' ? 'not checked' : DOC_LABEL[status].toLowerCase();
  return (
    <span className="jc-boxwrap" ref={ref}>
      <button type="button" role="checkbox" aria-checked={status === 'secured' ? true : status === 'pending' ? 'mixed' : false}
        className={`jc-box ${status}`} aria-label={`${label}: ${name}`} title={`${label}\n${name} — click to ${status === 'secured' ? 'clear' : 'mark secured'}; right-click for pending, missing or N/A`}
        onClick={() => onSet(status === 'secured' ? 'unset' : 'secured')}
        onContextMenu={(e) => { e.preventDefault(); setMenu(true); }}
        onKeyDown={(e) => {
          const k = e.key.toLowerCase();
          const map: Record<string, DocStatus> = { p: 'pending', n: 'na', m: 'missing', s: 'secured', delete: 'unset', backspace: 'unset' };
          if (map[k]) { e.preventDefault(); onSet(map[k]); }
          else if (k === 'contextmenu' || (e.shiftKey && k === 'f10')) { e.preventDefault(); setMenu(true); }
        }}>
        {status === 'secured' ? <Icon name="check" size={14} /> : status === 'na' ? '—' : status === 'pending' ? '…' : status === 'missing' ? '✕' : ''}
      </button>
      {menu && (
        <span className="jc-boxmenu" role="menu">
          {([['secured', 'Secured'], ['pending', 'Pending'], ['missing', 'Missing'], ['na', 'Not applicable'], ['unset', 'Clear']] as [DocStatus, string][]).map(([k, l]) => (
            <button key={k} role="menuitemradio" aria-checked={status === k} onClick={() => { onSet(k); setMenu(false); }}>{l}</button>
          ))}
        </span>
      )}
    </span>
  );
}

function IndicatorRows({ ind, onCall, onDoc, openRecord }: { ind: Indicator; onCall: (fn: () => Promise<unknown>, ok?: string) => Promise<void>; onDoc: (c: Claim, d: Doc, s: DocStatus) => void; openRecord: (type: string, id: number) => void }) {
  const [showDocs, setShowDocs] = useState(false);
  const [adding, setAdding] = useState(false);
  const [note, setNote] = useState(''); const [qty, setQty] = useState(''); const [planned, setPlanned] = useState(false);
  const has = ind.claims.length > 0;
  const qtyLabel = ind.unit === 'hour' ? 'Hours' : ind.unit === 'year' ? 'Years' : ind.unit === 'rating' ? 'Rating' : 'Count';
  const detail = has || ind.suggestions.length > 0 || adding || showDocs;
  return (
    <tbody className={`jc-ind ${has ? 'has' : ''}`}>
      <tr className="jc-row">
        <td className="jc-code">{short(ind.code)}</td>
        <td className="jc-title">{ind.title}
          <button className="jc-reqlink" aria-expanded={showDocs} onClick={() => setShowDocs((v) => !v)}>{showDocs ? 'Hide' : 'Required'} documents ({ind.evidence.length})</button>
        </td>
        <td className="jc-pts">{ind.points == null ? 'see guidelines' : `${ind.points}${UNIT[ind.unit]}`}</td>
        <td className="num">{ind.claims.length || ''}{ind.suggestions.length ? <span className="jc-sugg-n" title="Suggested from your portfolio"> +{ind.suggestions.length}</span> : ''}</td>
        <td className="num">{ind.estimated ? <b>{pts(ind.estimated)}</b> : ''}</td>
        <td><button className="btn btn-sm" onClick={() => setAdding((v) => !v)} aria-expanded={adding}><Icon name="plus" />Claim</button></td>
      </tr>
      {detail && (
        <tr className="jc-detail"><td colSpan={6}>
          {showDocs && <ol className="jc-req">{ind.evidence.map((e) => <li key={e}>{e}</li>)}</ol>}
          {has && (
            <div className="jc-scroll">
              <table className="jc-matrix">
                <thead>
                  <tr>
                    <th className="rec">Record</th>
                    {ind.unit !== 'each' && <th className="q">{qtyLabel}</th>}
                    {ind.evidence_short.map((h, i) => <th key={i} className="doc" title={ind.evidence[i]}>{h}</th>)}
                    <th className="q">Pts</th><th aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {ind.claims.map((cl) => {
                    const done = cl.docs.filter((d) => d.status === 'secured' || d.status === 'na').length;
                    return (
                      <tr key={cl.claim_id} className={cl.status}>
                        <td className="rec">
                          {cl.id && !cl.missing ? <button className="jc-reclink" onClick={() => openRecord(cl.type, cl.id as number)}>{cl.title}</button> : <span>{cl.title}</span>}
                          <span className="meta">{[cl.date, cl.status === 'planned' ? 'planned goal' : null, cl.missing ? 'record deleted' : null, cl.evidence ? `${cl.evidence} file${cl.evidence === 1 ? '' : 's'}` : null, `${done}/${cl.docs.length} documents`].filter(Boolean).join(' · ')}</span>
                          {cl.note && <span className="meta note">{cl.note}</span>}
                        </td>
                        {ind.unit !== 'each' && (
                          <td className="q"><input className="input select-sm" inputMode="decimal" defaultValue={cl.quantity} aria-label={`${qtyLabel} for ${cl.title}`}
                            onBlur={(e) => { const v = Number(e.target.value); if (v && v !== cl.quantity) void onCall(() => api.put(`/portfolio/jc/claims/${cl.claim_id}`, { quantity: v })); }} /></td>
                        )}
                        {cl.docs.map((d) => <td key={d.index} className="doc"><DocBox status={d.status} label={`${d.label} — ${cl.title}`} onSet={(st) => onDoc(cl, d, st)} /></td>)}
                        <td className="q">{cl.status === 'planned' ? <span className="faint">+{pts(ind.points == null ? 0 : ind.unit === 'rating' ? (ind.points * cl.quantity) / 100 : ind.points * cl.quantity)}</span> : pts(ind.points == null ? 0 : ind.unit === 'rating' ? (ind.points * cl.quantity) / 100 : ind.points * cl.quantity)}</td>
                        <td className="act">
                          <button className="btn btn-sm btn-ghost" onClick={() => onCall(() => api.put(`/portfolio/jc/claims/${cl.claim_id}`, { status: cl.status === 'planned' ? 'claimed' : 'planned' }), cl.status === 'planned' ? 'Marked as earned' : 'Moved to planned goals')}>{cl.status === 'planned' ? 'Earned' : 'Planned'}</button>
                          <button className="icon-btn sm" aria-label={`Remove the claim “${cl.title}”`} onClick={() => onCall(() => api.del(`/portfolio/jc/claims/${cl.claim_id}`), 'Claim removed')}><Icon name="close" /></button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {ind.suggestions.length > 0 && (
            <div className="jc-sugg">
              <span className="faint">From your portfolio:</span>
              {ind.suggestions.map((sg) => (
                <button key={`${sg.type}-${sg.id}`} className="chip" onClick={() => onCall(() => api.post('/portfolio/jc/claims', { indicator: ind.code, type: sg.type, id: sg.id, quantity: sg.quantity }), `Claimed “${sg.title}”`)} title={sg.note || undefined}>
                  <Icon name="plus" />{sg.title}{sg.date ? ` · ${sg.date.slice(0, 4)}` : ''}
                </button>
              ))}
              {ind.suggestions.length > 1 && <button className="btn btn-sm" onClick={async () => { for (const sg of ind.suggestions) await api.post('/portfolio/jc/claims', { indicator: ind.code, type: sg.type, id: sg.id, quantity: sg.quantity }).catch(() => {}); await onCall(async () => {}, `Claimed ${ind.suggestions.length} records`); }}>Claim all {ind.suggestions.length}</button>}
            </div>
          )}
          {adding && (
            <form className="jc-add" onSubmit={(e) => { e.preventDefault(); void onCall(() => api.post('/portfolio/jc/claims', { indicator: ind.code, type: 'note', note, quantity: qty || 1, status: planned ? 'planned' : 'claimed' }), 'Claim added').then(() => { setAdding(false); setNote(''); setQty(''); setPlanned(false); }); }}>
              <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder={ind.unit === 'rating' ? 'e.g. SET ratings AY 2023–2026 (average)' : 'What you are claiming (without a portfolio record)'} aria-label="What you are claiming" maxLength={500} required autoFocus />
              {ind.unit !== 'each' && <input className="input select-sm" style={{ width: 120 }} inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value.replace(/[^\d.]/g, ''))} placeholder={qtyLabel} aria-label={qtyLabel} />}
              <label className="checkline"><input type="checkbox" className="check" checked={planned} onChange={(e) => setPlanned(e.target.checked)} />Planned goal</label>
              <button className="btn btn-primary btn-sm" disabled={!note.trim()}>Add claim</button>
              <span className="faint" style={{ fontSize: 12.5 }}>To claim a portfolio record, add it to the Professional Portfolio — it then appears under “From your portfolio”.</span>
            </form>
          )}
        </td></tr>
      )}
    </tbody>
  );
}

function ImportDialog({ plan, setPlan, onDone }: { plan: ImportPlan; setPlan: (p: ImportPlan | null) => void; onDone: () => void }) {
  const { toast } = useApp();
  const [saving, setSaving] = useState(false);
  const rows = useMemo(() => plan.sheets.flatMap((s) => s.rows), [plan]);
  const chosen = rows.filter((r) => r.keep);
  const set = (key: string, keep: boolean) => setPlan({ ...plan, sheets: plan.sheets.map((s) => ({ ...s, rows: s.rows.map((r) => (r.key === key ? { ...r, keep } : r)) })) });
  async function commit() {
    setSaving(true);
    try {
      const r = await api.post<{ created: number; reused: number; claimed: number; problems: { title?: string; error: string }[] }>('/portfolio/jc/import', { rows: chosen });
      toast(`Imported: ${r.created} new record${r.created === 1 ? '' : 's'}, ${r.reused} already in your portfolio, ${r.claimed} claim${r.claimed === 1 ? '' : 's'}${r.problems.length ? ` — ${r.problems.length} not imported (${r.problems[0].title || ''}: ${r.problems[0].error})` : ''}`, r.problems.length ? 'error' : 'ok');
      onDone();
    } catch (e) { toast((e as Error).message, 'error'); } finally { setSaving(false); }
  }
  return (
    <Overlay onClose={() => setPlan(null)} label="Import credentials tracker">
      <div className="modal modal-wide jc-import">
        <header className="modal-head"><h2>Import credentials tracker</h2><button className="icon-btn" aria-label="Close" onClick={() => setPlan(null)}><Icon name="close" /></button></header>
        <div className="modal-body stack">
          <p className="muted" style={{ margin: 0 }}>Each row becomes a portfolio record (or reuses one with the same title), claimed under its DBM-CHED indicator with the document statuses from your sheet. Future and aspirational rows become planned goals. Untick anything you do not want.</p>
          {plan.sheets.filter((s) => s.rows.length).map((s) => (
            <div key={s.sheet}>
              <h3 className="jc-sheet">{s.sheet} <span className="faint">· {s.rows.length}</span></h3>
              <ul className="jc-imp-list">
                {s.rows.map((r) => (
                  <li key={r.key}>
                    <label className="checkline"><input type="checkbox" className="check" checked={!!r.keep} onChange={(e) => set(r.key, e.target.checked)} />
                      <span><b>{r.title}</b><span className="faint"> · {r.label}{r.existing_id ? ' (already in portfolio)' : ''}</span><br />
                        <span className="faint" style={{ fontSize: 12.5 }}>{r.indicator ? `${r.indicator} — ${r.indicator_title}` : r.why || 'Kept as a record; no indicator applies'}{r.planned ? ' · planned goal' : ''}{Object.keys(r.docs).length ? ` · ${Object.values(r.docs).filter((d) => d === 'secured').length} document(s) secured` : ''}</span></span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {plan.skipped.length > 0 && <p className="faint" style={{ fontSize: 12.5, margin: 0 }}>Not imported: {plan.skipped.map((s) => `${s.sheet} (${s.why})`).join('; ')}.</p>}
        </div>
        <footer className="modal-foot">
          <span className="faint">{chosen.length} of {rows.length} selected</span>
          <span className="row" style={{ gap: 8 }}>
            <button className="btn" onClick={() => setPlan(null)}>Cancel</button>
            <button className="btn btn-primary" data-autofocus disabled={!chosen.length || saving} onClick={commit}>{saving ? 'Importing…' : `Import ${chosen.length}`}</button>
          </span>
        </footer>
      </div>
    </Overlay>
  );
}
