import { useEffect, useState } from 'react';
import { api, onDataChanged } from '../lib/api';
import { fmtTime12, fmtLongDate } from '../lib/format';

interface SystemStatus {
  version: string; integrity: 'ok' | string; last_saved_at: string | null;
  last_backup: { file: string; at: string } | null; backups: number; records: number;
}

/** Bottom status bar: save and backup state from the database, and a live 12-hour clock. */
export function StatusBar() {
  const [now, setNow] = useState(() => new Date());
  const [st, setSt] = useState<SystemStatus | null>(null);
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);
  useEffect(() => {
    const load = () => api.get<SystemStatus>('/system/status').then(setSt).catch(() => {});
    load();
    const off = onDataChanged(load);
    const t = setInterval(load, 60_000);
    return () => { off(); clearInterval(t); };
  }, []);
  return (
    <footer className="statusbar" aria-label="Status">
      <span className={st?.integrity === 'ok' ? 'ok' : 'warn'}>{st ? (st.integrity === 'ok' ? '■ DATABASE OK' : '■ DATABASE CHECK FAILED') : '■ …'}</span>
      <span className="grow">
        {st?.last_saved_at ? `Last saved ${fmtTime12(new Date(st.last_saved_at))}` : 'No changes saved yet'}
        <span className="hide-narrow">{st?.last_backup ? ` · Automatic backup: ${st.last_backup.file} (${fmtTime12(new Date(st.last_backup.at))})` : ''}{st ? ` · ${st.records} record${st.records === 1 ? '' : 's'}` : ''}</span>
      </span>
      <span className="clock">{fmtLongDate(now)} · {fmtTime12(now)}</span>
    </footer>
  );
}
