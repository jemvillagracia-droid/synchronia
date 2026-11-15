// Import the school's academic calendar: SYNCHRONIA reads every date from the file (PDF, Word, Excel, CSV or pasted
// text), shows what it read, and puts the dates you keep on the Academic Calendar. Each import can be removed as one.
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, dataChanged, uploadFile } from '../lib/api';
import { fmtDate, plural } from '../lib/format';
import { Overlay } from './Overlay';
import { Icon } from './Icon';
import { useApp } from './AppContext';

type Kind = 'term' | 'exam' | 'holiday' | 'break' | 'enrollment' | 'deadline' | 'event';
interface Item { start_date: string; end_date: string | null; title: string; kind: Kind; no_classes: boolean; notes: string[]; source: string; already: boolean; keep?: boolean }
interface Read { file_name: string | null; school_year: string | null; items: Item[]; unread: string[] }
interface Imported { id: number; file_name: string | null; school_year: string | null; created_at: string; items: number; first_date: string; last_date: string }

export const SCHOOL_KIND_LABEL: Record<Kind, string> = { term: 'Classes', exam: 'Examinations', holiday: 'Holiday', break: 'Break', enrollment: 'Enrolment', deadline: 'Deadline', event: 'School event' };
const CALENDAR_FILES = { ext: /\.(pdf|docx|xlsx|csv|txt)$/i, maxMb: 30,
  refuse: 'cannot be read. Use the PDF, Word (.docx), Excel (.xlsx), CSV or text file of the calendar — a picture or photo of a calendar cannot be read; paste its text instead.' };
const ACCEPT = '.pdf,.docx,.xlsx,.csv,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv,text/plain';

export function SchoolCalendarImport({ onClose, onSaved }: { onClose: () => void; onSaved: (firstDate: string) => void }) {
  const { toast } = useApp();
  const [read, setRead] = useState<Read | null>(null);
  const [busy, setBusy] = useState<'' | 'reading' | 'saving'>('');
  const [error, setError] = useState('');
  const [paste, setPaste] = useState('');
  const [over, setOver] = useState(false);
  const [imports, setImports] = useState<Imported[] | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const loadImports = useCallback(() => { api.get<Imported[]>('/calendar/imports').then(setImports).catch(() => setImports([])); }, []);
  useEffect(loadImports, [loadImports]);

  const accept = (r: Read) => setRead({ ...r, items: r.items.map((i) => ({ ...i, keep: !i.already })) });
  async function readFile(f: File) {
    setError(''); setBusy('reading');
    try { accept(await uploadFile<Read>('/calendar/import/read', f, CALENDAR_FILES)); } catch (e) { setError((e as Error).message); } finally { setBusy(''); }
  }
  async function readText() {
    setError(''); setBusy('reading');
    try { accept({ ...(await api.post<Read>('/calendar/import/read-text', { text: paste })), file_name: 'Pasted text' }); } catch (e) { setError((e as Error).message); } finally { setBusy(''); }
  }
  const patch = (i: number, p: Partial<Item>) => setRead((r) => r && { ...r, items: r.items.map((x, k) => (k === i ? { ...x, ...p } : x)) });
  const kept = read?.items.filter((i) => i.keep) || [];
  const invalid = kept.some((i) => !i.title.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(i.start_date) || (i.end_date && i.end_date < i.start_date));
  async function save() {
    if (!read) return;
    setBusy('saving');
    try {
      const r = await api.post<{ saved: number; first_date: string }>('/calendar/import', { file_name: read.file_name, school_year: read.school_year, items: kept.map(({ keep, already, notes, ...x }) => x) });
      toast(`${plural(r.saved, 'date')} added to the Academic Calendar`, 'ok');
      dataChanged(); onSaved(r.first_date);
    } catch (e) { toast((e as Error).message, 'error'); setBusy(''); }
  }
  async function removeImport(im: Imported) {
    if (!window.confirm(`Remove the ${plural(im.items, 'date')} imported from “${im.file_name || 'the school calendar'}”? They go to the recycle bin.`)) return;
    try { const r = await api.del<{ removed: number }>(`/calendar/imports/${im.id}`); toast(`${plural(r.removed, 'date')} removed`, 'ok'); dataChanged(); loadImports(); }
    catch (e) { toast((e as Error).message, 'error'); }
  }
  const all = (on: boolean) => setRead((r) => r && { ...r, items: r.items.map((x) => ({ ...x, keep: on && !x.already })) });

  return (
    <Overlay onClose={() => busy !== 'saving' && onClose()} label="Import school calendar">
      <aside className="drawer wide sci">
        <div className="modal-head"><span className="label">Academic Calendar · Import school calendar</span><span style={{ flex: 1 }} />
          <button className="icon-btn sm" onClick={onClose} aria-label="Close" disabled={busy === 'saving'}><Icon name="close" /></button></div>
        {!read ? (
          <div className="modal-body stack" style={{ gap: 'var(--s-4)' }}>
            <div>
              <h2 className="display" style={{ fontSize: 28, margin: 0 }}>Import your school calendar</h2>
              <p className="muted" style={{ margin: '6px 0 0' }}>Choose the academic calendar your school released. SYNCHRONIA reads every date in it — single days, ranges such as “Aug 12–16”, and dates under month headings — and puts them on the calendar. Missing years are taken from the school year (for example “SY 2026–2027”). You see everything it read before anything is saved.</p>
            </div>
            <button type="button" className={`sci-drop ${over ? 'over' : ''}`} onClick={() => file.current?.click()} disabled={!!busy}
              onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
              onDrop={(e) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files?.[0]; if (f) void readFile(f); }}>
              <Icon name="upload" />
              <b>{busy === 'reading' ? 'Reading the calendar…' : 'Choose or drop the calendar file'}</b>
              <span className="faint">PDF, Word (.docx), Excel (.xlsx), CSV or text</span>
            </button>
            <input ref={file} type="file" hidden accept={ACCEPT} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void readFile(f); }} />
            <details className="sci-paste">
              <summary>Or paste the calendar text (from an email, a web page or a scanned copy you typed out)</summary>
              <textarea className="textarea" rows={6} value={paste} onChange={(e) => setPaste(e.target.value)} placeholder={'SY 2026–2027\nAugust 10, 2026 — Opening of Classes\nOctober 19–24 — Midterm Examinations'} aria-label="Calendar text" />
              <div><button className="btn btn-sm" onClick={readText} disabled={!paste.trim() || !!busy}>Read the text</button></div>
            </details>
            {error && <div className="alert" role="alert">{error}</div>}
            {imports && imports.length > 0 && (
              <section className="stack" style={{ gap: 6 }}>
                <h3 className="label" style={{ margin: 0 }}>Imported calendars</h3>
                <ul className="list">{imports.map((im) => (
                  <li key={im.id} className="row" style={{ gap: 8 }}>
                    <span className="grow"><span className="t">{im.file_name || 'School calendar'}{im.school_year ? ` · SY ${im.school_year}` : ''}</span>
                      <span className="s">{plural(im.items, 'date')} · {fmtDate(im.first_date)} to {fmtDate(im.last_date)} · imported {fmtDate(im.created_at.slice(0, 10))}</span></span>
                    <button className="btn btn-sm btn-ghost" onClick={() => removeImport(im)}><Icon name="trash" />Remove these dates</button>
                  </li>))}</ul>
              </section>
            )}
          </div>
        ) : (
          <>
            <div className="modal-body stack" style={{ gap: 'var(--s-3)' }}>
              <div>
                <h2 className="display" style={{ fontSize: 28, margin: 0 }}>Check the dates</h2>
                <p className="muted" style={{ margin: '6px 0 0' }}>{plural(read.items.length, 'date')} read from <b>{read.file_name || 'the calendar'}</b>{read.school_year ? <> · School year <b>{read.school_year}</b> (dates written without a year are placed in it: June to December in {read.school_year.slice(0, 4)}, January to May in {read.school_year.slice(-4)})</> : ' · no school year was found, so dates without a year are marked to check'}. Edit anything that is not right, untick what you do not need, then save.</p>
              </div>
              <div className="row wrap" style={{ gap: 8 }}>
                <button className="btn btn-sm" onClick={() => all(true)}>Select all</button>
                <button className="btn btn-sm" onClick={() => all(false)}>Select none</button>
                {read.items.some((i) => i.notes.length) && <span className="faint" style={{ fontSize: 13 }}><span className="tag st-system">Check</span> marks a date worth a second look.</span>}
              </div>
              <div className="sci-table" role="table" aria-label="Dates read from the calendar">
                <div className="sci-row sci-th" role="row"><span role="columnheader"><span className="sr-only">Keep</span></span><span role="columnheader">Date</span><span role="columnheader">Until</span><span role="columnheader">What</span><span role="columnheader">Type</span><span role="columnheader">No classes</span></div>
                {read.items.map((it, i) => (
                  <div key={i} className={`sci-row ${it.keep ? '' : 'off'}`} role="row">
                    <span role="cell"><input type="checkbox" className="check" checked={!!it.keep} onChange={(e) => patch(i, { keep: e.target.checked })} aria-label={`Keep ${it.title}`} /></span>
                    <span role="cell"><input type="date" className="input select-sm" value={it.start_date} onChange={(e) => patch(i, { start_date: e.target.value })} aria-label={`Date of ${it.title}`} /></span>
                    <span role="cell"><input type="date" className="input select-sm" value={it.end_date || ''} min={it.start_date} onChange={(e) => patch(i, { end_date: e.target.value || null })} aria-label={`Last day of ${it.title}`} /></span>
                    <span role="cell" className="sci-what">
                      <input className="input select-sm" value={it.title} maxLength={300} onChange={(e) => patch(i, { title: e.target.value })} aria-label="What" />
                      <span className="sci-src" title={it.source}>{it.already && <span className="tag st-evidenced">Already in your calendar</span>}{it.notes.map((n) => <span key={n} className="tag st-system" title={n}>Check: {n}</span>)}<span className="faint">“{it.source}”</span></span>
                    </span>
                    <span role="cell"><select className="select select-sm" value={it.kind} onChange={(e) => patch(i, { kind: e.target.value as Kind })} aria-label={`Type of ${it.title}`}>
                      {(Object.keys(SCHOOL_KIND_LABEL) as Kind[]).map((k) => <option key={k} value={k}>{SCHOOL_KIND_LABEL[k]}</option>)}</select></span>
                    <span role="cell"><input type="checkbox" className="check" checked={it.no_classes} onChange={(e) => patch(i, { no_classes: e.target.checked })} aria-label={`No classes on ${it.title}`} /></span>
                  </div>
                ))}
              </div>
              {read.unread.length > 0 && (
                <details><summary className="faint">{plural(read.unread.length, 'line')} had a date that could not be placed — add these by hand if needed</summary>
                  <ul className="faint" style={{ fontSize: 13 }}>{read.unread.map((l, i) => <li key={i}>{l}</li>)}</ul></details>
              )}
            </div>
            <div className="modal-foot">
              <span className="faint">{plural(kept.length, 'date')} selected</span><span style={{ flex: 1 }} />
              <button className="btn btn-ghost" onClick={() => setRead(null)} disabled={busy === 'saving'}>Choose another file</button>
              <button className="btn btn-primary" onClick={save} disabled={!kept.length || invalid || busy === 'saving'}>
                {busy === 'saving' ? 'Saving…' : `Save ${plural(kept.length, 'date')} to the calendar`}</button>
            </div>
          </>
        )}
      </aside>
    </Overlay>
  );
}
