import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api, dataChanged, onDataChanged } from '../../lib/api';
import { fmtDate, fmtNum, humanize, relTime } from '../../lib/format';
import { useApp } from '../../components/AppContext';
import { Icon } from '../../components/Icon';
import { exportAndSave } from './AcademicPage';

interface Workspace { course: any; offerings: any[]; syllabi: any[]; activities: any[] }
const TERM: Record<string, string> = { first: '1st Sem', second: '2nd Sem', summer: 'Summer', other: 'Term' };
const offeringLabel = (o: any) => `${o.academic_year} · ${TERM[o.semester] || o.semester}${o.section ? ` · Sec ${o.section}` : ''}`;

type Tab = 'syllabus' | 'classes' | 'records';

/** A course: its syllabi (each opened as a document), its classes and the sessions recorded for them. */
export function CoursePage() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab) || 'syllabus';
  const { openNew, openRecord, toast } = useApp();
  const navigate = useNavigate();
  const [w, setW] = useState<Workspace | null>(null);
  const [error, setError] = useState('');
  const [offering, setOffering] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const load = useCallback(() => { api.get<Workspace>(`/academic/courses/${id}`).then((d) => { setW(d); setError(''); }).catch((e) => setError(e.message)); }, [id]);
  useEffect(() => { load(); return onDataChanged(load); }, [load]);
  useEffect(() => { if (w && offering === null && w.offerings[0]) setOffering(w.offerings[0].id); }, [w, offering]);
  // Links from before 1.2 (?open=<id>) go straight to the document.
  useEffect(() => { const o = params.get('open'); if (o) navigate(`/academic/syllabi/${o}`, { replace: true }); }, [params, navigate]);

  if (error) return <div className="page"><div className="alert">{error}</div><Link to="/academic" className="btn mt-4">Back</Link></div>;
  if (!w) return <div className="page"><div className="skeleton" style={{ height: 300 }} /></div>;
  const c = w.course;

  async function newSyllabus(copyFrom?: number) {
    setCreating(true);
    try {
      const year = new Date().getFullYear();
      const r = await api.post<{ syllabus: { id: number } }>(`/academic/courses/${c.id}/syllabi`, copyFrom
        ? { copy_from: copyFrom, version_label: `${w!.syllabi.find((s) => s.id === copyFrom)?.version_label || 'Syllabus'} (copy)` }
        : { version_label: `${year}–${year + 1}`, academic_year: `${year}-${year + 1}` });
      dataChanged();
      navigate(`/academic/syllabi/${r.syllabus.id}`);
    } catch (e) { toast((e as Error).message, 'error'); } finally { setCreating(false); }
  }

  const tabs: [Tab, string][] = [['syllabus', `Syllabus (${w.syllabi.length})`], ['classes', `Classes (${w.offerings.length})`], ['records', 'Class records']];
  const offActs = w.activities.filter((a) => a.teaching_assignment_id === offering);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="crumb"><span className="bar" /><span className="label"><Link to="/academic">Academic Workspace</Link> · Course</span></div>
          <h1 className="display">{c.code} · {c.title}</h1>
          <div className="sub">{[c.program, c.units != null && `${fmtNum(c.units)} units`, c.level].filter(Boolean).join(' · ') || 'Course'}</div>
        </div>
        <div className="actions"><button className="btn" onClick={() => openRecord('courses', c.id)}><Icon name="edit" />Course details</button></div>
      </div>
      <div className="tabs" role="tablist">{tabs.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => setParams({ tab: k })}>{l}</button>)}</div>

      {tab === 'syllabus' && (
        <div className="stack">
          <div className="row wrap">
            <button className="btn btn-primary" onClick={() => newSyllabus()} disabled={creating}><Icon name="plus" />{creating ? 'Creating…' : 'New syllabus'}</button>
            <span className="faint" style={{ fontSize: 13 }}>Opens as a document you edit like in Word. It saves as you type; export to Word or PDF with your letterhead.</span>
          </div>
          {w.syllabi.length === 0 ? <div className="empty"><strong>No syllabus yet.</strong>Start one from the usual outline, or import your existing Word syllabus from the Academic Workspace.</div> : (
            <ul className="list">{w.syllabi.map((s) => (
              <li key={s.id}>
                <span className={`tag ${s.status === 'approved' ? 'ok' : ''}`}>{humanize(s.status)}</span>
                <Link className="rowlink grow" to={`/academic/syllabi/${s.id}`}><span className="t">{s.version_label}</span>
                  <span className="s">{[s.academic_year, TERM[s.semester] || s.semester, s.updated_at && `edited ${relTime(s.updated_at)}`].filter(Boolean).join(' · ')}</span></Link>
                <Link className="btn btn-sm btn-primary" to={`/academic/syllabi/${s.id}`}><Icon name="edit" />Open</Link>
                <button className="btn btn-sm" onClick={() => newSyllabus(s.id)} disabled={creating} title="Start a new version from this one">Copy</button>
                <button className="btn btn-sm" onClick={() => exportAndSave(`/academic/syllabi/${s.id}/document/export`, toast)}><Icon name="download" />Word</button>
              </li>
            ))}</ul>
          )}
        </div>
      )}

      {tab === 'classes' && (
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
