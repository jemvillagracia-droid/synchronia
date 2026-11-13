// Administrative Operations: correspondence registries with routing, follow-ups, meetings and minutes, secretariat
// records, the daily activity log, turnover documentation and role changes. Everything is read from and written to
// stored records; follow-ups and turnover snapshots are computed, never typed in twice.
import { HttpError, audit, create, createHooks, get as getRecord, indexProfile, update } from '../repo.js';
import { tx } from '../db.js';

export const today = () => new Date().toISOString().slice(0, 10);
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const parse = (j, d) => { try { return j ? JSON.parse(j) : d; } catch { return d; } };
const str = (v, max = 4000) => (v == null ? '' : String(v)).trim().slice(0, max);
const days = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
const OPEN = "status NOT IN ('completed','archived')";

// ───────────────────────── Correspondence registry ─────────────────────────

/** Next registry number for the year: IN-2026-0001 / OUT-2026-0001. */
export function nextReference(db, userId, direction, date = today()) {
  const prefix = `${direction === 'outgoing' ? 'OUT' : 'IN'}-${date.slice(0, 4)}-`;
  const rows = db.prepare('SELECT reference_no FROM administrative_transactions WHERE user_id = ? AND reference_no LIKE ?').all(userId, `${prefix}%`);
  const max = rows.reduce((m, r) => Math.max(m, Number(/-(\d+)$/.exec(r.reference_no)?.[1]) || 0), 0);
  return `${prefix}${String(max + 1).padStart(4, '0')}`;
}

function correspondenceDefaults(db, userId, input) {
  if (!input.logged_date) input.logged_date = today();
  if (!str(input.reference_no) && ['incoming', 'outgoing'].includes(input.direction)) {
    input.reference_no = nextReference(db, userId, input.direction, ISO.test(input.logged_date) ? input.logged_date : today());
  }
  if (!input.status) input.status = input.direction === 'outgoing' ? 'in_progress' : 'received';
  return input;
}
createHooks.correspondence = correspondenceDefaults;

export function createCorrespondence(db, userId, body = {}) {
  return create(db, userId, 'correspondence', body);
}

function routeSummary(db, ids) {
  if (!ids.length) return {};
  const rows = db.prepare(`SELECT * FROM document_routes WHERE transaction_id IN (${ids.map(() => '?').join(',')}) ORDER BY routed_date, id`).all(...ids);
  const out = {};
  for (const r of rows) (out[r.transaction_id] ||= []).push(r);
  return out;
}

const decorate = (t, routes = [], now = today()) => {
  const open = !['completed', 'archived'].includes(t.status);
  const since = t.logged_date || t.document_date || t.created_at.slice(0, 10);
  const last = routes[routes.length - 1] || null;
  return {
    ...t, routing_json: undefined,
    routes_count: routes.length, routes_pending: routes.filter((r) => r.status === 'pending').length,
    last_route: last && { routed_to: last.routed_to, routed_date: last.routed_date, status: last.status },
    days_open: open ? Math.max(0, days(since, now)) : null,
    processing_days: !open && t.completed_date ? Math.max(0, days(since, t.completed_date)) : null,
    overdue: open && !!t.due_date && t.due_date < now,
  };
};

export function listCorrespondence(db, userId, q = {}) {
  const where = ['user_id = ?', 'deleted_at IS NULL'];
  const params = [userId];
  if (q.direction) {
    if (!['incoming', 'outgoing'].includes(q.direction)) throw new HttpError(422, 'Unknown direction');
    where.push('direction = ?'); params.push(q.direction);
  }
  if (q.status === 'open') where.push(OPEN);
  else if (q.status) { where.push('status = ?'); params.push(String(q.status)); }
  if (q.from) { if (!ISO.test(q.from)) throw new HttpError(422, 'from: use YYYY-MM-DD'); where.push('COALESCE(document_date, logged_date) >= ?'); params.push(q.from); }
  if (q.to) { if (!ISO.test(q.to)) throw new HttpError(422, 'to: use YYYY-MM-DD'); where.push('COALESCE(document_date, logged_date) <= ?'); params.push(q.to); }
  if (q.q) {
    const like = `%${String(q.q).slice(0, 100).replace(/[%_]/g, (c) => `\\${c}`)}%`;
    where.push("(subject LIKE ? ESCAPE '\\' OR reference_no LIKE ? ESCAPE '\\' OR counterpart LIKE ? ESCAPE '\\' OR office LIKE ? ESCAPE '\\')");
    params.push(like, like, like, like);
  }
  const rows = db.prepare(`SELECT * FROM administrative_transactions WHERE ${where.join(' AND ')}
      ORDER BY COALESCE(logged_date, document_date, substr(created_at, 1, 10)) DESC, id DESC LIMIT 500`).all(...params);
  const routes = routeSummary(db, rows.map((r) => r.id));
  const now = today();
  return rows.map((r) => decorate(r, routes[r.id], now));
}

function ownedTx(db, userId, id) {
  const t = db.prepare('SELECT * FROM administrative_transactions WHERE id = ? AND user_id = ? AND deleted_at IS NULL').get(Number(id), userId);
  if (!t) throw new HttpError(404, 'Correspondence not found');
  return t;
}

export function correspondenceDetail(db, userId, id) {
  const t = ownedTx(db, userId, id);
  const routes = db.prepare('SELECT * FROM document_routes WHERE transaction_id = ? ORDER BY routed_date, id').all(t.id);
  return { ...decorate(t, routes), routes };
}

function cleanRoute(body, partial = false) {
  const errors = {};
  const out = {};
  for (const [k, max] of [['routed_to', 300], ['action_requested', 1000], ['remarks', 2000]]) {
    if (k in body) out[k] = str(body[k], max) || null;
  }
  for (const k of ['routed_date', 'due_date', 'acted_date']) {
    if (k in body) { if (body[k] && !ISO.test(body[k])) errors[k] = 'Use YYYY-MM-DD'; out[k] = body[k] || null; }
  }
  if ('status' in body) { if (!['pending', 'acted', 'returned'].includes(body.status)) errors.status = 'One of: pending, acted, returned'; out.status = body.status; }
  if (!partial && !out.routed_to) errors.routed_to = 'Required';
  if (Object.keys(errors).length) throw new HttpError(422, 'Validation failed', errors);
  return out;
}

export function addRoute(db, userId, id, body = {}) {
  const t = ownedTx(db, userId, id);
  const r = cleanRoute(body);
  r.routed_date ||= today();
  if (r.due_date && r.due_date < r.routed_date) throw new HttpError(422, 'Validation failed', { due_date: 'Must be on or after the routing date' });
  tx(db, () => {
    db.prepare(`INSERT INTO document_routes (user_id, transaction_id, routed_date, routed_to, action_requested, due_date, status, remarks)
      VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)`).run(userId, t.id, r.routed_date, r.routed_to, r.action_requested ?? null, r.due_date ?? null, r.remarks ?? null);
    if (['received', 'for_follow_up'].includes(t.status)) db.prepare("UPDATE administrative_transactions SET status = 'routed', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?").run(t.id);
    audit(db, userId, 'correspondence', t.id, 'update', `Routed ${t.reference_no || t.subject} to ${r.routed_to}`);
  });
  return correspondenceDetail(db, userId, t.id);
}

export function updateRoute(db, userId, routeId, body = {}) {
  const route = db.prepare('SELECT * FROM document_routes WHERE id = ? AND user_id = ?').get(Number(routeId), userId);
  if (!route) throw new HttpError(404, 'Routing step not found');
  const r = cleanRoute(body, true);
  if (r.status === 'acted' || r.status === 'returned') r.acted_date ||= route.acted_date || today();
  if (r.status === 'pending') r.acted_date = null;
  const keys = Object.keys(r);
  if (keys.length) {
    tx(db, () => {
      db.prepare(`UPDATE document_routes SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`).run(...keys.map((k) => r[k]), route.id);
      audit(db, userId, 'correspondence', route.transaction_id, 'update', `Routing to ${route.routed_to}: ${r.status || 'updated'}`);
    });
  }
  return correspondenceDetail(db, userId, route.transaction_id);
}

export function deleteRoute(db, userId, routeId) {
  const route = db.prepare('SELECT * FROM document_routes WHERE id = ? AND user_id = ?').get(Number(routeId), userId);
  if (!route) throw new HttpError(404, 'Routing step not found');
  tx(db, () => {
    db.prepare('DELETE FROM document_routes WHERE id = ?').run(route.id);
    audit(db, userId, 'correspondence', route.transaction_id, 'update', `Removed routing step to ${route.routed_to}`);
  });
  return correspondenceDetail(db, userId, route.transaction_id);
}

export function completeCorrespondence(db, userId, id, body = {}) {
  const t = ownedTx(db, userId, id);
  const date = body.completed_date || today();
  if (!ISO.test(date)) throw new HttpError(422, 'Validation failed', { completed_date: 'Use YYYY-MM-DD' });
  update(db, userId, 'correspondence', t.id, { status: 'completed', completed_date: date, ...(str(body.action_taken) ? { action_taken: str(body.action_taken, 20000) } : {}) });
  return correspondenceDetail(db, userId, t.id);
}

// ───────────────────────── Follow-up tracker ─────────────────────────

/** Everything that needs attention, computed from the records themselves. */
export function followUps(db, userId, now = today()) {
  const items = [];
  const push = (x) => items.push({ ...x, overdue: !!x.due && x.due < now, age_days: x.since ? Math.max(0, days(x.since, now)) : null });
  for (const t of db.prepare(`SELECT * FROM administrative_transactions WHERE user_id = ? AND deleted_at IS NULL AND ${OPEN}
      AND (due_date IS NOT NULL OR status = 'for_follow_up')`).all(userId)) {
    push({ kind: 'correspondence', entity_type: 'correspondence', entity_id: t.id, title: t.subject, ref: t.reference_no,
      detail: `${t.direction === 'incoming' ? 'From' : 'To'} ${t.counterpart || '—'} · ${t.status.replace(/_/g, ' ')}`, due: t.due_date, since: t.logged_date || t.document_date });
  }
  for (const r of db.prepare(`SELECT r.*, t.subject, t.reference_no FROM document_routes r JOIN administrative_transactions t ON t.id = r.transaction_id AND t.deleted_at IS NULL
      WHERE r.user_id = ? AND r.status = 'pending' AND t.status NOT IN ('completed','archived')`).all(userId)) {
    push({ kind: 'route', entity_type: 'correspondence', entity_id: r.transaction_id, route_id: r.id, title: r.subject, ref: r.reference_no,
      detail: `With ${r.routed_to}${r.action_requested ? ` — ${r.action_requested}` : ''}`, due: r.due_date, since: r.routed_date });
  }
  for (const k of db.prepare(`SELECT * FROM tasks WHERE user_id = ? AND deleted_at IS NULL AND module = 'admin' AND status IN ('open','in_progress')`).all(userId)) {
    push({ kind: 'task', entity_type: 'tasks', entity_id: k.id, title: k.title, detail: `${k.priority} priority · ${k.status.replace(/_/g, ' ')}`, due: k.due_date, since: k.created_at.slice(0, 10) });
  }
  for (const m of db.prepare(`SELECT * FROM meetings WHERE user_id = ? AND deleted_at IS NULL AND (
      (status = 'scheduled' AND meeting_date < ?) OR (status = 'held' AND role = 'secretary' AND minutes_status IN ('none','draft')))`).all(userId, now)) {
    if (m.status === 'scheduled') push({ kind: 'meeting_status', entity_type: 'meetings', entity_id: m.id, title: m.title, detail: 'Date has passed — mark it held, postponed or cancelled', due: m.meeting_date, since: m.meeting_date });
    else push({ kind: 'minutes', entity_type: 'meetings', entity_id: m.id, title: m.title, detail: m.minutes_status === 'none' ? 'Minutes not started' : 'Minutes in draft', due: null, since: m.meeting_date });
  }
  for (const s of db.prepare(`SELECT * FROM secretariat_records WHERE user_id = ? AND deleted_at IS NULL AND status IN ('draft','for_signature')`).all(userId)) {
    push({ kind: 'secretariat', entity_type: 'secretariat_records', entity_id: s.id, title: s.title, ref: s.record_no, detail: s.status === 'draft' ? 'Draft' : 'For signature', due: null, since: s.record_date || s.created_at.slice(0, 10) });
  }
  const rank = (x) => (x.overdue ? 0 : x.due ? 1 : 2);
  return items.sort((a, b) => rank(a) - rank(b) || String(a.due || '9').localeCompare(String(b.due || '9')) || (b.age_days || 0) - (a.age_days || 0));
}

// ───────────────────────── Overview ─────────────────────────

export function overview(db, userId) {
  const now = today();
  const n = (sql, ...p) => db.prepare(sql).get(userId, ...p).n;
  const fu = followUps(db, userId, now);
  const weekEnd = new Date(Date.parse(`${now}T00:00:00Z`) + 13 * 86400000).toISOString().slice(0, 10);
  return {
    today: now,
    counts: {
      incoming_open: n(`SELECT COUNT(*) n FROM administrative_transactions WHERE user_id = ? AND deleted_at IS NULL AND direction = 'incoming' AND ${OPEN}`),
      outgoing_open: n(`SELECT COUNT(*) n FROM administrative_transactions WHERE user_id = ? AND deleted_at IS NULL AND direction = 'outgoing' AND ${OPEN}`),
      follow_ups: fu.length, overdue: fu.filter((x) => x.overdue).length,
      meetings_upcoming: n(`SELECT COUNT(*) n FROM meetings WHERE user_id = ? AND deleted_at IS NULL AND status = 'scheduled' AND meeting_date BETWEEN ? AND ?`, now, weekEnd),
      minutes_pending: fu.filter((x) => x.kind === 'minutes').length,
      secretariat_in_process: fu.filter((x) => x.kind === 'secretariat').length,
      tasks_open: fu.filter((x) => x.kind === 'task').length,
      log_today: n('SELECT COUNT(*) n FROM daily_logs WHERE user_id = ? AND deleted_at IS NULL AND log_date = ?', now),
    },
    follow_ups: fu.slice(0, 8),
    upcoming_meetings: db.prepare(`SELECT id, title, body, meeting_date, start_time, venue, role FROM meetings WHERE user_id = ? AND deleted_at IS NULL
        AND status = 'scheduled' AND meeting_date >= ? ORDER BY meeting_date, start_time LIMIT 6`).all(userId, now),
    log_today: db.prepare('SELECT * FROM daily_logs WHERE user_id = ? AND deleted_at IS NULL AND log_date = ? ORDER BY start_time, id').all(userId, now),
    recent: db.prepare(`SELECT id, direction, reference_no, subject, counterpart, status, logged_date FROM administrative_transactions
        WHERE user_id = ? AND deleted_at IS NULL ORDER BY id DESC LIMIT 6`).all(userId),
  };
}

// ───────────────────────── Meetings and minutes ─────────────────────────

export function cleanAgenda(a) {
  if (!Array.isArray(a)) return [];
  return a.slice(0, 60).map((x) => ({ item: str(x?.item, 1000), presenter: str(x?.presenter, 200) })).filter((x) => x.item);
}

export function cleanMinutes(m) {
  if (!m || typeof m !== 'object') return { items: [] };
  const items = Array.isArray(m.items) ? m.items : [];
  if (items.length > 80) throw new HttpError(422, 'At most 80 minute items');
  const time = (v) => { const s = str(v, 5); return /^([01]\d|2[0-3]):[0-5]\d$/.test(s) ? s : ''; };
  return {
    call_to_order: time(m.call_to_order), quorum: str(m.quorum, 500), previous_minutes: str(m.previous_minutes, 2000),
    items: items.map((x) => ({
      topic: str(x?.topic, 500), discussion: str(x?.discussion, 12000), action: str(x?.action, 4000),
      responsible: str(x?.responsible, 300), due: ISO.test(x?.due || '') ? x.due : '', task_id: Number.isInteger(x?.task_id) ? x.task_id : null,
    })).filter((x) => x.topic || x.discussion || x.action),
    other_matters: str(m.other_matters, 8000), adjournment: time(m.adjournment), next_meeting: str(m.next_meeting, 300),
    prepared_by: str(m.prepared_by, 200), prepared_by_title: str(m.prepared_by_title, 200),
    approved_by: str(m.approved_by, 200), approved_by_title: str(m.approved_by_title, 200),
  };
}

function ownedMeeting(db, userId, id) {
  const m = db.prepare('SELECT * FROM meetings WHERE id = ? AND user_id = ? AND deleted_at IS NULL').get(Number(id), userId);
  if (!m) throw new HttpError(404, 'Meeting not found');
  return m;
}

export function meetingDetail(db, userId, id) {
  const m = ownedMeeting(db, userId, id);
  const prof = db.prepare('SELECT full_name, current_position FROM professional_profiles WHERE user_id = ?').get(userId) || {};
  const minutes = cleanMinutes(parse(m.minutes_json, {}));
  return {
    meeting: { ...m, agenda_json: undefined, minutes_json: undefined },
    agenda: cleanAgenda(parse(m.agenda_json, [])), minutes,
    defaults: { prepared_by: prof.full_name || '', prepared_by_title: m.role === 'secretary' ? 'Secretary' : (prof.current_position || ''), approved_by: m.presiding || '', approved_by_title: 'Presiding Officer' },
    records: db.prepare('SELECT id, record_type, record_no, title, status FROM secretariat_records WHERE meeting_id = ? AND user_id = ? AND deleted_at IS NULL ORDER BY id').all(m.id, userId),
    tasks: db.prepare("SELECT id, title, due_date, status FROM tasks WHERE user_id = ? AND deleted_at IS NULL AND linked_entity_type = 'meetings' AND linked_entity_id = ? ORDER BY id").all(userId, m.id),
  };
}

export function saveMinutes(db, userId, id, body = {}) {
  const m = ownedMeeting(db, userId, id);
  const patch = {};
  if ('agenda' in body) patch.agenda_json = cleanAgenda(body.agenda);
  if ('minutes' in body) patch.minutes_json = cleanMinutes(body.minutes);
  if ('minutes_status' in body) patch.minutes_status = body.minutes_status;
  if (patch.minutes_json && m.minutes_status === 'none' && !('minutes_status' in body)
    && (patch.minutes_json.items.length || patch.minutes_json.call_to_order)) patch.minutes_status = 'draft';
  if (Object.keys(patch).length) update(db, userId, 'meetings', m.id, patch);
  return meetingDetail(db, userId, m.id);
}

/** Turn action items in the minutes into administrative tasks (once each), linked back to the meeting. */
export function createActionTasks(db, userId, id) {
  const m = ownedMeeting(db, userId, id);
  const minutes = cleanMinutes(parse(m.minutes_json, {}));
  let created = 0;
  tx(db, () => {
    for (const item of minutes.items) {
      if (!item.action || (item.task_id && db.prepare('SELECT 1 FROM tasks WHERE id = ? AND user_id = ? AND deleted_at IS NULL').get(item.task_id, userId))) continue;
      const t = create(db, userId, 'tasks', {
        title: item.action.slice(0, 480), notes: [item.topic && `From the minutes of ${m.title} (${m.meeting_date}): ${item.topic}`, item.responsible && `Responsible: ${item.responsible}`].filter(Boolean).join('\n'),
        due_date: item.due || null, module: 'admin', priority: 'normal', status: 'open', linked_entity_type: 'meetings', linked_entity_id: m.id,
      });
      item.task_id = t.id;
      created++;
    }
    if (created) update(db, userId, 'meetings', m.id, { minutes_json: minutes });
  });
  return { created, ...meetingDetail(db, userId, m.id) };
}

// ───────────────────────── Secretariat records ─────────────────────────

const RECORD_WORD = { resolution: 'Resolution', certification: 'Certification', memorandum: 'Memorandum', referendum: 'Referendum', notice_of_meeting: 'Notice', minutes: 'Minutes', excerpt: 'Excerpt', other: 'Record' };

/** "Resolution No. 3, s. 2026" — the next number of that type in the year. */
export function nextRecordNo(db, userId, type, date = today()) {
  const year = date.slice(0, 4);
  const word = RECORD_WORD[type] || 'Record';
  const rows = db.prepare(`SELECT record_no FROM secretariat_records WHERE user_id = ? AND record_type = ? AND record_no LIKE ?`).all(userId, type, `% s. ${year}`);
  const max = rows.reduce((mx, r) => Math.max(mx, Number(/No\.\s*(\d+)/i.exec(r.record_no)?.[1]) || 0), 0);
  return `${word} No. ${max + 1}, s. ${year}`;
}

createHooks.secretariat_records = (db, userId, input) => {
  if (!str(input.record_no) && input.record_type && input.record_type in RECORD_WORD && input.record_type !== 'minutes') {
    input.record_no = nextRecordNo(db, userId, input.record_type, ISO.test(input.record_date || '') ? input.record_date : today());
  }
  return input;
};

export function createSecretariatRecord(db, userId, body = {}) {
  return create(db, userId, 'secretariat_records', body);
}

// ───────────────────────── Daily log ─────────────────────────

export function dailyLog(db, userId, q = {}) {
  const to = q.to || today();
  const from = q.from || new Date(Date.parse(`${to}T00:00:00Z`) - 6 * 86400000).toISOString().slice(0, 10);
  if (!ISO.test(from) || !ISO.test(to) || to < from) throw new HttpError(422, 'Invalid range', { from: 'Use YYYY-MM-DD, on or before "to"' });
  if (days(from, to) > 366) throw new HttpError(422, 'Choose at most one year');
  const rows = db.prepare('SELECT * FROM daily_logs WHERE user_id = ? AND deleted_at IS NULL AND log_date BETWEEN ? AND ? ORDER BY log_date DESC, start_time, id').all(userId, from, to);
  const byDay = {};
  for (const r of rows) (byDay[r.log_date] ||= []).push(r);
  const byCategory = {};
  for (const r of rows) {
    const k = r.category || 'other';
    byCategory[k] ||= { entries: 0, quantity: 0, minutes: 0 };
    byCategory[k].entries++;
    byCategory[k].quantity += r.quantity || 0;
    if (r.start_time && r.end_time && r.end_time > r.start_time) byCategory[k].minutes += (Number(r.end_time.slice(0, 2)) * 60 + Number(r.end_time.slice(3))) - (Number(r.start_time.slice(0, 2)) * 60 + Number(r.start_time.slice(3)));
  }
  return { from, to, days: Object.entries(byDay).map(([date, entries]) => ({ date, entries })), by_category: byCategory, total: rows.length };
}

// ───────────────────────── Turnover documentation ─────────────────────────

export const TURNOVER_SECTIONS = [
  ['responsibilities', 'Functions and responsibilities'],
  ['correspondence', 'Pending correspondence and routing status'],
  ['follow_ups', 'Follow-ups and open tasks'],
  ['meetings', 'Meetings and minutes'],
  ['secretariat', 'Secretariat records in process'],
  ['routine', 'Recurring work (from the daily log, last 90 days)'],
  ['files', 'Files and where they are kept'],
  ['other', 'Other matters'],
];

/** Live snapshot of what the successor needs, built from records at the moment it is viewed or exported. */
export function turnoverSnapshot(db, userId, now = today()) {
  const since = new Date(Date.parse(`${now}T00:00:00Z`) - 90 * 86400000).toISOString().slice(0, 10);
  const corr = listCorrespondence(db, userId, { status: 'open' });
  const routes = routeSummary(db, corr.map((c) => c.id));
  return {
    as_of: now,
    responsibilities: db.prepare(`SELECT id, committee, role, institution, assignment_type, start_date FROM committee_assignments
        WHERE user_id = ? AND deleted_at IS NULL AND (is_current = 1 OR end_date IS NULL OR end_date >= ?) ORDER BY start_date`).all(userId, now),
    correspondence: corr.map((c) => ({ ...c, routes: routes[c.id] || [] })),
    follow_ups: followUps(db, userId, now).filter((x) => ['task', 'route', 'correspondence'].includes(x.kind)),
    meetings: {
      upcoming: db.prepare(`SELECT id, title, body, meeting_date, start_time, venue, role FROM meetings WHERE user_id = ? AND deleted_at IS NULL AND status = 'scheduled' AND meeting_date >= ? ORDER BY meeting_date`).all(userId, now),
      minutes_pending: db.prepare(`SELECT id, title, meeting_date, minutes_status FROM meetings WHERE user_id = ? AND deleted_at IS NULL AND status = 'held' AND minutes_status <> 'approved' ORDER BY meeting_date`).all(userId),
    },
    secretariat: db.prepare(`SELECT id, record_type, record_no, title, status, record_date FROM secretariat_records WHERE user_id = ? AND deleted_at IS NULL AND status IN ('draft','for_signature','signed') ORDER BY record_date`).all(userId),
    routine: db.prepare(`SELECT COALESCE(category, 'other') category, COUNT(*) entries, COUNT(DISTINCT log_date) days, SUM(COALESCE(quantity, 0)) quantity,
        GROUP_CONCAT(DISTINCT activity) sample FROM daily_logs WHERE user_id = ? AND deleted_at IS NULL AND log_date >= ? GROUP BY COALESCE(category, 'other') ORDER BY entries DESC`).all(userId, since)
      .map((r) => ({ ...r, sample: String(r.sample || '').split(',').slice(0, 4) })),
    files: db.prepare(`SELECT f.id, f.title, f.provider, f.url, COUNT(e.id) linked FROM external_file_references f
        JOIN evidence_links e ON e.file_ref_id = f.id
        WHERE f.user_id = ? AND f.deleted_at IS NULL GROUP BY f.id ORDER BY f.title LIMIT 200`).all(userId),
  };
}

export function turnoverDetail(db, userId, id) {
  const d = getRecord(db, userId, 'turnover_documents', id);
  const notes = d.notes_json && typeof d.notes_json === 'object' ? d.notes_json : {};
  return { document: { ...d, notes_json: undefined }, notes: Object.fromEntries(TURNOVER_SECTIONS.map(([k]) => [k, str(notes[k], 20000)])), sections: TURNOVER_SECTIONS, snapshot: turnoverSnapshot(db, userId) };
}

export function saveTurnoverNotes(db, userId, id, notes = {}) {
  getRecord(db, userId, 'turnover_documents', id);
  if (!notes || typeof notes !== 'object') throw new HttpError(422, 'Notes must be an object');
  const clean = Object.fromEntries(TURNOVER_SECTIONS.map(([k]) => [k, str(notes[k], 20000)]));
  update(db, userId, 'turnover_documents', id, { notes_json: clean });
  return turnoverDetail(db, userId, id);
}

// ───────────────────────── Role change (transfer or faculty appointment) ─────────────────────────

const MODES = ['administrative', 'instructor', 'researcher', 'faculty_development'];

/**
 * Record a transfer or new appointment in one step: profile position/office, academic mode, the end of the current
 * employment record and the start of the new one, and optionally a draft turnover document for the old office.
 */
export function roleChange(db, userId, body = {}) {
  const errors = {};
  const effective = body.effective_date || today();
  if (!ISO.test(effective)) errors.effective_date = 'Use YYYY-MM-DD';
  const position = str(body.position, 300);
  if (!position) errors.position = 'Required';
  if (body.academic_mode && !MODES.includes(body.academic_mode)) errors.academic_mode = `One of: ${MODES.join(', ')}`;
  const office = str(body.office, 300) || null;
  const institution = str(body.institution, 300) || null;
  const prof = db.prepare('SELECT * FROM professional_profiles WHERE user_id = ?').get(userId) || {};
  if (body.create_employment !== false && !institution && !prof.current_institution) errors.institution = 'Required for the new employment record (your profile has no current institution)';
  if (Object.keys(errors).length) throw new HttpError(422, 'Validation failed', errors);
  const dayBefore = new Date(Date.parse(`${effective}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);
  const result = { ended: [], employment_id: null, turnover_id: null };
  tx(db, () => {
    if (body.turnover && (prof.current_office || prof.current_position)) {
      result.turnover_id = create(db, userId, 'turnover_documents', {
        title: `Turnover — ${prof.current_office || prof.current_position}`, office: prof.current_office, position: prof.current_position,
        effective_date: effective, status: 'draft',
      }).id;
    }
    if (body.end_current !== false) {
      for (const e of db.prepare('SELECT * FROM employment_records WHERE user_id = ? AND deleted_at IS NULL AND is_current = 1').all(userId)) {
        update(db, userId, 'employment', e.id, { is_current: false, end_date: e.start_date && e.start_date > dayBefore ? e.start_date : dayBefore });
        result.ended.push(e.id);
      }
    }
    if (body.create_employment !== false) {
      result.employment_id = create(db, userId, 'employment', {
        position, office, institution: institution || prof.current_institution, start_date: effective, is_current: true,
        employment_type: body.employment_type || null, verification: 'self_reported',
      }).id;
    }
    const sets = { current_position: position, current_office: office, ...(institution ? { current_institution: institution } : {}) };
    db.prepare(`UPDATE professional_profiles SET ${Object.keys(sets).map((k) => `${k} = ?`).join(', ')}, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE user_id = ?`)
      .run(...Object.values(sets), userId);
    indexProfile(db, userId);
    if (body.academic_mode) db.prepare('UPDATE user_profiles SET academic_mode = ? WHERE user_id = ?').run(body.academic_mode, userId);
    audit(db, userId, 'profile', prof.id || null, 'update', `Role change effective ${effective}: ${prof.current_position || '—'} → ${position}`,
      { current_position: [prof.current_position || null, position], current_office: [prof.current_office || null, office], ...(body.academic_mode ? { academic_mode: [null, body.academic_mode] } : {}) });
  });
  return result;
}
