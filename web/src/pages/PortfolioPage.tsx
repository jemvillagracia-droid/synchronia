import { CvImportButton } from './CvImport';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, NavLink, useNavigate, useParams } from 'react-router-dom';
import { api, onDataChanged } from '../lib/api';
import { daysUntil, fmtDate, fmtNum, humanize, relTime } from '../lib/format';
import { PORTFOLIO, categoryByKey, type PortfolioCategory } from '../lib/portfolio';
import { VERIFICATION_INFO } from '../lib/forms';
import type { PortfolioSummary, RecordRow } from '../lib/types';
import { useApp } from '../components/AppContext';
import { Icon } from '../components/Icon';

const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0);
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthYear = (d?: string | null) => (d ? `${MONTHS[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}` : null);

function useSummary() {
  const [s, setS] = useState<PortfolioSummary | null>(null);
  const load = useCallback(() => { api.get<PortfolioSummary>('/portfolio/summary').then(setS).catch(() => {}); }, []);
  useEffect(() => { load(); return onDataChanged(load); }, [load]);
  return s;
}

/** Completeness ring (recommended fields filled). */
function Ring({ done, total, label }: { done: number; total: number; label: string }) {
  const r = 14, c = 2 * Math.PI * r, f = total ? done / total : 1;
  return (
    <svg className="ring" viewBox="0 0 34 34" role="img" aria-label={label}>
      <title>{label}</title>
      <circle cx="17" cy="17" r={r} fill="none" stroke="var(--bg-3)" strokeWidth="3" />
      <circle cx="17" cy="17" r={r} fill="none" stroke={f === 1 ? 'var(--ok)' : 'var(--violet)'} strokeWidth="3"
        strokeDasharray={`${c * f} ${c}`} transform="rotate(-90 17 17)" />
      <text x="17" y="20.5" textAnchor="middle" fontSize="9" fontFamily="var(--font-mono)" fill="var(--text-2)">{Math.round(f * 100)}</text>
    </svg>
  );
}

function PortfolioNav({ summary }: { summary: PortfolioSummary | null }) {
  const count = (k: string) => summary?.categories.find((c) => c.key === k)?.total;
  return (
    <nav className="pf-nav" aria-label="Portfolio sections">
      <NavLink to="/portfolio" end><span className="code">00</span>Overview</NavLink>
      <NavLink to="/portfolio/profile"><span className="code">PRF</span>Professional Profile</NavLink>
      <NavLink to="/portfolio/timeline"><span className="code">TL</span>Professional Timeline</NavLink>
      {PORTFOLIO.map((c) => (
        <NavLink key={c.key} to={`/portfolio/${c.key}`}>
          <span className="code">{c.code}</span>{c.label}<span className="n">{count(c.key) ?? ''}</span>
        </NavLink>
      ))}
    </nav>
  );
}

export function PortfolioShell({ children, title, crumb, sub, actions }: { children: ReactNode; title: string; crumb: string; sub?: ReactNode; actions?: ReactNode }) {
  const summary = useSummary();
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="crumb"><span className="bar" /><span className="label">Professional Development · Portfolio{crumb ? ` · ${crumb}` : ''}</span></div>
          <h1 className="display">{title}</h1>
          {sub && <div className="sub">{sub}</div>}
        </div>
        {actions && <div className="actions">{actions}</div>}
      </div>
      <div className="pf-layout">
        <PortfolioNav summary={summary} />
        <div style={{ minWidth: 0 }}>{children}</div>
      </div>
    </div>
  );
}

// ─────────────────────────── Overview ───────────────────────────

export function PortfolioOverview() {
  const s = useSummary();
  const navigate = useNavigate();
  const { openRecord } = useApp();

  return (
    <PortfolioShell title="Professional Portfolio" crumb="" sub="The master record of your professional identity. Every entry is editable, searchable and linkable to evidence — and nothing is shown as verified until you confirm it or attach proof." actions={<CvImportButton />}>
      {!s ? <div className="skeleton" style={{ height: 200 }} /> : (
        <div className="stack" style={{ gap: 'var(--s-6)' }}>
          <section className="panel accent-violet">
            <div className="panel-body">
              <div className="stat-row">
                <div className="stat"><div className={`v ${s.totals.total ? '' : 'zero'}`}>{s.totals.total}</div><div className="k">Portfolio records</div></div>
                <div className="stat"><div className={`v ${s.totals.evidenced ? '' : 'zero'}`}>{pct(s.totals.evidenced, s.totals.total)}%</div><div className="k">With evidence</div></div>
                <div className="stat"><div className={`v ${s.totals.confirmed ? '' : 'zero'}`}>{pct(s.totals.confirmed, s.totals.total)}%</div><div className="k">Confirmed or evidenced</div></div>
                <div className="stat"><div className={`v ${s.totals.incomplete ? '' : 'zero'}`}>{s.totals.incomplete}</div><div className="k">Missing details</div></div>
                <div className="stat"><div className={`v ${s.development.hours ? '' : 'zero'}`}>{fmtNum(s.development.hours)}</div><div className="k">Training hours</div></div>
              </div>
              {(s.licences.expired > 0 || s.licences.expiring > 0) && (
                <div className="alert mt-4" style={{ borderColor: 'var(--orange-line)', background: 'var(--orange-dim)', color: 'var(--orange)' }}>
                  {s.licences.expired > 0 && `${s.licences.expired} license(s) expired. `}
                  {s.licences.expiring > 0 && `${s.licences.expiring} license(s) expire within 60 days. `}
                  <Link to="/portfolio/licenses">Review licenses</Link>
                </div>
              )}
            </div>
          </section>

          <Link to="/portfolio/profile" className="cat-card" style={{ flexDirection: 'row', alignItems: 'center', textDecoration: 'none' }}>
            <span className="avatar" style={{ width: 44, height: 44, fontSize: 15 }}><Icon name="user" /></span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span className="label">A · Professional Profile</span>
              <span style={{ display: 'block', color: 'var(--text)', fontSize: 18, marginTop: 2 }}>{s.profile.full_name || 'Unnamed profile'}</span>
              <span className="faint" style={{ fontSize: 13 }}>{s.profile.professional_title || 'No professional title yet'}</span>
            </span>
            <span style={{ width: 160 }}>
              <span className="between"><span className="label">Complete</span><span className="num muted">{s.profile.completeness.filled}/{s.profile.completeness.total}</span></span>
              <span className="meter mt-2" style={{ display: 'block' }}><span style={{ width: `${pct(s.profile.completeness.filled, s.profile.completeness.total)}%` }} /></span>
            </span>
          </Link>

          <div className="cat-grid">
            {s.categories.map((c, i) => {
              const meta = categoryByKey[c.key];
              return (
                <button key={c.key} className="cat-card" onClick={() => navigate(`/portfolio/${c.key}`)} aria-label={`${c.label}: ${c.total} records`}>
                  <div className="between">
                    <span className="label">{String.fromCharCode(66 + i)} · {meta.code}</span>
                    {c.attention_count > 0 && <span className="tag orange">{c.attention_count} to review</span>}
                  </div>
                  <div className="row" style={{ alignItems: 'baseline', gap: 'var(--s-3)' }}>
                    <span className={`count ${c.total ? '' : 'zero'}`}>{c.total}</span>
                    <span style={{ color: 'var(--text)', fontWeight: 500 }}>{c.label}</span>
                  </div>
                  <div className="dualbar">
                    <div className="between faint" style={{ fontSize: 11.5 }}><span>Evidence</span><span className="num">{c.evidenced}/{c.total}</span></div>
                    <div className="meter orange"><span style={{ width: `${pct(c.evidenced, c.total)}%` }} /></div>
                    <div className="between faint" style={{ fontSize: 11.5 }}><span>Confirmed</span><span className="num">{c.confirmed}/{c.total}</span></div>
                    <div className="meter"><span style={{ width: `${pct(c.confirmed, c.total)}%` }} /></div>
                  </div>
                  <span className="faint" style={{ fontSize: 12 }}>{c.last_updated ? `Updated ${relTime(c.last_updated)}` : meta.description}</span>
                </button>
              );
            })}
          </div>

          <section className="panel">
            <header className="panel-head"><span className="code">REV</span><h2>Needs attention</h2><span className="num faint">{s.attention.length}</span></header>
            <div className="panel-body">
              {s.attention.length === 0 ? (
                <div className="empty"><strong>{s.totals.total ? 'Every record has evidence and its key details.' : 'No portfolio records yet.'}</strong>
                  {s.totals.total ? '' : 'Choose a section above to add your first record.'}</div>
              ) : (
                <ul className="list">
                  {s.attention.map((a) => (
                    <li key={`${a.type}-${a.id}`}>
                      <span className="tag">{a.label}</span>
                      <button className="rowlink" onClick={() => openRecord(a.type, a.id)}>
                        <span className="t">{a.title}</span>
                        <span className="s">{[!a.has_evidence && 'No evidence linked', a.missing.length > 0 && `Missing ${a.missing.map(humanize).join(', ').toLowerCase()}`].filter(Boolean).join(' · ')}</span>
                      </button>
                      <span className={`tag ${VERIFICATION_INFO[a.verification]?.cls || ''}`}>{VERIFICATION_INFO[a.verification]?.label}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </div>
      )}
    </PortfolioShell>
  );
}

// ─────────────────────────── Category ───────────────────────────

function period(r: RecordRow, type: string): string {
  const start = monthYear(r.start_date);
  const end = r.is_current ? 'Present' : monthYear(r.end_date);
  switch (type) {
    case 'education': return [start, monthYear(r.graduation_date) || monthYear(r.end_date) || (r.status === 'ongoing' ? 'Present' : null)].filter(Boolean).join(' – ') || '—';
    case 'licenses': return monthYear(r.registration_date) || '—';
    case 'awards': return monthYear(r.date_received) || '—';
    case 'publications': return r.publication_date ? r.publication_date.slice(0, 4) : humanize(r.status);
    case 'presentations': return monthYear(r.presentation_date) || '—';
    case 'portfolio_entries': return monthYear(r.event_date) || '—';
    case 'trainings': return start ? (r.end_date && r.end_date !== r.start_date ? `${start} – ${monthYear(r.end_date)}` : fmtDate(r.start_date)) : '—';
    default: return [start, end].filter(Boolean).join(' – ') || '—';
  }
}

function citation(p: RecordRow) {
  const year = p.publication_date ? p.publication_date.slice(0, 4) : 'n.d.';
  const vol = [p.volume && `${p.volume}`, p.issue && `(${p.issue})`].filter(Boolean).join('');
  return [`${p.authors} (${year}).`, `${p.title}.`, [p.venue, vol, p.pages].filter(Boolean).join(', ') + (p.venue ? '.' : ''), p.doi ? `https://doi.org/${p.doi.replace(/^https?:\/\/(dx\.)?doi\.org\//, '')}` : ''].filter(Boolean).join(' ');
}

function describe(r: RecordRow, type: string): { title: string; sub: string; detail?: string; extra?: ReactNode } {
  const j = (...xs: any[]) => xs.filter(Boolean).join(' · ');
  switch (type) {
    case 'education': return { title: r.degree, sub: j(r.major, [r.institution, r.location].filter(Boolean).join(', ')), detail: r.distinctions };
    case 'licenses': {
      let extra: ReactNode = null;
      if (r.valid_until) {
        const d = daysUntil(r.valid_until);
        extra = <span className={`tag ${d < 0 ? 'red' : d <= 60 ? 'orange' : ''}`}>{d < 0 ? 'Expired' : `Valid to ${fmtDate(r.valid_until)}`}</span>;
      }
      return { title: r.license_type, sub: j(r.issuing_authority, r.registration_number_masked && `Reg. no. ${r.registration_number_masked}`), extra };
    }
    case 'employment': return { title: r.position, sub: j(r.institution, r.office, r.employment_type), detail: r.responsibilities };
    case 'appointments': return { title: r.academic_rank, sub: j(r.faculty_designation, [r.department, r.institution].filter(Boolean).join(', ')), detail: r.teaching_responsibilities };
    case 'trainings': return {
      title: r.title, sub: j(r.organizer, humanize(r.training_type), r.role !== 'participant' && humanize(r.role), r.location),
      extra: (r.hours != null || r.cpd_units != null) ? <span className="num faint" style={{ fontSize: 12 }}>{[r.hours != null && `${fmtNum(r.hours)} h`, r.cpd_units != null && `${fmtNum(r.cpd_units)} CPD`].filter(Boolean).join(' · ')}</span> : null,
    };
    case 'awards': return { title: r.title, sub: j(r.issuer, r.level), detail: r.description };
    case 'memberships': return { title: r.organization, sub: j(r.membership_type, r.member_id && `ID ${r.member_id}`) };
    case 'committees': return { title: r.committee, sub: j(r.role, humanize(r.assignment_type), r.institution), detail: r.description };
    case 'portfolio_entries': return { title: r.title, sub: humanize(r.category), detail: r.description };
    case 'publications': return { title: r.title, sub: j(humanize(r.publication_type), humanize(r.status), r.indexing), detail: citation(r) };
    case 'presentations': return { title: r.title, sub: j(r.conference, r.location, humanize(r.presentation_type)) };
    case 'research_projects': return { title: r.title, sub: j(r.role, humanize(r.status)), detail: r.objectives };
    default: return { title: r._title, sub: '' };
  }
}

const sortKey = (r: RecordRow, dateField: string | null) => (r.is_current ? '9999' : '') + (r[dateField || ''] || r.end_date || r.start_date || r.created_at || '');

type Filter = 'all' | 'evidence' | 'unconfirmed' | 'incomplete';

function ResourceList({ type }: { type: string }) {
  const { schema, openRecord, openNew } = useApp();
  const spec = schema?.[type];
  const [items, setItems] = useState<RecordRow[] | null>(null);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<'newest' | 'oldest' | 'updated'>('newest');

  const load = useCallback(() => { api.get<{ items: RecordRow[] }>(`/records/${type}?limit=500`).then((d) => setItems(d.items)).catch(() => setItems([])); }, [type]);
  useEffect(() => { setItems(null); load(); return onDataChanged(load); }, [load]);

  const shown = useMemo(() => {
    if (!items) return [];
    const term = q.trim().toLowerCase();
    let out = items.filter((r) => {
      if (filter === 'evidence' && r._evidence_count) return false;
      if (filter === 'unconfirmed' && r.verification !== 'self_reported') return false;
      if (filter === 'incomplete' && !(r._missing || []).length) return false;
      if (!term) return true;
      return Object.values(r).some((v) => typeof v === 'string' && v.toLowerCase().includes(term));
    });
    const dateField = spec?.date || null;
    out = [...out].sort((a, b) => {
      if (sort === 'updated') return b.updated_at.localeCompare(a.updated_at);
      const c = sortKey(a, dateField).localeCompare(sortKey(b, dateField));
      return sort === 'newest' ? -c : c;
    });
    return out;
  }, [items, q, filter, sort, spec]);

  if (!spec) return null;
  const recommended = spec.recommended || [];
  const counts = items ? {
    all: items.length,
    evidence: items.filter((r) => !r._evidence_count).length,
    unconfirmed: items.filter((r) => r.verification === 'self_reported').length,
    incomplete: items.filter((r) => (r._missing || []).length).length,
  } : null;

  return (
    <div>
      <div className="toolbar">
        <input className="input filter-input" type="search" placeholder={`Filter ${spec.label.toLowerCase()} records…`} value={q} onChange={(e) => setQ(e.target.value)} aria-label="Filter records" />
        <div className="seg" role="group" aria-label="Show">
          {([['all', 'All'], ['evidence', 'Needs evidence'], ['unconfirmed', 'Unconfirmed'], ['incomplete', 'Missing details']] as [Filter, string][]).map(([k, l]) => (
            <button key={k} aria-pressed={filter === k} onClick={() => setFilter(k)}>{l}{counts ? ` · ${counts[k]}` : ''}</button>
          ))}
        </div>
        <select className="select" style={{ width: 'auto', height: 32 }} value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} aria-label="Sort order">
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="updated">Recently edited</option>
        </select>
        <span style={{ flex: 1 }} />
        <button className="btn btn-primary btn-sm" onClick={() => openNew(type)}><Icon name="plus" />Add {spec.label.toLowerCase()}</button>
      </div>
      {!items ? <div className="skeleton" style={{ height: 120 }} /> : items.length === 0 ? (
        <div className="panel"><div className="panel-body">
          <div className="empty"><strong>No {spec.label.toLowerCase()} records yet.</strong>Add your first one. You can link supporting evidence afterwards.
            <div><button className="btn btn-sm" onClick={() => openNew(type)}><Icon name="plus" />Add {spec.label.toLowerCase()}</button></div>
          </div>
        </div></div>
      ) : shown.length === 0 ? (
        <div className="empty">No records match this filter.</div>
      ) : (
        <div className="dossier">
          {shown.map((r) => {
            const d = describe(r, type);
            const ver = VERIFICATION_INFO[r.verification] || VERIFICATION_INFO.self_reported;
            const missing = r._missing || [];
            return (
              <button key={r.id} className="dossier-row" onClick={() => openRecord(type, r.id)}>
                <div className="when">{period(r, type)}{r.is_current ? <div><span className="tag orange" style={{ marginTop: 4 }}>Current</span></div> : null}</div>
                <div className="what">
                  <div className="t">{d.title}</div>
                  {d.sub && <div className="s">{d.sub}</div>}
                  {d.detail && <div className="d">{d.detail}</div>}
                </div>
                <div className="status">
                  <div className="row">
                    {recommended.length > 0 && <Ring done={recommended.length - missing.length} total={recommended.length} label={`${recommended.length - missing.length} of ${recommended.length} key details`} />}
                  </div>
                  <span className={`tag ${ver.cls}`}>{ver.label}</span>
                  <span className={`tag ${r._evidence_count ? 'ok' : ''}`}>{r._evidence_count ? `${r._evidence_count} evidence` : 'No evidence'}</span>
                  {d.extra}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CategoryStats({ cat, summary }: { cat: PortfolioCategory; summary: PortfolioSummary | null }) {
  const c = summary?.categories.find((x) => x.key === cat.key);
  if (!c) return null;
  return (
    <div className="stat-row" style={{ marginBottom: 'var(--s-4)' }}>
      <div className="stat"><div className={`v ${c.total ? '' : 'zero'}`}>{c.total}</div><div className="k">Records</div></div>
      <div className="stat"><div className={`v ${c.evidenced ? '' : 'zero'}`}>{c.evidenced}</div><div className="k">With evidence</div></div>
      <div className="stat"><div className={`v ${c.confirmed ? '' : 'zero'}`}>{c.confirmed}</div><div className="k">Confirmed</div></div>
      <div className="stat"><div className={`v ${c.incomplete ? '' : 'zero'}`}>{c.incomplete}</div><div className="k">Missing details</div></div>
      {cat.key === 'development' && summary && (
        <>
          <div className="stat"><div className="v">{fmtNum(summary.development.hours)}</div><div className="k">Total hours</div></div>
          <div className="stat"><div className="v">{fmtNum(summary.development.cpd_units)}</div><div className="k">CPD units</div></div>
        </>
      )}
      {cat.key === 'licenses' && summary && (
        <div className="stat"><div className={`v ${summary.licences.expired + summary.licences.expiring ? '' : 'zero'}`} style={summary.licences.expired ? { color: 'var(--red)' } : undefined}>{summary.licences.expired + summary.licences.expiring}</div><div className="k">Expired / expiring</div></div>
      )}
    </div>
  );
}

export function PortfolioCategoryPage() {
  const { category = '' } = useParams();
  const cat = categoryByKey[category];
  const [tab, setTab] = useState(0);
  const summary = useSummary();
  useEffect(() => setTab(0), [category]);
  if (!cat) return <PortfolioShell title="Not found" crumb=""><div className="empty">Unknown portfolio section. <Link to="/portfolio">Back to overview</Link></div></PortfolioShell>;
  const idx = Math.min(tab, cat.resources.length - 1);
  return (
    <PortfolioShell title={cat.label} crumb={cat.code} sub={cat.description}>
      <CategoryStats cat={cat} summary={summary} />
      {cat.resources.length > 1 && (
        <div className="tabs" role="tablist" style={{ marginBottom: 'var(--s-4)' }}>
          {cat.resources.map((r, i) => <button key={r.type} role="tab" aria-selected={idx === i} onClick={() => setTab(i)}>{r.tab}</button>)}
        </div>
      )}
      <ResourceList key={cat.resources[idx].type} type={cat.resources[idx].type} />
    </PortfolioShell>
  );
}
