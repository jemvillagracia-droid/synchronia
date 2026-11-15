import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Overlay } from './Overlay';
import { timer } from '../lib/timer';

/** App-wide System Timer alerts: a warning strip at the warning marks, and a system-down pop-up when time is out. */
export function TimerAlerts() {
  const [warn, setWarn] = useState<number | null>(null);
  const [down, setDown] = useState(false);
  const navigate = useNavigate();
  useEffect(() => timer.onAlert((a) => {
    if (a.kind === 'down') { setWarn(null); setDown(true); }
    else { setWarn(a.remainingMs); window.setTimeout(() => setWarn((w) => (w === a.remainingMs ? null : w)), 9000); }
  }), []);
  const label = timer.get().label;
  return (
    <>
      {warn !== null && (
        <div className="tmr-warn" role="alert">
          <span className="tmr-warn-stripes" aria-hidden />
          <b>WARNING</b><span>INTERNAL POWER: {warn / 60_000} MINUTE{warn === 60_000 ? '' : 'S'} REMAINING{label ? ` — ${label}` : ''}</span>
          <button className="btn btn-sm" onClick={() => { setWarn(null); navigate('/timer'); }}>Open timer</button>
          <button className="icon-btn sm" aria-label="Dismiss warning" onClick={() => setWarn(null)}>×</button>
        </div>
      )}
      {down && (
        <Overlay onClose={() => setDown(false)} label="System down">
          <div className="modal tmr-down">
            <div className="tmr-down-stripes" aria-hidden />
            <div className="modal-body stack" style={{ textAlign: 'center' }}>
              <div className="tmr-down-title">SYSTEM DOWN</div>
              <div className="tmr-down-sub">INTERNAL POWER DEPLETED — RECHARGE REQUIRED</div>
              {label && <div className="faint">{label}</div>}
              <div className="row wrap" style={{ justifyContent: 'center', gap: 8 }}>
                <button className="btn btn-primary" data-autofocus onClick={() => { timer.recharge(5 * 60_000); setDown(false); }}>Recharge — 5 min break</button>
                <button className="btn" onClick={() => { timer.recharge(15 * 60_000); setDown(false); }}>15 min break</button>
                <button className="btn" onClick={() => { timer.start(); setDown(false); }}>Restart</button>
                <button className="btn btn-ghost" onClick={() => { timer.reset(); setDown(false); }}>Dismiss</button>
              </div>
            </div>
            <div className="tmr-down-stripes" aria-hidden />
          </div>
        </Overlay>
      )}
    </>
  );
}
