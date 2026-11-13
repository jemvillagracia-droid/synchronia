import { useCallback, useEffect, useState } from 'react';
import { api, onDataChanged } from '../lib/api';
import { fmtDate } from '../lib/format';
import { useApp } from '../components/AppContext';
import { PortfolioShell } from './PortfolioPage';

const CAT_LABEL: Record<string, string> = { employment: 'Employment', appointments: 'Appointments', qualifications: 'Qualifications', licenses: 'Licenses', trainings: 'Trainings',
  publications: 'Publications', awards: 'Awards', teaching: 'Teaching', research: 'Research', extension: 'Extension', service: 'Service', accomplishments: 'Accomplishments' };
const SUPPORT: Record<string, [string, string]> = { evidenced: ['Evidence', 'st-evidenced'], confirmed: ['Confirmed', 'st-confirmed'], self_reported: ['Self-reported', 'st-self'], system: ['In SYNCHRONIA', 'st-system'] };

export function TimelinePage() {
  const { openRecord } = useApp();
  const [cats, setCats] = useState<string[]>([]);
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [data, setData] = useState<any>(null);
  useEffect(() => { const t = setTimeout(() => setQuery(q), 250); return () => clearTimeout(t); }, [q]);
  const load = useCallback(() => { api.get<any>(`/knowledge/timeline?q=${encodeURIComponent(query)}${cats.length ? `&categories=${cats.join(',')}` : ''}`).then(setData); }, [query, cats]);
  useEffect(() => { load(); return onDataChanged(load); }, [load]);
  const toggle = (c: string) => setCats((x) => (x.includes(c) ? x.filter((y) => y !== c) : [...x, c]));
  const years: Record<string, any[]> = {};
  for (const e of data?.events || []) (years[e.date.slice(0, 4)] ||= []).push(e);
  return (
    <PortfolioShell title="Professional Timeline" crumb="Portfolio · Timeline" sub="Your career in order, built from your records. Each entry opens its record; the date is when it happened, not when you entered it.">
      <div className="stack">
        <div className="row wrap" style={{ gap: 'var(--s-3)' }}>
          <input className="input" style={{ maxWidth: 300 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by words" aria-label="Filter the timeline" />
          <div className="seg" role="group" aria-label="Categories">
            {(data?.categories || Object.keys(CAT_LABEL)).map((c: string) => <button key={c} aria-pressed={cats.includes(c)} onClick={() => toggle(c)}>{CAT_LABEL[c]}</button>)}
          </div>
          {cats.length > 0 && <button className="btn btn-sm btn-ghost" onClick={() => setCats([])}>Show all</button>}
        </div>
        {!data ? <div className="skeleton" style={{ height: 300 }} /> : data.total ? (
          <div className="timeline">
            {Object.keys(years).sort((a, b) => b.localeCompare(a)).map((y) => (
              <section key={y} className="tl-year">
                <h2 className="tl-y">{y}<span>{years[y].length}</span></h2>
                <ol className="tl-list">
                  {years[y].map((e: any, i: number) => (
                    <li key={`${e.type}-${e.id}-${e.kind}-${i}`} className={`tl-ev cat-${e.category}`}>
                      <span className="tl-date mono">{e.precision === 'term' ? e.term_label : fmtDate(e.date)}</span>
                      <button className="rowlink tl-body" onClick={() => openRecord(e.type, e.id)}>
                        <span className="t">{e.title}</span>
                        <span className="s">{CAT_LABEL[e.category]}{e.retrospective ? ` · recorded ${fmtDate(e.recorded_at)}` : ''}</span>
                      </button>
                      <span className={`tag ${SUPPORT[e.support][1]}`}>{SUPPORT[e.support][0]}{e.evidence ? ` · ${e.evidence}` : ''}</span>
                    </li>
                  ))}
                </ol>
              </section>
            ))}
          </div>
        ) : <div className="panel"><div className="panel-body"><div className="empty">No dated records{cats.length || query ? ' match these filters' : ' yet'}. Add employment, qualifications, trainings, publications and other records with their dates, and they appear here in order.</div></div></div>}
        <p className="faint" style={{ margin: 0, fontSize: 13 }}>Teaching is shown per term from your class offerings. “Recorded” appears when an entry was added more than a month after the event.</p>
      </div>
    </PortfolioShell>
  );
}
