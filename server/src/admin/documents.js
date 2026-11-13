// Word documents for Administrative Operations: minutes of meetings and turnover documentation, on the letterhead.
// Wording is limited to what is recorded: no boilerplate states facts (attendance, motions, "no other matters")
// that the owner has not entered.
import { Paragraph, TextRun, AlignmentType } from 'docx';
import { buildDocument, field, h1, h2, numbered, p, saveReport, table } from '../academic/docs.js';
import { letterheadFor } from '../academic/institution.js';
import { meetingDetail, turnoverDetail } from './service.js';
import { longDate } from '../intelligence/analytics.js';

const t12 = (hhmm) => {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
};
const lines = (s) => String(s || '').split(/\r?\n|;\s*/).map((x) => x.trim()).filter(Boolean);
const paras = (s) => String(s || '').split(/\n{2,}|\r?\n/).map((x) => x.trim()).filter(Boolean).map((x) => p(x));
const human = (s) => String(s || '').replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
const draftMark = (text) => new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 120 }, children: [new TextRun({ text, bold: true, color: 'B00020', size: 20 })] });
const signatures = (cols) => table([
  cols.map((c) => c.label), cols.map(() => '\n\n'),
  cols.map((c) => String(c.name || '').split(',').map((x, i) => (i ? x : x.toUpperCase())).join(',')), cols.map((c) => c.title || ''),
], { header: false, widths: cols.map(() => 100 / cols.length), noBorders: true, keepTogether: true, boldRow: 2 });

export async function exportMinutes(db, userId, id) {
  const { meeting: m, agenda, minutes: mi, defaults } = meetingDetail(db, userId, id);
  const kind = m.meeting_type && m.meeting_type !== 'other' ? `${human(m.meeting_type)} ` : '';
  const when = [longDate(m.meeting_date), m.start_time && `${t12(m.start_time)}${m.end_time ? ` – ${t12(m.end_time)}` : ''}`].filter(Boolean).join(', ');
  const children = [
    ...(m.minutes_status !== 'approved' ? [draftMark(`DRAFT — minutes ${m.minutes_status === 'for_approval' ? 'for approval' : 'not yet approved'}`)] : []),
    ...(m.body ? [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: m.body.toUpperCase(), bold: true, size: 24 })] })] : []),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 60 }, children: [new TextRun({ text: `MINUTES OF THE ${kind.toUpperCase()}MEETING`, bold: true, size: 24 })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 240 }, children: [new TextRun({ text: [when, m.venue, m.mode && m.mode !== 'in_person' ? human(m.mode) : null].filter(Boolean).join(' · '), italics: true })] }),
    field('Title', m.title),
    ...(m.presiding ? [field('Presiding officer', m.presiding)] : []),
  ];
  if (lines(m.attendees).length) { children.push(h2('Present')); lines(m.attendees).forEach((x) => children.push(numbered(x, 1))); }
  if (lines(m.absent).length) { children.push(h2('Absent')); lines(m.absent).forEach((x) => children.push(numbered(x, 2))); }
  let n = 0;
  const sec = (title) => h1(`${['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'][n++]}. ${title}`);
  if (mi.call_to_order) { children.push(sec('Call to order')); children.push(p(`The meeting was called to order at ${t12(mi.call_to_order)}${m.presiding ? ` by ${m.presiding}` : ''}.`)); }
  if (mi.quorum) { children.push(sec('Quorum')); children.push(...paras(mi.quorum)); }
  if (mi.previous_minutes) { children.push(sec('Approval of the previous minutes')); children.push(...paras(mi.previous_minutes)); }
  if (agenda.length) { children.push(sec('Agenda')); agenda.forEach((a) => children.push(numbered(a.presenter ? `${a.item} — ${a.presenter}` : a.item, 3))); }
  if (mi.items.length) {
    children.push(sec('Matters discussed'));
    mi.items.forEach((it, i) => {
      children.push(new Paragraph({ spacing: { before: 160, after: 60 }, keepNext: true, children: [new TextRun({ text: `${i + 1}. ${it.topic || 'Item'}`, bold: true })] }));
      children.push(...paras(it.discussion));
      if (it.action) children.push(new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: 'Action / decision: ', bold: true }), new TextRun(it.action)] }));
      if (it.responsible || it.due) children.push(new Paragraph({ spacing: { after: 80 }, children: [new TextRun({ text: [it.responsible && `Responsible: ${it.responsible}`, it.due && `Due: ${longDate(it.due)}`].filter(Boolean).join('   ·   '), italics: true, size: 20 })] }));
    });
  }
  if (mi.other_matters) { children.push(sec('Other matters')); children.push(...paras(mi.other_matters)); }
  if (mi.adjournment) { children.push(sec('Adjournment')); children.push(p(`The meeting was adjourned at ${t12(mi.adjournment)}.`)); }
  if (mi.next_meeting) children.push(field('Next meeting', mi.next_meeting));
  if (n === 0 && !agenda.length) children.push(p('No minutes have been recorded for this meeting yet.', { run: { italics: true } }));
  children.push(new Paragraph({ spacing: { before: 480 }, children: [] }));
  children.push(signatures([
    { label: 'Prepared by:', name: mi.prepared_by || defaults.prepared_by, title: mi.prepared_by_title || defaults.prepared_by_title },
    { label: 'Attested / approved by:', name: mi.approved_by || defaults.approved_by, title: mi.approved_by_title || (mi.approved_by || defaults.approved_by ? defaults.approved_by_title : '') },
  ]));
  const buffer = await buildDocument({ title: 'Minutes of the Meeting', subtitle: '', children, letterhead: letterheadFor(db, userId), showTitle: false });
  return saveReport(db, userId, { type: 'minutes', title: `Minutes — ${m.title} (${m.meeting_date})`, buffer, fileStem: `Minutes_${m.meeting_date}_${m.title}`, periodStart: m.meeting_date, periodEnd: m.meeting_date });
}

export async function exportTurnover(db, userId, id) {
  const { document: d, notes, sections, snapshot: s } = turnoverDetail(db, userId, id);
  const prof = db.prepare('SELECT full_name, current_position, current_office FROM professional_profiles WHERE user_id = ?').get(userId) || {};
  const none = (what) => p(`No ${what} as of ${longDate(s.as_of)}.`, { run: { italics: true } });
  const note = (k) => (notes[k] ? paras(notes[k]) : []);
  const children = [
    ...(d.status !== 'final' ? [draftMark('DRAFT')] : []),
    field('Turned over by', [prof.full_name, d.position || prof.current_position].filter(Boolean).join(', ')),
    field('Office', d.office || prof.current_office),
    field('Turned over to', [d.successor_name, d.successor_position].filter(Boolean).join(', ') || 'To be named'),
    field('Effective date', d.effective_date ? longDate(d.effective_date) : '—'),
    field('Status of records as of', longDate(s.as_of)),
    new Paragraph({ spacing: { before: 120, after: 120 }, children: [new TextRun({ text: 'Lists in this document are compiled from the records kept in SYNCHRONIA on the date above; notes are the outgoing officer’s own.', italics: true, size: 19 })] }),
  ];
  const head = (i) => h1(`${i + 1}. ${sections[i][1]}`);
  // 1 Responsibilities
  children.push(head(0), ...note('responsibilities'));
  children.push(s.responsibilities.length ? table([['Assignment', 'Role', 'Type', 'Since'], ...s.responsibilities.map((r) => [r.committee, r.role || '—', human(r.assignment_type) || '—', r.start_date ? longDate(r.start_date) : '—'])], { widths: [40, 22, 20, 18] }) : none('current assignments are recorded'));
  // 2 Correspondence
  children.push(head(1), ...note('correspondence'));
  children.push(s.correspondence.length ? table([['Ref. no.', 'Logged', 'Subject', 'From / to', 'Status', 'Currently with', 'Due'],
    ...s.correspondence.map((c) => { const pend = c.routes.filter((r) => r.status === 'pending').pop(); return [c.reference_no || '—', c.logged_date ? longDate(c.logged_date) : '—', c.subject, c.counterpart || '—', human(c.status), pend ? `${pend.routed_to} (since ${longDate(pend.routed_date)})` : '—', c.due_date ? longDate(c.due_date) : '—']; })],
  { widths: [12, 13, 25, 14, 11, 15, 10], size: 17 }) : none('open correspondence'));
  // 3 Follow-ups
  children.push(head(2), ...note('follow_ups'));
  children.push(s.follow_ups.length ? table([['Item', 'Detail', 'Due', 'Open for'], ...s.follow_ups.map((f) => [[f.ref, f.title].filter(Boolean).join(' — '), f.detail, f.due ? `${longDate(f.due)}${f.overdue ? ' (overdue)' : ''}` : '—', f.age_days != null ? `${f.age_days} day${f.age_days === 1 ? '' : 's'}` : '—'])], { widths: [34, 34, 18, 14], size: 18 }) : none('follow-ups or open tasks'));
  // 4 Meetings
  children.push(head(3), ...note('meetings'));
  children.push(h2('Scheduled'));
  children.push(s.meetings.upcoming.length ? table([['Meeting', 'Date', 'Venue', 'Your role'], ...s.meetings.upcoming.map((m) => [[m.title, m.body].filter(Boolean).join(' — '), `${longDate(m.meeting_date)}${m.start_time ? `, ${t12(m.start_time)}` : ''}`, m.venue || '—', human(m.role) || '—'])], { widths: [40, 24, 20, 16] }) : none('scheduled meetings'));
  children.push(h2('Minutes not yet approved'));
  children.push(s.meetings.minutes_pending.length ? table([['Meeting', 'Date', 'Minutes'], ...s.meetings.minutes_pending.map((m) => [m.title, longDate(m.meeting_date), human(m.minutes_status)])], { widths: [55, 25, 20] }) : none('minutes awaiting approval'));
  // 5 Secretariat
  children.push(head(4), ...note('secretariat'));
  children.push(s.secretariat.length ? table([['No.', 'Title', 'Type', 'Status', 'Date'], ...s.secretariat.map((r) => [r.record_no || '—', r.title, human(r.record_type), human(r.status), r.record_date ? longDate(r.record_date) : '—'])], { widths: [20, 38, 14, 13, 15] }) : none('secretariat records in process'));
  // 6 Routine
  children.push(head(5), ...note('routine'));
  children.push(s.routine.length ? table([['Category', 'Entries', 'Days', 'Outputs', 'Examples'], ...s.routine.map((r) => [human(r.category), String(r.entries), String(r.days), String(r.quantity || '—'), r.sample.join('; ')])], { widths: [17, 10, 9, 11, 53], center: [1, 2, 3], size: 18 }) : none('daily log entries in the last 90 days'));
  // 7 Files
  children.push(head(6), ...note('files'));
  children.push(s.files.length ? table([['File', 'Kept in', 'Location', 'Linked records'], ...s.files.map((f) => [f.title || '—', f.provider === 'google_drive' ? 'Google Drive' : f.provider === 'local_path' ? 'This computer' : 'Web link', f.url || '—', String(f.linked)])], { widths: [30, 14, 44, 12], size: 17 }) : none('file references linked to records'));
  // 8 Other
  children.push(head(7), ...(notes.other ? paras(notes.other) : [none('other matters noted')]));
  children.push(new Paragraph({ spacing: { before: 480 }, children: [] }));
  children.push(signatures([
    { label: 'Turned over by:', name: prof.full_name, title: d.position || prof.current_position },
    { label: 'Received by:', name: d.successor_name, title: d.successor_position },
    ...(d.noted_by ? [{ label: 'Noted by:', name: d.noted_by, title: d.noted_by_title }] : []),
  ]));
  const buffer = await buildDocument({ title: 'Turnover Documentation', subtitle: d.title, children, letterhead: letterheadFor(db, userId) });
  return saveReport(db, userId, { type: 'turnover', title: `Turnover Documentation — ${d.office || d.title}`, buffer, fileStem: `Turnover_${d.office || d.title}`, periodEnd: s.as_of });
}
