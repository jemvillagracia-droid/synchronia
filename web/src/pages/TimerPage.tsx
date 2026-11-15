import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { formatTime, powerMode, remaining, timer, useTimer } from '../lib/timer';

const PRESETS: [number, string][] = [[5, '5 min'], [15, '15 min'], [25, '25 min'], [50, '50 min'], [90, '90 min'], [120, '2 h']];

/** Live remaining time, redrawn smoothly while running. */
function useRemaining() {
  const s = useTimer();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (s.mode !== 'running') return undefined;
    let raf = 0; let last = 0;
    const loop = (t: number) => { if (t - last > 33) { setNow(Date.now()); last = t; } raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [s.mode]);
  return { s, rem: remaining(s, now) };
}

/** System Timer: a full-screen time control centre in the style of a unit's active-time display. */
export function TimerPage() {
  const { s, rem } = useRemaining();
  const stage = useRef<HTMLDivElement>(null);
  const [full, setFull] = useState(false);
  const [custom, setCustom] = useState('');
  useEffect(() => { const f = () => setFull(!!document.fullscreenElement); document.addEventListener('fullscreenchange', f); return () => document.removeEventListener('fullscreenchange', f); }, []);
  // Keys: Space start/pause, F full screen, R reset; Escape always leaves full screen (the window does not on its own).
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && document.fullscreenElement) { e.preventDefault(); void document.exitFullscreen().catch(() => {}); return; }
      const el = e.target as HTMLElement;
      if (e.ctrlKey || e.metaKey || e.altKey || el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'A'].includes(el.tagName) || document.querySelector('.overlay')) return;
      const s = timer.get();
      if (e.key === ' ') { e.preventDefault(); if (s.mode === 'running') timer.pause(); else timer.start(); }
      else if (e.key === 'f' || e.key === 'F') { e.preventDefault(); void toggleFullRef.current(); }
      else if ((e.key === 'r' || e.key === 'R') && s.mode !== 'running') { e.preventDefault(); timer.reset(); }
    };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }, []);
  const mode = powerMode(s, rem);
  const pct = s.durationMs ? Math.max(0, Math.min(100, (rem / s.durationMs) * 100)) : 0;
  const status = s.mode === 'down' ? 'SYSTEM DOWN' : s.recharge ? 'RECHARGING' : s.mode === 'running' ? 'INTERNAL' : s.mode === 'paused' ? 'HOLD' : 'EXTERNAL';
  const toggleFullRef = useRef(async () => {});
  const toggleFull = async () => { try { if (document.fullscreenElement) await document.exitFullscreen(); else await stage.current?.requestFullscreen(); } catch { /* not allowed: stays in the window */ } };
  toggleFullRef.current = toggleFull;
  return (
    <div className="page timer-page">
      <h1 className="sr-only">System Timer</h1>
      <div ref={stage} className={`tmr ${s.mode} ${mode === 'RACING' ? 'critical' : ''} ${full ? 'is-full' : ''}`}>
        <div className="tmr-hazard" aria-hidden />
        <div className="tmr-frame">
          <div className="tmr-top">
            <div className="tmr-cap"><span className="tmr-cap-1">ACTIVE TIME REMAINING</span><span className="tmr-cap-2">{s.label || 'SYSTEM TIMER'}</span></div>
            <div className={`tmr-status ${status === 'SYSTEM DOWN' ? 'down' : ''}`} role="status" aria-live="polite">
              <b>{status}</b><span>MAIN ENERGY SUPPLY SYSTEM</span>
            </div>
          </div>
          <div className="tmr-digits" role="timer" aria-label={`Time remaining ${Math.ceil(rem / 1000)} seconds`}>
            <span className="ghost" aria-hidden>{formatTime(0).replace(/\d/g, '8')}</span>
            <span className="live" aria-hidden>{formatTime(rem)}</span>
          </div>
          <div className="tmr-bar" aria-hidden><span style={{ width: `${pct}%` }} /></div>
          <div className="tmr-modes" role="group" aria-label={`Power mode: ${mode}`}>
            {['STOP', 'SLOW', 'NORMAL', 'RACING'].map((m) => <span key={m} className={`tmr-mode ${mode === m ? 'on' : ''} m-${m.toLowerCase()}`}>{m}</span>)}
          </div>
        </div>
        <div className="tmr-controls">
          {s.mode === 'running' ? <button className="btn btn-primary" onClick={() => timer.pause()}>Pause</button>
            : <button className="btn btn-primary" onClick={() => timer.start()}>{s.mode === 'paused' ? 'Resume' : s.mode === 'down' ? 'Restart' : 'Start'}</button>}
          <button className="btn" onClick={() => timer.reset()} disabled={s.mode === 'idle' && rem === s.durationMs}>Reset</button>
          <span className="tmr-sep" />
          {PRESETS.map(([m, l]) => <button key={m} className={`btn btn-sm ${s.durationMs === m * 60_000 && !s.recharge ? 'on' : ''}`} onClick={() => timer.setDuration(m * 60_000)} disabled={s.mode === 'running'}>{l}</button>)}
          <form className="row" style={{ gap: 4 }} onSubmit={(e) => { e.preventDefault(); const m = Number(custom); if (m > 0) { timer.setDuration(m * 60_000); setCustom(''); } }}>
            <input className="input select-sm" style={{ width: 92 }} inputMode="numeric" value={custom} onChange={(e) => setCustom(e.target.value.replace(/[^\d.]/g, ''))} placeholder="Minutes" aria-label="Custom minutes" disabled={s.mode === 'running'} />
            <button className="btn btn-sm" disabled={!custom || s.mode === 'running'}>Set</button>
          </form>
          <span className="tmr-sep" />
          <input className="input select-sm" style={{ width: 'min(260px, 60vw)' }} value={s.label} maxLength={120} onChange={(e) => timer.setLabel(e.target.value)} placeholder="What is this time for?" aria-label="Timer label" />
          <button className="btn btn-sm" onClick={() => timer.toggleMute()} aria-pressed={s.muted}>{s.muted ? 'Sound off' : 'Sound on'}</button>
          <button className="btn btn-sm" onClick={toggleFull}><Icon name={full ? 'collapse' : 'expand'} />{full ? 'Exit full screen' : 'Full screen'}</button>
        </div>
        {!full && <p className="faint tmr-note">Keys: Space start or pause · F full screen · R reset · Esc leave full screen. Warnings at 5 minutes and 1 minute; when time runs out, SYNCHRONIA calls a system-down alert wherever you are in the app (and a Windows notification if it is in the background). Plan the session in the <Link to="/calendar">calendar</Link>.</p>}
      </div>
    </div>
  );
}

/** Top-bar readout while the timer runs; opens the System Timer. */
export function TimerChip() {
  const { s, rem } = useRemaining();
  if (s.mode !== 'running' && s.mode !== 'paused' && s.mode !== 'down') return null;
  return (
    <Link to="/timer" className={`tmr-chip ${s.mode} ${rem <= 60_000 && s.mode === 'running' ? 'critical' : ''}`} aria-label={`System Timer: ${s.mode === 'down' ? 'system down' : formatTime(rem)}`}>
      <span className="d">{s.mode === 'down' ? 'DOWN' : formatTime(rem).slice(0, -3)}</span>
    </Link>
  );
}
