// Research Development Workspace. research_projects is the one authoritative project record; milestones, writing,
// literature, instruments, ethics, submissions, funding and collaborators link to it. Publications and conference
// presentations stay the portfolio/CV records of what was disseminated. Progress is counted from milestones only.
import { HttpError, audit, create, update, get as getRecord, getResource, reindex, createHooks, updateHooks } from '../repo.js';
import { tx } from '../db.js';
import { sanitize, wordCount, plainText, para } from '../richdoc.js';
import { plural } from '../text.js';

const now = () => new Date().toISOString();
const today = () => now().slice(0, 10);
const parse = (j, d) => { try { return j ? JSON.parse(j) : d; } catch { return d; } };
const addDays = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

// ───────────── Stages ─────────────

export const DEFAULT_STAGES = [
  ['idea', 'Idea and Concept Development'], ['question', 'Research Question Development'], ['proposal', 'Proposal Development'],
  ['literature', 'Literature and Theoretical Development'], ['methodology', 'Methodology Development'], ['instrument', 'Instrument Development'],
  ['ethics', 'Ethics and Approval'], ['data_collection', 'Data Collection'], ['manuscript', 'Manuscript Development'],
  ['dissemination', 'Submission and Dissemination'], ['completed', 'Completed'],
].map(([key, label]) => ({ key, label }));
/** The fixed lifecycle status (used by analytics and the CV) that each default stage corresponds to. */
const STATUS_FOR = { idea: 'idea', question: 'idea', proposal: 'proposal', literature: 'proposal', methodology: 'proposal', instrument: 'proposal',
  ethics: 'proposal', data_collection: 'data_collection', manuscript: 'writing', dissemination: 'writing', completed: 'completed', discontinued: 'discontinued' };

function settingsRow(db, userId) {
  return db.prepare('SELECT * FROM research_settings WHERE user_id = ?').get(userId) || { stages_json: null, dismissed_json: null };
}
export function stages(db, userId) {
  const s = parse(settingsRow(db, userId).stages_json, null);
  return Array.isArray(s) && s.length ? s : DEFAULT_STAGES;
}
export const stageLabel = (list, key) => (key === 'discontinued' ? 'Discontinued' : list.find((s) => s.key === key)?.label || key || 'No stage');

export function getSettings(db, userId) {
  return { stages: stages(db, userId), defaults: DEFAULT_STAGES, customised: !!parse(settingsRow(db, userId).stages_json, null) };
}

/** Save the stage list. Stages in use cannot be removed (rename them instead). */
export function saveStages(db, userId, list) {
  if (list === null) {
    db.prepare("INSERT INTO research_settings (user_id, stages_json) VALUES (?, NULL) ON CONFLICT(user_id) DO UPDATE SET stages_json = NULL, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')").run(userId);
    return getSettings(db, userId);
  }
  if (!Array.isArray(list) || !list.length || list.length > 30) throw new HttpError(422, 'Give between 1 and 30 stages.');
  const seen = new Set();
  const clean = list.map((s, i) => {
    const label = String(s?.label || '').trim().slice(0, 80);
    if (!label) throw new HttpError(422, `Stage ${i + 1} needs a name.`);
    let key = String(s?.key || '').trim().slice(0, 60) || `custom_${label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40) || i}`;
    if (key === 'discontinued') throw new HttpError(422, '"Discontinued" is always available and cannot be redefined.');
    while (seen.has(key)) key = `${key}_${i}`;
    seen.add(key);
    return { key, label };
  });
  const used = db.prepare("SELECT DISTINCT stage FROM research_projects WHERE user_id = ? AND deleted_at IS NULL AND stage IS NOT NULL AND stage <> 'discontinued'").all(userId).map((r) => r.stage);
  const missing = used.filter((k) => !seen.has(k));
  if (missing.length) throw new HttpError(422, `These stages are used by projects and cannot be removed: ${missing.map((k) => stageLabel(stages(db, userId), k)).join(', ')}. Rename them, or move those projects first.`);
  db.prepare("INSERT INTO research_settings (user_id, stages_json) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET stages_json = excluded.stages_json, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')").run(userId, JSON.stringify(clean));
  audit(db, userId, 'research_settings', null, 'settings', 'Updated research stages');
  return getSettings(db, userId);
}

/** Stage is validated against the owner's list; the lifecycle status follows a default stage automatically. */
function stageInput(db, userId, input) {
  if (!('stage' in input) || input.stage === null || input.stage === '') return input;
  const st = String(input.stage);
  if (st !== 'discontinued' && !stages(db, userId).some((s) => s.key === st)) throw new HttpError(422, 'Validation failed', { stage: 'Choose one of your research stages' });
  if (!('status' in input) && STATUS_FOR[st]) input.status = STATUS_FOR[st];
  return input;
}
createHooks.research_projects = (db, userId, input) => stageInput(db, userId, { stage: 'idea', ...input });
updateHooks.research_projects = (db, userId, _id, input) => stageInput(db, userId, input);

// ───────────── Milestones, progress, next action, suggestions ─────────────

const MILESTONE_TEMPLATES = {
  idea: ['Write the research problem', 'Draft preliminary research questions'],
  question: ['Finalize the research questions and objectives'],
  proposal: ['Complete the proposal draft', 'Present the proposal for review'],
  literature: ['Complete the review of related literature', 'Build the theoretical and conceptual framework'],
  methodology: ['Complete the methodology section'],
  instrument: ['Draft the research instrument', 'Request instrument validation', 'Finalize the instrument'],
  ethics: ['Submit ethics documentation', 'Secure ethics approval'],
  data_collection: ['Start data collection', 'Complete data collection'],
  manuscript: ['Complete the manuscript draft', 'Revise the manuscript'],
  dissemination: ['Submit to a journal or conference', 'Follow up on the submission'],
};

function projectRows(db, userId, ids) {
  if (!ids.length) return {};
  const q = (sql) => db.prepare(sql.replace('$IDS', ids.map(() => '?').join(','))).all(userId, ...ids);
  const by = (rows, key = 'project_id') => rows.reduce((m, r) => ((m[r[key]] ||= []).push(r), m), {});
  return {
    milestones: by(q('SELECT * FROM research_milestones WHERE user_id = ? AND deleted_at IS NULL AND project_id IN ($IDS) ORDER BY sort_order, COALESCE(due_date, \'9999\'), id')),
    ethics: by(q('SELECT * FROM ethics_reviews WHERE user_id = ? AND deleted_at IS NULL AND project_id IN ($IDS) ORDER BY id DESC')),
    submissions: by(q('SELECT * FROM research_submissions WHERE user_id = ? AND deleted_at IS NULL AND project_id IN ($IDS) ORDER BY id DESC')),
    documents: by(q(`SELECT d.*, (SELECT COUNT(*) FROM research_sections s WHERE s.document_id = d.id AND s.deleted_at IS NULL) AS sections,
        (SELECT COUNT(*) FROM research_sections s WHERE s.document_id = d.id AND s.deleted_at IS NULL AND s.status IN ('complete','not_applicable')) AS sections_done
      FROM research_documents d WHERE d.user_id = ? AND d.deleted_at IS NULL AND d.project_id IN ($IDS) ORDER BY d.updated_at DESC`)),
    tasks: by(q("SELECT * FROM tasks WHERE user_id = ? AND deleted_at IS NULL AND linked_entity_type = 'research_projects' AND linked_entity_id IN ($IDS) ORDER BY COALESCE(due_date, '9999')"), 'linked_entity_id'),
    instruments: by(q(`SELECT i.*, ip.project_id FROM research_instruments i JOIN research_instrument_projects ip ON ip.instrument_id = i.id
      WHERE i.user_id = ? AND i.deleted_at IS NULL AND ip.project_id IN ($IDS)`)),
    literature: by(q(`SELECT l.id, l.title, l.authors, l.year, l.theme, pl.project_id FROM literature l JOIN research_project_literature pl ON pl.literature_id = l.id
      WHERE l.user_id = ? AND l.deleted_at IS NULL AND pl.project_id IN ($IDS)`)),
  };
}

/** Progress from milestones only: done ÷ (all − skipped). Null when no milestones are defined. */
export function progressOf(milestones = []) {
  const counted = milestones.filter((m) => m.status !== 'skipped');
  const done = counted.filter((m) => m.status === 'done').length;
  return { done, total: counted.length, pct: counted.length ? Math.round((done / counted.length) * 100) : null };
}

/** The next recommended action, from what is recorded (overdue first, then revisions, then the next milestone). */
export function nextAction(p, r) {
  const ms = (r.milestones || []).filter((m) => m.status === 'pending');
  const overdue = ms.filter((m) => m.due_date && m.due_date < today()).sort((a, b) => a.due_date.localeCompare(b.due_date))[0];
  if (overdue) return { text: `Complete “${overdue.title}” (overdue since ${overdue.due_date})`, kind: 'milestone', id: overdue.id, urgent: true };
  const eth = (r.ethics || []).find((e) => e.status === 'revisions_required');
  if (eth) return { text: `Address the ethics committee's required revisions${eth.revisions_due ? ` (due ${eth.revisions_due})` : ''}`, kind: 'ethics', id: eth.id, urgent: true };
  const sub = (r.submissions || []).find((s) => s.status === 'revision_required');
  if (sub) return { text: `Revise the manuscript for ${sub.venue || 'the journal'}${sub.revision_due ? ` (due ${sub.revision_due})` : ''}`, kind: 'submission', id: sub.id, urgent: true };
  const expiring = (r.ethics || []).find((e) => e.expiry_date && e.expiry_date >= today() && e.expiry_date <= addDays(45));
  if (expiring) return { text: `Renew ethics approval before ${expiring.expiry_date}`, kind: 'ethics', id: expiring.id, urgent: false };
  const nextMs = ms.sort((a, b) => (a.due_date || '9999').localeCompare(b.due_date || '9999') || a.sort_order - b.sort_order)[0];
  if (nextMs) return { text: `${nextMs.title}${nextMs.due_date ? ` (due ${nextMs.due_date})` : ''}`, kind: 'milestone', id: nextMs.id, urgent: false };
  const inReview = (r.instruments || []).find((i) => i.stage === 'expert_review');
  if (inReview) return { text: `Record the expert reviews of “${inReview.title}”`, kind: 'instrument', id: inReview.id, urgent: false };
  const openTask = (r.tasks || []).find((t) => t.status === 'open' || t.status === 'in_progress');
  if (openTask) return { text: openTask.title, kind: 'task', id: openTask.id, urgent: false };
  if (p.stage === 'completed' || p.stage === 'discontinued') return null;
  return { text: 'Add a milestone for the next step', kind: 'none', id: null, urgent: false };
}

function dismissed(db, userId) { return new Set(parse(settingsRow(db, userId).dismissed_json, [])); }

/** Suggested tasks (approve, edit or dismiss): pending milestones and recorded revisions without a task yet. */
export function suggestions(db, userId, projectId) {
  const p = owned(db, userId, 'research_projects', projectId, 'Research project');
  const r = projectRows(db, userId, [p.id]);
  const have = new Set((r.tasks[p.id] || []).filter((t) => t.status !== 'cancelled').map((t) => t.title.toLowerCase()));
  const skip = dismissed(db, userId);
  const out = [];
  const add = (key, title, due, reason) => { if (!skip.has(key) && !have.has(title.toLowerCase())) out.push({ key, title, due_date: due || null, reason }); };
  for (const m of (r.milestones[p.id] || []).filter((x) => x.status === 'pending')) add(`m:${m.id}`, m.title, m.due_date, 'Milestone without a task');
  for (const e of (r.ethics[p.id] || []).filter((x) => x.status === 'revisions_required')) add(`e:${e.id}`, 'Submit ethics documentation (revised)', e.revisions_due, 'The ethics committee requires revisions');
  for (const s of (r.submissions[p.id] || [])) {
    if (s.status === 'revision_required') add(`s:${s.id}:rev`, `Revise manuscript for ${s.venue || 'the journal'}`, s.revision_due, 'Revision requested');
    if (['submitted', 'under_review'].includes(s.status) && s.submission_date && s.submission_date <= addDays(-60)) add(`s:${s.id}:fu`, `Follow up on the submission to ${s.venue || 'the journal'}`, null, 'Under review for more than 60 days');
  }
  for (const i of (r.instruments[p.id] || []).filter((x) => x.stage === 'initial')) add(`i:${i.id}`, `Request instrument validation for “${i.title}”`, null, 'Instrument not yet reviewed by experts');
  for (const d of (r.documents[p.id] || []).filter((x) => x.sections && x.sections_done < x.sections && x.status !== 'final')) {
    const missing = db.prepare("SELECT heading FROM research_sections WHERE document_id = ? AND deleted_at IS NULL AND status = 'not_started' ORDER BY sort_order LIMIT 2").all(d.id);
    for (const s of missing) add(`d:${d.id}:${s.heading}`, `Write the ${s.heading} section (${d.title})`, null, 'Section not started');
  }
  return out.slice(0, 12);
}

export function dismissSuggestion(db, userId, key) {
  const k = String(key || '').slice(0, 200);
  if (!k) throw new HttpError(422, 'Nothing to dismiss');
  const set = dismissed(db, userId); set.add(k);
  db.prepare("INSERT INTO research_settings (user_id, dismissed_json) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET dismissed_json = excluded.dismissed_json, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')").run(userId, JSON.stringify([...set].slice(-500)));
  return { ok: true };
}

/** Add the usual milestones for chosen stages (skipping any already present). */
export function addTemplateMilestones(db, userId, projectId, stageKeys = []) {
  const p = owned(db, userId, 'research_projects', projectId, 'Research project');
  const existing = new Set(db.prepare('SELECT lower(title) t FROM research_milestones WHERE project_id = ? AND deleted_at IS NULL').all(p.id).map((r) => r.t));
  let order = db.prepare('SELECT COALESCE(MAX(sort_order), 0) n FROM research_milestones WHERE project_id = ?').get(p.id).n;
  const made = [];
  tx(db, () => {
    for (const st of (Array.isArray(stageKeys) && stageKeys.length ? stageKeys : [p.stage || 'idea'])) {
      for (const title of MILESTONE_TEMPLATES[st] || []) {
        if (existing.has(title.toLowerCase())) continue;
        order += 1;
        made.push(create(db, userId, 'research_milestones', { project_id: p.id, title, stage: st, sort_order: order }));
        existing.add(title.toLowerCase());
      }
    }
  });
  return made;
}

// ───────────── Overview and project workspace ─────────────

function owned(db, userId, table, id, label) {
  const row = db.prepare(`SELECT * FROM ${table} WHERE id = ? AND user_id = ? AND deleted_at IS NULL`).get(Number(id), userId);
  if (!row) throw new HttpError(404, `${label} not found`);
  return row;
}

function deadlines(db, userId, horizon = 60) {
  const to = addDays(horizon);
  const out = [];
  const push = (date, kind, title, project_id, type, id) => { if (date) out.push({ date, kind, title, project_id, type, id, overdue: date < today() }); };
  for (const m of db.prepare(`SELECT m.*, p.title AS pt FROM research_milestones m JOIN research_projects p ON p.id = m.project_id
      WHERE m.user_id = ? AND m.deleted_at IS NULL AND p.deleted_at IS NULL AND p.archived_at IS NULL AND m.status = 'pending' AND m.due_date <= ?`).all(userId, to)) push(m.due_date, 'Milestone', `${m.title} — ${m.pt}`, m.project_id, 'research_milestones', m.id);
  for (const e of db.prepare('SELECT * FROM ethics_reviews WHERE user_id = ? AND deleted_at IS NULL').all(userId)) {
    if (e.status === 'revisions_required' && e.revisions_due && e.revisions_due <= to) push(e.revisions_due, 'Ethics revisions due', e.committee || 'Ethics review', e.project_id, 'ethics_reviews', e.id);
    if (e.expiry_date && e.expiry_date <= to && e.expiry_date >= addDays(-30)) push(e.expiry_date, 'Ethics approval expires', e.committee || 'Ethics approval', e.project_id, 'ethics_reviews', e.id);
  }
  for (const s of db.prepare("SELECT * FROM research_submissions WHERE user_id = ? AND deleted_at IS NULL AND status = 'revision_required' AND revision_due <= ?").all(userId, to)) push(s.revision_due, 'Revision due', `${s.title} — ${s.venue || ''}`, s.project_id, 'research_submissions', s.id);
  for (const f of db.prepare("SELECT * FROM research_funding WHERE user_id = ? AND deleted_at IS NULL AND submission_status IN ('planned','preparing') AND deadline <= ? AND deadline >= ?").all(userId, to, addDays(-7))) push(f.deadline, 'Funding deadline', `${f.opportunity}${f.organization ? ` — ${f.organization}` : ''}`, f.project_id, 'research_funding', f.id);
  for (const t of db.prepare("SELECT * FROM tasks WHERE user_id = ? AND deleted_at IS NULL AND status IN ('open','in_progress') AND module = 'research' AND due_date <= ?").all(userId, to)) push(t.due_date, 'Task', t.title, t.linked_entity_type === 'research_projects' ? t.linked_entity_id : null, 'tasks', t.id);
  return out.sort((a, b) => a.date.localeCompare(b.date)).slice(0, 40);
}

const RESEARCH_TYPES = ['research_projects', 'research_milestones', 'research_documents', 'research_sections', 'literature', 'research_instruments', 'instrument_versions',
  'instrument_reviews', 'ethics_reviews', 'research_submissions', 'research_funding', 'research_collaborators', 'publications', 'presentations'];

function recent(db, userId, limit = 15, projectId = null) {
  const rows = db.prepare(`SELECT entity_type, entity_id, action, summary, at FROM audit_logs WHERE user_id = ? AND entity_type IN (${RESEARCH_TYPES.map(() => '?').join(',')})
    ORDER BY id DESC LIMIT 300`).all(userId, ...RESEARCH_TYPES);
  if (!projectId) return rows.slice(0, limit);
  const belongs = (r) => {
    if (r.entity_type === 'research_projects') return r.entity_id === projectId;
    const tbl = { research_milestones: 'research_milestones', research_documents: 'research_documents', ethics_reviews: 'ethics_reviews', research_submissions: 'research_submissions', research_funding: 'research_funding', research_collaborators: 'research_collaborators' }[r.entity_type];
    if (tbl) return db.prepare(`SELECT project_id FROM ${tbl} WHERE id = ?`).get(r.entity_id)?.project_id === projectId;
    if (r.entity_type === 'research_sections') return db.prepare('SELECT d.project_id FROM research_sections s JOIN research_documents d ON d.id = s.document_id WHERE s.id = ?').get(r.entity_id)?.project_id === projectId;
    return false;
  };
  return rows.filter(belongs).slice(0, limit);
}

export function overview(db, userId, { archived = false } = {}) {
  const list = stages(db, userId);
  const projects = db.prepare(`SELECT * FROM research_projects WHERE user_id = ? AND deleted_at IS NULL AND archived_at IS ${archived ? 'NOT ' : ''}NULL ORDER BY updated_at DESC`).all(userId);
  const r = projectRows(db, userId, projects.map((p) => p.id));
  const pub = db.prepare("SELECT research_project_id, COUNT(*) n FROM publications WHERE user_id = ? AND deleted_at IS NULL GROUP BY research_project_id").all(userId);
  const pres = db.prepare("SELECT research_project_id, COUNT(*) n FROM conference_presentations WHERE user_id = ? AND deleted_at IS NULL GROUP BY research_project_id").all(userId);
  const shaped = projects.map((p) => {
    const rr = Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v[p.id] || []]));
    return {
      id: p.id, title: p.title, stage: p.stage, stage_label: stageLabel(list, p.stage), role: p.role, research_area: p.research_area, tags: p.tags,
      updated_at: p.updated_at, archived_at: p.archived_at, progress: progressOf(rr.milestones), next_action: nextAction(p, rr),
      counts: { documents: rr.documents.length, literature: rr.literature.length, instruments: rr.instruments.length, open_tasks: rr.tasks.filter((t) => ['open', 'in_progress'].includes(t.status)).length,
        publications: pub.find((x) => x.research_project_id === p.id)?.n || 0, presentations: pres.find((x) => x.research_project_id === p.id)?.n || 0 },
      ethics: rr.ethics[0] ? { status: rr.ethics[0].status, expiry_date: rr.ethics[0].expiry_date } : null,
    };
  });
  const captured = db.prepare(`SELECT id, title, body, event_date, created_at FROM activities WHERE user_id = ? AND deleted_at IS NULL AND kind IN ('idea','research_note')
    AND (module = 'research' OR kind = 'idea') AND developed_into_project_id IS NULL ORDER BY created_at DESC LIMIT 30`).all(userId);
  const manuscripts = db.prepare(`SELECT d.id, d.title, d.kind, d.status, d.target, d.project_id, d.updated_at, d.word_limit, p.title AS project_title,
      (SELECT COUNT(*) FROM research_sections s WHERE s.document_id = d.id AND s.deleted_at IS NULL) AS sections,
      (SELECT COUNT(*) FROM research_sections s WHERE s.document_id = d.id AND s.deleted_at IS NULL AND s.status IN ('complete','not_applicable')) AS sections_done
    FROM research_documents d LEFT JOIN research_projects p ON p.id = d.project_id WHERE d.user_id = ? AND d.deleted_at IS NULL ORDER BY d.updated_at DESC LIMIT 30`).all(userId);
  const submissions = db.prepare(`SELECT s.*, p.title AS project_title FROM research_submissions s LEFT JOIN research_projects p ON p.id = s.project_id
    WHERE s.user_id = ? AND s.deleted_at IS NULL ORDER BY s.updated_at DESC LIMIT 40`).all(userId);
  const counts = {
    publications: db.prepare('SELECT COUNT(*) n FROM publications WHERE user_id = ? AND deleted_at IS NULL').get(userId).n,
    presentations: db.prepare('SELECT COUNT(*) n FROM conference_presentations WHERE user_id = ? AND deleted_at IS NULL').get(userId).n,
    literature: db.prepare('SELECT COUNT(*) n FROM literature WHERE user_id = ? AND deleted_at IS NULL').get(userId).n,
    instruments: db.prepare('SELECT COUNT(*) n FROM research_instruments WHERE user_id = ? AND deleted_at IS NULL').get(userId).n,
    archived: db.prepare('SELECT COUNT(*) n FROM research_projects WHERE user_id = ? AND deleted_at IS NULL AND archived_at IS NOT NULL').get(userId).n,
  };
  const active = shaped.filter((p) => !['idea', 'question', 'completed', 'discontinued'].includes(p.stage));
  return {
    stages: list, projects: shaped,
    groups: { active: active.length, in_development: shaped.filter((p) => ['idea', 'question'].includes(p.stage)).length, completed: shaped.filter((p) => p.stage === 'completed').length },
    captured, manuscripts, submissions, deadlines: deadlines(db, userId), recent: recent(db, userId), counts,
    next_actions: shaped.filter((p) => p.next_action && p.next_action.kind !== 'none').sort((a, b) => Number(b.next_action.urgent) - Number(a.next_action.urgent)).slice(0, 6)
      .map((p) => ({ project_id: p.id, project: p.title, ...p.next_action })),
  };
}

export function projectWorkspace(db, userId, id) {
  const p = owned(db, userId, 'research_projects', id, 'Research project');
  const list = stages(db, userId);
  const r = projectRows(db, userId, [p.id]);
  const rr = Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v[p.id] || []]));
  const instruments = rr.instruments.map((i) => ({ ...i, versions: db.prepare('SELECT COUNT(*) n FROM instrument_versions WHERE instrument_id = ? AND deleted_at IS NULL').get(i.id).n,
    reviews: db.prepare('SELECT COUNT(*) n FROM instrument_reviews WHERE instrument_id = ? AND deleted_at IS NULL').get(i.id).n }));
  return {
    project: getRecord(db, userId, 'research_projects', p.id), stage_label: stageLabel(list, p.stage), stages: list,
    milestones: rr.milestones, progress: progressOf(rr.milestones), next_action: nextAction(p, rr), suggestions: suggestions(db, userId, p.id),
    documents: rr.documents, literature: db.prepare(`SELECT l.* FROM literature l JOIN research_project_literature pl ON pl.literature_id = l.id WHERE pl.project_id = ? AND l.deleted_at IS NULL ORDER BY l.year DESC, l.title`).all(p.id),
    instruments, ethics: rr.ethics, submissions: rr.submissions, tasks: rr.tasks,
    funding: db.prepare('SELECT * FROM research_funding WHERE project_id = ? AND user_id = ? AND deleted_at IS NULL ORDER BY COALESCE(deadline, \'9999\')').all(p.id, userId),
    collaborators: db.prepare('SELECT * FROM research_collaborators WHERE project_id = ? AND user_id = ? AND deleted_at IS NULL ORDER BY name').all(p.id, userId),
    publications: db.prepare('SELECT id, title, venue, status, publication_date FROM publications WHERE research_project_id = ? AND user_id = ? AND deleted_at IS NULL ORDER BY publication_date DESC').all(p.id, userId),
    presentations: db.prepare('SELECT id, title, conference, presentation_date FROM conference_presentations WHERE research_project_id = ? AND user_id = ? AND deleted_at IS NULL ORDER BY presentation_date DESC').all(p.id, userId),
    recent: recent(db, userId, 12, p.id), milestone_templates: Object.keys(MILESTONE_TEMPLATES),
  };
}

// ───────────── Ideas ─────────────

/** Develop a captured idea (Quick Capture) into a research project, keeping the link. */
export function developIdea(db, userId, activityId) {
  const a = owned(db, userId, 'activities', activityId, 'Captured idea');
  if (a.developed_into_project_id) return getRecord(db, userId, 'research_projects', a.developed_into_project_id);
  return tx(db, () => {
    const p = create(db, userId, 'research_projects', { title: a.title, stage: 'idea', problem: a.body || null, notes: `Developed from an idea captured on ${String(a.created_at).slice(0, 10)}.` });
    db.prepare('UPDATE activities SET developed_into_project_id = ? WHERE id = ?').run(p.id, a.id);
    audit(db, userId, 'activities', a.id, 'update', `Developed captured idea into research project: ${p.title}`);
    return p;
  });
}

// ───────────── Literature ─────────────

const norm = (t) => String(t || '').toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const cleanDoi = (d) => String(d || '').trim().replace(/^https?:\/\/(dx\.)?doi\.org\//i, '').replace(/^doi:\s*/i, '');

/** Possible duplicates of a reference: same DOI, or the same title (and year, when both have one). */
export function findDuplicates(db, userId, { doi, title, year, exclude } = {}) {
  const out = [];
  const d = cleanDoi(doi);
  if (d) out.push(...db.prepare('SELECT id, title, authors, year, doi FROM literature WHERE user_id = ? AND deleted_at IS NULL AND lower(doi) = lower(?)').all(userId, d));
  const t = norm(title);
  if (t.length >= 12) {
    for (const r of db.prepare('SELECT id, title, authors, year, doi FROM literature WHERE user_id = ? AND deleted_at IS NULL').all(userId)) {
      if (norm(r.title) === t && (!year || !r.year || String(r.year) === String(year)) && !out.some((o) => o.id === r.id)) out.push(r);
    }
  }
  return out.filter((r) => r.id !== Number(exclude));
}

/** Add a reference (optionally to a project). A duplicate is not created: the existing record is linked instead. */
export function addLiterature(db, userId, body = {}) {
  const { project_id: projectId, ...input } = body;
  if (input.doi) input.doi = cleanDoi(input.doi);
  const dup = findDuplicates(db, userId, input)[0];
  return tx(db, () => {
    const rec = dup ? getRecord(db, userId, 'literature', dup.id) : create(db, userId, 'literature', input);
    if (projectId) linkLiterature(db, userId, projectId, rec.id);
    return { literature: rec, duplicate: !!dup };
  });
}

export function linkLiterature(db, userId, projectId, litId, link = true) {
  owned(db, userId, 'research_projects', projectId, 'Research project');
  owned(db, userId, 'literature', litId, 'Reference');
  if (link) db.prepare('INSERT OR IGNORE INTO research_project_literature (project_id, literature_id) VALUES (?, ?)').run(Number(projectId), Number(litId));
  else db.prepare('DELETE FROM research_project_literature WHERE project_id = ? AND literature_id = ?').run(Number(projectId), Number(litId));
  return { ok: true };
}

export function literatureList(db, userId, { project_id: projectId, q, theme } = {}) {
  const where = ['l.user_id = ?', 'l.deleted_at IS NULL'];
  const args = [userId];
  if (projectId) { where.push('l.id IN (SELECT literature_id FROM research_project_literature WHERE project_id = ?)'); args.push(Number(projectId)); }
  if (theme) { where.push('l.theme = ?'); args.push(String(theme)); }
  if (q) { where.push("(l.title LIKE ? OR l.authors LIKE ? OR l.tags LIKE ? OR l.source LIKE ? OR l.findings LIKE ? OR l.relevance LIKE ?)"); const like = `%${String(q).slice(0, 100)}%`; args.push(like, like, like, like, like, like); }
  const rows = db.prepare(`SELECT l.*, (SELECT group_concat(project_id) FROM research_project_literature WHERE literature_id = l.id) AS project_ids
    FROM literature l WHERE ${where.join(' AND ')} ORDER BY COALESCE(l.year, '0') DESC, l.title LIMIT 1000`).all(...args);
  return {
    items: rows.map((r) => ({ ...r, project_ids: r.project_ids ? String(r.project_ids).split(',').map(Number) : [], apa: apa(r) })),
    themes: db.prepare("SELECT DISTINCT theme FROM literature WHERE user_id = ? AND deleted_at IS NULL AND theme IS NOT NULL AND theme <> '' ORDER BY theme").all(userId).map((r) => r.theme),
  };
}

// APA 7 reference (plain text; italics are applied in Word output via apaParts).
function personAPA(name) {
  const n = String(name).trim().replace(/\s+/g, ' ');
  if (!n) return '';
  if (/^[\p{Lu}\d][^,]*\b(University|Institute|Department|Organization|Organisation|Association|Commission|Council|Agency|Ministry|Office)\b/u.test(n)) return n;
  let last; let given;
  if (n.includes(',')) [last, given] = n.split(',').map((x) => x.trim());
  else { const parts = n.split(' '); last = parts.pop(); given = parts.join(' '); }
  const initials = String(given || '').split(/[\s.-]+/).filter(Boolean).map((g) => `${g[0].toUpperCase()}.`).join(' ');
  return initials ? `${last}, ${initials}` : last;
}
export function authorsAPA(authors) {
  const list = String(authors || '').split(/\s*;\s*|\s+and\s+|\s*&\s*/i).map((a) => a.trim()).filter(Boolean)
    .flatMap((a) => (a.split(',').length > 2 ? a.split(/,\s*(?=[^,]+,)/) : [a])).map(personAPA).filter(Boolean);
  if (!list.length) return '';
  if (list.length === 1) return list[0];
  if (list.length <= 20) return `${list.slice(0, -1).join(', ')}, & ${list[list.length - 1]}`;
  return `${list.slice(0, 19).join(', ')}, . . . ${list[list.length - 1]}`;
}
export function apaParts(l) {
  const who = authorsAPA(l.authors);
  const year = l.year ? `(${l.year}).` : '(n.d.).';
  const doi = l.doi ? ` https://doi.org/${cleanDoi(l.doi)}` : l.url ? ` ${l.url}` : '';
  const end = (s) => (s && !/[.?!]$/.test(s) ? `${s}.` : s);
  if (['book', 'thesis', 'report'].includes(l.item_type)) {
    return [{ t: `${who ? `${who} ` : ''}${year} ` }, { t: end(l.title), i: true }, { t: `${l.publisher ? ` ${end(l.publisher)}` : ''}${doi}` }];
  }
  const volIssue = [l.volume, l.issue ? `(${l.issue})` : ''].join('');
  const tail = [volIssue, l.pages].filter(Boolean).join(', ');
  return [{ t: `${who ? `${who} ` : ''}${year} ${end(l.title)} ` }, { t: l.source || '', i: true }, { t: `${tail ? `, ${tail}` : ''}${l.source || tail ? '.' : ''}${doi}` }];
}
export const apa = (l) => apaParts(l).map((p) => p.t).join('').replace(/\s+/g, ' ').trim();

export function citations(db, userId, { project_id: projectId, format = 'apa', ids } = {}) {
  let items = literatureList(db, userId, { project_id: projectId }).items;
  if (ids) { const want = new Set(String(ids).split(',').map(Number)); items = items.filter((i) => want.has(i.id)); }
  items.sort((a, b) => apa(a).localeCompare(apa(b)));
  if (format === 'apa') return { mime: 'text/plain', ext: 'txt', body: items.map(apa).join('\n\n') };
  const authorsList = (a) => String(a || '').split(/\s*;\s*|\s+and\s+/i).map((x) => x.trim()).filter(Boolean);
  if (format === 'ris') {
    const TY = { journal_article: 'JOUR', book: 'BOOK', book_chapter: 'CHAP', conference_paper: 'CPAPER', thesis: 'THES', report: 'RPRT', web: 'ELEC', other: 'GEN' };
    return { mime: 'application/x-research-info-systems', ext: 'ris', body: items.map((l) => [
      `TY  - ${TY[l.item_type] || 'GEN'}`, ...authorsList(l.authors).map((a) => `AU  - ${a}`), `TI  - ${l.title}`, l.year && `PY  - ${l.year}`, l.source && `T2  - ${l.source}`,
      l.volume && `VL  - ${l.volume}`, l.issue && `IS  - ${l.issue}`, l.pages && `SP  - ${l.pages}`, l.publisher && `PB  - ${l.publisher}`, l.doi && `DO  - ${cleanDoi(l.doi)}`, l.url && `UR  - ${l.url}`,
      l.abstract && `AB  - ${l.abstract.replace(/\s+/g, ' ')}`, 'ER  - '].filter(Boolean).join('\r\n')).join('\r\n\r\n') };
  }
  if (format === 'bibtex') {
    const TY = { journal_article: 'article', book: 'book', book_chapter: 'incollection', conference_paper: 'inproceedings', thesis: 'phdthesis', report: 'techreport' };
    const esc = (s) => String(s).replace(/[{}\\]/g, '');
    const used = new Set();
    return { mime: 'application/x-bibtex', ext: 'bib', body: items.map((l) => {
      const first = (authorsList(l.authors)[0] || 'anon').split(',')[0].split(' ').pop().toLowerCase().replace(/[^a-z]/g, '') || 'ref';
      let key = `${first}${l.year || 'nd'}`; for (let i = 0; used.has(key); i += 1) key = `${first}${l.year || 'nd'}${String.fromCharCode(97 + i)}`; used.add(key);
      const f = [['author', authorsList(l.authors).join(' and ')], ['title', l.title], ['year', l.year], [l.item_type === 'journal_article' ? 'journal' : 'booktitle', l.source],
        ['volume', l.volume], ['number', l.issue], ['pages', l.pages], ['publisher', l.publisher], ['doi', l.doi && cleanDoi(l.doi)], ['url', l.url]].filter(([, v]) => v);
      return `@${TY[l.item_type] || 'misc'}{${key},\n${f.map(([k, v]) => `  ${k} = {${esc(v)}}`).join(',\n')}\n}`;
    }).join('\n\n') };
  }
  throw new HttpError(422, 'Choose APA, RIS or BibTeX');
}

// ───────────── Instruments ─────────────

export function instrumentWorkspace(db, userId, id) {
  const i = owned(db, userId, 'research_instruments', id, 'Instrument');
  return {
    instrument: getRecord(db, userId, 'research_instruments', i.id),
    versions: db.prepare('SELECT * FROM instrument_versions WHERE instrument_id = ? AND user_id = ? AND deleted_at IS NULL ORDER BY version_no DESC').all(i.id, userId)
      .map((v) => ({ ...v, structure: parse(v.structure_json, { dimensions: [] }), structure_json: undefined })),
    reviews: db.prepare('SELECT * FROM instrument_reviews WHERE instrument_id = ? AND user_id = ? AND deleted_at IS NULL ORDER BY COALESCE(review_date, created_at) DESC').all(i.id, userId),
    projects: db.prepare('SELECT p.id, p.title FROM research_projects p JOIN research_instrument_projects ip ON ip.project_id = p.id WHERE ip.instrument_id = ? AND p.deleted_at IS NULL').all(i.id),
  };
}

/** Instrument structure: dimensions → items, each item with its text and optional reverse scoring. */
export function cleanStructure(s) {
  const dims = Array.isArray(s?.dimensions) ? s.dimensions : [];
  if (dims.length > 60) throw new HttpError(422, 'At most 60 dimensions');
  return { dimensions: dims.map((d) => ({
    name: String(d?.name || '').slice(0, 200), description: String(d?.description || '').slice(0, 2000),
    items: (Array.isArray(d?.items) ? d.items : []).slice(0, 300).map((it) => ({ text: String(it?.text || '').slice(0, 2000), reverse: !!it?.reverse, note: String(it?.note || '').slice(0, 1000) })),
  })) };
}

/** Create an instrument with its first version (and project link). */
export function createInstrument(db, userId, body = {}) {
  const { project_id: projectId, ...input } = body;
  return tx(db, () => {
    const inst = create(db, userId, 'research_instruments', { stage: 'initial', ...input });
    create(db, userId, 'instrument_versions', { instrument_id: inst.id, version_no: 1, label: 'Initial instrument', stage: 'initial', structure_json: { dimensions: [] } });
    if (projectId) linkInstrument(db, userId, inst.id, projectId);
    return instrumentWorkspace(db, userId, inst.id);
  });
}

export function linkInstrument(db, userId, instrumentId, projectId, link = true) {
  owned(db, userId, 'research_instruments', instrumentId, 'Instrument');
  owned(db, userId, 'research_projects', projectId, 'Research project');
  if (link) db.prepare('INSERT OR IGNORE INTO research_instrument_projects (instrument_id, project_id) VALUES (?, ?)').run(Number(instrumentId), Number(projectId));
  else db.prepare('DELETE FROM research_instrument_projects WHERE instrument_id = ? AND project_id = ?').run(Number(instrumentId), Number(projectId));
  return instrumentWorkspace(db, userId, instrumentId);
}

/** Save the structure of a version. A final version is preserved: start a revision instead. */
export function saveVersion(db, userId, versionId, body = {}) {
  const v = owned(db, userId, 'instrument_versions', versionId, 'Instrument version');
  if (v.stage === 'final') throw new HttpError(409, 'This is the final approved version and is kept as it is. Start a revision to change it.');
  const values = {};
  for (const k of ['label', 'instructions', 'response_scale', 'scoring', 'interpretation', 'change_notes']) if (k in body) values[k] = body[k];
  if ('structure' in body) values.structure_json = cleanStructure(body.structure);
  update(db, userId, 'instrument_versions', v.id, values);
  return instrumentWorkspace(db, userId, v.instrument_id);
}

/** Next step in the instrument's development: a new version copied from the latest (previous versions are kept). */
export function advanceInstrument(db, userId, instrumentId, stage) {
  if (!['expert_review', 'revision', 'final'].includes(stage)) throw new HttpError(422, 'Choose expert review, revision or final');
  const i = owned(db, userId, 'research_instruments', instrumentId, 'Instrument');
  const last = db.prepare('SELECT * FROM instrument_versions WHERE instrument_id = ? AND deleted_at IS NULL ORDER BY version_no DESC LIMIT 1').get(i.id);
  return tx(db, () => {
    if (stage === 'expert_review' && last && last.stage === 'initial') {
      // Sending the initial instrument for review does not create a copy: the reviewed version is that one.
      update(db, userId, 'instrument_versions', last.id, { stage: 'expert_review' });
    } else {
      const label = { revision: 'Revised instrument', final: 'Final instrument', expert_review: 'Instrument for review' }[stage];
      create(db, userId, 'instrument_versions', {
        instrument_id: i.id, version_no: (last?.version_no || 0) + 1, label: `${label} (v${(last?.version_no || 0) + 1})`, stage,
        instructions: last?.instructions, response_scale: last?.response_scale, scoring: last?.scoring, interpretation: last?.interpretation,
        structure_json: parse(last?.structure_json, { dimensions: [] }), change_notes: null,
      });
    }
    update(db, userId, 'research_instruments', i.id, { stage });
    return instrumentWorkspace(db, userId, i.id);
  });
}

// ───────────── Writing (proposals, concept papers, methodology, manuscripts) ─────────────

export const TEMPLATES = {
  proposal: ['Background of the Study', 'Statement of the Problem', 'Research Objectives', 'Research Hypotheses', 'Significance of the Study', 'Scope and Delimitations',
    'Theoretical Framework', 'Conceptual Framework', 'Definition of Terms', 'Review of Related Literature', 'Research Design', 'Research Participants or Respondents',
    'Sampling Approach', 'Research Instruments', 'Data Collection Procedures', 'Ethical Considerations', 'References'],
  concept_paper: ['Rationale', 'Statement of the Problem', 'Objectives', 'Significance', 'Proposed Methodology', 'Expected Outputs', 'Work Plan', 'References'],
  methodology: ['Research Design', 'Research Approach', 'Research Setting', 'Population and Participants', 'Sampling Technique', 'Sample Size Rationale',
    'Research Instruments', 'Instrument Sources and Permissions', 'Operational Definitions', 'Data Collection Procedures', 'Ethical Considerations'],
  manuscript: ['Abstract', 'Introduction', 'Literature Review', 'Methodology', 'Results', 'Discussion', 'Conclusions and Recommendations', 'References', 'Appendices', 'Acknowledgments'],
  other: ['Introduction'],
};
const KIND_LABEL = { proposal: 'Research Proposal', concept_paper: 'Concept Paper', methodology: 'Research Methodology', manuscript: 'Manuscript', other: 'Research Document' };
const keyOf = (h) => h.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

/** Create a writing document from its template. Sections already written elsewhere can be reused (copy_from). */
export function createDocument(db, userId, body = {}) {
  const kind = TEMPLATES[body.kind] ? body.kind : 'proposal';
  const proj = body.project_id ? owned(db, userId, 'research_projects', body.project_id, 'Research project') : null;
  const src = body.copy_from ? owned(db, userId, 'research_documents', body.copy_from, 'Document') : null;
  return tx(db, () => {
    const d = create(db, userId, 'research_documents', { project_id: proj?.id || null, kind, title: body.title || `${KIND_LABEL[kind]}${proj ? ` — ${proj.title}` : ''}`.slice(0, 500), target: body.target || null, word_limit: body.word_limit || null });
    const reuse = src ? db.prepare('SELECT * FROM research_sections WHERE document_id = ? AND deleted_at IS NULL').all(src.id) : [];
    TEMPLATES[kind].forEach((h, i) => {
      const prior = reuse.find((s) => s.section_key === keyOf(h) || s.heading.toLowerCase() === h.toLowerCase());
      create(db, userId, 'research_sections', { document_id: d.id, section_key: keyOf(h), heading: h, sort_order: i + 1,
        body: prior?.body || null, status: prior?.body ? 'drafting' : 'not_started' });
    });
    return documentView(db, userId, d.id);
  });
}

export function documentView(db, userId, id) {
  const d = owned(db, userId, 'research_documents', id, 'Document');
  const sections = db.prepare('SELECT * FROM research_sections WHERE document_id = ? AND user_id = ? AND deleted_at IS NULL ORDER BY sort_order, id').all(d.id, userId)
    .map((s) => { const body = parse(s.body, null); return { ...s, body, words: body ? wordCount(body) : 0 }; });
  const words = sections.filter((s) => s.status !== 'not_applicable').reduce((n, s) => n + s.words, 0);
  const project = d.project_id ? db.prepare('SELECT id, title, stage FROM research_projects WHERE id = ?').get(d.project_id) : null;
  return { document: getRecord(db, userId, 'research_documents', d.id), project, sections, words, checklist: checklist(db, userId, d, sections, words), kind_label: KIND_LABEL[d.kind] };
}

function checklist(db, userId, d, sections, words) {
  const items = [];
  const open = sections.filter((s) => !['complete', 'not_applicable'].includes(s.status));
  items.push({ ok: !open.length, label: open.length ? `${open.length} section${open.length === 1 ? '' : 's'} not marked complete: ${open.slice(0, 4).map((s) => s.heading).join(', ')}${open.length > 4 ? '…' : ''}` : 'Every section is complete or marked not applicable' });
  if (d.word_limit) items.push({ ok: words <= d.word_limit, label: `${words.toLocaleString('en')} of ${d.word_limit.toLocaleString('en')} words` });
  const abstract = sections.find((s) => s.section_key === 'abstract');
  if (abstract && abstract.status !== 'not_applicable') items.push({ ok: abstract.words > 0 && abstract.words <= 300, label: abstract.words ? `Abstract: ${plural(abstract.words, 'word')}${abstract.words > 300 ? ' (most journals ask for 150–300)' : ''}` : 'Abstract not written yet' });
  const refs = sections.find((s) => s.section_key === 'references');
  const linked = d.project_id ? db.prepare('SELECT COUNT(*) n FROM research_project_literature WHERE project_id = ?').get(d.project_id).n : 0;
  if (refs && refs.status !== 'not_applicable') items.push({ ok: refs.words > 0 || linked > 0, label: refs.words > 0 ? 'References written' : linked ? `References: ${linked} linked source${linked === 1 ? '' : 's'} will be listed in APA style on export` : 'No references written or linked yet' });
  if (d.kind === 'manuscript') items.push({ ok: !!d.target, label: d.target ? `Target: ${d.target}` : 'No target journal or conference set' });
  if (d.project_id && ['manuscript', 'proposal'].includes(d.kind)) {
    const eth = db.prepare('SELECT status FROM ethics_reviews WHERE project_id = ? AND deleted_at IS NULL ORDER BY id DESC LIMIT 1').get(d.project_id);
    if (d.kind === 'manuscript') items.push({ ok: !eth || ['approved', 'approved_with_conditions', 'exempt'].includes(eth.status), label: eth ? `Ethics: ${eth.status.replace(/_/g, ' ')}` : 'No ethics review recorded for this project (fine if none was required)' });
  }
  return items;
}

function snapshotSection(db, userId, s, reason, force = false) {
  if (!s.body) return;
  const last = db.prepare('SELECT body, created_at FROM research_section_versions WHERE section_id = ? ORDER BY id DESC LIMIT 1').get(s.id);
  if (last && last.body === s.body) return;
  if (!force && last && Date.now() - Date.parse(last.created_at) < 10 * 60 * 1000) return;
  db.prepare('INSERT INTO research_section_versions (user_id, section_id, body, words, reason) VALUES (?, ?, ?, ?, ?)').run(userId, s.id, s.body, wordCount(parse(s.body, { type: 'doc' })), reason);
  db.prepare('DELETE FROM research_section_versions WHERE section_id = ? AND id NOT IN (SELECT id FROM research_section_versions WHERE section_id = ? ORDER BY id DESC LIMIT 40)').run(s.id, s.id);
}

/** Autosave a section's text (and optionally its status or notes); keeps recovery points while writing. */
export function saveSection(db, userId, id, body = {}) {
  const s = owned(db, userId, 'research_sections', id, 'Section');
  if (body.base_updated_at && body.base_updated_at !== s.updated_at) throw new HttpError(409, 'This section was changed in another window. Reload to see the latest text; yours is still in the editor.');
  return tx(db, () => {
    const sets = []; const args = [];
    if ('body' in body) {
      const doc = sanitize(body.body);
      snapshotSection(db, userId, s, 'autosave');
      sets.push('body = ?'); args.push(JSON.stringify(doc));
      if (s.status === 'not_started' && wordCount(doc) > 0 && !('status' in body)) { sets.push("status = 'drafting'"); }
    }
    if ('status' in body) {
      if (!['not_started', 'drafting', 'complete', 'not_applicable'].includes(body.status)) throw new HttpError(422, 'Unknown section status');
      sets.push('status = ?'); args.push(body.status);
    }
    if ('notes' in body) { sets.push('notes = ?'); args.push(body.notes == null ? null : String(body.notes).slice(0, 20000)); }
    if ('heading' in body) { const h = String(body.heading || '').trim().slice(0, 500); if (!h) throw new HttpError(422, 'A section needs a heading'); sets.push('heading = ?'); args.push(h); }
    if (!sets.length) return { updated_at: s.updated_at };
    db.prepare(`UPDATE research_sections SET ${sets.join(', ')}, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`).run(...args, s.id);
    db.prepare("UPDATE research_documents SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?").run(s.document_id);
    const row = owned(db, userId, 'research_sections', id, 'Section');
    reindex(db, getResource('research_sections'), row);
    if ('status' in body || 'heading' in body) audit(db, userId, 'research_sections', s.id, 'update', `Section “${row.heading}”: ${row.status.replace(/_/g, ' ')}`);
    else if (s.body !== row.body) audit(db, userId, 'research_sections', s.id, 'update', `Edited section “${row.heading}” (${wordCount(parse(row.body, { type: 'doc' }))} words)`);
    return { updated_at: row.updated_at, status: row.status, words: wordCount(parse(row.body, { type: 'doc' })) };
  });
}

export function sectionVersions(db, userId, id) {
  owned(db, userId, 'research_sections', id, 'Section');
  return db.prepare('SELECT id, words, reason, created_at FROM research_section_versions WHERE section_id = ? ORDER BY id DESC').all(Number(id));
}
export function restoreSectionVersion(db, userId, id, versionId) {
  const s = owned(db, userId, 'research_sections', id, 'Section');
  const v = db.prepare('SELECT * FROM research_section_versions WHERE id = ? AND section_id = ?').get(Number(versionId), s.id);
  if (!v) throw new HttpError(404, 'Recovery point not found');
  tx(db, () => {
    snapshotSection(db, userId, s, 'before restore', true);
    db.prepare("UPDATE research_sections SET body = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?").run(v.body, s.id);
    reindex(db, getResource('research_sections'), owned(db, userId, 'research_sections', id, 'Section'));
    audit(db, userId, 'research_sections', s.id, 'restore', `Restored section “${s.heading}” to ${v.created_at}`);
  });
  return documentView(db, userId, s.document_id);
}

/** Add a section (or reorder: pass sort_order). */
export function addSection(db, userId, documentId, heading) {
  const d = owned(db, userId, 'research_documents', documentId, 'Document');
  const max = db.prepare('SELECT COALESCE(MAX(sort_order), 0) n FROM research_sections WHERE document_id = ?').get(d.id).n;
  create(db, userId, 'research_sections', { document_id: d.id, heading: String(heading || 'New section').slice(0, 500), sort_order: max + 1, section_key: keyOf(String(heading || 'section')) });
  return documentView(db, userId, d.id);
}

// ───────────── Dissemination ─────────────

/** Record an accepted/published/presented submission in the portfolio, filling the existing record when linked. */
export function recordSubmission(db, userId, id) {
  const s = owned(db, userId, 'research_submissions', id, 'Submission');
  const prof = db.prepare('SELECT full_name FROM professional_profiles WHERE user_id = ?').get(userId) || {};
  const collab = s.project_id ? db.prepare("SELECT name FROM research_collaborators WHERE project_id = ? AND deleted_at IS NULL AND status <> 'inactive' ORDER BY id").all(s.project_id).map((c) => c.name) : [];
  const authors = [prof.full_name, ...collab].filter(Boolean).join('; ') || prof.full_name || 'Author';
  return tx(db, () => {
    if (s.kind === 'conference') {
      if (!['accepted', 'presented', 'published'].includes(s.status)) throw new HttpError(422, 'Record a conference submission once it is accepted or presented.');
      const values = { research_project_id: s.project_id, title: s.title, authors, conference: s.venue || 'Conference', presentation_date: s.publication_date || s.acceptance_date || null };
      const rec = s.presentation_id ? update(db, userId, 'presentations', s.presentation_id, values) : create(db, userId, 'presentations', values);
      db.prepare('UPDATE research_submissions SET presentation_id = ? WHERE id = ?').run(rec.id, s.id);
      return { type: 'presentations', record: rec };
    }
    if (!['accepted', 'published'].includes(s.status)) throw new HttpError(422, 'Record a submission in your portfolio once it is accepted or published.');
    const values = { research_project_id: s.project_id, title: s.title, authors, venue: s.venue || null, publication_type: s.kind === 'book' ? 'book_chapter' : 'journal_article',
      status: s.status === 'published' ? 'published' : 'accepted', publication_date: s.publication_date || null, doi: s.doi ? cleanDoi(s.doi) : null, url: s.url || null };
    const rec = s.publication_id ? update(db, userId, 'publications', s.publication_id, values) : create(db, userId, 'publications', values);
    db.prepare('UPDATE research_submissions SET publication_id = ? WHERE id = ?').run(rec.id, s.id);
    return { type: 'publications', record: rec };
  });
}

export { owned, KIND_LABEL, para, plainText };
