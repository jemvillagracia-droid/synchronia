import { useCallback, useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { api, dataChanged, onDataChanged } from '../../lib/api';
import { fmtDate, fmtNum, humanize } from '../../lib/format';
import { useApp } from '../../components/AppContext';
import { Icon } from '../../components/Icon';
import { Field } from '../../components/Field';
import { AutoText } from '../../components/AutoText';
import { exportAndSave } from './AcademicPage';
import { useAutosave } from '../../lib/autosave';
import { SaveIndicator } from '../../components/SaveIndicator';

interface Workspace {
  course: any; offerings: any[]; clos: any[]; pos: any[]; alignments: { course_outcome_id: number; program_outcome_id: number; level: string }[];
  syllabi: any[]; materials: any[]; assessments: any[]; rubrics: any[]; activities: any[];
}
const TERM: Record<string, string> = { first: '1st Sem', second: '2nd Sem', summer: 'Summer', other: 'Term' };
const BLOOM = ['remembering', 'understanding', 'applying', 'analyzing', 'evaluating', 'creating'];
const offeringLabel = (o: any) => `${o.academic_year} · ${TERM[o.semester] || o.semester}${o.section ? ` · Sec ${o.section}` : ''}`;

// ─────────────────────────── Syllabus ───────────────────────────

type Week = { week: string; hours: number | null; ilos: string; clo_codes: string; assessment: string; content: string; activities: string; resources: string };
interface SyllabusContent {
  description: string; prerequisites: string; learner_term: string; consultation: string; policies: string;
  weeks: Week[]; grading: { component: string; weight: number }[]; references: string[];
  signatories: Record<string, string>;
}
const SIGNATORIES: [string, string][] = [['prepared_by', 'Prepared by'], ['reviewed_by', 'Reviewed by'], ['approved_by', 'Approved by']];
const WEEK_COLS: [keyof Week, string, number][] = [
  ['ilos', 'Intended learning outcomes (OBE-aligned ILOs)', 3], ['assessment', 'Outcome-based assessment (OBA)', 2],
  ['content', 'Content', 3], ['activities', 'Teaching & learning activities (TLA)', 3], ['resources', 'Learning resources', 2],
];

function SyllabusEditor({ id, onClose }: { id: number; onClose: () => void }) {
  const { toast, openRecord } = useApp();
  const [data, setData] = useState<{ syllabus: any; content: SyllabusContent; clos: any[]; course: any; signatory_defaults: Record<string, string> } | null>(null);
  const [c, setC] = useState<SyllabusContent | null>(null);
  const [refs, setRefs] = useState('');
  useEffect(() => { api.get<any>(`/academic/syllabi/${id}`).then((d) => { setData(d); setC(d.content); setRefs(d.content.references.join('\n')); }); }, [id]);
  const payload = c ? { ...c, references: refs.split('\n').map((r) => r.trim()).filter(Boolean) } : null;
  const auto = useAutosave(`syllabus-${id}`, payload, async (v) => { const d = await api.put<any>(`/academic/syllabi/${id}/content`, v); setData(d); dataChanged(); });
  if (!data || !c) return <div className="skeleton" style={{ height: 200 }} />;
  const set = (patch: Partial<SyllabusContent>) => setC({ ...c, ...patch });
  const setWeek = (i: number, patch: Partial<Week>) => set({ weeks: c.weeks.map((w, j) => (j === i ? { ...w, ...patch } : w)) });
  const setSig = (k: string, v: string) => set({ signatories: { ...c.signatories, [k]: v } });
  const total = c.grading.reduce((n, g) => n + (Number(g.weight) || 0), 0);
  const blankWeek = (): Week => ({ week: String(c.weeks.length + 1), hours: 3, ilos: '', clo_codes: '', assessment: '', content: '', activities: '', resources: '' });
  async function save() { if (await auto.flush()) toast('Syllabus saved', 'ok'); }
  return (
    <section className="panel">
      <header className="panel-head"><h2>Syllabus · {data.syllabus.version_label}</h2>
        <button className="btn btn-sm" onClick={() => openRecord('syllabi', id)}>Version details</button>
        <button className="icon-btn sm" onClick={() => { auto.flush().then((ok) => { if (ok) onClose(); }); }} aria-label="Close syllabus"><Icon name="close" /></button></header>
      <div className="panel-body stack" style={{ gap: 'var(--s-5)' }}>
        <p className="faint" style={{ margin: 0, fontSize: 13.5 }}>Exports in the University outcomes-based format on 8.5 × 13 landscape, with your letterhead and the vision, mission and goals from Settings → Institution.</p>
        <div className="form-grid">
          <Field label="Course description" className="span-2"><textarea className="textarea" rows={4} value={c.description} onChange={(e) => set({ description: e.target.value })} spellCheck /></Field>
          <Field label="Prerequisites"><AutoText value={c.prerequisites} onChange={(v) => set({ prerequisites: v })} placeholder="None" /></Field>
          <Field label="Learners are called" hint="“At the end of the course, the … can:”"><AutoText value={c.learner_term} onChange={(v) => set({ learner_term: v })} placeholder="students" /></Field>
          <Field label="Consultation hours" className="span-2"><AutoText value={c.consultation} onChange={(v) => set({ consultation: v })} placeholder="e.g. TTh 2:00–4:00 PM, Faculty Room" /></Field>
        </div>
        <div>
          <h3 className="label">Course intended learning outcomes</h3>
          {data.clos.length ? <ul className="list">{data.clos.map((o) => <li key={o.id}><span className="tag orange">{o.code}</span><span className="grow">{o.description}</span></li>)}</ul>
            : <div className="faint" style={{ fontSize: 13 }}>Add CILOs in the Outcomes tab; they appear here and in the exported syllabus.</div>}
        </div>
        <div>
          <div className="between"><h3 className="label" style={{ margin: 0 }}>Course outline</h3>
            <button className="btn btn-sm" onClick={() => set({ weeks: [...c.weeks, blankWeek()] })} disabled={c.weeks.length >= 30}><Icon name="plus" />Add week</button></div>
          <div className="week-cards mt-2">
            {c.weeks.map((w, i) => (
              <div className="week-card" key={i}>
                <div className="week-card-head">
                  <label className="row" style={{ gap: 6 }}><span className="label" style={{ margin: 0 }}>Week</span>
                    <input className="input" style={{ width: 80 }} value={w.week} onChange={(e) => setWeek(i, { week: e.target.value })} aria-label={`Week number, row ${i + 1}`} /></label>
                  <label className="row" style={{ gap: 6 }}><span className="label" style={{ margin: 0 }}>Hours</span>
                    <input className="input" style={{ width: 80 }} type="number" min={0} max={40} value={w.hours ?? ''} onChange={(e) => setWeek(i, { hours: e.target.value === '' ? null : Number(e.target.value) })} aria-label={`Hours, week ${w.week}`} /></label>
                  <label className="row grow" style={{ gap: 6 }}><span className="label" style={{ margin: 0 }}>CILOs</span>
                    <AutoText value={w.clo_codes} onChange={(v) => setWeek(i, { clo_codes: v })} aria-label={`CILOs, week ${w.week}`} placeholder="e.g. CILO 1–2" /></label>
                  <button className="icon-btn sm" onClick={() => set({ weeks: c.weeks.filter((_, j) => j !== i) })} aria-label={`Remove week ${w.week}`}><Icon name="trash" /></button>
                </div>
                <div className="week-card-grid">
                  {WEEK_COLS.map(([k, label, rows]) => (
                    <Field key={k} label={label}><textarea className="textarea" rows={rows} value={(w[k] as string) || ''} onChange={(e) => setWeek(i, { [k]: e.target.value } as Partial<Week>)} spellCheck /></Field>
                  ))}
                </div>
              </div>
            ))}
            {!c.weeks.length && <div className="empty">No weeks yet. Add the first week, or import an existing syllabus from the Teaching tab.</div>}
          </div>
        </div>
        <div>
          <div className="between"><h3 className="label" style={{ margin: 0 }}>Grading policy</h3>
            <span className={`tag ${total === 100 ? 'ok' : 'orange'}`}>Total {total}%</span></div>
          {c.grading.map((g, i) => (
            <div key={i} className="row mt-2">
              <AutoText value={g.component} onChange={(v) => set({ grading: c.grading.map((x, j) => (j === i ? { ...x, component: v } : x)) })} aria-label="Grading component" placeholder="Component" />
              <input className="input" style={{ width: 90 }} type="number" min={0} max={100} value={g.weight} onChange={(e) => set({ grading: c.grading.map((x, j) => (j === i ? { ...x, weight: Number(e.target.value) } : x)) })} aria-label="Weight %" />
              <button className="icon-btn sm" onClick={() => set({ grading: c.grading.filter((_, j) => j !== i) })} aria-label="Remove component"><Icon name="trash" /></button>
            </div>
          ))}
          <button className="btn btn-sm btn-ghost mt-2" onClick={() => set({ grading: [...c.grading, { component: '', weight: 0 }] })}><Icon name="plus" />Add component</button>
        </div>
        <div className="form-grid">
          <Field label="References (one per line, APA)" className="span-2"><textarea className="textarea" rows={5} value={refs} onChange={(e) => setRefs(e.target.value)} spellCheck /></Field>
          <Field label="Course policies (one per line; numbered on export)" className="span-2"><textarea className="textarea" rows={6} value={c.policies} onChange={(e) => set({ policies: e.target.value })} spellCheck /></Field>
        </div>
        <div>
          <h3 className="label">Signatories</h3>
          <div className="form-grid three">
            {SIGNATORIES.map(([k, label]) => (
              <div key={k} className="stack" style={{ gap: 'var(--s-2)' }}>
                <Field label={`${label} — name`}><AutoText value={c.signatories[`${k}_name`] || ''} onChange={(v) => setSig(`${k}_name`, v)} placeholder={data.signatory_defaults[`${k}_name`] || 'Name, degree'} /></Field>
                <Field label={`${label} — position`}><AutoText value={c.signatories[`${k}_title`] || ''} onChange={(v) => setSig(`${k}_title`, v)} placeholder={data.signatory_defaults[`${k}_title`] || 'Position'} /></Field>
              </div>
            ))}
          </div>
          <p className="faint" style={{ fontSize: 12.5, margin: '6px 0 0' }}>Blank fields use your profile name and the program head and dean saved under Settings → Institution.</p>
        </div>
        <div className="row wrap">
          <button className="btn btn-primary" onClick={save}><Icon name="check" />Save now</button>
          <button className="btn" onClick={async () => { if (await auto.flush()) exportAndSave(`/academic/syllabi/${id}/export`, toast); }}><Icon name="download" />Export Word</button>
          <SaveIndicator state={auto.state} savedAt={auto.savedAt} error={auto.error} />
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────── Outcomes ───────────────────────────

function Outcomes({ w, reload }: { w: Workspace; reload: () => void }) {
  const { openNew, openRecord, toast } = useApp();
  const key = (c: number, p: number) => `${c}:${p}`;
  const [m, setM] = useState<Record<string, string>>({});
  useEffect(() => setM(Object.fromEntries(w.alignments.map((a) => [key(a.course_outcome_id, a.program_outcome_id), a.level]))), [w.alignments]);
  async function save() {
    const pairs = Object.entries(m).filter(([, v]) => v).map(([k, level]) => { const [clo_id, po_id] = k.split(':').map(Number); return { clo_id, po_id, level }; });
    try { await api.put(`/academic/courses/${w.course.id}/alignments`, { pairs }); toast('Alignment saved', 'ok'); reload(); } catch (e) { toast((e as Error).message, 'error'); }
  }
  return (
    <div className="stack" style={{ gap: 'var(--s-5)' }}>
      <div className="form-grid">
        <section className="panel"><header className="panel-head"><h2>Course intended learning outcomes (CILOs)</h2>
          <button className="btn btn-sm" onClick={() => openNew('learning_outcomes', { outcome_type: 'CLO', course_id: w.course.id, code: `CILO ${w.clos.length + 1}` })}><Icon name="plus" />Add</button></header>
          <div className="panel-body">{w.clos.length ? <ul className="list">{w.clos.map((o) => <li key={o.id}><span className="tag orange">{o.code}</span><button className="rowlink" onClick={() => openRecord('learning_outcomes', o.id)}><span className="t">{o.description}</span></button></li>)}</ul>
            : <div className="empty">State what students will be able to do, beginning with a measurable verb.</div>}</div></section>
        <section className="panel accent-violet"><header className="panel-head"><h2>Program outcomes {w.course.program ? `· ${w.course.program}` : ''}</h2>
          <button className="btn btn-sm" onClick={() => openNew('learning_outcomes', { outcome_type: 'PO', program: w.course.program || null, code: `PO-${String.fromCharCode(97 + w.pos.length)}` })}><Icon name="plus" />Add</button></header>
          <div className="panel-body">{w.pos.length ? <ul className="list">{w.pos.map((o, i) => <li key={o.id} className={o.group_label && o.group_label !== w.pos[i - 1]?.group_label ? 'group-start' : undefined}>
            {o.group_label && o.group_label !== w.pos[i - 1]?.group_label && <div className="group-label">{o.group_label}</div>}
            <span className="tag violet">{o.code}</span><button className="rowlink" onClick={() => openRecord('learning_outcomes', o.id)}><span className="t">{o.description}</span></button></li>)}</ul>
            : <div className="empty">Program outcomes are shared by every course in the same program.</div>}</div></section>
      </div>
      {w.clos.length > 0 && w.pos.length > 0 && (
        <section className="panel"><header className="panel-head"><h2>Curriculum map</h2><span className="faint" style={{ fontSize: 13 }}>I – Introductory · P – Practiced · D – Demonstrative</span></header>
          <div className="panel-body">
            <div className="table-wrap"><table className="table matrix">
              <thead><tr><th>CILO \ PO</th>{w.pos.map((p) => <th key={p.id} title={p.description}>{p.code}</th>)}</tr></thead>
              <tbody>{w.clos.map((c) => (
                <tr key={c.id}><th title={c.description}>{c.code}</th>{w.pos.map((p) => (
                  <td key={p.id}><select className="select" value={m[key(c.id, p.id)] || ''} aria-label={`${c.code} to ${p.code}`} onChange={(e) => setM({ ...m, [key(c.id, p.id)]: e.target.value })}>
                    <option value="">—</option><option value="I">I</option><option value="P">P</option><option value="D">D</option></select></td>
                ))}</tr>
              ))}</tbody>
            </table></div>
            <button className="btn btn-primary mt-3" onClick={save}><Icon name="check" />Save alignment</button>
          </div></section>
      )}
    </div>
  );
}

// ─────────────────────────── TOS ───────────────────────────

function TosEditor({ id, onClose }: { id: number; onClose: () => void }) {
  const { toast } = useApp();
  const [d, setD] = useState<any>(null);
  const [c, setC] = useState<any>(null);
  const load = (data: any) => { setD(data); setC(data.content); };
  useEffect(() => { api.get<any>(`/academic/tos/${id}`).then(load); }, [id]);
  const auto = useAutosave(`tos-${id}`, c, async (v) => { setD(await api.put<any>(`/academic/tos/${id}/content`, v)); dataChanged(); });
  if (!d || !c) return <div className="skeleton" style={{ height: 200 }} />;
  async function save(andExport = false) {
    if (!(await auto.flush())) return;
    toast('Table of specifications saved', 'ok');
    if (andExport) exportAndSave(`/academic/tos/${id}/export`, toast);
  }
  const levelSum = BLOOM.reduce((n, b) => n + (Number(c.levels[b]) || 0), 0);
  return (
    <section className="panel">
      <header className="panel-head"><h2>Table of specifications · {d.tos.title}</h2><button className="icon-btn sm" onClick={() => { auto.flush().then((ok) => { if (ok) onClose(); }); }} aria-label="Close"><Icon name="close" /></button></header>
      <div className="panel-body stack" style={{ gap: 'var(--s-4)' }}>
        <div className="row wrap">
          <Field label="Total items"><input className="input" style={{ width: 120 }} type="number" min={0} value={c.total_items} onChange={(e) => setC({ ...c, total_items: Number(e.target.value) })} /></Field>
          {BLOOM.map((b) => (
            <Field key={b} label={`${humanize(b)} %`}><input className="input" style={{ width: 100 }} type="number" min={0} max={100} value={c.levels[b]}
              onChange={(e) => setC({ ...c, levels: { ...c.levels, [b]: Number(e.target.value) } })} /></Field>
          ))}
          <span className={`tag ${levelSum === 100 ? 'ok' : 'orange'}`} style={{ alignSelf: 'end', marginBottom: 8 }}>Levels total {levelSum}%</span>
        </div>
        <div>
          <div className="between"><h3 className="label" style={{ margin: 0 }}>Topics</h3>
            <button className="btn btn-sm" onClick={() => setC({ ...c, rows: [...c.rows, { topic: '', clo: '', hours: 3 }] })}><Icon name="plus" />Add topic</button></div>
          {c.rows.map((r: any, i: number) => (
            <div key={i} className="row mt-2">
              <AutoText value={r.topic} placeholder="Topic" aria-label="Topic" onChange={(v) => setC({ ...c, rows: c.rows.map((x: any, j: number) => (j === i ? { ...x, topic: v } : x)) })} />
              <input className="input" style={{ width: 90 }} value={r.clo} placeholder="CLO" aria-label="CLO" onChange={(e) => setC({ ...c, rows: c.rows.map((x: any, j: number) => (j === i ? { ...x, clo: e.target.value } : x)) })} />
              <input className="input" style={{ width: 90 }} type="number" min={0} value={r.hours} aria-label="Hours" onChange={(e) => setC({ ...c, rows: c.rows.map((x: any, j: number) => (j === i ? { ...x, hours: Number(e.target.value) } : x)) })} />
              <button className="icon-btn sm" onClick={() => setC({ ...c, rows: c.rows.filter((_: any, j: number) => j !== i) })} aria-label="Remove topic"><Icon name="trash" /></button>
            </div>
          ))}
        </div>
        <div className="row wrap"><button className="btn btn-primary" onClick={() => save()}><Icon name="check" />Save and recalculate</button>
          <button className="btn" onClick={() => save(true)}><Icon name="download" />Save and export Word</button>
          <SaveIndicator state={auto.state} savedAt={auto.savedAt} error={auto.error} /></div>
        {d.warnings.map((x: string) => <div key={x} className="alert info">{x}</div>)}
        {d.rows.length > 0 && (
          <div className="table-wrap"><table className="table matrix">
            <thead><tr><th>Topic</th><th>CLO</th><th>Hours</th><th>%</th><th>Items</th>{BLOOM.map((b) => <th key={b}>{humanize(b)}</th>)}</tr></thead>
            <tbody>
              {d.rows.map((r: any, i: number) => (
                <tr key={i}><td>{r.topic}</td><td>{r.clo}</td><td className="num">{fmtNum(r.hours)}</td><td className="num">{r.pct}</td><td className="num"><strong>{r.items}</strong></td>
                  {r.cells.map((n: number, j: number) => <td key={j} className="num">{n ? <>{n}<div className="faint" style={{ fontSize: 11 }}>{r.placement[j]}</div></> : '—'}</td>)}</tr>
              ))}
              <tr><th>Total</th><td /><td className="num">{fmtNum(d.total_hours)}</td><td className="num">100</td><td className="num"><strong>{d.total_items}</strong></td>{d.level_totals.map((n: number, j: number) => <td key={j} className="num"><strong>{n}</strong></td>)}</tr>
            </tbody>
          </table></div>
        )}
        <p className="faint" style={{ fontSize: 12, margin: 0 }}>Items are allocated to topics in proportion to teaching hours and to cognitive levels by the percentages above (largest-remainder method), so totals always match. Cells show item numbers.</p>
      </div>
    </section>
  );
}

// ─────────────────────────── Rubric ───────────────────────────

function RubricEditor({ id, onClose }: { id: number; onClose: () => void }) {
  const { toast } = useApp();
  const [d, setD] = useState<any>(null);
  const [c, setC] = useState<any>(null);
  const load = (data: any) => { setD(data); setC(data.content); };
  useEffect(() => { api.get<any>(`/academic/rubrics/${id}`).then(load); }, [id]);
  const auto = useAutosave(`rubric-${id}`, c, async (v) => { setD(await api.put<any>(`/academic/rubrics/${id}/criteria`, v)); dataChanged(); });
  if (!d || !c) return <div className="skeleton" style={{ height: 200 }} />;
  async function save(andExport = false) {
    if (!(await auto.flush())) { toast(auto.error || 'Could not save', 'error'); return; }
    toast('Rubric saved', 'ok');
    if (andExport) exportAndSave(`/academic/rubrics/${id}/export`, toast);
  }
  const setLevel = (i: number, patch: any) => setC({ ...c, levels: c.levels.map((l: any, j: number) => (j === i ? { ...l, ...patch } : l)) });
  const setCrit = (i: number, patch: any) => setC({ ...c, criteria: c.criteria.map((k: any, j: number) => (j === i ? { ...k, ...patch } : k)) });
  return (
    <section className="panel">
      <header className="panel-head"><h2>Rubric · {d.rubric.title}</h2><button className="icon-btn sm" onClick={() => { auto.flush().then((ok) => { if (ok) onClose(); }); }} aria-label="Close"><Icon name="close" /></button></header>
      <div className="panel-body stack" style={{ gap: 'var(--s-4)' }}>
        <div className="table-wrap"><table className="table edit-table">
          <thead><tr><th style={{ minWidth: 160 }}>Criterion</th><th style={{ width: 80 }}>Weight %</th>
            {c.levels.map((l: any, i: number) => (
              <th key={i} style={{ minWidth: 150 }}>
                <AutoText value={l.label} onChange={(v) => setLevel(i, { label: v })} aria-label={`Level ${i + 1} label`} />
                <input className="input mt-2" type="number" min={0} value={l.points} onChange={(e) => setLevel(i, { points: Number(e.target.value) })} aria-label={`Level ${i + 1} points`} />
              </th>
            ))}<th><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>{c.criteria.map((k: any, i: number) => (
            <tr key={i}>
              <td><AutoText value={k.name} onChange={(v) => setCrit(i, { name: v })} aria-label="Criterion" /></td>
              <td><input className="input" type="number" min={0} max={100} value={k.weight ?? ''} onChange={(e) => setCrit(i, { weight: e.target.value === '' ? null : Number(e.target.value) })} aria-label="Weight" /></td>
              {c.levels.map((_: any, j: number) => (
                <td key={j}><textarea className="textarea" rows={3} value={k.descriptors[j] || ''} aria-label={`${k.name} at level ${j + 1}`}
                  onChange={(e) => setCrit(i, { descriptors: c.levels.map((__: any, x: number) => (x === j ? e.target.value : k.descriptors[x] || '')) })} /></td>
              ))}
              <td><button className="icon-btn sm" onClick={() => setC({ ...c, criteria: c.criteria.filter((_: any, x: number) => x !== i) })} aria-label="Remove criterion"><Icon name="trash" /></button></td>
            </tr>
          ))}</tbody>
        </table></div>
        <div className="row wrap">
          <button className="btn btn-sm" onClick={() => setC({ ...c, criteria: [...c.criteria, { name: '', weight: null, descriptors: c.levels.map(() => '') }] })}><Icon name="plus" />Add criterion</button>
          <button className="btn btn-sm" onClick={() => setC({ ...c, levels: [...c.levels, { label: 'Level', points: 0 }], criteria: c.criteria.map((k: any) => ({ ...k, descriptors: [...k.descriptors, ''] })) })} disabled={c.levels.length >= 8}><Icon name="plus" />Add level</button>
          {c.levels.length > 2 && <button className="btn btn-sm btn-ghost" onClick={() => setC({ ...c, levels: c.levels.slice(0, -1), criteria: c.criteria.map((k: any) => ({ ...k, descriptors: k.descriptors.slice(0, -1) })) })}>Remove last level</button>}
          <span className="faint" style={{ fontSize: 12 }}>Maximum score {d.summary.max_points}</span>
        </div>
        {d.summary.warnings.map((x: string) => <div key={x} className="alert info">{x}</div>)}
        <div className="row wrap"><button className="btn btn-primary" onClick={() => save()}><Icon name="check" />Save rubric</button>
          <button className="btn" onClick={() => save(true)}><Icon name="download" />Save and export Word</button>
          <SaveIndicator state={auto.state} savedAt={auto.savedAt} error={auto.error} /></div>
      </div>
    </section>
  );
}

// ─────────────────────────── Page ───────────────────────────

type Tab = 'overview' | 'syllabus' | 'outcomes' | 'materials' | 'assessments' | 'records';

export function CoursePage() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab) || 'overview';
  const { openNew, openRecord, toast } = useApp();
  const [w, setW] = useState<Workspace | null>(null);
  const [error, setError] = useState('');
  const [openSyllabus, setOpenSyllabus] = useState<number | null>(params.get('open') ? Number(params.get('open')) : null);
  const [openTos, setOpenTos] = useState<number | null>(null);
  const [openRubric, setOpenRubric] = useState<number | null>(null);
  const [offering, setOffering] = useState<number | null>(null);
  const load = useCallback(() => { api.get<Workspace>(`/academic/courses/${id}`).then((d) => { setW(d); setError(''); }).catch((e) => setError(e.message)); }, [id]);
  useEffect(() => { load(); return onDataChanged(load); }, [load]);
  useEffect(() => { if (w && offering === null && w.offerings[0]) setOffering(w.offerings[0].id); }, [w, offering]);

  if (error) return <div className="page"><div className="alert">{error}</div><Link to="/academic" className="btn mt-4">Back</Link></div>;
  if (!w) return <div className="page"><div className="skeleton" style={{ height: 300 }} /></div>;
  const c = w.course;

  async function createChild(type: 'tos' | 'rubrics', assessment: any) {
    try {
      const r = await api.post<any>(`/records/${type}`, { assessment_id: assessment.id, ...(type === 'rubrics' ? { course_id: c.id } : {}), title: `${assessment.title} ${type === 'tos' ? 'TOS' : 'Rubric'}` });
      dataChanged();
      if (type === 'tos') setOpenTos(r.id); else setOpenRubric(r.id);
    } catch (e) { toast((e as Error).message, 'error'); }
  }

  const tabs: [Tab, string][] = [['overview', 'Classes'], ['syllabus', `Syllabus (${w.syllabi.length})`], ['outcomes', `Outcomes (${w.clos.length})`], ['materials', `Lessons and materials (${w.materials.length})`], ['assessments', `Assessments (${w.assessments.length})`], ['records', 'Class records']];
  const offActs = w.activities.filter((a) => a.teaching_assignment_id === offering);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="crumb"><span className="bar" /><span className="label"><Link to="/academic">01 · Academic Workspace</Link> · Course</span></div>
          <h1 className="display">{c.code} · {c.title}</h1>
          <div className="sub">{[c.program, c.units != null && `${fmtNum(c.units)} units`, c.level].filter(Boolean).join(' · ') || 'Course workspace'}</div>
        </div>
        <div className="actions"><button className="btn" onClick={() => openRecord('courses', c.id)}><Icon name="edit" />Course details</button></div>
      </div>
      <div className="tabs" role="tablist">{tabs.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => setParams({ tab: k })}>{l}</button>)}</div>

      {tab === 'overview' && (
        <div className="stack">
          {c.description && <p className="muted" style={{ margin: 0, maxWidth: '80ch' }}>{c.description}</p>}
          <div><button className="btn btn-primary" onClick={() => openNew('teaching_assignments', { course_id: c.id, status: 'active' })}><Icon name="plus" />Add class / offering</button></div>
          {w.offerings.length === 0 ? <div className="empty">No offerings yet. Add each section you handle per term.</div> : (
            <div className="table-wrap"><table className="table">
              <thead><tr><th>Term</th><th>Section</th><th>Schedule</th><th>Students</th><th>Status</th><th>Sessions recorded</th><th>Attendance</th><th><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>{w.offerings.map((o) => (
                <tr key={o.id}><td>{o.academic_year} · {TERM[o.semester]}</td><td>{o.section || '—'}</td><td>{o.schedule || '—'}</td><td className="num">{o.student_count ?? '—'}</td>
                  <td><span className="tag">{humanize(o.status)}</span></td><td className="num">{o.activities}</td><td className="num">{o.attendance_pct != null ? `${o.attendance_pct}%` : '—'}</td>
                  <td style={{ textAlign: 'right' }}><button className="btn btn-sm" onClick={() => openRecord('teaching_assignments', o.id)}>Edit</button></td></tr>
              ))}</tbody>
            </table></div>
          )}
        </div>
      )}

      {tab === 'syllabus' && (
        <div className="stack">
          <div className="row wrap"><button className="btn btn-primary" onClick={() => openNew('syllabi', { course_id: c.id, version_label: `v${new Date().getFullYear()}`, status: 'draft' })}><Icon name="plus" />New syllabus version</button></div>
          {w.syllabi.length === 0 ? <div className="empty">No syllabus yet.</div> : (
            <ul className="list">{w.syllabi.map((s) => (
              <li key={s.id}><span className={`tag ${s.status === 'approved' ? 'ok' : ''}`}>{humanize(s.status)}</span>
                <button className="rowlink" onClick={() => setOpenSyllabus(s.id)}><span className="t">{s.version_label}</span>
                  <span className="s">{[s.academic_year, TERM[s.semester] || s.semester, `${s.weeks} weekly rows`, s.grading_total ? `grading ${s.grading_total}%` : null].filter(Boolean).join(' · ')}</span></button>
                <button className="btn btn-sm" onClick={() => setOpenSyllabus(s.id)}><Icon name="edit" />Open</button>
                <button className="btn btn-sm" onClick={() => exportAndSave(`/academic/syllabi/${s.id}/export`, toast)}><Icon name="download" />Word</button></li>
            ))}</ul>
          )}
          {openSyllabus && <SyllabusEditor key={openSyllabus} id={openSyllabus} onClose={() => setOpenSyllabus(null)} />}
        </div>
      )}

      {tab === 'outcomes' && <Outcomes w={w} reload={load} />}

      {tab === 'materials' && (
        <div className="stack">
          <div className="row wrap">
            <button className="btn btn-primary" onClick={() => openNew('materials', { course_id: c.id, material_type: 'lesson_plan', teaching_assignment_id: offering })}><Icon name="plus" />Lesson plan</button>
            <button className="btn" onClick={() => openNew('materials', { course_id: c.id, material_type: 'learning_resource', teaching_assignment_id: offering })}><Icon name="plus" />Material or resource</button>
          </div>
          {w.materials.length === 0 ? <div className="empty">No lessons or materials yet. Attach files to each one through its Evidence tab or link Google Drive files.</div> : (
            <div className="dossier">{w.materials.map((m) => (
              <button key={m.id} className="dossier-row" onClick={() => openRecord('materials', m.id)}>
                <div className="when">{m.week_no ? `Week ${m.week_no}` : '—'}</div>
                <div className="what"><div className="t">{m.title}</div><div className="s">{[humanize(m.material_type), m.clo_codes && `CLOs: ${m.clo_codes}`, m.event_date && fmtDate(m.event_date)].filter(Boolean).join(' · ')}</div></div>
                <div className="status"><span className="tag">{humanize(m.status)}</span></div>
              </button>
            ))}</div>
          )}
        </div>
      )}

      {tab === 'assessments' && (
        <div className="stack">
          <div><button className="btn btn-primary" onClick={() => openNew('assessments', { course_id: c.id, teaching_assignment_id: offering, assessment_type: 'quiz' })}><Icon name="plus" />Add assessment</button></div>
          {w.assessments.length === 0 ? <div className="empty">No assessments yet.</div> : (
            <div className="dossier">{w.assessments.map((a) => (
              <div key={a.id} className="dossier-row" style={{ cursor: 'default' }}>
                <div className="when">{a.scheduled_date ? fmtDate(a.scheduled_date) : '—'}</div>
                <button className="what" style={{ all: 'unset', cursor: 'pointer' }} onClick={() => openRecord('assessments', a.id)}>
                  <div className="t">{a.title}</div>
                  <div className="s">{[humanize(a.assessment_type), a.item_count != null && `${a.item_count} items`, a.total_points != null && `${fmtNum(a.total_points)} points`, a.clo_codes && `CLOs: ${a.clo_codes}`].filter(Boolean).join(' · ')}</div>
                </button>
                <div className="status">
                  <span className="tag">{humanize(a.status)}</span>
                  {a.tos_id ? <button className="btn btn-sm" onClick={() => setOpenTos(a.tos_id)}>TOS</button> : <button className="btn btn-sm btn-ghost" onClick={() => createChild('tos', a)}><Icon name="plus" />TOS</button>}
                  {a.rubric_id ? <button className="btn btn-sm" onClick={() => setOpenRubric(a.rubric_id)}>Rubric</button> : <button className="btn btn-sm btn-ghost" onClick={() => createChild('rubrics', a)}><Icon name="plus" />Rubric</button>}
                </div>
              </div>
            ))}</div>
          )}
          {openTos && <TosEditor key={openTos} id={openTos} onClose={() => setOpenTos(null)} />}
          {openRubric && <RubricEditor key={openRubric} id={openRubric} onClose={() => setOpenRubric(null)} />}
        </div>
      )}

      {tab === 'records' && (
        <div className="stack">
          {w.offerings.length === 0 ? <div className="empty">Add a class offering first.</div> : (
            <>
              <div className="row wrap">
                <select className="select" style={{ width: 'auto' }} value={offering ?? ''} onChange={(e) => setOffering(Number(e.target.value))} aria-label="Class">
                  {w.offerings.map((o) => <option key={o.id} value={o.id}>{offeringLabel(o)}</option>)}
                </select>
                <button className="btn btn-primary" onClick={() => openNew('class_activities', { teaching_assignment_id: offering, activity_date: new Date().toISOString().slice(0, 10), activity_type: 'lecture', enrolled: w.offerings.find((o) => o.id === offering)?.student_count ?? null })}><Icon name="plus" />Record a session</button>
              </div>
              {offActs.length === 0 ? <div className="empty">No sessions recorded for this class yet.</div> : (
                <div className="table-wrap"><table className="table">
                  <thead><tr><th>Date</th><th>Session</th><th>Type</th><th>Present</th><th>Enrolled</th><th>Attendance</th></tr></thead>
                  <tbody>{offActs.map((a) => (
                    <tr key={a.id} onClick={() => openRecord('class_activities', a.id)} style={{ cursor: 'pointer' }}>
                      <td className="num">{fmtDate(a.activity_date)}</td><td>{a.title}</td><td>{humanize(a.activity_type)}</td>
                      <td className="num">{a.present ?? '—'}</td><td className="num">{a.enrolled ?? '—'}</td>
                      <td className="num">{a.present != null && a.enrolled ? `${Math.round((a.present / a.enrolled) * 1000) / 10}%` : '—'}</td></tr>
                  ))}</tbody>
                </table></div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
