import { useCallback, useEffect, useState } from 'react';
import { api, onDataChanged } from '../../lib/api';
import { humanize } from '../../lib/format';
import { useApp } from '../../components/AppContext';
import { Icon } from '../../components/Icon';

const PIPELINE = ['idea', 'proposal', 'approved', 'data_collection', 'analysis', 'writing', 'completed'];

function Pipeline({ o }: { o: { research: { projects: any[]; by_status: Record<string, number> } } }) {
  const { openNew, openRecord } = useApp();
  const cols = PIPELINE.filter((s) => s !== 'idea' || o.research.by_status.idea);
  return (
    <div className="stack" style={{ gap: 'var(--s-4)' }}>
      <div className="row"><button className="btn btn-primary" onClick={() => openNew('research_projects')}><Icon name="plus" />Add research project</button>
        <span className="faint" style={{ fontSize: 13 }}>Publications and presentations linked to a project appear on its card and flow into your portfolio and CVs.</span></div>
      {o.research.projects.length === 0 ? <div className="empty"><strong>No research projects yet.</strong>Track proposals, instruments, validation, ethics review and data collection here.</div> : (
        <div className="pipeline">
          {cols.map((st) => (
            <div key={st} className="pipeline-col">
              <div className="pipeline-head"><span>{humanize(st)}</span><span className="num">{o.research.by_status[st] || 0}</span></div>
              {o.research.projects.filter((p) => p.status === st).map((p) => (
                <button key={p.id} className="pipeline-card" onClick={() => openRecord('research_projects', p.id)}>
                  <span className="t">{p.title}</span>
                  {p.role && <span className="s">{p.role}</span>}
                  {p.progress_pct != null && (<><div className="meter mt-2"><span style={{ width: `${p.progress_pct}%` }} /></div><span className="s num">{p.progress_pct}% complete</span></>)}
                  {p.target_sample ? <span className="s num">Data: {p.collected_sample || 0} / {p.target_sample}</span> : null}
                  <div className="row wrap" style={{ gap: 4, marginTop: 6 }}>
                    {p.validation_status && <span className={`tag ${p.validation_status === 'validated' ? 'ok' : ''}`}>Instrument: {humanize(p.validation_status)}</span>}
                    {p.ethics_status && <span className={`tag ${p.ethics_status === 'approved' ? 'ok' : p.ethics_status === 'revisions_requested' ? 'orange' : ''}`}>Ethics: {humanize(p.ethics_status)}</span>}
                    {p.publications > 0 && <span className="tag violet">{p.publications} publication{p.publications > 1 ? 's' : ''}</span>}
                    {p.presentations > 0 && <span className="tag violet">{p.presentations} presentation{p.presentations > 1 ? 's' : ''}</span>}
                  </div>
                </button>
              ))}
            </div>
          ))}
          {o.research.by_status.discontinued ? <div className="faint" style={{ fontSize: 12 }}>{o.research.by_status.discontinued} discontinued project(s) not shown.</div> : null}
        </div>
      )}
    </div>
  );
}

export function ResearchPage() {
  const [o, setO] = useState<any>(null);
  const load = useCallback(() => { api.get('/academic/overview').then(setO).catch(() => {}); }, []);
  useEffect(() => { load(); return onDataChanged(load); }, [load]);
  return (
    <div className="page">
      <div className="page-head"><div>
        <div className="crumb"><span className="bar" /><span className="label">Academic Operations · Research Development</span></div>
        <h1 className="display">Research Development</h1>
      </div></div>
      {!o ? <div className="skeleton" style={{ height: 200 }} /> : <Pipeline o={o} />}
    </div>
  );
}
