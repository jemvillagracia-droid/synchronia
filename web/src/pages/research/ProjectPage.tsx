import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api, dataChanged, onDataChanged } from '../../lib/api';
import { openReference } from '../../lib/desktop';
import { fmtDate, humanize, relTime } from '../../lib/format';
import { useApp } from '../../components/AppContext';
import { Icon } from '../../components/Icon';
import { openBoard } from '../../lib/moodboard';
import { exportFile, type NextAction, type Progress, type Stage } from '../../lib/research';
import { askText } from '../../components/AskText';

interface Workspace {
  project: any; stage_label: string; stages: Stage[]; milestones: any[]; progress: Progress; next_action: NextAction | null;
  suggestions: { key: string; title: string; due_date: string | null; reason: string }[];
  documents: any[]; literature: any[]; instruments: any[]; ethics: any[]; submissions: any[]; tasks: any[]; funding: any[]; collaborators: any[];
  publications: any[]; presentations: any[]; recent: { summary: string; at: string }[]; milestone_templates: string[];
}
type Tab = 'overview' | 'literature' | 'methods' | 'ethics' | 'dissemination' | 'team';
const TABS: [Tab, string][] = [['overview', 'Overview'], ['literature', 'Literature'], ['methods', 'Methods and instruments'], ['ethics', 'Ethics'], ['dissemination', 'Manuscripts and publications'], ['team', 'Funding and team']];

/** One research project: its stage, milestones and next action, and everything linked to it. */
export function ProjectPage() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const tab = (TABS.some(([k]) => k === params.get('tab')) ? params.get('tab') : 'overview') as Tab;
  const { openRecord, toast } = useApp();
  const navigate = useNavigate();
  const [w, setW] = useState<Workspace | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(() => { api.get<Workspace>(`/research/projects/${id}`).then((d) => { setW(d); setError(''); }).catch((e) => setError(e.message)); }, [id]);
  useEffect(() => { load(); return onDataChanged(load); }, [load]);
  if (error) return <div className="page"><div className="alert">{error}</div><Link to="/research" className="btn mt-4">Back</Link></div>;
  if (!w) return <div className="page"><div className="skeleton" style={{ height: 300 }} /></div>;
  const p = w.project;
  const patch = async (values: Record<string, unknown>, msg?: string) => {
    try { await api.patch(`/records/research_projects/${p.id}`, values); dataChanged(); if (msg) toast(msg, 'ok'); } catch (e) { toast((e as Error).message, 'error'); }
  };
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="crumb"><span className="bar" /><span className="label"><Link to="/research">Research Development</Link> · Project</span></div>
          <h1 className="display" style={{ fontSize: 'clamp(26px, 3vw, 40px)' }}>{p.title}</h1>
          <div className="sub">{[p.role, p.research_area, p.archived_at && 'Archived'].filter(Boolean).join(' · ') || 'Research project'}</div>
        </div>
        <div className="actions">
          <label className="sr-only" htmlFor="stage">Stage</label>
          <select id="stage" className="select" style={{ width: 'auto' }} value={p.stage || ''} onChange={(e) => patch({ stage: e.target.value }, 'Stage updated')}>
            {[...w.stages, { key: 'discontinued', label: 'Discontinued' }].map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
          <button className="btn" onClick={() => openRecord('research_projects', p.id)}><Icon name="edit" />Details</button>
          <button className="btn" onClick={() => openBoard(navigate, 'research_projects', p.id).catch((e) => toast(e.message, 'error'))}><Icon name="panel" />Moodboard</button>
          <button className="btn" onClick={() => exportFile(`/research/projects/${p.id}/report`, { format: 'docx' }, toast)}><Icon name="download" />Progress report</button>
          <button className="btn btn-ghost" onClick={() => patch({ archived_at: p.archived_at ? null : new Date().toISOString() }, p.archived_at ? 'Back on the dashboard' : 'Archived. Nothing was deleted; find it under Projects › Archived.')}>{p.archived_at ? 'Unarchive' : 'Archive'}</button>
        </div>
      </div>
      <div className="tabs" role="tablist">{TABS.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => setParams({ tab: k })}>{l}</button>)}</div>
      {tab === 'overview' && <Overview w={w} />}
      {tab === 'literature' && <Literature w={w} />}
      {tab === 'methods' && <Methods w={w} />}
      {tab === 'ethics' && <Ethics w={w} />}
      {tab === 'dissemination' && <Dissemination w={w} />}
      {tab === 'team' && <Team w={w} />}
    </div>
  );
}

function Overview({ w }: { w: Workspace }) {
  const { openNew, openRecord, toast } = useApp();
  const p = w.project;
  const [tpl, setTpl] = useState(p.stage && w.milestone_templates.includes(p.stage) ? p.stage : 'proposal');
  // Ticking a milestone shows at once; the saved state follows (and is rolled back if saving fails).
  const [pending, setPending] = useState<Record<number, string>>({});
  useEffect(() => { setPending({}); }, [w]);
  const statusOf = (m: any) => pending[m.id] ?? m.status;
  const setMs = async (m: any, status: string) => {
    setPending((x) => ({ ...x, [m.id]: status }));
    try { await api.patch(`/records/research_milestones/${m.id}`, { status, completed_on: status === 'done' ? new Date().toISOString().slice(0, 10) : null }); dataChanged(); }
    catch (e) { setPending((x) => { const { [m.id]: _drop, ...rest } = x; return rest; }); toast((e as Error).message, 'error'); }
  };
  const accept = async (s: Workspace['suggestions'][number]) => {
    try { await api.post('/records/tasks', { title: s.title, due_date: s.due_date, module: 'research', status: 'open', priority: 'normal', linked_entity_type: 'research_projects', linked_entity_id: p.id }); dataChanged(); toast('Task added', 'ok'); } catch (e) { toast((e as Error).message, 'error'); }
  };
  const dismiss = async (key: string) => { await api.post('/research/suggestions/dismiss', { key }).catch(() => {}); dataChanged(); };
  const addTemplate = async () => {
    try { const r = await api.post<any[]>(`/research/projects/${p.id}/milestones/template`, { stages: [tpl] }); dataChanged(); toast(r.length ? `${r.length} milestone${r.length > 1 ? 's' : ''} added` : 'Those milestones are already here', 'ok'); } catch (e) { toast((e as Error).message, 'error'); }
  };
  const open = w.tasks.filter((t) => ['open', 'in_progress'].includes(t.status));
  return (
    <div className="stack" style={{ gap: 'var(--s-5)' }}>
      <div className="res-cols">
        <section className="panel">
          <header className="panel-head"><span className="code">STAT</span><h2>{w.stage_label}</h2></header>
          <div className="panel-body stack">
            {w.progress.total ? (<><div className="meter"><span style={{ width: `${w.progress.pct}%` }} /></div><div className="faint">{w.progress.done} of {w.progress.total} milestones completed (skipped ones are not counted)</div></>)
              : <div className="faint">Progress is counted from milestones. Add some below.</div>}
            {w.next_action && <div className={`res-next big ${w.next_action.urgent ? 'urgent' : ''}`}><span className="label">Next recommended action</span>{w.next_action.text}</div>}
          </div>
        </section>
        <section className="panel">
          <header className="panel-head"><span className="code">SUG</span><h2>Suggested tasks</h2></header>
          <div className="panel-body">
            {w.suggestions.length === 0 ? <div className="faint">No suggestions. They appear for milestones, revisions and sections that have no task yet.</div> : (
              <ul className="list">{w.suggestions.map((s) => (
                <li key={s.key}><span className="grow"><span className="t">{s.title}</span><span className="s">{s.reason}{s.due_date ? ` · due ${fmtDate(s.due_date)}` : ''}</span></span>
                  <button className="btn btn-sm btn-primary" onClick={() => accept(s)}>Add task</button>
                  <button className="btn btn-sm" onClick={() => openNew('tasks', { title: s.title, due_date: s.due_date, module: 'research', linked_entity_type: 'research_projects', linked_entity_id: p.id })}>Edit first</button>
                  <button className="btn btn-sm btn-ghost" onClick={() => dismiss(s.key)} aria-label={`Dismiss: ${s.title}`}>Dismiss</button></li>
              ))}</ul>
            )}
          </div>
        </section>
      </div>
      <ProjectDocuments projectId={p.id} />
      <section className="panel">
        <header className="panel-head"><span className="code">MS</span><h2>Milestones</h2><span style={{ flex: 1 }} />
          <select className="select select-sm" value={tpl} onChange={(e) => setTpl(e.target.value)} aria-label="Stage to add usual milestones for">
            {w.stages.filter((s) => w.milestone_templates.includes(s.key)).map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</select>
          <button className="btn btn-sm" onClick={addTemplate}>Add usual milestones</button>
          <button className="btn btn-sm btn-primary" onClick={() => openNew('research_milestones', { project_id: p.id, status: 'pending' })}><Icon name="plus" />Milestone</button></header>
        <div className="panel-body">
          {w.milestones.length === 0 ? <div className="faint">No milestones yet.</div> : (
            <ul className="list">{w.milestones.map((m) => (
              <li key={m.id} className={statusOf(m) !== 'pending' ? 'res-done' : ''}>
                <input type="checkbox" className="check" checked={statusOf(m) === 'done'} onChange={(e) => setMs(m, e.target.checked ? 'done' : 'pending')} aria-label={`Done: ${m.title}`} />
                <button className="rowlink grow" onClick={() => openRecord('research_milestones', m.id)}><span className="t">{m.title}</span>
                  <span className="s">{m.status === 'done' ? `Done${m.completed_on ? ` ${fmtDate(m.completed_on)}` : ''}` : m.status === 'skipped' ? 'Skipped' : m.due_date ? `Due ${fmtDate(m.due_date)}${m.due_date < new Date().toISOString().slice(0, 10) ? ' · overdue' : ''}` : 'No due date'}</span></button>
                {statusOf(m) === 'pending' && <button className="btn btn-sm btn-ghost" onClick={() => setMs(m, 'skipped')}>Skip</button>}
              </li>
            ))}</ul>
          )}
        </div>
      </section>
      <div className="res-cols">
        <section className="panel">
          <header className="panel-head"><span className="code">TSK</span><h2>Tasks</h2><span style={{ flex: 1 }} /><button className="btn btn-sm" onClick={() => openNew('tasks', { module: 'research', linked_entity_type: 'research_projects', linked_entity_id: p.id })}><Icon name="plus" />Task</button></header>
          <div className="panel-body">{open.length === 0 ? <div className="faint">No open tasks.</div> : <ul className="list">{open.map((t) => <li key={t.id}><button className="rowlink grow" onClick={() => openRecord('tasks', t.id)}><span className="t">{t.title}</span><span className="s">{t.due_date ? `Due ${fmtDate(t.due_date)}` : 'No due date'}</span></button></li>)}</ul>}</div>
        </section>
        <section className="panel">
          <header className="panel-head"><span className="code">LOG</span><h2>Recent activity</h2></header>
          <div className="panel-body">{w.recent.length === 0 ? <div className="faint">No activity yet.</div> : <ul className="list">{w.recent.map((r, i) => <li key={i}><span className="grow"><span className="t" style={{ fontWeight: 400 }}>{r.summary}</span><span className="s">{relTime(r.at)}</span></span></li>)}</ul>}</div>
        </section>
      </div>
    </div>
  );
}

function Literature({ w }: { w: Workspace }) {
  const { openRecord, toast } = useApp();
  const p = w.project;
  const [q, setQ] = useState('');
  const [found, setFound] = useState<any[]>([]);
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState({ title: '', authors: '', year: '', source: '', doi: '' });
  useEffect(() => {
    if (q.trim().length < 2) { setFound([]); return; }
    const t = window.setTimeout(() => api.get<{ items: any[] }>(`/research/literature?q=${encodeURIComponent(q)}`).then((d) => setFound(d.items.filter((x) => !w.literature.some((l) => l.id === x.id)))).catch(() => {}), 200);
    return () => window.clearTimeout(t);
  }, [q, w.literature]);
  const link = async (lit: number, on = true) => { try { await (on ? api.post(`/research/projects/${p.id}/literature/${lit}`) : api.del(`/research/projects/${p.id}/literature/${lit}`)); dataChanged(); } catch (e) { toast((e as Error).message, 'error'); } };
  async function add(e: React.FormEvent) {
    e.preventDefault();
    try {
      const r = await api.post<{ literature: { id: number }; duplicate: boolean }>('/research/literature', { ...f, project_id: p.id, item_type: 'journal_article' });
      setF({ title: '', authors: '', year: '', source: '', doi: '' }); setAdding(false); dataChanged();
      toast(r.duplicate ? 'That reference was already in your literature; it is now linked to this project.' : 'Reference added. Open it to record its findings and relevance.', 'ok', [{ label: 'Open', run: () => openRecord('literature', r.literature.id) }]);
    } catch (err) { toast((err as Error).message, 'error'); }
  }
  return (
    <div className="stack">
      <div className="row wrap">
        <button className="btn btn-primary" onClick={() => setAdding((a) => !a)} aria-expanded={adding}><Icon name="plus" />Quick add reference</button>
        <input className="input" style={{ width: 'min(320px, 100%)' }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Link a reference you already have…" aria-label="Find a reference to link" />
        <span style={{ flex: 1 }} />
        <button className="btn btn-sm" onClick={() => exportFile('/research/literature/matrix/export', { project_id: p.id, format: 'docx' }, toast)}><Icon name="download" />Matrix</button>
        <a className="btn btn-sm" href={`/api/research/literature/citations?project_id=${p.id}&format=apa`} download><Icon name="download" />APA list</a>
      </div>
      {adding && (
        <form className="panel" onSubmit={add}><div className="panel-body form-grid">
          <label className="field span-2"><span className="label">Title</span><input className="input" required value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></label>
          <label className="field"><span className="label">Authors (Family, Given; …)</span><input className="input" value={f.authors} onChange={(e) => setF({ ...f, authors: e.target.value })} /></label>
          <label className="field"><span className="label">Year</span><input className="input" value={f.year} maxLength={20} onChange={(e) => setF({ ...f, year: e.target.value })} /></label>
          <label className="field"><span className="label">Journal or source</span><input className="input" value={f.source} onChange={(e) => setF({ ...f, source: e.target.value })} /></label>
          <label className="field"><span className="label">DOI</span><input className="input" value={f.doi} onChange={(e) => setF({ ...f, doi: e.target.value })} /></label>
          <div className="span-2 row"><button className="btn btn-primary">Add</button><span className="faint" style={{ fontSize: 12.5 }}>Details such as findings and relevance can be added later.</span></div>
        </div></form>
      )}
      {found.length > 0 && <ul className="list">{found.slice(0, 8).map((l) => <li key={l.id}><span className="grow"><span className="t">{l.apa}</span></span><button className="btn btn-sm" onClick={() => { link(l.id); setQ(''); }}>Link</button></li>)}</ul>}
      {w.literature.length === 0 ? <div className="empty">No literature linked yet.</div> : (
        <ul className="list">{w.literature.map((l) => (
          <li key={l.id}><button className="rowlink grow" onClick={() => openRecord('literature', l.id)}><span className="t">{l.title}</span><span className="s">{[l.authors, l.year, l.source, l.theme].filter(Boolean).join(' · ')}{l.relevance ? ` — ${l.relevance.slice(0, 120)}` : ''}</span></button>
            <button className="btn btn-sm btn-ghost" onClick={() => link(l.id, false)}>Unlink</button></li>
        ))}</ul>
      )}
    </div>
  );
}

function Methods({ w }: { w: Workspace }) {
  const { openRecord, toast } = useApp();
  const navigate = useNavigate();
  const p = w.project;
  async function newInstrument() {
    const title = await askText('Name of the instrument');
    if (!title?.trim()) return;
    try { const r = await api.post<{ instrument: { id: number } }>('/research/instruments', { title: title.trim(), project_id: p.id }); dataChanged(); navigate(`/research/instruments/${r.instrument.id}`); } catch (e) { toast((e as Error).message, 'error'); }
  }
  return (
    <div className="stack" style={{ gap: 'var(--s-5)' }}>
      <section className="panel">
        <header className="panel-head"><span className="code">MTH</span><h2>Methodology</h2><span style={{ flex: 1 }} />
          <button className="btn btn-sm" onClick={() => openRecord('research_projects', p.id)}><Icon name="edit" />Project details</button></header>
        <div className="panel-body">
          <dl className="dl">
            <dt>Design and approach</dt><dd>{p.methodology || '—'}</dd><dt>Population</dt><dd>{p.population || '—'}</dd><dt>Variables or concepts</dt><dd>{p.variables || '—'}</dd>
            <dt>Sample</dt><dd>{p.target_sample != null ? `${p.collected_sample ?? 0} of ${p.target_sample} collected` : '—'}</dd>
          </dl>
          <p className="faint" style={{ fontSize: 12.5, margin: 'var(--s-2) 0 0' }}>Record the design, setting, sampling and procedures in the project details. SYNCHRONIA documents methodology; it does not compute statistics.</p>
        </div>
      </section>
      <section className="panel">
        <header className="panel-head"><span className="code">INS</span><h2>Instruments</h2><span style={{ flex: 1 }} /><button className="btn btn-sm btn-primary" onClick={newInstrument}><Icon name="plus" />Instrument</button></header>
        <div className="panel-body">{w.instruments.length === 0 ? <div className="faint">No instruments linked.</div> : (
          <ul className="list">{w.instruments.map((i) => (
            <li key={i.id}><span className={`tag ${i.stage === 'final' ? 'ok' : ''}`}>{humanize(i.stage)}</span>
              <Link className="rowlink grow" to={`/research/instruments/${i.id}`}><span className="t">{i.title}</span><span className="s">{humanize(i.origin)} · {i.versions} version{i.versions === 1 ? '' : 's'} · {i.reviews} expert review{i.reviews === 1 ? '' : 's'}</span></Link></li>
          ))}</ul>)}</div>
      </section>
    </div>
  );
}

function Ethics({ w }: { w: Workspace }) {
  const { openNew, openRecord, toast } = useApp();
  return (
    <div className="stack">
      <div className="row wrap">
        <button className="btn btn-primary" onClick={() => openNew('ethics_reviews', { project_id: w.project.id, status: 'preparing' })}><Icon name="plus" />Ethics review</button>
        <button className="btn btn-sm" onClick={() => exportFile(`/research/projects/${w.project.id}/ethics/export`, { format: 'docx' }, toast)}><Icon name="download" />Ethics record</button>
        <span className="faint" style={{ fontSize: 13 }}>Revision deadlines and approval expiry appear in your calendar and suggested tasks. Attach the approval letter in the record's Evidence tab.</span>
      </div>
      {w.ethics.length === 0 ? <div className="empty">No ethics review recorded.</div> : (
        <ul className="list">{w.ethics.map((e) => (
          <li key={e.id}><span className={`tag ${['approved', 'approved_with_conditions', 'exempt'].includes(e.status) ? 'ok' : e.status === 'revisions_required' ? 'orange' : ''}`}>{humanize(e.status)}</span>
            <button className="rowlink grow" onClick={() => openRecord('ethics_reviews', e.id)}><span className="t">{e.committee || 'Ethics review'}{e.reference_no ? ` · ${e.reference_no}` : ''}</span>
              <span className="s">{[e.submission_date && `submitted ${fmtDate(e.submission_date)}`, e.approval_date && `approved ${fmtDate(e.approval_date)}`, e.revisions_due && e.status === 'revisions_required' && `revisions due ${fmtDate(e.revisions_due)}`, e.expiry_date && `valid until ${fmtDate(e.expiry_date)}`].filter(Boolean).join(' · ')}</span></button></li>
        ))}</ul>
      )}
    </div>
  );
}

function Dissemination({ w }: { w: Workspace }) {
  const { openNew, openRecord, toast } = useApp();
  async function record(id: number) {
    try { const r = await api.post<{ type: string }>(`/research/submissions/${id}/record`); dataChanged(); toast(`Recorded in your portfolio (${r.type === 'publications' ? 'Publications' : 'Presentations'}), ready for your CVs.`, 'ok'); } catch (e) { toast((e as Error).message, 'error'); }
  }
  const manuscript = w.documents.find((d) => d.kind === 'manuscript');
  return (
    <div className="stack">
      <section className="panel">
        <header className="panel-head"><span className="code">MSS</span><h2>Manuscripts</h2><span style={{ flex: 1 }} />
          <button className="btn btn-sm" onClick={() => openNew('research_documents', { project_id: w.project.id, kind: 'manuscript', status: 'drafting', title: w.project.title })}><Icon name="plus" />Track a manuscript</button></header>
        <div className="panel-body">
          <p className="faint" style={{ marginTop: 0, fontSize: 12.5 }}>Write in Word or Google Docs. Here, keep its status, target journal and revisions, and link the file in the record's Evidence tab so it opens in one click.</p>
          {w.documents.length === 0 ? <div className="faint">No manuscripts tracked.</div> : (
            <ul className="list">{w.documents.map((d) => (
              <li key={d.id}><span className={`tag ${d.status === 'final' ? 'ok' : ''}`}>{humanize(d.status)}</span>
                <button className="rowlink grow" onClick={() => openRecord('research_documents', d.id)}><span className="t">{d.title}</span><span className="s">{[humanize(d.kind), d.target, d.word_limit && `limit ${d.word_limit} words`].filter(Boolean).join(' · ')}</span></button></li>
            ))}</ul>
          )}
        </div>
      </section>
      <div className="row wrap">
        <button className="btn btn-primary" onClick={() => openNew('research_submissions', { project_id: w.project.id, document_id: manuscript?.id, title: manuscript?.title || w.project.title, kind: 'journal', status: 'planned' })}><Icon name="plus" />Submission</button>
        <span className="faint" style={{ fontSize: 13 }}>When a submission is accepted, published or presented, “Record in portfolio” fills your publication or presentation record, so you never type it twice.</span>
      </div>
      {w.submissions.length === 0 ? <div className="empty">No submissions yet.</div> : (
        <ul className="list">{w.submissions.map((s) => (
          <li key={s.id}><span className={`tag ${['accepted', 'published', 'presented'].includes(s.status) ? 'ok' : s.status === 'revision_required' ? 'orange' : ''}`}>{humanize(s.status)}</span>
            <button className="rowlink grow" onClick={() => openRecord('research_submissions', s.id)}><span className="t">{s.venue || s.title}</span><span className="s">{[humanize(s.kind), s.submission_date && `submitted ${fmtDate(s.submission_date)}`, s.revision_due && `revision due ${fmtDate(s.revision_due)}`].filter(Boolean).join(' · ')}</span></button>
            {['accepted', 'published', 'presented'].includes(s.status) && <button className="btn btn-sm" onClick={() => record(s.id)}>{s.publication_id || s.presentation_id ? 'Update portfolio' : 'Record in portfolio'}</button>}</li>
        ))}</ul>
      )}
      {(w.publications.length > 0 || w.presentations.length > 0) && (
        <section className="panel"><header className="panel-head"><span className="code">PUB</span><h2>In your portfolio</h2></header><div className="panel-body"><ul className="list">
          {w.publications.map((x) => <li key={`p${x.id}`}><button className="rowlink grow" onClick={() => openRecord('publications', x.id)}><span className="t">{x.title}</span><span className="s">Publication · {x.venue || ''} {x.publication_date ? `· ${x.publication_date}` : ''}</span></button></li>)}
          {w.presentations.map((x) => <li key={`c${x.id}`}><button className="rowlink grow" onClick={() => openRecord('presentations', x.id)}><span className="t">{x.title}</span><span className="s">Presentation · {x.conference} {x.presentation_date ? `· ${x.presentation_date}` : ''}</span></button></li>)}
        </ul></div></section>
      )}
    </div>
  );
}

function Team({ w }: { w: Workspace }) {
  const { openNew, openRecord } = useApp();
  const p = w.project;
  return (
    <div className="res-cols">
      <section className="panel">
        <header className="panel-head"><span className="code">FND</span><h2>Funding</h2><span style={{ flex: 1 }} /><button className="btn btn-sm" onClick={() => openNew('research_funding', { project_id: p.id, submission_status: 'planned' })}><Icon name="plus" />Funding</button></header>
        <div className="panel-body">
          {p.funding && <p className="faint" style={{ marginTop: 0, fontSize: 13 }}>Earlier note: {p.funding}</p>}
          {w.funding.length === 0 ? <div className="faint">None recorded.</div> : <ul className="list">{w.funding.map((f) => (
            <li key={f.id}><button className="rowlink grow" onClick={() => openRecord('research_funding', f.id)}><span className="t">{f.opportunity}</span>
              <span className="s">{[f.organization, humanize(f.submission_status), f.award_status && humanize(f.award_status), f.deadline && `deadline ${fmtDate(f.deadline)}`, f.amount != null && `${f.currency || ''} ${Number(f.amount).toLocaleString('en')}`.trim()].filter(Boolean).join(' · ')}</span></button></li>
          ))}</ul>}
        </div>
      </section>
      <section className="panel">
        <header className="panel-head"><span className="code">TEAM</span><h2>Collaborators</h2><span style={{ flex: 1 }} /><button className="btn btn-sm" onClick={() => openNew('research_collaborators', { project_id: p.id, status: 'active' })}><Icon name="plus" />Collaborator</button></header>
        <div className="panel-body">
          {p.collaborators && <p className="faint" style={{ marginTop: 0, fontSize: 13 }}>Earlier note: {p.collaborators}</p>}
          {w.collaborators.length === 0 ? <div className="faint">None recorded.</div> : <ul className="list">{w.collaborators.map((c) => (
            <li key={c.id}><button className="rowlink grow" onClick={() => openRecord('research_collaborators', c.id)}><span className="t">{c.name}</span><span className="s">{[c.affiliation, c.project_role, humanize(c.status)].filter(Boolean).join(' · ')}</span></button></li>
          ))}</ul>}
        </div>
      </section>
    </div>
  );
}

/** Files and links of the project (Word, PDF, Google Drive, web), opened in their own applications. */
function ProjectDocuments({ projectId }: { projectId: number }) {
  const { openRecord, toast } = useApp();
  const [items, setItems] = useState<{ link_id: number; provider: string; url: string | null; title: string; external_id: string | null }[] | null>(null);
  const load = useCallback(() => { api.get<any[]>(`/records/research_projects/${projectId}/evidence`).then(setItems).catch(() => setItems([])); }, [projectId]);
  useEffect(() => { load(); return onDataChanged(load); }, [load]);
  async function open(it: { provider: string; url: string | null }) {
    const err = await openReference(it.provider, it.url);
    if (err) toast(err, 'error');
  }
  return (
    <section className="panel">
      <header className="panel-head"><span className="code">DOC</span><h2>Documents and links</h2><span style={{ flex: 1 }} />
        <button className="btn btn-sm" onClick={() => openRecord('research_projects', projectId)} title="Use the Evidence tab to add a Word or PDF file, a Google Drive link or a web link"><Icon name="link" />Add document or link</button></header>
      <div className="panel-body">
        {!items ? <div className="skeleton" style={{ height: 40 }} /> : items.length === 0 ? <div className="faint">No documents linked. Add the proposal, manuscript drafts, instrument files or approval letters — they stay where they are and open in Word, your PDF reader or Google Drive.</div> : (
          <ul className="list">{items.map((it) => (
            <li key={it.link_id}><span className="tag">{it.provider === 'google_drive' ? 'Drive' : it.provider === 'local_path' ? 'File' : 'Link'}</span>
              <span className="grow"><span className="t">{it.title}</span></span>
              <button className="btn btn-sm" onClick={() => open(it)}>Open</button></li>
          ))}</ul>
        )}
      </div>
    </section>
  );
}
