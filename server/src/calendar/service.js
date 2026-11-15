// Calendar: Philippine and Australian public holidays (with the owner's corrections) together with every dated item in
// SYNCHRONIA — deadlines, meetings, classes, assessments, trainings, documents due back, licence expiries and goals.
import { HttpError, audit } from '../repo.js';
import { RESOURCES } from '../resources.js';

const T = (key) => RESOURCES[key].table;
import { AU_STATES, australianHolidays, philippineHolidays } from './holidays.js';

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const days = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);

export function getSettings(db, userId) {
  const r = db.prepare('SELECT * FROM calendar_settings WHERE user_id = ?').get(userId);
  return { show_ph: r ? !!r.show_ph : true, show_au: r ? !!r.show_au : false, au_state: r?.au_state || 'VIC', week_start: r?.week_start ?? 0, au_states: AU_STATES };
}

export function saveSettings(db, userId, body = {}) {
  const cur = getSettings(db, userId);
  const next = {
    show_ph: 'show_ph' in body ? !!body.show_ph : cur.show_ph,
    show_au: 'show_au' in body ? !!body.show_au : cur.show_au,
    au_state: 'au_state' in body ? String(body.au_state) : cur.au_state,
    week_start: 'week_start' in body ? Number(body.week_start) : cur.week_start,
  };
  if (!AU_STATES[next.au_state]) throw new HttpError(422, 'Validation failed', { au_state: 'Choose an Australian state or territory' });
  if (![0, 1].includes(next.week_start)) throw new HttpError(422, 'Validation failed', { week_start: 'Sunday (0) or Monday (1)' });
  db.prepare(`INSERT INTO calendar_settings (user_id, show_ph, show_au, au_state, week_start) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET show_ph = excluded.show_ph, show_au = excluded.show_au, au_state = excluded.au_state, week_start = excluded.week_start,
      updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')`).run(userId, next.show_ph ? 1 : 0, next.show_au ? 1 : 0, next.au_state, next.week_start);
  return getSettings(db, userId);
}

/** Holidays in a range for one region, with the owner's additions and removals applied. */
export function holidays(db, userId, region, from, to, auState = 'VIC') {
  const years = [];
  for (let y = Number(from.slice(0, 4)); y <= Number(to.slice(0, 4)); y++) years.push(y);
  let list = years.flatMap((y) => (region === 'PH' ? philippineHolidays(y) : australianHolidays(y, auState)));
  const ov = db.prepare('SELECT * FROM holiday_overrides WHERE user_id = ? AND region = ? AND date BETWEEN ? AND ? ORDER BY id').all(userId, region, from, to);
  const removed = ov.filter((o) => o.action === 'remove');
  list = list.filter((h) => !removed.some((o) => o.date === h.date && o.name === h.name)).map((h) => ({ ...h, source: 'rule' }));
  for (const o of ov.filter((x) => x.action === 'add')) {
    list.push({ date: o.date, name: o.name, type: o.holiday_type || (region === 'PH' ? 'special' : 'public'), region, ...(region === 'AU' ? { state: auState } : {}), note: o.note || null, source: 'you', override_id: o.id });
  }
  return list.filter((h) => h.date >= from && h.date <= to).sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
}

export function addHoliday(db, userId, body = {}) {
  const errors = {};
  if (!['PH', 'AU'].includes(body.region)) errors.region = 'PH or AU';
  if (!ISO.test(body.date || '')) errors.date = 'Use YYYY-MM-DD';
  const name = String(body.name || '').trim().slice(0, 200);
  if (!name) errors.name = 'Required';
  const type = body.holiday_type || null;
  if (type && !['regular', 'special', 'special_working', 'public'].includes(type)) errors.holiday_type = 'Unknown type';
  if (Object.keys(errors).length) throw new HttpError(422, 'Validation failed', errors);
  const r = db.prepare("INSERT INTO holiday_overrides (user_id, region, date, name, action, holiday_type, note) VALUES (?, ?, ?, ?, 'add', ?, ?)")
    .run(userId, body.region, body.date, name, type, String(body.note || '').slice(0, 500) || null);
  if (body.replaces && ISO.test(body.replaces.date || '') && body.replaces.name) {
    db.prepare("INSERT INTO holiday_overrides (user_id, region, date, name, action) VALUES (?, ?, ?, ?, 'remove')").run(userId, body.region, body.replaces.date, String(body.replaces.name).slice(0, 200));
  }
  audit(db, userId, 'calendar', Number(r.lastInsertRowid), 'update', `Holiday ${body.replaces ? 'moved' : 'added'}: ${name} (${body.region}) on ${body.date}`);
  return { id: Number(r.lastInsertRowid) };
}

export function hideHoliday(db, userId, body = {}) {
  if (!['PH', 'AU'].includes(body.region) || !ISO.test(body.date || '') || !body.name) throw new HttpError(422, 'region, date and name are required');
  db.prepare("INSERT INTO holiday_overrides (user_id, region, date, name, action) VALUES (?, ?, ?, ?, 'remove')").run(userId, body.region, body.date, String(body.name).slice(0, 200));
  audit(db, userId, 'calendar', null, 'update', `Holiday hidden: ${body.name} (${body.region}) on ${body.date}`);
  return { ok: true };
}

export function listOverrides(db, userId) {
  return db.prepare('SELECT id, region, date, name, action, holiday_type, note, created_at FROM holiday_overrides WHERE user_id = ? ORDER BY date DESC, id DESC').all(userId);
}
export function deleteOverride(db, userId, id) {
  const r = db.prepare('DELETE FROM holiday_overrides WHERE id = ? AND user_id = ?').run(Number(id), userId);
  if (!r.changes) throw new HttpError(404, 'Correction not found');
  audit(db, userId, 'calendar', Number(id), 'update', 'Removed a holiday correction');
  return { ok: true };
}

/** Every dated item from the records, each linked back to its record. */
const SCHOOL_LABEL = { term: 'Classes', exam: 'Examinations', holiday: 'Holiday', break: 'Break', enrollment: 'Enrolment', deadline: 'Deadline', event: 'School event' };

export function events(db, userId, from, to) {
  const out = [];
  const add = (rows, f) => { for (const r of rows) out.push(f(r)); };
  const q = (sql, ...p) => db.prepare(sql).all(userId, ...p);
  add(q(`SELECT id, title, due_date, status, priority, is_deadline, module FROM ${T('tasks')} WHERE user_id = ? AND deleted_at IS NULL AND status <> 'cancelled' AND due_date BETWEEN ? AND ?`, from, to),
    (r) => ({ date: r.due_date, kind: r.is_deadline ? 'deadline' : 'task', title: r.title, type: 'tasks', id: r.id, done: r.status === 'done', detail: `${r.module} · ${r.priority}` }));
  add(q(`SELECT id, title, meeting_date, start_time, end_time, venue, status FROM ${T('meetings')} WHERE user_id = ? AND deleted_at IS NULL AND status <> 'cancelled' AND meeting_date BETWEEN ? AND ?`, from, to),
    (r) => ({ date: r.meeting_date, time: r.start_time, end_time: r.end_time, kind: 'meeting', title: r.title, type: 'meetings', id: r.id, done: r.status === 'held', detail: r.venue || '' }));
  add(q(`SELECT x.id, x.title, x.activity_date, c.code FROM ${T('class_activities')} x JOIN ${T('teaching_assignments')} a ON a.id = x.teaching_assignment_id JOIN ${T('courses')} c ON c.id = a.course_id
      WHERE x.user_id = ? AND x.deleted_at IS NULL AND x.activity_date BETWEEN ? AND ?`, from, to),
    (r) => ({ date: r.activity_date, kind: 'class', title: `${r.code}: ${r.title}`, type: 'class_activities', id: r.id }));
  add(q(`SELECT a.id, a.title, a.scheduled_date, a.status, c.code FROM ${T('assessments')} a LEFT JOIN ${T('courses')} c ON c.id = a.course_id WHERE a.user_id = ? AND a.deleted_at IS NULL AND a.scheduled_date BETWEEN ? AND ?`, from, to),
    (r) => ({ date: r.scheduled_date, kind: 'assessment', title: `${r.code ? `${r.code}: ` : ''}${r.title}`, type: 'assessments', id: r.id, done: ['administered', 'graded'].includes(r.status) }));
  add(q(`SELECT id, title, start_date, end_date, role FROM ${T('trainings')} WHERE user_id = ? AND deleted_at IS NULL AND start_date <= ? AND COALESCE(end_date, start_date) >= ?`, to, from),
    (r) => ({ date: r.start_date, end_date: r.end_date && r.end_date !== r.start_date ? r.end_date : null, kind: ['speaker', 'facilitator', 'organizer'].includes(r.role) ? 'speaking' : 'training', title: r.title, type: 'trainings', id: r.id }));
  add(q(`SELECT id, title, presentation_date, conference FROM ${T('presentations')} WHERE user_id = ? AND deleted_at IS NULL AND presentation_date BETWEEN ? AND ?`, from, to),
    (r) => ({ date: r.presentation_date, kind: 'speaking', title: `Presenting: ${r.title}`, type: 'presentations', id: r.id, detail: r.conference || '' }));
  add(q(`SELECT id, subject, reference_no, due_date, status FROM ${T('correspondence')} WHERE user_id = ? AND deleted_at IS NULL AND status NOT IN ('completed','archived') AND due_date BETWEEN ? AND ?`, from, to),
    (r) => ({ date: r.due_date, kind: 'deadline', title: `Act on: ${r.reference_no ? `${r.reference_no} — ` : ''}${r.subject}`, type: 'correspondence', id: r.id }));
  add(q(`SELECT r.transaction_id id, r.routed_to, r.due_date, t.subject FROM document_routes r JOIN ${T('correspondence')} t ON t.id = r.transaction_id
      WHERE r.user_id = ? AND r.status = 'pending' AND r.due_date BETWEEN ? AND ?`, from, to),
    (r) => ({ date: r.due_date, kind: 'deadline', title: `Due back from ${r.routed_to}: ${r.subject}`, type: 'correspondence', id: r.id }));
  add(q(`SELECT id, license_type, valid_until FROM ${T('licenses')} WHERE user_id = ? AND deleted_at IS NULL AND valid_until BETWEEN ? AND ?`, from, to),
    (r) => ({ date: r.valid_until, kind: 'renewal', title: `Licence valid until: ${r.license_type}`, type: 'licenses', id: r.id }));
  add(q(`SELECT id, title, target_date, status FROM ${T('development_goals')} WHERE user_id = ? AND deleted_at IS NULL AND target_date BETWEEN ? AND ?`, from, to),
    (r) => ({ date: r.target_date, kind: 'goal', title: `Goal: ${r.title}`, type: 'development_goals', id: r.id, done: r.status === 'achieved' }));
  add(q(`SELECT id, title, start_date, end_date FROM ${T('extension_projects')} WHERE user_id = ? AND deleted_at IS NULL AND start_date BETWEEN ? AND ?`, from, to),
    (r) => ({ date: r.start_date, kind: 'extension', title: r.title, type: 'extension_projects', id: r.id }));
  // Research: milestones and deadlines from the research workspace (one calendar, not a second one).
  add(q(`SELECT m.id, m.title, m.due_date, m.status, p.title AS project FROM research_milestones m JOIN research_projects p ON p.id = m.project_id
      WHERE m.user_id = ? AND m.deleted_at IS NULL AND p.deleted_at IS NULL AND m.status <> 'skipped' AND m.due_date BETWEEN ? AND ?`, from, to),
    (r) => ({ date: r.due_date, kind: 'research', title: r.title, type: 'research_milestones', id: r.id, done: r.status === 'done', detail: r.project }));
  add(q(`SELECT id, committee, revisions_due, status FROM ethics_reviews WHERE user_id = ? AND deleted_at IS NULL AND status = 'revisions_required' AND revisions_due BETWEEN ? AND ?`, from, to),
    (r) => ({ date: r.revisions_due, kind: 'deadline', title: `Ethics revisions due${r.committee ? ` — ${r.committee}` : ''}`, type: 'ethics_reviews', id: r.id, done: false }));
  add(q(`SELECT id, committee, expiry_date FROM ethics_reviews WHERE user_id = ? AND deleted_at IS NULL AND expiry_date BETWEEN ? AND ?`, from, to),
    (r) => ({ date: r.expiry_date, kind: 'deadline', title: `Ethics approval expires${r.committee ? ` — ${r.committee}` : ''}`, type: 'ethics_reviews', id: r.id, done: false }));
  add(q(`SELECT id, title, venue, revision_due FROM research_submissions WHERE user_id = ? AND deleted_at IS NULL AND status = 'revision_required' AND revision_due BETWEEN ? AND ?`, from, to),
    (r) => ({ date: r.revision_due, kind: 'deadline', title: `Revision due: ${r.title}`, type: 'research_submissions', id: r.id, done: false, detail: r.venue }));
  add(q(`SELECT id, opportunity, organization, deadline, submission_status FROM research_funding WHERE user_id = ? AND deleted_at IS NULL AND deadline BETWEEN ? AND ?`, from, to),
    (r) => ({ date: r.deadline, kind: 'deadline', title: `Funding: ${r.opportunity}`, type: 'research_funding', id: r.id, done: r.submission_status === 'submitted', detail: r.organization }));
  // School calendar dates; a range that began before this view still shows on the days it covers.
  add(q(`SELECT id, title, start_date, end_date, kind, no_classes FROM ${T('school_calendar')} WHERE user_id = ? AND deleted_at IS NULL AND start_date <= ? AND COALESCE(end_date, start_date) >= ?`, to, from),
    (r) => ({ date: r.start_date, end_date: r.end_date && r.end_date !== r.start_date ? r.end_date : null, kind: 'school', school_kind: r.kind, no_classes: !!r.no_classes, title: r.title, type: 'school_calendar', id: r.id,
      detail: [SCHOOL_LABEL[r.kind] || 'School calendar', r.no_classes ? 'no classes' : null].filter(Boolean).join(' · ') }));
  return out.sort((a, b) => a.date.localeCompare(b.date) || String(a.time || '99').localeCompare(String(b.time || '99')));
}

export function calendar(db, userId, q = {}) {
  const from = q.from, to = q.to;
  if (!ISO.test(from || '') || !ISO.test(to || '') || to < from) throw new HttpError(422, 'Choose a valid date range (from ≤ to, YYYY-MM-DD)');
  if (days(from, to) > 400) throw new HttpError(422, 'Choose at most about a year at a time');
  const s = getSettings(db, userId);
  const show = (k) => (q[k] === undefined ? s[k] : q[k] === '1');
  const auState = q.au_state && AU_STATES[q.au_state] ? q.au_state : s.au_state;
  return {
    from, to, settings: s,
    holidays: [...(show('show_ph') ? holidays(db, userId, 'PH', from, to) : []), ...(show('show_au') ? holidays(db, userId, 'AU', from, to, auState) : [])],
    events: events(db, userId, from, to),
  };
}
