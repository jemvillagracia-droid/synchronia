import type { ReactNode } from 'react';
import { humanize } from '../lib/format';
import type { FieldSpec } from '../lib/types';

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
  'research_questions', 'objectives', 'methodology', 'instruments', 'collaborators', 'beneficiaries', 'outcomes', 'narrative', 'remarks', 'distinctions']);

export const isLongField = (name: string, spec: FieldSpec) => spec.type === 'text' && ((spec.max || 0) > 2000 || LONG.has(name));

/** Renders an input for a registry field spec. */
export function SpecInput({ name, spec, value, onChange, refOptions }: {
  name: string; spec: FieldSpec; value: any; onChange: (v: any) => void; refOptions?: { id: number; label: string }[];
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
      return <input id={id} type="date" className="input" value={value ?? ''} onChange={(e) => onChange(e.target.value || null)} />;
    case 'int':
    case 'real':
      return <input id={id} type="number" className="input" min={spec.min} step={spec.type === 'int' ? 1 : 'any'} value={value ?? ''}
        onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))} />;
    case 'secret':
      return <input id={id} type="password" autoComplete="off" className="input" value={value ?? ''} placeholder="Leave blank to keep current value"
        onChange={(e) => onChange(e.target.value)} />;
    default:
      return isLongField(name, spec)
        ? <textarea id={id} className="textarea" maxLength={spec.max} value={value ?? ''} onChange={(e) => onChange(e.target.value)} />
        : <input id={id} className="input" maxLength={spec.max} value={value ?? ''} onChange={(e) => onChange(e.target.value)} />;
  }
}
