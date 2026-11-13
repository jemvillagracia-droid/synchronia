import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, dataChanged, uploadFile } from '../../lib/api';
import { useApp } from '../../components/AppContext';
import { Icon } from '../../components/Icon';
import { Overlay } from '../../components/Overlay';
import { Field } from '../../components/Field';
import { AutoText } from '../../components/AutoText';

interface Preview {
  source: string;
  course: { code: string; title: string; contact_hours: number | null; units: number | null; program: string; description: string };
  academic_year: string; semester: 'first' | 'second' | 'summer' | null;
  institution: Record<string, string>;
  pos: { code: string; description: string; group_label: string }[];
  clos: { code: string; description: string }[];
  alignments: { clo: string; po: string; level: string }[];
  content: any; warnings: string[];
}

/** "Import syllabus" button: reads a .docx, shows what was recognised, and saves only after review. */
export function SyllabusImportButton({ className = 'btn' }: { className?: string }) {
  const { toast } = useApp();
  const navigate = useNavigate();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [p, setP] = useState<Preview | null>(null);
  const [saving, setSaving] = useState(false);

  async function read(f: File) {
    setBusy(true);
    try { setP(await uploadFile<Preview>('/academic/syllabi/import', f)); } catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(false); }
  }
  async function commit() {
    if (!p) return;
    setSaving(true);
    try {
      const r = await api.post<{ course_id: number; syllabus_id: number; counts: any; institution_filled: boolean }>('/academic/syllabi/import/commit', p);
      dataChanged();
      toast(`Imported ${p.course.code}: ${r.counts.course_outcomes} CILOs, ${r.counts.program_outcomes} program outcomes, ${r.counts.alignments} map links${r.institution_filled ? '; institution details filled' : ''}.`, 'ok');
      setP(null);
      navigate(`/academic/courses/${r.course_id}?tab=syllabus&open=${r.syllabus_id}`);
    } catch (e) { toast((e as Error).message, 'error'); } finally { setSaving(false); }
  }
  const setCourse = (patch: Partial<Preview['course']>) => p && setP({ ...p, course: { ...p.course, ...patch } });
  const close = () => { if (!saving) setP(null); };
  const total = p ? p.content.grading.reduce((n: number, g: any) => n + g.weight, 0) : 0;

  return (
    <>
      <input ref={input} type="file" hidden accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) read(f); }} />
      <button className={className} disabled={busy} onClick={() => input.current?.click()}><Icon name="upload" />{busy ? 'Reading…' : 'Import syllabus (.docx)'}</button>
      {p && (
        <Overlay onClose={close} label="Import syllabus">
          <aside className="drawer">
            <div className="modal-head"><span className="label">Import syllabus · {p.source}</span><span style={{ flex: 1 }} />
              <button className="icon-btn sm" onClick={close} aria-label="Close"><Icon name="close" /></button></div>
            <div className="modal-body stack" style={{ gap: 'var(--s-5)' }}>
              <div>
                <h2 className="display" style={{ fontSize: 30, margin: 0 }}>Review before importing</h2>
                <p className="muted" style={{ margin: '6px 0 0', fontSize: 14 }}>Nothing is saved yet. Check the course details; everything else can be edited after import in the syllabus editor and the Outcomes tab.</p>
              </div>
              {p.warnings.length > 0 && <div className="alert" role="status"><strong>Check these:</strong><ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>{p.warnings.map((w) => <li key={w}>{w}</li>)}</ul></div>}
              <div className="import-summary">
                {([[p.pos.length, 'program outcomes'], [p.clos.length, 'course outcomes (CILOs)'], [p.alignments.length, 'curriculum-map links'], [p.content.weeks.length, 'weeks in the outline'],
                  [p.content.references.length, 'references'], [`${total}%`, 'grading total']] as [number | string, string][]).map(([n, l]) => <div className="cell" key={l}><div className="n">{n}</div><div className="l">{l}</div></div>)}
              </div>
              <div className="form-grid">
                <Field label="Course code" required><AutoText value={p.course.code} onChange={(v) => setCourse({ code: v })} /></Field>
                <Field label="Course title" required><AutoText value={p.course.title} onChange={(v) => setCourse({ title: v })} /></Field>
                <Field label="Contact hours"><input className="input" type="number" min={0} value={p.course.contact_hours ?? ''} onChange={(e) => setCourse({ contact_hours: e.target.value === '' ? null : Number(e.target.value) })} /></Field>
                <Field label="Credit units"><input className="input" type="number" min={0} step="0.5" value={p.course.units ?? ''} onChange={(e) => setCourse({ units: e.target.value === '' ? null : Number(e.target.value) })} /></Field>
                <Field label="Program" className="span-2"><AutoText value={p.course.program} onChange={(v) => setCourse({ program: v })} /></Field>
                <Field label="School year"><AutoText value={p.academic_year} onChange={(v) => setP({ ...p, academic_year: v })} placeholder="2026-2027" /></Field>
                <Field label="Semester"><select className="select" value={p.semester || ''} onChange={(e) => setP({ ...p, semester: (e.target.value || null) as Preview['semester'] })}>
                  <option value="">Not stated</option><option value="first">1st semester</option><option value="second">2nd semester</option><option value="summer">Summer</option></select></Field>
              </div>
              <details className="import-details"><summary>Program outcomes ({p.pos.length})</summary>
                <ul className="list">{p.pos.map((o, i) => <li key={o.code} className={o.group_label && o.group_label !== p.pos[i - 1]?.group_label ? 'group-start' : undefined}>
                  {o.group_label && o.group_label !== p.pos[i - 1]?.group_label && <div className="group-label">{o.group_label}</div>}
                  <span className="tag violet">{o.code}</span><span className="grow">{o.description}</span></li>)}</ul></details>
              <details className="import-details"><summary>Course intended learning outcomes ({p.clos.length})</summary>
                <ul className="list">{p.clos.map((o) => <li key={o.code}><span className="tag orange">{o.code}</span><span className="grow">{o.description}</span></li>)}</ul></details>
              <details className="import-details"><summary>Course outline ({p.content.weeks.length} weeks)</summary>
                <ul className="list">{p.content.weeks.map((w: any, i: number) => <li key={i}><span className="tag">Wk {w.week}</span><span className="grow">{w.content || w.ilos}{w.assessment ? <span className="faint"> — {w.assessment}</span> : null}</span></li>)}</ul></details>
              <details className="import-details"><summary>Institution and signatories</summary>
                <dl className="dl">{Object.entries(p.institution).filter(([, v]) => v).flatMap(([k, v]) => [<dt key={`t${k}`}>{k.replace(/_/g, ' ')}</dt>, <dd key={`d${k}`}>{v}</dd>])}</dl>
                <p className="faint" style={{ fontSize: 13 }}>Only empty fields in Settings → Institution are filled; anything you have already set is kept.</p></details>
            </div>
            <div className="modal-foot">
              <button type="button" className="btn btn-ghost" onClick={close} disabled={saving}>Cancel</button>
              <button type="button" className="btn btn-primary" onClick={commit} disabled={saving || !p.course.code.trim() || !p.course.title.trim()}>{saving ? 'Importing…' : 'Import into workspace'}</button>
            </div>
          </aside>
        </Overlay>
      )}
    </>
  );
}
