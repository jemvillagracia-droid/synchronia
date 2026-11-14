import { useEffect, useRef, useState } from 'react';
import { api, uploadFile } from '../lib/api';
import { fmtDateTime } from '../lib/format';
import { useApp } from '../components/AppContext';
import { Icon } from '../components/Icon';
import { Field } from '../components/Field';
import { AutoText } from '../components/AutoText';
import { useAutosave } from '../lib/autosave';
import { SaveIndicator } from '../components/SaveIndicator';

type Inst = Record<string, string> & { letterhead?: any; updated_at?: string | null };
const TEXT: [string, string, string?][] = [['university', 'University'], ['campus', 'Campus'], ['college', 'College / office', 'Printed at the top of the syllabus, e.g. COLLEGE OF EDUCATION']];
// Settings keeps only what applies to every exported document (the letterhead and the institution's name lines).
// Vision, mission, goals and signatories are written in each document that needs them (1.2).
const FIELDS = ['university', 'campus', 'college', 'office_line', 'contact_line'];
const pick = (i: Inst) => Object.fromEntries(FIELDS.map((k) => [k, i[k] || '']));

export function InstitutionSettings() {
  const { toast } = useApp();
  const [inst, setInst] = useState<Inst | null>(null);
  const [v, setV] = useState<Record<string, string> | null>(null);
  const [busy, setBusy] = useState(false);
  const [stamp, setStamp] = useState(0);
  const file = useRef<HTMLInputElement>(null);
  useEffect(() => { api.get<Inst>('/academic/institution').then((d) => { setInst(d); setV(pick(d)); }); }, []);
  const auto = useAutosave('institution', v, async (x) => { const d = await api.put<Inst>('/academic/institution', x); setInst(d); });
  if (!inst || !v) return <div className="skeleton" style={{ height: 240 }} />;
  const set = (k: string, val: string) => setV({ ...v, [k]: val });
  const lh = inst.letterhead;

  async function importTemplate(f: File) {
    setBusy(true);
    try {
      await auto.flush();
      const d = await uploadFile<Inst>('/academic/institution/letterhead', f);
      setInst(d); setV(pick(d)); auto.rebase(pick(d)); setStamp(Date.now());
      toast('Letterhead imported. It now appears on every exported document.', 'ok');
    } catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(false); }
  }
  async function remove() {
    if (!window.confirm('Remove the letterhead? Exported documents will use a plain header.')) return;
    const d = await api.del<Inst>('/academic/institution/letterhead');
    setInst(d); toast('Letterhead removed', 'ok');
  }

  return (
    <div className="stack">
      <section className="panel">
        <header className="panel-head"><span className="code">LH</span><h2>Official letterhead</h2>
          <SaveIndicator state={auto.state} savedAt={auto.savedAt} error={auto.error} /></header>
        <div className="panel-body stack">
          <p className="muted" style={{ margin: 0, fontSize: 13.5 }}>
            Import your office’s blank Word template (for example “Template Order of Details 8.5 x 13”). Its header and footer banners are copied into
            SYNCHRONIA and placed on every syllabus, TOS, rubric and report you export. The template file itself is not changed.
          </p>
          <input ref={file} type="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" hidden
            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) importTemplate(f); }} />
          <div className="row wrap">
            <button className="btn btn-primary" disabled={busy} onClick={() => file.current?.click()}><Icon name="upload" />{busy ? 'Importing…' : lh ? 'Replace from template…' : 'Import from Word template…'}</button>
            {lh && <button className="btn btn-ghost" onClick={remove}><Icon name="trash" />Remove letterhead</button>}
          </div>
          {lh ? (
            <>
              <div className="faint" style={{ fontSize: 13 }}>From <b>{lh.source}</b> · imported {fmtDateTime(lh.imported_at)}</div>
              <div className="letterhead-preview" aria-label="Letterhead preview">
                {lh.header && <img src={`/api/academic/institution/letterhead/header?v=${stamp || lh.imported_at}`} alt="Header banner" />}
                <div className="lh-lines">
                  {v.office_line && !/_{3,}/.test(v.office_line) ? <div><b>{v.office_line}</b></div> : <div className="faint">Office line (set below)</div>}
                  {v.contact_line && !/_{3,}/.test(v.contact_line) && <div style={{ fontSize: 12 }}>{v.contact_line}</div>}
                </div>
                {lh.footer && <img src={`/api/academic/institution/letterhead/footer?v=${stamp || lh.imported_at}`} alt="Footer banner" />}
              </div>
            </>
          ) : <div className="empty">No letterhead yet. Exports use a plain title block until you import one.</div>}
          <div className="form-grid">
            <Field label="Office line under the banner" hint="Lines with blanks (____) are left off the page."><AutoText value={v.office_line} onChange={(x) => set('office_line', x)} placeholder="Office of the Dean, College of Education" /></Field>
            <Field label="Contact line"><AutoText value={v.contact_line} onChange={(x) => set('contact_line', x)} placeholder="Tel. No. … · Email Address: …@urs.edu.ph" /></Field>
          </div>
        </div>
      </section>

      <section className="panel">
        <header className="panel-head"><span className="code">DOC</span><h2>Document headers</h2></header>
        <div className="panel-body stack">
          <p className="muted" style={{ margin: 0, fontSize: 13.5 }}>The institution's name lines used in exported documents. Vision, mission, goals and signatories are not set here: write them in the syllabus or document that needs them, so nothing is assumed.</p>
          <div className="form-grid">
            {TEXT.map(([k, label, hint]) => <Field key={k} label={label} hint={hint}><AutoText value={v[k]} onChange={(x) => set(k, x)} /></Field>)}
          </div>
          {inst.updated_at && <div className="faint" style={{ fontSize: 12.5 }}>Last saved {fmtDateTime(inst.updated_at)}</div>}
        </div>
      </section>
    </div>
  );
}
