import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { formatTime, powerMode, remaining, timer, useTimer } from '../lib/timer';

/** Pilot-sync style monitor: three traces that run while the timer runs, go erratic in the final minute, flatline when down. */
function SyncWave({ state }: { state: 'idle' | 'running' | 'critical' | 'down' | 'paused' }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current; if (!cv) return undefined;
    const g = cv.getContext('2d'); if (!g) return undefined;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.dataset.motion === 'reduced';
    let raf = 0; let phase = 0; let last = performance.now();
    const css = getComputedStyle(cv);
    const colors = [css.getPropertyValue('--tmr-hi').trim() || '#ff9a1a', css.getPropertyValue('--accent').trim() || '#8b5cf6', '#3ddc84'];
    const draw = (now: number) => {
      const dpr = Math.min(2, window.devicePixelRatio || 1); const w = cv.clientWidth; const h = cv.clientHeight;
      if (cv.width !== Math.round(w * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
      g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
      g.strokeStyle = 'rgba(255,255,255,.07)'; g.lineWidth = 1;
      for (let x = 0; x < w; x += 24) { g.beginPath(); g.moveTo(x + 0.5, 0); g.lineTo(x + 0.5, h); g.stroke(); }
      for (let y = 0; y < h; y += 12) { g.beginPath(); g.moveTo(0, y + 0.5); g.lineTo(w, y + 0.5); g.stroke(); }
      const live = state === 'running' || state === 'critical';
      phase += live ? (now - last) / 1000 : 0; last = now;
      const lanes = 3;
      for (let k = 0; k < lanes; k++) {
        const mid = (h / lanes) * (k + 0.5); const amp = h / lanes * (state === 'critical' ? 0.42 : 0.28);
        g.strokeStyle = state === 'down' || state === 'critical' ? '#ff3b3b' : colors[k]; g.lineWidth = 1.6;
        g.beginPath();
        for (let x = 0; x <= w; x += 2) {
          const t = x / w * 6 + phase * (1.4 + k * 0.35);
          let y = mid;
          if (state !== 'down' && state !== 'idle') {
            y += Math.sin(t * (2 + k)) * amp * 0.5 + Math.sin(t * (5.3 + k * 1.7)) * amp * 0.25;
            if (state === 'critical') y += Math.sin(t * 23 + k) * amp * 0.35 * Math.sin(phase * 7);
            if (state === 'paused') y = mid + (y - mid) * 0.3;
          }
          if (x === 0) g.moveTo(x, y); else g.lineTo(x, y);
        }
        g.globalAlpha = 0.25; g.lineWidth = 5; g.stroke(); g.globalAlpha = 1; g.lineWidth = 1.6; g.stroke();
      }
      if (live && !reduced) raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    const ro = new ResizeObserver(() => { cancelAnimationFrame(raf); raf = requestAnimationFrame(draw); }); ro.observe(cv);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, [state]);
  return <canvas ref={ref} className="tmr-wave" aria-hidden />;
}

/** The system backdrop: hex field, a sweeping scan line, rotating target rings and scrolling MAGI readouts. */
function Backdrop({ label }: { label: string }) {
  const lines = ['CORE-01 LOGIC', 'CORE-02 MEMORY', 'CORE-03 INTENT', 'FOCUS FIELD', 'POWER UNIT', 'EXTERNAL CABLE', 'INTERNAL BATTERY', 'NEURAL LINK', 'HARMONICS', 'SYNC CHECK', 'SIGNAL TRACE', 'CORE PRESSURE'];
  const col = (seed: number) => Array.from({ length: 24 }, (_, i) => {
    const n = (i * 37 + seed * 11) % lines.length;
    return `${lines[n]} ${String((i * 73 + seed * 29) % 1000).padStart(3, '0')}.${(i * 7 + seed) % 10}`;
  });
  return (
    <div className="tmr-bg" aria-hidden>
      <div className="tmr-scan" />
      <svg className="tmr-rings" viewBox="0 0 400 400">
        <circle cx="200" cy="200" r="190" className="r1" />
        <circle cx="200" cy="200" r="160" className="r2" />
        <circle cx="200" cy="200" r="126" className="r3" />
        <path d="M200 0v36M200 364v36M0 200h36M364 200h36" className="tick" />
      </svg>
      <div className="tmr-feed left"><div>{[...col(1), ...col(1)].map((l, i) => <span key={i}>{l}</span>)}</div></div>
      <div className="tmr-feed right"><div>{[...col(5), ...col(5)].map((l, i) => <span key={i}>{l}</span>)}</div></div>
      <div className="tmr-corner tl" /><div className="tmr-corner tr" /><div className="tmr-corner bl" /><div className="tmr-corner br" />
      <div className="tmr-tag">SYNCHRONIA TIME CONTROL · {label || 'FOCUS SESSION'}</div>
    </div>
  );
}

const SEGMENTS = 50;

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
  const [soundProblem, setSoundProblem] = useState(false);
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
        <Backdrop label={s.label} />
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
            <span className="live" aria-hidden key={s.mode === 'running' ? Math.floor(rem / 1000) : 'still'}>{formatTime(rem)}</span>
          </div>
          <div className="tmr-segs" aria-hidden>
            {Array.from({ length: SEGMENTS }, (_, i) => <i key={i} className={i < Math.ceil((pct / 100) * SEGMENTS) ? (i < SEGMENTS * 0.1 ? 'on low' : i < SEGMENTS * 0.3 ? 'on mid' : 'on') : ''} />)}
          </div>
          <SyncWave state={s.mode === 'down' ? 'down' : s.mode === 'paused' ? 'paused' : s.mode !== 'running' ? 'idle' : mode === 'RACING' ? 'critical' : 'running'} />
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
          <button className="btn btn-sm" onClick={async () => { if (!(await timer.testSound())) setSoundProblem(true); else setSoundProblem(false); }}>Test sound</button>
          <button className="btn btn-sm" onClick={toggleFull}><Icon name={full ? 'collapse' : 'expand'} />{full ? 'Exit full screen' : 'Full screen'}</button>
        </div>
        {soundProblem && <p className="alert tmr-note" role="alert">No sound could be played. Check that this computer’s volume is up and an output device is connected, and that Settings › Notifications › Sounds is on.</p>}
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
