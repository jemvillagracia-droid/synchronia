// Pop-up workspaces for Administrative Operations: a correspondence file with its routing, a meeting with agenda and
// minutes, a turnover document, and the role-change form.
import { useEffect, useState } from 'react';
import { api, dataChanged } from '../../lib/api';
import { download } from '../../lib/download';
import { fmtDate, humanize, plural } from '../../lib/format';
import { useAutosave } from '../../lib/autosave';
import { useApp } from '../../components/AppContext';
import { Icon } from '../../components/Icon';
import { Overlay } from '../../components/Overlay';
import { Field } from '../../components/Field';
import { AutoText } from '../../components/AutoText';
import { SaveIndicator } from '../../components/SaveIndicator';

const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
export const t12 = (hhmm?: string | null) => {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
};

async function generate(url: string, toast: ReturnType<typeof useApp>['toast']) {
  try {
    const r = await api.post<{ download: string; file_name: string; validation?: { summary: string } }>(url);
    download(r.download, r.file_name);
    toast(`Generated ${r.file_name}${r.validation ? ` — ${r.validation.summary}` : ''}`, 'ok');
    dataChanged();
  } catch (e) { toast((e as Error).message, 'error'); }
}

function Shell({ label, onClose, children, foot }: { label: string; onClose: () => void; children: React.ReactNode; foot?: React.ReactNode }) {
  return (
    <Overlay onClose={onClose} label={label}>
      <aside className="drawer wide">
        <div className="modal-head"><span className="label">{label}</span><span style={{ flex: 1 }} />
          <button className="icon-btn sm" onClick={onClose} aria-label="Close"><Icon name="close" /></button></div>
        <div className="modal-body stack" style={{ gap: 'var(--s-5)' }}>{children}</div>
        {foot && <div className="modal-foot">{foot}</div>}
      </aside>
    </Overlay>
  );
}

// ───────────────────────── Correspondence file and routing ─────────────────────────

export function CorrespondenceFile({ id, onClose }: { id: number; onClose: () => void }) {
  const { toast, openRecord } = useApp();
  const [d, setD] = useState<any>(null);
  const [route, setRoute] = useState({ routed_to: '', action_requested: '', routed_date: todayIso(), due_date: '' });
  const [done, setDone] = useState({ action_taken: '', completed_date: todayIso() });
  const [busy, setBusy] = useState(false);
  const load = () => api.get<any>(`/admin/correspondence/${id}`).then(setD).catch((e) => toast(e.message, 'error'));
  useEffect(() => { load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  async function act(fn: () => Promise<any>, msg: string) {
    setBusy(true);
    try { setD(await fn()); dataChanged(); toast(msg, 'ok'); } catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(false); }
  }
  if (!d) return <Shell label="Correspondence" onClose={onClose}><div className="skeleton" style={{ height: 200 }} /></Shell>;
  const open = !['completed', 'archived'].includes(d.status);
  return (
    <Shell label={`${d.direction === 'incoming' ? 'Incoming' : 'Outgoing'} · ${d.reference_no || 'No reference'}`} onClose={onClose}>
      <div>
        <h2 className="display" style={{ fontSize: 30, margin: 0 }}>{d.subject}</h2>
        <div className="row wrap mt-2">
          <span className={`tag ${open ? (d.overdue ? 'st-self' : 'st-confirmed') : 'st-evidenced'}`}>{humanize(d.status)}</span>
          {d.overdue && <span className="tag st-self">Overdue</span>}
          {d.days_open != null && <span className="faint">Open {d.days_open} day{d.days_open === 1 ? '' : 's'}</span>}
          {d.processing_days != null && <span className="faint">Completed in {d.processing_days} day{d.processing_days === 1 ? '' : 's'}</span>}
          <span style={{ flex: 1 }} />
          <button className="btn btn-sm" onClick={() => openRecord('correspondence', d.id)}><Icon name="edit" />Edit details</button>
        </div>
      </div>
      <dl className="dl">
        <dt>{d.direction === 'incoming' ? 'From' : 'To'}</dt><dd>{d.counterpart || '—'}</dd>
        <dt>Type</dt><dd>{humanize(d.doc_type) || '—'}</dd>
        <dt>Document date</dt><dd>{fmtDate(d.document_date) || '—'}</dd>
        <dt>Logged</dt><dd>{fmtDate(d.logged_date) || '—'}</dd>
        <dt>Act on by</dt><dd>{fmtDate(d.due_date) || '—'}</dd>
        {d.action_required && <><dt>Action required</dt><dd>{d.action_required}</dd></>}
        {d.action_taken && <><dt>Action taken</dt><dd>{d.action_taken}</dd></>}
        {d.completed_date && <><dt>Completed</dt><dd>{fmtDate(d.completed_date)}</dd></>}
        {d.remarks && <><dt>Remarks</dt><dd>{d.remarks}</dd></>}
      </dl>
      <section>
        <h3 className="label">Routing ({d.routes.length})</h3>
        {d.routes.length ? (
          <ol className="route-line">
            {d.routes.map((r: any) => (
              <li key={r.id} className={`route-step ${r.status}`}>
                <div className="rs-head"><b>{r.routed_to}</b><span className="faint mono">{fmtDate(r.routed_date)}</span>
                  <span className={`tag ${r.status === 'pending' ? 'st-self' : r.status === 'acted' ? 'st-evidenced' : 'st-system'}`}>{r.status === 'pending' ? 'With them' : humanize(r.status)}</span></div>
                {r.action_requested && <div>{r.action_requested}</div>}
                <div className="faint" style={{ fontSize: 13 }}>{[r.due_date && `Due ${fmtDate(r.due_date)}`, r.acted_date && `${r.status === 'returned' ? 'Returned' : 'Acted'} ${fmtDate(r.acted_date)}`, r.remarks].filter(Boolean).join(' · ')}</div>
                <div className="row wrap mt-2">
                  {r.status === 'pending' ? (<>
                    <button className="btn btn-sm" disabled={busy} onClick={() => act(() => api.patch(`/admin/routes/${r.id}`, { status: 'acted' }), 'Marked acted on')}><Icon name="check" />Acted on</button>
                    <button className="btn btn-sm btn-ghost" disabled={busy} onClick={() => act(() => api.patch(`/admin/routes/${r.id}`, { status: 'returned' }), 'Marked returned')}>Returned</button>
                  </>) : <button className="btn btn-sm btn-ghost" disabled={busy} onClick={() => act(() => api.patch(`/admin/routes/${r.id}`, { status: 'pending' }), 'Reopened')}>Reopen</button>}
                  <button className="btn btn-sm btn-ghost" disabled={busy} onClick={() => { if (window.confirm(`Remove the routing step to ${r.routed_to}?`)) act(() => api.del(`/admin/routes/${r.id}`), 'Routing step removed'); }}><Icon name="trash" />Remove</button>
                </div>
              </li>
            ))}
          </ol>
        ) : <div className="empty">Not routed yet.</div>}
        {open && (
          <form className="route-form" onSubmit={(e) => { e.preventDefault(); act(() => api.post(`/admin/correspondence/${id}/routes`, { ...route, due_date: route.due_date || null }), `Routed to ${route.routed_to}`).then(() => setRoute({ ...route, routed_to: '', action_requested: '', due_date: '' })); }}>
            <Field label="Route to" required><AutoText value={route.routed_to} onChange={(v) => setRoute({ ...route, routed_to: v })} placeholder="Office or person" /></Field>
            <Field label="Action requested"><AutoText value={route.action_requested} onChange={(v) => setRoute({ ...route, action_requested: v })} placeholder="e.g. For approval / For comment / For filing" /></Field>
            <Field label="Date routed"><input className="input" type="date" value={route.routed_date} onChange={(e) => setRoute({ ...route, routed_date: e.target.value })} /></Field>
            <Field label="Due back"><input className="input" type="date" value={route.due_date} min={route.routed_date} onChange={(e) => setRoute({ ...route, due_date: e.target.value })} /></Field>
            <button className="btn btn-primary" type="submit" disabled={busy || !route.routed_to.trim()}><Icon name="right" />Add routing step</button>
          </form>
        )}
      </section>
      {open && (
        <section className="complete-box">
          <h3 className="label">Complete</h3>
          <div className="form-grid">
            <Field label="Action taken" className="span-2"><textarea className="textarea" rows={2} value={done.action_taken} onChange={(e) => setDone({ ...done, action_taken: e.target.value })} placeholder="e.g. Approved and released to the Registrar" /></Field>
            <Field label="Date completed"><input className="input" type="date" value={done.completed_date} onChange={(e) => setDone({ ...done, completed_date: e.target.value })} /></Field>
          </div>
          <button className="btn btn-primary mt-2" disabled={busy} onClick={() => act(() => api.post(`/admin/correspondence/${id}/complete`, done), 'Marked completed')}><Icon name="check" />Mark completed</button>
        </section>
      )}
    </Shell>
  );
}

// ───────────────────────── Meeting workspace: agenda and minutes ─────────────────────────

type Minutes = { call_to_order: string; quorum: string; previous_minutes: string; items: { topic: string; discussion: string; action: string; responsible: string; due: string; task_id: number | null }[];
  other_matters: string; adjournment: string; next_meeting: string; prepared_by: string; prepared_by_title: string; approved_by: string; approved_by_title: string };

export function MeetingWorkspace({ id, onClose }: { id: number; onClose: () => void }) {
  const { toast, openRecord, openNew } = useApp();
  const [d, setD] = useState<any>(null);
  const [agenda, setAgenda] = useState<{ item: string; presenter: string }[] | null>(null);
  const [mi, setMi] = useState<Minutes | null>(null);
  useEffect(() => { api.get<any>(`/admin/meetings/${id}`).then((x) => { setD(x); setAgenda(x.agenda); setMi(x.minutes); }); }, [id]);
  const auto = useAutosave(`minutes-${id}`, agenda && mi ? { agenda, minutes: mi } : null, async (v) => { const x = await api.put<any>(`/admin/meetings/${id}/minutes`, v); setD((p: any) => ({ ...p, meeting: x.meeting, tasks: x.tasks, records: x.records })); dataChanged(); });
  const close = () => { auto.flush().then((ok) => { if (ok) onClose(); }); };
  if (!d || !agenda || !mi) return <Shell label="Meeting" onClose={onClose}><div className="skeleton" style={{ height: 240 }} /></Shell>;
  const m = d.meeting;
  const set = (p: Partial<Minutes>) => setMi({ ...mi, ...p });
  const setItem = (i: number, p: Partial<Minutes['items'][number]>) => set({ items: mi.items.map((x, j) => (j === i ? { ...x, ...p } : x)) });
  async function status(v: string) { const x = await api.put<any>(`/admin/meetings/${id}/minutes`, { minutes_status: v }); setD((p: any) => ({ ...p, meeting: x.meeting })); dataChanged(); toast(`Minutes: ${humanize(v)}`, 'ok'); }
  async function actions() {
    if (!(await auto.flush())) return;
    try { const x = await api.post<any>(`/admin/meetings/${id}/action-items`); setD(x); setMi(x.minutes); auto.rebase({ agenda: agenda!, minutes: x.minutes }); dataChanged(); toast(x.created ? `${x.created} task${x.created > 1 ? 's' : ''} created from action items` : 'Every action item already has a task', 'ok'); }
    catch (e) { toast((e as Error).message, 'error'); }
  }
  return (
    <Shell label={`Meeting · ${humanize(m.status)}`} onClose={close} foot={<>
      <SaveIndicator state={auto.state} savedAt={auto.savedAt} error={auto.error} /><span style={{ flex: 1 }} />
      <button className="btn" onClick={actions}><Icon name="check" />Create tasks from action items</button>
      <button className="btn btn-primary" onClick={async () => { if (await auto.flush()) generate(`/admin/meetings/${id}/export`, toast); }}><Icon name="download" />Export minutes (Word)</button>
    </>}>
      <div>
        <h2 className="display" style={{ fontSize: 30, margin: 0 }}>{m.title}</h2>
        <div className="faint mt-2" style={{ fontSize: 14 }}>{[m.body, fmtDate(m.meeting_date), m.start_time && `${t12(m.start_time)}${m.end_time ? `–${t12(m.end_time)}` : ''}`, m.venue, m.role && `You: ${humanize(m.role)}`].filter(Boolean).join(' · ')}</div>
        <div className="row wrap mt-3">
          <button className="btn btn-sm" onClick={() => openRecord('meetings', m.id)}><Icon name="edit" />Edit details and attendance</button>
          <label className="row" style={{ gap: 6 }}><span className="label" style={{ margin: 0 }}>Minutes</span>
            <select className="select" style={{ width: 'auto' }} value={m.minutes_status} onChange={(e) => status(e.target.value)}>
              {['none', 'draft', 'for_approval', 'approved'].map((v) => <option key={v} value={v}>{v === 'none' ? 'Not started' : humanize(v)}</option>)}
            </select></label>
        </div>
      </div>
      <section>
        <div className="between"><h3 className="label" style={{ margin: 0 }}>Agenda</h3>
          <button className="btn btn-sm" onClick={() => setAgenda([...agenda, { item: '', presenter: '' }])}><Icon name="plus" />Add item</button></div>
        {agenda.length ? agenda.map((a, i) => (
          <div key={i} className="row mt-2" style={{ alignItems: 'flex-start' }}>
            <span className="mono faint" style={{ paddingTop: 9, width: 22 }}>{i + 1}.</span>
            <div style={{ flex: 3, minWidth: 0 }}><AutoText value={a.item} onChange={(v) => setAgenda(agenda.map((x, j) => (j === i ? { ...x, item: v } : x)))} aria-label={`Agenda item ${i + 1}`} placeholder="Agenda item" /></div>
            <div style={{ flex: 1, minWidth: 0 }}><AutoText value={a.presenter} onChange={(v) => setAgenda(agenda.map((x, j) => (j === i ? { ...x, presenter: v } : x)))} aria-label={`Presenter, item ${i + 1}`} placeholder="Presenter" /></div>
            <button className="icon-btn sm" onClick={() => setAgenda(agenda.filter((_, j) => j !== i))} aria-label={`Remove agenda item ${i + 1}`}><Icon name="trash" /></button>
          </div>
        )) : <div className="empty">No agenda items yet.</div>}
      </section>
      <section className="stack">
        <h3 className="label" style={{ margin: 0 }}>Minutes</h3>
        <div className="form-grid">
          <Field label="Called to order at"><input className="input" type="time" value={mi.call_to_order} onChange={(e) => set({ call_to_order: e.target.value })} /></Field>
          <Field label="Adjourned at"><input className="input" type="time" value={mi.adjournment} onChange={(e) => set({ adjournment: e.target.value })} /></Field>
          <Field label="Quorum" className="span-2"><AutoText value={mi.quorum} onChange={(v) => set({ quorum: v })} placeholder="e.g. With 9 of 11 members present, a quorum was declared." /></Field>
          <Field label="Approval of the previous minutes" className="span-2"><textarea className="textarea" rows={2} value={mi.previous_minutes} onChange={(e) => set({ previous_minutes: e.target.value })} /></Field>
        </div>
        {mi.items.map((it, i) => (
          <div key={i} className="minute-item">
            <div className="between"><span className="label" style={{ margin: 0 }}>Matter {i + 1}</span>
              {it.task_id ? <span className="tag st-evidenced">Task created</span> : null}
              <button className="icon-btn sm" onClick={() => set({ items: mi.items.filter((_, j) => j !== i) })} aria-label={`Remove matter ${i + 1}`}><Icon name="trash" /></button></div>
            <Field label="Topic"><AutoText value={it.topic} onChange={(v) => setItem(i, { topic: v })} /></Field>
            <Field label="Discussion"><textarea className="textarea" rows={3} value={it.discussion} onChange={(e) => setItem(i, { discussion: e.target.value })} spellCheck /></Field>
            <div className="form-grid">
              <Field label="Action / decision" className="span-2"><AutoText value={it.action} onChange={(v) => setItem(i, { action: v })} /></Field>
              <Field label="Responsible"><AutoText value={it.responsible} onChange={(v) => setItem(i, { responsible: v })} /></Field>
              <Field label="Due"><input className="input" type="date" value={it.due} onChange={(e) => setItem(i, { due: e.target.value })} /></Field>
            </div>
          </div>
        ))}
        <button className="btn btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => set({ items: [...mi.items, { topic: agenda[mi.items.length]?.item || '', discussion: '', action: '', responsible: '', due: '', task_id: null }] })}><Icon name="plus" />Add matter discussed</button>
        <div className="form-grid">
          <Field label="Other matters" className="span-2"><textarea className="textarea" rows={2} value={mi.other_matters} onChange={(e) => set({ other_matters: e.target.value })} /></Field>
          <Field label="Next meeting" className="span-2"><AutoText value={mi.next_meeting} onChange={(v) => set({ next_meeting: v })} /></Field>
          <Field label="Prepared by"><AutoText value={mi.prepared_by} onChange={(v) => set({ prepared_by: v })} placeholder={d.defaults.prepared_by} /></Field>
          <Field label="Position"><AutoText value={mi.prepared_by_title} onChange={(v) => set({ prepared_by_title: v })} placeholder={d.defaults.prepared_by_title} /></Field>
          <Field label="Attested / approved by"><AutoText value={mi.approved_by} onChange={(v) => set({ approved_by: v })} placeholder={d.defaults.approved_by || 'Presiding officer'} /></Field>
          <Field label="Position"><AutoText value={mi.approved_by_title} onChange={(v) => set({ approved_by_title: v })} placeholder={d.defaults.approved_by_title} /></Field>
        </div>
      </section>
      <section>
        <div className="between"><h3 className="label" style={{ margin: 0 }}>Secretariat records from this meeting</h3>
          <button className="btn btn-sm" onClick={() => openNew('secretariat_records', { meeting_id: m.id, record_type: 'resolution', issuing_body: m.body, record_date: m.meeting_date })}><Icon name="plus" />New record</button></div>
        {d.records.length ? <ul className="list">{d.records.map((r: any) => <li key={r.id}><span className="tag">{humanize(r.record_type)}</span><button className="rowlink grow" onClick={() => openRecord('secretariat_records', r.id)}><span className="t">{r.title}</span><span className="s">{[r.record_no, humanize(r.status)].filter(Boolean).join(' · ')}</span></button></li>)}</ul>
          : <div className="empty">None yet.</div>}
        {d.tasks.length > 0 && (<>
          <h3 className="label mt-3">Tasks from this meeting</h3>
          <ul className="list">{d.tasks.map((t: any) => <li key={t.id}><span className={`tag ${t.status === 'done' ? 'st-evidenced' : 'st-self'}`}>{humanize(t.status)}</span><button className="rowlink grow" onClick={() => openRecord('tasks', t.id)}><span className="t">{t.title}</span><span className="s">{t.due_date ? `Due ${fmtDate(t.due_date)}` : 'No due date'}</span></button></li>)}</ul>
        </>)}
      </section>
    </Shell>
  );
}

// ───────────────────────── Turnover document ─────────────────────────

export function TurnoverEditor({ id, onClose }: { id: number; onClose: () => void }) {
  const { toast, openRecord } = useApp();
  const [d, setD] = useState<any>(null);
  const [notes, setNotes] = useState<Record<string, string> | null>(null);
  useEffect(() => { api.get<any>(`/admin/turnover/${id}`).then((x) => { setD(x); setNotes(x.notes); }); }, [id]);
  const auto = useAutosave(`turnover-${id}`, notes, async (v) => { await api.put(`/admin/turnover/${id}/notes`, v); dataChanged(); });
  const close = () => { auto.flush().then((ok) => { if (ok) onClose(); }); };
  if (!d || !notes) return <Shell label="Turnover" onClose={onClose}><div className="skeleton" style={{ height: 240 }} /></Shell>;
  const s = d.snapshot;
  const count: Record<string, string> = {
    responsibilities: `${s.responsibilities.length} current assignment${s.responsibilities.length === 1 ? '' : 's'}`,
    correspondence: `${s.correspondence.length} open document${s.correspondence.length === 1 ? '' : 's'}`,
    follow_ups: `${s.follow_ups.length} item${s.follow_ups.length === 1 ? '' : 's'}`,
    meetings: `${s.meetings.upcoming.length} scheduled · ${s.meetings.minutes_pending.length} minutes not approved`,
    secretariat: `${s.secretariat.length} in process`,
    routine: `${plural(s.routine.length, 'category', 'categories')} in the last 90 days`,
    files: `${s.files.length} file reference${s.files.length === 1 ? '' : 's'}`,
    other: 'Your notes only',
  };
  const doc = d.document;
  return (
    <Shell label={`Turnover documentation · ${humanize(doc.status)}`} onClose={close} foot={<>
      <SaveIndicator state={auto.state} savedAt={auto.savedAt} error={auto.error} /><span style={{ flex: 1 }} />
      <button className="btn btn-primary" onClick={async () => { if (await auto.flush()) generate(`/admin/turnover/${id}/export`, toast); }}><Icon name="download" />Export turnover (Word)</button>
    </>}>
      <div>
        <h2 className="display" style={{ fontSize: 30, margin: 0 }}>{doc.title}</h2>
        <div className="faint mt-2" style={{ fontSize: 14 }}>{[doc.office, doc.successor_name && `To ${doc.successor_name}${doc.successor_position ? `, ${doc.successor_position}` : ''}`, doc.effective_date && `Effective ${fmtDate(doc.effective_date)}`].filter(Boolean).join(' · ')}</div>
        <button className="btn btn-sm mt-3" onClick={() => openRecord('turnover_documents', doc.id)}><Icon name="edit" />Edit successor, dates and status</button>
      </div>
      <p className="muted" style={{ margin: 0, fontSize: 14 }}>The lists in each section are compiled from your records when you export, so they are always current. Add what your successor should know that the records don’t say.</p>
      {d.sections.map(([k, label]: [string, string], i: number) => (
        <div key={k} className="turnover-sec">
          <div className="between"><span className="ts-title">{i + 1}. {label}</span><span className="tag st-system">{count[k]}</span></div>
          <textarea className="textarea" rows={3} value={notes[k]} onChange={(e) => setNotes({ ...notes, [k]: e.target.value })} aria-label={`Notes: ${label}`} placeholder="Notes for your successor" spellCheck />
        </div>
      ))}
    </Shell>
  );
}

// ───────────────────────── Role change ─────────────────────────

export function RoleChange({ onClose }: { onClose: () => void }) {
  const { toast, updatePrefs, prefs } = useApp();
  const [v, setV] = useState({ position: '', office: '', institution: '', effective_date: todayIso(), academic_mode: prefs?.academic_mode || 'administrative', end_current: true, create_employment: true, turnover: true });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  async function submit() {
    setBusy(true); setErrors({});
    try {
      const r = await api.post<any>('/admin/role-change', v);
      await updatePrefs({});
      dataChanged();
      toast(`Role updated to ${v.position}${r.ended.length ? `; ${plural(r.ended.length, 'previous position')} closed` : ''}${r.turnover_id ? '; turnover draft created' : ''}.`, 'ok');
      onClose();
    } catch (e: any) { setErrors(e.details || {}); toast(e.message, 'error'); } finally { setBusy(false); }
  }
  return (
    <Shell label="Transfer or new appointment" onClose={onClose} foot={<><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={busy} onClick={submit}><Icon name="check" />{busy ? 'Saving…' : 'Apply role change'}</button></>}>
      <p className="muted" style={{ margin: 0, fontSize: 14 }}>Use this when you transfer to another office or receive a faculty appointment. It updates your profile, closes your current employment record the day before, opens the new one, and can start a turnover document for the office you are leaving. Nothing else is changed or deleted.</p>
      <div className="form-grid">
        <Field label="New position" required error={errors.position}><AutoText value={v.position} onChange={(x) => setV({ ...v, position: x })} placeholder="e.g. Instructor I" /></Field>
        <Field label="Office / college"><AutoText value={v.office} onChange={(x) => setV({ ...v, office: x })} placeholder="e.g. College of Education" /></Field>
        <Field label="Institution" hint="Leave blank to keep your current institution." error={errors.institution}><AutoText value={v.institution} onChange={(x) => setV({ ...v, institution: x })} /></Field>
        <Field label="Effective date" error={errors.effective_date}><input className="input" type="date" value={v.effective_date} onChange={(e) => setV({ ...v, effective_date: e.target.value })} /></Field>
        <Field label="Academic mode" hint="Sets the default order of the Central Nexus."><select className="select" value={v.academic_mode} onChange={(e) => setV({ ...v, academic_mode: e.target.value as any })}>
          <option value="administrative">Administrative</option><option value="instructor">Instructor</option><option value="researcher">Researcher</option><option value="faculty_development">Faculty development</option></select></Field>
      </div>
      <div className="stack" style={{ gap: 'var(--s-2)' }}>
        <label className="checkline"><input type="checkbox" className="check" checked={v.end_current} onChange={(e) => setV({ ...v, end_current: e.target.checked })} />Close my current employment record the day before</label>
        <label className="checkline"><input type="checkbox" className="check" checked={v.create_employment} onChange={(e) => setV({ ...v, create_employment: e.target.checked })} />Add the new position to my employment history</label>
        <label className="checkline"><input type="checkbox" className="check" checked={v.turnover} onChange={(e) => setV({ ...v, turnover: e.target.checked })} />Start a turnover document for the office I am leaving</label>
      </div>
    </Shell>
  );
}
