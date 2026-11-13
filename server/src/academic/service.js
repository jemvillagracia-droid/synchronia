// Academic Workspace: teaching (course workspaces, syllabi, outcomes, materials, assessments, TOS, rubrics,
// class records), research, extension and faculty development. Every figure comes from stored records.
import { HttpError, get as getRecord, update as updateRecord } from '../repo.js';
import { buildDocument, bullet, field, h1, h2, p, saveReport, table } from './docs.js';

const today = () => new Date().toISOString().slice(0, 10);
const parse = (j, d) => { try { return j ? JSON.parse(j) : d; } catch { return d; } };
const SEM = { first: 'First Semester', second: 'Second Semester', summer: 'Summer', other: 'Other term' };
const human = (s) => (s ? String(s).replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase()) : '');
export const BLOOM = ['remembering', 'understanding', 'applying', 'analyzing', 'evaluating', 'creating'];

function owned(db, userId, table, id, label) {
  const row = db.prepare(`SELECT * FROM ${table} WHERE id = ? AND user_id = ? AND deleted_at IS NULL`).get(Number(id), userId);
  if (!row) throw new HttpError(404, `${label} not found`);
  return row;
}

// ───────────────────────── Overview ─────────────────────────

export function overview(db, userId) {
  const courses = db.prepare(`SELECT c.*,
      (SELECT COUNT(*) FROM teaching_assignments a WHERE a.course_id = c.id AND a.deleted_at IS NULL) AS offerings,
      (SELECT COUNT(*) FROM teaching_assignments a WHERE a.course_id = c.id AND a.deleted_at IS NULL AND a.status = 'active') AS active_offerings,
      (SELECT COUNT(*) FROM learning_outcomes o WHERE o.course_id = c.id AND o.deleted_at IS NULL AND o.outcome_type = 'CLO') AS clos,
      (SELECT COUNT(*) FROM syllabi s WHERE s.course_id = c.id AND s.deleted_at IS NULL) AS syllabi,
      (SELECT status FROM syllabi s WHERE s.course_id = c.id AND s.deleted_at IS NULL ORDER BY s.updated_at DESC LIMIT 1) AS syllabus_status,
      (SELECT COUNT(*) FROM instructional_materials m WHERE m.course_id = c.id AND m.deleted_at IS NULL) AS materials,
      (SELECT COUNT(*) FROM assessments x WHERE x.course_id = c.id AND x.deleted_at IS NULL) AS assessments
    FROM courses c WHERE c.user_id = ? AND c.deleted_at IS NULL ORDER BY c.code`).all(userId);
  const terms = db.prepare(`SELECT academic_year, semester, COUNT(*) n FROM teaching_assignments WHERE user_id = ? AND deleted_at IS NULL
      GROUP BY academic_year, semester ORDER BY academic_year DESC, CASE semester WHEN 'second' THEN 1 WHEN 'first' THEN 2 ELSE 0 END`).all(userId);
  const projects = db.prepare(`SELECT r.id, r.title, r.role, r.status, r.start_date, r.end_date, r.progress_pct, r.target_sample, r.collected_sample,
      r.validation_status, r.ethics_status, r.verification,
      (SELECT COUNT(*) FROM publications x WHERE x.research_project_id = r.id AND x.deleted_at IS NULL) AS publications,
      (SELECT COUNT(*) FROM conference_presentations x WHERE x.research_project_id = r.id AND x.deleted_at IS NULL) AS presentations
    FROM research_projects r WHERE r.user_id = ? AND r.deleted_at IS NULL ORDER BY r.updated_at DESC`).all(userId);
  const extension = db.prepare(`SELECT id, title, project_type, partner, location, start_date, end_date, status, participants_count, training_hours, role, verification
    FROM extension_projects WHERE user_id = ? AND deleted_at IS NULL ORDER BY COALESCE(start_date, created_at) DESC`).all(userId);
  const year = today().slice(0, 4);
  const goals = db.prepare(`SELECT g.*, t.title AS training_title FROM development_goals g LEFT JOIN training_records t ON t.id = g.linked_training_id
    WHERE g.user_id = ? AND g.deleted_at IS NULL ORDER BY CASE g.status WHEN 'in_progress' THEN 0 WHEN 'planned' THEN 1 WHEN 'deferred' THEN 2 ELSE 3 END, g.target_date`).all(userId);
  const pd = db.prepare(`SELECT COUNT(*) n, COALESCE(SUM(hours),0) hours, COALESCE(SUM(cpd_units),0) cpd FROM training_records
    WHERE user_id = ? AND deleted_at IS NULL AND substr(COALESCE(start_date,''),1,4) = ?`).get(userId, year);
  const certs = db.prepare("SELECT COUNT(*) n FROM training_records WHERE user_id = ? AND deleted_at IS NULL AND training_type = 'certification'").get(userId).n;
  const licenses = db.prepare('SELECT COUNT(*) n FROM licenses WHERE user_id = ? AND deleted_at IS NULL').get(userId).n;
  const byStatus = {};
  for (const r of projects) byStatus[r.status] = (byStatus[r.status] || 0) + 1;
  return {
    teaching: { courses, terms, active_offerings: courses.reduce((n, c) => n + c.active_offerings, 0) },
    research: { projects, by_status: byStatus },
    extension: {
      projects: extension,
      participants: extension.reduce((n, e) => n + (e.participants_count || 0), 0),
      hours: extension.reduce((n, e) => n + (e.training_hours || 0), 0),
    },
    development: { goals, year, trainings_year: pd.n, hours_year: pd.hours, cpd_year: pd.cpd, certifications: certs, licenses },
  };
}

// ───────────────────────── Course workspace ─────────────────────────

function programOutcomes(db, userId, course) {
  return db.prepare(`SELECT * FROM learning_outcomes WHERE user_id = ? AND deleted_at IS NULL AND outcome_type = 'PO'
      AND (course_id = ? OR (course_id IS NULL AND IFNULL(program, '') = IFNULL(?, ''))) ORDER BY sort_order, code`).all(userId, course.id, course.program);
}

export function courseWorkspace(db, userId, id) {
  const course = owned(db, userId, 'courses', id, 'Course');
  const offerings = db.prepare(`SELECT a.*,
      (SELECT COUNT(*) FROM class_activities x WHERE x.teaching_assignment_id = a.id AND x.deleted_at IS NULL) AS activities,
      (SELECT ROUND(AVG(CAST(present AS REAL) / NULLIF(enrolled, 0)) * 100, 1) FROM class_activities x
         WHERE x.teaching_assignment_id = a.id AND x.deleted_at IS NULL AND present IS NOT NULL AND enrolled > 0) AS attendance_pct
    FROM teaching_assignments a WHERE a.course_id = ? AND a.user_id = ? AND a.deleted_at IS NULL ORDER BY a.academic_year DESC, a.semester DESC`).all(course.id, userId);
  const clos = db.prepare(`SELECT * FROM learning_outcomes WHERE course_id = ? AND user_id = ? AND deleted_at IS NULL AND outcome_type IN ('CLO','ILO') ORDER BY sort_order, code`).all(course.id, userId);
  const pos = programOutcomes(db, userId, course);
  const alignments = clos.length ? db.prepare(`SELECT * FROM outcome_alignments WHERE course_outcome_id IN (${clos.map(() => '?').join(',')})`).all(...clos.map((c) => c.id)) : [];
  const syllabi = db.prepare('SELECT id, version_label, academic_year, semester, status, updated_at, content_json FROM syllabi WHERE course_id = ? AND user_id = ? AND deleted_at IS NULL ORDER BY updated_at DESC')
    .all(course.id, userId).map(({ content_json, ...s }) => {
      const c = parse(content_json, {});
      return { ...s, weeks: (c.weeks || []).length, grading_total: (c.grading || []).reduce((n, g) => n + (Number(g.weight) || 0), 0) };
    });
  const materials = db.prepare(`SELECT id, title, material_type, status, week_no, clo_codes, teaching_assignment_id, event_date, updated_at FROM instructional_materials
    WHERE course_id = ? AND user_id = ? AND deleted_at IS NULL ORDER BY COALESCE(week_no, 99), updated_at DESC`).all(course.id, userId);
  const assessments = db.prepare(`SELECT x.id, x.title, x.assessment_type, x.scheduled_date, x.total_points, x.item_count, x.clo_codes, x.status, x.teaching_assignment_id,
      (SELECT id FROM tables_of_specifications t WHERE t.assessment_id = x.id AND t.deleted_at IS NULL LIMIT 1) AS tos_id,
      (SELECT id FROM rubrics r WHERE r.assessment_id = x.id AND r.deleted_at IS NULL LIMIT 1) AS rubric_id
    FROM assessments x WHERE x.course_id = ? AND x.user_id = ? AND x.deleted_at IS NULL ORDER BY COALESCE(x.scheduled_date, '9999'), x.title`).all(course.id, userId);
  const rubrics = db.prepare('SELECT id, title, assessment_id, updated_at FROM rubrics WHERE course_id = ? AND user_id = ? AND deleted_at IS NULL ORDER BY title').all(course.id, userId);
  const offeringIds = offerings.map((o) => o.id);
  const activities = offeringIds.length ? db.prepare(`SELECT * FROM class_activities WHERE teaching_assignment_id IN (${offeringIds.map(() => '?').join(',')})
      AND deleted_at IS NULL ORDER BY activity_date DESC LIMIT 200`).all(...offeringIds) : [];
  return { course, offerings, clos, pos, alignments, syllabi, materials, assessments, rubrics, activities };
}

export function setAlignments(db, userId, courseId, pairs) {
  const course = owned(db, userId, 'courses', courseId, 'Course');
  if (!Array.isArray(pairs)) throw new HttpError(422, 'pairs must be a list');
  const clos = new Set(db.prepare("SELECT id FROM learning_outcomes WHERE course_id = ? AND user_id = ? AND deleted_at IS NULL AND outcome_type IN ('CLO','ILO')").all(course.id, userId).map((r) => r.id));
  const pos = new Set(programOutcomes(db, userId, course).map((r) => r.id));
  for (const pr of pairs) {
    if (!clos.has(Number(pr.clo_id)) || !pos.has(Number(pr.po_id))) throw new HttpError(422, 'Alignment refers to an outcome that is not part of this course');
    if (!['I', 'E', 'D'].includes(pr.level)) throw new HttpError(422, 'Level must be I (introduced), E (enhanced) or D (demonstrated)');
  }
  db.exec('BEGIN');
  try {
    if (clos.size) db.prepare(`DELETE FROM outcome_alignments WHERE course_outcome_id IN (${[...clos].map(() => '?').join(',')})`).run(...clos);
    for (const pr of pairs) db.prepare('INSERT INTO outcome_alignments (course_outcome_id, program_outcome_id, level) VALUES (?, ?, ?)').run(Number(pr.clo_id), Number(pr.po_id), pr.level);
    db.prepare("INSERT INTO audit_logs (user_id, entity_type, entity_id, action, summary) VALUES (?, 'courses', ?, 'update', ?)").run(userId, course.id, `Updated outcome alignment for ${course.code} (${pairs.length} links)`);
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
  return courseWorkspace(db, userId, course.id);
}

// ───────────────────────── Syllabus ─────────────────────────

const str = (v, max = 4000) => (typeof v === 'string' ? v.slice(0, max) : v == null ? '' : String(v).slice(0, max));

export function cleanSyllabus(c) {
  if (!c || typeof c !== 'object') throw new HttpError(422, 'Syllabus content must be an object');
  const weeks = Array.isArray(c.weeks) ? c.weeks : [];
  const grading = Array.isArray(c.grading) ? c.grading : [];
  if (weeks.length > 30) throw new HttpError(422, 'At most 30 weekly rows');
  return {
    description: str(c.description, 8000),
    prerequisites: str(c.prerequisites, 500),
    weeks: weeks.map((w, i) => ({
      week: str(w.week || String(i + 1), 20), topics: str(w.topics), clo_codes: str(w.clo_codes, 200),
      activities: str(w.activities), assessment: str(w.assessment, 1000), hours: w.hours === '' || w.hours == null ? null : Math.max(0, Math.min(40, Number(w.hours) || 0)),
    })),
    grading: grading.map((g) => ({ component: str(g.component, 200), weight: Math.max(0, Math.min(100, Number(g.weight) || 0)) })).filter((g) => g.component),
    references: (Array.isArray(c.references) ? c.references : []).map((r) => str(r, 1000)).filter(Boolean).slice(0, 60),
    policies: str(c.policies, 8000),
    consultation: str(c.consultation, 500),
  };
}

export function getSyllabus(db, userId, id) {
  const s = owned(db, userId, 'syllabi', id, 'Syllabus');
  const course = owned(db, userId, 'courses', s.course_id, 'Course');
  const clos = db.prepare("SELECT id, code, description FROM learning_outcomes WHERE course_id = ? AND user_id = ? AND deleted_at IS NULL AND outcome_type IN ('CLO','ILO') ORDER BY sort_order, code").all(course.id, userId);
  return { syllabus: { ...s, content_json: undefined }, content: cleanSyllabus(parse(s.content_json, {})), course, clos };
}

export function saveSyllabus(db, userId, id, content) {
  owned(db, userId, 'syllabi', id, 'Syllabus');
  updateRecord(db, userId, 'syllabi', id, { content_json: cleanSyllabus(content) });
  return getSyllabus(db, userId, id);
}

export async function exportSyllabus(db, userId, id) {
  const { syllabus: s, content: c, course, clos } = getSyllabus(db, userId, id);
  const prof = db.prepare('SELECT * FROM professional_profiles WHERE user_id = ?').get(userId) || {};
  const total = c.grading.reduce((n, g) => n + g.weight, 0);
  const children = [
    field('Course', `${course.code} — ${course.title}`), field('Units', course.units), field('Program', course.program),
    field('Academic year and term', [s.academic_year, s.semester].filter(Boolean).join(', ')), field('Prerequisites', c.prerequisites || 'None'),
    field('Instructor', prof.full_name), field('Consultation', c.consultation), field('Status', human(s.status)),
    h1('Course Description'), p(c.description || course.description || '—'),
    h1('Course Learning Outcomes'),
    ...(clos.length ? [table([['Code', 'At the end of the course, students will be able to…'], ...clos.map((o) => [o.code, o.description])], { widths: [15, 85] })] : [p('No course learning outcomes recorded.')]),
    h1('Weekly Instructional Plan'),
    ...(c.weeks.length ? [table([['Week', 'Topics', 'CLOs', 'Teaching and learning activities', 'Assessment', 'Hours'],
      ...c.weeks.map((w) => [w.week, w.topics, w.clo_codes, w.activities, w.assessment, w.hours ?? ''])], { widths: [8, 27, 9, 28, 20, 8], center: [0, 2, 5] })] : [p('No weekly plan recorded.')]),
    h1('Grading System'),
    ...(c.grading.length ? [table([['Component', 'Weight (%)'], ...c.grading.map((g) => [g.component, String(g.weight)]), ['Total', String(total)]], { widths: [75, 25], center: [1] })] : [p('No grading components recorded.')]),
    ...(c.grading.length && total !== 100 ? [p(`Note: grading weights total ${total}%, not 100%.`, { run: { italics: true } })] : []),
    h1('References'), ...(c.references.length ? c.references.map((r) => bullet(r)) : [p('—')]),
    h1('Course Policies'), p(c.policies || '—'),
  ];
  const buffer = await buildDocument({ title: 'Course Syllabus', subtitle: `${course.code} ${course.title} · ${s.version_label}`, children, landscape: false });
  return saveReport(db, userId, { type: 'syllabus', title: `Syllabus — ${course.code} ${s.version_label}`, buffer, fileStem: `Syllabus_${course.code}_${s.version_label}` });
}

// ───────────────────────── Table of Specifications ─────────────────────────

/** Distribute `total` integer units proportionally to weights (largest-remainder method). */
export function apportion(total, weights) {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (!sum || !total) return weights.map(() => 0);
  const raw = weights.map((w) => (w / sum) * total);
  const out = raw.map(Math.floor);
  let left = total - out.reduce((a, b) => a + b, 0);
  raw.map((r, i) => [r - Math.floor(r), i]).sort((a, b) => b[0] - a[0] || a[1] - b[1]).forEach(([, i]) => { if (left > 0) { out[i] += 1; left -= 1; } });
  return out;
}

export const DEFAULT_LEVELS = { remembering: 20, understanding: 20, applying: 20, analyzing: 15, evaluating: 15, creating: 10 };

export function cleanTos(c) {
  const rows = Array.isArray(c?.rows) ? c.rows : [];
  const levels = { ...DEFAULT_LEVELS, ...(c?.levels || {}) };
  for (const k of BLOOM) levels[k] = Math.max(0, Math.min(100, Number(levels[k]) || 0));
  return {
    total_items: Math.max(0, Math.min(500, Math.round(Number(c?.total_items) || 0))),
    levels,
    rows: rows.slice(0, 40).map((r) => ({ topic: str(r.topic, 300), clo: str(r.clo, 60), hours: Math.max(0, Number(r.hours) || 0) })).filter((r) => r.topic),
  };
}

export function computeTos(content) {
  const c = cleanTos(content);
  const totalHours = c.rows.reduce((n, r) => n + r.hours, 0);
  const rowItems = apportion(c.total_items, c.rows.map((r) => r.hours));
  const levelWeights = BLOOM.map((k) => c.levels[k]);
  let next = 1;
  const rows = c.rows.map((r, i) => {
    const cells = apportion(rowItems[i], levelWeights);
    const placement = cells.map((n) => { if (!n) return ''; const a = next; next += n; return n === 1 ? String(a) : `${a}–${a + n - 1}`; });
    return { ...r, pct: totalHours ? Math.round((r.hours / totalHours) * 1000) / 10 : 0, items: rowItems[i], cells, placement };
  });
  const levelTotals = BLOOM.map((_, j) => rows.reduce((n, r) => n + r.cells[j], 0));
  const levelSum = levelWeights.reduce((a, b) => a + b, 0);
  return {
    content: c, rows, level_totals: levelTotals, total_hours: totalHours, total_items: rows.reduce((n, r) => n + r.items, 0),
    warnings: [
      ...(levelSum !== 100 ? [`Cognitive level percentages total ${levelSum}%, not 100%.`] : []),
      ...(!totalHours && c.rows.length ? ['Enter teaching hours for each topic to allocate items.'] : []),
    ],
  };
}

export function getTos(db, userId, id) {
  const t = owned(db, userId, 'tables_of_specifications', id, 'Table of specifications');
  const assessment = t.assessment_id ? db.prepare('SELECT * FROM assessments WHERE id = ? AND user_id = ?').get(t.assessment_id, userId) : null;
  const content = parse(t.content_json, {});
  if (!content.total_items && assessment?.item_count) content.total_items = assessment.item_count;
  return { tos: { ...t, content_json: undefined }, assessment, ...computeTos(content) };
}

export function saveTos(db, userId, id, content) {
  owned(db, userId, 'tables_of_specifications', id, 'Table of specifications');
  updateRecord(db, userId, 'tos', id, { content_json: cleanTos(content) });
  return getTos(db, userId, id);
}

export async function exportTos(db, userId, id) {
  const t = getTos(db, userId, id);
  const course = t.assessment?.course_id ? db.prepare('SELECT * FROM courses WHERE id = ?').get(t.assessment.course_id) : null;
  const head = ['Topic', 'CLO', 'Hours', '%', 'Items', ...BLOOM.map((b) => `${human(b)} (${t.content.levels[b]}%)`)];
  const rows = t.rows.map((r) => [r.topic, r.clo, String(r.hours), String(r.pct), String(r.items), ...r.cells.map((n, j) => (n ? `${n}\n(${r.placement[j]})` : '—'))]);
  const totals = ['Total', '', String(t.total_hours), '100', String(t.total_items), ...t.level_totals.map(String)];
  const children = [
    field('Assessment', t.assessment?.title || t.tos.title), field('Course', course ? `${course.code} — ${course.title}` : null),
    field('Total items', t.total_items), p('Cells show the number of items and, in parentheses, their item numbers.', { run: { italics: true, size: 18 } }),
    table([head, ...rows, totals], { widths: [22, 7, 6, 5, 6, 9, 9, 9, 9, 9, 9], center: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], contentWidth: 12960 }),
    ...t.warnings.map((w) => p(`Note: ${w}`, { run: { italics: true } })),
  ];
  const buffer = await buildDocument({ title: 'Table of Specifications', subtitle: t.tos.title, children, landscape: true });
  return saveReport(db, userId, { type: 'tos', title: `TOS — ${t.tos.title}`, buffer, fileStem: `TOS_${t.tos.title}` });
}

// ───────────────────────── Rubrics ─────────────────────────

export function cleanRubric(c) {
  const levels = (Array.isArray(c?.levels) ? c.levels : []).slice(0, 8).map((l) => ({ label: str(l.label, 60) || 'Level', points: Math.max(0, Number(l.points) || 0) }));
  if (levels.length < 2) throw new HttpError(422, 'A rubric needs at least two performance levels');
  const criteria = (Array.isArray(c?.criteria) ? c.criteria : []).slice(0, 20).map((k) => ({
    name: str(k.name, 200), weight: k.weight === '' || k.weight == null ? null : Math.max(0, Math.min(100, Number(k.weight) || 0)),
    descriptors: levels.map((_, i) => str(k.descriptors?.[i], 1000)),
  })).filter((k) => k.name);
  return { levels, criteria };
}

export function rubricSummary(c) {
  const max = Math.max(...c.levels.map((l) => l.points), 0);
  const weighted = c.criteria.some((k) => k.weight != null);
  const weightSum = c.criteria.reduce((n, k) => n + (k.weight || 0), 0);
  return { max_points: weighted ? 100 : max * c.criteria.length, weighted, weight_total: weightSum,
    warnings: weighted && weightSum !== 100 ? [`Criterion weights total ${weightSum}%, not 100%.`] : [] };
}

export function getRubric(db, userId, id) {
  const r = owned(db, userId, 'rubrics', id, 'Rubric');
  let content = parse(r.criteria_json, null);
  if (!content?.levels) content = { levels: [{ label: 'Exemplary', points: 4 }, { label: 'Proficient', points: 3 }, { label: 'Developing', points: 2 }, { label: 'Beginning', points: 1 }], criteria: [] };
  const c = cleanRubric(content);
  return { rubric: { ...r, criteria_json: undefined }, content: c, summary: rubricSummary(c) };
}

export function saveRubric(db, userId, id, content) {
  owned(db, userId, 'rubrics', id, 'Rubric');
  updateRecord(db, userId, 'rubrics', id, { criteria_json: cleanRubric(content) });
  return getRubric(db, userId, id);
}

export async function exportRubric(db, userId, id) {
  const { rubric, content, summary } = getRubric(db, userId, id);
  const head = ['Criterion', ...(summary.weighted ? ['Weight'] : []), ...content.levels.map((l) => `${l.label} (${l.points})`)];
  const rows = content.criteria.map((k) => [k.name, ...(summary.weighted ? [`${k.weight ?? 0}%`] : []), ...k.descriptors]);
  const children = [field('Maximum score', summary.max_points), ...summary.warnings.map((w) => p(`Note: ${w}`, { run: { italics: true } })),
    content.criteria.length ? table([head, ...rows], { contentWidth: content.levels.length > 3 ? 12960 : 9360 }) : p('No criteria recorded.')];
  const buffer = await buildDocument({ title: 'Scoring Rubric', subtitle: rubric.title, children, landscape: content.levels.length > 3 });
  return saveReport(db, userId, { type: 'rubric', title: `Rubric — ${rubric.title}`, buffer, fileStem: `Rubric_${rubric.title}` });
}

// ───────────────────────── Reports ─────────────────────────

export async function teachingReport(db, userId, { academic_year: ay, semester }) {
  if (!ay || !SEM[semester]) throw new HttpError(422, 'Choose an academic year and term', { semester: 'first, second, summer or other' });
  const offerings = db.prepare(`SELECT a.*, c.code, c.title AS course_title, c.units FROM teaching_assignments a JOIN courses c ON c.id = a.course_id
      WHERE a.user_id = ? AND a.deleted_at IS NULL AND a.academic_year = ? AND a.semester = ? ORDER BY c.code, a.section`).all(userId, ay, semester);
  if (!offerings.length) throw new HttpError(404, `No teaching assignments recorded for ${SEM[semester]}, AY ${ay}.`);
  const prof = db.prepare('SELECT * FROM professional_profiles WHERE user_id = ?').get(userId) || {};
  const courseIds = [...new Set(offerings.map((o) => o.course_id))];
  const inList = (ids) => ids.map(() => '?').join(',');
  const offIds = offerings.map((o) => o.id);
  const syllabi = db.prepare(`SELECT s.*, c.code FROM syllabi s JOIN courses c ON c.id = s.course_id WHERE s.user_id = ? AND s.deleted_at IS NULL AND s.course_id IN (${inList(courseIds)})
      AND (s.academic_year IS NULL OR s.academic_year = ?)`).all(userId, ...courseIds, ay);
  const materials = db.prepare(`SELECT m.*, c.code FROM instructional_materials m JOIN courses c ON c.id = m.course_id WHERE m.user_id = ? AND m.deleted_at IS NULL
      AND (m.teaching_assignment_id IN (${inList(offIds)}) OR (m.teaching_assignment_id IS NULL AND m.course_id IN (${inList(courseIds)})))`).all(userId, ...offIds, ...courseIds);
  const assessments = db.prepare(`SELECT x.*, c.code,
      (SELECT COUNT(*) FROM tables_of_specifications t WHERE t.assessment_id = x.id AND t.deleted_at IS NULL) AS tos,
      (SELECT COUNT(*) FROM rubrics r WHERE r.assessment_id = x.id AND r.deleted_at IS NULL) AS rubrics
    FROM assessments x JOIN courses c ON c.id = x.course_id WHERE x.user_id = ? AND x.deleted_at IS NULL
      AND (x.teaching_assignment_id IN (${inList(offIds)}) OR (x.teaching_assignment_id IS NULL AND x.course_id IN (${inList(courseIds)})))`).all(userId, ...offIds, ...courseIds);
  const acts = db.prepare(`SELECT teaching_assignment_id, COUNT(*) n, ROUND(AVG(CAST(present AS REAL) / NULLIF(enrolled, 0)) * 100, 1) att
      FROM class_activities WHERE user_id = ? AND deleted_at IS NULL AND teaching_assignment_id IN (${inList(offIds)}) GROUP BY teaching_assignment_id`).all(userId, ...offIds);
  const actBy = Object.fromEntries(acts.map((a) => [a.teaching_assignment_id, a]));
  const students = offerings.reduce((n, o) => n + (o.student_count || 0), 0);
  const units = offerings.reduce((n, o) => n + (Number(o.units) || 0), 0);
  const children = [
    field('Faculty', prof.full_name), field('Position', [prof.current_position, prof.current_institution].filter(Boolean).join(', ')),
    field('Term', `${SEM[semester]}, Academic Year ${ay}`),
    h1('Summary'),
    table([['Indicator', 'Count'], ['Classes handled', String(offerings.length)], ['Courses', String(courseIds.length)], ['Total units', String(units)],
      ['Students handled (recorded)', String(students)], ['Syllabi', String(syllabi.length)], ['Instructional materials', String(materials.length)],
      ['Assessments', String(assessments.length)], ['Class activity records', String(acts.reduce((n, a) => n + a.n, 0))]], { widths: [70, 30], center: [1] }),
    h1('Teaching Load'),
    table([['Course', 'Section', 'Schedule', 'Students', 'Status', 'Activities', 'Attendance'],
      ...offerings.map((o) => [`${o.code} — ${o.course_title}`, o.section || '—', o.schedule || '—', o.student_count ?? '—', human(o.status),
        String(actBy[o.id]?.n || 0), actBy[o.id]?.att != null ? `${actBy[o.id].att}%` : '—'])], { widths: [27, 9, 18, 12, 10, 11, 13], center: [1, 3, 5, 6] }),
    h1('Syllabi'),
    ...(syllabi.length ? [table([['Course', 'Version', 'Status'], ...syllabi.map((s) => [s.code, s.version_label, human(s.status)])], { widths: [40, 30, 30] })] : [p('No syllabi recorded for these courses.')]),
    h1('Instructional Materials'),
    ...(materials.length ? [table([['Course', 'Title', 'Type', 'Week', 'Status'], ...materials.map((m) => [m.code, m.title, human(m.material_type), m.week_no ?? '—', human(m.status)])], { widths: [14, 42, 18, 10, 16], center: [3] })] : [p('No instructional materials recorded.')]),
    h1('Assessments'),
    ...(assessments.length ? [table([['Course', 'Assessment', 'Type', 'Date', 'Items/Points', 'TOS', 'Rubric'],
      ...assessments.map((x) => [x.code, x.title, human(x.assessment_type), x.scheduled_date || '—', [x.item_count, x.total_points].filter((v) => v != null).join(' / ') || '—', x.tos ? 'Yes' : '—', x.rubrics ? 'Yes' : '—'])],
    { widths: [12, 30, 14, 14, 12, 9, 9], center: [5, 6] })] : [p('No assessments recorded.')]),
    p(`Prepared from SYNCHRONIA records on ${today()}. Figures include only what has been recorded in the application.`, { run: { italics: true, size: 18 } }),
  ];
  const buffer = await buildDocument({ title: 'Teaching Accomplishment Report', subtitle: `${SEM[semester]}, AY ${ay}`, children, landscape: false });
  return saveReport(db, userId, { type: 'teaching_accomplishment', title: `Teaching Accomplishment Report — ${SEM[semester]}, AY ${ay}`, buffer,
    fileStem: `Teaching_Accomplishment_${ay}_${semester}`, params: { academic_year: ay, semester } });
}

export async function extensionReport(db, userId, id) {
  const e = getRecord(db, userId, 'extension_projects', id);
  const evidence = db.prepare(`SELECT f.title, f.provider, f.url FROM evidence_links l JOIN external_file_references f ON f.id = l.file_ref_id
      WHERE l.entity_type = 'extension_projects' AND l.entity_id = ? AND l.user_id = ? AND f.deleted_at IS NULL`).all(e.id, userId);
  const prof = db.prepare('SELECT full_name FROM professional_profiles WHERE user_id = ?').get(userId) || {};
  const period = [e.start_date, e.end_date].filter(Boolean).join(' to ') || '—';
  const children = [
    field('Project', e.title), field('Type', human(e.project_type)), field('Partner / community', e.partner), field('Venue', e.location),
    field('Period', period), field('Status', human(e.status)), field('Role of the proponent', e.role), field('Prepared by', prof.full_name),
    h1('Objectives'), p(e.objectives || '—'),
    h1('Beneficiaries and Participation'), p(e.beneficiaries || '—'),
    table([['Indicator', 'Value'], ['Participants (recorded)', e.participants_count ?? '—'], ['Training hours', e.training_hours ?? '—']], { widths: [60, 40], center: [1] }),
    h1('Narrative'), p(e.narrative || '—'),
    h1('Outcomes'), p(e.outcomes || '—'),
    h1('Supporting Evidence'), ...(evidence.length ? evidence.map((v) => bullet(`${v.title}${v.url ? ` — ${v.url}` : ''}`)) : [p('No supporting evidence linked yet.')]),
    h2('Verification'), p(e.verification === 'evidence_verified' ? 'Supporting evidence is linked to this record.' : e.verification === 'user_confirmed' ? 'Confirmed by the proponent.' : 'Self-reported; not yet confirmed or evidenced.'),
  ];
  const buffer = await buildDocument({ title: 'Extension Narrative Report', subtitle: e.title, children });
  return saveReport(db, userId, { type: 'extension_narrative', title: `Extension Narrative Report — ${e.title}`, buffer, fileStem: `Extension_Report_${e.title}`, periodStart: e.start_date, periodEnd: e.end_date });
}
