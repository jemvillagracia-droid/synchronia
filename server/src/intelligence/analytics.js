// Intelligence: analytics computed only from stored records. Every figure carries the records it was counted from
// (source traceability), the date it is based on, and how each record is supported (evidence, confirmation, or the
// owner's own entry), so nothing is presented as more certain than the records allow.
import { HttpError, displayTitle, getResource } from '../repo.js';

const today = () => new Date().toISOString().slice(0, 10);
const ISO = /^\d{4}-\d{2}-\d{2}$/;

// A school year "2026-2027" runs 1 June 2026 – 31 May 2027 for period matching.
const AY_START = (col) => `(substr(${col}, 1, 4) || '-06-01')`;
const AY_END = (col) => `(substr(${col}, 6, 4) || '-05-31')`;
const AY_OK = (col) => `${col} GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9][0-9][0-9]'`;

/**
 * Period rules (each returns the SQL date expression(s) used, so undated records can be reported separately):
 *  event  – a single date falls in the period
 *  span   – the activity overlaps the period (start ≤ to, and no end or end ≥ from; "current" counts as ongoing)
 *  ay     – the school year overlaps the period
 *  none   – current state; not filtered by date
 */
const event = (expr) => ({ kind: 'event', expr });
const span = (start, end, current = null) => ({ kind: 'span', start, end, current });

export const SECTIONS = [
  { key: 'academic', code: 'A', label: 'Academic analytics' },
  { key: 'research', code: 'B', label: 'Research analytics' },
  { key: 'extension', code: 'C', label: 'Extension analytics' },
  { key: 'portfolio', code: 'D', label: 'Professional portfolio analytics' },
];

const created = 'substr(t.created_at, 1, 10)';

export const METRICS = [
  // A. Academic
  { key: 'courses', section: 'academic', label: 'Courses managed', resource: 'courses', titleSql: "t.code || ' — ' || t.title",
    period: { kind: 'custom', sql: `EXISTS (SELECT 1 FROM teaching_assignments a WHERE a.course_id = t.id AND a.deleted_at IS NULL AND ${AY_OK('a.academic_year')} AND ${AY_START('a.academic_year')} <= :to AND ${AY_END('a.academic_year')} >= :from)` },
    basis: 'Courses with a class offering in a school year (June–May) that overlaps the period' },
  { key: 'classes', section: 'academic', label: 'Classes handled', resource: 'teaching_assignments', period: { kind: 'ay', col: 't.academic_year' }, titleSql: `(SELECT c.code FROM courses c WHERE c.id = t.course_id) || ' · ' || IFNULL(t.academic_year, '') || IFNULL(' · Sec ' || t.section, '')`,
    sums: [['student_count', 'students']], breakdown: 'semester', basis: 'School year of the offering (June–May)' },
  { key: 'syllabi', section: 'academic', label: 'Syllabi prepared', resource: 'syllabi', titleSql: `(SELECT c.code FROM courses c WHERE c.id = t.course_id) || ' · ' || IFNULL(t.version_label, 'Syllabus')`, period: { kind: 'ay', col: 't.academic_year', fallback: 'substr(t.updated_at, 1, 10)' },
    breakdown: 'status', basis: 'School year of the syllabus, or the date it was last edited when none is set' },
  { key: 'materials', section: 'academic', label: 'Instructional materials produced', resource: 'materials', period: event(`COALESCE(t.event_date, ${created})`),
    breakdown: 'material_type', basis: 'Material date, or the date it was recorded' },
  { key: 'class_activities', section: 'academic', label: 'Teaching activities', resource: 'class_activities', period: event('t.activity_date'),
    breakdown: 'activity_type', basis: 'Date of the class session' },
  { key: 'assessments', section: 'academic', label: 'Assessment tools created', resource: 'assessments', period: event(`COALESCE(t.scheduled_date, ${created})`),
    breakdown: 'assessment_type', basis: 'Scheduled date, or the date it was recorded' },
  { key: 'tos', section: 'academic', label: 'Tables of specifications', resource: 'tos', titleSql: "IFNULL(t.title, 'TOS')", period: event(created), basis: 'Date prepared in SYNCHRONIA' },
  { key: 'rubrics', section: 'academic', label: 'Rubrics', resource: 'rubrics', period: event(created), basis: 'Date prepared in SYNCHRONIA' },
  { key: 'dev_activities', section: 'academic', label: 'Faculty development activities', resource: 'trainings', period: event('t.start_date'),
    sums: [['hours', 'hours'], ['cpd_units', 'CPD units']], breakdown: 'training_type', basis: 'Start date of the training' },

  // B. Research
  { key: 'research_initiated', section: 'research', label: 'Research projects initiated', resource: 'research_projects', where: "IFNULL(t.status, '') <> 'idea'",
    period: event('t.start_date'), breakdown: 'status', basis: 'Start date of the project' },
  { key: 'research_ongoing', section: 'research', label: 'Ongoing research projects', resource: 'research_projects',
    where: "t.status IN ('proposal','approved','data_collection','analysis','writing')", period: span('t.start_date', 't.end_date'),
    breakdown: 'status', basis: 'Project active during the period (started on or before its end, not ended before its start)' },
  { key: 'research_completed', section: 'research', label: 'Completed research', resource: 'research_projects', where: "t.status = 'completed'",
    period: event('t.end_date'), basis: 'End date of the project' },
  { key: 'publications', section: 'research', label: 'Publications (published)', resource: 'publications', where: "t.status = 'published'",
    period: event('t.publication_date'), breakdown: 'publication_type', basis: 'Publication date' },
  { key: 'publications_pipeline', section: 'research', label: 'Manuscripts in progress', resource: 'publications', where: "IFNULL(t.status, '') <> 'published'",
    period: { kind: 'recorded_by' }, breakdown: 'status', basis: 'Current status of manuscripts recorded by the end of the period' },
  { key: 'presentations', section: 'research', label: 'Conference presentations', resource: 'presentations', period: event('t.presentation_date'),
    breakdown: 'presentation_type', basis: 'Presentation date' },
  { key: 'collaborations', section: 'research', label: 'Research collaborations', resource: 'research_projects', where: "TRIM(IFNULL(t.collaborators, '')) <> ''",
    period: span('t.start_date', 't.end_date'), basis: 'Projects with named collaborators, active during the period' },
  { key: 'research_training', section: 'research', label: 'Research training', resource: 'trainings',
    where: "(t.title LIKE '%research%' OR t.organizer LIKE '%research%' OR t.title LIKE '%thesis%' OR t.title LIKE '%statistic%')",
    period: event('t.start_date'), sums: [['hours', 'hours']], basis: 'Trainings whose title or organizer mentions research, thesis or statistics; start date' },

  // C. Extension
  { key: 'extension_projects', section: 'extension', label: 'Extension projects', resource: 'extension_projects',
    where: "IFNULL(t.project_type, 'extension_project') IN ('extension_project', 'other')", period: span('t.start_date', 't.end_date'),
    sums: [['participants_count', 'participants']], breakdown: 'status', basis: 'Project active during the period' },
  { key: 'community_activities', section: 'extension', label: 'Community activities', resource: 'extension_projects',
    where: "t.project_type IN ('community_program', 'engagement')", period: span('t.start_date', 't.end_date'),
    sums: [['participants_count', 'participants']], basis: 'Activity active during the period' },
  { key: 'trainings_conducted', section: 'extension', label: 'Trainings conducted', resource: 'extension_projects',
    where: "t.project_type IN ('training_conducted', 'seminar')", period: span('t.start_date', 't.end_date'),
    sums: [['participants_count', 'participants'], ['training_hours', 'training hours']], basis: 'Training active during the period' },
  { key: 'resource_speaker', section: 'extension', label: 'Engagements as resource person', resource: 'trainings',
    where: "t.role IN ('speaker', 'facilitator', 'organizer')", period: event('t.start_date'), breakdown: 'role', basis: 'Trainings where you were speaker, facilitator or organizer; start date' },
  { key: 'partnerships', section: 'extension', label: 'Institutional partnerships', resource: 'extension_projects', where: "TRIM(IFNULL(t.partner, '')) <> ''",
    period: span('t.start_date', 't.end_date'), distinct: 'partner', basis: 'Distinct partners named on projects active during the period' },
  { key: 'extension_completed', section: 'extension', label: 'Program accomplishments (completed)', resource: 'extension_projects', where: "t.status = 'completed'",
    period: event('COALESCE(t.end_date, t.start_date)'), sums: [['participants_count', 'participants']], basis: 'End date (or start date) of completed projects' },

  // D. Professional portfolio
  { key: 'qualifications', section: 'portfolio', label: 'Qualifications', resource: 'education', period: event('COALESCE(t.graduation_date, t.end_date)'),
    breakdown: 'status', basis: 'Graduation (or end) date' },
  { key: 'licenses', section: 'portfolio', label: 'Licenses', resource: 'licenses', period: event('t.registration_date'),
    derived: (r) => (r.valid_until && r.valid_until < today() ? 'expired' : r.valid_until ? 'valid' : 'no expiry recorded'), basis: 'Registration date' },
  { key: 'trainings', section: 'portfolio', label: 'Trainings', resource: 'trainings', period: event('t.start_date'),
    sums: [['hours', 'hours'], ['cpd_units', 'CPD units']], breakdown: 'training_type', basis: 'Start date' },
  { key: 'awards', section: 'portfolio', label: 'Awards', resource: 'awards', period: event('t.date_received'), breakdown: 'level', basis: 'Date received' },
  { key: 'appointments', section: 'portfolio', label: 'Academic appointments', resource: 'appointments', period: span('t.start_date', 't.end_date', 't.is_current'),
    basis: 'Appointment held during the period' },
  { key: 'employment', section: 'portfolio', label: 'Employment positions', resource: 'employment', period: span('t.start_date', 't.end_date', 't.is_current'),
    basis: 'Position held during the period' },
  { key: 'service', section: 'portfolio', label: 'Institutional service', resource: 'committees', period: span('t.start_date', 't.end_date', 't.is_current'),
    breakdown: 'assignment_type', basis: 'Assignment held during the period' },
  { key: 'memberships', section: 'portfolio', label: 'Professional memberships', resource: 'memberships', period: span('t.start_date', 't.end_date', 't.is_current'),
    basis: 'Membership held during the period' },
  { key: 'development_goals', section: 'portfolio', label: 'Development goals', resource: 'development_goals', period: event(`COALESCE(t.target_date, ${created})`),
    breakdown: 'status', basis: 'Target date, or the date the goal was recorded' },
  { key: 'accomplishments', section: 'portfolio', label: 'Accomplishments', resource: 'portfolio_entries', period: event('t.event_date'), breakdown: 'category', basis: 'Date of the accomplishment' },
];

export const SUPPORT = {
  evidenced: 'Evidence linked or verified',
  confirmed: 'Confirmed by you',
  self_reported: 'Self-reported',
  system: 'Prepared or logged in SYNCHRONIA',
};

const SPECIAL = {
  reports: { key: 'reports', table: 'reports', label: 'Generated document', fields: {}, title: 'title', noDelete: true },
};
const resourceOf = (key) => SPECIAL[key] || getResource(key);

/** Validate and normalise the period and filters. */
export function parseFilters(q = {}) {
  const from = q.from ? String(q.from) : '';
  const to = q.to ? String(q.to) : '';
  const errors = {};
  if (from && !ISO.test(from)) errors.from = 'Use YYYY-MM-DD';
  if (to && !ISO.test(to)) errors.to = 'Use YYYY-MM-DD';
  if (from && to && to < from) errors.to = 'Must be on or after the start of the period';
  const sections = q.sections ? String(q.sections).split(',').filter(Boolean) : SECTIONS.map((s) => s.key);
  const bad = sections.filter((s) => !SECTIONS.some((x) => x.key === s));
  if (bad.length) errors.sections = `Unknown section: ${bad.join(', ')}`;
  const support = q.support ? String(q.support) : 'all';
  if (!['all', 'confirmed', 'evidenced'].includes(support)) errors.support = 'Use all, confirmed or evidenced';
  if (Object.keys(errors).length) throw new HttpError(422, 'Invalid filters', errors);
  return { from: from || null, to: to || null, sections, support };
}

/** Only the named parameters a statement uses (node:sqlite rejects unused ones). */
const bind = (sql, all) => Object.fromEntries(Object.entries(all).filter(([k]) => sql.includes(`:${k}`)));

function periodSql(p) {
  switch (p.kind) {
    case 'event': return { sql: `date_end(${p.expr}) >= :from AND date_start(${p.expr}) <= :to`, undated: `${p.expr} IS NULL OR ${p.expr} = ''`, date: p.expr };
    case 'span': {
      const ongoing = p.current ? `(${p.end} IS NULL OR date_end(${p.end}) >= :from OR ${p.current} = 1)` : `(${p.end} IS NULL OR date_end(${p.end}) >= :from)`;
      return { sql: `date_start(${p.start}) <= :to AND ${ongoing}`, undated: `${p.start} IS NULL OR ${p.start} = ''`, date: p.start };
    }
    case 'ay': {
      const inAy = `${AY_OK(p.col)} AND ${AY_START(p.col)} <= :to AND ${AY_END(p.col)} >= :from`;
      if (p.fallback) return { sql: `((${inAy}) OR (NOT (${AY_OK(p.col)}) AND ${p.fallback} BETWEEN :from AND :to))`, undated: null, date: `CASE WHEN ${AY_OK(p.col)} THEN ${AY_START(p.col)} ELSE ${p.fallback} END` };
      return { sql: inAy, undated: `NOT (${AY_OK(p.col)})`, date: `CASE WHEN ${AY_OK(p.col)} THEN ${AY_START(p.col)} END` };
    }
    case 'custom': return { sql: p.sql, undated: null, date: null };
    case 'recorded_by': return { sql: 'substr(t.created_at, 1, 10) <= :to', undated: null, date: null };
    default: return { sql: null, undated: null, date: null };
  }
}

function supportOf(r, row, evidence) {
  if (evidence > 0 || row.verification === 'evidence_verified') return 'evidenced';
  if (!('verification' in (r.fields || {}))) return 'system';
  return row.verification === 'user_confirmed' ? 'confirmed' : 'self_reported';
}

function evidenceMap(db, type, ids) {
  if (!ids.length) return {};
  const out = {};
  for (let i = 0; i < ids.length; i += 500) {
    const chunk = ids.slice(i, i + 500);
    for (const x of db.prepare(`SELECT e.entity_id id, COUNT(*) n FROM evidence_links e JOIN external_file_references f ON f.id = e.file_ref_id AND f.deleted_at IS NULL
        WHERE e.entity_type = ? AND e.entity_id IN (${chunk.map(() => '?').join(',')}) GROUP BY e.entity_id`).all(type, ...chunk)) out[x.id] = x.n;
  }
  return out;
}

const human = (s) => (s == null || s === '' ? 'Not set' : String(s).replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase()));

/** Compute one metric: count, sums, breakdown, support split and the source records. */
export function computeMetric(db, userId, m, f) {
  const r = resourceOf(m.resource);
  const ps = periodSql(m.period);
  const filtered = !!(f.from || f.to) && ps.sql;
  const params = { uid: userId, from: f.from || '0000-01-01', to: f.to || '9999-12-31' };
  const base = [`t.user_id = :uid`, r.noDelete ? null : 't.deleted_at IS NULL', m.where || null].filter(Boolean);
  const dateCol = (ps.date ? `, ${ps.date} AS _date` : ', NULL AS _date') + (m.titleSql ? `, ${m.titleSql} AS _title` : ', NULL AS _title');
  const sql = `SELECT t.*${dateCol} FROM ${r.table} t WHERE ${[...base, filtered ? `(${ps.sql})` : null].filter(Boolean).join(' AND ')} ORDER BY _date DESC, t.id DESC`;
  const rows = db.prepare(sql).all(bind(sql, params));
  const usql = filtered && ps.undated ? `SELECT COUNT(*) n FROM ${r.table} t WHERE ${[...base, `(${ps.undated})`].join(' AND ')}` : null;
  const undated = usql ? db.prepare(usql).get(bind(usql, params)).n : 0;
  const ev = evidenceMap(db, m.resource, rows.map((x) => x.id));
  let sources = rows.map((row) => {
    const support = supportOf(r, row, ev[row.id] || 0);
    const title = row._title || (SPECIAL[m.resource] ? row[r.title] : displayTitle(r, row));
    const group = m.derived ? m.derived(row) : m.breakdown ? human(row[m.breakdown]) : null;
    const dateLabel = m.period.kind === 'ay' && /^\d{4}-\d{4}$/.test(row.academic_year || '') ? `SY ${row.academic_year.replace('-', '–')}` : null;
    return { type: m.resource, id: row.id, title, date: row._date || null, date_label: dateLabel, dated: !!ps.date, support, evidence: ev[row.id] || 0, group,
      values: Object.fromEntries((m.sums || []).map(([k]) => [k, row[k] == null ? null : Number(row[k])])), extra: m.distinct ? row[m.distinct] : undefined };
  });
  if (f.support === 'confirmed') sources = sources.filter((s) => s.support !== 'self_reported');
  if (f.support === 'evidenced') sources = sources.filter((s) => s.support === 'evidenced');
  const count = m.distinct ? new Set(sources.map((s) => String(s.extra || '').trim().toLowerCase()).filter(Boolean)).size : sources.length;
  const support = Object.fromEntries(Object.keys(SUPPORT).map((k) => [k, sources.filter((s) => s.support === k).length]));
  const breakdown = {};
  for (const s of sources) if (s.group) breakdown[s.group] = (breakdown[s.group] || 0) + 1;
  const sums = (m.sums || []).map(([k, unit]) => ({ field: k, unit, value: Math.round(sources.reduce((n, s) => n + (s.values[k] || 0), 0) * 100) / 100, missing: sources.filter((s) => s.values[k] == null).length }));
  return { key: m.key, section: m.section, label: m.label, resource: m.resource, resource_label: r.label, basis: m.basis, dated: !!ps.date, units: Object.fromEntries((m.sums || []).map(([k, u]) => [k, u])), count, records: sources.length,
    sums, breakdown, support, undated, sources };
}

function months(from, to) {
  const out = [];
  let [y, mo] = from.slice(0, 7).split('-').map(Number);
  const [ty, tm] = to.slice(0, 7).split('-').map(Number);
  while ((y < ty || (y === ty && mo <= tm)) && out.length < 120) { out.push(`${y}-${String(mo).padStart(2, '0')}`); mo++; if (mo > 12) { mo = 1; y++; } }
  return out;
}

/** Full analytics for the selected period, sections and support level. */
export function analytics(db, userId, q = {}) {
  const f = parseFilters(q);
  const t = today();
  const seriesTo = f.to || t;
  const seriesFrom = f.from || (() => { const d = new Date(`${seriesTo}T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() - 11); return `${d.toISOString().slice(0, 7)}-01`; })();
  const axis = months(seriesFrom, seriesTo);
  const sections = SECTIONS.filter((s) => f.sections.includes(s.key)).map((s) => {
    const metrics = METRICS.filter((m) => m.section === s.key).map((m) => computeMetric(db, userId, m, f));
    // Monthly activity: dated event-type records only, each record counted once per section.
    const seen = new Set();
    const counts = Object.fromEntries(axis.map((mo) => [mo, 0]));
    for (const m of metrics) {
      const def = METRICS.find((x) => x.key === m.key);
      if (def.period.kind !== 'event') continue;
      for (const src of m.sources) {
        const k = `${src.type}:${src.id}`;
        if (seen.has(k) || !src.date) continue;
        const mo = src.date.slice(0, 7);
        if (mo in counts) { counts[mo]++; seen.add(k); }
      }
    }
    const records = new Map();
    for (const m of metrics) for (const src of m.sources) records.set(`${src.type}:${src.id}`, src.support);
    const support = Object.fromEntries(Object.keys(SUPPORT).map((k) => [k, [...records.values()].filter((v) => v === k).length]));
    return { ...s, metrics, series: axis.map((mo) => ({ month: mo, n: counts[mo] })), distinct_records: records.size, support };
  });
  const all = new Map();
  for (const s of sections) for (const m of s.metrics) for (const src of m.sources) all.set(`${src.type}:${src.id}`, src.support);
  const support = Object.fromEntries(Object.keys(SUPPORT).map((k) => [k, [...all.values()].filter((v) => v === k).length]));
  return {
    generated_at: new Date().toISOString(),
    filters: f,
    period: { from: f.from, to: f.to, label: periodLabel(f.from, f.to) },
    support_labels: SUPPORT,
    totals: { records: all.size, support },
    sections,
  };
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const longDate = (d) => (!d ? '' : d.length === 4 ? d : d.length === 7 ? `${MONTHS[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}` : `${MONTHS[Number(d.slice(5, 7)) - 1]} ${Number(d.slice(8, 10))}, ${d.slice(0, 4)}`);
export function periodLabel(from, to) {
  if (!from && !to) return 'All records to date';
  if (from && to) return `${longDate(from)} – ${longDate(to)}`;
  return from ? `From ${longDate(from)}` : `Up to ${longDate(to)}`;
}
