import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, dataChanged, onDataChanged } from '../../lib/api';
import { fmtDate, fmtDateTime, fmtNum, humanize } from '../../lib/format';
import { download } from '../../lib/download';
import { useApp } from '../../components/AppContext';
import { Icon } from '../../components/Icon';
import { VERIFICATION_INFO } from '../../lib/forms';

export interface Overview {
  teaching: {
    courses: { id: number; code: string; title: string; program: string | null; units: number | null; offerings: number; active_offerings: number; clos: number; syllabi: number; syllabus_status: string | null; materials: number; assessments: number }[];
    terms: { academic_year: string; semester: string; n: number }[]; active_offerings: number;
  };
  research: { projects: any[]; by_status: Record<string, number> };
  extension: { projects: any[]; participants: number; hours: number };
  development: { goals: any[]; year: string; trainings_year: number; hours_year: number; cpd_year: number; certifications: number; licenses: number };
}
const TERM: Record<string, string> = { first: 'First Semester', second: 'Second Semester', summer: 'Summer', other: 'Other term' };
const PIPELINE = ['idea', 'proposal', 'approved', 'data_collection', 'analysis', 'writing', 'completed'];

type Tab = 'teaching' | 'research' | 'extension' | 'development' | 'reports';

export async function exportAndSave(url: string, toast: (t: string, k?: 'ok' | 'error' | 'info') => void) {
  try {
    const r = await api.post<{ file_name: string; download: string }>(url);
    download(r.download, r.file_name);
    toast(`Generated ${r.file_name}`, 'ok');
    dataChanged();
  } catch (e) { toast((e as Error).message, 'error'); }
}

function Teaching({ o }: { o: Overview }) {
  const { openNew, toast } = useApp();
  const navigate = useNavigate();
  const [term, setTerm] = useState(o.teaching.terms[0] ? `${o.teaching.terms[0].academic_year}|${o.teaching.terms[0].semester}` : '');
  async function report() {
    const [academic_year, semester] = term.split('|');
    try {
      const r = await api.post<{ file_name: string; download: string }>('/academic/reports/teaching', { academic_year, semester });
      download(r.download, r.file_name); toast(`Generated ${r.file_name}`, 'ok'); dataChanged();
    } catch (e) { toast((e as Error).message, 'error'); }
  }
  return (
    <div className="stack" style={{ gap: 'var(--s-5)' }}>
      <div className="row wrap">
        <button className="btn btn-primary" onClick={() => openNew('courses')}><Icon name="plus" />Add course</button>
        <span style={{ flex: 1 }} />
        {o.teaching.terms.length > 0 && (
          <div className="row wrap">
            <select className="select" style={{ width: 'auto' }} value={term} onChange={(e) => setTerm(e.target.value)} aria-label="Term for the report">
              {o.teaching.terms.map((t) => <option key={`${t.academic_year}|${t.semester}`} value={`${t.academic_year}|${t.semester}`}>{TERM[t.semester]}, AY {t.academic_year} ({t.n} class{t.n > 1 ? 'es' : ''})</option>)}
            </select>
            <button className="btn" onClick={report}><Icon name="download" />Teaching accomplishment report</button>
          </div>
        )}
      </div>
      {o.teaching.courses.length === 0 ? (
        <div className="panel"><div className="panel-body"><div className="empty"><strong>No courses yet.</strong>Add the courses you handle or are preparing to handle. Each one gets its own workspace for syllabi, outcomes, lessons, assessments and class records.</div></div></div>
      ) : (
        <div className="cat-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
          {o.teaching.courses.map((c) => (
            <button key={c.id} className="cat-card" onClick={() => navigate(`/academic/courses/${c.id}`)}>
              <div className="between"><span className="label" style={{ color: 'var(--orange)' }}>{c.code}</span>{c.active_offerings > 0 && <span className="tag ok">{c.active_offerings} active</span>}</div>
              <span style={{ color: 'var(--text)', fontSize: 17, fontWeight: 600 }}>{c.title}</span>
              <span className="faint" style={{ fontSize: 13 }}>{[c.program, c.units != null && `${fmtNum(c.units)} units`].filter(Boolean).join(' · ')}</span>
              <div className="stat-row" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
                <div className="stat"><div className={`v ${c.clos ? '' : 'zero'}`}>{c.clos}</div><div className="k">CLOs</div></div>
                <div className="stat"><div className={`v ${c.syllabi ? '' : 'zero'}`}>{c.syllabi}</div><div className="k">Syllabi</div></div>
                <div className="stat"><div className={`v ${c.materials ? '' : 'zero'}`}>{c.materials}</div><div className="k">Materials</div></div>
                <div className="stat"><div className={`v ${c.assessments ? '' : 'zero'}`}>{c.assessments}</div><div className="k">Assess.</div></div>
              </div>
              <span className="faint" style={{ fontSize: 12 }}>{c.syllabus_status ? `Latest syllabus: ${humanize(c.syllabus_status)}` : 'No syllabus yet'} · {c.offerings} offering{c.offerings === 1 ? '' : 's'}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Research({ o }: { o: Overview }) {
  const { openNew, openRecord } = useApp();
  const cols = PIPELINE.filter((s) => s !== 'idea' || o.research.by_status.idea);
  return (
    <div className="stack" style={{ gap: 'var(--s-4)' }}>
      <div className="row"><button className="btn btn-primary" onClick={() => openNew('research_projects')}><Icon name="plus" />Add research project</button>
        <span className="faint" style={{ fontSize: 13 }}>Publications and presentations linked to a project appear on its card and flow into your portfolio and CVs.</span></div>
      {o.research.projects.length === 0 ? <div className="empty"><strong>No research projects yet.</strong>Track proposals, instruments, validation, ethics review and data collection here.</div> : (
        <div className="pipeline">
          {cols.map((st) => (
            <div key={st} className="pipeline-col">
              <div className="pipeline-head"><span>{humanize(st)}</span><span className="num">{o.research.by_status[st] || 0}</span></div>
              {o.research.projects.filter((p) => p.status === st).map((p) => (
                <button key={p.id} className="pipeline-card" onClick={() => openRecord('research_projects', p.id)}>
                  <span className="t">{p.title}</span>
                  {p.role && <span className="s">{p.role}</span>}
                  {p.progress_pct != null && (<><div className="meter mt-2"><span style={{ width: `${p.progress_pct}%` }} /></div><span className="s num">{p.progress_pct}% complete</span></>)}
                  {p.target_sample ? <span className="s num">Data: {p.collected_sample || 0} / {p.target_sample}</span> : null}
                  <div className="row wrap" style={{ gap: 4, marginTop: 6 }}>
                    {p.validation_status && <span className={`tag ${p.validation_status === 'validated' ? 'ok' : ''}`}>Instrument: {humanize(p.validation_status)}</span>}
                    {p.ethics_status && <span className={`tag ${p.ethics_status === 'approved' ? 'ok' : p.ethics_status === 'revisions_requested' ? 'orange' : ''}`}>Ethics: {humanize(p.ethics_status)}</span>}
                    {p.publications > 0 && <span className="tag violet">{p.publications} publication{p.publications > 1 ? 's' : ''}</span>}
                    {p.presentations > 0 && <span className="tag violet">{p.presentations} presentation{p.presentations > 1 ? 's' : ''}</span>}
                  </div>
                </button>
              ))}
            </div>
          ))}
          {o.research.by_status.discontinued ? <div className="faint" style={{ fontSize: 12 }}>{o.research.by_status.discontinued} discontinued project(s) not shown.</div> : null}
        </div>
      )}
    </div>
  );
}

function Extension({ o }: { o: Overview }) {
  const { openNew, openRecord, toast } = useApp();
  return (
    <div className="stack" style={{ gap: 'var(--s-4)' }}>
      <div className="row wrap"><button className="btn btn-primary" onClick={() => openNew('extension_projects')}><Icon name="plus" />Add extension project</button>
        <span className="faint" style={{ fontSize: 13 }}>{o.extension.projects.length} project(s) · {o.extension.participants} participants · {fmtNum(o.extension.hours)} training hours recorded</span></div>
      {o.extension.projects.length === 0 ? <div className="empty"><strong>No extension projects yet.</strong>Record community programs, trainings conducted and seminars, then generate narrative reports from them.</div> : (
        <div className="dossier">
          {o.extension.projects.map((e) => (
            <div key={e.id} className="dossier-row" style={{ cursor: 'default' }}>
              <div className="when">{[fmtDate(e.start_date), e.end_date && fmtDate(e.end_date)].filter((x) => x && x !== '—').join(' – ') || '—'}</div>
              <button className="what rowlink" style={{ all: 'unset', cursor: 'pointer' }} onClick={() => openRecord('extension_projects', e.id)}>
                <div className="t">{e.title}</div>
                <div className="s">{[humanize(e.project_type), e.partner, e.location, e.role].filter(Boolean).join(' · ')}</div>
                <div className="s">{[e.participants_count != null && `${e.participants_count} participants`, e.training_hours != null && `${fmtNum(e.training_hours)} hours`].filter(Boolean).join(' · ')}</div>
              </button>
              <div className="status">
                <span className="tag">{humanize(e.status)}</span>
                <span className={`tag ${VERIFICATION_INFO[e.verification]?.cls || ''}`}>{VERIFICATION_INFO[e.verification]?.label}</span>
                <button className="btn btn-sm" onClick={() => exportAndSave(`/academic/extension/${e.id}/report`, toast)}><Icon name="download" />Narrative report</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Development({ o }: { o: Overview }) {
  const { openNew, openRecord } = useApp();
  const d = o.development;
  return (
    <div className="stack" style={{ gap: 'var(--s-5)' }}>
      <div className="stat-row">
        <div className="stat"><div className="v">{d.trainings_year}</div><div className="k">Trainings {d.year}</div></div>
        <div className="stat"><div className="v">{fmtNum(d.hours_year)}</div><div className="k">Hours {d.year}</div></div>
        <div className="stat"><div className="v">{fmtNum(d.cpd_year)}</div><div className="k">CPD units {d.year}</div></div>
        <div className="stat"><div className="v">{d.certifications}</div><div className="k">Certifications</div></div>
        <div className="stat"><div className="v">{d.licenses}</div><div className="k">Licenses</div></div>
      </div>
      <div className="row wrap">
        <button className="btn btn-primary" onClick={() => openNew('development_goals')}><Icon name="plus" />Add development goal</button>
        <Link to="/portfolio/development" className="btn">Trainings and CPD in the portfolio</Link>
        <Link to="/portfolio/education" className="btn">Qualifications</Link>
      </div>
      <section className="panel">
        <header className="panel-head"><h2>Teaching and research development goals</h2></header>
        <div className="panel-body">
          {d.goals.length === 0 ? <div className="empty"><strong>No goals yet.</strong>Set goals such as completing a graduate degree, a certification, or a teaching-methods course, and track progress.</div> : (
            <ul className="list">
              {d.goals.map((g) => (
                <li key={g.id} style={{ alignItems: 'flex-start' }}>
                  <span className="tag violet">{humanize(g.goal_area)}</span>
                  <button className="rowlink" onClick={() => openRecord('development_goals', g.id)}>
                    <span className="t">{g.title}</span>
                    <span className="s">{[humanize(g.status), g.target_date && `Target ${fmtDate(g.target_date)}`, g.training_title && `Linked: ${g.training_title}`].filter(Boolean).join(' · ')}</span>
                    {g.progress_pct != null && <span className="meter mt-2" style={{ display: 'block', maxWidth: 320 }}><span style={{ width: `${g.progress_pct}%` }} /></span>}
                  </button>
                  <span className="num faint">{g.progress_pct != null ? `${g.progress_pct}%` : ''}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}

function Reports() {
  const [reports, setReports] = useState<{ id: number; report_type: string; title: string; created_at: string }[] | null>(null);
  const load = useCallback(() => { api.get<typeof reports>('/academic/reports').then(setReports).catch(() => setReports([])); }, []);
  useEffect(() => { load(); return onDataChanged(load); }, [load]);
  return !reports ? <div className="skeleton" /> : reports.length === 0 ? <div className="empty"><strong>No documents generated yet.</strong>Syllabi, tables of specifications, rubrics and reports you generate are kept here.</div> : (
    <div className="table-wrap">
      <table className="table">
        <thead><tr><th>Document</th><th>Type</th><th>Generated</th><th /></tr></thead>
        <tbody>{reports.map((r) => (
          <tr key={r.id}><td>{r.title}</td><td className="muted">{humanize(r.report_type)}</td><td className="num faint">{fmtDateTime(r.created_at)}</td>
            <td style={{ textAlign: 'right' }}><a className="btn btn-sm" href={`/api/academic/reports/${r.id}/download`} download><Icon name="download" />Save</a></td></tr>
        ))}</tbody>
      </table>
    </div>
  );
}

export function AcademicPage() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab) || 'teaching';
  const [o, setO] = useState<Overview | null>(null);
  const load = useCallback(() => { api.get<Overview>('/academic/overview').then(setO).catch(() => {}); }, []);
  useEffect(() => { load(); return onDataChanged(load); }, [load]);
  const tabs: [Tab, string][] = [['teaching', 'Instruction and Teaching'], ['research', 'Research'], ['extension', 'Extension and Engagement'], ['development', 'Faculty Development'], ['reports', 'Generated Documents']];
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="crumb"><span className="bar" /><span className="label">01 · Academic Workspace</span></div>
          <h1 className="display">Academic Workspace</h1>
          <div className="sub">Teaching, research, extension and faculty development, each grounded in the records you keep here.</div>
        </div>
      </div>
      {o && (
        <div className="stat-row" style={{ marginBottom: 'var(--s-5)' }}>
          <div className="stat"><div className={`v ${o.teaching.courses.length ? '' : 'zero'}`}>{o.teaching.courses.length}</div><div className="k">Courses</div></div>
          <div className="stat"><div className={`v ${o.teaching.active_offerings ? '' : 'zero'}`}>{o.teaching.active_offerings}</div><div className="k">Active classes</div></div>
          <div className="stat"><div className={`v ${o.research.projects.length ? '' : 'zero'}`}>{o.research.projects.length}</div><div className="k">Research projects</div></div>
          <div className="stat"><div className={`v ${o.extension.projects.length ? '' : 'zero'}`}>{o.extension.projects.length}</div><div className="k">Extension projects</div></div>
          <div className="stat"><div className={`v ${o.development.goals.length ? '' : 'zero'}`}>{o.development.goals.filter((g) => g.status !== 'achieved').length}</div><div className="k">Open goals</div></div>
        </div>
      )}
      <div className="tabs" role="tablist">
        {tabs.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => setParams({ tab: k })}>{l}</button>)}
      </div>
      {!o ? <div className="skeleton" style={{ height: 200 }} /> : (
        <>
          {tab === 'teaching' && <Teaching o={o} />}
          {tab === 'research' && <Research o={o} />}
          {tab === 'extension' && <Extension o={o} />}
          {tab === 'development' && <Development o={o} />}
          {tab === 'reports' && <Reports />}
        </>
      )}
    </div>
  );
}
