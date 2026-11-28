import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { api, dataChanged, onDataChanged } from '../lib/api';
import { fmtDate, fmtNum, dueLabel, humanize, relTime } from '../lib/format';
import type { LayoutItem, Nexus } from '../lib/types';
import { useApp } from '../components/AppContext';
import { Icon } from '../components/Icon';
import { CommandDisplay } from '../components/CommandDisplay';

const SIZE: Record<string, string> = {
  profile: 'w-8', development: 'w-4', deadlines: 'w-4', teaching: 'w-4', research: 'w-4', extension: 'w-4', pd: 'w-4',
  recent_records: 'w-6', accomplishments: 'w-6', recent_cvs: 'w-4', captures: 'w-8',
};
const CODE: Record<string, string> = {
  profile: 'PRF', development: 'DEV', deadlines: 'DLN', teaching: 'TCH', research: 'RSC', extension: 'EXT', pd: 'CPD',
  recent_records: 'UPD', accomplishments: 'ACC', recent_cvs: 'CVS', captures: 'CAP',
};

const STATUS_COLORS = ['var(--violet)', 'var(--violet-2)', 'var(--orange)', '#c9772a', 'var(--ok)', 'var(--text-3)', 'var(--red)', '#6a59b8'];
const RESEARCH_ORDER = ['idea', 'proposal', 'approved', 'data_collection', 'analysis', 'writing', 'completed', 'discontinued'];

function Stat({ v, k }: { v: number | string; k: string }) {
  return <div className="stat"><div className={`v ${v === 0 ? 'zero' : ''}`}>{v}</div><div className="k">{k}</div></div>;
}

function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return <div className="empty"><strong>{title}</strong>{children}</div>;
}

function SegBar({ data, order }: { data: Record<string, number>; order?: string[] }) {
  const keys = (order || Object.keys(data)).filter((k) => data[k]);
  const total = keys.reduce((s, k) => s + data[k], 0);
  if (!total) return null;
  return (
    <>
      <div className="segbar" role="img" aria-label={keys.map((k) => `${humanize(k)} ${data[k]}`).join(', ')}>
        {keys.map((k, i) => <span key={k} style={{ flex: data[k], background: STATUS_COLORS[(order ? order.indexOf(k) : i) % STATUS_COLORS.length] }} />)}
      </div>
      <div className="legend">
        {keys.map((k, i) => (
          <span key={k} className="faint" style={{ fontSize: 12 }}>
            <i style={{ background: STATUS_COLORS[(order ? order.indexOf(k) : i) % STATUS_COLORS.length] }} />{humanize(k)} <span className="num" style={{ color: 'var(--text-2)' }}>{data[k]}</span>
          </span>
        ))}
      </div>
    </>
  );
}

const VER_TAG: Record<string, [string, string]> = {
  self_reported: ['Self-reported', ''], user_confirmed: ['Confirmed', 'violet'], evidence_verified: ['Evidenced', 'ok'],
};

export function NexusPage() {
  const { openRecord, openCapture, updatePrefs, toast, prefs } = useApp();
  const [data, setData] = useState<Nexus | null>(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const [layout, setLayout] = useState<LayoutItem[]>([]);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropId, setDropId] = useState<string | null>(null);

  const load = useCallback(() => {
    api.get<Nexus>('/nexus').then((d) => { setData(d); setLayout(d.layout); setError(''); }).catch((e) => setError(e.message));
  }, []);
  useEffect(() => { load(); return onDataChanged(load); }, [load]);

  async function persist(next: LayoutItem[]) {
    setLayout(next);
    try { await updatePrefs({ dashboard_layout: next }); } catch { /* reported by updatePrefs */ }
  }
  const move = (id: string, dir: -1 | 1) => {
    const i = layout.findIndex((w) => w.id === id);
    let j = i + dir;
    while (j >= 0 && j < layout.length && !layout[j].visible) j += dir; // swap with nearest visible neighbour
    if (j < 0 || j >= layout.length) return;
    const next = [...layout];
    [next[i], next[j]] = [next[j], next[i]];
    persist(next);
  };
  const setVisible = (id: string, visible: boolean) => persist(layout.map((w) => (w.id === id ? { ...w, visible } : w)));
  const dropOn = (targetId: string) => {
    if (!dragId || dragId === targetId) return;
    const next = layout.filter((w) => w.id !== dragId);
    next.splice(next.findIndex((w) => w.id === targetId), 0, layout.find((w) => w.id === dragId)!);
    persist(next);
  };
  async function resetLayout() {
    if (!(await updatePrefs({ dashboard_layout: null }))) return;
    load();
    toast('Layout reset to the default', 'ok');
  }

  async function completeTask(id: number) {
    try {
      await api.patch(`/records/tasks/${id}`, { status: 'done' });
      dataChanged();
      toast('Task completed', 'ok');
    } catch (e) { toast((e as Error).message, 'error'); }
  }

  if (error) return <div className="page"><div className="alert">Could not load the Central Nexus: {error}</div></div>;
  if (!data) return <div className="page"><div className="skeleton" style={{ height: 40, width: 320 }} /><div className="skeleton mt-6" style={{ height: 240 }} /></div>;

  const titleOf = Object.fromEntries(data.widgets.map((w) => [w.id, w.title]));
  const p = data.profile;
  const greetingName = p.full_name?.split(/\s+/)[0];
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  const render: Record<string, () => ReactNode> = {
    profile: () => (
      <div className="stack">
        <div className="between wrap" style={{ alignItems: 'flex-start' }}>
          <div style={{ minWidth: 0 }}>
            <div className="display" style={{ fontSize: 46, overflowWrap: 'anywhere' }}>{p.full_name || 'Unnamed profile'}</div>
            <div className="muted mt-2">
              {[p.professional_title, p.academic_designation].filter(Boolean).join(' · ') || <span className="faint">No professional title recorded</span>}
            </div>
            {p.specialization && <div className="faint" style={{ fontSize: 13 }}>{p.specialization}</div>}
          </div>
          <Link to="/portfolio/profile" className="btn btn-sm"><Icon name="edit" />Edit profile</Link>
        </div>
        <div className="row trajectory" style={{ gap: 0, border: '1px solid var(--line)', alignItems: 'stretch' }}>
          <div style={{ flex: '1 1 220px', padding: 'var(--s-3) var(--s-4)', borderRight: '1px solid var(--line)' }}>
            <div className="label">Current position</div>
            <div className="mt-2" style={{ color: 'var(--text)' }}>{p.current_position || <span className="faint">Not recorded</span>}</div>
            <div className="faint" style={{ fontSize: 13 }}>{[p.current_office, p.current_institution].filter(Boolean).join(', ')}</div>
          </div>
          <div className="arrow" style={{ display: 'grid', placeItems: 'center', padding: '0 var(--s-3)', color: 'var(--orange)' }} aria-hidden><Icon name="right" size={18} /></div>
          <div style={{ flex: '1 1 220px', padding: 'var(--s-3) var(--s-4)', borderLeft: '1px solid var(--line)' }}>
            <div className="label" style={{ color: 'var(--orange)' }}>Next appointment target</div>
            <div className="mt-2" style={{ color: 'var(--text)' }}>{p.career_goal || <span className="faint">Not set</span>}</div>
            <div className="faint" style={{ fontSize: 13 }}>
              {p.current_appointment ? `Current appointment: ${p.current_appointment.academic_rank}` : 'No academic appointment recorded yet'}
            </div>
          </div>
        </div>
        <div>
          <div className="between"><span className="label">Profile completeness</span><span className="num muted">{p.completeness.filled}/{p.completeness.total}</span></div>
          <div className="meter ticks mt-2"><span style={{ width: `${(p.completeness.filled / p.completeness.total) * 100}%` }} /></div>
          {p.completeness.missing.length > 0 && (
            <div className="faint mt-2" style={{ fontSize: 12 }}>Missing: {p.completeness.missing.map(humanize).join(', ')}</div>
          )}
        </div>
      </div>
    ),

    development: () => {
      const d = data.development;
      const evidencePct = d.total_records ? Math.round((d.evidenced / d.total_records) * 100) : 0;
      return (
        <div className="stack">
          <div>
            <div className="between"><span className="label">Portfolio coverage</span><span className="num muted">{d.groups_covered}/{d.groups.length} areas</span></div>
            <div className="mt-2" style={{ display: 'grid', gridTemplateColumns: `repeat(${d.groups.length}, 1fr)`, gap: 3 }}>
              {d.groups.map((g) => (
                <span key={g.key} title={`${g.label}: ${g.count}`} style={{ height: 22, background: g.count ? 'var(--violet)' : 'var(--bg-3)', opacity: g.count ? 1 : 1 }} />
              ))}
            </div>
            <ul className="list mt-2" style={{ fontSize: 13 }}>
              {d.groups.map((g) => (
                <li key={g.key} style={{ padding: '3px 0', border: 0 }}>
                  <Link className="grow" to={`/portfolio/${g.key}`} style={{ color: g.count ? 'var(--text-2)' : 'var(--text-3)' }}>{g.label}</Link>
                  <span className="num" style={{ color: g.count ? 'var(--text)' : 'var(--text-3)' }}>{g.count}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <div className="between"><span className="label">Evidence completeness</span><span className="num muted">{d.evidenced}/{d.total_records}</span></div>
            <div className="meter orange mt-2"><span style={{ width: `${evidencePct}%` }} /></div>
            <div className="faint mt-2" style={{ fontSize: 12 }}>
              {d.total_records === 0 ? 'No portfolio records yet.' : `${d.verification.self_reported || 0} self-reported · ${d.verification.user_confirmed || 0} confirmed · ${d.verification.evidence_verified || 0} evidenced`}
            </div>
          </div>
        </div>
      );
    },

    deadlines: () => (
      data.deadlines.items.length === 0 ? (
        <Empty title="No deadlines in the next 30 days.">
          {data.deadlines.undated_open > 0 ? `${data.deadlines.undated_open} open task(s) have no due date.` : 'Capture a task with a due date to track it here.'}
          <div><button className="btn btn-sm" onClick={openCapture}><Icon name="plus" />Add task</button></div>
        </Empty>
      ) : (
        <>
          <ul className="list">
            {data.deadlines.items.map((t) => (
              <li key={t.id}>
                <input type="checkbox" className="check" aria-label={`Mark “${t.title}” done`} onChange={() => completeTask(t.id)} />
                <button className="rowlink" onClick={() => openRecord('tasks', t.id)}>
                  <span className="t">{t.title}</span>
                  <span className="s">{humanize(t.module)}{t.is_deadline ? ' · hard deadline' : ''}</span>
                </button>
                <span className={`tag ${t.overdue ? 'red' : t.due_date && dueLabel(t.due_date) === 'Today' ? 'orange' : ''}`}>{t.due_date ? dueLabel(t.due_date) : ''}</span>
              </li>
            ))}
          </ul>
          {data.deadlines.undated_open > 0 && <div className="faint mt-2" style={{ fontSize: 12 }}>+ {data.deadlines.undated_open} open task(s) without a due date</div>}
        </>
      )
    ),

    teaching: () => {
      const t = data.teaching;
      return (
        <div className="stack">
          <div className="stat-row">
            <Stat v={t.courses} k="Courses" />
            <Stat v={t.active_assignments} k="Active loads" />
            <Stat v={t.syllabi} k="Syllabi" />
          </div>
          <div className="stat-row">
            <Stat v={t.materials} k="Materials" />
            <Stat v={t.assessments} k="Assessments" />
            <Stat v={t.rubrics + t.tos} k="Rubrics + TOS" />
          </div>
          {t.syllabi > 0 && <div className="faint" style={{ fontSize: 12 }}>{t.syllabi_approved} of {t.syllabi} syllabi approved</div>}
          {t.courses === 0 && <div className="faint" style={{ fontSize: 12 }}>No courses yet. <Link to="/academic">Open the Academic Workspace</Link> to register courses.</div>}
        </div>
      );
    },

    research: () => {
      const r = data.research;
      return (
        <div className="stack">
          <div className="stat-row">
            <Stat v={r.projects} k="Projects" />
            <Stat v={r.publications} k="Publications" />
            <Stat v={r.published} k="Published" />
            <Stat v={r.presentations} k="Presentations" />
          </div>
          {r.projects > 0 ? (
            <div><div className="label" style={{ marginBottom: 6 }}>Project pipeline</div><SegBar data={r.projects_by_status} order={RESEARCH_ORDER} /></div>
          ) : <div className="faint" style={{ fontSize: 12 }}>No research projects recorded yet.</div>}
        </div>
      );
    },

    extension: () => {
      const e = data.extension;
      return e.total === 0 ? <Empty title="No extension activities recorded.">Extension projects, community programs and trainings conducted will appear here.</Empty> : (
        <div className="stack">
          <SegBar data={e.by_status} order={['planned', 'ongoing', 'completed', 'cancelled']} />
          <ul className="list">
            {e.recent.map((x) => (
              <li key={x.id}>
                <button className="rowlink" onClick={() => openRecord('extension_projects', x.id)}>
                  <span className="t">{x.title}</span><span className="s">{fmtDate(x.start_date)}</span>
                </button>
                <span className="tag">{humanize(x.status)}</span>
              </li>
            ))}
          </ul>
        </div>
      );
    },

    pd: () => {
      const d = data.pd;
      return (
        <div className="stack">
          <div className="stat-row">
            <Stat v={fmtNum(d.year_hours)} k={`Hours ${d.year}`} />
            <Stat v={fmtNum(d.year_cpd_units)} k={`CPD ${d.year}`} />
            <Stat v={d.total} k="All trainings" />
          </div>
          {d.recent.length === 0 ? <div className="faint" style={{ fontSize: 12 }}>No trainings, seminars or workshops recorded yet.</div> : (
            <ul className="list">
              {d.recent.map((x) => (
                <li key={x.id}>
                  <button className="rowlink" onClick={() => openRecord('trainings', x.id)}>
                    <span className="t">{x.title}</span>
                    <span className="s">{[x.organizer, fmtDate(x.start_date)].filter(Boolean).join(' · ')}</span>
                  </button>
                  {x.hours != null && <span className="num faint">{fmtNum(x.hours)}h</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      );
    },



    recent_records: () => (
      data.recent_records.length === 0 ? <Empty title="No records yet.">Portfolio and academic records you add or edit will appear here.</Empty> : (
        <ul className="list">
          {data.recent_records.map((r) => (
            <li key={`${r.type}-${r.id}`}>
              <span className="tag" style={{ minWidth: 0 }}>{r.label}</span>
              <button className="rowlink" onClick={() => openRecord(r.type, r.id)}><span className="t">{r.title}</span></button>
              <span className="faint num" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{r.is_new ? 'added' : 'edited'} {relTime(r.updated_at)}</span>
            </li>
          ))}
        </ul>
      )
    ),

    accomplishments: () => (
      data.accomplishments.length === 0 ? (
        <Empty title="No accomplishments recorded.">
          Capture one as it happens — it stays marked self-reported until evidence is linked.
          <div><button className="btn btn-sm" onClick={openCapture}><Icon name="plus" />Capture accomplishment</button></div>
        </Empty>
      ) : (
        <ul className="list">
          {data.accomplishments.map((a) => {
            const v = a.verification ? VER_TAG[a.verification] : ['Captured', ''];
            return (
              <li key={`${a.type}-${a.id}`}>
                <button className="rowlink" onClick={() => openRecord(a.type, a.id)}>
                  <span className="t">{a.title}</span><span className="s">{a.label} · {fmtDate(a.event_date)}</span>
                </button>
                <span className={`tag ${v[1]}`}>{v[0]}</span>
              </li>
            );
          })}
        </ul>
      )
    ),

    recent_cvs: () => (
      data.recent_cvs.exports.length === 0 ? (
        <Empty title="No CV documents generated yet.">
          {data.recent_cvs.profiles > 0 ? `${data.recent_cvs.profiles} CV profile(s) defined. ` : ''}
          CV Studio makes Word and PDF CVs from your portfolio; each one you export is listed here.
        </Empty>
      ) : (
        <ul className="list">
          {data.recent_cvs.exports.map((x) => (
            <li key={x.id}><span className="grow"><span className="t">{x.file_name}</span><span className="s">{x.profile} · {relTime(x.created_at)}</span></span><span className="tag">{x.format}</span></li>
          ))}
        </ul>
      )
    ),

    captures: () => (
      data.captures.length === 0 ? <Empty title="Nothing captured yet.">Press <span className="kbd">C</span> anywhere to capture an idea, research note or activity.</Empty> : (
        <ul className="list">
          {data.captures.map((c) => (
            <li key={c.id}>
              <span className={`tag ${c.kind === 'idea' ? 'violet' : c.kind === 'research_note' ? 'orange' : ''}`}>{humanize(c.kind)}</span>
              <button className="rowlink" onClick={() => openRecord('activities', c.id)}>
                <span className="t">{c.title}</span>
                {c.body && <span className="s">{c.body}</span>}
              </button>
              <span className="faint num" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{relTime(c.created_at)}</span>
            </li>
          ))}
        </ul>
      )
    ),
  };

  const visible = layout.filter((w) => w.visible);
  const hidden = layout.filter((w) => !w.visible);

  return (
    <div className="page nexus-page">
      <div className="page-head">
        <div>
          <div className="crumb"><span className="bar" /><span className="label">Command Center · Central Nexus</span></div>
          <h1 className="display">{greetingName ? `${greeting}, ${greetingName}.` : 'Central Nexus'}</h1>
          <div className="sub">
            {fmtDate(data.today)} · <span style={{ color: 'var(--orange)' }}>Faculty credentials</span> · Synchronize knowledge, achievement, and purpose into a coherent academic identity.
          </div>
        </div>
        <div className="actions">
          {editing ? (
            <>
              <button className="btn btn-ghost" onClick={resetLayout} disabled={!data.layout_customised && !prefs?.layout_customised}><Icon name="restore" />Reset to default</button>
              <button className="btn btn-primary" onClick={() => setEditing(false)}><Icon name="check" />Done</button>
            </>
          ) : (
            <>
              <button className="btn" onClick={() => setEditing(true)}><Icon name="sliders" />Configure</button>
              <button className="btn btn-accent" onClick={openCapture}><Icon name="plus" />Quick Capture</button>
            </>
          )}
        </div>
      </div>

      {data.command && <CommandDisplay c={data.command} mode="faculty" />}

      {editing && (
        <div className="panel accent-violet" style={{ marginBottom: 'var(--s-4)' }}>
          <div className="panel-body">
            <div className="between wrap">
              <span className="muted" style={{ fontSize: 13 }}>Drag widgets to reorder, or use the arrows. Hidden widgets can be restored below. Changes save automatically.</span>
            </div>
            {hidden.length > 0 && (
              <div className="row wrap mt-3">
                <span className="label">Hidden</span>
                {hidden.map((w) => (
                  <button key={w.id} className="btn btn-sm" onClick={() => setVisible(w.id, true)}><Icon name="eye" />{titleOf[w.id]}</button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="widget-grid" style={{ gridAutoFlow: 'dense' }}>
        {visible.map((w, i) => (
          <section key={w.id}
            className={`panel widget eva-widget ${SIZE[w.id] || 'w-4'} ${w.id === 'profile' ? 'accent-orange' : ''} ${editing ? 'is-editing' : ''} ${dragId === w.id ? 'is-dragging' : ''} ${dropId === w.id ? 'is-drop' : ''}`}
            aria-labelledby={`w-${w.id}`}
            draggable={editing}
            onDragStart={(e) => { setDragId(w.id); e.dataTransfer.effectAllowed = 'move'; }}
            onDragEnd={() => { setDragId(null); setDropId(null); }}
            onDragOver={(e) => { if (editing && dragId) { e.preventDefault(); setDropId(w.id); } }}
            onDragLeave={() => setDropId((d) => (d === w.id ? null : d))}
            onDrop={(e) => { e.preventDefault(); dropOn(w.id); setDropId(null); }}>
            <header className="panel-head">
              {editing && <span className="faint" aria-hidden><Icon name="grip" size={16} /></span>}
              <span className="code">{CODE[w.id]}</span>
              <h2 id={`w-${w.id}`}>{titleOf[w.id]}</h2>
              {editing && (
                <div className="widget-tools">
                  <button className="icon-btn sm" onClick={() => move(w.id, -1)} disabled={i === 0} aria-label={`Move ${titleOf[w.id]} earlier`}><Icon name="up" /></button>
                  <button className="icon-btn sm" onClick={() => move(w.id, 1)} disabled={i === visible.length - 1} aria-label={`Move ${titleOf[w.id]} later`}><Icon name="down" /></button>
                  <button className="icon-btn sm" onClick={() => setVisible(w.id, false)} aria-label={`Hide ${titleOf[w.id]}`}><Icon name="eye-off" /></button>
                </div>
              )}
            </header>
            <div className="panel-body">{render[w.id]?.()}</div>
          </section>
        ))}
      </div>
      {visible.length === 0 && <Empty title="All widgets are hidden.">Use Configure to show them again.</Empty>}
    </div>
  );
}
