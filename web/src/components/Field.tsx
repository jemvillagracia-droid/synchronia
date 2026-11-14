import { useState } from 'react';
import type { ReactNode } from 'react';
import { humanize } from '../lib/format';
import type { FieldSpec } from '../lib/types';
import { AutoText } from './AutoText';

export function Field({ label, required, error, hint, children, className }: {
  label: string; required?: boolean; error?: string; hint?: ReactNode; children: ReactNode; className?: string;
}) {
  // Hints and errors sit outside the <label> so the accessible name is just the label text.
  return (
    <div className={`field ${error ? 'has-error' : ''} ${className || ''}`}>
      <label className="field">
        <span className="label">{label}{required && <span className="req" aria-hidden>*</span>}</span>
        {children}
      </label>
      {error ? <span className="err" role="alert">{error}</span> : hint ? <span className="hint">{hint}</span> : null}
    </div>
  );
}

const LONG = new Set(['biography', 'description', 'responsibilities', 'accomplishments', 'teaching_responsibilities', 'notes', 'body',
  'research_questions', 'objectives', 'methodology', 'instruments', 'collaborators', 'beneficiaries', 'outcomes', 'narrative', 'remarks', 'distinctions',
  'attendees', 'absent', 'action_required', 'action_taken', 'signatories', 'disseminated_to']);

export const isLongField = (name: string, spec: FieldSpec) => spec.type === 'text' && ((spec.max || 0) > 2000 || LONG.has(name));

/** A date that may be known only to the year or month: exact day, month and year, or year only. */
function PartialDate({ id, value, onChange }: { id: string; value: string; onChange: (v: string | null) => void }) {
  const precision = value.length === 4 ? 'year' : value.length === 7 ? 'month' : 'day';
  const [mode, setMode] = useState<'day' | 'month' | 'year'>(value ? precision : 'day');
  const switchTo = (m: 'day' | 'month' | 'year') => {
    setMode(m);
    if (!value) return;
    if (m === 'year') onChange(value.slice(0, 4));
    else if (m === 'month') onChange(value.length >= 7 ? value.slice(0, 7) : null);
    else onChange(value.length === 10 ? value : null);
  };
  return (
    <span className="partial-date">
      {mode === 'day' && <input id={id} type="date" className="input" value={value.length === 10 ? value : ''} onChange={(e) => onChange(e.target.value || null)} />}
      {mode === 'month' && <input id={id} type="month" className="input" value={value.length >= 7 ? value.slice(0, 7) : ''} onChange={(e) => onChange(e.target.value || null)} />}
      {mode === 'year' && <input id={id} type="number" className="input" min={1900} max={2100} placeholder="YYYY" value={value.slice(0, 4)} onChange={(e) => onChange(/^\d{4}$/.test(e.target.value) ? e.target.value : e.target.value ? e.target.value : null)} />}
      <select className="select pd-mode" value={mode} onChange={(e) => switchTo(e.target.value as any)} aria-label="Date precision">
        <option value="day">Exact date</option><option value="month">Month only</option><option value="year">Year only</option>
      </select>
    </span>
  );
}

/** Renders an input for a registry field spec. */
export function SpecInput({ name, spec, value, onChange, refOptions, placeholder }: {
  name: string; spec: FieldSpec; value: any; onChange: (v: any) => void; refOptions?: { id: number; label: string }[]; placeholder?: string;
}) {
  const id = `f-${name}`;
  switch (spec.type) {
    case 'bool':
      return (
        <span className="checkline">
          <input id={id} type="checkbox" className="check" checked={!!value} onChange={(e) => onChange(e.target.checked)} />
          <span>{value ? 'Yes' : 'No'}</span>
        </span>
      );
    case 'enum':
      return (
        <select id={id} className="select" value={value ?? ''} onChange={(e) => onChange(e.target.value || null)}>
          {!spec.required && <option value="">—</option>}
          {spec.values!
            // Evidence verification is earned by linking evidence, never selected by hand.
            .filter((v) => !(name === 'verification' && v === 'evidence_verified' && value !== 'evidence_verified'))
            .map((v) => <option key={v} value={v}>{humanize(v)}</option>)}
        </select>
      );
    case 'ref':
      return (
        <select id={id} className="select" value={value ?? ''} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}>
          <option value="">— None —</option>
          {(refOptions || []).map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
      );
    case 'date':
      return spec.partial ? <PartialDate id={id} value={value ?? ''} onChange={onChange} /> : <input id={id} type="date" className="input" value={value ?? ''} onChange={(e) => onChange(e.target.value || null)} />;
    case 'int':
    case 'real':
      return <input id={id} type="number" className="input" min={spec.min} step={spec.type === 'int' ? 1 : 'any'} value={value ?? ''}
        onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))} />;
    case 'secret':
      return <input id={id} type="password" autoComplete="off" className="input mono" value={value ?? ''} onChange={(e) => onChange(e.target.value)} />;
    default:
      if (spec.format === 'time') return <input id={id} type="time" className="input" value={value ?? ''} onChange={(e) => onChange(e.target.value || null)} />;
      return isLongField(name, spec)
        ? <textarea id={id} className="textarea" maxLength={spec.max} value={value ?? ''} placeholder={placeholder} spellCheck onChange={(e) => onChange(e.target.value)} />
        : <AutoText id={id} maxLength={spec.max} value={value ?? ''} placeholder={placeholder} onChange={onChange} />;
  }
}
