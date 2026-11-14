import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, onDataChanged } from '../lib/api';
import { CalData, KIND_LABEL, MONTHS, eventsOn, monthGrid, todayIso, weekdayHeaders } from '../lib/calendar';

const addDays = (iso: string, n: number) => { const d = new Date(`${iso}T00:00:00`); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

/** This month plus the next 45 days, shared by the Nexus clock countdown and the calendar monitor. */
export function useCalendar() {
  const now = new Date();
  const today = todayIso();
  const [data, setData] = useState<CalData | null>(null);
  const [ws, setWs] = useState(0);
  const grid = useMemo(() => monthGrid(now.getFullYear(), now.getMonth(), ws), [ws]); // eslint-disable-line react-hooks/exhaustive-deps
  const to = addDays(today, 45) > grid[41] ? addDays(today, 45) : grid[41];
  const load = useCallback(() => { api.get<CalData>(`/calendar?from=${grid[0]}&to=${to}`).then((d) => { setData(d); setWs(d.settings.week_start); }).catch(() => {}); }, [grid, to]);
  useEffect(() => { load(); return onDataChanged(load); }, [load]);
  return { data, grid, ws };
}

/** Nexus calendar monitor: this month at a glance, holidays and the next items. */
export function EvaCalendar({ cal }: { cal: ReturnType<typeof useCalendar> }) {
  const now = new Date();
  const today = todayIso();
  const { data, grid, ws } = cal;
  const upcoming = useMemo(() => {
    if (!data) return [];
    const items = [
      ...data.holidays.filter((h) => h.date >= today).map((h) => ({ date: h.date, label: h.region, cls: h.region.toLowerCase(), title: h.name })),
      ...data.events.filter((e) => e.date >= today && !e.done).map((e) => ({ date: e.date, label: (KIND_LABEL[e.kind] || e.kind).toUpperCase(), cls: `k-${e.kind}`, title: e.title })),
    ];
    return items.sort((a, b) => a.date.localeCompare(b.date)).slice(0, 5);
  }, [data, today]);
  const regions = data ? [data.settings.show_ph && 'PH', data.settings.show_au && `AU-${data.settings.au_state}`].filter(Boolean).join(' · ') || 'NO HOLIDAY CALENDAR' : '';
  return (
    <section className="eva-tile eva-cal" aria-label="Calendar">
      <div className="eva-cap"><span>CALENDAR</span><span className="eva-cap-sub">{MONTHS[now.getMonth()].toUpperCase()} {now.getFullYear()} · {regions}</span></div>
      <div className="eva-cal-grid" aria-hidden>
        {weekdayHeaders(ws).map((d) => <span key={d} className="h">{d.slice(0, 2).toUpperCase()}</span>)}
        {grid.map((d) => {
          const hs = data?.holidays.filter((h) => h.date === d) || [];
          const ev = data ? eventsOn(data.events, d).filter((e) => !e.done) : [];
          return <span key={d} className={`c ${Number(d.slice(5, 7)) - 1 !== now.getMonth() ? 'out' : ''} ${d === today ? 'today' : ''} ${hs.some((h) => h.region === 'PH') ? 'ph' : ''} ${hs.some((h) => h.region === 'AU') ? 'au' : ''} ${ev.length ? 'ev' : ''}`}>{Number(d.slice(8))}</span>;
        })}
      </div>
      <ul className="eva-cal-next">
        {upcoming.length ? upcoming.map((u, i) => (
          <li key={i}><span className="d">{u.date === today ? 'TODAY' : `${MONTHS[Number(u.date.slice(5, 7)) - 1].slice(0, 3).toUpperCase()} ${u.date.slice(8)}`}</span><span className={`k ${u.cls}`}>{u.label}</span><span className="t">{u.title}</span></li>
        )) : <li className="none">Nothing scheduled in the next 45 days.</li>}
      </ul>
      <Link to="/calendar" className="eva-link">OPEN CALENDAR ›</Link>
    </section>
  );
}
