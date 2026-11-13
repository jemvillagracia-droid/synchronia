import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, ApiError, dataChanged } from '../../lib/api';
import { fmtDateTime, humanize } from '../../lib/format';
import { CV_TYPES, FORMAT_LABEL, type Analysis, type CvCatalog, type CvEntry, type CvSection, type CvSettings, type CvView } from '../../lib/cv';
import { VERIFICATION_INFO } from '../../lib/forms';
import { useApp } from '../../components/AppContext';
import { Icon } from '../../components/Icon';
import { Field } from '../../components/Field';
import { PdfPages } from '../../components/PdfPages';
import { PhotoManager } from '../../components/PhotoManager';
import { AutoText } from '../../components/AutoText';

type Mutate = (p: Promise<CvView>, ok?: string) => Promise<boolean>;

// ─────────────────────────── Entries ───────────────────────────

function EntryEditor({ entry, kind, onSave, onCancel, onReset }: {
  entry: Partial<CvEntry> | null; kind: string; onSave: (c: Record<string, any>) => void; onCancel: () => void; onReset?: () => void;
}) {
  const [title, setTitle] = useState(entry?.title || '');
  const [subtitle, setSubtitle] = useState(entry?.subtitle || '');
  const [dates, setDates] = useState(entry?.dates || '');
  const [details, setDetails] = useState((entry?.details || []).join('\n'));
  const [text, setText] = useState(entry?.text || (entry?.items || []).join('; '));
  const [org, setOrg] = useState(entry?.org || '');
  const [location, setLocation] = useState(entry?.location || '');
  const [role, setRole] = useState(entry?.role || '');
  const textual = kind === 'text' || kind === 'citation' || kind === 'list';
  const harvard = !textual && !!entry?.org; // organization / location / role lines (Harvard layout)
  return (
    <div className="entry-edit stack" style={{ gap: 'var(--s-3)' }}>
      {textual ? (
        <Field label={kind === 'citation' ? 'Citation as it should appear' : kind === 'list' ? 'Items (separate with semicolons)' : 'Text'}>
          <textarea className="textarea" rows={kind === 'text' ? 5 : 3} value={text} onChange={(e) => setText(e.target.value)} spellCheck />
        </Field>
      ) : harvard ? (
        <>
          <div className="form-grid">
            <Field label="Organization (bold, first line)"><AutoText value={org} onChange={setOrg} /></Field>
            <Field label="Location (right)"><AutoText value={location} onChange={setLocation} placeholder="City, Province / Country" /></Field>
            <Field label="Position or degree (italic, second line)"><AutoText value={role} onChange={setRole} /></Field>
            <Field label="Dates (right)"><AutoText value={dates} onChange={setDates} placeholder="e.g. Jun 2021 – Present" /></Field>
          </div>
          <Field label="Bullet points (one per line)" hint="Harvard style: begin with an action verb (Coordinated, Prepared, Developed), quantify results, avoid “I” and “Responsible for”.">
            <textarea className="textarea" rows={4} value={details} onChange={(e) => setDetails(e.target.value)} spellCheck />
          </Field>
        </>
      ) : (
        <>
          <Field label="Title"><AutoText value={title} onChange={setTitle} /></Field>
          <div className="form-grid">
            <Field label="Institution / details line"><AutoText value={subtitle} onChange={setSubtitle} /></Field>
            <Field label="Dates"><AutoText value={dates} onChange={setDates} placeholder="e.g. Jun 2021 – Present" /></Field>
          </div>
          <Field label="Bullet points (one per line)" hint="Begin with an action verb; avoid “I” and “Responsible for”."><textarea className="textarea" rows={4} value={details} onChange={(e) => setDetails(e.target.value)} spellCheck /></Field>
        </>
      )}
      <div className="row wrap">
        <button className="btn btn-primary btn-sm" onClick={() => onSave(textual
          ? (kind === 'list' ? { text: null, title: null, details: text.split(';').map((s) => s.trim()).filter(Boolean) } : { text })
          : harvard ? { org, location, role, dates, details: details.split('\n').map((s) => s.trim()).filter(Boolean) }
            : { title, subtitle, dates, details: details.split('\n').map((s) => s.trim()).filter(Boolean) })}>Save</button>
        <button className="btn btn-ghost btn-sm" onClick={onCancel}>Cancel</button>
        {onReset && <button className="btn btn-ghost btn-sm" onClick={onReset} style={{ marginLeft: 'auto' }}><Icon name="restore" />Use portfolio wording</button>}
      </div>
    </div>
  );
}

function EntryRow({ cv, section, entry, index, count, readOnly, mutate, dnd }: {
  cv: CvView; section: CvSection; entry: CvEntry; index: number; count: number; readOnly: boolean; mutate: Mutate;
  dnd: { onDragStart: () => void; onDrop: () => void; over: boolean; setOver: (b: boolean) => void };
}) {
  const { openRecord } = useApp();
  const [editing, setEditing] = useState(false);
  const label = entry.kind === 'list' ? (entry.items || []).join('; ') : entry.title || entry.text || '(empty)';
  const ver = entry.source?.verification ? VERIFICATION_INFO[entry.source.verification] : null;
  const move = (dir: -1 | 1) => {
    const ids = section.entries.map((e) => e.id);
    const j = index + dir;
    [ids[index], ids[j]] = [ids[j], ids[index]];
    mutate(api.put(`/cv/${cv.id}/sections/${section.id}/entries/order`, { ids }));
  };
  return (
    <li className={`cv-entry ${entry.included ? '' : 'excluded'} ${dnd.over ? 'drop' : ''}`}
      draggable={!readOnly && !editing} onDragStart={dnd.onDragStart} onDragOver={(e) => { e.preventDefault(); dnd.setOver(true); }}
      onDragLeave={() => dnd.setOver(false)} onDrop={(e) => { e.preventDefault(); dnd.setOver(false); dnd.onDrop(); }}>
      <div className="row" style={{ alignItems: 'flex-start' }}>
        {!readOnly && <span className="grip faint" aria-hidden><Icon name="grip" size={14} /></span>}
        <input type="checkbox" className="check" style={{ marginTop: 3 }} checked={entry.included} disabled={readOnly || entry.removed}
          aria-label={`Include “${label}”`} onChange={(e) => mutate(api.patch(`/cv/${cv.id}/entries/${entry.id}`, { included: e.target.checked }))} />
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="t" style={{ whiteSpace: 'normal' }}>{label.length > 160 ? `${label.slice(0, 160)}…` : label}</div>
          <div className="s">{[entry.subtitle, entry.dates].filter(Boolean).join(' · ')}</div>
          <div className="row wrap" style={{ gap: 4, marginTop: 4 }}>
            {entry.manual && <span className="tag">Manual</span>}
            {entry.overridden && <span className="tag orange">Edited for this CV</span>}
            {entry.source?.type === 'profile' && <span className="tag">From profile</span>}
            {ver && <span className={`tag ${ver.cls}`}>{ver.label}</span>}
            {entry.removed && <span className="tag red">Removed from portfolio</span>}
            {entry.missing.length > 0 && <span className="tag" title={entry.missing.join(', ')}>Missing {entry.missing.map((m) => humanize(m).toLowerCase()).join(', ')}</span>}
          </div>
        </div>
        {!readOnly && (
          <div className="row" style={{ gap: 0 }}>
            <button className="icon-btn sm" onClick={() => move(-1)} disabled={index === 0} aria-label="Move up"><Icon name="up" /></button>
            <button className="icon-btn sm" onClick={() => move(1)} disabled={index === count - 1} aria-label="Move down"><Icon name="down" /></button>
            <button className="icon-btn sm" onClick={() => setEditing((x) => !x)} aria-label="Edit wording for this CV"><Icon name="edit" /></button>
            {entry.manual && <button className="icon-btn sm" onClick={() => mutate(api.del(`/cv/${cv.id}/entries/${entry.id}`), 'Entry deleted')} aria-label="Delete entry"><Icon name="trash" /></button>}
          </div>
        )}
      </div>
      {entry.source && entry.source.type !== 'profile' && !entry.removed && (
        <button className="linkbtn" style={{ margin: '4px 0 0 46px' }} onClick={() => openRecord(entry.source!.type, entry.source!.id)}>Open portfolio record</button>
      )}
      {editing && (
        <EntryEditor entry={entry} kind={entry.kind} onCancel={() => setEditing(false)}
          onSave={async (c) => { if (await mutate(api.patch(`/cv/${cv.id}/entries/${entry.id}`, { override: c }), 'Entry updated')) setEditing(false); }}
          onReset={entry.overridden ? async () => { if (await mutate(api.patch(`/cv/${cv.id}/entries/${entry.id}`, { override: null }), 'Using portfolio wording')) setEditing(false); } : undefined} />
      )}
    </li>
  );
}

// ─────────────────────────── Sections ───────────────────────────

function SectionCard({ cv, section, index, count, readOnly, mutate, dnd, expanded, onToggle }: {
  cv: CvView; section: CvSection; index: number; count: number; readOnly: boolean; mutate: Mutate;
  dnd: { onDragStart: () => void; onDrop: () => void; over: boolean; setOver: (b: boolean) => void };
  expanded: boolean; onToggle: () => void;
}) {
  const [heading, setHeading] = useState(section.heading);
  const [adding, setAdding] = useState(false);
  const [dragEntry, setDragEntry] = useState<number | null>(null);
  const [overEntry, setOverEntry] = useState<number | null>(null);
  useEffect(() => setHeading(section.heading), [section.heading]);
  const included = section.entries.filter((e) => e.included).length;
  const move = (dir: -1 | 1) => {
    const ids = cv.sections.map((s) => s.id);
    const j = index + dir;
    [ids[index], ids[j]] = [ids[j], ids[index]];
    mutate(api.put(`/cv/${cv.id}/sections/order`, { ids }));
  };
  const dropEntry = (target: number) => {
    if (dragEntry === null || dragEntry === target) return;
    const ids = section.entries.map((e) => e.id).filter((x) => x !== dragEntry);
    ids.splice(ids.indexOf(target), 0, dragEntry);
    mutate(api.put(`/cv/${cv.id}/sections/${section.id}/entries/order`, { ids }));
  };

  return (
    <div className={`cv-section ${section.visible ? '' : 'hidden-section'} ${dnd.over ? 'drop' : ''}`}
      draggable={!readOnly && !expanded} onDragStart={(e: DragEvent) => { e.dataTransfer.effectAllowed = 'move'; dnd.onDragStart(); }}
      onDragOver={(e) => { if (!expanded) { e.preventDefault(); dnd.setOver(true); } }} onDragLeave={() => dnd.setOver(false)}
      onDrop={(e) => { if (!expanded) { e.preventDefault(); dnd.setOver(false); dnd.onDrop(); } }}>
      <div className="cv-section-head">
        {!readOnly && <span className="grip faint" aria-hidden><Icon name="grip" size={14} /></span>}
        <button className="icon-btn sm" disabled={readOnly} onClick={() => mutate(api.patch(`/cv/${cv.id}/sections/${section.id}`, { visible: !section.visible }))}
          aria-label={section.visible ? `Hide ${section.heading}` : `Show ${section.heading}`} aria-pressed={section.visible}>
          <Icon name={section.visible ? 'eye' : 'eye-off'} />
        </button>
        <button className="cv-section-title" onClick={onToggle} aria-expanded={expanded}>
          <span>{section.heading}</span>
          <span className="faint num" style={{ fontSize: 12 }}>{included}/{section.entries.length}</span>
          {section.pending.length > 0 && <span className="tag violet">{section.pending.length} new</span>}
          {section.custom && <span className="tag">Custom</span>}
        </button>
        {!readOnly && (
          <div className="row" style={{ gap: 0 }}>
            <button className="icon-btn sm" onClick={() => move(-1)} disabled={index === 0} aria-label={`Move ${section.heading} up`}><Icon name="up" /></button>
            <button className="icon-btn sm" onClick={() => move(1)} disabled={index === count - 1} aria-label={`Move ${section.heading} down`}><Icon name="down" /></button>
          </div>
        )}
      </div>
      {expanded && (
        <div className="cv-section-body stack" style={{ gap: 'var(--s-3)' }}>
          {!readOnly && (
            <div className="form-grid">
              <Field label="Heading" hint={section.ats_heading && section.ats_heading !== heading ? `ATS exports use “${section.ats_heading}” unless you rename it.` : undefined}>
                <input className="input" value={heading} onChange={(e) => setHeading(e.target.value)}
                  onBlur={() => heading.trim() && heading !== section.heading && mutate(api.patch(`/cv/${cv.id}/sections/${section.id}`, { heading }))} />
              </Field>
              <Field label="Order entries">
                <select className="select" value={section.sort} onChange={(e) => mutate(api.patch(`/cv/${cv.id}/sections/${section.id}`, { sort: e.target.value }))}>
                  <option value="auto">By date ({cv.settings.date_order === 'reverse' ? 'newest first' : 'oldest first'})</option>
                  <option value="manual">Manual (drag or arrows)</option>
                </select>
              </Field>
              <label className="checkline"><input type="checkbox" className="check" checked={section.page_break_before}
                onChange={(e) => mutate(api.patch(`/cv/${cv.id}/sections/${section.id}`, { page_break_before: e.target.checked }))} />Start on a new page</label>
              <div className="row" style={{ justifyContent: 'flex-end' }}>
                {section.default_heading && heading !== section.default_heading && !section.custom && (
                  <button className="btn btn-ghost btn-sm" onClick={() => mutate(api.patch(`/cv/${cv.id}/sections/${section.id}`, { heading: section.default_heading }))}>Reset heading</button>
                )}
                {section.custom && <button className="btn btn-danger btn-sm" onClick={() => mutate(api.del(`/cv/${cv.id}/sections/${section.id}`), 'Section removed')}><Icon name="trash" />Delete section</button>}
              </div>
            </div>
          )}
          {section.pending.length > 0 && !readOnly && (
            <div className="pending-box">
              <div className="between wrap">
                <span className="label" style={{ color: 'var(--violet-2)' }}>New in your portfolio</span>
                <div className="row">
                  <button className="btn btn-sm btn-primary" onClick={() => mutate(api.post(`/cv/${cv.id}/sync`, { section_id: section.id, action: 'add' }), 'Added to CV')}>Add all</button>
                  <button className="btn btn-sm btn-ghost" onClick={() => mutate(api.post(`/cv/${cv.id}/sync`, { section_id: section.id, action: 'dismiss' }), 'Dismissed')}>Dismiss all</button>
                </div>
              </div>
              <ul className="list">
                {section.pending.map((p) => (
                  <li key={`${p.type}-${p.id}`}>
                    <span className="grow t">{p.title}</span>
                    <button className="btn btn-sm" onClick={() => mutate(api.post(`/cv/${cv.id}/sync`, { section_id: section.id, action: 'add', items: [p] }), 'Added')}>Add</button>
                    <button className="btn btn-sm btn-ghost" onClick={() => mutate(api.post(`/cv/${cv.id}/sync`, { section_id: section.id, action: 'dismiss', items: [p] }))}>Not on this CV</button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {section.entries.length === 0 ? (
            <div className="empty" style={{ padding: 0 }}>{section.source ? 'No portfolio records for this section yet.' : 'No entries yet.'}</div>
          ) : (
            <ul className="list cv-entries">
              {section.entries.map((e, i) => (
                <EntryRow key={e.id} cv={cv} section={section} entry={e} index={i} count={section.entries.length} readOnly={readOnly} mutate={mutate}
                  dnd={{ onDragStart: () => setDragEntry(e.id), onDrop: () => dropEntry(e.id), over: overEntry === e.id, setOver: (b) => setOverEntry(b ? e.id : null) }} />
              ))}
            </ul>
          )}
          {!readOnly && (adding ? (
            <EntryEditor entry={null} kind={section.kind === 'citation' ? 'citation' : section.kind === 'text' ? 'text' : 'item'} onCancel={() => setAdding(false)}
              onSave={async (c) => { if (await mutate(api.post(`/cv/${cv.id}/sections/${section.id}/entries`, c), 'Entry added')) setAdding(false); }} />
          ) : (
            <div><button className="btn btn-sm btn-ghost" onClick={() => setAdding(true)}><Icon name="plus" />Add a manual entry</button></div>
          ))}
        </div>
      )}
    </div>
  );
}

function ContentPanel({ cv, readOnly, mutate }: { cv: CvView; readOnly: boolean; mutate: Mutate }) {
  const [open, setOpen] = useState<number | null>(null);
  const [drag, setDrag] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const [newHeading, setNewHeading] = useState('');
  const drop = (target: number) => {
    if (drag === null || drag === target) return;
    const ids = cv.sections.map((s) => s.id).filter((x) => x !== drag);
    ids.splice(ids.indexOf(target), 0, drag);
    mutate(api.put(`/cv/${cv.id}/sections/order`, { ids }));
  };
  return (
    <div className="stack" style={{ gap: 'var(--s-3)' }}>
      {cv.pending_total > 0 && !readOnly && (
        <div className="pending-box between wrap">
          <span><strong>{cv.pending_total}</strong> new portfolio record{cv.pending_total > 1 ? 's' : ''} can be added to this CV.</span>
          <button className="btn btn-sm btn-primary" onClick={() => mutate(api.post(`/cv/${cv.id}/sync`, { action: 'add' }), 'Portfolio records added')}>Add all</button>
        </div>
      )}
      <p className="faint" style={{ margin: 0, fontSize: 12 }}>
        Entries are linked to your portfolio: edits there flow into this draft. Use the pencil to word an entry differently for this CV only.
        {cv.settings.hide_empty ? ' Sections with no included entries are left out.' : ''}
      </p>
      {cv.sections.map((s, i) => (
        <SectionCard key={s.id} cv={cv} section={s} index={i} count={cv.sections.length} readOnly={readOnly} mutate={mutate}
          expanded={open === s.id} onToggle={() => setOpen((o) => (o === s.id ? null : s.id))}
          dnd={{ onDragStart: () => setDrag(s.id), onDrop: () => drop(s.id), over: over === s.id, setOver: (b) => setOver(b ? s.id : null) }} />
      ))}
      {!readOnly && (
        <form className="row" onSubmit={async (e) => { e.preventDefault(); if (newHeading.trim() && await mutate(api.post(`/cv/${cv.id}/sections`, { heading: newHeading }), 'Section added')) setNewHeading(''); }}>
          <input className="input" value={newHeading} onChange={(e) => setNewHeading(e.target.value)} placeholder="New custom section, e.g. Languages" aria-label="Custom section heading" />
          <button className="btn" disabled={!newHeading.trim()}><Icon name="plus" />Add section</button>
        </form>
      )}
    </div>
  );
}

// ─────────────────────────── Design ───────────────────────────

function DesignPanel({ cv, catalog, readOnly, mutate }: { cv: CvView; catalog: CvCatalog; readOnly: boolean; mutate: Mutate }) {
  const s = cv.settings;
  const [footer, setFooter] = useState(s.footer_text);
  const [keywords, setKeywords] = useState(s.keywords);
  const [target, setTarget] = useState(s.target_position);
  const set = (patch: Partial<CvSettings>) => mutate(api.patch(`/cv/${cv.id}`, { settings: patch }));
  const tpl = catalog.templates.find((t) => t.key === cv.template_key);
  const marginKeys = ['top', 'right', 'bottom', 'left'] as const;
  return (
    <fieldset disabled={readOnly} className="stack" style={{ border: 0, padding: 0, margin: 0, gap: 'var(--s-5)' }}>
      <section>
        <h3 className="label">Template</h3>
        <div className="tpl-grid">
          {catalog.templates.map((t) => (
            <button key={t.key} type="button" className={`tpl-card ${cv.template_key === t.key ? 'selected' : ''}`} aria-pressed={cv.template_key === t.key}
              onClick={() => mutate(api.patch(`/cv/${cv.id}`, { template_key: t.key }), `Template: ${t.name}`)}>
              <span className="t">{t.name}{t.ats && <span className="tag ok" style={{ marginLeft: 6 }}>ATS</span>}</span>
              <span className="s">{t.description}</span>
            </button>
          ))}
        </div>
      </section>
      <section className="form-grid">
        <Field label="CV type">
          <select className="select" value={cv.cv_type} onChange={(e) => mutate(api.patch(`/cv/${cv.id}`, { cv_type: e.target.value }))}>
            {Object.entries(CV_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        <Field label="Page size">
          <select className="select" value={s.page_size} onChange={(e) => set({ page_size: e.target.value as CvSettings['page_size'] })}>
            {catalog.page_sizes.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
          </select>
        </Field>
        <Field label="Font" hint={`Template default: ${tpl?.font}`}>
          <select className="select" value={s.font_family || ''} onChange={(e) => set({ font_family: e.target.value || null })}>
            <option value="">Template default</option>
            {catalog.fonts.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
        </Field>
        <Field label="Font size (pt)" hint={`Template default: ${tpl?.size} pt`}>
          <select className="select" value={s.font_size ?? ''} onChange={(e) => set({ font_size: e.target.value ? Number(e.target.value) : null })}>
            <option value="">Template default</option>
            {[9.5, 10, 10.5, 11, 11.5, 12].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </Field>
        <Field label="Section spacing">
          <select className="select" value={s.section_spacing} onChange={(e) => set({ section_spacing: e.target.value as CvSettings['section_spacing'] })}>
            <option value="compact">Compact</option><option value="normal">Normal</option><option value="relaxed">Relaxed</option>
          </select>
        </Field>
        <Field label="Date order">
          <select className="select" value={s.date_order} onChange={(e) => set({ date_order: e.target.value as CvSettings['date_order'] })}>
            <option value="reverse">Reverse-chronological (newest first)</option><option value="chronological">Chronological (oldest first)</option>
          </select>
        </Field>
        <Field label="Date format">
          <select className="select" value={s.date_style} onChange={(e) => set({ date_style: e.target.value as CvSettings['date_style'] })}>
            <option value="month_year">Month and year (Jun 2021)</option><option value="year">Year only (2021)</option>
          </select>
        </Field>
        <div className="span-2">
          <span className="label" style={{ display: 'block', marginBottom: 6, color: 'var(--text-2)' }}>Margins (inches)</span>
          <div className="row">
            {marginKeys.map((k) => (
              <label key={k} className="field" style={{ flex: 1 }}>
                <span className="faint" style={{ fontSize: 11 }}>{humanize(k)}</span>
                <input className="input" type="number" min={0.3} max={2} step={0.05} defaultValue={s.margins[k]} key={`${k}-${s.margins[k]}`}
                  onBlur={(e) => { const v = Number(e.target.value); if (v !== s.margins[k] && v >= 0.3 && v <= 2) set({ margins: { ...s.margins, [k]: v } }); }} />
              </label>
            ))}
          </div>
        </div>
        <label className="checkline"><input type="checkbox" className="check" checked={s.page_numbers} onChange={(e) => set({ page_numbers: e.target.checked })} />Page numbers in the footer</label>
        <label className="checkline"><input type="checkbox" className="check" checked={s.hide_empty} onChange={(e) => set({ hide_empty: e.target.checked })} />Leave out empty sections</label>
        <label className="checkline span-2"><input type="checkbox" className="check" checked={s.show_license_numbers} onChange={(e) => set({ show_license_numbers: e.target.checked })} />Show license registration numbers</label>
        <Field label="Footer text" hint="Optional, e.g. “Curriculum Vitae — Maria Santos”. Keep contact details in the body, not the footer." className="span-2">
          <input className="input" value={footer} maxLength={200} onChange={(e) => setFooter(e.target.value)} onBlur={() => footer !== s.footer_text && set({ footer_text: footer })} />
        </Field>
      </section>
      <section>
        <h3 className="label">Photograph</h3>
        <label className="checkline" style={{ marginBottom: 'var(--s-3)' }}>
          <input type="checkbox" className="check" checked={s.show_photo} onChange={(e) => set({ show_photo: e.target.checked })} />Include a photograph in the academic version
        </label>
        {s.show_photo && <div className="alert info" style={{ marginBottom: 'var(--s-3)' }}>Photographs are not universally recommended for ATS submissions. The ATS exports always leave the photograph out.</div>}
        {s.show_photo && <PhotoManager selectedId={cv.photo_image_id} disabled={readOnly} onSelect={(id) => mutate(api.patch(`/cv/${cv.id}`, { photo_image_id: id }), id ? 'Photograph selected' : 'Photograph removed')} />}
      </section>
      <section className="stack" style={{ gap: 'var(--s-3)' }}>
        <h3 className="label" style={{ margin: 0 }}>Target position</h3>
        <Field label="Position applied for"><input className="input" value={target} maxLength={200} onChange={(e) => setTarget(e.target.value)} onBlur={() => target !== s.target_position && set({ target_position: target })} placeholder="e.g. Instructor I, College of Education" /></Field>
        <Field label="Keywords or job advertisement" hint="Used by the ATS analyzer to check relevance. Paste a comma-separated list or the full advertisement.">
          <textarea className="textarea" rows={5} value={keywords} onChange={(e) => setKeywords(e.target.value)} onBlur={() => keywords !== s.keywords && set({ keywords })} />
        </Field>
      </section>
    </fieldset>
  );
}

// ─────────────────────────── Check ───────────────────────────

const STATUS_ICON: Record<string, [string, string]> = {
  pass: ['check', 'var(--ok)'], complete: ['check', 'var(--ok)'], warn: ['alert', 'var(--orange)'], incomplete: ['alert', 'var(--orange)'],
  fail: ['close', 'var(--red)'], missing: ['close', 'var(--red)'], info: ['bolt', 'var(--violet-2)'], not_applicable: ['right', 'var(--text-3)'],
};

function CheckRow({ c }: { c: { label: string; status: string; detail: string; items: string[] } }) {
  const [icon, color] = STATUS_ICON[c.status] || STATUS_ICON.info;
  return (
    <li style={{ alignItems: 'flex-start' }}>
      <span style={{ color, paddingTop: 2 }}><Icon name={icon} size={16} /></span>
      <span className="grow">
        <span className="t" style={{ whiteSpace: 'normal' }}>{c.label} <span className="faint" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.08em' }}>{humanize(c.status)}</span></span>
        <span className="s" style={{ whiteSpace: 'normal' }}>{c.detail}</span>
        {c.items.length > 0 && <ul className="check-items">{c.items.map((i) => <li key={i}>{i}</li>)}</ul>}
      </span>
    </li>
  );
}

function CheckPanel({ cv, readOnly, onFinalized }: { cv: CvView; readOnly: boolean; onFinalized: (v: CvView) => void }) {
  const { toast } = useApp();
  const [mode, setMode] = useState<'visual' | 'ats'>('visual');
  const [a, setA] = useState<Analysis | null>(null);
  const [error, setError] = useState('');
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setA(null); setError('');
    api.get<Analysis>(`/cv/${cv.id}/analysis?mode=${mode}`).then(setA).catch((e) => setError(e.message));
  }, [cv.id, cv.updated_at, mode]);

  async function approve() {
    setBusy(true);
    try {
      const v = await api.post<CvView>(`/cv/${cv.id}/finalize`, { acknowledged: true });
      toast(`Version ${v.version} approved and finalized`, 'ok'); dataChanged(); onFinalized(v);
    } catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(false); }
  }

  return (
    <div className="stack" style={{ gap: 'var(--s-5)' }}>
      <div className="seg" role="group" aria-label="Analyze which output">
        <button aria-pressed={mode === 'visual'} onClick={() => setMode('visual')}>Academic version</button>
        <button aria-pressed={mode === 'ats'} onClick={() => setMode('ats')}>ATS version</button>
      </div>
      {error && <div className="alert">{error}</div>}
      {!a && !error && <div className="stack"><div className="skeleton" /><div className="skeleton" style={{ width: '70%' }} /><span className="faint" style={{ fontSize: 12 }}>Generating the files and reading them back…</span></div>}
      {a && (
        <>
          <section>
            <div className="between"><h3 className="label" style={{ margin: 0 }}>ATS compatibility report</h3>
              <span className="faint num" style={{ fontSize: 12 }}>{a.ats.summary.pass} pass · {a.ats.summary.warn} advice · {a.ats.summary.fail} fail</span></div>
            <ul className="list mt-2">{a.ats.checks.map((c) => <CheckRow key={c.id} c={c} />)}</ul>
            <p className="faint" style={{ fontSize: 12 }}>{a.ats.disclaimer}</p>
          </section>
          <section>
            <div className="between"><h3 className="label" style={{ margin: 0 }}>Quality checklist</h3>
              <span className="faint num" style={{ fontSize: 12 }}>{a.checklist.counts.complete} complete · {a.checklist.counts.incomplete} incomplete · {a.checklist.counts.missing} missing</span></div>
            <ul className="list mt-2">{a.checklist.items.map((c) => <CheckRow key={c.id} c={c} />)}</ul>
          </section>
          <section className="verify-box stack" style={{ gap: 'var(--s-3)' }}>
            <h3 className="label" style={{ margin: 0 }}>AI-assisted review</h3>
            <p className="faint" style={{ margin: 0, fontSize: 13 }}>Not available in this offline build. The checks above are rule-based and read your actual files; no content is generated or changed for you.</p>
          </section>
          {readOnly ? (
            <div className="alert info">Approved {fmtDateTime(cv.finalized_at)}. This version is frozen; create a new draft version to make changes.</div>
          ) : (
            <section className="verify-box stack" style={{ gap: 'var(--s-3)' }}>
              <h3 className="label" style={{ margin: 0 }}>Approve this CV</h3>
              <p className="muted" style={{ margin: 0, fontSize: 13 }}>Approving freezes version {cv.version} exactly as it is now. Later portfolio changes will not alter it; you can start a new draft version at any time.</p>
              <label className="checkline"><input type="checkbox" className="check" checked={ack} onChange={(e) => setAck(e.target.checked)} />
                I have reviewed the checklist and confirm the information is accurate.</label>
              <div><button className="btn btn-primary" disabled={!ack || busy} onClick={approve}><Icon name="check" />{busy ? 'Finalizing…' : 'Approve and finalize'}</button></div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

// ─────────────────────────── Preview ───────────────────────────

function Preview({ cv, pdfAvailable }: { cv: CvView; pdfAvailable: boolean }) {
  const [mode, setMode] = useState<'visual' | 'ats' | 'text'>('visual');
  const [textSource, setTextSource] = useState<'pdf' | 'docx'>('pdf');
  const [data, setData] = useState<ArrayBuffer | null>(null);
  const [text, setText] = useState<Analysis['extracted'] | null>(null);
  const [rendering, setRendering] = useState(false);
  const [error, setError] = useState('');
  const [pages, setPages] = useState(0);
  const [zoom, setZoom] = useState(1);
  const seq = useRef(0);

  useEffect(() => {
    if (!pdfAvailable) return;
    const my = ++seq.current;
    setRendering(true); setError('');
    const t = setTimeout(async () => {
      try {
        if (mode === 'text') {
          const a = await api.get<Analysis>(`/cv/${cv.id}/analysis?mode=visual`);
          if (my === seq.current) setText(a.extracted);
        } else {
          const res = await fetch(`/api/cv/${cv.id}/preview.pdf?mode=${mode}`);
          if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Preview failed');
          const buf = await res.arrayBuffer();
          if (my === seq.current) setData(buf);
        }
      } catch (e) { if (my === seq.current) setError((e as Error).message); } finally { if (my === seq.current) setRendering(false); }
    }, 350);
    return () => clearTimeout(t);
  }, [cv.id, cv.updated_at, mode, pdfAvailable]);

  return (
    <div className="cv-preview">
      <div className="cv-preview-bar">
        <div className="seg" role="group" aria-label="Preview">
          <button aria-pressed={mode === 'visual'} onClick={() => setMode('visual')}>Academic visual</button>
          <button aria-pressed={mode === 'ats'} onClick={() => setMode('ats')}>ATS-compatible</button>
          <button aria-pressed={mode === 'text'} onClick={() => setMode('text')}>Extracted text</button>
        </div>
        <span className="faint" style={{ fontSize: 12 }}>{rendering ? 'Rendering…' : mode !== 'text' && pages ? `${pages} page${pages > 1 ? 's' : ''}` : ''}</span>
        {mode !== 'text' && (
          <div className="row" style={{ marginLeft: 'auto', gap: 0 }}>
            <button className="icon-btn sm" onClick={() => setZoom((z) => Math.max(0.6, z - 0.15))} aria-label="Zoom out">−</button>
            <span className="num faint" style={{ fontSize: 11, width: 36, textAlign: 'center' }}>{Math.round(zoom * 100)}%</span>
            <button className="icon-btn sm" onClick={() => setZoom((z) => Math.min(1.6, z + 0.15))} aria-label="Zoom in">+</button>
          </div>
        )}
      </div>
      {!pdfAvailable && <div className="alert">PDF preview needs the SYNCHRONIA desktop app.</div>}
      {error && <div className="alert">{error}</div>}
      <div className={`cv-preview-scroll ${rendering ? 'is-rendering' : ''}`}>
        {mode === 'text' ? (
          text ? (
            <div className="stack">
              <div className="row wrap">
                <div className="seg" role="group" aria-label="Text source">
                  <button aria-pressed={textSource === 'pdf'} onClick={() => setTextSource('pdf')}>From the PDF</button>
                  <button aria-pressed={textSource === 'docx'} onClick={() => setTextSource('docx')}>From the Word file</button>
                </div>
                <span className="faint" style={{ fontSize: 12 }}>This is exactly what a document parser reads from the generated file.</span>
              </div>
              <pre className="extracted selectable">{textSource === 'pdf' ? text.pdf : text.docx}</pre>
            </div>
          ) : <div className="skeleton" style={{ height: 300 }} />
        ) : <PdfPages data={data} zoom={zoom} onPages={setPages} />}
      </div>
    </div>
  );
}

// ─────────────────────────── Editor shell ───────────────────────────

export function CvEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useApp();
  const [cv, setCv] = useState<CvView | null>(null);
  const [catalog, setCatalog] = useState<CvCatalog | null>(null);
  const [tab, setTab] = useState<'content' | 'design' | 'check'>('content');
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [exporting, setExporting] = useState('');

  useEffect(() => {
    setCv(null); setError('');
    api.get<CvView>(`/cv/${id}`).then((v) => { setCv(v); setName(v.name); }).catch((e) => setError(e.message));
    api.get<CvCatalog>('/cv/catalog').then(setCatalog);
  }, [id]);

  const mutate: Mutate = useCallback(async (p, ok) => {
    try {
      const v = await p;
      setCv(v);
      if (ok) toast(ok, 'ok');
      return true;
    } catch (e) {
      toast(e instanceof ApiError && e.details ? `${e.message}: ${Object.values(e.details).join('; ')}` : (e as Error).message, 'error');
      return false;
    }
  }, [toast]);

  async function exportAs(format: string) {
    setExporting(format);
    try {
      const x = await api.post<{ file_name: string; download: string }>(`/cv/${cv!.id}/exports`, { format });
      const a = document.createElement('a');
      a.href = x.download; a.download = x.file_name; document.body.appendChild(a); a.click(); a.remove();
      toast(`Exported ${x.file_name}`, 'ok');
      dataChanged();
    } catch (e) { toast((e as Error).message, 'error'); } finally { setExporting(''); }
  }

  async function newDraft() {
    try {
      const v = await api.post<CvView>(`/cv/${cv!.id}/versions`, {});
      toast(`Draft version ${v.version} created`, 'ok'); dataChanged(); navigate(`/cv/${v.id}`);
    } catch (e) { toast((e as Error).message, 'error'); }
  }

  if (error) return <div className="page"><div className="alert">{error}</div><Link to="/cv" className="btn mt-4">Back to CV Studio</Link></div>;
  if (!cv || !catalog) return <div className="page"><div className="skeleton" style={{ height: 40, width: 300 }} /><div className="skeleton mt-6" style={{ height: 400 }} /></div>;
  const readOnly = cv.status === 'finalized';

  return (
    <div className="cv-editor">
      <div className="cv-editor-head">
        <Link to="/cv" className="icon-btn" aria-label="Back to CV Studio"><Icon name="left" size={16} /></Link>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="label">03 · CV Studio · {CV_TYPES[cv.cv_type]}</div>
          {readOnly ? <h1 className="cv-title">{cv.name}</h1> : (
            <input className="cv-title" value={name} aria-label="CV name" onChange={(e) => setName(e.target.value)}
              onBlur={() => name.trim() && name !== cv.name && mutate(api.patch(`/cv/${cv.id}`, { name }), 'Renamed')} />
          )}
        </div>
        <span className={`tag ${readOnly ? 'ok' : 'orange'}`}>{readOnly ? 'Finalized' : 'Draft'} · v{cv.version}</span>
        {cv.versions.length > 1 && (
          <select className="select" style={{ width: 'auto', height: 30 }} value={cv.id} aria-label="Version" onChange={(e) => navigate(`/cv/${e.target.value}`)}>
            {cv.versions.map((v) => <option key={v.id} value={v.id}>v{v.version} — {v.status}</option>)}
          </select>
        )}
        {readOnly && <button className="btn btn-sm" onClick={newDraft}><Icon name="edit" />New draft version</button>}
        <div className="export-menu">
          {Object.entries(FORMAT_LABEL).map(([f, l]) => (
            <button key={f} className={`btn btn-sm ${f === 'pdf' ? 'btn-accent' : ''}`} disabled={!!exporting || (f.startsWith('pdf') && !catalog.pdf_available)} onClick={() => exportAs(f)}>
              <Icon name="download" />{exporting === f ? 'Exporting…' : l}
            </button>
          ))}
        </div>
      </div>
      {readOnly && <div className="alert info" style={{ margin: '0 var(--s-4) var(--s-3)' }}>Version {cv.version} was approved {fmtDateTime(cv.finalized_at)} and is frozen. Exports reproduce it exactly.</div>}
      <div className="cv-editor-body">
        <aside className="cv-left">
          <div className="tabs" role="tablist" style={{ marginBottom: 'var(--s-4)' }}>
            <button role="tab" aria-selected={tab === 'content'} onClick={() => setTab('content')}>Content{cv.pending_total ? ` · ${cv.pending_total} new` : ''}</button>
            <button role="tab" aria-selected={tab === 'design'} onClick={() => setTab('design')}>Design</button>
            <button role="tab" aria-selected={tab === 'check'} onClick={() => setTab('check')}>Check &amp; approve</button>
          </div>
          {tab === 'content' && <ContentPanel cv={cv} readOnly={readOnly} mutate={mutate} />}
          {tab === 'design' && <DesignPanel cv={cv} catalog={catalog} readOnly={readOnly} mutate={mutate} />}
          {tab === 'check' && <CheckPanel cv={cv} readOnly={readOnly} onFinalized={setCv} />}
        </aside>
        <Preview cv={cv} pdfAvailable={catalog.pdf_available} />
      </div>
    </div>
  );
}
