import { useEffect, useState } from 'react';
import { Overlay } from './Overlay';

// A small in-app text question. window.prompt() is not available in the desktop app (Electron does not implement it),
// so anything that needs a short typed answer asks through this instead.
type Ask = { label: string; initial: string; hint?: string; resolve: (v: string | null) => void };
let show: ((a: Ask) => void) | null = null;

/** Ask for a line of text; resolves to the trimmed answer, or null when cancelled. */
export function askText(label: string, initial = '', hint?: string): Promise<string | null> {
  return new Promise((resolve) => { if (show) show({ label, initial, hint, resolve }); else resolve(null); });
}

export function AskTextHost() {
  const [ask, setAsk] = useState<Ask | null>(null);
  const [value, setValue] = useState('');
  useEffect(() => { show = (a) => { setAsk(a); setValue(a.initial); }; return () => { show = null; }; }, []);
  if (!ask) return null;
  const done = (v: string | null) => { ask.resolve(v === null ? null : v.trim()); setAsk(null); };
  return (
    <Overlay onClose={() => done(null)} label={ask.label}>
      <form className="modal" style={{ width: 'min(520px, calc(100vw - 32px))' }} onSubmit={(e) => { e.preventDefault(); if (value.trim()) done(value); }}>
        <div className="modal-head"><h2 style={{ fontSize: 17 }}>{ask.label}</h2></div>
        <div className="modal-body stack">
          <input className="input" data-autofocus value={value} maxLength={500} onChange={(e) => setValue(e.target.value)} aria-label={ask.label}
            onKeyDown={(e) => { if (e.key === 'Enter' && value.trim()) { e.preventDefault(); done(value); } }} />
          {ask.hint && <div className="faint" style={{ fontSize: 12.5 }}>{ask.hint}</div>}
        </div>
        <div className="modal-foot"><span style={{ flex: 1 }} />
          <button type="button" className="btn btn-ghost" onClick={() => done(null)}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={!value.trim()}>OK</button></div>
      </form>
    </Overlay>
  );
}
