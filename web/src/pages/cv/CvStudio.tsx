import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError, onDataChanged } from '../../lib/api';
import { fmtDateTime, relTime } from '../../lib/format';
import { CV_TYPES, NEW_CV_TYPES, FORMAT_LABEL, fmtBytes, type CvCatalog, type CvExport, type CvListItem, type CvView } from '../../lib/cv';
import { Overlay } from '../../components/Overlay';
import { Field } from '../../components/Field';
import { Icon } from '../../components/Icon';
import { PhotoManager } from '../../components/PhotoManager';
import { useApp } from '../../components/AppContext';

function NewCvDialog({ catalog, onClose }: { catalog: CvCatalog; onClose: () => void }) {
  const navigate = useNavigate();
  const { toast } = useApp();
  const [name, setName] = useState('');
  const [type, setType] = useState('reclassification');
  const [tpl, setTpl] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setErrors({});
    try {
      const cv = await api.post<CvView>('/cv', { name, cv_type: type, ...(tpl ? { template_key: tpl } : {}) });
      toast('CV created from your portfolio', 'ok');
      navigate(`/cv/${cv.id}`);
    } catch (err) {
      if (err instanceof ApiError) setErrors(err.details || { name: err.message });
      setBusy(false);
    }
  }

  return (
    <Overlay onClose={onClose} label="New CV">
      <form className="modal" onSubmit={submit}>
        <div className="modal-head"><Icon name="cv" size={18} /><h2>New curriculum vitae</h2><button type="button" className="icon-btn sm" onClick={onClose} aria-label="Close"><Icon name="close" /></button></div>
        <div className="modal-body">
          <Field label="Name" required error={errors.name} hint="For your own reference, e.g. “Instructor I application — CSU”.">
            <input className="input" data-autofocus value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
          </Field>
          <Field label="CV type" error={errors.cv_type} hint="Sets which sections are shown and their order. You can change everything later.">
            <select className="select" value={type} onChange={(e) => setType(e.target.value)}>
              {Object.entries(NEW_CV_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Field>
          <Field label="Template" hint="Switch templates any time without losing content.">
            <select className="select" value={tpl} onChange={(e) => setTpl(e.target.value)}>
              <option value="">Recommended for this type</option>
              {catalog.templates.map((t) => <option key={t.key} value={t.key}>{t.name}</option>)}
            </select>
          </Field>
          <div className="alert info">Every eligible portfolio record is included to start with. Records you add to your portfolio later are offered to this CV; they are never added silently.</div>
        </div>
        <div className="modal-foot"><span /><button className="btn btn-primary" disabled={busy}>{busy ? 'Building…' : 'Create CV'}</button></div>
      </form>
    </Overlay>
  );
}

export function CvStudio() {
  const navigate = useNavigate();
  const [cvs, setCvs] = useState<CvListItem[] | null>(null);
  const [exports, setExports] = useState<CvExport[] | null>(null);
  const [catalog, setCatalog] = useState<CvCatalog | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(() => {
    api.get<CvListItem[]>('/cv').then(setCvs).catch(() => setCvs([]));
    api.get<CvExport[]>('/cv/exports').then(setExports).catch(() => setExports([]));
  }, []);
  useEffect(() => { load(); api.get<CvCatalog>('/cv/catalog').then(setCatalog); return onDataChanged(load); }, [load]);

  const families = (cvs || []).reduce<Record<number, CvListItem[]>>((acc, c) => { (acc[c.family_id] ||= []).push(c); return acc; }, {});

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="crumb"><span className="bar" /><span className="label">Professional Development · Curriculum Vitae Studio</span></div>
          <h1 className="display">Curriculum Vitae Studio</h1>
          <div className="sub">Comprehensive academic CVs built from your Professional Portfolio. Editable Word and text-based PDF output, checked for applicant tracking systems.</div>
        </div>
        <div className="actions"><button className="btn btn-accent" onClick={() => setCreating(true)} disabled={!catalog}><Icon name="plus" />New CV</button></div>
      </div>

      <div className="stack" style={{ gap: 'var(--s-6)' }}>
        <section>
          <h2 className="label" style={{ marginBottom: 'var(--s-3)' }}>Your CVs</h2>
          {!cvs ? <div className="skeleton" style={{ height: 120 }} /> : cvs.length === 0 ? (
            <div className="panel"><div className="panel-body">
              <div className="empty"><strong>No CVs yet.</strong>Create one — it is assembled from your portfolio records, which stay the single source of truth.
                <div><button className="btn btn-sm" onClick={() => setCreating(true)}><Icon name="plus" />New CV</button></div></div>
            </div></div>
          ) : (
            <div className="cat-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
              {Object.values(families).map((versions) => {
                const latest = versions[0];
                return (
                  <div key={latest.family_id} className="cat-card" style={{ cursor: 'default' }}>
                    <div className="between">
                      <span className="label">{CV_TYPES[latest.cv_type] || latest.cv_type}</span>
                      <span className={`tag ${latest.status === 'finalized' ? 'ok' : 'orange'}`}>{latest.status === 'finalized' ? 'Finalized' : 'Draft'} · v{latest.version}</span>
                    </div>
                    <div style={{ color: 'var(--text)', fontSize: 18, fontWeight: 500 }}>{latest.name}</div>
                    <div className="faint" style={{ fontSize: 13 }}>{latest.template_name} · updated {relTime(latest.updated_at)}</div>
                    {latest.pending > 0 && <div className="tag violet" style={{ alignSelf: 'flex-start' }}>{latest.pending} new portfolio record{latest.pending > 1 ? 's' : ''} to review</div>}
                    <div className="row wrap" style={{ marginTop: 'auto' }}>
                      <button className="btn btn-primary btn-sm" onClick={() => navigate(`/cv/${latest.id}`)}><Icon name="edit" />Open</button>
                      {versions.length > 1 && (
                        <select className="select" style={{ width: 'auto', height: 28 }} aria-label="Open another version" value="" onChange={(e) => e.target.value && navigate(`/cv/${e.target.value}`)}>
                          <option value="">{versions.length} versions…</option>
                          {versions.map((v) => <option key={v.id} value={v.id}>v{v.version} — {v.status}</option>)}
                        </select>
                      )}
                      <span className="faint" style={{ fontSize: 12, marginLeft: 'auto' }}>{latest.export_count} export{latest.export_count === 1 ? '' : 's'}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="panel">
          <header className="panel-head"><span className="code">IMG</span><h2>Professional photographs</h2></header>
          <div className="panel-body">
            <p className="faint" style={{ marginTop: 0, fontSize: 13 }}>Photographs are optional. They are not universally recommended for ATS submissions, and the ATS exports always omit them.</p>
            <PhotoManager />
          </div>
        </section>

        <section className="panel">
          <header className="panel-head"><span className="code">EXP</span><h2>Export history</h2><span className="num faint">{exports?.length ?? ''}</span></header>
          <div className="panel-body">
            {!exports ? <div className="skeleton" /> : exports.length === 0 ? <div className="empty">Nothing exported yet.</div> : (
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>File</th><th>Format</th><th>CV</th><th>Size</th><th>Exported</th><th /></tr></thead>
                  <tbody>
                    {exports.map((x) => (
                      <tr key={x.id}>
                        <td className="mono" style={{ fontSize: 12 }}>{x.file_name}</td>
                        <td>{FORMAT_LABEL[x.format]}</td>
                        <td className="muted">{x.cv_name} v{x.cv_version}{x.cv_status === 'draft' ? ' (draft)' : ''}</td>
                        <td className="num faint">{fmtBytes(x.size_bytes)}</td>
                        <td className="num faint" style={{ whiteSpace: 'nowrap' }}>{fmtDateTime(x.created_at)}</td>
                        <td style={{ textAlign: 'right' }}><a className="btn btn-sm" href={`/api/cv/exports/${x.id}/download`} download><Icon name="download" />Save</a></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      </div>
      {creating && catalog && <NewCvDialog catalog={catalog} onClose={() => setCreating(false)} />}
    </div>
  );
}
