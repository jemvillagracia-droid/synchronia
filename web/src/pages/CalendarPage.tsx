import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, dataChanged, onDataChanged } from '../lib/api';
import { fmtDate, fmtLongDate, t12 } from '../lib/format';
import { CalData, Holiday, KIND_LABEL, MONTHS, eventsOn, holidayLabel, monthGrid, todayIso, weekdayHeaders } from '../lib/calendar';
import { useApp } from '../components/AppContext';
import { Icon } from '../components/Icon';
import { Field } from '../components/Field';
import { AutoText } from '../components/AutoText';
import { SchoolCalendarImport } from '../components/SchoolCalendarImport';

const longDay = (iso: string) => fmtLongDate(new Date(`${iso}T00:00:00`));

function Corrections({ onChange }: { onChange: () => void }) {
  const { toast } = useApp();
  const [list, setList] = useState<any[] | null>(null);
  const [v, setV] = useState({ region: 'PH', date: todayIso(), name: '', holiday_type: 'special', note: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const load = useCallback(() => { api.get<any[]>('/calendar/holidays/corrections').then(setList); }, []);
  useEffect(() => { load(); return onDataChanged(load); }, [load]);
  async function add() {
    setErrors({});
    try { await api.post('/calendar/holidays', { ...v, holiday_type: v.region === 'AU' ? 'public' : v.holiday_type }); toast(`Added ${v.name}`, 'ok'); setV({ ...v, name: '', note: '' }); dataChanged(); onChange(); }
    catch (e: any) { setErrors(e.details || {}); if (!e.details) toast(e.message, 'error'); }
  }
  async function remove(id: number) { await api.del(`/calendar/holidays/corrections/${id}`); dataChanged(); onChange(); }
  return (
    <section className="panel"><header className="panel-head"><span className="code">PROC</span><h2>Proclamations and corrections</h2></header>
      <div className="panel-body stack">
        <p className="muted" style={{ margin: 0, fontSize: 13.5 }}>Holidays are computed from the law for every year. Some dates are fixed each year by proclamation — Eid’l Fitr and Eid’l Adha in the Philippines, Western Australia’s King’s Birthday — and are marked <b>estimate</b> until you confirm them. Add declared special days here, or move an estimated holiday from its day in the calendar.</p>
        <div className="form-grid">
          <Field label="Calendar"><select className="select" value={v.region} onChange={(e) => setV({ ...v, region: e.target.value })}><option value="PH">Philippines</option><option value="AU">Australia</option></select></Field>
          <Field label="Date" error={errors.date}><input className="input" type="date" value={v.date} onChange={(e) => setV({ ...v, date: e.target.value })} /></Field>
          <Field label="Name" required error={errors.name}><AutoText value={v.name} onChange={(x) => setV({ ...v, name: x })} placeholder="e.g. Special non-working day (Proclamation No. …)" /></Field>
          {v.region === 'PH' && <Field label="Type"><select className="select" value={v.holiday_type} onChange={(e) => setV({ ...v, holiday_type: e.target.value })}><option value="regular">Regular holiday</option><option value="special">Special non-working day</option><option value="special_working">Special working day</option></select></Field>}
          <Field label="Note" className="span-2"><AutoText value={v.note} onChange={(x) => setV({ ...v, note: x })} placeholder="e.g. Proclamation number or local declaration" /></Field>
        </div>
        <div><button className="btn btn-primary btn-sm" onClick={add} disabled={!v.name.trim()}><Icon name="plus" />Add to calendar</button></div>
        {list && list.length > 0 && (
          <ul className="list">{list.map((o) => (
            <li key={o.id}><span className={`tag ${o.action === 'add' ? 'st-evidenced' : 'st-system'}`}>{o.region} · {o.action === 'add' ? 'Added' : 'Hidden'}</span>
              <span className="grow"><span className="t">{o.name}</span><span className="s">{fmtDate(o.date)}{o.note ? ` · ${o.note}` : ''}</span></span>
              <button className="btn btn-sm btn-ghost" onClick={() => remove(o.id)}><Icon name="restore" />Undo</button></li>
          ))}</ul>
        )}
      </div>
    </section>
  );
}

export function CalendarPage() {
  const { openRecord, openNew, toast } = useApp();
  const [params, setParams] = useSearchParams();
  const now = new Date();
  const [ym, setYm] = useState<[number, number]>(() => { const m = /^(\d{4})-(\d{2})/.exec(params.get('month') || params.get('date') || ''); return m ? [Number(m[1]), Number(m[2]) - 1] : [now.getFullYear(), now.getMonth()]; });
  const asked = /^\d{4}-\d{2}-\d{2}$/.test(params.get('date') || '') ? params.get('date')! : null;
  const [sel, setSel] = useState(asked || todayIso());
  const [focusEntry] = useState(() => params.get('add') === '1'); // read once: the month sync below rewrites the URL
  const [data, setData] = useState<CalData | null>(null);
  const [moving, setMoving] = useState<Holiday | null>(null);
  const [moveTo, setMoveTo] = useState('');
  const [importing, setImporting] = useState(false);
  const ws = data?.settings.week_start ?? 0;
  const grid = useMemo(() => monthGrid(ym[0], ym[1], ws), [ym, ws]);
  // Only the latest request may fill the grid: an earlier month's answer arriving late must not replace this one.
  const latest = useRef(0);
  const load = useCallback(() => {
    const n = ++latest.current;
    api.get<CalData>(`/calendar?from=${grid[0]}&to=${grid[41]}`).then((d) => { if (n === latest.current) setData(d); }).catch((e) => { if (n === latest.current) toast(e.message, 'error'); });
  }, [grid, toast]);
  useEffect(() => { load(); return onDataChanged(load); }, [load]);
  useEffect(() => { setParams({ month: `${ym[0]}-${String(ym[1] + 1).padStart(2, '0')}` }, { replace: true }); }, [ym, setParams]);
  // Changing month selects its first day (or today, in the current month), so the day panel matches the grid.
  const go = (d: number) => {
    const t = new Date(ym[0], ym[1] + d, 1);
    setYm([t.getFullYear(), t.getMonth()]);
    const td = new Date();
    setSel(t.getFullYear() === td.getFullYear() && t.getMonth() === td.getMonth() ? todayIso() : `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-01`);
  };
  async function setting(patch: Record<string, any>) { await api.put('/calendar/settings', patch); load(); }
  async function hide(h: Holiday) {
    if (!window.confirm(`Hide “${h.name}” on ${longDay(h.date)}? You can undo this under Proclamations and corrections.`)) return;
    await api.post('/calendar/holidays/hide', { region: h.region, date: h.date, name: h.name }); dataChanged(); load();
  }
  async function move() {
    if (!moving || !moveTo) return;
    try { await api.post('/calendar/holidays', { region: moving.region, date: moveTo, name: moving.name, holiday_type: moving.type, note: 'Date confirmed by proclamation', replaces: { date: moving.date, name: moving.name } }); toast(`${moving.name} moved to ${fmtDate(moveTo)}`, 'ok'); setMoving(null); dataChanged(); load(); }
    catch (e) { toast((e as Error).message, 'error'); }
  }
  const today = todayIso();
  const month = ym[1];
  const hol = (d: string) => (data?.holidays || []).filter((h) => h.date === d);
  const dayHol = hol(sel);
  const dayEv = data ? eventsOn(data.events, sel) : [];

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="crumb"><span className="bar" /><span className="label">Command Center · Academic Calendar</span></div>
          <h1 className="display">Academic Calendar</h1>
          <div className="sub">Your school calendar, Philippine and Australian public holidays, deadlines, meetings, classes, assessments, trainings and renewals. Every item opens its record.</div>
        </div>
        <button className="btn btn-primary" onClick={() => setImporting(true)}><Icon name="upload" />Import school calendar</button>
      </div>
      {data && (
        <div className="row wrap cal-controls">
          <div className="seg" role="group" aria-label="Holiday calendars">
            <button aria-pressed={data.settings.show_ph} onClick={() => setting({ show_ph: !data.settings.show_ph })}>Philippines</button>
            <button aria-pressed={data.settings.show_au} onClick={() => setting({ show_au: !data.settings.show_au })}>Australia</button>
          </div>
          {data.settings.show_au && <select className="select" style={{ width: 'auto' }} value={data.settings.au_state} onChange={(e) => setting({ au_state: e.target.value })} aria-label="Australian state or territory">
            {Object.entries(data.settings.au_states).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>}
          <div className="seg" role="group" aria-label="Week starts on"><button aria-pressed={ws === 0} onClick={() => setting({ week_start: 0 })}>Sun</button><button aria-pressed={ws === 1} onClick={() => setting({ week_start: 1 })}>Mon</button></div>
          <span style={{ flex: 1 }} />
          <button className="btn btn-sm" onClick={() => go(-1)} aria-label="Previous month"><Icon name="left" /></button>
          <span className="cal-month" aria-live="polite">{MONTHS[month]} {ym[0]}</span>
          <button className="btn btn-sm" onClick={() => go(1)} aria-label="Next month"><Icon name="right" /></button>
          <button className="btn btn-sm" onClick={() => { setYm([now.getFullYear(), now.getMonth()]); setSel(today); }}>Today</button>
        </div>
      )}
      <div className="cal-layout">
        <section className="cal-month-grid" aria-label={`${MONTHS[month]} ${ym[0]}`}>
          <div role="grid" aria-label={`${MONTHS[month]} ${ym[0]}`} className="cal-gridwrap">
          <div className="cal-head" role="row">{weekdayHeaders(ws).map((d) => <div key={d} role="columnheader">{d}</div>)}</div>
          <div className="cal-cells">
            {Array.from({ length: Math.ceil(grid.length / 7) }, (_, w) => grid.slice(w * 7, w * 7 + 7)).map((week) => (
            <div role="row" key={week[0]} className="cal-week">
            {week.map((d) => {
              const hs = hol(d); const es = data ? eventsOn(data.events, d) : [];
              const out = Number(d.slice(5, 7)) - 1 !== month;
              const wd = new Date(`${d}T00:00:00`).getDay();
              return (
                <button key={d} role="gridcell" aria-selected={sel === d} className={`cal-cell ${out ? 'out' : ''} ${d === today ? 'today' : ''} ${wd === 0 || wd === 6 ? 'wkend' : ''} ${hs.some((h) => h.region === 'PH' && h.type === 'regular') ? 'ph-reg' : ''} ${es.some((e) => e.no_classes) ? 'no-classes' : ''}`}
                  onClick={() => setSel(d)} aria-label={`${longDay(d)}${hs.length ? `, ${hs.map((h) => h.name).join(', ')}` : ''}${es.length ? `, ${es.length} item${es.length > 1 ? 's' : ''}` : ''}`}>
                  <span className="cal-num">{Number(d.slice(8))}</span>
                  {hs.map((h, i) => <span key={i} className={`cal-hol ${h.region.toLowerCase()} ${h.estimated ? 'est' : ''}`}>{h.region} · {h.name}</span>)}
                  {es.slice(0, 3).map((e, i) => <span key={i} className={`cal-ev k-${e.kind} ${e.school_kind ? `sk-${e.school_kind}` : ''} ${e.done ? 'done' : ''}`}>{e.time ? `${t12(e.time)} ` : ''}{e.title}</span>)}
                  {es.length > 3 && <span className="cal-more">+{es.length - 3} more</span>}
                </button>
              );
            })}
            </div>
            ))}
          </div>
          </div>
          <div className="cal-legend"><span><i className="ph" />Philippine holiday</span><span><i className="au" />Australian holiday</span><span><i className="est" />Estimate — set by proclamation</span><span><i className="k-deadline" />Deadline</span><span><i className="k-meeting" />Meeting</span><span><i className="k-class" />Class / assessment</span><span><i className="k-training" />Training / speaking</span><span><i className="k-research" />Research milestone</span><span><i className="k-school" />School calendar</span><span><i className="no-classes" />No classes</span></div>
        </section>
        <aside className="panel cal-day" aria-label={`Agenda for ${longDay(sel)}`}>
          <header className="panel-head"><span className="code">DAY</span><h2>{longDay(sel)}</h2></header>
          <div className="panel-body stack">
            {dayHol.map((h, i) => (
              <div key={i} className={`cal-day-hol ${h.region.toLowerCase()}`}>
                <div className="t">{h.name}</div>
                <div className="s">{h.region === 'PH' ? 'Philippines' : `Australia · ${data?.settings.au_states[h.state || ''] || h.state}`} · {holidayLabel(h)}{h.source === 'you' ? ' · added by you' : ''}</div>
                {(h.estimated || h.note) && <div className="s">{h.estimated ? 'Estimate — ' : ''}{h.note}</div>}
                {h.source !== 'you' && (
                  <div className="row wrap mt-2">
                    {h.estimated && <button className="btn btn-sm" onClick={() => { setMoving(h); setMoveTo(h.date); }}><Icon name="edit" />Set the proclaimed date</button>}
                    <button className="btn btn-sm btn-ghost" onClick={() => hide(h)}><Icon name="eye" />Hide</button>
                  </div>
                )}
                {moving === h && (
                  <div className="row wrap mt-2"><input className="input" type="date" value={moveTo} onChange={(e) => setMoveTo(e.target.value)} aria-label="Proclaimed date" style={{ width: 'auto' }} />
                    <button className="btn btn-primary btn-sm" onClick={move}>Save</button><button className="btn btn-ghost btn-sm" onClick={() => setMoving(null)}>Cancel</button></div>
                )}
              </div>
            ))}
            {dayEv.length ? (
              <ul className="list">{dayEv.map((e, i) => (
                <li key={i}><span className={`tag cal-kind k-${e.kind}`}>{KIND_LABEL[e.kind] || e.kind}</span>
                  <button className="rowlink grow" onClick={() => openRecord(e.type, e.id)}><span className="t" style={{ textDecoration: e.done ? 'line-through' : undefined }}>{e.title}</span>
                    <span className="s">{[e.time && `${t12(e.time)}${e.end_time ? `–${t12(e.end_time)}` : ''}`, e.end_date && `until ${fmtDate(e.end_date)}`, e.detail].filter(Boolean).join(' · ')}</span></button></li>
              ))}</ul>
            ) : !dayHol.length && <div className="empty">Nothing on this day.</div>}
            <QuickEntry date={sel} focus={focusEntry} onAdded={load} />
            <div className="row wrap">
              <span className="faint" style={{ fontSize: 12.5 }}>More detail:</span>
              <button className="btn btn-sm" onClick={() => openNew('tasks', { due_date: sel, is_deadline: true })}><Icon name="plus" />Deadline</button>
              <button className="btn btn-sm" onClick={() => openNew('meetings', { meeting_date: sel, status: 'scheduled' })}><Icon name="plus" />Meeting</button>
              <button className="btn btn-sm" onClick={() => openNew('trainings', { start_date: sel })}><Icon name="plus" />Training</button>
            </div>
          </div>
        </aside>
      </div>
      <Corrections onChange={load} />
      {importing && <SchoolCalendarImport onClose={() => setImporting(false)} onSaved={(first) => {
        setImporting(false);
        if (first) { setYm([Number(first.slice(0, 4)), Number(first.slice(5, 7)) - 1]); setSel(first); } // show where the school year begins (the new month loads itself)
        else load();
      }} />}
    </div>
  );
}



/** Add an entry to the selected day in one line: title, kind and (optionally) a time. */
function QuickEntry({ date, focus, onAdded }: { date: string; focus: boolean; onAdded: () => void }) {
  const { toast } = useApp();
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<'task' | 'deadline' | 'meeting' | 'training'>('task');
  const [time, setTime] = useState('');
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  // Opened from a day on the Central Nexus: put the cursor in the entry box (after the page settles its own focus).
  useEffect(() => { if (!focus) return; const t = window.setTimeout(() => input.current?.focus(), 120); return () => window.clearTimeout(t); }, [focus, date]);
  async function add(e: React.FormEvent) {
    e.preventDefault();
    const t = title.trim();
    if (!t) return;
    setBusy(true);
    try {
      if (kind === 'meeting') await api.post('/records/meetings', { title: t, meeting_date: date, start_time: time || null, status: 'scheduled' });
      else if (kind === 'training') await api.post('/records/trainings', { title: t, start_date: date, end_date: date });
      else await api.post('/records/tasks', { title: t, due_date: date, is_deadline: kind === 'deadline', status: 'open', priority: 'normal', module: 'general', notes: time ? `Time: ${time}` : null });
      setTitle(''); setTime(''); dataChanged(); onAdded();
      toast(`Added to ${date}`, 'ok');
    } catch (err) { toast((err as Error).message, 'error'); } finally { setBusy(false); }
  }
  return (
    <form className="cal-quick" onSubmit={add} aria-label={`Add an entry on ${date}`}>
      <input ref={input} className="input" value={title} maxLength={500} onChange={(e) => setTitle(e.target.value)} placeholder="Add an entry on this day…" aria-label="Entry title" />
      <div className="row" style={{ gap: 6 }}>
        <select className="select select-sm" value={kind} onChange={(e) => setKind(e.target.value as any)} aria-label="Kind of entry">
          <option value="task">Task</option><option value="deadline">Deadline</option><option value="meeting">Meeting</option><option value="training">Training / event</option>
        </select>
        <input className="input select-sm" type="time" value={time} onChange={(e) => setTime(e.target.value)} aria-label="Time (optional)" style={{ width: 120 }} />
        <button className="btn btn-sm btn-primary" disabled={busy || !title.trim()}><Icon name="plus" />Add</button>
      </div>
    </form>
  );
}
