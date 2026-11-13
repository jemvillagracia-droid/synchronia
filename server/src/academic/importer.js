// Syllabus importer: reads an existing Word (.docx) syllabus — however loosely formatted — and recovers the
// course, program outcomes, course outcomes, the CILO × PO map, the weekly outline, policies, grading and
// signatories. Nothing is saved until the owner reviews the preview and commits it.
import JSZip from 'jszip';
import { HttpError, create as createRecord, update as updateRecord } from '../repo.js';
import { tx } from '../db.js';
import { cleanSyllabus, programOutcomes, setAlignments } from './service.js';
import { fillInstitutionGaps } from './institution.js';

// ───────────────────────── Word XML → blocks ─────────────────────────

const decode = (s) => s
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
  .replace(/&amp;/g, '&');

/** Index just past the element that opens at `start`, honouring nesting of the same tag. */
function closeOf(xml, start, tag) {
  const open = new RegExp(`<${tag}(?=[ >/])`, 'g');
  const close = `</${tag}>`;
  let depth = 0;
  let i = start;
  for (;;) {
    open.lastIndex = i;
    const o = open.exec(xml);
    const c = xml.indexOf(close, i);
    if (c < 0) return xml.length;
    if (o && o.index < c) {
      const selfClosing = xml.slice(o.index, xml.indexOf('>', o.index) + 1).endsWith('/>');
      if (!selfClosing) depth++;
      i = xml.indexOf('>', o.index) + 1;
      if (selfClosing && depth === 0) return i;
    } else {
      depth--;
      i = c + close.length;
      if (depth === 0) return i;
    }
  }
}

/** Children of a given tag directly inside `xml` (not inside nested tables). */
function children(xml, tag) {
  const out = [];
  const re = new RegExp(`<${tag}(?=[ >])`, 'g');
  let m;
  while ((m = re.exec(xml))) {
    const end = closeOf(xml, m.index, tag);
    out.push(xml.slice(m.index, end));
    re.lastIndex = end;
  }
  return out;
}

function paragraphText(xml) {
  let out = '';
  const re = /<w:t(?: [^>]*)?>([^<]*)<\/w:t>|<w:tab\/>|<w:br(?: [^>]*)?\/>|<w:cr\/>|<w:sym [^>]*w:char="([0-9A-F]+)"[^>]*\/>/gi;
  let m;
  while ((m = re.exec(xml))) {
    if (m[1] != null) out += decode(m[1]);
    else if (m[2]) out += /^F0(FC|FE)$|^2713$|^2714$/.test(m[2]) ? '✓' : '';
    else if (/^<w:tab/.test(m[0])) out += '\t';
    else out += '\n';
  }
  return out.replace(/[  ]+/g, ' ').replace(/ *\n */g, '\n').trim();
}

/** Ordered blocks: paragraphs and tables (rows → cells → blocks). */
function blocks(xml) {
  const out = [];
  const re = /<w:tbl>|<w:tbl |<w:p(?=[ >])/g;
  let m;
  while ((m = re.exec(xml))) {
    if (m[0].startsWith('<w:tbl')) {
      const end = closeOf(xml, m.index, 'w:tbl');
      const tbl = xml.slice(m.index, end);
      const rows = children(tbl.slice(6), 'w:tr').map((tr) => children(tr.slice(5), 'w:tc').map((tc) => {
        const inner = blocks(tc.slice(5));
        return { blocks: inner, text: flatText(inner) };
      }));
      out.push({ type: 'tbl', rows });
      re.lastIndex = end;
    } else {
      const end = closeOf(xml, m.index, 'w:p');
      out.push({ type: 'p', text: paragraphText(xml.slice(m.index, end)) });
      re.lastIndex = end;
    }
  }
  return out;
}

const flatText = (bs) => bs.map((b) => (b.type === 'p' ? b.text : b.rows.map((r) => r.map((c) => c.text).join(' ')).join('\n'))).filter(Boolean).join('\n');

// ───────────────────────── Recognising the parts ─────────────────────────

const clean = (s) => String(s || '').replace(/\t+/g, ' ').replace(/[ ]{2,}/g, ' ').trim();
const norm = (s) => clean(s).replace(/^[\s.\-–•·*]+/, '');
const isMatrix = (t) => /^C?ILOs?$/i.test(clean(t.rows[0]?.[0]?.text)) && t.rows[0].slice(1).some((c) => /^P(?:ILO|O)?\s*\d+$/i.test(clean(c.text)));
const isOutline = (t) => /WEEK/i.test(t.rows[0]?.[0]?.text || '') && t.rows[0].length >= 4;
const isSignatories = (t) => t.rows.length <= 8 && t.rows.some((r) => r.some((c) => c.blocks.some((b) => b.type === 'p' && /^Prepared\s+by/i.test(b.text))));

const HEADERS = [
  ['po', /^Program (?:Learning )?Outcomes:?$/i],
  ['clo', /^Course (?:Intended )?Learning Outcomes:?$/i],
  ['desc', /^Course Description:?/i],
  ['map', /^(?:Curriculum Map|Mapping of .*):?$/i],
  ['legend', /^Legend:?/i],
  ['outline', /^Course Outline:?$/i],
  ['refs', /^(?:References|Bibliography|Suggested Readings):?$/i],
  ['policies', /^Course Policies:?$/i],
  ['grading', /^Grading (?:Policy|System):?$/i],
  ['consult', /^Consultation (?:Hours|Time):?/i],
  ['sign', /^Prepared by:?/i],
];
const headerOf = (line) => HEADERS.find(([, re]) => re.test(norm(line)))?.[0] || null;

/** Lines in reading order, leaving out the tables that are parsed structurally. */
function linesOf(bs, out = []) {
  for (const b of bs) {
    if (b.type === 'p') { for (const l of b.text.split('\n')) if (clean(l)) out.push(clean(l)); continue; }
    if (isMatrix(b) || isOutline(b) || isSignatories(b)) continue;
    for (const row of b.rows) for (const cell of row) linesOf(cell.blocks, out);
  }
  return out;
}

function tablesOf(bs, out = []) {
  for (const b of bs) {
    if (b.type !== 'tbl') continue;
    out.push(b);
    for (const row of b.rows) for (const cell of row) tablesOf(cell.blocks, out);
  }
  return out;
}

const LABEL = /^[A-Za-z][A-Za-z /&-]{1,40}:\s*$/;

/** Value of a "Label: value" line, or the following line when the value sits in the next cell. */
function labelled(lines, re) {
  for (let i = 0; i < lines.length; i++) {
    const m = re.exec(norm(lines[i]));
    if (!m) continue;
    const v = clean(m[1] || '');
    if (v) return v;
    const next = lines[i + 1];
    if (next && !LABEL.test(next) && !headerOf(next) && !Object.values(LABELS).some((r) => r.test(norm(next)))) return clean(next);
    return '';
  }
  return '';
}

const LABELS = {
  title: /^COURSE TITLE\s*:?\s*(.*)$/i,
  code: /^COURSE CODE\s*:?\s*(.*)$/i,
  hours: /^CONTACT HOURS\s*:?\s*(.*)$/i,
  units: /^(?:CREDIT UNITS|UNITS)\s*:?\s*(.*)$/i,
  prereq: /^PRE-?\s?REQUISITES?\s*:?\s*(.*)$/i,
  vision: /^Vision\s*:?\s*(.*)$/i,
  mission: /^Mission\s*:?\s*(.*)$/i,
  national: /^National\s*:\s*(.*)$/i,
  regional: /^Regional\s*:\s*(.*)$/i,
  university: /^(?:University|Institutional)\s*:\s*(.*)$/i,
  values: /^Core Values\s*:?\s*(.*)$/i,
  attributes: /^Graduate Attributes\s*:?\s*(.*)$/i,
  program: /^Program\s*:\s*(.*)$/i,
};

function section(lines, key) {
  const start = lines.findIndex((l) => headerOf(l) === key);
  if (start < 0) return [];
  const out = [];
  const inline = clean(norm(lines[start]).replace(HEADERS.find(([k]) => k === key)[1], '').replace(/^:\s*/, ''));
  if (key === 'desc' || key === 'consult') { const v = clean(norm(lines[start]).replace(/^[^:]*:\s*/, '')); if (v && v !== norm(lines[start])) out.push(v); }
  else if (inline) out.push(inline);
  for (let i = start + 1; i < lines.length && !headerOf(lines[i]); i++) out.push(lines[i]);
  return out;
}

const SEMS = [['first', /1st|first/i], ['second', /2nd|second/i], ['summer', /summer|midyear/i]];
const LEVEL = (v) => { const s = clean(v).toUpperCase(); return s === 'E' ? 'P' : ['I', 'P', 'D'].includes(s) ? s : null; };
const num = (v) => { const m = /(\d+(?:\.\d+)?)/.exec(String(v || '')); return m ? Number(m[1]) : null; };

/** Parse a .docx syllabus into an editable preview. */
export async function parseSyllabusDocx(buffer, fileName = 'syllabus.docx') {
  let zip;
  try { zip = await JSZip.loadAsync(buffer); } catch { throw new HttpError(415, 'That file is not a Word (.docx) document. Save it as .docx and try again.'); }
  const xml = await zip.file('word/document.xml')?.async('string');
  if (!xml) throw new HttpError(415, 'That file is not a Word (.docx) document.');
  const body = xml.slice(xml.indexOf('<w:body'));
  const bs = blocks(body);
  const lines = linesOf(bs);
  const tables = tablesOf(bs);
  const warnings = [];
  const all = lines.join('\n');

  // Header: college, school year, semester.
  const college = lines.find((l) => /^(?:COLLEGE|SCHOOL|INSTITUTE|DEPARTMENT) OF\b/i.test(l)) || '';
  const sy = /\bS\.?Y\.?\s*:?\s*(\d{4})\s*[-–]\s*(\d{4})/i.exec(all) || /\b(20\d{2})\s*[-–]\s*(20\d{2})\b/.exec(all);
  const semLine = lines.find((l) => /\(\s*[^)]*\)\s*(?:1st|2nd|first|second)/i.test(l)) || '';
  let semester = null;
  for (const m of semLine.matchAll(/\(\s*([^)]*?)\s*\)\s*([A-Za-z0-9]+)/g)) {
    if (/[\/✓✔xX•●]/.test(m[1])) semester = SEMS.find(([, re]) => re.test(m[2]))?.[0] || semester;
  }

  // Course block.
  const course = {
    title: labelled(lines, LABELS.title),
    code: labelled(lines, LABELS.code),
    contact_hours: num(labelled(lines, LABELS.hours)),
    units: num(labelled(lines, LABELS.units)),
    program: labelled(lines, LABELS.program),
  };
  const prerequisites = labelled(lines, LABELS.prereq);

  // Vision, mission, goals.
  const institution = {
    college: clean(college).replace(/\s+/g, ' '),
    vision: labelled(lines, LABELS.vision), mission: labelled(lines, LABELS.mission),
    goals_national: labelled(lines, LABELS.national), goals_regional: labelled(lines, LABELS.regional), goals_university: labelled(lines, LABELS.university),
    core_values: labelled(lines, LABELS.values), graduate_attributes: labelled(lines, LABELS.attributes),
  };

  // Program outcomes, grouped by their "A. …" headings.
  const pos = [];
  let group = '';
  for (const l of section(lines, 'po')) {
    const item = /^(PO|PILO|PLO|ILO|SO)\s*-?\s*([0-9]+|[a-z])\s*[.:)]\s*(.+)$/i.exec(l);
    if (item) { pos.push({ code: `${item[1].toUpperCase()} ${item[2]}`, description: clean(item[3]), group_label: group }); continue; }
    if (/^[A-Z]\.\s+\S/.test(l)) { group = clean(l); continue; }
    if (/ability to:?$|graduates? (?:can|will|should)/i.test(l)) continue;
    if (pos.length) pos[pos.length - 1].description += ` ${clean(l)}`;
  }

  // Course intended learning outcomes.
  const clos = [];
  let learnerTerm = '';
  for (const l of section(lines, 'clo')) {
    const item = /^(CILO|CLO|ILO|LO)\s*-?\s*(\d+)\s*[.:)]\s*(.+)$/i.exec(l);
    if (item) { clos.push({ code: `${item[1].toUpperCase()} ${item[2]}`, description: clean(item[3]) }); continue; }
    const term = /end of the (?:course|semester|term),?\s+the\s+(.+?)\s+(?:can|will|should|are able)/i.exec(l);
    if (term) { learnerTerm = term[1]; continue; }
    if (clos.length) clos[clos.length - 1].description += ` ${clean(l)}`;
  }
  if (!clos.length) warnings.push('No course intended learning outcomes were recognised (expected lines such as “CILO 1. …”).');
  if (!pos.length) warnings.push('No program outcomes were recognised (expected lines such as “PO 1. …” or “PILO 1. …”).');

  const description = section(lines, 'desc').filter((l) => !/^(?:Curriculum Map|Legend)/i.test(l)).join('\n');

  // CILO × PO matrix. Column "Pn" names PILO n when the program has PILOs, otherwise PO n.
  const alignments = [];
  const mt = tables.find(isMatrix);
  if (mt) {
    const cols = mt.rows[0].slice(1).map((c) => {
      const n = num(c.text);
      const exact = pos.find((p) => p.code.replace(/\s+/g, '').toUpperCase() === clean(c.text).replace(/\s+/g, '').toUpperCase());
      return exact?.code || pos.find((p) => p.code === `PILO ${n}`)?.code || pos.find((p) => p.code === `PO ${n}`)?.code || null;
    });
    for (const row of mt.rows.slice(1)) {
      const m = /^(?:C?ILO|CLO)\s*(\d+)/i.exec(clean(row[0]?.text));
      const clo = m && clos.find((c) => num(c.code) === Number(m[1]));
      if (!clo) continue;
      row.slice(1).forEach((cell, i) => { const level = LEVEL(cell.text); if (level && cols[i]) alignments.push({ clo: clo.code, po: cols[i], level }); });
    }
    if (cols.some((c) => !c)) warnings.push('Some curriculum-map columns did not match a program outcome and were skipped.');
  }

  // Weekly outline.
  const weeks = [];
  const ot = tables.find(isOutline);
  if (ot) {
    for (const row of ot.rows.slice(1)) {
      const cells = row.map((c) => c.text);
      if (!cells.some((c) => clean(c))) continue;
      const first = clean(cells[0]);
      const wk = /(?:week|wk)\.?\s*([0-9]+(?:\s*[-–]\s*[0-9]+)?)/i.exec(first);
      const hrs = /(\d+(?:\.\d+)?)\s*(?:hrs?|hours?)/i.exec(first);
      const [ilosRaw = '', assessment = '', content = '', activities = '', resources = ''] = cells.slice(1).map((c) => c.trim());
      if (!wk && !clean(ilosRaw + assessment + content)) continue;
      const codes = /\(((?:C?ILO|CLO)[^)]*)\)/i.exec(ilosRaw);
      weeks.push({
        week: wk ? wk[1].replace(/\s+/g, '') : first.slice(0, 20),
        hours: hrs ? Number(hrs[1]) : null,
        ilos: clean(codes ? ilosRaw.replace(codes[0], '') : ilosRaw).replace(/\s+\./g, '.'),
        clo_codes: codes ? clean(codes[1]) : '',
        assessment, content, activities, resources,
      });
      if (cells.length > 6) warnings.push(`Week ${wk ? wk[1] : '?'}: the row has ${cells.length} cells; only the first six were read. Check this week in the preview.`);
    }
  } else warnings.push('No course outline table was recognised (expected a table whose first column is “Week”).');

  const references = section(lines, 'refs').map(clean).filter(Boolean);
  const policies = section(lines, 'policies').map(clean).filter(Boolean);
  const grading = [];
  for (const l of section(lines, 'grading')) {
    const m = /^(.+?)[\s:–-]*(\d+(?:\.\d+)?)\s*%$/.exec(clean(l));
    if (m && !/^total\b/i.test(m[1])) grading.push({ component: clean(m[1]), weight: Number(m[2]) });
  }
  const consultation = section(lines, 'consult').join('\n');

  // Signatories: per column, the name is the first line after "Prepared/Reviewed/Approved by", then the title.
  const signatories = {};
  const st = tables.find(isSignatories);
  if (st) {
    const width = Math.max(...st.rows.map((r) => r.length));
    const colLines = Array.from({ length: width }, (_, i) => st.rows.flatMap((r) => (r[i]?.text || '').split('\n')).map(clean).filter(Boolean));
    for (const col of colLines) {
      const role = /^(Prepared|Reviewed|Approved|Noted|Recommending)/i.exec(col[0] || '')?.[1]?.toLowerCase();
      const rest = col.slice(1).filter((x) => !/^(?:Prepared|Reviewed|Approved|Noted) by:?$/i.test(x));
      const key = role === 'prepared' ? 'prepared_by' : role === 'reviewed' || role === 'recommending' ? 'reviewed_by' : role === 'approved' || role === 'noted' ? 'approved_by' : null;
      if (key) { signatories[`${key}_name`] = rest[0] || ''; signatories[`${key}_title`] = rest.slice(1).join(', '); }
    }
  }
  if (signatories.reviewed_by_name) { institution.program_head_name = signatories.reviewed_by_name; institution.program_head_title = signatories.reviewed_by_title; }
  if (signatories.approved_by_name) { institution.dean_name = signatories.approved_by_name; institution.dean_title = signatories.approved_by_title; }

  if (!course.code) warnings.push('The course code was not found; enter it before importing.');
  if (!course.title) warnings.push('The course title was not found; enter it before importing.');
  const total = grading.reduce((n, g) => n + g.weight, 0);
  if (grading.length && total !== 100) warnings.push(`Grading weights total ${total}%, not 100%.`);

  const content = cleanSyllabus({ description, prerequisites, learner_term: learnerTerm, weeks, grading, references, policies, consultation, signatories });
  return {
    source: String(fileName).split(/[\\/]/).pop().slice(0, 200),
    course: { ...course, description },
    academic_year: sy ? `${sy[1]}-${sy[2]}` : '',
    semester,
    institution,
    pos, clos, alignments, content, warnings,
  };
}

// ───────────────────────── Committing a reviewed preview ─────────────────────────

const s = (v, max = 4000) => (v == null ? '' : String(v)).trim().slice(0, max);

export function importSyllabus(db, userId, preview) {
  if (!preview || typeof preview !== 'object') throw new HttpError(422, 'Nothing to import');
  const c = preview.course || {};
  const code = s(c.code, 60);
  const title = s(c.title, 300);
  if (!code || !title) throw new HttpError(422, 'Validation failed', { ...(code ? {} : { code: 'Course code is required' }), ...(title ? {} : { title: 'Course title is required' }) });
  const pos = (Array.isArray(preview.pos) ? preview.pos : []).filter((p) => s(p.code) && s(p.description)).slice(0, 80);
  const clos = (Array.isArray(preview.clos) ? preview.clos : []).filter((o) => s(o.code) && s(o.description)).slice(0, 60);
  const semester = ['first', 'second', 'summer'].includes(preview.semester) ? preview.semester : null;
  const ay = /^\d{4}-\d{4}$/.test(s(preview.academic_year)) ? s(preview.academic_year) : '';
  const counts = { course: 'created', program_outcomes: 0, course_outcomes: 0, alignments: 0 };

  return tx(db, () => {
    // Course: reuse one with the same code, filling only empty fields.
    const existing = db.prepare('SELECT * FROM courses WHERE user_id = ? AND deleted_at IS NULL AND lower(code) = lower(?)').get(userId, code);
    let course;
    const fields = { title, contact_hours: c.contact_hours == null || c.contact_hours === '' ? null : Math.round(Number(c.contact_hours)), units: c.units == null || c.units === '' ? null : Number(c.units), program: s(c.program, 300) || null, description: s(c.description, 8000) || null };
    if (existing) {
      const fill = Object.fromEntries(Object.entries(fields).filter(([k, v]) => v != null && v !== '' && (existing[k] == null || existing[k] === '')));
      course = Object.keys(fill).length ? updateRecord(db, userId, 'courses', existing.id, fill) : existing;
      counts.course = 'updated';
    } else {
      course = createRecord(db, userId, 'courses', { code, ...Object.fromEntries(Object.entries(fields).filter(([, v]) => v != null && v !== '')) });
    }

    // Program outcomes belong to the program; course outcomes to the course.
    const poIds = {};
    const known = programOutcomes(db, userId, course);
    pos.forEach((p, i) => {
      const hit = known.find((k) => k.code.toUpperCase() === s(p.code).toUpperCase());
      const values = { description: s(p.description, 4000), group_label: s(p.group_label, 300) || null, sort_order: i };
      poIds[s(p.code).toUpperCase()] = hit ? updateRecord(db, userId, 'learning_outcomes', hit.id, values).id
        : createRecord(db, userId, 'learning_outcomes', { outcome_type: 'PO', code: s(p.code, 60), program: course.program || null, ...values }).id;
      counts.program_outcomes++;
    });
    const cloIds = {};
    clos.forEach((o, i) => {
      const hit = db.prepare("SELECT id FROM learning_outcomes WHERE user_id = ? AND course_id = ? AND deleted_at IS NULL AND outcome_type IN ('CLO','ILO') AND upper(code) = upper(?)").get(userId, course.id, s(o.code));
      const values = { description: s(o.description, 4000), sort_order: i };
      cloIds[s(o.code).toUpperCase()] = hit ? updateRecord(db, userId, 'learning_outcomes', hit.id, values).id
        : createRecord(db, userId, 'learning_outcomes', { course_id: course.id, outcome_type: 'CLO', code: s(o.code, 60), ...values }).id;
      counts.course_outcomes++;
    });
    const pairs = (Array.isArray(preview.alignments) ? preview.alignments : [])
      .map((a) => ({ clo_id: cloIds[s(a.clo).toUpperCase()], po_id: poIds[s(a.po).toUpperCase()], level: LEVEL(a.level) }))
      .filter((a) => a.clo_id && a.po_id && a.level);
    if (pairs.length) { setAlignments(db, userId, course.id, pairs); counts.alignments = pairs.length; }

    const syllabus = createRecord(db, userId, 'syllabi', {
      course_id: course.id, version_label: ay ? `AY ${ay}` : `Imported ${new Date().toISOString().slice(0, 10)}`,
      academic_year: ay || null, semester, status: 'draft', content_json: cleanSyllabus(preview.content || {}),
    });
    const inst = preview.institution && typeof preview.institution === 'object' ? preview.institution : {};
    const filled = fillInstitutionGaps(db, userId, inst);
    return { course_id: course.id, syllabus_id: syllabus.id, counts, institution_filled: filled };
  });
}
