// Syllabi as word-processor documents. A syllabus opens as one editable document (headings, tables, lists, text
// formatting), saves automatically, keeps recovery snapshots, and exports to Word or PDF through the document engine.
// A syllabus made before 1.2 (structured fields) is converted into a document the first time it is opened, carrying
// the content, outcomes, VMGO and signatories it would have printed; its structured data is kept.
import { HttpError, audit, get as getRecord, reindex, getResource } from '../repo.js';
import { tx } from '../db.js';
import { buildDocument, pageGeometry, saveReport } from './docs.js';
import { getSyllabus } from './service.js';
import { letterheadFor } from './institution.js';
import { loadImage } from '../docimages.js';
import { PAPERS } from '../paper.js';
import { sanitize, toDocxChildren, toHtmlPage, wordCount, para, heading, tableOf, bullets, numbered } from '../richdoc.js';

export const PAGE_SIZES = Object.fromEntries(Object.entries(PAPERS).map(([k, v]) => [k, v.label]));
const CSS_PAGE = Object.fromEntries(Object.entries(PAPERS).map(([k, v]) => [k, v.css]));
const DEFAULT_PAGE = { size: 'folio', landscape: true };
const SNAPSHOT_EVERY_MS = 10 * 60 * 1000;
const SEM = { first: 'First Semester', second: 'Second Semester', summer: 'Summer' };
const parse = (j, d) => { try { return j ? JSON.parse(j) : d; } catch { return d; } };

function owned(db, userId, id) {
  const s = db.prepare('SELECT * FROM syllabi WHERE id = ? AND user_id = ? AND deleted_at IS NULL').get(Number(id), userId);
  if (!s) throw new HttpError(404, 'Syllabus not found');
  return s;
}

function cleanPage(p) {
  const page = p && typeof p === 'object' ? p : {};
  return { size: PAGE_SIZES[page.size] ? page.size : DEFAULT_PAGE.size, landscape: typeof page.landscape === 'boolean' ? page.landscape : DEFAULT_PAGE.landscape };
}

const signLine = (name) => { const [n, ...rest] = String(name || '').split(','); return [n.toUpperCase(), ...rest].join(','); };

/** The document a structured (pre-1.2) syllabus would have printed. */
const SEM_BOX = { first: '1st sem', second: '2nd sem', summer: 'Summer' };
const semKey = (v) => (SEM_BOX[v] ? v : /^(1|first)/i.test(v || '') ? 'first' : /^(2|second)/i.test(v || '') ? 'second' : /summer/i.test(v || '') ? 'summer' : null);

export function legacyDocument(S) {
  const { syllabus: s, content: c, course, clos, pos, institution: inst, effective_signatories: sig, alignments = [] } = S;
  const sem = semKey(s.semester);
  const box = (k) => `( ${sem === k ? '✓' : '  '} ) ${SEM_BOX[k]}`;
  // Outcome map columns: only program outcomes this course addresses; "PILO n" reads as "Pn" when all codes share a family.
  const lvl = (cloId, poId) => alignments.find((a) => a.course_outcome_id === cloId && a.program_outcome_id === poId)?.level || '–';
  const mapPos = alignments.length ? pos.filter((po) => alignments.some((x) => x.program_outcome_id === po.id)) : pos;
  const oneFamily = new Set(mapPos.map((po) => (/^[A-Za-z]+/.exec(po.code) || [''])[0].toUpperCase())).size <= 1;
  const shortPo = (code) => (oneFamily ? code.replace(/^(PILO|PO)\s*/i, 'P') : code).replace(/\s+/g, '');
  const v = c.vmgo || {};
  const goals = [v.goals_national && `National: ${v.goals_national}`, v.goals_regional && `Regional: ${v.goals_regional}`, v.goals_university && `University: ${v.goals_university}`].filter(Boolean).join('\n');
  const total = c.grading.reduce((n, x) => n + x.weight, 0);
  const content = [
    ...(inst.college ? [para(inst.college, { bold: true, align: 'center' })] : []),
    para(`SY ${s.academic_year || '________'}     ${box('first')}     ${box('second')}     ${box('summer')}`, { align: 'center' }),
    heading('COURSE SYLLABUS', 1, 'center'),
    tableOf([
      [{ text: 'Course Title', bold: true }, course.title || '', { text: 'Course Code', bold: true }, course.code || ''],
      [{ text: 'Contact Hours', bold: true }, course.contact_hours ?? '', { text: 'Credit Units', bold: true }, course.units ?? ''],
      [{ text: 'Pre-requisites', bold: true }, c.prerequisites || 'None', { text: 'Program', bold: true }, course.program || ''],
    ], { header: false }),
    heading('Vision, Mission and Goals', 2),
    tableOf([
      [{ text: 'Vision', bold: true }, v.vision || ''], [{ text: 'Mission', bold: true }, v.mission || ''], [{ text: 'Goals', bold: true }, goals],
      [{ text: 'Core Values', bold: true }, v.core_values || ''], [{ text: 'Graduate Attributes', bold: true }, v.graduate_attributes || ''],
    ], { header: false }),
    heading('Program Outcomes', 2), para('The graduates have the ability to:'),
    ...(pos.length ? [numbered(pos.map((po) => `${po.code}. ${po.description}`))] : [para('')]),
    heading('Course Intended Learning Outcomes', 2), para(`At the end of the course, the ${c.learner_term || 'students'} can:`),
    ...(clos.length ? [numbered(clos.map((o) => `${o.code}. ${o.description}`))] : [para('')]),
    heading('Course Description', 2), para(c.description || course.description || ''),
    ...(clos.length && pos.length ? [
      heading('Mapping of Course Intended Learning Outcomes to Program Outcomes', 2),
      tableOf([['CILO', ...mapPos.map((po) => shortPo(po.code))], ...clos.map((o) => [`${o.code}. ${o.description}`, ...mapPos.map((po) => lvl(o.id, po.id))])]),
      para('Legend: I – Introductory   P – Practiced   D – Demonstrative'),
    ] : []),
    heading('Course Outline', 2),
    tableOf([
      ['Week / Time Allotment', 'Intended Learning Outcomes', 'Outcome-Based Assessment', 'Content', 'Teaching and Learning Activities', 'Learning Resources'],
      ...(c.weeks.length ? c.weeks.map((w) => [`Week ${w.week}${w.hours != null ? `\n${w.hours} hrs` : ''}`, [w.ilos, w.clo_codes && `(${w.clo_codes})`].filter(Boolean).join(' '), w.assessment, w.content, w.activities, w.resources])
        : [['Week 1', '', '', '', '', '']]),
    ]),
    heading('References', 2), ...(c.references.length ? c.references.map((r) => para(r)) : [para('')]),
    heading('Course Policies', 2), ...(c.policies ? [numbered(c.policies.split('\n').map((x) => x.trim()).filter(Boolean))] : [para('')]),
    heading('Grading System', 2),
    tableOf([['Component', 'Weight'], ...(c.grading.length ? [...c.grading.map((x) => [x.component, `${x.weight}%`]), [{ text: 'Total', bold: true }, `${total}%`]] : [['', '']])]),
    ...(c.grading.length && total !== 100 ? [para(`Note: grading weights total ${total}%, not 100%.`)] : []),
    heading('Consultation Hours', 2), para(c.consultation || ''),
    para(''),
    signatureTable(sig),
    para(''),
  ];
  return { type: 'doc', content };
}

function signatureTable(sig = {}) {
  return tableOf([
    ['Prepared by:', 'Reviewed by:', 'Approved by:'],
    [{ text: `\n\n${signLine(sig.prepared_by_name)}`, bold: true }, { text: `\n\n${signLine(sig.reviewed_by_name)}`, bold: true }, { text: `\n\n${signLine(sig.approved_by_name)}`, bold: true }],
    [sig.prepared_by_title || '', sig.reviewed_by_title || '', sig.approved_by_title || ''],
  ], { header: false });
}

/** A new syllabus: the usual outline with empty places to write in. Only the author is filled in as "Prepared by". */
export function templateDocument(course, s, author) {
  return {
    type: 'doc',
    content: [
      para([s.academic_year && `SY ${s.academic_year}`, SEM[s.semester] || s.semester].filter(Boolean).join('   ·   '), { align: 'center' }),
      heading('COURSE SYLLABUS', 1, 'center'),
      tableOf([
        [{ text: 'Course Title', bold: true }, course.title || '', { text: 'Course Code', bold: true }, course.code || ''],
        [{ text: 'Contact Hours', bold: true }, course.contact_hours ?? '', { text: 'Credit Units', bold: true }, course.units ?? ''],
        [{ text: 'Pre-requisites', bold: true }, '', { text: 'Program', bold: true }, course.program || ''],
      ], { header: false }),
      heading('Course Description', 2), para(course.description || ''),
      heading('Course Intended Learning Outcomes', 2), para('At the end of the course, the students can:'), numbered(['']),
      heading('Course Outline', 2),
      tableOf([['Week', 'Intended Learning Outcomes', 'Content', 'Teaching and Learning Activities', 'Assessment', 'Resources'], ['1', '', '', '', '', '']]),
      heading('References', 2), para(''),
      heading('Course Policies', 2), bullets(['']),
      heading('Grading System', 2), tableOf([['Component', 'Weight'], ['', ''], [{ text: 'Total', bold: true }, '']]),
      heading('Consultation Hours', 2), para(''),
      para(''),
      signatureTable({ prepared_by_name: author, prepared_by_title: 'Faculty' }),
      para(''),
    ],
  };
}

function snapshot(db, userId, s, reason, force = false) {
  if (!s.document_json) return;
  const last = db.prepare('SELECT created_at, document_json FROM syllabus_snapshots WHERE syllabus_id = ? ORDER BY id DESC LIMIT 1').get(s.id);
  if (last && last.document_json === s.document_json) return;
  if (!force && last && Date.now() - Date.parse(last.created_at) < SNAPSHOT_EVERY_MS) return;
  db.prepare('INSERT INTO syllabus_snapshots (user_id, syllabus_id, document_json, page_json, words, reason) VALUES (?, ?, ?, ?, ?, ?)')
    .run(userId, s.id, s.document_json, s.page_json, wordCount(parse(s.document_json, { type: 'doc' })), reason);
  // Keep the most recent 60 recovery points per syllabus.
  db.prepare('DELETE FROM syllabus_snapshots WHERE syllabus_id = ? AND id NOT IN (SELECT id FROM syllabus_snapshots WHERE syllabus_id = ? ORDER BY id DESC LIMIT 60)').run(s.id, s.id);
}

function view(db, userId, s) {
  const course = db.prepare('SELECT id, code, title, program FROM courses WHERE id = ? AND user_id = ?').get(s.course_id, userId);
  const document = parse(s.document_json, null);
  return {
    syllabus: { id: s.id, course_id: s.course_id, version_label: s.version_label, academic_year: s.academic_year, semester: s.semester, status: s.status, updated_at: s.updated_at },
    course, document, page: cleanPage(parse(s.page_json, null)), words: document ? wordCount(document) : 0, page_sizes: PAGE_SIZES,
    snapshots: db.prepare('SELECT id, words, reason, created_at FROM syllabus_snapshots WHERE syllabus_id = ? ORDER BY id DESC LIMIT 60').all(s.id),
  };
}

/** Open a syllabus as a document, converting a pre-1.2 syllabus the first time. */
export function openSyllabusDocument(db, userId, id) {
  let s = owned(db, userId, id);
  if (!s.document_json) {
    const S = getSyllabus(db, userId, id);
    const ids = S.clos.map((o) => o.id);
    S.alignments = ids.length ? db.prepare(`SELECT * FROM outcome_alignments WHERE course_outcome_id IN (${ids.map(() => '?').join(',')})`).all(...ids) : [];
    const doc = legacyDocument(S);
    tx(db, () => {
      db.prepare('UPDATE syllabi SET document_json = ?, page_json = COALESCE(page_json, ?) WHERE id = ?').run(JSON.stringify(doc), JSON.stringify(DEFAULT_PAGE), s.id);
      s = owned(db, userId, id);
      snapshot(db, userId, s, 'converted', true);
      reindex(db, getResource('syllabi'), s);
      audit(db, userId, 'syllabi', s.id, 'update', `Opened syllabus ${s.version_label} as a document`);
    });
  }
  return view(db, userId, s);
}

/** Autosave. base_updated_at guards against overwriting a newer save made elsewhere (e.g. a second window). */
export function saveSyllabusDocument(db, userId, id, body = {}) {
  const s = owned(db, userId, id);
  if (body.base_updated_at && body.base_updated_at !== s.updated_at) {
    throw new HttpError(409, 'This syllabus was changed in another window. Reload it to see the latest version; your text is still in the editor.');
  }
  const doc = sanitize(body.document);
  const page = cleanPage(body.page ?? parse(s.page_json, null));
  const json = JSON.stringify(doc);
  return tx(db, () => {
    snapshot(db, userId, s, 'autosave');
    db.prepare("UPDATE syllabi SET document_json = ?, page_json = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?").run(json, JSON.stringify(page), s.id);
    const row = owned(db, userId, id);
    reindex(db, getResource('syllabi'), row);
    if (s.document_json !== json) audit(db, userId, 'syllabi', s.id, 'update', `Edited syllabus ${s.version_label} (${wordCount(doc)} words)`);
    return { updated_at: row.updated_at, words: wordCount(doc), page };
  });
}

export function snapshotDocument(db, userId, id, snapId) {
  owned(db, userId, id);
  const sn = db.prepare('SELECT * FROM syllabus_snapshots WHERE id = ? AND syllabus_id = ? AND user_id = ?').get(Number(snapId), Number(id), userId);
  if (!sn) throw new HttpError(404, 'Recovery point not found');
  return { id: sn.id, created_at: sn.created_at, words: sn.words, document: parse(sn.document_json, null), page: cleanPage(parse(sn.page_json, null)) };
}

/** Restore a recovery point; the current text is kept as a recovery point first. */
export function restoreSnapshot(db, userId, id, snapId) {
  const s = owned(db, userId, id);
  const sn = snapshotDocument(db, userId, id, snapId);
  tx(db, () => {
    snapshot(db, userId, s, 'before restore', true);
    db.prepare("UPDATE syllabi SET document_json = ?, page_json = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?").run(JSON.stringify(sn.document), JSON.stringify(sn.page), s.id);
    reindex(db, getResource('syllabi'), owned(db, userId, id));
    audit(db, userId, 'syllabi', s.id, 'restore', `Restored syllabus ${s.version_label} to ${sn.created_at}`);
  });
  return openSyllabusDocument(db, userId, id);
}

/** Create a syllabus for a course, starting from the outline (or a copy of another syllabus's document). */
export function createSyllabus(db, userId, courseId, body = {}) {
  const course = db.prepare('SELECT * FROM courses WHERE id = ? AND user_id = ? AND deleted_at IS NULL').get(Number(courseId), userId);
  if (!course) throw new HttpError(404, 'Course not found');
  const str = (v, n) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
  const meta = { version_label: str(body.version_label, 120) || `${course.code} syllabus`, academic_year: str(body.academic_year, 20) || null, semester: str(body.semester, 40) || null };
  let doc;
  let page = DEFAULT_PAGE;
  if (body.copy_from) {
    const src = openSyllabusDocument(db, userId, body.copy_from);
    doc = src.document; page = src.page;
  } else {
    const author = db.prepare('SELECT full_name FROM professional_profiles WHERE user_id = ?').get(userId)?.full_name || '';
    doc = templateDocument(course, meta, author);
  }
  return tx(db, () => {
    const r = db.prepare("INSERT INTO syllabi (user_id, course_id, version_label, academic_year, semester, status, content_json, document_json, page_json) VALUES (?, ?, ?, ?, ?, 'draft', ?, ?, ?)")
      .run(userId, course.id, meta.version_label, meta.academic_year, meta.semester, JSON.stringify({}), JSON.stringify(doc), JSON.stringify(page));
    const row = owned(db, userId, r.lastInsertRowid);
    reindex(db, getResource('syllabi'), row);
    audit(db, userId, 'syllabi', row.id, 'create', `Created syllabus ${row.version_label}${body.copy_from ? ' (copied)' : ''}`);
    return view(db, userId, row);
  });
}

/** Export the document as it appears in the editor, on its page setup, with the letterhead. */
export async function exportSyllabusDocument(db, userId, id, format = 'docx', { pdfRenderer } = {}) {
  const v = openSyllabusDocument(db, userId, id);
  if (!['docx', 'pdf'].includes(format)) throw new HttpError(422, 'Choose Word or PDF');
  if (format === 'pdf' && !pdfRenderer) throw new HttpError(503, 'PDF output is produced by the SYNCHRONIA desktop app.');
  const title = `Syllabus — ${v.course?.code || ''} ${v.syllabus.version_label}`.trim();
  const lh = letterheadFor(db, userId);
  let buffer;
  if (format === 'docx') {
    const g = pageGeometry(v.page.size, v.page.landscape);
    buffer = await buildDocument({ title, children: toDocxChildren(v.document, { width: g.contentWidth, size: 21, cellSize: 19, image: (src) => loadImage(db, userId, src) }), pageSize: v.page.size, landscape: v.page.landscape, letterhead: lh, showTitle: false, font: 'Arial' });
  } else {
    buffer = await pdfRenderer(toHtmlPage(v.document, { title, page: CSS_PAGE[v.page.size], landscape: v.page.landscape, letterhead: lh, image: (src) => loadImage(db, userId, src) }), { title });
  }
  const firstWords = (JSON.stringify(v.document).match(/"text":"([^"]{4,60})"/) || [])[1];
  return saveReport(db, userId, { type: 'syllabus', title, buffer, format, fileStem: `Syllabus_${v.course?.code || ''}_${v.syllabus.version_label}`, expect: firstWords ? [firstWords] : [] });
}

export { getRecord };
