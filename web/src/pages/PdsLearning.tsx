// Professional Development › PDS: the Learning and Development interventions attended (Personal Data Sheet,
// CS Form 212, Section VII), year by year as kept in Google Drive — with each year's certificate folder, exports in the
// PDS layout, and import from an existing PDS.
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, dataChanged, onDataChanged, uploadFile } from '../lib/api';
import { download } from '../lib/download';
import { fmtNum, plural } from '../lib/format';
import { useApp } from '../components/AppContext';
import { Icon } from '../components/Icon';
import { Overlay } from '../components/Overlay';
import { askText } from '../components/AskText';

interface Year { year: number; count: number; hours: number; missing_type: number; folder_url: string | null }
interface Row { id: number; title: string; start_date: string; end_date: string | null; from: string; to: string; hours: number | null; ld_type: string | null; organizer: string | null; issues: string[] }
interface List { year: number | 'all'; items: Row[]; total_hours: number; folder_url: string | null }
interface ImportRow { title: string; start_date: string | null; end_date: string | null; hours: number | null; ld_type: string | null; organizer: string | null; sheet: string; row: number; issues: string[]; already: boolean; keep?: boolean }

const LD = ['managerial', 'supervisory', 'technical', 'foundation', 'other'];
const hrs = (h: number | null | undefined) => (h == null ? '—' : Number.isInteger(+h) ? `${h}.0` : fmtNum(+h));

export function PdsLearning() {
  const { openRecord, openNew, toast } = useApp();
  const [years, setYears] = useState<{ years: Year[]; undated: number } | null>(null);
  const [year, setYear] = useState<number | 'all' | null>(null);
  const [list, setList] = useState<List | null>(null);
  const [busy, setBusy] = useState('');
  const [importing, setImporting] = useState(false);
  const [order, setOrder] = useState<'desc' | 'asc'>(() => { try { return localStorage.getItem('synchronia-ld-order') === 'asc' ? 'asc' : 'desc'; } catch { return 'desc'; } });
  const sortBy = (o: 'desc' | 'asc') => { setOrder(o); try { localStorage.setItem('synchronia-ld-order', o); } catch { /* this session only */ } };
  const latest = useRef(0);

  const loadYears = useCallback(() => api.get<{ years: Year[]; undated: number }>('/portfolio/ld/years').then((y) => {
    setYears(y); setYear((cur) => (cur === null ? (y.years[0]?.year ?? new Date().getFullYear()) : cur));
  }), []);
  const loadList = useCallback(() => {
    if (year === null) return;
    const n = ++latest.current;
    api.get<List>(`/portfolio/ld?year=${year}&order=${order}`).then((l) => { if (n === latest.current) setList(l); });
  }, [year, order]);
  useEffect(() => { loadYears(); return onDataChanged(() => { loadYears(); }); }, [loadYears]);
  useEffect(() => { loadList(); return onDataChanged(loadList); }, [loadList]);

  async function exportAs(format: 'xlsx' | 'docx' | 'pdf') {
    if (year === null) return;
    setBusy(format);
    try {
      const r = await api.post<{ download: string; file_name: string; validation?: { summary: string } }>('/portfolio/ld/export', { year, format, order });
      download(r.download, r.file_name); toast(`Exported ${r.file_name}${r.validation ? ` — ${r.validation.summary}` : ''}`, 'ok');
    } catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(''); }
  }
  async function linkFolder() {
    if (typeof year !== 'number') return;
    const url = await askText(`Folder of ${year} certificates`, list?.folder_url || 'https://drive.google.com/drive/folders/', 'Paste the link of this year’s folder in Google Drive (or any web folder). Leave empty to remove it.');
    if (url === null) return;
    try { await api.put(`/portfolio/ld/folders/${year}`, { url: url.trim() === 'https://drive.google.com/drive/folders/' ? '' : url }); toast(url.trim() ? `Folder linked to ${year}` : 'Folder link removed', 'ok'); loadYears(); loadList(); }
    catch (e) { toast((e as Error).message, 'error'); }
  }
  async function setType(r: Row, ld_type: string) {
    setList((l) => l && { ...l, items: l.items.map((x) => (x.id === r.id ? { ...x, ld_type, issues: x.issues.filter((i) => i !== 'type of L&D' || !ld_type) } : x)) });
    try { await api.patch(`/records/trainings/${r.id}`, { ld_type: ld_type || null }); dataChanged(); } catch (e) { toast((e as Error).message, 'error'); loadList(); }
  }
  async function setTypeForMissing(ld_type: string) {
    const todo = (list?.items || []).filter((r) => !r.ld_type);
    for (const r of todo) await api.patch(`/records/trainings/${r.id}`, { ld_type });
    toast(`${plural(todo.length, 'training')} set to ${ld_type}`, 'ok'); dataChanged();
  }

  const yrs = years?.years || [];
  const missingType = (list?.items || []).filter((r) => !r.ld_type).length;
  return (
    <div className="pds">
      <nav className="pds-years" aria-label="Years">
        <button className={year === 'all' ? 'on' : ''} aria-current={year === 'all' ? 'true' : undefined} onClick={() => setYear('all')}>
          <span className="t">All years</span><span className="n">{yrs.reduce((s, y) => s + y.count, 0)}</span></button>
        {yrs.map((y) => (
          <button key={y.year} className={year === y.year ? 'on' : ''} aria-current={year === y.year ? 'true' : undefined} onClick={() => setYear(y.year)}>
            <span className="t">{y.year}{y.folder_url && <Icon name="link" />}</span><span className="n">{y.count}</span></button>
        ))}
        <button className="pds-add-year" onClick={async () => {
          const v = await askText('Add a year', String(new Date().getFullYear()), 'A year to link its certificates folder or add its trainings.');
          if (v && /^\d{4}$/.test(v.trim())) setYear(Number(v.trim()));
        }}><Icon name="plus" />Year</button>
      </nav>
      {years && years.undated > 0 && <p className="faint pds-undated">{plural(years.undated, 'training')} without a date — add dates in All records to list them by year.</p>}

      <section className="pds-main">
        <header className="pds-head">
          <div>
            <h2 className="display pds-title">{year === 'all' ? 'All years' : year ?? ''}</h2>
            <div className="faint">{list ? `${plural(list.items.length, 'intervention')} · ${hrs(list.total_hours)} hours` : '…'}</div>
          </div>
          <span style={{ flex: 1 }} />
          {typeof year === 'number' && (list?.folder_url
            ? <><a className="btn btn-sm" href={list.folder_url} target="_blank" rel="noreferrer noopener"><Icon name="link" />Open {year} certificates folder</a>
              <button className="btn btn-sm btn-ghost" onClick={linkFolder}>Change link</button></>
            : <button className="btn btn-sm" onClick={linkFolder}><Icon name="link" />Link {year} Drive folder</button>)}
        </header>
        <div className="row wrap pds-actions">
          <button className="btn btn-sm btn-primary" onClick={() => openNew('trainings', { role: 'participant', ld_type: 'technical', ...(typeof year === 'number' && year !== new Date().getFullYear() ? { start_date: `${year}-01-01` } : {}) })}><Icon name="plus" />Add training attended</button>
          <button className="btn btn-sm" onClick={() => setImporting(true)}><Icon name="upload" />Import from PDS (Excel)</button>
          <div className="seg" role="group" aria-label="Sort by date">
            <button aria-pressed={order === 'desc'} onClick={() => sortBy('desc')} title="Most recent first, as the PDS asks"><Icon name="down" />Newest first</button>
            <button aria-pressed={order === 'asc'} onClick={() => sortBy('asc')}><Icon name="up" />Oldest first</button>
          </div>
          <span style={{ flex: 1 }} />
          <span className="faint" style={{ fontSize: 12.5 }}>Export in the PDS layout:</span>
          <button className="btn btn-sm" disabled={!list?.items.length || !!busy} onClick={() => exportAs('xlsx')}><Icon name="download" />{busy === 'xlsx' ? 'Exporting…' : 'Excel'}</button>
          <button className="btn btn-sm" disabled={!list?.items.length || !!busy} onClick={() => exportAs('docx')}><Icon name="download" />{busy === 'docx' ? 'Exporting…' : 'Word'}</button>
          <button className="btn btn-sm" disabled={!list?.items.length || !!busy} onClick={() => exportAs('pdf')}><Icon name="download" />{busy === 'pdf' ? 'Exporting…' : 'PDF'}</button>
        </div>
        {missingType > 0 && (
          <div className="alert info row wrap" style={{ gap: 8 }}>
            <span className="grow">{plural(missingType, 'training')} {missingType === 1 ? 'has' : 'have'} no Type of L&D. Choose it in the table, or set all of them to:</span>
            {['technical', 'supervisory', 'managerial', 'foundation'].map((t) => <button key={t} className="btn btn-sm" onClick={() => setTypeForMissing(t)}>{t[0].toUpperCase() + t.slice(1)}</button>)}
          </div>
        )}

        <div className="pds-sheet" role="table" aria-label={`Learning and development interventions attended, ${year}`}>
          <div className="pds-band" role="row"><span role="columnheader">VII. LEARNING AND DEVELOPMENT (L&D) INTERVENTIONS/TRAINING PROGRAMS ATTENDED</span></div>
          <div className="pds-r pds-h" role="row">
            <span role="columnheader">Title of learning and development interventions / training programs <i>(write in full)</i></span>
            <span role="columnheader" className="c" aria-sort={order === 'asc' ? 'ascending' : 'descending'}>
              <button className="pds-sort" onClick={() => sortBy(order === 'asc' ? 'desc' : 'asc')} aria-label={`From date, sorted ${order === 'asc' ? 'oldest' : 'newest'} first. Click to reverse.`}>From <Icon name={order === 'asc' ? 'up' : 'down'} size={12} /></button><i>dd/mm/yyyy</i></span><span role="columnheader" className="c">To <i>dd/mm/yyyy</i></span>
            <span role="columnheader" className="c">Number of hours</span><span role="columnheader" className="c">Type of L&D</span>
            <span role="columnheader" className="c">Conducted / sponsored by <i>(write in full)</i></span>
          </div>
          {list && list.items.length === 0 && <div className="pds-empty">No trainings attended are recorded for {year === 'all' ? 'any year' : year}. Add one, or import them from your PDS.</div>}
          {list?.items.map((r) => (
            <div key={r.id} className="pds-r" role="row">
              <span role="cell" className="pds-t">
                <button className="rowlink" onClick={() => openRecord('trainings', r.id)}>{r.title}</button>
                {r.issues.filter((i) => i !== 'type of L&D').length > 0 && <span className="tag st-system">Missing: {r.issues.filter((i) => i !== 'type of L&D').join(', ')}</span>}
              </span>
              <span role="cell" className="d">{r.from}</span><span role="cell" className="d">{r.to}</span>
              <span role="cell" className="c">{hrs(r.hours)}</span>
              <span role="cell" className="c"><select className={`select select-sm pds-type ${r.ld_type ? '' : 'empty'}`} value={r.ld_type || ''} onChange={(e) => setType(r, e.target.value)} aria-label={`Type of L&D for ${r.title}`}>
                <option value="">Choose…</option>{LD.map((t) => <option key={t} value={t}>{t.toUpperCase()}</option>)}</select></span>
              <span role="cell" className="c">{r.organizer || '—'}</span>
            </div>
          ))}
          {list && list.items.length > 0 && <div className="pds-r pds-total" role="row"><span role="cell">Total number of hours</span><span role="cell" /><span role="cell" /><span role="cell" className="c">{hrs(list.total_hours)}</span><span role="cell" /><span role="cell" /></div>}
        </div>
        <p className="faint" style={{ fontSize: 12.5 }}>Listed from your Professional Development records where you attended (talks you gave are left out), most recent first as the PDS asks. Click a title to edit it or attach its certificate.</p>
      </section>
      {importing && <PdsImport onClose={() => setImporting(false)} onSaved={() => { setImporting(false); dataChanged(); }} />}
    </div>
  );
}

const PDS_FILE = { ext: /\.xlsx$/i, maxMb: 30, refuse: 'is not an Excel (.xlsx) file. Open your PDS in Excel and save it as .xlsx.' };

function PdsImport({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { toast } = useApp();
  const [rows, setRows] = useState<ImportRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const file = useRef<HTMLInputElement>(null);
  async function read(f: File) {
    setBusy(true); setError('');
    try { const r = await uploadFile<{ items: ImportRow[] }>('/portfolio/ld/import/read', f, PDS_FILE); setRows(r.items.map((i) => ({ ...i, keep: !i.already && !!i.start_date }))); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  const kept = rows?.filter((r) => r.keep) || [];
  async function save() {
    setBusy(true);
    try { const r = await api.post<{ saved: number }>('/portfolio/ld/import', { items: kept.map(({ keep, already, issues, sheet, row, ...x }) => x) }); toast(`${plural(r.saved, 'training')} added to Professional Development`, 'ok'); onSaved(); }
    catch (e) { toast((e as Error).message, 'error'); setBusy(false); }
  }
  return (
    <Overlay onClose={() => !busy && onClose()} label="Import from PDS">
      <aside className="drawer wide">
        <div className="modal-head"><span className="label">Professional Development · Import from PDS</span><span style={{ flex: 1 }} />
          <button className="icon-btn sm" onClick={onClose} aria-label="Close" disabled={busy}><Icon name="close" /></button></div>
        <div className="modal-body stack">
          {!rows ? (<>
            <h2 className="display" style={{ fontSize: 28, margin: 0 }}>Bring in your PDS trainings</h2>
            <p className="muted" style={{ margin: 0 }}>Choose your Personal Data Sheet (CS Form 212) saved as Excel. SYNCHRONIA reads Section VII — titles, inclusive dates (dd/mm/yyyy), hours, type of L&D and who conducted them — from the PDS and its continuation sheets. You check them before anything is saved.</p>
            <button type="button" className="sci-drop" onClick={() => file.current?.click()} disabled={busy}><Icon name="upload" /><b>{busy ? 'Reading the PDS…' : 'Choose the PDS Excel file'}</b><span className="faint">.xlsx</span></button>
            <input ref={file} type="file" hidden accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void read(f); }} />
            {error && <div className="alert" role="alert">{error}</div>}
          </>) : (<>
            <h2 className="display" style={{ fontSize: 28, margin: 0 }}>Check the trainings</h2>
            <p className="muted" style={{ margin: 0 }}>{plural(rows.length, 'row')} read. Ones already in your portfolio are unticked.</p>
            <ul className="list pds-import">{rows.map((r, i) => (
              <li key={i} className={r.keep ? '' : 'off'}>
                <input type="checkbox" className="check" checked={!!r.keep} onChange={(e) => setRows(rows.map((x, k) => (k === i ? { ...x, keep: e.target.checked } : x)))} aria-label={`Keep ${r.title}`} />
                <span className="grow"><span className="t">{r.title}</span>
                  <span className="s">{r.start_date ? r.start_date.split('-').reverse().join('/') : 'no date'}{r.end_date ? ` – ${r.end_date.split('-').reverse().join('/')}` : ''} · {hrs(r.hours)} h · {r.ld_type ? r.ld_type.toUpperCase() : 'type not given'} · {r.organizer || 'sponsor not given'}</span></span>
                {r.already && <span className="tag st-evidenced">Already in your portfolio</span>}
                {r.issues.map((x) => <span key={x} className="tag st-system">Check: {x}</span>)}
              </li>))}</ul>
          </>)}
        </div>
        {rows && <div className="modal-foot"><span className="faint">{plural(kept.length, 'training')} selected</span><span style={{ flex: 1 }} />
          <button className="btn btn-ghost" onClick={() => setRows(null)} disabled={busy}>Choose another file</button>
          <button className="btn btn-primary" onClick={save} disabled={busy || !kept.length}>{busy ? 'Saving…' : `Save ${plural(kept.length, 'training')}`}</button></div>}
      </aside>
    </Overlay>
  );
}
