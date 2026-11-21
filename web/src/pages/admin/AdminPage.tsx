import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, dataChanged, onDataChanged } from '../../lib/api';
import { fmtDate, fmtLongDate, humanize, plural } from '../../lib/format';
import { useApp } from '../../components/AppContext';
import { Icon } from '../../components/Icon';
import { CorrespondenceFile, MeetingWorkspace, RoleChange, TurnoverEditor, t12 } from './AdminWorkspaces';

type Tab = 'today' | 'correspondence' | 'follow' | 'meetings' | 'secretariat' | 'log' | 'tasks' | 'turnover';
const TABS: [Tab, string][] = [['today', 'Today'], ['correspondence', 'Correspondence'], ['follow', 'Follow-ups'], ['meetings', 'Meetings'],
  ['secretariat', 'Secretariat'], ['log', 'Daily log'], ['tasks', 'Tasks'], ['turnover', 'Turnover']];
const KIND: Record<string, string> = { correspondence: 'Document', route: 'Routed', task: 'Task', minutes: 'Minutes', meeting_status: 'Meeting', secretariat: 'Secretariat' };
const CATS = ['correspondence', 'meeting', 'secretariat', 'records', 'clerical', 'coordination', 'reports', 'teaching', 'research', 'extension', 'other'];
const longDay = (iso: string) => fmtLongDate(new Date(`${iso}T00:00:00`));
const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const shift = (iso: string, n: number) => { const d = new Date(`${iso}T00:00:00`); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

interface Open { kind: 'corr' | 'meeting' | 'turnover'; id: number }

function useLoad<T>(url: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(() => { if (url) api.get<T>(url).then((d) => { setData(d); setError(''); }).catch((e) => setError(e.message)); }, [url]);
  useEffect(() => { load(); return onDataChanged(load); }, [load]);
  return { data, error, reload: load };
}

function FollowList({ items, onOpen }: { items: any[]; onOpen: (x: any) => void }) {
  if (!items.length) return <div className="empty">Nothing waiting. Items appear here when documents have due dates, are with someone, or minutes and records are still in process.</div>;
  return (
    <ul className="list follow-list">
      {items.map((x) => (
        <li key={`${x.kind}-${x.route_id || x.entity_id}`} className={x.overdue ? 'is-overdue' : ''}>
          <span className={`tag ${x.overdue ? 'st-self' : 'st-confirmed'}`}>{KIND[x.kind] || x.kind}</span>
          <button className="rowlink grow" onClick={() => onOpen(x)}><span className="t">{[x.ref, x.title].filter(Boolean).join(' — ')}</span><span className="s">{x.detail}</span></button>
          <span className="fu-when">{x.due ? <span className={x.overdue ? 'overdue' : ''}>{x.overdue ? 'Overdue · ' : 'Due '}{fmtDate(x.due)}</span> : null}{x.age_days != null ? <span className="faint">{x.age_days === 0 ? 'added today' : `open ${x.age_days} day${x.age_days === 1 ? '' : 's'}`}</span> : null}</span>
        </li>
      ))}
    </ul>
  );
}

function QuickLog({ date }: { date: string }) {
  const { toast } = useApp();
  const blank = { start_time: '', end_time: '', activity: '', category: 'clerical', output: '', quantity: '' as any };
  const [v, setV] = useState(blank);
  const [busy, setBusy] = useState(false);
  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!v.activity.trim()) return;
    setBusy(true);
    try {
      await api.post('/records/daily_logs', { log_date: date, ...v, start_time: v.start_time || null, end_time: v.end_time || null, quantity: v.quantity === '' ? null : Number(v.quantity), output: v.output || null });
      setV({ ...blank, category: v.category, start_time: v.end_time });
      dataChanged(); toast('Logged', 'ok');
    } catch (err: any) { toast(Object.values(err.details || {})[0] as string || err.message, 'error'); } finally { setBusy(false); }
  }
  return (
    <form className="quick-log" onSubmit={add} aria-label={`Add to the log for ${longDay(date)}`}>
      <input className="input" type="time" value={v.start_time} onChange={(e) => setV({ ...v, start_time: e.target.value })} aria-label="Start time" />
      <input className="input" type="time" value={v.end_time} onChange={(e) => setV({ ...v, end_time: e.target.value })} aria-label="End time" />
      <input className="input ql-act" value={v.activity} onChange={(e) => setV({ ...v, activity: e.target.value })} placeholder="What did you do?" aria-label="Activity" maxLength={2000} />
      <select className="select" value={v.category} onChange={(e) => setV({ ...v, category: e.target.value })} aria-label="Category">{CATS.map((c) => <option key={c} value={c}>{humanize(c)}</option>)}</select>
      <input className="input" value={v.output} onChange={(e) => setV({ ...v, output: e.target.value })} placeholder="Output" aria-label="Output" />
      <input className="input ql-qty" type="number" min={0} value={v.quantity} onChange={(e) => setV({ ...v, quantity: e.target.value })} placeholder="No." aria-label="Number of outputs" />
      <button className="btn btn-primary" type="submit" disabled={busy || !v.activity.trim()}><Icon name="plus" />Log</button>
    </form>
  );
}

function LogEntries({ entries }: { entries: any[] }) {
  const { openRecord } = useApp();
  if (!entries.length) return <div className="empty">Nothing logged.</div>;
  return (
    <ul className="list">{entries.map((e) => (
      <li key={e.id}><span className="mono faint log-time">{e.start_time ? `${t12(e.start_time)}${e.end_time ? `–${t12(e.end_time)}` : ''}` : '—'}</span>
        <button className="rowlink grow" onClick={() => openRecord('daily_logs', e.id)}><span className="t">{e.activity}</span><span className="s">{[humanize(e.category), e.output && `${e.quantity != null ? `${e.quantity} ` : ''}${e.output}`].filter(Boolean).join(' · ')}</span></button></li>
    ))}</ul>
  );
}

function Today({ open }: { open: (o: Open) => void }) {
  const { openNew, openRecord } = useApp();
  const { data: o } = useLoad<any>('/admin/overview');
  if (!o) return <div className="skeleton" style={{ height: 300 }} />;
  const c = o.counts;
  const openItem = (x: any) => (x.entity_type === 'correspondence' ? open({ kind: 'corr', id: x.entity_id }) : x.entity_type === 'meetings' ? open({ kind: 'meeting', id: x.entity_id }) : openRecord(x.entity_type, x.entity_id));
  return (
    <div className="stack" style={{ gap: 'var(--s-5)' }}>
      <div className="stat-row admin-stats">
        {([[c.incoming_open, 'Incoming open'], [c.outgoing_open, 'Outgoing open'], [c.follow_ups, 'Follow-ups'], [c.overdue, 'Overdue'], [c.meetings_upcoming, 'Meetings · 14 days'], [c.minutes_pending, 'Minutes pending'], [c.secretariat_in_process, 'Records in process'], [c.log_today, 'Logged today']] as [number, string][])
          .map(([n, k]) => <div key={k} className="stat"><div className={`v ${n ? '' : 'zero'}`}>{n}</div><div className="k">{k}</div></div>)}
      </div>
      <div className="row wrap">
        <button className="btn btn-primary" onClick={() => openNew('correspondence', { direction: 'incoming' })}><Icon name="plus" />Log incoming</button>
        <button className="btn" onClick={() => openNew('correspondence', { direction: 'outgoing' })}><Icon name="plus" />Log outgoing</button>
        <button className="btn" onClick={() => openNew('meetings', { status: 'scheduled' })}><Icon name="plus" />Schedule meeting</button>
        <button className="btn" onClick={() => openNew('tasks', { module: 'admin' })}><Icon name="plus" />Admin task</button>
      </div>
      <div className="form-grid">
        <section className="panel span-2"><header className="panel-head"><span className="code">LOG</span><h2>Today · {longDay(o.today)}</h2></header>
          <div className="panel-body stack"><QuickLog date={o.today} /><LogEntries entries={o.log_today} /></div></section>
        <section className="panel"><header className="panel-head"><span className="code">FU</span><h2>Needs attention</h2></header>
          <div className="panel-body"><FollowList items={o.follow_ups} onOpen={openItem} /></div></section>
        <section className="panel"><header className="panel-head"><span className="code">MTG</span><h2>Upcoming meetings</h2></header>
          <div className="panel-body">{o.upcoming_meetings.length ? <ul className="list">{o.upcoming_meetings.map((m: any) => (
            <li key={m.id}><span className="mono faint" style={{ width: 96 }}>{fmtDate(m.meeting_date)}</span><button className="rowlink grow" onClick={() => open({ kind: 'meeting', id: m.id })}><span className="t">{m.title}</span><span className="s">{[m.start_time && t12(m.start_time), m.venue, m.role && humanize(m.role)].filter(Boolean).join(' · ')}</span></button></li>
          ))}</ul> : <div className="empty">No meetings scheduled.</div>}</div></section>
      </div>
    </div>
  );
}

function Correspondence({ open }: { open: (o: Open) => void }) {
  const { openNew } = useApp();
  const [dir, setDir] = useState<'incoming' | 'outgoing' | ''>('incoming');
  const [status, setStatus] = useState('open');
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  useEffect(() => { const t = setTimeout(() => setQuery(q), 250); return () => clearTimeout(t); }, [q]);
  const { data, error } = useLoad<any[]>(`/admin/correspondence?direction=${dir}&status=${status}&q=${encodeURIComponent(query)}`);
  return (
    <div className="stack">
      <div className="row wrap" style={{ gap: 'var(--s-3)' }}>
        <div className="seg" role="group" aria-label="Registry">{([['incoming', 'Incoming'], ['outgoing', 'Outgoing'], ['', 'All']] as const).map(([k, l]) => <button key={k} aria-pressed={dir === k} onClick={() => setDir(k)}>{l}</button>)}</div>
        <div className="seg" role="group" aria-label="Status">{([['open', 'Open'], ['completed', 'Completed'], ['', 'All']] as const).map(([k, l]) => <button key={k} aria-pressed={status === k} onClick={() => setStatus(k)}>{l}</button>)}</div>
        <input className="input" style={{ maxWidth: 320 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search subject, number, sender…" aria-label="Search correspondence" />
        <span style={{ flex: 1 }} />
        <button className="btn btn-primary" onClick={() => openNew('correspondence', { direction: dir || 'incoming' })}><Icon name="plus" />Log {dir === 'outgoing' ? 'outgoing' : 'incoming'}</button>
      </div>
      {error && <div className="alert">{error}</div>}
      {!data ? <div className="skeleton" style={{ height: 200 }} /> : data.length ? (
        <div className="table-wrap"><table className="table registry">
          <thead><tr><th>Ref. no.</th><th>Logged</th><th>Subject</th><th>{dir === 'outgoing' ? 'To' : dir === 'incoming' ? 'From' : 'From / to'}</th><th>Status</th><th>Currently with</th><th>Due</th><th>Days</th></tr></thead>
          <tbody>{data.map((c) => (
            <tr key={c.id} className={c.overdue ? 'is-overdue' : ''} onClick={() => open({ kind: 'corr', id: c.id })} style={{ cursor: 'pointer' }}>
              <td className="mono"><button className="rowlink" onClick={(e) => { e.stopPropagation(); open({ kind: 'corr', id: c.id }); }}>{c.reference_no || '—'}</button></td>
              <td className="nowrap">{fmtDate(c.logged_date)}</td><td>{c.subject}</td><td>{c.counterpart || '—'}</td>
              <td><span className={`tag ${['completed', 'archived'].includes(c.status) ? 'st-evidenced' : c.overdue ? 'st-self' : 'st-confirmed'}`}>{humanize(c.status)}</span></td>
              <td>{c.last_route?.status === 'pending' ? c.last_route.routed_to : '—'}</td>
              <td className={`nowrap ${c.overdue ? 'overdue' : ''}`}>{fmtDate(c.due_date) || '—'}</td>
              <td className="mono">{c.days_open ?? (c.processing_days != null ? `${c.processing_days}✓` : '—')}</td>
            </tr>
          ))}</tbody>
        </table></div>
      ) : <div className="panel"><div className="panel-body"><div className="empty">No correspondence {status === 'open' ? 'open' : 'recorded'}{query ? ' matching your search' : ''}.</div></div></div>}
    </div>
  );
}

function FollowUps({ open }: { open: (o: Open) => void }) {
  const { openRecord } = useApp();
  const { data } = useLoad<any[]>('/admin/follow-ups');
  if (!data) return <div className="skeleton" style={{ height: 200 }} />;
  const groups = [['Overdue', data.filter((x) => x.overdue)], ['Due', data.filter((x) => !x.overdue && x.due)], ['In process', data.filter((x) => !x.due)]] as [string, any[]][];
  const openItem = (x: any) => (x.entity_type === 'correspondence' ? open({ kind: 'corr', id: x.entity_id }) : x.entity_type === 'meetings' ? open({ kind: 'meeting', id: x.entity_id }) : openRecord(x.entity_type, x.entity_id));
  return (
    <div className="stack">
      {groups.map(([label, items]) => (
        <section key={label} className="panel"><header className="panel-head"><h2>{label}</h2><span className="faint">{items.length}</span></header>
          <div className="panel-body"><FollowList items={items} onOpen={openItem} /></div></section>
      ))}
    </div>
  );
}

function Meetings({ open }: { open: (o: Open) => void }) {
  const { openNew } = useApp();
  const [when, setWhen] = useState<'upcoming' | 'past'>('upcoming');
  const { data } = useLoad<any>('/records/meetings?limit=500&sort=meeting_date&order=desc');
  const t = todayIso();
  const rows: any[] = (data?.items || data || []).filter((m: any) => (when === 'upcoming' ? m.meeting_date >= t && m.status === 'scheduled' : m.meeting_date < t || m.status !== 'scheduled'));
  if (when === 'upcoming') rows.reverse();
  return (
    <div className="stack">
      <div className="row wrap"><div className="seg" role="group" aria-label="Meetings">{([['upcoming', 'Upcoming'], ['past', 'Held and past']] as const).map(([k, l]) => <button key={k} aria-pressed={when === k} onClick={() => setWhen(k)}>{l}</button>)}</div>
        <span style={{ flex: 1 }} /><button className="btn btn-primary" onClick={() => openNew('meetings', { status: 'scheduled' })}><Icon name="plus" />Schedule meeting</button></div>
      {!data ? <div className="skeleton" style={{ height: 200 }} /> : rows.length ? (
        <div className="meeting-grid">{rows.map((m) => (
          <button key={m.id} className="meeting-card" onClick={() => open({ kind: 'meeting', id: m.id })}>
            <span className="mc-date">{fmtDate(m.meeting_date)}{m.start_time ? ` · ${t12(m.start_time)}` : ''}</span>
            <span className="mc-title">{m.title}</span>
            <span className="mc-sub">{[m.body, m.venue].filter(Boolean).join(' · ') || '—'}</span>
            <span className="row wrap" style={{ gap: 6 }}><span className="tag st-confirmed">{humanize(m.status)}</span>{m.role && <span className="tag">{humanize(m.role)}</span>}
              {m.status === 'held' && <span className={`tag ${m.minutes_status === 'approved' ? 'st-evidenced' : 'st-self'}`}>Minutes: {m.minutes_status === 'none' ? 'not started' : humanize(m.minutes_status)}</span>}</span>
          </button>
        ))}</div>
      ) : <div className="panel"><div className="panel-body"><div className="empty">No {when === 'upcoming' ? 'upcoming' : 'past'} meetings.</div></div></div>}
    </div>
  );
}

function Secretariat() {
  const { openNew, openRecord } = useApp();
  const { data } = useLoad<any>('/records/secretariat_records?limit=500&sort=updated_at&order=desc');
  const rows: any[] = data?.items || data || [];
  return (
    <div className="stack">
      <div className="row wrap"><p className="muted" style={{ margin: 0, flex: 1, fontSize: 14 }}>Resolutions, certifications, notices and other records you prepare as secretary. Numbers are assigned per type and year when left blank.</p>
        <button className="btn btn-primary" onClick={() => openNew('secretariat_records', { record_type: 'resolution', status: 'draft' })}><Icon name="plus" />New record</button></div>
      {!data ? <div className="skeleton" style={{ height: 200 }} /> : rows.length ? (
        <div className="table-wrap"><table className="table">
          <thead><tr><th>Number</th><th>Title</th><th>Type</th><th>Issuing body</th><th>Date</th><th>Status</th></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.id} onClick={() => openRecord('secretariat_records', r.id)} style={{ cursor: 'pointer' }}>
              <td className="mono"><button className="rowlink" onClick={(e) => { e.stopPropagation(); openRecord('secretariat_records', r.id); }}>{r.record_no || '—'}</button></td>
              <td>{r.title}</td><td>{humanize(r.record_type)}</td><td>{r.issuing_body || '—'}</td><td className="nowrap">{fmtDate(r.record_date) || '—'}</td>
              <td><span className={`tag ${['signed', 'disseminated', 'archived'].includes(r.status) ? 'st-evidenced' : 'st-self'}`}>{humanize(r.status)}</span></td>
            </tr>
          ))}</tbody>
        </table></div>
      ) : <div className="panel"><div className="panel-body"><div className="empty">No secretariat records yet.</div></div></div>}
    </div>
  );
}

function DailyLog() {
  const [to, setTo] = useState(todayIso());
  const from = shift(to, -6);
  const { data } = useLoad<any>(`/admin/log?from=${from}&to=${to}`);
  const [day, setDay] = useState(todayIso());
  const cats = data ? Object.entries(data.by_category as Record<string, any>).sort((a, b) => b[1].entries - a[1].entries) : [];
  return (
    <div className="stack" style={{ gap: 'var(--s-5)' }}>
      <section className="panel"><header className="panel-head"><span className="code">ADD</span><h2>Log an activity</h2>
        <input className="input" type="date" value={day} onChange={(e) => setDay(e.target.value)} aria-label="Date to log" style={{ width: 'auto' }} /></header>
        <div className="panel-body"><QuickLog date={day} /></div></section>
      <div className="row wrap">
        <button className="btn btn-sm" onClick={() => setTo(shift(to, -7))}><Icon name="left" />Previous week</button>
        <span className="label" style={{ margin: 0 }}>{fmtDate(from)} – {fmtDate(to)}</span>
        <button className="btn btn-sm" onClick={() => setTo(shift(to, 7))} disabled={to >= todayIso()}>Next week<Icon name="right" /></button>
      </div>
      {!data ? <div className="skeleton" style={{ height: 200 }} /> : (<>
        {cats.length > 0 && <div className="stat-row">{cats.map(([k, c]) => <div key={k} className="stat"><div className="v">{c.entries}</div><div className="k">{humanize(k)}{c.quantity ? ` · ${plural(c.quantity, 'output')}` : ''}{c.minutes ? ` · ${Math.round(c.minutes / 6) / 10} h` : ''}</div></div>)}</div>}
        {data.days.length ? data.days.map((d: any) => (
          <section key={d.date} className="panel"><header className="panel-head"><h2>{longDay(d.date)}</h2><span className="faint">{d.entries.length}</span></header>
            <div className="panel-body"><LogEntries entries={d.entries} /></div></section>
        )) : <div className="panel"><div className="panel-body"><div className="empty">Nothing logged this week.</div></div></div>}
      </>)}
    </div>
  );
}

function Tasks() {
  const { openNew, openRecord, toast } = useApp();
  const { data } = useLoad<any>('/records/tasks?limit=500&sort=updated_at&order=desc&module=admin');
  const rows: any[] = (data?.items || data || []).filter((t: any) => t.module === 'admin');
  async function setStatus(t: any, status: string) {
    try { await api.patch(`/records/tasks/${t.id}`, { status }); dataChanged(); } catch (e) { toast((e as Error).message, 'error'); }
  }
  const cols: [string, string][] = [['open', 'To do'], ['in_progress', 'In progress'], ['done', 'Done']];
  return (
    <div className="stack">
      <div className="row"><span style={{ flex: 1 }} /><button className="btn btn-primary" onClick={() => openNew('tasks', { module: 'admin' })}><Icon name="plus" />Admin task</button></div>
      <div className="task-board">{cols.map(([k, l]) => {
        const items = rows.filter((t) => t.status === k);
        return (
          <section key={k} className="panel"><header className="panel-head"><h2>{l}</h2><span className="faint">{items.length}</span></header>
            <div className="panel-body">{items.length ? <ul className="list">{items.map((t) => (
              <li key={t.id}>
                <button className="rowlink grow" onClick={() => openRecord('tasks', t.id)}><span className="t">{t.title}</span><span className="s">{[humanize(t.priority), t.due_date && `Due ${fmtDate(t.due_date)}`].filter(Boolean).join(' · ')}</span></button>
                {k !== 'done' && <button className="btn btn-sm btn-ghost" onClick={() => setStatus(t, k === 'open' ? 'in_progress' : 'done')} aria-label={`${k === 'open' ? 'Start' : 'Finish'}: ${t.title}`}>{k === 'open' ? 'Start' : 'Done'}</button>}
              </li>
            ))}</ul> : <div className="empty">None.</div>}</div></section>
        );
      })}</div>
    </div>
  );
}

function Turnover({ open, roleChange }: { open: (o: Open) => void; roleChange: () => void }) {
  const { openNew, profileName } = useApp();
  const { data } = useLoad<any>('/records/turnover_documents?limit=100&sort=updated_at&order=desc');
  const { data: prof } = useLoad<any>('/profile');
  const rows: any[] = data?.items || data || [];
  return (
    <div className="stack" style={{ gap: 'var(--s-5)' }}>
      <section className="panel"><header className="panel-head"><span className="code">ROLE</span><h2>Transfer or new appointment</h2></header>
        <div className="panel-body row wrap">
          <p className="muted" style={{ margin: 0, flex: 1, minWidth: 260, fontSize: 14 }}>Currently: <b>{[prof?.current_position, prof?.current_office].filter(Boolean).join(', ') || 'no position on your profile'}</b>. When you move to another office or receive a faculty appointment, record it here: your profile, employment history and academic mode are updated together{profileName ? '' : ''}.</p>
          <button className="btn btn-primary" onClick={roleChange}><Icon name="sliders" />Record a role change</button></div></section>
      <section className="panel"><header className="panel-head"><span className="code">TO</span><h2>Turnover documentation</h2>
        <button className="btn btn-sm" onClick={() => openNew('turnover_documents', { title: `Turnover — ${prof?.current_office || prof?.current_position || 'Office'}`, office: prof?.current_office || null, position: prof?.current_position || null, status: 'draft' })}><Icon name="plus" />New turnover document</button></header>
        <div className="panel-body">{rows.length ? <ul className="list">{rows.map((d) => (
          <li key={d.id}><span className={`tag ${d.status === 'final' ? 'st-evidenced' : 'st-self'}`}>{humanize(d.status)}</span>
            <button className="rowlink grow" onClick={() => open({ kind: 'turnover', id: d.id })}><span className="t">{d.title}</span><span className="s">{[d.successor_name && `To ${d.successor_name}`, d.effective_date && `Effective ${fmtDate(d.effective_date)}`].filter(Boolean).join(' · ') || 'Successor not named yet'}</span></button></li>
        ))}</ul> : <div className="empty">No turnover documents. Start one when you are about to hand over your office; its lists are compiled from your records.</div>}</div></section>
    </div>
  );
}

export function AdminPage() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab) || 'today';
  const [openItem, setOpen] = useState<Open | null>(null);
  const [role, setRole] = useState(false);
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="crumb"><span className="bar" /><span className="label">Administrative Operations · Overview</span></div>
          <h1 className="display">Administrative Operations</h1>
          <div className="sub">Correspondence, routing, meetings, secretariat records and your daily log — kept lean, beside the academic work.</div>
        </div>
      </div>
      <div className="tabs" role="tablist">{TABS.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => setParams({ tab: k })}>{l}</button>)}</div>
      {tab === 'today' && <Today open={setOpen} />}
      {tab === 'correspondence' && <Correspondence open={setOpen} />}
      {tab === 'follow' && <FollowUps open={setOpen} />}
      {tab === 'meetings' && <Meetings open={setOpen} />}
      {tab === 'secretariat' && <Secretariat />}
      {tab === 'log' && <DailyLog />}
      {tab === 'tasks' && <Tasks />}
      {tab === 'turnover' && <Turnover open={setOpen} roleChange={() => setRole(true)} />}
      {openItem?.kind === 'corr' && <CorrespondenceFile id={openItem.id} onClose={() => setOpen(null)} />}
      {openItem?.kind === 'meeting' && <MeetingWorkspace id={openItem.id} onClose={() => setOpen(null)} />}
      {openItem?.kind === 'turnover' && <TurnoverEditor id={openItem.id} onClose={() => setOpen(null)} />}
      {role && <RoleChange onClose={() => setRole(false)} />}
    </div>
  );
}
