// Research documents through the existing document engine: every export is built as one rich document (the same
// model the editor uses) and rendered to Word with buildDocument or to PDF with the desktop renderer, then verified
// and saved with saveReport. APA 7 references are produced from linked literature.
import ExcelJS from 'exceljs';
import { HttpError } from '../repo.js';
import { defaultPaper, PAPERS } from '../paper.js';
import { buildDocument, pageGeometry, saveReport } from '../academic/docs.js';
import { letterheadFor } from '../academic/institution.js';
import { loadImage } from '../docimages.js';
import { toDocxChildren, toHtmlPage, heading, para, tableOf, bullets, plainText } from '../richdoc.js';
import { apaParts, apa, documentView, instrumentWorkspace, literatureList, owned, projectWorkspace, stages, stageLabel, KIND_LABEL } from './service.js';

const parse = (j, d) => { try { return j ? JSON.parse(j) : d; } catch { return d; } };
const human = (s) => (s ? String(s).replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase()) : '');
const refPara = (l) => ({ type: 'paragraph', content: apaParts(l).filter((p) => p.t).map((p) => ({ type: 'text', text: p.t, ...(p.i ? { marks: [{ type: 'italic' }] } : {}) })) });
const fields = (rows) => tableOf(rows.filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => [{ text: k, bold: true }, String(v)]), { header: false });
const sectionBody = (b) => (b && Array.isArray(b.content) ? b.content : []);

export async function render(db, userId, { doc, title, format, landscape = false, pageSize = null, type, fileStem, pdfRenderer }) {
  if (!['docx', 'pdf'].includes(format)) throw new HttpError(422, 'Choose Word or PDF');
  if (format === 'pdf' && !pdfRenderer) throw new HttpError(503, 'PDF output is produced by the SYNCHRONIA desktop app.');
  const lh = letterheadFor(db, userId);
  const image = (src) => loadImage(db, userId, src);
  let buffer;
  if (format === 'docx') {
    const g = pageGeometry(pageSize, landscape);
    buffer = await buildDocument({ title, children: toDocxChildren(doc, { width: g.contentWidth, image }), pageSize, landscape, letterhead: lh, showTitle: false });
  } else {
    buffer = await pdfRenderer(toHtmlPage(doc, { title, page: (PAPERS[pageSize || defaultPaper()] || PAPERS.letter).css, landscape, letterhead: lh, image }), { title });
  }
  // Verification checks that the document's own first heading is readable in the file.
  const first = plainText(doc.content?.[0]).trim();
  return saveReport(db, userId, { type, title, buffer, format, fileStem, expect: first ? [first.slice(0, 50)] : [] });
}

/** Proposal, concept paper, methodology document or manuscript. */
export async function exportDocument(db, userId, id, format, opts) {
  const v = documentView(db, userId, id);
  const d = v.document;
  const lit = d.project_id ? literatureList(db, userId, { project_id: d.project_id }).items.sort((a, b) => apa(a).localeCompare(apa(b))) : [];
  const author = db.prepare('SELECT full_name FROM professional_profiles WHERE user_id = ?').get(userId)?.full_name || '';
  const content = [heading(d.title, 1, 'center'), ...(author ? [para(author, { align: 'center' })] : []),
    para([v.kind_label, v.project && `Project: ${v.project.title}`, d.target && `Prepared for: ${d.target}`].filter(Boolean).join('   ·   '), { align: 'center' })];
  for (const s of v.sections.filter((x) => x.status !== 'not_applicable')) {
    content.push(heading(s.heading, 2));
    const body = sectionBody(s.body);
    if (s.section_key === 'references' && !body.some((n) => JSON.stringify(n).includes('"text"')) && lit.length) content.push(...lit.map(refPara));
    else content.push(...(body.length ? body : [para('')]));
  }
  return render(db, userId, { doc: { type: 'doc', content }, title: d.title, format, type: `research_${d.kind}`, fileStem: `${KIND_LABEL[d.kind]}_${d.title}`, ...opts });
}

/** Literature review matrix (Word or spreadsheet). */
export async function exportMatrix(db, userId, { project_id: projectId, format = 'docx' } = {}, opts = {}) {
  const items = literatureList(db, userId, { project_id: projectId }).items;
  const project = projectId ? owned(db, userId, 'research_projects', projectId, 'Research project') : null;
  const title = `Literature Review Matrix${project ? ` — ${project.title}` : ''}`;
  if (format === 'xlsx') {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Matrix');
    ws.columns = [['Reference (APA 7)', 50], ['Year', 8], ['Theme', 18], ['Objectives', 30], ['Methodology', 30], ['Major findings', 40], ['Limitations', 30], ['Relevance to my research', 40], ['Notes', 30], ['DOI / link', 30]]
      .map(([header, width]) => ({ header, width }));
    ws.getRow(1).font = { bold: true };
    for (const l of items) ws.addRow([apa(l), l.year, l.theme, l.objectives, l.methodology, l.findings, l.limitations, l.relevance, l.notes, l.doi ? `https://doi.org/${l.doi}` : l.url]);
    ws.eachRow((r) => { r.alignment = { vertical: 'top', wrapText: true }; });
    ws.views = [{ state: 'frozen', ySplit: 1 }];
    const buffer = Buffer.from(await wb.xlsx.writeBuffer());
    return saveReport(db, userId, { type: 'research_literature_matrix', title, buffer, format: 'xlsx', fileStem: title, expect: [] });
  }
  const doc = { type: 'doc', content: [heading(title, 1, 'center'), para(`${items.length} source${items.length === 1 ? '' : 's'}`, { align: 'center' }),
    tableOf([['Source', 'Objectives', 'Methodology', 'Major findings', 'Limitations', 'Relevance'], ...items.map((l) => [apa(l), l.objectives || '', l.methodology || '', l.findings || '', l.limitations || '', l.relevance || ''])])] };
  return render(db, userId, { doc, title, format, landscape: true, type: 'research_literature_matrix', fileStem: title, ...opts });
}

/** Instrument with its items, scoring, and the record of its development and validation. */
export async function exportInstrument(db, userId, id, { format = 'docx', version_id: versionId } = {}, opts = {}) {
  const w = instrumentWorkspace(db, userId, id);
  const i = w.instrument;
  const v = (versionId ? w.versions.find((x) => x.id === Number(versionId)) : w.versions.find((x) => x.stage === 'final') || w.versions[0]);
  if (!v) throw new HttpError(422, 'This instrument has no version yet.');
  let n = 0;
  const content = [heading(i.title, 1, 'center'), para(`${v.label || `Version ${v.version_no}`} · ${human(v.stage)}`, { align: 'center' })];
  if (v.instructions) content.push(heading('Instructions', 2), para(v.instructions));
  if (v.response_scale) content.push(heading('Response scale', 2), para(v.response_scale));
  for (const d of v.structure.dimensions) {
    content.push(heading(d.name || 'Items', 2));
    if (d.description) content.push(para(d.description));
    if (d.items.length) content.push(tableOf([['No.', 'Item', ...(v.response_scale ? ['Response'] : [])], ...d.items.map((it) => [String(++n), `${it.text}${it.reverse ? ' (reverse-scored)' : ''}`, ...(v.response_scale ? [''] : [])])]));
  }
  content.push(heading('Instrument Development and Validation', 1),
    fields([['Origin', human(i.origin)], ['Source', i.source], ['Permission', human(i.permission_status)], ['Permission notes', i.permission_notes], ['Purpose', i.purpose], ['Current stage', human(i.stage)]]));
  if (v.scoring) content.push(heading('Scoring', 2), para(v.scoring));
  if (v.interpretation) content.push(heading('Interpretation', 2), para(v.interpretation));
  content.push(heading('Expert Review (Content Validation)', 2),
    w.reviews.length ? tableOf([['Validator', 'Credentials', 'Date', 'Recommendation', 'Rating', 'Comments', 'Addressed'], ...w.reviews.map((r) => [r.validator, r.credentials || '', r.review_date || '', human(r.recommendation), r.rating || '', r.comments || '', r.addressed ? 'Yes' : 'No'])])
      : para('No expert reviews recorded.'));
  content.push(heading('Version History', 2), tableOf([['Version', 'Stage', 'Recorded', 'Changes'], ...w.versions.slice().reverse().map((x) => [`v${x.version_no} ${x.label || ''}`.trim(), human(x.stage), String(x.created_at).slice(0, 10), x.change_notes || ''])]));
  if (i.external_results) content.push(heading('Results Obtained Externally', 2), para(i.external_results), para('Recorded as reported; SYNCHRONIA does not compute statistics.'));
  return render(db, userId, { doc: { type: 'doc', content }, title: `Research Instrument — ${i.title}`, format, type: 'research_instrument', fileStem: `Instrument_${i.title}`, ...opts });
}

/** Ethics submission and approval record of a project. */
export async function exportEthics(db, userId, projectId, { format = 'docx' } = {}, opts = {}) {
  const w = projectWorkspace(db, userId, projectId);
  const content = [heading('Ethics Review Record', 1, 'center'), para(w.project.title, { align: 'center' })];
  if (!w.ethics.length) content.push(para('No ethics review recorded for this project.'));
  for (const e of w.ethics) {
    content.push(heading(e.committee || 'Ethics review', 2), fields([['Status', human(e.status)], ['Submitted', e.submission_date], ['Approved', e.approval_date], ['Reference / approval no.', e.reference_no],
      ['Required revisions', e.required_revisions], ['Revisions due', e.revisions_due], ['Approval conditions', e.conditions], ['Expires / renew by', e.expiry_date], ['Notes', e.notes]]));
  }
  return render(db, userId, { doc: { type: 'doc', content }, title: `Ethics Review Record — ${w.project.title}`, format, type: 'research_ethics', fileStem: `Ethics_${w.project.title}`, ...opts });
}

/** Research progress report, from recorded milestones and records only. */
export async function exportProgress(db, userId, projectId, { format = 'docx' } = {}, opts = {}) {
  const w = projectWorkspace(db, userId, projectId);
  const p = w.project;
  const content = [heading('Research Progress Report', 1, 'center'), para(p.title, { align: 'center', bold: true }), para(`As of ${new Date().toISOString().slice(0, 10)}`, { align: 'center' }),
    fields([['Stage', w.stage_label], ['Role', p.role], ['Research area', p.research_area], ['Period', [p.start_date, p.end_date].filter(Boolean).join(' to ')],
      ['Progress', w.progress.total ? `${w.progress.done} of ${w.progress.total} milestones completed` : 'No milestones defined'], ['Next action', w.next_action?.text]]),
    heading('Milestones', 2),
    w.milestones.length ? tableOf([['Milestone', 'Due', 'Status', 'Completed'], ...w.milestones.map((m) => [m.title, m.due_date || '', human(m.status), m.completed_on || ''])]) : para('No milestones recorded.'),
    heading('Writing', 2),
    w.documents.length ? tableOf([['Document', 'Type', 'Status', 'Sections done'], ...w.documents.map((d) => [d.title, KIND_LABEL[d.kind], human(d.status), `${d.sections_done} of ${d.sections}`])]) : para('No documents yet.'),
    heading('Literature', 2), para(`${w.literature.length} source${w.literature.length === 1 ? '' : 's'} linked.`),
    heading('Instruments', 2), w.instruments.length ? bullets(w.instruments.map((i) => `${i.title} — ${human(i.stage)} (${i.versions} version${i.versions === 1 ? '' : 's'}, ${i.reviews} expert review${i.reviews === 1 ? '' : 's'})`)) : para('None linked.'),
    heading('Ethics', 2), w.ethics.length ? bullets(w.ethics.map((e) => `${e.committee || 'Ethics review'}: ${human(e.status)}${e.reference_no ? ` (${e.reference_no})` : ''}${e.expiry_date ? `, valid until ${e.expiry_date}` : ''}`)) : para('None recorded.'),
    heading('Dissemination', 2),
    w.submissions.length ? tableOf([['Title', 'Venue', 'Status', 'Submitted'], ...w.submissions.map((s) => [s.title, s.venue || '', human(s.status), s.submission_date || ''])]) : para('No submissions recorded.'),
    ...(w.publications.length ? [bullets(w.publications.map((x) => `Publication: ${x.title}${x.venue ? `, ${x.venue}` : ''}${x.publication_date ? ` (${x.publication_date})` : ''}`))] : []),
    ...(w.presentations.length ? [bullets(w.presentations.map((x) => `Presentation: ${x.title}, ${x.conference}${x.presentation_date ? ` (${x.presentation_date})` : ''}`))] : []),
    heading('Funding and Collaboration', 2),
    ...(w.funding.length ? [bullets(w.funding.map((f) => `${f.opportunity}${f.organization ? ` — ${f.organization}` : ''}: ${human(f.submission_status)}${f.award_status ? `, ${human(f.award_status)}` : ''}${f.amount != null ? `, ${f.currency || ''} ${f.amount}`.trimEnd() : ''}`))] : [para('No funding recorded.')]),
    ...(w.collaborators.length ? [bullets(w.collaborators.map((c) => `${c.name}${c.affiliation ? `, ${c.affiliation}` : ''}${c.project_role ? ` — ${c.project_role}` : ''}`))] : []),
  ];
  return render(db, userId, { doc: { type: 'doc', content }, title: `Research Progress Report — ${p.title}`, format, type: 'research_progress', fileStem: `Research_Progress_${p.title}`, ...opts });
}

/** Publication and conference presentation records (and submissions in progress). */
export async function exportDissemination(db, userId, { format = 'docx' } = {}, opts = {}) {
  const pubs = db.prepare('SELECT * FROM publications WHERE user_id = ? AND deleted_at IS NULL ORDER BY publication_date DESC').all(userId);
  const pres = db.prepare('SELECT * FROM conference_presentations WHERE user_id = ? AND deleted_at IS NULL ORDER BY presentation_date DESC').all(userId);
  const subs = db.prepare("SELECT * FROM research_submissions WHERE user_id = ? AND deleted_at IS NULL AND status NOT IN ('published','presented') ORDER BY updated_at DESC").all(userId);
  const content = [heading('Publications and Presentations Record', 1, 'center'),
    heading('Publications', 2), pubs.length ? tableOf([['Title', 'Authors', 'Venue', 'Status', 'Date', 'DOI'], ...pubs.map((x) => [x.title, x.authors, x.venue || '', human(x.status), x.publication_date || '', x.doi || ''])]) : para('None recorded.'),
    heading('Conference Presentations', 2), pres.length ? tableOf([['Title', 'Conference', 'Type', 'Date', 'Location'], ...pres.map((x) => [x.title, x.conference, human(x.presentation_type), x.presentation_date || '', x.location || ''])]) : para('None recorded.'),
    heading('Submissions in Progress', 2), subs.length ? tableOf([['Title', 'Venue', 'Status', 'Submitted', 'Revision due'], ...subs.map((x) => [x.title, x.venue || '', human(x.status), x.submission_date || '', x.revision_due || ''])]) : para('None.'),
  ];
  return render(db, userId, { doc: { type: 'doc', content }, title: 'Publications and Presentations Record', format, landscape: true, type: 'research_dissemination', fileStem: 'Publications_and_Presentations', ...opts });
}

export { stages, stageLabel };
