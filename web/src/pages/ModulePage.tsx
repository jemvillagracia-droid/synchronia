import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, onDataChanged } from '../lib/api';
import { fmtDate, humanize, relTime } from '../lib/format';
import type { ModuleDef } from '../lib/modules';
import type { RecordRow } from '../lib/types';
import { useApp } from '../components/AppContext';
import { Icon } from '../components/Icon';

function Register({ type }: { type: string }) {
  const { schema, openRecord, openNew } = useApp();
  const spec = schema?.[type];
  const [data, setData] = useState<{ total: number; items: RecordRow[] } | null>(null);
  const [all, setAll] = useState(false);
  const load = useCallback(() => {
    api.get<{ total: number; items: RecordRow[] }>(`/records/${type}?limit=${all ? 200 : 5}`).then(setData).catch(() => setData({ total: 0, items: [] }));
  }, [type, all]);
  useEffect(() => { load(); return onDataChanged(load); }, [load]);
  if (!spec) return null;
  return (
    <section className="panel">
      <header className="panel-head">
        <h2>{spec.label}</h2>
        <span className="num faint">{data ? data.total : '…'}</span>
        <button className="btn btn-sm" onClick={() => openNew(type)} aria-label={`Add ${spec.label}`}><Icon name="plus" />Add</button>
      </header>
      <div className="panel-body" style={{ paddingTop: 'var(--s-2)', paddingBottom: 'var(--s-2)' }}>
        {!data ? <div className="skeleton" /> : data.items.length === 0 ? (
          <div className="empty">No {spec.label.toLowerCase()} records yet.</div>
        ) : (
          <ul className="list">
            {data.items.map((r) => {
              const sub = spec.subtitle.map((k) => r[k]).filter(Boolean).map((v) => humanize(String(v))).join(' · ');
              return (
                <li key={r.id}>
                  <button className="rowlink" onClick={() => openRecord(type, r.id)}>
                    <span className="t">{r._title}</span>
                    <span className="s">{[sub, spec.date && r[spec.date] ? fmtDate(r[spec.date]) : null].filter(Boolean).join(' · ') || `Updated ${relTime(r.updated_at)}`}</span>
                  </button>
                  {r.verification === 'user_confirmed' && <span className="tag violet">Confirmed</span>}
                  {r.verification === 'evidence_verified' && <span className="tag ok">Evidenced</span>}
                </li>
              );
            })}
          </ul>
        )}
      </div>
      {data && data.total > 5 && (
        <div className="panel-foot">
          <button className="btn btn-ghost btn-sm" onClick={() => setAll((a) => !a)}>{all ? 'Show fewer' : `Show all ${data.total}`}</button>
        </div>
      )}
    </section>
  );
}

export function ModulePage({ mod }: { mod: ModuleDef }) {
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="crumb"><span className="bar" /><span className="label">{mod.code} · {mod.label}</span></div>
          <h1 className="display">{mod.label}</h1>
          <div className="sub">{mod.summary}</div>
        </div>
        {mod.id === 'portfolio' && (
          <div className="actions"><Link to="/portfolio/profile" className="btn btn-primary"><Icon name="user" />Professional profile</Link></div>
        )}
      </div>

      <section className="panel accent-orange" style={{ marginBottom: 'var(--s-6)' }}>
        <div className="hazard" />
        <div className="phase-banner">
          <div className="phase-num display" aria-hidden>{String(mod.phase).padStart(2, '0')}</div>
          <div>
            <div className="label" style={{ color: 'var(--orange)' }}>Development phase {mod.phase}</div>
            <p style={{ margin: 'var(--s-2) 0 0', maxWidth: '72ch' }}>
              The full {mod.label} workspace is built in Phase {mod.phase}. Its database is already in place
              {mod.resources.length > 0 ? ', and the basic registers below already save real records. They will carry straight into the full workspace without migration.' : '. It will read from the records you build up elsewhere in SYNCHRONIA.'}
            </p>
          </div>
        </div>
      </section>

      <h2 className="label" style={{ marginBottom: 'var(--s-3)' }}>Planned capabilities</h2>
      <div className="cap-grid" style={{ marginBottom: 'var(--s-8)' }}>
        {mod.capabilities.map((c) => (
          <div className="cap" key={c.title}>
            <h3>{c.title}</h3>
            <ul>{c.items.map((i) => <li key={i}>{i}</li>)}</ul>
          </div>
        ))}
      </div>

      {mod.resources.length > 0 && (
        <>
          <div className="between" style={{ marginBottom: 'var(--s-3)' }}>
            <h2 className="label" style={{ margin: 0 }}>Basic registers · available now</h2>
          </div>
          <div className="widget-grid">
            {mod.resources.map((r) => <div key={r} className="w-4" style={{ display: 'flex', flexDirection: 'column' }}><Register type={r} /></div>)}
          </div>
        </>
      )}
    </div>
  );
}
