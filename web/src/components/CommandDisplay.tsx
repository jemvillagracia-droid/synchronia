import { EvaCalendar, useCalendar } from './EvaCalendar';
import { CalData, KIND_LABEL, todayIso } from '../lib/calendar';
import { useEffect, useMemo, useState } from 'react';
import dsegUrl from 'dseg/fonts/DSEG7-Classic/DSEG7Classic-BoldItalic.woff2?url';
import { monthName, weekdayName, plural } from '../lib/format';

// Seven-segment LCD face (DSEG, SIL Open Font License), loaded locally.
if (typeof FontFace !== 'undefined') {
  new FontFace('DSEG7', `url(${dsegUrl}) format('woff2')`).load().then((f) => document.fonts.add(f)).catch(() => {});
}

export interface Command {
  deadlines: { overdue: number; due_today: number; due_week: number; level: 'nominal' | 'caution' | 'danger' };
  activity: { days: { date: string; portfolio: number; academic: number; cv: number; other: number }[]; this_week: number; last_week: number; total_30: number };
  workload: { areas: { key: string; label: string; open: number }[]; limits: { caution: number; danger: number } };
  magi: { key: string; name: string; system: string; status: 'ready' | 'review' | 'no_data'; detail: string }[];
}

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    let t: number;
    const tick = () => { setNow(new Date()); t = window.setTimeout(tick, 1000 - (Date.now() % 1000) + 5); };
    t = window.setTimeout(tick, 1000 - (Date.now() % 1000) + 5);
    return () => window.clearTimeout(t);
  }, []);
  return now;
}

function Clock({ d, cal }: { d: Command['deadlines']; cal: CalData | null }) {
  const now = useClock();
  const h = now.getHours() % 12 || 12;
  const pm = now.getHours() >= 12;
  const digits = `${String(h).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
  const lamps: [Command['deadlines']['level'], string][] = [['nominal', 'Nominal'], ['caution', 'Caution'], ['danger', 'Danger']];
  return (
    <section className="eva-tile eva-clock" aria-label="Current date and time">
      <div className="eva-clock-inner">
        <div className="eva-cap"><span>ACTIVE TIME DISPLAY</span><span className="eva-cap-sub">LOCAL · 12-HOUR</span></div>
        <div className="eva-clock-row">
          <div className="eva-ampm" aria-hidden><span className={pm ? '' : 'on'}>AM</span><span className={pm ? 'on' : ''}>PM</span></div>
          <div className="eva-lcd" aria-hidden>
            <span className="ghost">88:88:88</span>
            <span className="live">{digits}</span>
          </div>
        </div>
        <div className="sr-only">{now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true })}</div>
        <div className="eva-date">{weekdayName(now).toUpperCase()} · {now.getDate()} {monthName(now).toUpperCase()} {now.getFullYear()}</div>
        <div className="eva-lamps" role="group" aria-label={`Deadline status: ${d.level}`}>
          {lamps.map(([k, l]) => <span key={k} className={`lamp ${k} ${d.level === k ? 'on' : ''}`} aria-hidden={d.level !== k}>{l}</span>)}
          <span className="eva-lamp-note">{d.overdue} overdue · {d.due_today} due today · {d.due_week} this week</span>
        </div>
        <Countdown cal={cal} />
      </div>
    </section>
  );
}

const SERIES: { key: 'portfolio' | 'academic' | 'cv' | 'other'; label: string; color: string }[] = [
  { key: 'academic', label: 'Academic', color: '#c4a3ff' },
  { key: 'portfolio', label: 'Portfolio', color: '#ff9f43' },
  { key: 'cv', label: 'CV Studio', color: '#e05aa8' },
  { key: 'other', label: 'Other', color: '#6f7cff' },
];

function smooth(points: [number, number][]) {
  if (points.length < 2) return '';
  let p = `M${points[0][0]},${points[0][1]}`;
  for (let i = 1; i < points.length; i += 1) {
    const [x0, y0] = points[i - 1]; const [x1, y1] = points[i]; const mx = (x0 + x1) / 2;
    p += ` C${mx},${y0} ${mx},${y1} ${x1},${y1}`;
  }
  return p;
}

function SyncGraph({ a }: { a: Command['activity'] }) {
  const W = 600, H = 220, PAD = 26;
  const { layers, max } = useMemo(() => {
    const totals = a.days.map((d) => d.portfolio + d.academic + d.cv + d.other);
    const m = Math.max(4, ...totals);
    let base = a.days.map(() => 0);
    const ls = SERIES.map((s) => {
      const top = a.days.map((d, i) => base[i] + d[s.key]);
      const x = (i: number) => PAD + (i * (W - PAD * 2)) / (a.days.length - 1);
      const y = (v: number) => H - PAD - (v / m) * (H - PAD * 2);
      const upper = top.map((v, i) => [x(i), y(v)] as [number, number]);
      const lower = base.map((v, i) => [x(i), y(v)] as [number, number]).reverse();
      const path = `${smooth(upper)} L${lower[0][0]},${lower[0][1]} ${smooth(lower).replace(/^M[^C]*/, '')} Z`;
      base = top;
      return { ...s, path, line: smooth(upper) };
    });
    return { layers: ls, max: m };
  }, [a.days]);
  const delta = a.this_week - a.last_week;
  return (
    <section className="eva-tile eva-sync" aria-label="Synchronization graph: record activity in the last 30 days">
      <div className="eva-cap"><span>SYNCHRONIZATION GRAPH</span><span className="eva-cap-sub">RECORD ACTIVITY · LAST 30 DAYS</span></div>
      <div className="eva-sync-body">
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={`${plural(a.total_30, 'change')} in 30 days; ${a.this_week} this week`}>
          <defs>
            <filter id="glow"><feGaussianBlur stdDeviation="2.4" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
            {layers.map((l) => (
              <linearGradient key={l.key} id={`g-${l.key}`} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor={l.color} stopOpacity=".85" /><stop offset="1" stopColor={l.color} stopOpacity=".15" /></linearGradient>
            ))}
          </defs>
          {Array.from({ length: 9 }).map((_, i) => (
            <line key={i} x1="0" x2={W} y1={PAD + (i * (H - PAD * 2)) / 8} y2={PAD + (i * (H - PAD * 2)) / 8} stroke={i < 4 ? '#6a4bb8' : '#9a3f86'} strokeOpacity=".35" strokeWidth="1" />
          ))}
          {layers.map((l) => <path key={l.key} d={l.path} fill={`url(#g-${l.key})`} />)}
          {layers.map((l) => <path key={`${l.key}-l`} d={l.line} fill="none" stroke="#fff" strokeOpacity=".85" strokeWidth="1.2" filter="url(#glow)" />)}
          <text x={W - 4} y={PAD - 6} textAnchor="end" className="eva-axis">+{max}</text>
          <text x={W - 4} y={H - PAD + 14} textAnchor="end" className="eva-axis">±00</text>
        </svg>
        <div className="eva-readouts">
          <div><span className="eva-num">{String(a.this_week).padStart(3, '0')}</span><span>THIS WEEK</span></div>
          <div><span className="eva-num dim">{String(a.last_week).padStart(3, '0')}</span><span>LAST WEEK</span></div>
          <div><span className={`eva-num ${delta < 0 ? 'neg' : ''}`}>{delta >= 0 ? '+' : '−'}{String(Math.abs(delta)).padStart(2, '0')}</span><span>CHANGE</span></div>
        </div>
      </div>
      <div className="eva-legend">{SERIES.map((s) => <span key={s.key}><i style={{ background: s.color }} />{s.label}</span>)}</div>
    </section>
  );
}

const MAGI_STATUS = { ready: 'READY', review: 'REVIEW', no_data: 'NO DATA' };

function Magi({ m }: { m: Command['magi'] }) {
  const [melchior, balthasar, casper] = [m.find((x) => x.key === 'workspace')!, m.find((x) => x.key === 'portfolio')!, m.find((x) => x.key === 'cv')!];
  const Block = ({ s, cls }: { s: Command['magi'][number]; cls: string }) => (
    <div className={`magi-block ${cls} ${s.status}`} role="group" aria-label={`${s.system}: ${MAGI_STATUS[s.status]}. ${s.detail}`}>
      <div className="magi-name">{s.name}</div>
      <div className="magi-sys">{s.system}</div>
      <div className="magi-status">{MAGI_STATUS[s.status]}</div>
      <div className="magi-detail">{s.detail}</div>
    </div>
  );
  return (
    <section className="eva-tile eva-magi" aria-label="MAGI subsystem status">
      <div className="eva-cap"><span>MAGI SUBSYSTEMS</span><span className="eva-cap-sub">CODE 239 · PRIORITY A</span></div>
      <div className="magi-stage">
        <Block s={balthasar} cls="top" />
        <Block s={casper} cls="left" />
        <Block s={melchior} cls="right" />
        <div className="magi-core">MAGI</div>
      </div>
    </section>
  );
}

function Workload({ w }: { w: Command['workload'] }) {
  const SEG = 20;
  return (
    <section className="eva-tile eva-work" aria-label="Workload level: open tasks by area">
      <div className="eva-cap"><span>WORKLOAD LEVEL</span><span className="eva-cap-sub">OPEN TASKS · CAUTION {w.limits.caution} · DANGER {w.limits.danger}</span></div>
      <div className="work-rows">
        {w.areas.map((a, i) => {
          const lit = Math.min(SEG, a.open * 2);
          const lvl = a.open >= w.limits.danger ? 'danger' : a.open >= w.limits.caution ? 'caution' : 'nominal';
          return (
            <div key={a.key} className="work-row">
              <div className="work-subj"><span>SUBJECT</span><b>{String(i).padStart(2, '0')}</b><em>{a.label}</em></div>
              <div className="work-bar" role="meter" aria-valuemin={0} aria-valuemax={w.limits.danger} aria-valuenow={a.open} aria-label={`${a.label}: ${a.open} open`}>
                {Array.from({ length: SEG }).map((_, j) => <span key={j} className={j < lit ? `on ${lvl}` : ''} />)}
                <i className="mark c" style={{ left: `${(w.limits.caution * 2 / SEG) * 100}%` }} /><i className="mark d" style={{ left: `${(w.limits.danger * 2 / SEG) * 100}%` }} />
              </div>
              <div className={`work-val ${lvl}`}>{a.open}</div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

const dayDiff = (iso: string) => { const t = new Date(); t.setHours(0, 0, 0, 0); return Math.round((new Date(`${iso}T00:00:00`).getTime() - t.getTime()) / 86400000); };

/** "Time remaining" readouts: days to the next open item and to the next holiday. */
function Countdown({ cal }: { cal: CalData | null }) {
  if (!cal) return null;
  const today = todayIso();
  const nextEv = cal.events.filter((e) => e.date >= today && !e.done).sort((a, b) => a.date.localeCompare(b.date))[0];
  const nextHol = cal.holidays.filter((h) => h.date >= today).sort((a, b) => a.date.localeCompare(b.date))[0];
  const cell = (label: string, item: { date: string; title: string; tag: string } | null) => {
    const n = item ? dayDiff(item.date) : null;
    return (
      <div className="eva-count" role="group" aria-label={item ? `${label}: ${item.title}, ${n === 0 ? 'today' : `in ${n} day${n === 1 ? '' : 's'}`}` : `${label}: none`}>
        <div className="eva-count-cap">{label}</div>
        <div className="eva-count-row" aria-hidden>
          <span className="eva-num">{item ? String(Math.min(n!, 999)).padStart(3, '0') : '---'}</span><span className="u">{n === 0 ? 'TODAY' : 'DAYS'}</span>
        </div>
        <div className="eva-count-t">{item ? <><b>{item.tag}</b> {item.title}</> : 'Nothing scheduled'}</div>
      </div>
    );
  };
  return (
    <div className="eva-countdown">
      {cell('NEXT ITEM', nextEv ? { date: nextEv.date, title: nextEv.title, tag: (KIND_LABEL[nextEv.kind] || nextEv.kind).toUpperCase() } : null)}
      {cell('NEXT HOLIDAY', nextHol ? { date: nextHol.date, title: nextHol.name, tag: nextHol.region } : null)}
    </div>
  );
}

/** NERV-style status strip: mode, alert state and synchronization at a glance. */
function StatusStrip({ c, mode }: { c: Command; mode: string }) {
  const lvl = c.deadlines.level;
  const delta = c.activity.this_week - c.activity.last_week;
  return (
    <div className={`eva-status lvl-${lvl}`} role="status" aria-label={`System status: ${lvl}`}>
      <span className="eva-status-id"><i aria-hidden />CENTRAL NEXUS</span>
      <span><b>PATTERN</b>{mode.toUpperCase()}</span>
      <span><b>ALERT</b>{lvl === 'nominal' ? 'NOMINAL' : lvl === 'caution' ? 'CAUTION' : 'DANGER'}{c.deadlines.overdue ? ` · ${c.deadlines.overdue} OVERDUE` : ''}</span>
      <span title="Records added or changed this week (SYNCHRONIA works on this computer only; nothing is synced to a cloud)"><b>ACTIVITY</b>{String(c.activity.this_week).padStart(3, '0')} THIS WEEK · {delta >= 0 ? '+' : ''}{delta}</span>
      <span><b>MAGI</b>{c.magi.filter((m) => m.status === 'ready').length}/3 READY</span>
      {lvl !== 'nominal' && <span className="eva-hazard" aria-hidden />}
    </div>
  );
}

export function CommandDisplay({ c, mode = 'administrative' }: { c: Command; mode?: string }) {
  const cal = useCalendar();
  return (
    <>
      <StatusStrip c={c} mode={mode.replace(/_/g, ' ')} />
      <div className="eva-grid eva-grid-3">
        <Clock d={c.deadlines} cal={cal.data} />
        <EvaCalendar cal={cal} />
        <Magi m={c.magi} />
        <SyncGraph a={c.activity} />
        <Workload w={c.workload} />
      </div>
    </>
  );
}
