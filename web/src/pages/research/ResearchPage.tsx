import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, dataChanged, onDataChanged } from '../../lib/api';
import { fmtDate, humanize, relTime } from '../../lib/format';
import { useApp } from '../../components/AppContext';
import { Icon } from '../../components/Icon';
import { askText } from '../../components/AskText';
import { exportFile, type Overview, type ProjectCard, type Stage } from '../../lib/research';

type Tab = 'overview' | 'projects' | 'literature' | 'instruments' | 'manuscripts' | 'dissemination' | 'stages';
const TABS: [Tab, string][] = [['overview', 'Dashboard'], ['projects', 'Projects'], ['literature', 'Literature review'], ['instruments', 'Instruments'],
  ['manuscripts', 'Manuscripts'], ['dissemination', 'Publications'], ['stages', 'Stages']];

/** Research Development: develop, organise and monitor research with as little administration as possible. */
export function ResearchPage() {
  const [params, setParams] = useSearchParams();
  const tab = (TABS.some(([k]) => k === params.get('tab')) ? params.get('tab') : 'overview') as Tab;
  const archived = params.get('archived') === '1';
  const [o, setO] = useState<Overview | null>(null);
  const load = useCallback(() => { api.get<Overview>(`/research/overview${archived ? '?archived=1' : ''}`).then(setO).catch(() => {}); }, [archived]);
  useEffect(() => { load(); return onDataChanged(load); }, [load]);
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="crumb"><span className="bar" /><span className="label">Academic Operations · Research Development</span></div>
          <h1 className="display">Research Development</h1>
          <div className="sub">Develop research, organise knowledge, advance manuscripts and keep every project's next step in view.</div>
        </div>
        <div className="actions"><QuickIdea /></div>
      </div>
      <div className="tabs" role="tablist">{TABS.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => setParams({ tab: k })}>{l}</button>)}</div>
      {!o ? <div className="skeleton" style={{ height: 240 }} /> : (
        <>
          {tab === 'overview' && <Dashboard o={o} />}
          {tab === 'projects' && <Projects o={o} archived={archived} setArchived={(a) => setParams(a ? { tab: 'projects', archived: '1' } : { tab: 'projects' })} />}
          {tab === 'literature' && <Literature />}
          {tab === 'instruments' && <Instruments />}
          {tab === 'manuscripts' && <Manuscripts o={o} />}
          {tab === 'dissemination' && <Dissemination o={o} />}
          {tab === 'stages' && <Stages />}
        </>
      )}
    </div>
  );
}

/** New project: with a working title, create it and open it; with nothing typed, open the full new-project form. */
function QuickIdea() {
  const { toast, openNew } = useApp();
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) { openNew('research_projects', { stage: 'idea' }); return; }
    setBusy(true);
    try {
      const p = await api.post<{ id: number }>('/records/research_projects', { title: title.trim(), stage: 'idea' });
      setTitle(''); dataChanged();
      toast('Project created', 'ok');
      navigate(`/research/projects/${p.id}`);
    } catch (err) { toast((err as Error).message, 'error'); } finally { setBusy(false); }
  }
  return (
    <form className="row" onSubmit={add} style={{ gap: 6 }}>
      <label className="sr-only" htmlFor="quick-idea">Working title of a new research project</label>
      <input id="quick-idea" className="input" style={{ width: 'min(340px, 60vw)' }} value={title} maxLength={500} onChange={(e) => setTitle(e.target.value)} placeholder="Working title (optional)" />
      <button className="btn btn-primary" disabled={busy}><Icon name="plus" />New project</button>
    </form>
  );
}

function Progress({ p }: { p: ProjectCard['progress'] }) {
  if (!p.total) return <span className="faint" style={{ fontSize: 12.5 }}>No milestones yet</span>;
  return (<><div className="meter"><span style={{ width: `${p.pct}%` }} /></div><span className="faint num" style={{ fontSize: 12.5 }}>{p.done} of {p.total} milestones</span></>);
}

function ProjectCardView({ p }: { p: ProjectCard }) {
  return (
    <Link to={`/research/projects/${p.id}`} className="res-card">
      <span className="res-stage">{p.stage_label}</span>
      <span className="t">{p.title}</span>
      <Progress p={p.progress} />
      {p.next_action && p.next_action.kind !== 'none' && <span className={`res-next ${p.next_action.urgent ? 'urgent' : ''}`}>Next: {p.next_action.text}</span>}
      <span className="faint" style={{ fontSize: 12 }}>{[p.counts.documents && `${p.counts.documents} doc${p.counts.documents > 1 ? 's' : ''}`, p.counts.literature && `${p.counts.literature} source${p.counts.literature > 1 ? 's' : ''}`,
        p.counts.publications && `${p.counts.publications} publication${p.counts.publications > 1 ? 's' : ''}`, `updated ${relTime(p.updated_at)}`].filter(Boolean).join(' · ')}</span>
    </Link>
  );
}

function Dashboard({ o }: { o: Overview }) {
  const { toast } = useApp();
  const navigate = useNavigate();
  const inDev = o.projects.filter((p) => ['idea', 'question'].includes(p.stage));
  const active = o.projects.filter((p) => !['idea', 'question', 'completed', 'discontinued'].includes(p.stage));
  async function develop(id: number) {
    try { const p = await api.post<{ id: number }>(`/research/ideas/${id}/develop`); dataChanged(); navigate(`/research/projects/${p.id}`); } catch (e) { toast((e as Error).message, 'error'); }
  }
  return (
    <div className="stack" style={{ gap: 'var(--s-5)' }}>
      <div className="stat-row">
        <div className="stat"><div className={`v ${active.length ? '' : 'zero'}`}>{active.length}</div><div className="k">Active projects</div></div>
        <div className="stat"><div className={`v ${inDev.length ? '' : 'zero'}`}>{inDev.length}</div><div className="k">In development</div></div>
        <div className="stat"><div className={`v ${o.counts.publications ? '' : 'zero'}`}>{o.counts.publications}</div><div className="k">Publications</div></div>
        <div className="stat"><div className={`v ${o.counts.presentations ? '' : 'zero'}`}>{o.counts.presentations}</div><div className="k">Presentations</div></div>
      </div>
      <div className="res-cols">
        <section className="panel">
          <header className="panel-head"><span className="code">NEXT</span><h2>Suggested next actions</h2></header>
          <div className="panel-body">
            {o.next_actions.length === 0 ? <div className="faint">Nothing pending. Add milestones to a project to see its next step here.</div> : (
              <ul className="list">{o.next_actions.map((a) => (
                <li key={a.project_id}><span className={`tag ${a.urgent ? 'orange' : 'violet'}`}>{a.urgent ? 'Now' : 'Next'}</span>
                  <Link className="rowlink grow" to={`/research/projects/${a.project_id}`}><span className="t">{a.text}</span><span className="s">{a.project}</span></Link></li>
              ))}</ul>
            )}
          </div>
        </section>
        <section className="panel">
          <header className="panel-head"><span className="code">DUE</span><h2>Upcoming research deadlines</h2><span style={{ flex: 1 }} /><Link to="/calendar" className="link" style={{ fontSize: 13 }}>Calendar</Link></header>
          <div className="panel-body">
            {o.deadlines.length === 0 ? <div className="faint">No research deadlines in the next 60 days.</div> : (
              <ul className="list">{o.deadlines.slice(0, 8).map((d) => (
                <li key={`${d.type}-${d.id}`}><span className={`num ${d.overdue ? 'res-overdue' : 'faint'}`} style={{ minWidth: 92, fontSize: 13 }}>{fmtDate(d.date)}</span>
                  <span className="grow">{d.project_id ? <Link className="rowlink" to={`/research/projects/${d.project_id}`}><span className="t">{d.title}</span><span className="s">{d.kind}{d.overdue ? ' · overdue' : ''}</span></Link>
                    : <><span className="t">{d.title}</span><span className="s">{d.kind}</span></>}</span></li>
              ))}</ul>
            )}
          </div>
        </section>
      </div>
      <section>
        <h2 className="res-h">Projects by stage</h2>
        {o.projects.length === 0 ? <div className="empty"><strong>No research projects yet.</strong>Capture an idea above; it becomes a project you can develop step by step.</div> : (
          <div className="res-board">
            {o.stages.filter((s) => o.projects.some((p) => p.stage === s.key)).map((s) => (
              <div key={s.key} className="res-col"><div className="res-col-head"><span>{s.label}</span><span className="num">{o.projects.filter((p) => p.stage === s.key).length}</span></div>
                {o.projects.filter((p) => p.stage === s.key).map((p) => <ProjectCardView key={p.id} p={p} />)}</div>
            ))}
          </div>
        )}
      </section>
      <div className="res-cols">
        <section className="panel">
          <header className="panel-head"><span className="code">IDEA</span><h2>Captured ideas</h2></header>
          <div className="panel-body">
            {o.captured.length === 0 ? <div className="faint">Ideas saved with Quick Capture appear here, ready to develop into projects.</div> : (
              <ul className="list">{o.captured.map((c) => (
                <li key={c.id}><span className="grow"><span className="t">{c.title}</span><span className="s">{c.body ? `${c.body.slice(0, 120)} · ` : ''}captured {relTime(c.created_at)}</span></span>
                  <button className="btn btn-sm" onClick={() => develop(c.id)}><Icon name="plus" />Develop into project</button></li>
              ))}</ul>
            )}
          </div>
        </section>
        <section className="panel">
          <header className="panel-head"><span className="code">LOG</span><h2>Recent research updates</h2></header>
          <div className="panel-body">
            {o.recent.length === 0 ? <div className="faint">No changes yet.</div> : (
              <ul className="list">{o.recent.slice(0, 10).map((r, i) => <li key={i}><span className="grow"><span className="t" style={{ fontWeight: 400 }}>{r.summary}</span><span className="s">{relTime(r.at)}</span></span></li>)}</ul>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function Projects({ o, archived, setArchived }: { o: Overview; archived: boolean; setArchived: (a: boolean) => void }) {
  const [stage, setStage] = useState('');
  const shown = o.projects.filter((p) => !stage || p.stage === stage);
  return (
    <div className="stack">
      <div className="row wrap">
        <select className="select" style={{ width: 'auto' }} value={stage} onChange={(e) => setStage(e.target.value)} aria-label="Stage">
          <option value="">All stages</option>{[...o.stages, { key: 'discontinued', label: 'Discontinued' }].map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
        <div className="seg" role="group" aria-label="Archived projects"><button aria-pressed={!archived} onClick={() => setArchived(false)}>Current</button><button aria-pressed={archived} onClick={() => setArchived(true)}>Archived ({o.counts.archived})</button></div>
      </div>
      {shown.length === 0 ? <div className="empty">{archived ? 'No archived projects. Archiving keeps a project and its records but takes it off the dashboard.' : 'No projects match.'}</div>
        : <div className="res-grid">{shown.map((p) => <ProjectCardView key={p.id} p={p} />)}</div>}
    </div>
  );
}

function Literature() {
  const { openNew, openRecord, toast } = useApp();
  const [q, setQ] = useState('');
  const [theme, setTheme] = useState('');
  const [d, setD] = useState<{ items: any[]; themes: string[] } | null>(null);
  const load = useCallback(() => { api.get<{ items: any[]; themes: string[] }>(`/research/literature?${new URLSearchParams({ ...(q ? { q } : {}), ...(theme ? { theme } : {}) })}`).then(setD).catch(() => {}); }, [q, theme]);
  useEffect(() => { const t = window.setTimeout(load, 200); const off = onDataChanged(load); return () => { window.clearTimeout(t); off(); }; }, [load]);
  return (
    <div className="stack">
      <div className="row wrap">
        <button className="btn btn-primary" onClick={() => openNew('literature', { item_type: 'journal_article' })}><Icon name="plus" />Add reference</button>
        <input className="input" style={{ width: 'min(320px, 100%)' }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search titles, authors, findings, tags" aria-label="Search literature" />
        {d && d.themes.length > 0 && <select className="select" style={{ width: 'auto' }} value={theme} onChange={(e) => setTheme(e.target.value)} aria-label="Theme"><option value="">All themes</option>{d.themes.map((t) => <option key={t}>{t}</option>)}</select>}
        <span style={{ flex: 1 }} />
        <button className="btn btn-sm" onClick={() => exportFile('/research/literature/matrix/export', { format: 'docx' }, toast)}><Icon name="download" />Matrix (Word)</button>
        <button className="btn btn-sm" onClick={() => exportFile('/research/literature/matrix/export', { format: 'xlsx' }, toast)}><Icon name="download" />Matrix (Excel)</button>
        {['apa', 'ris', 'bibtex'].map((f) => <a key={f} className="btn btn-sm" href={`/api/research/literature/citations?format=${f}`} download><Icon name="download" />{f === 'apa' ? 'APA list' : f.toUpperCase()}</a>)}
      </div>
      <p className="faint" style={{ margin: 0, fontSize: 13 }}>The documents themselves stay in Google Drive or your library: open a reference and use its Evidence tab to link the PDF. Adding a reference that is already here (same DOI or title) links the existing one instead of duplicating it.</p>
      {!d ? <div className="skeleton" style={{ height: 160 }} /> : d.items.length === 0 ? <div className="empty">No references yet.</div> : (
        <div className="table-wrap"><table className="table res-matrix">
          <thead><tr><th style={{ width: '26%' }}>Reference</th><th>Objectives</th><th>Methodology</th><th>Major findings</th><th>Limitations</th><th>Relevance</th></tr></thead>
          <tbody>{d.items.map((l) => (
            <tr key={l.id} onClick={() => openRecord('literature', l.id)} style={{ cursor: 'pointer' }}>
              <td><div>{l.apa}</div>{l.theme && <span className="tag" style={{ marginTop: 4 }}>{l.theme}</span>}</td>
              <td>{l.objectives}</td><td>{l.methodology}</td><td>{l.findings}</td><td>{l.limitations}</td><td>{l.relevance}</td></tr>
          ))}</tbody>
        </table></div>
      )}
    </div>
  );
}

function Instruments() {
  const { toast } = useApp();
  const navigate = useNavigate();
  const [rows, setRows] = useState<any[] | null>(null);
  const load = useCallback(() => { api.get<{ items: any[] }>('/records/research_instruments?limit=200').then((d) => setRows(d.items)).catch(() => {}); }, []);
  useEffect(() => { load(); return onDataChanged(load); }, [load]);
  async function add() {
    const title = await askText('Name of the instrument', '', 'For example: Blended Learning Readiness Scale');
    if (!title?.trim()) return;
    try { const w = await api.post<{ instrument: { id: number } }>('/research/instruments', { title: title.trim() }); dataChanged(); navigate(`/research/instruments/${w.instrument.id}`); } catch (e) { toast((e as Error).message, 'error'); }
  }
  return (
    <div className="stack">
      <div className="row wrap"><button className="btn btn-primary" onClick={add}><Icon name="plus" />New instrument</button>
        <span className="faint" style={{ fontSize: 13 }}>Develop and document instruments: initial → expert review → revision → final, every version kept. No statistics are computed here.</span></div>
      {!rows ? <div className="skeleton" style={{ height: 120 }} /> : rows.length === 0 ? <div className="empty">No instruments yet.</div> : (
        <ul className="list">{rows.map((i) => (
          <li key={i.id}><span className={`tag ${i.stage === 'final' ? 'ok' : ''}`}>{humanize(i.stage)}</span>
            <Link className="rowlink grow" to={`/research/instruments/${i.id}`}><span className="t">{i.title}</span><span className="s">{humanize(i.origin)}{i.source ? ` · ${i.source.slice(0, 80)}` : ''}</span></Link></li>
        ))}</ul>
      )}
    </div>
  );
}

function Dissemination({ o }: { o: Overview }) {
  const { openNew, openRecord, toast } = useApp();
  async function record(id: number) {
    try { const r = await api.post<{ type: string }>(`/research/submissions/${id}/record`); dataChanged(); toast(`Recorded in your portfolio (${r.type === 'publications' ? 'Publications' : 'Presentations'}); it is available to your CVs.`, 'ok'); } catch (e) { toast((e as Error).message, 'error'); }
  }
  return (
    <div className="stack">
      <div className="row wrap">
        <button className="btn btn-primary" onClick={() => openNew('research_submissions', { status: 'planned', kind: 'journal' })}><Icon name="plus" />Track a submission</button>
        <Link className="btn" to="/portfolio/research">Publications and presentations in the portfolio ({o.counts.publications + o.counts.presentations})</Link>
        <span style={{ flex: 1 }} />
        <button className="btn btn-sm" onClick={() => exportFile('/research/dissemination/export', { format: 'docx' }, toast)}><Icon name="download" />Publication record (Word)</button>
      </div>
      {o.submissions.length === 0 ? <div className="empty">No submissions tracked yet.</div> : (
        <div className="table-wrap"><table className="table">
          <thead><tr><th>Title</th><th>Journal / conference</th><th>Status</th><th>Submitted</th><th>Revision due</th><th><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>{o.submissions.map((s) => (
            <tr key={s.id}><td><button className="rowlink" onClick={() => openRecord('research_submissions', s.id)}><span className="t">{s.title}</span>{s.project_title && <span className="s">{s.project_title}</span>}</button></td>
              <td>{s.venue || '—'}</td><td><span className={`tag ${['accepted', 'published', 'presented'].includes(s.status) ? 'ok' : s.status === 'revision_required' ? 'orange' : ''}`}>{humanize(s.status)}</span></td>
              <td className="num">{s.submission_date ? fmtDate(s.submission_date) : '—'}</td><td className="num">{s.revision_due ? fmtDate(s.revision_due) : '—'}</td>
              <td style={{ textAlign: 'right' }}>{['accepted', 'published', 'presented'].includes(s.status) && <button className="btn btn-sm" onClick={() => record(s.id)}>{s.publication_id || s.presentation_id ? 'Update portfolio' : 'Record in portfolio'}</button>}</td></tr>
          ))}</tbody>
        </table></div>
      )}
    </div>
  );
}

function Stages() {
  const { toast } = useApp();
  const [s, setS] = useState<{ stages: Stage[]; defaults: Stage[]; customised: boolean } | null>(null);
  const [draft, setDraft] = useState<Stage[]>([]);
  useEffect(() => { api.get<{ stages: Stage[]; defaults: Stage[]; customised: boolean }>('/research/settings').then((d) => { setS(d); setDraft(d.stages); }).catch(() => {}); }, []);
  if (!s) return <div className="skeleton" style={{ height: 160 }} />;
  async function save(list: Stage[] | null) {
    try { const d = await api.put<{ stages: Stage[]; defaults: Stage[]; customised: boolean }>('/research/settings/stages', { stages: list }); setS(d); setDraft(d.stages); dataChanged(); toast('Stages saved', 'ok'); } catch (e) { toast((e as Error).message, 'error'); }
  }
  const move = (i: number, d: number) => { const n = [...draft]; const [x] = n.splice(i, 1); n.splice(i + d, 0, x); setDraft(n); };
  return (
    <section className="panel">
      <header className="panel-head"><span className="code">STG</span><h2>Research stages</h2></header>
      <div className="panel-body stack">
        <p className="muted" style={{ margin: 0, fontSize: 13.5 }}>Projects do not have to pass through every stage, or in this order. Rename, reorder or add stages to fit how you work; a stage used by a project cannot be removed. “Discontinued” is always available.</p>
        <ol className="res-stages">{draft.map((st, i) => (
          <li key={st.key}>
            <input className="input" value={st.label} maxLength={80} onChange={(e) => setDraft(draft.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} aria-label={`Stage ${i + 1} name`} />
            <button className="icon-btn sm" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up"><Icon name="up" /></button>
            <button className="icon-btn sm" onClick={() => move(i, 1)} disabled={i === draft.length - 1} aria-label="Move down"><Icon name="down" /></button>
            <button className="icon-btn sm" onClick={() => setDraft(draft.filter((_, j) => j !== i))} aria-label={`Remove ${st.label}`}><Icon name="trash" /></button>
          </li>
        ))}</ol>
        <div className="row wrap">
          <button className="btn btn-sm" onClick={() => setDraft([...draft, { key: '', label: 'New stage' }])}><Icon name="plus" />Add stage</button>
          <span style={{ flex: 1 }} />
          {s.customised && <button className="btn btn-sm btn-ghost" onClick={() => { if (window.confirm('Go back to the 11 default stages?')) save(null); }}>Use the defaults</button>}
          <button className="btn btn-sm btn-primary" onClick={() => save(draft)}>Save stages</button>
        </div>
      </div>
    </section>
  );
}

/** Manuscript tracker: status, target and revisions of manuscripts written in Word or Google Docs. */
function Manuscripts({ o }: { o: Overview }) {
  const { openNew, openRecord } = useApp();
  return (
    <div className="stack">
      <div className="row wrap"><button className="btn btn-primary" onClick={() => openNew('research_documents', { kind: 'manuscript', status: 'drafting' })}><Icon name="plus" />Track a manuscript</button>
        <span className="faint" style={{ fontSize: 13 }}>Write in Word or Google Docs; link the file in the record's Evidence tab so it opens in one click. SYNCHRONIA tracks it, it does not replace your word processor.</span></div>
      {o.manuscripts.length === 0 ? <div className="empty">No manuscripts tracked.</div> : (
        <ul className="list">{o.manuscripts.map((m) => (
          <li key={m.id}><span className={`tag ${m.status === 'final' ? 'ok' : ''}`}>{humanize(m.status)}</span>
            <button className="rowlink grow" onClick={() => openRecord('research_documents', m.id)}><span className="t">{m.title}</span>
              <span className="s">{[humanize(m.kind), m.project_title, m.target, `updated ${relTime(m.updated_at)}`].filter(Boolean).join(' · ')}</span></button></li>
        ))}</ul>
      )}
    </div>
  );
}
