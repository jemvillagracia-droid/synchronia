// Central Nexus: dashboard aggregation, notifications, global search and quick capture.
// Every number here is computed from stored records — nothing is estimated or invented.
import { RESOURCES, PORTFOLIO_GROUPS } from './resources.js';
import { HttpError, create } from './repo.js';

export const WIDGETS = [
  { id: 'profile', title: 'Professional Profile' },
  { id: 'development', title: 'Academic Development' },
  { id: 'deadlines', title: 'Upcoming Deadlines' },
  { id: 'teaching', title: 'Teaching Portfolio' },
  { id: 'research', title: 'Research Productivity' },
  { id: 'extension', title: 'Extension Activities' },
  { id: 'pd', title: 'Professional Development' },
  { id: 'admin', title: 'Administrative Queue' },
  { id: 'recent_records', title: 'Recently Updated Records' },
  { id: 'accomplishments', title: 'Recent Accomplishments' },
  { id: 'recent_cvs', title: 'Generated CV Documents' },
  { id: 'captures', title: 'Captured Notes & Ideas' },
];

/** Default widget order shifts with the user's role, until they customise it. */
const MODE_PRIORITY = {
  administrative: ['profile', 'admin', 'deadlines', 'development', 'recent_records', 'pd', 'accomplishments'],
  instructor: ['profile', 'teaching', 'deadlines', 'development', 'pd', 'research'],
  researcher: ['profile', 'research', 'deadlines', 'development', 'extension', 'pd'],
  faculty_development: ['profile', 'development', 'pd', 'deadlines', 'teaching', 'research'],
};

export function defaultLayout(mode = 'administrative') {
  const first = MODE_PRIORITY[mode] || MODE_PRIORITY.administrative;
  const ids = [...first, ...WIDGETS.map((w) => w.id).filter((id) => !first.includes(id))];
  return ids.map((id) => ({ id, visible: true }));
}

/** Merge a stored layout with the current widget catalogue (handles new/removed widgets). */
export function normaliseLayout(stored, mode) {
  if (!Array.isArray(stored)) return defaultLayout(mode);
  const known = new Set(WIDGETS.map((w) => w.id));
  const seen = new Set();
  const out = [];
  for (const w of stored) {
    if (w && known.has(w.id) && !seen.has(w.id)) { out.push({ id: w.id, visible: w.visible !== false }); seen.add(w.id); }
  }
  for (const w of WIDGETS) if (!seen.has(w.id)) out.push({ id: w.id, visible: true });
  return out;
}

// Dates use the server's local calendar day (the app runs on the user's own machine / timezone).
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const today = () => ymd(new Date());
const addDays = (d, n) => { const [y, m, day] = d.split('-').map(Number); return ymd(new Date(y, m - 1, day + n)); };
const count = (db, table, userId, extra = '', ...params) =>
  db.prepare(`SELECT COUNT(*) n FROM ${table} WHERE user_id = ? AND deleted_at IS NULL ${extra}`).get(userId, ...params).n;
const groupCount = (db, table, col, userId) =>
  Object.fromEntries(db.prepare(`SELECT ${col} k, COUNT(*) n FROM ${table} WHERE user_id = ? AND deleted_at IS NULL GROUP BY ${col}`).all(userId).map((r) => [r.k, r.n]));

const PROFILE_FIELDS = ['full_name', 'professional_title', 'academic_designation', 'biography', 'email', 'phone', 'specialization', 'research_interests', 'current_position', 'current_institution'];

export function profileRow(db, userId) {
  return db.prepare('SELECT * FROM professional_profiles WHERE user_id = ?').get(userId);
}

export function nexus(db, userId) {
  const t = today();
  const prefs = db.prepare('SELECT * FROM user_profiles WHERE user_id = ?').get(userId);
  const mode = prefs?.academic_mode || 'administrative';
  let stored = null;
  try { stored = prefs?.dashboard_layout ? JSON.parse(prefs.dashboard_layout) : null; } catch { stored = null; }

  // Profile & position
  const p = profileRow(db, userId) || {};
  const filled = PROFILE_FIELDS.filter((f) => p[f] && String(p[f]).trim());
  const currentEmployment = db.prepare(`SELECT position, institution, office, start_date FROM employment_records
     WHERE user_id = ? AND deleted_at IS NULL AND is_current = 1 ORDER BY start_date DESC LIMIT 1`).get(userId);
  const currentAppointment = db.prepare(`SELECT academic_rank, institution, department, start_date FROM academic_appointments
     WHERE user_id = ? AND deleted_at IS NULL AND is_current = 1 ORDER BY start_date DESC LIMIT 1`).get(userId);

  // Development progress: portfolio coverage + evidence + verification
  const portfolioResources = Object.values(RESOURCES).filter((r) => r.group);
  const groups = PORTFOLIO_GROUPS.map((g) => ({
    ...g,
    count: portfolioResources.filter((r) => r.group === g.key).reduce((s, r) => s + count(db, r.table, userId), 0),
  }));
  let totalRecords = 0, evidenced = 0;
  const verificationTotals = { self_reported: 0, user_confirmed: 0, evidence_verified: 0 };
  for (const r of portfolioResources) {
    totalRecords += count(db, r.table, userId);
    evidenced += db.prepare(`SELECT COUNT(DISTINCT e.entity_id) n FROM evidence_links e JOIN ${r.table} x ON x.id = e.entity_id
       WHERE e.entity_type = ? AND x.user_id = ? AND x.deleted_at IS NULL`).get(r.key, userId).n;
    for (const [k, n] of Object.entries(groupCount(db, r.table, 'verification', userId))) verificationTotals[k] = (verificationTotals[k] || 0) + n;
  }

  // Teaching
  const teaching = {
    courses: count(db, 'courses', userId),
    active_assignments: count(db, 'teaching_assignments', userId, "AND status = 'active'"),
    assignments: count(db, 'teaching_assignments', userId),
    syllabi: count(db, 'syllabi', userId),
    syllabi_approved: count(db, 'syllabi', userId, "AND status = 'approved'"),
    materials: count(db, 'instructional_materials', userId),
    assessments: count(db, 'assessments', userId),
    rubrics: count(db, 'rubrics', userId),
    tos: count(db, 'tables_of_specifications', userId),
  };

  // Research
  const research = {
    projects_by_status: groupCount(db, 'research_projects', 'status', userId),
    projects: count(db, 'research_projects', userId),
    publications_by_status: groupCount(db, 'publications', 'status', userId),
    publications: count(db, 'publications', userId),
    published: count(db, 'publications', userId, "AND status = 'published'"),
    presentations: count(db, 'conference_presentations', userId),
  };

  // Extension
  const extension = {
    by_status: groupCount(db, 'extension_projects', 'status', userId),
    total: count(db, 'extension_projects', userId),
    recent: db.prepare(`SELECT id, title, status, start_date FROM extension_projects WHERE user_id = ? AND deleted_at IS NULL
                        ORDER BY COALESCE(start_date, created_at) DESC LIMIT 4`).all(userId),
  };

  // Professional development
  const year = t.slice(0, 4);
  const pdAll = db.prepare(`SELECT COUNT(*) n, COALESCE(SUM(hours),0) hours, COALESCE(SUM(cpd_units),0) cpd FROM training_records
                            WHERE user_id = ? AND deleted_at IS NULL`).get(userId);
  const pdYear = db.prepare(`SELECT COUNT(*) n, COALESCE(SUM(hours),0) hours, COALESCE(SUM(cpd_units),0) cpd FROM training_records
                             WHERE user_id = ? AND deleted_at IS NULL AND substr(COALESCE(start_date,''),1,4) = ?`).get(userId, year);
  const pd = {
    total: pdAll.n, hours: pdAll.hours, cpd_units: pdAll.cpd,
    year, year_total: pdYear.n, year_hours: pdYear.hours, year_cpd_units: pdYear.cpd,
    recent: db.prepare(`SELECT id, title, organizer, start_date, hours FROM training_records WHERE user_id = ? AND deleted_at IS NULL
                        ORDER BY COALESCE(start_date, created_at) DESC LIMIT 4`).all(userId),
  };

  // Deadlines (next 30 days + overdue)
  const horizon = addDays(t, 30);
  const deadlines = db.prepare(`SELECT id, title, due_date, priority, module, status, is_deadline FROM tasks
      WHERE user_id = ? AND deleted_at IS NULL AND status IN ('open','in_progress') AND due_date IS NOT NULL AND due_date <= ?
      ORDER BY due_date ASC, CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END LIMIT 12`)
    .all(userId, horizon).map((d) => ({ ...d, is_deadline: !!d.is_deadline, overdue: d.due_date < t }));
  const undatedOpen = count(db, 'tasks', userId, "AND status IN ('open','in_progress') AND due_date IS NULL");

  // Administrative queue
  const admin = {
    open_tasks: db.prepare(`SELECT id, title, due_date, priority, status FROM tasks WHERE user_id = ? AND deleted_at IS NULL
        AND module = 'admin' AND status IN ('open','in_progress') ORDER BY due_date IS NULL, due_date LIMIT 6`).all(userId),
    correspondence_pending: count(db, 'administrative_transactions', userId, "AND status IN ('received','routed','in_progress','for_follow_up')"),
    follow_ups: count(db, 'administrative_transactions', userId, "AND status = 'for_follow_up'"),
    incoming: count(db, 'administrative_transactions', userId, "AND direction = 'incoming'"),
    outgoing: count(db, 'administrative_transactions', userId, "AND direction = 'outgoing'"),
  };

  // Recently updated portfolio & academic records
  const recentSources = Object.values(RESOURCES).filter((r) => r.group || ['courses', 'syllabi', 'materials', 'assessments'].includes(r.key));
  const recent_records = db.prepare(recentSources.map((r) =>
    `SELECT '${r.key}' AS type, id, ${r.title} AS title, updated_at, created_at FROM ${r.table} WHERE user_id = ${Number(userId)} AND deleted_at IS NULL`,
  ).join(' UNION ALL ') + ' ORDER BY updated_at DESC LIMIT 8').all()
    .map((x) => ({ ...x, label: RESOURCES[x.type].label, module: RESOURCES[x.type].module, is_new: x.created_at === x.updated_at }));

  // Accomplishments: awards, accomplishment entries, captured accomplishments
  const accomplishments = db.prepare(`SELECT * FROM (
      SELECT 'awards' type, id, title, date_received AS event_date, verification, created_at FROM awards WHERE user_id = ?1 AND deleted_at IS NULL
      UNION ALL SELECT 'portfolio_entries', id, title, event_date, verification, created_at FROM portfolio_entries WHERE user_id = ?1 AND deleted_at IS NULL
      UNION ALL SELECT 'activities', id, title, event_date, NULL, created_at FROM activities WHERE user_id = ?1 AND deleted_at IS NULL AND kind = 'accomplishment')
      ORDER BY COALESCE(event_date, substr(created_at,1,10)) DESC LIMIT 6`).all(userId)
    .map((a) => ({ ...a, label: RESOURCES[a.type].label }));

  // CVs
  const recent_cvs = {
    profiles: count(db, 'cv_profiles', userId),
    exports: db.prepare(`SELECT x.id, x.file_name, x.format, x.created_at, p.name AS profile FROM cv_exports x
        JOIN cv_profiles p ON p.id = x.cv_profile_id WHERE x.user_id = ? ORDER BY x.created_at DESC LIMIT 5`).all(userId),
  };

  // Quick-captured notes and ideas
  const captures = db.prepare(`SELECT id, kind, title, body, event_date, created_at FROM activities
      WHERE user_id = ? AND deleted_at IS NULL AND kind IN ('idea','research_note','activity','meeting')
      ORDER BY created_at DESC LIMIT 6`).all(userId);

  const recent_changes = db.prepare(`SELECT id, entity_type, entity_id, action, summary, at FROM audit_logs
      WHERE user_id = ? AND action IN ('create','update','delete','restore') ORDER BY id DESC LIMIT 10`).all(userId);

  return {
    generated_at: new Date().toISOString(),
    today: t,
    mode,
    layout: normaliseLayout(stored, mode),
    layout_customised: !!stored,
    widgets: WIDGETS,
    profile: {
      full_name: p.full_name || null, professional_title: p.professional_title || null,
      academic_designation: p.academic_designation || null, specialization: p.specialization || null,
      current_position: p.current_position || currentEmployment?.position || null,
      current_office: p.current_office || currentEmployment?.office || null,
      current_institution: p.current_institution || currentEmployment?.institution || null,
      career_goal: p.career_goal || null,
      current_appointment: currentAppointment || null,
      completeness: { filled: filled.length, total: PROFILE_FIELDS.length, missing: PROFILE_FIELDS.filter((f) => !filled.includes(f)) },
    },
    development: {
      groups, total_records: totalRecords, evidenced,
      groups_covered: groups.filter((g) => g.count > 0).length, verification: verificationTotals,
    },
    teaching, research, extension, pd,
    deadlines: { items: deadlines, undated_open: undatedOpen },
    admin, recent_records, accomplishments, recent_cvs, captures, recent_changes,
  };
}

export function notifications(db, userId) {
  const t = today();
  const soon = addDays(t, 3);
  const items = [];
  for (const task of db.prepare(`SELECT id, title, due_date, priority FROM tasks WHERE user_id = ? AND deleted_at IS NULL
      AND status IN ('open','in_progress') AND due_date IS NOT NULL AND due_date <= ? ORDER BY due_date`).all(userId, soon)) {
    items.push({
      id: `task-${task.id}`, type: 'tasks', entity_id: task.id,
      level: task.due_date < t ? 'critical' : task.due_date === t ? 'warning' : 'info',
      title: task.title,
      detail: task.due_date < t ? `Overdue since ${task.due_date}` : task.due_date === t ? 'Due today' : `Due ${task.due_date}`,
    });
  }
  for (const c of db.prepare(`SELECT id, subject, due_date FROM administrative_transactions WHERE user_id = ? AND deleted_at IS NULL
      AND status NOT IN ('completed','archived') AND due_date IS NOT NULL AND due_date <= ? ORDER BY due_date`).all(userId, soon)) {
    items.push({
      id: `corr-${c.id}`, type: 'correspondence', entity_id: c.id, level: c.due_date < t ? 'critical' : 'warning',
      title: c.subject, detail: c.due_date < t ? `Follow-up overdue since ${c.due_date}` : `Follow-up due ${c.due_date}`,
    });
  }
  return { items };
}

/** Full-text search across every structured record the user owns. */
export function search(db, userId, q, limit = 30) {
  const terms = String(q || '').normalize('NFKC').match(/[\p{L}\p{N}]+/gu) || [];
  if (!terms.length) return { query: q, results: [] };
  const match = terms.slice(0, 8).map((w) => `"${w.replace(/"/g, '')}"*`).join(' ');
  const rows = db.prepare(`SELECT entity_type, entity_id, title,
        highlight(search_index, 3, '[[', ']]') AS title_hl,
        snippet(search_index, 4, '[[', ']]', '…', 14) AS snippet, bm25(search_index, 0, 0, 0, 5, 1) AS score
      FROM search_index WHERE search_index MATCH ? AND user_id = ? ORDER BY score LIMIT ?`)
    .all(match, userId, Math.min(Number(limit) || 30, 100));
  return {
    query: q,
    results: rows.map((r) => ({
      type: r.entity_type,
      id: Number(r.entity_id),
      title: r.title,
      title_highlighted: r.title_hl || r.title,
      snippet: r.snippet || '',
      label: r.entity_type === 'profile' ? 'Professional Profile' : RESOURCES[r.entity_type]?.label || r.entity_type,
      module: r.entity_type === 'profile' ? 'portfolio' : RESOURCES[r.entity_type]?.module || 'nexus',
    })),
  };
}

const CAPTURE_KINDS = ['task', 'activity', 'idea', 'research_note', 'accomplishment'];
const MODULE_FOR_KIND = { research_note: 'research', accomplishment: 'portfolio' };

/** Quick Capture writes into the proper table: tasks → tasks, everything else → activities. */
export function capture(db, userId, body) {
  const { kind, title, body: text, due_date, priority, module, event_date, is_deadline } = body || {};
  if (!CAPTURE_KINDS.includes(kind)) throw new HttpError(422, 'Choose what you are capturing.', { kind: `One of: ${CAPTURE_KINDS.join(', ')}` });
  if (kind === 'task') {
    return create(db, userId, 'tasks', {
      title, notes: text, due_date, priority: priority || 'normal', module: module || 'general', is_deadline: !!is_deadline,
    });
  }
  const activityModules = RESOURCES.activities.fields.module.values;
  return create(db, userId, 'activities', {
    kind, title, body: text, event_date: event_date || today(), source: 'quick_capture',
    module: activityModules.includes(module) ? module : MODULE_FOR_KIND[kind] || 'general',
  });
}
