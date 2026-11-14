import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, dataChanged, onDataChanged } from '../lib/api';
import { fmtDate, fmtLongDate } from '../lib/format';
import { CalData, Holiday, KIND_LABEL, MONTHS, eventsOn, holidayLabel, monthGrid, todayIso, weekdayHeaders } from '../lib/calendar';
import { useApp } from '../components/AppContext';
import { Icon } from '../components/Icon';
import { Field } from '../components/Field';
import { AutoText } from '../components/AutoText';
import { t12 } from './admin/AdminWorkspaces';

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
  const [ym, setYm] = useState<[number, number]>(() => { const m = /^(\d{4})-(\d{2})$/.exec(params.get('month') || ''); return m ? [Number(m[1]), Number(m[2]) - 1] : [now.getFullYear(), now.getMonth()]; });
  const [sel, setSel] = useState(todayIso());
  const [data, setData] = useState<CalData | null>(null);
  const [moving, setMoving] = useState<Holiday | null>(null);
  const [moveTo, setMoveTo] = useState('');
  const ws = data?.settings.week_start ?? 0;
  const grid = useMemo(() => monthGrid(ym[0], ym[1], ws), [ym, ws]);
  const load = useCallback(() => { api.get<CalData>(`/calendar?from=${grid[0]}&to=${grid[41]}`).then(setData).catch((e) => toast(e.message, 'error')); }, [grid, toast]);
  useEffect(() => { load(); return onDataChanged(load); }, [load]);
  useEffect(() => { setParams({ month: `${ym[0]}-${String(ym[1] + 1).padStart(2, '0')}` }, { replace: true }); }, [ym, setParams]);
  const go = (d: number) => setYm(([y, m]) => { const t = new Date(y, m + d, 1); return [t.getFullYear(), t.getMonth()]; });
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
          <h1 className="display">Calendar</h1>
          <div className="sub">Philippine and Australian public holidays alongside your deadlines, meetings, classes, assessments, trainings and renewals. Every item opens its record.</div>
        </div>
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
                <button key={d} role="gridcell" aria-selected={sel === d} className={`cal-cell ${out ? 'out' : ''} ${d === today ? 'today' : ''} ${wd === 0 || wd === 6 ? 'wkend' : ''} ${hs.some((h) => h.region === 'PH' && h.type === 'regular') ? 'ph-reg' : ''}`}
                  onClick={() => setSel(d)} aria-label={`${longDay(d)}${hs.length ? `, ${hs.map((h) => h.name).join(', ')}` : ''}${es.length ? `, ${es.length} item${es.length > 1 ? 's' : ''}` : ''}`}>
                  <span className="cal-num">{Number(d.slice(8))}</span>
                  {hs.map((h, i) => <span key={i} className={`cal-hol ${h.region.toLowerCase()} ${h.estimated ? 'est' : ''}`}>{h.region} · {h.name}</span>)}
                  {es.slice(0, 3).map((e, i) => <span key={i} className={`cal-ev k-${e.kind} ${e.done ? 'done' : ''}`}>{e.time ? `${t12(e.time)} ` : ''}{e.title}</span>)}
                  {es.length > 3 && <span className="cal-more">+{es.length - 3} more</span>}
                </button>
              );
            })}
            </div>
            ))}
          </div>
          </div>
          <div className="cal-legend"><span><i className="ph" />Philippine holiday</span><span><i className="au" />Australian holiday</span><span><i className="est" />Estimate — set by proclamation</span><span><i className="k-deadline" />Deadline</span><span><i className="k-meeting" />Meeting</span><span><i className="k-class" />Class / assessment</span><span><i className="k-training" />Training / speaking</span></div>
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
            <div className="row wrap">
              <button className="btn btn-sm" onClick={() => openNew('tasks', { due_date: sel, is_deadline: true })}><Icon name="plus" />Deadline</button>
              <button className="btn btn-sm" onClick={() => openNew('meetings', { meeting_date: sel, status: 'scheduled' })}><Icon name="plus" />Meeting</button>
              <button className="btn btn-sm" onClick={() => openNew('trainings', { start_date: sel })}><Icon name="plus" />Training</button>
            </div>
          </div>
        </aside>
      </div>
      <Corrections onChange={load} />
    </div>
  );
}


