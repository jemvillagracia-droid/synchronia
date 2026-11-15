import { useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Overlay } from './Overlay';
import { Field } from './Field';
import { Icon } from './Icon';
import { api, ApiError, dataChanged } from '../lib/api';
import { localToday } from '../lib/format';
import { useApp } from './AppContext';
import { AutoText } from './AutoText';

const KINDS = [
  { id: 'task', label: 'Task' },
  { id: 'activity', label: 'Activity' },
  { id: 'idea', label: 'Idea' },
  { id: 'research_note', label: 'Research Note' },
  { id: 'accomplishment', label: 'Accomplishment' },
  { id: 'moodboard', label: 'Moodboard' },
] as const;
type Kind = (typeof KINDS)[number]['id'];

const TASK_MODULES = ['general', 'teaching', 'research', 'extension', 'development', 'portfolio', 'cv', 'admin'];
const ACTIVITY_MODULES = ['general', 'teaching', 'research', 'extension', 'development', 'portfolio', 'admin'];
const MODULE_LABEL: Record<string, string> = {
  general: 'General', teaching: 'Teaching', research: 'Research', extension: 'Extension', development: 'Faculty development',
  portfolio: 'Portfolio', cv: 'CV', admin: 'Administrative',
};

/** The moodboard of the place being worked on (a research project, course or syllabus), else the general board. */
export function moodboardContext(pathname: string): { type: string; id: number | null } {
  const m = /^\/(research\/projects|academic\/courses|academic\/syllabi)\/(\d+)/.exec(pathname);
  if (!m) return { type: 'general', id: null };
  return { type: { 'research/projects': 'research_projects', 'academic/courses': 'courses', 'academic/syllabi': 'syllabi' }[m[1]]!, id: Number(m[2]) };
}

export function QuickCapture({ onClose }: { onClose: () => void }) {
  const { toast } = useApp();
  const location = useLocation();
  const navigate = useNavigate();
  const ctx = moodboardContext(location.pathname);
  const [kind, setKind] = useState<Kind>('task');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [due, setDue] = useState('');
  const [eventDate, setEventDate] = useState(localToday());
  const [priority, setPriority] = useState('normal');
  const [module, setModule] = useState('general');
  const [isDeadline, setIsDeadline] = useState(false);
  const [keepOpen, setKeepOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');

  const isTask = kind === 'task';

  async function submit(e?: FormEvent) {
    e?.preventDefault();
    if (busy) return;
    setBusy(true); setErrors({}); setFormError('');
    try {
      if (kind === 'moodboard') {
        if (!title.trim() && !body.trim()) { setErrors({ title: 'Write the idea' }); return; }
        const b = await api.get<{ board: { id: number; title: string }; items: { x: number; y: number; h: number }[] }>(`/moodboards/for?type=${ctx.type}${ctx.id ? `&id=${ctx.id}` : ''}`);
        const n = b.items.length;
        await api.post(`/moodboards/${b.board.id}/items`, { kind: 'note', text: [title.trim(), body.trim()].filter(Boolean).join('\n\n'), x: (n % 5) * 270, y: Math.floor(n / 5) * 200, w: 240, h: 170, color: 'violet' });
        dataChanged();
        toast(`Pinned to the moodboard “${b.board.title}”`, 'ok', [{ label: 'Open', run: () => navigate(`/moodboard/${b.board.id}`) }]);
        if (keepOpen) { setTitle(''); setBody(''); } else onClose();
        return;
      }
      await api.post('/capture', isTask
        ? { kind, title, body, due_date: due || null, priority, module, is_deadline: isDeadline }
        : { kind, title, body, event_date: eventDate || null, module: module === 'cv' ? 'general' : module });
      dataChanged();
      toast(`${KINDS.find((k) => k.id === kind)!.label} captured`, 'ok');
      if (keepOpen) { setTitle(''); setBody(''); setDue(''); setIsDeadline(false); }
      else onClose();
    } catch (err) {
      if (err instanceof ApiError) { setErrors(err.details || {}); if (!err.details) setFormError(err.message); }
      else setFormError('Could not reach SYNCHRONIA. Your entry was not saved.');
    } finally { setBusy(false); }
  }

  return (
    <Overlay onClose={onClose} label="Quick Capture">
      <form className="modal" onSubmit={submit}>
        <div className="modal-head">
          <Icon name="bolt" size={18} />
          <h2>Quick Capture</h2>
          <button type="button" className="icon-btn sm" onClick={onClose} aria-label="Close"><Icon name="close" /></button>
        </div>
        <div className="modal-body">
          <div className="seg" role="group" aria-label="What are you capturing?">
            {KINDS.map((k) => (
              <button key={k.id} type="button" aria-pressed={kind === k.id}
                onClick={() => { setKind(k.id); if (k.id !== 'task' && module === 'cv') setModule('general'); }}>{k.label}</button>
            ))}
          </div>
          {formError && <div className="alert">{formError}</div>}
          <Field label="Title" required error={errors.title}>
            <AutoText data-autofocus value={title} maxLength={500} onChange={setTitle}
              placeholder={isTask ? 'e.g. Submit revised syllabus for EDUC 101' : kind === 'idea' ? 'e.g. Study on blended learning readiness' : kind === 'accomplishment' ? 'e.g. Completed OBE syllabus workshop' : 'What happened?'} />
          </Field>
          <Field label={isTask ? 'Notes' : 'Details'} error={errors.notes || errors.body}>
            <textarea className="textarea" value={body} onChange={(e) => setBody(e.target.value)} rows={3} />
          </Field>
          {kind === 'moodboard' ? <div className="alert info">Pinned as a card on the moodboard of {ctx.type === 'general' ? 'general ideas' : 'the page you are working on'}. Arrange, colour and add pictures on the board itself.</div> : (
          <div className="form-grid">
            {isTask ? (
              <>
                <Field label="Due date" error={errors.due_date}>
                  <input type="date" className="input" value={due} onChange={(e) => setDue(e.target.value)} />
                </Field>
                <Field label="Priority" error={errors.priority}>
                  <select className="select" value={priority} onChange={(e) => setPriority(e.target.value)}>
                    {['low', 'normal', 'high', 'urgent'].map((p) => <option key={p} value={p}>{p[0].toUpperCase() + p.slice(1)}</option>)}
                  </select>
                </Field>
              </>
            ) : (
              <Field label="Event date" hint="When it happened — kept separate from when it was recorded." error={errors.event_date}>
                <input type="date" className="input" value={eventDate} onChange={(e) => setEventDate(e.target.value)} />
              </Field>
            )}
            <Field label="Area" error={errors.module}>
              <select className="select" value={module} onChange={(e) => setModule(e.target.value)}>
                {(isTask ? TASK_MODULES : ACTIVITY_MODULES).map((m) => <option key={m} value={m}>{MODULE_LABEL[m]}</option>)}
              </select>
            </Field>
            {isTask && (
              <label className="checkline" style={{ alignSelf: 'end', height: 36 }}>
                <input type="checkbox" className="check" checked={isDeadline} onChange={(e) => setIsDeadline(e.target.checked)} />
                Hard deadline
              </label>
            )}
          </div>)}
          {kind === 'accomplishment' && (
            <div className="alert info">Recorded as <strong>self-reported</strong>. It will not be treated as verified until you confirm it or link supporting evidence.</div>
          )}
        </div>
        <div className="modal-foot">
          <label className="checkline">
            <input type="checkbox" className="check" checked={keepOpen} onChange={(e) => setKeepOpen(e.target.checked)} />
            Capture another
          </label>
          <div className="row">
            <span className="kbd hide-mobile">Ctrl ↵</span>
            <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Capture'}</button>
          </div>
        </div>
      </form>
    </Overlay>
  );
}
