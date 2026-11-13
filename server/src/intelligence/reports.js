// Report generation for Intelligence. A report is built once as a model (summary, detail tables, numbered source
// list) from the analytics engine, then rendered to Word, PDF or a spreadsheet. Every line in a report refers to a
// numbered source record; nothing appears that is not in the database.
import ExcelJS from 'exceljs';
import { Paragraph, TextRun, AlignmentType } from 'docx';
import { HttpError } from '../repo.js';
import { buildDocument, field, h1, h2, p, saveReport, table } from '../academic/docs.js';
import { getInstitution, letterheadFor } from '../academic/institution.js';
import { METRICS, SECTIONS, SUPPORT, analytics, longDate, parseFilters } from './analytics.js';

const ALL = (section) => METRICS.filter((m) => m.section === section).map((m) => m.key);

export const REPORT_TYPES = {
  annual_academic: {
    label: 'Annual Academic Accomplishment Report', short: 'Annual academic accomplishment',
    description: 'Teaching, research, extension and development for a school or calendar year.',
    metrics: [...ALL('academic'), 'research_initiated', 'research_ongoing', 'research_completed', 'publications', 'presentations',
      'extension_projects', 'community_activities', 'trainings_conducted', 'extension_completed', 'awards'],
  },
  faculty_development: {
    label: 'Faculty Development Report', short: 'Faculty development',
    description: 'Trainings, research training, development goals, qualifications, licences and recognition.',
    metrics: ['dev_activities', 'research_training', 'resource_speaker', 'development_goals', 'qualifications', 'licenses', 'awards'],
  },
  research_productivity: {
    label: 'Research Productivity Report', short: 'Research productivity',
    description: 'Projects initiated, ongoing and completed; publications, presentations, collaborations and research training.',
    metrics: ALL('research'),
  },
  extension: {
    label: 'Extension Accomplishment Report', short: 'Extension accomplishment',
    description: 'Extension projects, community activities, trainings conducted, partnerships and completed programs.',
    metrics: ALL('extension'),
  },
  professional_development: {
    label: 'Professional Development Report', short: 'Professional development',
    description: 'Trainings with hours and CPD units, qualifications, licences, memberships, appointments and awards.',
    metrics: ['trainings', 'qualifications', 'licenses', 'memberships', 'appointments', 'employment', 'awards', 'development_goals'],
  },
  portfolio_summary: {
    label: 'Professional Portfolio Summary', short: 'Portfolio summary',
    description: 'Every portfolio category: qualifications, licences, positions, trainings, awards, service and accomplishments.',
    metrics: ALL('portfolio'),
  },
  administrative: {
    label: 'Administrative Accomplishment Report', short: 'Administrative accomplishment',
    description: 'Correspondence handled, meetings, reports prepared, secretariat work and completed administrative tasks.',
    metrics: ALL('admin'),
  },
  custom: {
    label: 'Accomplishment Report', short: 'Custom period-based report',
    description: 'Any combination of sections for any period.',
    metrics: null,
  },
};

const FORMATS = ['docx', 'pdf', 'xlsx'];

/** Build the report model: summary rows, per-metric detail with source references, and the numbered source list. */
export function reportModel(db, userId, body = {}) {
  const def = REPORT_TYPES[body.type];
  if (!def) throw new HttpError(422, 'Choose a report type', { type: 'Unknown report type' });
  if (body.type === 'custom' && (!body.sections || (Array.isArray(body.sections) && !body.sections.length))) {
    throw new HttpError(422, 'Choose at least one section', { sections: 'Choose at least one section' });
  }
  const f = parseFilters({ ...body, sections: body.type === 'custom' ? (Array.isArray(body.sections) ? body.sections.join(',') : body.sections) : undefined });
  const a = analytics(db, userId, { from: f.from, to: f.to, support: f.support, sections: f.sections.join(',') });
  const wanted = def.metrics || METRICS.filter((m) => f.sections.includes(m.section)).map((m) => m.key);
  const metrics = wanted.map((k) => a.sections.flatMap((s) => s.metrics).find((m) => m.key === k)).filter(Boolean);
  if (!metrics.length) throw new HttpError(422, 'Choose at least one section', { sections: 'Choose at least one section' });

  // Number each distinct source record once, in report order.
  const refs = new Map();
  const sources = [];
  for (const m of metrics) for (const s of m.sources) {
    const k = `${s.type}:${s.id}`;
    if (!refs.has(k)) { refs.set(k, sources.length + 1); sources.push({ ref: sources.length + 1, ...s, resource_label: m.resource_label }); }
  }
  const groups = SECTIONS.map((sec) => ({ ...sec, metrics: metrics.filter((m) => m.section === sec.key) })).filter((g) => g.metrics.length);
  const prof = db.prepare('SELECT full_name, professional_title, academic_designation, current_position, current_office, current_institution FROM professional_profiles WHERE user_id = ?').get(userId) || {};
  const inst = getInstitution(db, userId);
  const support = Object.fromEntries(Object.keys(SUPPORT).map((k) => [k, sources.filter((s) => s.support === k).length]));
  return {
    type: body.type, title: def.label, period: a.period, filters: a.filters, generated_at: a.generated_at,
    person: { name: prof.full_name || '', position: prof.current_position || prof.professional_title || '', office: prof.current_office || '', institution: prof.current_institution || inst.university || '' },
    noted_by: inst.dean_name ? { name: inst.dean_name, title: inst.dean_title || 'College Dean' } : null,
    groups: groups.map((g) => ({ key: g.key, code: g.code, label: g.label, metrics: g.metrics.map((m) => ({ ...m, rows: m.sources.map((s) => ({ ...s, ref: refs.get(`${s.type}:${s.id}`) })) })) })),
    sources, support,
  };
}

/** How a source's date is shown: a school year, a date, or why there is none. */
const dateText = (s) => s.date_label || (s.date ? longDate(s.date) : s.dated === false ? '—' : 'Undated');

const supportShort = { evidenced: 'Evidence', confirmed: 'Confirmed', self_reported: 'Self-reported', system: 'In SYNCHRONIA' };
const sumText = (m) => m.sums.filter((s) => s.value).map((s) => `${fmt(s.value)} ${s.unit}`).join('; ');
const fmt = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0+$/, '').replace(/\.$/, ''));
const supportLine = (sp) => Object.entries(sp).filter(([, n]) => n).map(([k, n]) => `${n} ${SUPPORT[k].toLowerCase()}`).join(', ') || 'none';
const rowDetail = (s, units = {}) => [s.group, ...Object.entries(s.values || {}).filter(([, v]) => v != null && v !== 0).map(([k, v]) => `${fmt(v)} ${units[k] || k.replace(/_/g, ' ')}`), s.type === 'extension_projects' && s.extra ? s.extra : null].filter(Boolean).join(' · ');

function intro(model) {
  const n = model.sources.length;
  return n
    ? `This report is generated from ${n} record${n === 1 ? '' : 's'} kept in SYNCHRONIA for the period stated: ${supportLine(model.support)}. `
      + 'Each item cites its source record by number [S#]; the list of sources is at the end. Self-reported items have not been confirmed against evidence.'
    : 'No records fall within the period and sections selected. Nothing has been estimated or added to fill the report.';
}

// ───────────────────────── Word ─────────────────────────

async function toDocx(db, userId, model) {
  const children = [
    field('Name', model.person.name),
    ...(model.person.position ? [field('Position', [model.person.position, model.person.office].filter(Boolean).join(', '))] : []),
    ...(model.person.institution ? [field('Institution', model.person.institution)] : []),
    field('Period', model.period.label),
    ...(model.filters.support !== 'all' ? [field('Included', model.filters.support === 'evidenced' ? 'only records with evidence' : 'confirmed or evidenced records only')] : []),
    new Paragraph({ spacing: { before: 120, after: 120 }, children: [new TextRun({ text: intro(model), italics: true, size: 20 })] }),
    h1('Summary'),
    table([['Indicator', 'Count', 'Totals', 'Support'], ...model.groups.flatMap((g) => g.metrics.map((m) => [m.label, String(m.count), sumText(m) || '—',
      Object.entries(m.support).filter(([, n]) => n).map(([k, n]) => `${n} ${supportShort[k]}`).join(', ') || '—']))],
    { widths: [36, 9, 24, 31], center: [1] }),
  ];
  for (const g of model.groups) {
    children.push(h1(`${g.code}. ${g.label}`));
    for (const m of g.metrics) {
      children.push(h2(`${m.label} (${m.count})`));
      children.push(new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: `Counted by: ${m.basis}.${m.undated ? ` ${m.undated} undated record${m.undated === 1 ? ' was' : 's were'} left out because the period could not be checked.` : ''}`, italics: true, size: 18, color: '555555' })] }));
      if (!m.rows.length) { children.push(p('No records in this period.')); continue; }
      children.push(table([['Ref', 'Record', 'Date', 'Details', 'Support'], ...m.rows.map((s) => [`S${s.ref}`, s.title, dateText(s), rowDetail(s, m.units) || '—', supportShort[s.support] + (s.evidence ? ` (${s.evidence} file${s.evidence > 1 ? 's' : ''})` : '')])],
        { widths: [7, 36, 17, 21, 19], size: 18 }));
    }
  }
  children.push(h1('Source records'));
  children.push(model.sources.length
    ? table([['Ref', 'Record type', 'Title', 'Date', 'Support', 'Record ID'], ...model.sources.map((s) => [`S${s.ref}`, s.resource_label, s.title, dateText(s), SUPPORT[s.support], `${s.type}#${s.id}`])],
      { widths: [7, 17, 36, 15, 15, 10], size: 17 })
    : p('None.'));
  children.push(new Paragraph({ spacing: { before: 480 }, children: [] }));
  children.push(table([
    ['Prepared by:', model.noted_by ? 'Noted by:' : ''],
    ['\n\n', model.noted_by ? '\n\n' : ''],
    [(model.person.name || '').toUpperCase(), model.noted_by ? model.noted_by.name.toUpperCase() : ''],
    [model.person.position || '', model.noted_by ? model.noted_by.title : ''],
  ], { header: false, widths: [50, 50], noBorders: true, boldRow: 2 }));
  return buildDocument({ title: model.title, subtitle: model.period.label, children, letterhead: letterheadFor(db, userId) });
}

// ───────────────────────── Spreadsheet ─────────────────────────

async function toXlsx(model) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'SYNCHRONIA';
  wb.created = new Date(model.generated_at);
  const head = (ws, cols) => {
    ws.columns = cols.map(([header, key, width]) => ({ header, key, width }));
    const r = ws.getRow(1);
    r.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    r.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF5B2BB8' } };
    r.alignment = { vertical: 'middle', wrapText: true };
    ws.views = [{ state: 'frozen', ySplit: 1 }];
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } };
  };
  const wrap = (ws) => ws.eachRow((row, i) => { if (i > 1) row.alignment = { vertical: 'top', wrapText: true }; });

  const sum = wb.addWorksheet('Summary');
  head(sum, [['Section', 'section', 30], ['Indicator', 'label', 44], ['Count', 'count', 9], ['Totals', 'totals', 26], ['Evidence', 'evidenced', 10], ['Confirmed', 'confirmed', 11], ['Self-reported', 'self_reported', 13], ['In SYNCHRONIA', 'system', 14], ['Undated, left out', 'undated', 15], ['Counted by', 'basis', 60]]);
  for (const g of model.groups) for (const m of g.metrics) sum.addRow({ section: `${g.code}. ${g.label}`, label: m.label, count: m.count, totals: sumText(m), ...m.support, undated: m.undated || 0, basis: m.basis });
  sum.addRow({});
  sum.addRow({ section: 'Report', label: model.title });
  sum.addRow({ section: 'Period', label: model.period.label });
  sum.addRow({ section: 'Prepared for', label: [model.person.name, model.person.position].filter(Boolean).join(', ') });
  sum.addRow({ section: 'Generated', label: new Date(model.generated_at).toLocaleString('en-PH') });
  sum.addRow({ section: 'Note', label: intro(model) });
  wrap(sum);

  const rec = wb.addWorksheet('Records');
  head(rec, [['Section', 'section', 26], ['Indicator', 'metric', 34], ['Ref', 'ref', 7], ['Record', 'title', 50], ['Date', 'date', 12], ['Details', 'details', 30], ['Support', 'support', 26], ['Evidence files', 'evidence', 13]]);
  for (const g of model.groups) for (const m of g.metrics) for (const s of m.rows) {
    rec.addRow({ section: `${g.code}. ${g.label}`, metric: m.label, ref: `S${s.ref}`, title: s.title, date: s.date_label || (s.date ? new Date(`${s.date}T00:00:00Z`) : dateText(s)), details: rowDetail(s, m.units), support: SUPPORT[s.support], evidence: s.evidence });
  }
  rec.getColumn('date').numFmt = 'yyyy-mm-dd';
  wrap(rec);

  const src = wb.addWorksheet('Sources');
  head(src, [['Ref', 'ref', 7], ['Record type', 'type', 24], ['Title', 'title', 56], ['Date', 'date', 12], ['Support', 'support', 30], ['Evidence files', 'evidence', 13], ['Record ID', 'id', 22]]);
  for (const s of model.sources) src.addRow({ ref: `S${s.ref}`, type: s.resource_label, title: s.title, date: s.date_label || (s.date ? new Date(`${s.date}T00:00:00Z`) : dateText(s)), support: SUPPORT[s.support], evidence: s.evidence, id: `${s.type}#${s.id}` });
  src.getColumn('date').numFmt = 'yyyy-mm-dd';
  wrap(src);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

// ───────────────────────── PDF ─────────────────────────

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function toHtml(model, letterhead) {
  const img = (part) => (part ? `data:${part.mime};base64,${part.data.toString('base64')}` : null);
  const header = letterhead?.header ? `<img class="lh" src="${img(letterhead.header)}" alt="">${letterhead.office ? `<div class="office">${esc(letterhead.office)}</div>` : ''}${letterhead.contact ? `<div class="contact">${esc(letterhead.contact)}</div>` : ''}` : '';
  const summary = model.groups.flatMap((g) => g.metrics.map((m) => `<tr><td>${esc(m.label)}</td><td class="c">${m.count}</td><td>${esc(sumText(m) || '—')}</td><td>${esc(Object.entries(m.support).filter(([, n]) => n).map(([k, n]) => `${n} ${supportShort[k]}`).join(', ') || '—')}</td></tr>`)).join('');
  const detail = model.groups.map((g) => `<h2>${esc(g.code)}. ${esc(g.label)}</h2>${g.metrics.map((m) => `<h3>${esc(m.label)} (${m.count})</h3><p class="basis">Counted by: ${esc(m.basis)}.${m.undated ? ` ${m.undated} undated record(s) left out because the period could not be checked.` : ''}</p>${m.rows.length
    ? `<table><thead><tr><th class="ref">Ref</th><th>Record</th><th class="d">Date</th><th>Details</th><th class="s">Support</th></tr></thead><tbody>${m.rows.map((s) => `<tr><td>S${s.ref}</td><td>${esc(s.title)}</td><td>${esc(dateText(s))}</td><td>${esc(rowDetail(s, m.units) || '—')}</td><td>${esc(supportShort[s.support])}${s.evidence ? ` (${s.evidence})` : ''}</td></tr>`).join('')}</tbody></table>`
    : '<p>No records in this period.</p>'}`).join('')}`).join('');
  const sources = model.sources.length ? `<table class="src"><thead><tr><th class="ref">Ref</th><th>Record type</th><th>Title</th><th class="d">Date</th><th class="s">Support</th><th>Record ID</th></tr></thead><tbody>${model.sources.map((s) => `<tr><td>S${s.ref}</td><td>${esc(s.resource_label)}</td><td>${esc(s.title)}</td><td>${esc(dateText(s))}</td><td>${esc(SUPPORT[s.support])}</td><td class="mono">${esc(`${s.type}#${s.id}`)}</td></tr>`).join('')}</tbody></table>` : '<p>None.</p>';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(model.title)}</title><style>
@page { size: Letter; margin: 0.8in 0.9in ${letterhead?.footer ? '1.45in' : '0.9in'}; }
body { font-family: "Times New Roman", Times, serif; font-size: 10.5pt; color: #111; }
.lh { width: 100%; display: block; } .office { text-align: center; color: #0070C0; font: italic bold 11pt Arial, sans-serif; margin-top: 4pt; } .contact { text-align: center; color: #0070C0; font: bold 8.5pt Arial, sans-serif; }
h1 { text-align: center; font-size: 15pt; margin: 14pt 0 2pt; } .sub { text-align: center; font-style: italic; margin: 0 0 12pt; }
h2 { font-size: 12pt; text-transform: uppercase; border-bottom: 1pt solid #111; margin: 16pt 0 6pt; break-after: avoid; }
h3 { font-size: 11pt; margin: 10pt 0 2pt; break-after: avoid; } .basis { font-style: italic; color: #555; font-size: 9pt; margin: 0 0 4pt; }
.meta p { margin: 1pt 0; } .intro { font-style: italic; margin: 8pt 0 10pt; }
table { width: 100%; border-collapse: collapse; margin: 4pt 0 8pt; font-size: 9.5pt; } thead { display: table-header-group; } tr { break-inside: avoid; }
th, td { border: 0.6pt solid #888; padding: 3pt 4pt; text-align: left; vertical-align: top; } th { background: #e9e9e9; }
.c { text-align: center; } .ref { width: 34pt; } .d { width: 78pt; } .s { width: 80pt; } .mono { font-family: Consolas, monospace; font-size: 8.5pt; }
.sign { display: flex; gap: 40pt; margin-top: 36pt; break-inside: avoid; } .sign div { flex: 1; } .sign .n { margin-top: 30pt; font-weight: bold; text-transform: uppercase; }
</style></head><body>${header}
<h1>${esc(model.title)}</h1><p class="sub">${esc(model.period.label)}</p>
<div class="meta"><p><b>Name:</b> ${esc(model.person.name || '—')}</p>${model.person.position ? `<p><b>Position:</b> ${esc([model.person.position, model.person.office].filter(Boolean).join(', '))}</p>` : ''}${model.person.institution ? `<p><b>Institution:</b> ${esc(model.person.institution)}</p>` : ''}</div>
<p class="intro">${esc(intro(model))}</p>
<h2>Summary</h2><table><thead><tr><th>Indicator</th><th class="c">Count</th><th>Totals</th><th>Support</th></tr></thead><tbody>${summary}</tbody></table>
${detail}<h2>Source records</h2>${sources}
<div class="sign"><div>Prepared by:<div class="n">${esc(model.person.name || '')}</div><div>${esc(model.person.position || '')}</div></div>${model.noted_by ? `<div>Noted by:<div class="n">${esc(model.noted_by.name)}</div><div>${esc(model.noted_by.title)}</div></div>` : '<div></div>'}</div>
</body></html>`;
}

const PDF_FOOTER = (title, banner) => `<div style="width:100%;font:8px Arial,sans-serif;color:#666;-webkit-print-color-adjust:exact"><div style="display:flex;justify-content:space-between;padding:0 0.9in 4px"><span>${esc(title)}</span><span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>${banner ? `<img src="data:${banner.mime};base64,${banner.data.toString('base64')}" style="display:block;width:100%">` : ''}</div>`;

/** Generate and store a report file. */
export async function generateReport(db, userId, body = {}, { pdfRenderer } = {}) {
  const format = body.format || 'docx';
  if (!FORMATS.includes(format)) throw new HttpError(422, 'Choose Word, PDF or spreadsheet', { format: 'Use docx, pdf or xlsx' });
  if (format === 'pdf' && !pdfRenderer) throw new HttpError(503, 'PDF output is produced by the SYNCHRONIA desktop app.');
  const model = reportModel(db, userId, body);
  let buffer;
  if (format === 'docx') buffer = await toDocx(db, userId, model);
  else if (format === 'xlsx') buffer = await toXlsx(model);
  else {
    const lh = letterheadFor(db, userId);
    buffer = await pdfRenderer(toHtml(model, lh), { title: model.title, footerTemplate: PDF_FOOTER(model.title, lh?.footer) });
  }
  const stamp = model.period.from || model.period.to ? `${model.period.from || 'start'}_to_${model.period.to || 'date'}` : 'to_date';
  const out = saveReport(db, userId, {
    type: `intelligence_${model.type}`, title: `${model.title} — ${model.period.label}`, buffer, format,
    fileStem: `${model.title.replace(/\s+/g, '_')}_${stamp}`, periodStart: model.period.from, periodEnd: model.period.to,
    params: { type: model.type, from: model.period.from, to: model.period.to, sections: model.filters.sections, support: model.filters.support, sources: model.sources.length },
  });
  return { ...out, format, sources: model.sources.length, support: model.support };
}

/** Spreadsheet of the analytics view itself (all selected sections). */
export async function analyticsWorkbook(db, userId, q) {
  const model = reportModel(db, userId, { type: 'custom', from: q.from, to: q.to, support: q.support, sections: q.sections || SECTIONS.map((s) => s.key).join(',') });
  model.title = 'Intelligence Analytics';
  return toXlsx(model);
}
