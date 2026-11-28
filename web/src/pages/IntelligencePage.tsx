import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, onDataChanged, dataChanged } from '../lib/api';
import { download } from '../lib/download';
import { fmtDate, fmtDateTime } from '../lib/format';
import { useApp } from '../components/AppContext';
import { Icon } from '../components/Icon';
import { Overlay } from '../components/Overlay';

type Support = 'evidenced' | 'confirmed' | 'self_reported' | 'system';
interface Source { type: string; id: number; title: string; date: string | null; support: Support; evidence: number; group: string | null; values: Record<string, number | null> }
interface Metric {
  key: string; section: string; label: string; resource: string; resource_label: string; basis: string; count: number; records: number;
  sums: { field: string; unit: string; value: number; missing: number }[]; breakdown: Record<string, number>; support: Record<Support, number>; undated: number; sources: Source[];
}
interface Section { key: string; code: string; label: string; metrics: Metric[]; series: { month: string; n: number }[]; distinct_records: number; support: Record<Support, number> }
interface Analytics { period: { from: string | null; to: string | null; label: string }; totals: { records: number; support: Record<Support, number> }; sections: Section[]; support_labels: Record<Support, string> }
interface Catalog { sections: { key: string; code: string; label: string }[]; reports: { key: string; label: string; short: string; description: string }[]; pdf_available: boolean }
interface GeneratedReport { id: number; report_type: string; title: string; format: string; created_at: string; download: string; params: any }

const SUPPORT_ORDER: Support[] = ['evidenced', 'confirmed', 'self_reported', 'system'];
const SUPPORT_SHORT: Record<Support, string> = { evidenced: 'Evidence', confirmed: 'Confirmed', self_reported: 'Self-reported', system: 'In SYNCHRONIA' };
const SUPPORT_CLASS: Record<Support, string> = { evidenced: 'st-evidenced', confirmed: 'st-confirmed', self_reported: 'st-self', system: 'st-system' };

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
function presets(): { key: string; label: string; from: string; to: string }[] {
  const now = new Date();
  const y = now.getFullYear();
  const ayStart = now.getMonth() >= 5 ? y : y - 1; // school year starts in June
  return [
    { key: 'ay', label: `SY ${ayStart}–${ayStart + 1}`, from: `${ayStart}-06-01`, to: `${ayStart + 1}-05-31` },
    { key: 'pay', label: `SY ${ayStart - 1}–${ayStart}`, from: `${ayStart - 1}-06-01`, to: `${ayStart}-05-31` },
    { key: 'cy', label: `Year ${y}`, from: `${y}-01-01`, to: `${y}-12-31` },
    { key: 'pcy', label: `Year ${y - 1}`, from: `${y - 1}-01-01`, to: `${y - 1}-12-31` },
    { key: '12m', label: 'Last 12 months', from: iso(new Date(y - 1, now.getMonth(), now.getDate() + 1)), to: iso(now) },
    { key: 'all', label: 'All records', from: '', to: '' },
  ];
}

function SupportBar({ s, total }: { s: Record<Support, number>; total: number }) {
  if (!total) return <div className="sup-bar empty-bar" aria-hidden />;
  return (
    <div className="sup-bar" role="img" aria-label={SUPPORT_ORDER.filter((k) => s[k]).map((k) => `${s[k]} ${SUPPORT_SHORT[k].toLowerCase()}`).join(', ')}>
      {SUPPORT_ORDER.map((k) => (s[k] ? <span key={k} className={`sup-${k}`} style={{ flexGrow: s[k] }} /> : null))}
    </div>
  );
}

function Series({ data, label }: { data: { month: string; n: number }[]; label: string }) {
  const max = Math.max(1, ...data.map((d) => d.n));
  const w = 100 / Math.max(1, data.length);
  const total = data.reduce((n, d) => n + d.n, 0);
  return (
    <figure className="intel-series" aria-label={`${label}: ${total} dated records across ${data.length} months`}>
      <svg viewBox="0 0 100 32" preserveAspectRatio="none" aria-hidden>
        {[8, 16, 24].map((y) => <line key={y} x1="0" x2="100" y1={y} y2={y} className="grid" />)}
        {data.map((d, i) => d.n ? <rect key={d.month} x={i * w + w * 0.18} width={w * 0.64} y={32 - (d.n / max) * 29} height={(d.n / max) * 29} className="bar"><title>{`${d.month}: ${d.n}`}</title></rect> : null)}
      </svg>
      <figcaption><span>{data[0]?.month}</span><span>peak {max === 1 && !total ? 0 : max}/month</span><span>{data[data.length - 1]?.month}</span></figcaption>
    </figure>
  );
}

function MetricDetail({ m, labels, onClose }: { m: Metric; labels: Record<Support, string>; onClose: () => void }) {
  const { openRecord } = useApp();
  const [q, setQ] = useState('');
  const shown = m.sources.filter((s) => !q || s.title.toLowerCase().includes(q.toLowerCase()));
  const breakdown = Object.entries(m.breakdown).sort((a, b) => b[1] - a[1]);
  return (
    <Overlay onClose={onClose} label={m.label}>
      <aside className="drawer">
        <div className="modal-head"><span className="label">{m.resource_label} · indicator</span><span style={{ flex: 1 }} />
          <button className="icon-btn sm" onClick={onClose} aria-label="Close"><Icon name="close" /></button></div>
        <div className="modal-body stack" style={{ gap: 'var(--s-4)' }}>
          <div className="row wrap" style={{ alignItems: 'baseline', gap: 'var(--s-4)' }}>
            <span className="intel-big">{m.count}</span>
            <h2 className="display" style={{ fontSize: 28, margin: 0, flex: 1, minWidth: 200 }}>{m.label}</h2>
          </div>
          <dl className="dl">
            <dt>Counted by</dt><dd>{m.basis}</dd>
            {m.sums.flatMap((s) => [<dt key={`t${s.field}`}>Total {s.unit}</dt>, <dd key={`d${s.field}`}>{s.value}{s.missing ? <span className="faint"> · {s.missing} record{s.missing > 1 ? 's' : ''} without a figure</span> : null}</dd>])}
            {m.undated > 0 && <><dt>Left out</dt><dd>{m.undated} undated record{m.undated > 1 ? 's' : ''}: the period cannot be checked without a date. Add dates to include them.</dd></>}
            <dt>Support</dt><dd>{SUPPORT_ORDER.filter((k) => m.support[k]).map((k) => `${m.support[k]} ${labels[k].toLowerCase()}`).join(' · ') || 'No records'}</dd>
          </dl>
          {breakdown.length > 1 && (
            <div className="breakdown">{breakdown.map(([k, n]) => <div key={k} className="bd-row"><span className="bd-k">{k}</span><span className="bd-bar"><span style={{ width: `${(n / m.records) * 100}%` }} /></span><span className="bd-n">{n}</span></div>)}</div>
          )}
          <div className="between wrap"><h3 className="label" style={{ margin: 0 }}>Source records ({m.sources.length})</h3>
            {m.sources.length > 8 && <input className="input" style={{ maxWidth: 260 }} placeholder="Filter records" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Filter source records" />}</div>
          {shown.length ? (
            <ul className="list src-list">
              {shown.map((s) => (
                <li key={`${s.type}${s.id}`}>
                  <span className={`tag ${SUPPORT_CLASS[s.support]}`} title={labels[s.support]}>{SUPPORT_SHORT[s.support]}{s.evidence ? ` · ${s.evidence}` : ''}</span>
                  {s.type === 'reports' || s.type === 'document_routes'
                    ? <span className="grow"><span className="t">{s.title}</span></span>
                    : <button className="rowlink grow" onClick={() => openRecord(s.type, s.id)}><span className="t">{s.title}</span><span className="s">{[s.group, s.type.replace(/_/g, ' ') + ` #${s.id}`].filter(Boolean).join(' · ')}</span></button>}
                  <span className="faint mono" style={{ fontSize: 12.5, whiteSpace: 'nowrap' }}>{s.date ? fmtDate(s.date) : 'Undated'}</span>
                </li>
              ))}
            </ul>
          ) : <div className="empty">No records counted for this indicator in the selected period. Nothing is estimated.</div>}
        </div>
      </aside>
    </Overlay>
  );
}

function ReportBuilder({ cat, filters, sections }: { cat: Catalog; filters: { from: string; to: string; support: string }; sections: string[] }) {
  const { toast } = useApp();
  const [format, setFormat] = useState<'docx' | 'pdf' | 'xlsx'>('docx');
  const [busy, setBusy] = useState<string | null>(null);
  const [recent, setRecent] = useState<GeneratedReport[]>([]);
  // "Noted by" is printed only when named here; no signatory is assumed.
  const [noted, setNoted] = useState({ name: '', title: '' });
  const load = useCallback(() => { api.get<GeneratedReport[]>('/intelligence/reports').then(setRecent).catch(() => {}); }, []);
  useEffect(() => { load(); return onDataChanged(load); }, [load]);
  async function generate(type: string) {
    setBusy(type);
    try {
      const r = await api.post<{ file_name: string; download: string; sources: number; validation?: { summary: string } }>('/intelligence/reports', { type, format, from: filters.from || null, to: filters.to || null, support: filters.support, sections: type === 'custom' ? sections : undefined, noted_by_name: noted.name || undefined, noted_by_title: noted.title || undefined });
      download(r.download, r.file_name);
      toast(`Generated ${r.file_name} from ${r.sources} source record${r.sources === 1 ? '' : 's'}${r.validation ? ` — ${r.validation.summary}` : ''}`, 'ok');
      dataChanged();
    } catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(null); }
  }
  return (
    <section className="panel">
      <header className="panel-head"><span className="code">F</span><h2>Report generation</h2>
        <div className="seg" role="group" aria-label="Output format">
          {([['docx', 'Word'], ['pdf', 'PDF'], ['xlsx', 'Spreadsheet']] as const).map(([k, l]) => (
            <button key={k} aria-pressed={format === k} onClick={() => setFormat(k)} disabled={k === 'pdf' && !cat.pdf_available} title={k === 'pdf' && !cat.pdf_available ? 'PDF output needs the desktop app' : undefined}>{l}</button>
          ))}
        </div></header>
      <div className="panel-body stack">
        <p className="muted" style={{ margin: 0, fontSize: 14 }}>Reports use the period and support filter above. Every line cites a numbered source record, listed at the end; your letterhead is applied to Word and PDF.
          The curriculum vitae is produced in <Link to="/cv" className="link">Curriculum Vitae Studio</Link>.</p>
        <div className="row wrap" style={{ gap: 'var(--s-3)', alignItems: 'flex-end' }}>
          <label className="field" style={{ minWidth: 220, flex: '1 1 220px' }}><span className="label">Noted by (optional)</span>
            <input className="input" value={noted.name} maxLength={200} onChange={(e) => setNoted({ ...noted, name: e.target.value })} placeholder="Name, if the report needs one" /></label>
          <label className="field" style={{ minWidth: 200, flex: '1 1 200px' }}><span className="label">Position</span>
            <input className="input" value={noted.title} maxLength={200} onChange={(e) => setNoted({ ...noted, title: e.target.value })} placeholder="e.g. College Dean" disabled={!noted.name} /></label>
          <span className="faint" style={{ fontSize: 12.5, flex: '2 1 260px' }}>Leave empty to print only “Prepared by” (you).</span>
        </div>
        <div className="report-grid">
          {cat.reports.map((r) => (
            <div key={r.key} className="report-card">
              <div className="rc-title">{r.label}</div>
              <div className="rc-desc">{r.key === 'custom' ? `Sections: ${sections.length ? cat.sections.filter((s) => sections.includes(s.key)).map((s) => s.code).join(', ') : 'none selected'}. ${r.description}` : r.description}</div>
              <button className="btn btn-sm" onClick={() => generate(r.key)} disabled={!!busy || (r.key === 'custom' && !sections.length)} aria-label={`Generate ${r.label}`}>
                <Icon name="download" />{busy === r.key ? 'Generating…' : `Generate ${format === 'docx' ? 'Word' : format === 'pdf' ? 'PDF' : 'spreadsheet'}`}</button>
            </div>
          ))}
        </div>
        <div>
          <h3 className="label">Recently generated</h3>
          {recent.length ? (
            <ul className="list">{recent.slice(0, 8).map((x) => (
              <li key={x.id}><span className="tag">{x.format.toUpperCase()}</span>
                <span className="grow"><span className="t">{x.title}</span><span className="s">{fmtDateTime(x.created_at)} · {x.params?.sources ?? 0} source records</span></span>
                <button className="btn btn-sm btn-ghost" onClick={() => download(x.download, x.title)}><Icon name="download" />Save again</button></li>
            ))}</ul>
          ) : <div className="empty">No reports generated yet.</div>}
        </div>
      </div>
    </section>
  );
}

export function IntelligencePage() {
  const { toast } = useApp();
  const P = useMemo(presets, []);
  const [preset, setPreset] = useState('ay');
  const [from, setFrom] = useState(P[0].from);
  const [to, setTo] = useState(P[0].to);
  const [support, setSupport] = useState('all');
  const [sections, setSections] = useState<string[]>(['academic', 'research', 'extension', 'portfolio']);
  const [cat, setCat] = useState<Catalog | null>(null);
  const [data, setData] = useState<Analytics | null>(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState<Metric | null>(null);
  const query = `from=${from}&to=${to}&support=${support}${sections.length ? `&sections=${sections.join(',')}` : ''}`;
  const load = useCallback(() => {
    if (!sections.length) { setData((d) => (d ? { ...d, sections: [] } : d)); return; }
    api.get<Analytics>(`/intelligence/analytics?${query}`).then((d) => { setData(d); setError(''); }).catch((e) => setError(e.message));
  }, [query, sections.length]);
  useEffect(() => { api.get<Catalog>('/intelligence/catalog').then(setCat); }, []);
  useEffect(() => { load(); return onDataChanged(load); }, [load]);
  const pick = (k: string) => { const p = P.find((x) => x.key === k)!; setPreset(k); setFrom(p.from); setTo(p.to); };
  const toggle = (k: string) => setSections((s) => (s.includes(k) ? s.filter((x) => x !== k) : [...s, k]));
  const t = data?.totals;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="crumb"><span className="bar" /><span className="label">Intelligence · Reports and Analytics</span></div>
          <h1 className="display">Reports and Analytics</h1>
          <div className="sub">Analytics and reports computed only from your records. Every figure opens to the records behind it.</div>
        </div>
      </div>

      <section className="panel intel-filters">
        <div className="panel-body stack" style={{ gap: 'var(--s-3)' }}>
          <div className="row wrap" style={{ gap: 'var(--s-3)' }}>
            <span className="label" style={{ margin: 0 }}>Period</span>
            <div className="seg" role="group" aria-label="Period">
              {P.map((p) => <button key={p.key} aria-pressed={preset === p.key} onClick={() => pick(p.key)}>{p.label}</button>)}
              <button aria-pressed={preset === 'custom'} onClick={() => setPreset('custom')}>Custom</button>
            </div>
            {preset === 'custom' && (
              <div className="row wrap">
                <input className="input" type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} aria-label="From" style={{ width: 'auto' }} />
                <span className="faint">to</span>
                <input className="input" type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} aria-label="To" style={{ width: 'auto' }} />
              </div>
            )}
          </div>
          <div className="row wrap" style={{ gap: 'var(--s-3)' }}>
            <span className="label" style={{ margin: 0 }}>Sections</span>
            <div className="seg" role="group" aria-label="Sections">
              {(cat?.sections || []).map((s) => <button key={s.key} aria-pressed={sections.includes(s.key)} onClick={() => toggle(s.key)}>{s.code} · {s.label.replace(/ analytics$/i, '')}</button>)}
            </div>
            <span className="row" style={{ gap: 'var(--s-2)', flexWrap: 'nowrap' }}>{/* label and its choice stay together when the row wraps */}
              <span className="label" style={{ margin: 0 }}>Include</span>
              <select className="select" style={{ width: 'auto' }} value={support} onChange={(e) => setSupport(e.target.value)} aria-label="Records to include">
                <option value="all">All records</option><option value="confirmed">Confirmed or evidenced</option><option value="evidenced">Evidence only</option>
              </select>
            </span>
            <span style={{ flex: 1 }} />
            <button className="btn btn-sm" disabled={!sections.length} onClick={() => { download(`/api/intelligence/analytics.xlsx?${query}`, 'SYNCHRONIA_Analytics.xlsx'); toast('Exporting analytics spreadsheet', 'info'); }}><Icon name="download" />Spreadsheet</button>
          </div>
        </div>
      </section>

      {error && <div className="alert">{error}</div>}
      {!data ? <div className="skeleton" style={{ height: 300 }} /> : (
        <>
          <section className="intel-overview">
            <div className="io-cell"><div className="io-v">{t!.records}</div><div className="io-k">Records counted · {data.period.label}</div></div>
            {SUPPORT_ORDER.map((k) => <div key={k} className={`io-cell sup-${k}-text`}><div className="io-v">{t!.support[k]}</div><div className="io-k">{data.support_labels[k]}</div></div>)}
            <div className="io-bar"><SupportBar s={t!.support} total={t!.records} /></div>
          </section>
          {!sections.length && <div className="panel"><div className="panel-body"><div className="empty">Choose at least one section.</div></div></div>}
          {data.sections.map((s) => (
            <section key={s.key} className="panel intel-section">
              <header className="panel-head"><span className="code">{s.code}</span><h2>{s.label}</h2><span className="faint" style={{ fontSize: 13 }}>{s.distinct_records} record{s.distinct_records === 1 ? '' : 's'}</span></header>
              <div className="panel-body stack">
                <Series data={s.series} label={s.label} />
                <div className="metric-grid">
                  {s.metrics.map((m) => (
                    <button key={m.key} className={`metric ${m.count ? '' : 'zero'}`} onClick={() => setOpen(m)} aria-label={`${m.label}: ${m.count}. Show source records`}>
                      <span className="m-v">{m.count}</span>
                      <span className="m-k">{m.label}</span>
                      {m.sums.filter((x) => x.value).map((x) => <span key={x.field} className="m-sum">{x.value} {x.unit}</span>)}
                      {m.undated > 0 && <span className="m-note">+{m.undated} undated not counted</span>}
                      <SupportBar s={m.support} total={m.records} />
                    </button>
                  ))}
                </div>
              </div>
            </section>
          ))}
          <div className="intel-legend" aria-label="Legend">
            {SUPPORT_ORDER.map((k) => <span key={k}><i className={`sup-${k}`} />{data.support_labels[k]}</span>)}
          </div>
          {cat && <ReportBuilder cat={cat} filters={{ from, to, support }} sections={sections} />}
        </>
      )}
      {open && data && <MetricDetail m={open} labels={data.support_labels} onClose={() => setOpen(null)} />}
    </div>
  );
}
