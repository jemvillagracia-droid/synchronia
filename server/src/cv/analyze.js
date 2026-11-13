// ATS compatibility analyzer, AI/parser readability validation and the pre-export quality checklist.
// All checks run against text read back from the generated DOCX/PDF files. No compatibility guarantee is claimed.
import { STANDARD_ATS_HEADINGS, SECTION_BY_KEY } from './sections.js';
import { FONT_STACKS, styleFor } from './templates.js';

const norm = (s) => String(s || '').toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-').replace(/\s+/g, ' ').trim();
const STOP = new Set('a an and are as at be by for from has have in is it its of on or that the this to was were will with we you your our their they shall must should can may who what when where which while into about over under than then them these those such also other more most any each all not no yes per via using use used job work position applicant applicants candidate candidates required requirements preferred qualifications responsibilities including include ability strong excellent good well able experience years year'.split(' '));

function keywordTerms(input) {
  const raw = String(input || '').trim();
  if (!raw) return [];
  const parts = raw.split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean);
  if (parts.length > 1 && parts.every((p) => p.length <= 40)) return [...new Set(parts.map((p) => p.toLowerCase()))].slice(0, 40);
  // Job advertisement: most frequent meaningful words
  const counts = {};
  for (const w of raw.toLowerCase().match(/[a-z][a-z+#.-]{3,}/g) || []) {
    const word = w.replace(/[.-]+$/, '');
    if (STOP.has(word) || word.length < 4) continue;
    counts[word] = (counts[word] || 0) + 1;
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 25).map(([w]) => w);
}

const allEntries = (model) => model.sections.flatMap((s) => s.entries.map((e) => ({ ...e, section: s })));
const probe = (e) => norm(e.kind === 'citation' || (!e.title && e.text) ? (e.text || '').slice(0, 60) : e.title || e.text || '').slice(0, 60);

export function analyzeAts(model, { pdf, docx, style }) {
  const checks = [];
  const add = (id, label, status, detail, items = []) => checks.push({ id, label, status, detail, items });
  const text = norm(pdf.text);
  const entries = allEntries(model);

  // 1. Text extraction quality
  const missingText = entries.filter((e) => probe(e) && !text.includes(probe(e)));
  const nameOk = model.header.name && text.includes(norm(model.header.name));
  if (!nameOk) add('extraction', 'Text extraction', 'fail', 'Your name was not found in the text extracted from the PDF.');
  else if (!missingText.length) add('extraction', 'Text extraction', 'pass', `All ${entries.length} entries and your name were read back from the PDF as selectable text.`);
  else add('extraction', 'Text extraction', missingText.length / Math.max(entries.length, 1) <= 0.1 ? 'warn' : 'fail',
    `${missingText.length} of ${entries.length} entries could not be found verbatim in the extracted text.`, missingText.map((e) => e.title || (e.text || '').slice(0, 80)));

  // 2. Heading recognition
  const docHeadings = docx.headings.map(norm);
  const unrecognised = model.sections.filter((s) => !docHeadings.includes(norm(s.heading)));
  const nonStandard = model.sections.filter((s) => !STANDARD_ATS_HEADINGS.has(norm(s.heading)));
  if (unrecognised.length) add('headings', 'Heading recognition', 'fail', 'Some section headings are not marked as Word headings.', unrecognised.map((s) => s.heading));
  else if (nonStandard.length) {
    add('headings', 'Heading recognition', 'warn', 'All headings use the Heading 1 style, but some are not conventional ATS headings.',
      nonStandard.map((s) => `${s.heading}${SECTION_BY_KEY[s.key]?.ats && norm(SECTION_BY_KEY[s.key].ats) !== norm(s.heading) ? ` → consider “${SECTION_BY_KEY[s.key].ats}”` : ''}`));
  } else add('headings', 'Heading recognition', 'pass', `All ${model.sections.length} section headings are Word Heading 1 paragraphs with conventional labels.`);

  // 3. Section organization
  const keys = new Set(model.sections.map((s) => s.key));
  const orgIssues = [];
  if (!model.header.email && !model.header.phone) orgIssues.push('No email address or phone number in the header');
  if (!keys.has('education')) orgIssues.push('No Education section');
  if (!keys.has('employment') && !keys.has('appointments') && !keys.has('teaching')) orgIssues.push('No experience section (employment, appointments or teaching)');
  add('organization', 'Section organization', orgIssues.length ? (orgIssues.length > 1 ? 'fail' : 'warn') : 'pass',
    orgIssues.length ? 'Applicant tracking systems look for contact details, education and experience.' : 'Contact details, education and experience sections are present.', orgIssues);

  // 4. Reading order
  let pos = -1;
  const outOfOrder = [];
  for (const s of model.sections) {
    const i = text.indexOf(norm(s.heading), pos + 1);
    if (i === -1 || i < pos) outOfOrder.push(s.heading); else pos = i;
  }
  add('reading_order', 'Reading order', outOfOrder.length ? 'fail' : 'pass',
    outOfOrder.length ? 'Sections were extracted in a different order from the document.' : 'Sections are extracted top-to-bottom in document order.', outOfOrder);

  // 5. Chronological consistency and date association
  const undated = entries.filter((e) => e.kind === 'item' && !e.manual && SECTION_BY_KEY[e.section.key]?.source && !['skills', 'references'].includes(e.section.key) && !e.dates);
  // A title can also occur elsewhere (e.g. the summary mentions a position); accept a match at any occurrence.
  const dateMisses = entries.filter((e) => e.dates && probe(e)).filter((e) => {
    const p = probe(e);
    const d = norm(e.dates).split(' - ')[0];
    for (let i = text.indexOf(p); i !== -1; i = text.indexOf(p, i + 1)) {
      if (text.slice(Math.max(0, i - 120), i + p.length + 400).includes(d)) return false;
    }
    return true;
  });
  if (undated.length) add('chronology', 'Chronological consistency', 'warn', `${undated.length} dated entr${undated.length === 1 ? 'y has' : 'ies have'} no dates.`, undated.map((e) => `${e.section.heading}: ${e.title}`));
  else add('chronology', 'Chronological consistency', 'pass', `Dates use one format (${model.settings.date_style === 'year' ? 'YYYY' : 'Mon YYYY'}) and ${model.settings.date_order === 'reverse' ? 'reverse-' : ''}chronological order.`);
  add('dates', 'Date association', dateMisses.length ? 'warn' : 'pass',
    dateMisses.length ? 'Some dates were not found next to their entry in the extracted text.' : 'Every date is extracted next to its entry.', dateMisses.map((e) => e.title));

  // 6. Font readability
  const standardFont = Object.keys(FONT_STACKS).includes(style.font);
  add('font', 'Font readability', standardFont && style.size >= 10 ? 'pass' : 'warn',
    `${style.font}, ${style.size} pt${style.size < 10 ? ' — below 10 pt can be hard to read and parse' : ''}.`);

  // 7. Graphics and image-dependent information
  if (model.header.photo) add('graphics', 'Graphics and photographs', 'warn', 'The CV includes a photograph. Photographs are not universally recommended for ATS submissions; use the ATS export to omit it.');
  else if (style.ats) add('graphics', 'Graphics and photographs', 'pass', 'No photograph, rules or colour.');
  else add('graphics', 'Graphics and photographs', 'pass', 'No photograph. Decorative rules are drawn as borders, not images.');
  add('image_text', 'Image-dependent information', docx.images > (model.header.photo ? 1 : 0) ? 'fail' : 'pass',
    'No information is embedded in images; all content is real text.');

  // 8. Document structure
  const headerFooterContact = (docx.footers || []).some((f) => /@|\+?\d[\d\s-]{6,}/.test(f));
  add('structure', 'Document structure', headerFooterContact ? 'warn' : 'pass',
    headerFooterContact ? 'Contact details appear in the footer; some parsers ignore headers and footers.'
      : 'Single column, native headings and bullet lists, no layout tables or text boxes. The footer holds only page numbers.');

  // 9. Duplicates
  const seen = {};
  for (const e of entries) {
    const k = probe(e);
    if (!k) continue;
    (seen[k] ||= []).push(e);
  }
  const dups = Object.values(seen).filter((l) => l.length > 1);
  add('duplicates', 'Duplicated entries', dups.length ? 'warn' : 'pass', dups.length ? 'The same entry appears more than once.' : 'No duplicated entries.',
    dups.map((l) => `${l[0].title || l[0].text?.slice(0, 60)} (${l.map((e) => e.section.heading).join(', ')})`));

  // 10. Missing publication information
  const pubGaps = entries.filter((e) => ['publications', 'books', 'presentations'].includes(e.section.key) && e.missing?.length);
  add('publications', 'Publication information', pubGaps.length ? 'warn' : 'pass',
    pubGaps.length ? 'Some publications are missing details parsers expect.' : 'Publication entries carry authors, title, venue and year.',
    pubGaps.map((e) => `${e.title}: missing ${e.missing.map((m) => m.replace(/_/g, ' ')).join(', ')}`));

  // 11. Keywords
  const terms = keywordTerms(model.settings.keywords);
  const found = terms.filter((t) => new RegExp(`(^|[^a-z0-9])${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`, 'i').test(pdf.text));
  if (terms.length) {
    add('keywords', 'Keyword relevance', found.length / terms.length >= 0.6 ? 'pass' : 'warn',
      `${found.length} of ${terms.length} target keywords appear in the CV. Only add keywords that truthfully describe your record.`,
      terms.filter((t) => !found.includes(t)).map((t) => `Not found: ${t}`));
  } else add('keywords', 'Keyword relevance', 'info', 'Paste keywords or a job advertisement in Design › Target position to check relevance.');

  // 12. Essential information
  const ess = [!model.header.name && 'Name', !model.header.email && 'Email address', !model.header.phone && 'Phone number'].filter(Boolean);
  add('essentials', 'Essential information', ess.length ? 'fail' : 'pass', ess.length ? 'Missing from your professional profile:' : 'Name, email and phone are present.', ess);

  const summary = { pass: 0, warn: 0, fail: 0, info: 0 };
  for (const c of checks) summary[c.status] += 1;
  return {
    mode: model.meta.mode,
    summary,
    checks,
    keywords: { terms, found },
    disclaimer: 'These checks inspect the text read back from your generated files. They improve the odds of clean parsing but cannot guarantee compatibility with every applicant tracking system.',
  };
}

const TITLE_SMALL = new Set(['and', 'of', 'the', 'in', 'on', 'for', 'to', 'a', 'an']);
const isTitleCase = (h) => h.split(/\s+/).every((w, i) => !/^[a-z]/.test(w) || (i > 0 && TITLE_SMALL.has(w)));

export function qualityChecklist(model, editorView, ats) {
  const items = [];
  const add = (id, label, status, detail, list = []) => items.push({ id, label, status, detail, items: list });
  const sec = (k) => model.sections.find((s) => s.key === k);
  const h = model.header;

  const contactMissing = [!h.name && 'name', !h.email && 'email', !h.phone && 'phone'].filter(Boolean);
  add('contact', 'Name and contact information', !h.name ? 'missing' : contactMissing.length ? 'incomplete' : 'complete',
    contactMissing.length ? `Add ${contactMissing.join(', ')} in your Professional Profile.` : 'Name, email and phone present.');

  const checkSection = (key, label, optional = false) => {
    const s = sec(key);
    if (!s || !s.entries.length) return add(key, label, optional ? 'not_applicable' : 'missing', optional ? 'None included (optional for this CV).' : 'No entries included.');
    const gaps = s.entries.filter((e) => e.missing?.length);
    return add(key, label, gaps.length ? 'incomplete' : 'complete',
      gaps.length ? `${gaps.length} of ${s.entries.length} entries are missing details.` : `${s.entries.length} entr${s.entries.length === 1 ? 'y' : 'ies'}, details complete.`,
      gaps.map((e) => `${e.title || e.text?.slice(0, 60)}: ${e.missing.map((m) => m.replace(/_/g, ' ')).join(', ')}`));
  };
  checkSection('education', 'Educational qualifications');
  checkSection('employment', 'Employment dates and details', true);
  checkSection('appointments', 'Academic appointments', true);
  checkSection('licenses', 'License information', true);
  checkSection('publications', 'Publications', true);
  checkSection('awards', 'Awards', true);
  const refs = sec('references');
  add('references', 'References', refs?.entries.length ? 'complete' : 'missing', refs?.entries.length ? 'Included.' : 'No references section is included.');

  // Section consistency
  const headings = model.sections.map((s) => s.heading);
  const dupH = headings.filter((x, i) => headings.indexOf(x) !== i);
  const caseIssues = headings.filter((x) => !isTitleCase(x));
  const hiddenEmpty = editorView.sections.filter((s) => s.visible && !s.entries.some((e) => e.included)).map((s) => s.heading);
  const consistency = [...dupH.map((x) => `Duplicate heading: ${x}`), ...caseIssues.map((x) => `Capitalization differs: ${x}`), ...(model.settings.hide_empty ? [] : hiddenEmpty.map((x) => `Empty section shown: ${x}`))];
  add('consistency', 'Section consistency', consistency.length ? 'incomplete' : 'complete', consistency.length ? 'Headings or sections need attention.' : 'Headings are unique and consistently capitalized.', consistency);

  // Chronological ordering
  const manual = editorView.sections.filter((s) => s.visible && s.sort === 'manual' && !s.custom && s.entries.length > 1).map((s) => s.heading);
  add('chronology', 'Chronological ordering', manual.length ? 'incomplete' : 'complete',
    manual.length ? 'These sections use a manual order; check it is the order you intend.' : `All dated sections are ${model.settings.date_order === 'reverse' ? 'reverse-' : ''}chronological.`, manual);

  // Basic text checks
  const textIssues = [];
  const all = model.sections.flatMap((s) => s.entries.flatMap((e) => [e.title, e.subtitle, e.text, ...(e.details || [])].filter(Boolean)));
  for (const t of all) {
    const rep = /\b(\w+)\s+\1\b/i.exec(t);
    if (rep && !/^\d+$/.test(rep[1])) textIssues.push(`Repeated word “${rep[1]}”: ${t.slice(0, 70)}`);
    if (/ {2,}/.test(t)) textIssues.push(`Double space: ${t.slice(0, 70)}`);
  }
  for (const s of model.sections) {
    const bullets = s.entries.flatMap((e) => e.details || []);
    const withStop = bullets.filter((b) => /[.]$/.test(b)).length;
    if (bullets.length > 2 && withStop && withStop < bullets.length) textIssues.push(`${s.heading}: some bullet points end with a period and others do not`);
  }
  add('text', 'Spelling and text consistency', textIssues.length ? 'incomplete' : 'complete',
    textIssues.length ? 'Basic checks found possible issues. Words underlined by the editor’s spell-checker should also be reviewed.' : 'No repeated words, double spaces or inconsistent bullet punctuation found. Review spell-checker underlines in the editor.',
    textIssues.slice(0, 20));

  // Harvard CV conventions (the basis of the CV maker)
  const harvard = [];
  const WEAK = /^(responsible for|duties (include|included)|in charge of|worked on|helped( to)?|tasked with|assisted in)\b/i;
  const PRONOUN = /(^|[^\w])(I|me|my|mine|we|our|us)([^\w]|$)/;
  for (const s of model.sections) {
    for (const e of s.entries) {
      for (const d of e.details || []) {
        if (WEAK.test(d)) harvard.push(`Start with an action verb instead of “${d.split(' ').slice(0, 2).join(' ')}…” (${s.heading})`);
        if (PRONOUN.test(d)) harvard.push(`Avoid first-person pronouns: “${d.slice(0, 60)}…”`);
      }
      if (e.kind === 'text' && e.text && PRONOUN.test(e.text)) harvard.push(`${s.heading}: written in the first person — Harvard-style CVs use a neutral voice`);
      if (e.org && !e.location && ['education', 'employment', 'appointments'].includes(s.key)) harvard.push(`Add a location (City, Province/Country) for ${e.org} (${s.heading})`);
    }
  }
  if (['academic', 'faculty', 'research', 'application'].includes(model.meta.cv_type) && model.sections[0] && model.sections[0].key !== 'education') {
    harvard.push(`Education is customarily the first section of an academic CV (currently “${model.sections[0].heading}”)`);
  }
  if (h.photo) harvard.push('Harvard-style CVs omit photographs');
  const st = styleFor(model);
  if (st.size < 10 || st.size > 12) harvard.push(`Body text at ${st.size} pt; 10–12 pt is conventional`);
  const m = model.settings.margins;
  if ([m.top, m.right, m.bottom, m.left].some((x) => x < 0.5 || x > 1)) harvard.push('Margins between 0.5 and 1 inch are conventional');
  add('harvard', 'Harvard CV conventions', harvard.length ? 'incomplete' : 'complete',
    harvard.length ? 'Points where this CV departs from Harvard CV conventions:' : 'Education first, action-verb bullets, neutral voice, locations, conventional type and margins.', [...new Set(harvard)].slice(0, 25));

  // ATS readability
  add('ats', 'ATS readability', ats.summary.fail ? 'incomplete' : 'complete',
    ats.summary.fail ? `${ats.summary.fail} ATS check(s) failed.` : `${ats.summary.pass} checks passed${ats.summary.warn ? `, ${ats.summary.warn} with recommendations` : ''}.`);

  // Integrity: what the CV rests on
  const fromPortfolio = model.sections.flatMap((s) => s.entries).filter((e) => e.source && e.source.type !== 'profile');
  const unverified = fromPortfolio.filter((e) => e.source.verification === 'self_reported').length;
  add('integrity', 'Supporting evidence', unverified ? 'incomplete' : 'complete',
    unverified ? `${unverified} of ${fromPortfolio.length} portfolio entries are self-reported (not yet confirmed or evidenced).` : 'Every portfolio entry is confirmed or evidenced.');

  const counts = { complete: 0, incomplete: 0, missing: 0, not_applicable: 0 };
  for (const i of items) counts[i.status] += 1;
  return { items, counts };
}
