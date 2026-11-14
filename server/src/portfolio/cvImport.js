// Import an existing CV (PDF or Word) into the Professional Portfolio. The file is read into lines with layout
// cues (bold titles, indented bullets, right-aligned dates, section headings), entries are mapped to portfolio record
// types, and the owner reviews every proposed record before anything is saved. Nothing is inferred beyond what the CV
// says: dates keep their precision (a year stays a year), unknown sections are listed rather than dropped, and every
// imported record is marked self-reported.
import JSZip from 'jszip';
import { HttpError, audit, create, indexProfile } from '../repo.js';
import { tx } from '../db.js';
import { RESOURCES } from '../resources.js';

const T = (k) => RESOURCES[k].table;

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const MON = MONTHS.map((m) => m.slice(0, 3));
const clean = (s) => String(s || '').replace(/\s+/g, ' ').replace(/\s+([,.;:)])/g, '$1').trim();
const BULLET = /^\s*[•●▪◦‣∙·*\-–]\s*/;

// ───────────────────────── Dates ─────────────────────────

/** One date token → ISO with the precision given: '2019', '2025-12' or '2024-07-07'. */
export function parseDate(s) {
  const t = String(s || '').trim().toLowerCase().replace(/(\d)(st|nd|rd|th)\b/g, '$1').replace(/[.,]/g, ' ').replace(/\s+/g, ' ');
  let m;
  if ((m = /^(\d{4})$/.exec(t))) return m[1];
  if ((m = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(t))) return m[3] ? `${m[1]}-${m[2]}-${m[3]}` : `${m[1]}-${m[2]}`;
  const mi = (w) => { const i = MON.indexOf(w.slice(0, 3)); return i < 0 ? null : String(i + 1).padStart(2, '0'); };
  if ((m = /^([a-z]+) (\d{4})$/.exec(t)) && mi(m[1])) return `${m[2]}-${mi(m[1])}`;
  if ((m = /^(\d{1,2}) ([a-z]+) (\d{4})$/.exec(t)) && mi(m[2])) return `${m[3]}-${mi(m[2])}-${m[1].padStart(2, '0')}`;
  if ((m = /^([a-z]+) (\d{1,2}) (\d{4})$/.exec(t)) && mi(m[1])) return `${m[3]}-${mi(m[1])}-${m[2].padStart(2, '0')}`;
  if ((m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t))) return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  return null;
}
const CURRENT = /^(present|current|to date|ongoing|now)$/i;
const DATE_TOKEN = String.raw`(?:\d{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]{3,9}\.?,?\s+\d{4}|[A-Za-z]{3,9}\.?\s+\d{1,2},?\s+\d{4}|[A-Za-z]{3,9}\.?\s+\d{4}|\d{4}(?:-\d{2}){0,2}|\d{1,2}/\d{1,2}/\d{4}|present|current|to date|ongoing|now)`;
const RANGE = new RegExp(`^(${DATE_TOKEN})(?:\\s*(?:–|—|-|to)\\s*(${DATE_TOKEN}))?$`, 'i');
export const isDateLine = (s) => RANGE.test(String(s).trim());

/** "2014 – 2019", "2023 – present", "December 2025", "7th July 2024" → { start, end, current }. */
export function parseRange(s) {
  const m = RANGE.exec(String(s || '').trim());
  if (!m) return null;
  const a = m[1], b = m[2];
  if (CURRENT.test(a)) return { start: null, end: null, current: true };
  const start = parseDate(a);
  if (!b) return { start, end: null, current: false };
  if (CURRENT.test(b)) return { start, end: null, current: true };
  return { start, end: parseDate(b), current: false };
}

// ───────────────────────── Reading the file into lines ─────────────────────────

/** Lines with layout cues from a PDF: bold, indent, size, and dates set apart on the right. */
export async function pdfLines(buffer) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buffer), isEvalSupported: false, disableFontFace: true, useSystemFonts: false, verbosity: 0 }).promise;
  const out = [];
  try {
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      await page.getOperatorList();
      const width = page.getViewport({ scale: 1 }).width;
      const tc = await page.getTextContent();
      const items = tc.items.filter((it) => 'str' in it && it.str.trim()).map((it) => {
        let name = '';
        try { name = page.commonObjs.get(it.fontName)?.name || ''; } catch { name = ''; }
        return { s: it.str, x: it.transform[4], y: it.transform[5], w: it.width, h: Math.abs(it.transform[3]) || it.height, bold: /bold|black|heavy|semibold/i.test(name) };
      });
      // Group into visual lines (same baseline), left to right.
      const rows = [];
      for (const it of items.sort((a, b) => b.y - a.y || a.x - b.x)) {
        const r = rows.find((x) => Math.abs(x.y - it.y) <= 2.5);
        if (r) r.items.push(it); else rows.push({ y: it.y, items: [it] });
      }
      for (const r of rows) r.items.sort((a, b) => a.x - b.x);
      const body = rows.flatMap((r) => r.items).filter((i) => i.h >= 8 && i.h <= 12.5);
      const left = body.length ? Math.min(...body.map((i) => i.x)) : 40;
      for (const r of rows) {
        // Split off a right-hand segment (typically the dates) where there is a wide gap.
        const segs = [[r.items[0]]];
        for (let i = 1; i < r.items.length; i++) {
          const prev = r.items[i - 1];
          if (r.items[i].x - (prev.x + prev.w) > 28) segs.push([r.items[i]]); else segs[segs.length - 1].push(r.items[i]);
        }
        segs.forEach((seg, k) => {
          // Join pieces with a space only where the page shows a gap between them.
          let joined = seg[0].s;
          for (let i = 1; i < seg.length; i++) {
            const gap = seg[i].x - (seg[i - 1].x + seg[i - 1].w);
            joined += (gap > Math.max(1.2, seg[i].h * 0.12) && !/\s$/.test(joined) && !/^\s/.test(seg[i].s) ? ' ' : '') + seg[i].s;
          }
          const t = clean(joined);
          if (!t) return;
          const x = seg[0].x;
          const size = Math.max(...seg.map((i) => i.h));
          const bold = seg.filter((i) => i.bold).reduce((n, i) => n + i.s.length, 0) >= t.replace(/\s/g, '').length * 0.6;
          const rightSide = k > 0 || x > width * 0.62;
          out.push({ text: t, bold, size, indent: !rightSide && x > left + 8, right: rightSide, page: p });
        });
      }
    }
  } finally { await doc.destroy(); }
  return out;
}

const xmlText = (x) => x.replace(/<w:tab\/>/g, '\t').replace(/<w:br[^>]*\/>/g, '\n').replace(/<[^>]+>/g, '')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

/** Lines from a Word document: bold runs, list or indented paragraphs, heading styles, tab-separated dates. */
export async function docxLines(buffer) {
  let zip;
  try { zip = await JSZip.loadAsync(buffer); } catch { throw new HttpError(415, 'That file is not a readable Word (.docx) or PDF document.'); }
  const xml = await zip.file('word/document.xml')?.async('string');
  if (!xml) throw new HttpError(415, 'That file is not a readable Word (.docx) or PDF document.');
  const out = [];
  for (const p of xml.match(/<w:p[ >][\s\S]*?<\/w:p>/g) || []) {
    const runs = p.match(/<w:r[ >][\s\S]*?<\/w:r>/g) || [];
    const parts = runs.map((r) => ({ t: xmlText((r.match(/<w:t[^>]*>[\s\S]*?<\/w:t>|<w:tab\/>|<w:br[^>]*\/>/g) || []).join('')), bold: /<w:b\/>|<w:b w:val="(1|true)"\/>/.test(r), sz: Number((/<w:sz w:val="(\d+)"/.exec(r) || [])[1]) || 0 }));
    const full = parts.map((x) => x.t).join('');
    if (!full.trim()) continue;
    const style = (/<w:pStyle w:val="([^"]+)"/.exec(p) || [])[1] || '';
    const listItem = /<w:numPr>/.test(p);
    const indent = listItem || Number((/<w:ind [^>]*w:left="(\d+)"/.exec(p) || [])[1]) > 200;
    // Judge boldness on the text itself, not on a date set off by a tab at the end of the line.
    const textParts = parts.filter((x) => x.t.trim() && !(/^\t/.test(x.t) && isDateLine(x.t.trim())) && !isDateLine(x.t.trim()));
    const letters = textParts.reduce((n, x) => n + x.t.replace(/\s/g, '').length, 0);
    const bold = letters > 0 && textParts.filter((x) => x.bold).reduce((n, x) => n + x.t.replace(/\s/g, '').length, 0) >= letters * 0.6;
    const size = Math.max(0, ...parts.map((x) => x.sz)) / 2 || 11;
    const heading = /^Heading|^Title/i.test(style);
    for (const [k, seg] of full.split('\n').entries()) {
      const cells = seg.split(/\t+/).map(clean).filter(Boolean);
      if (!cells.length) continue;
      const last = cells[cells.length - 1];
      if (cells.length > 1 && isDateLine(last)) {
        out.push({ text: cells.slice(0, -1).join(' '), bold, size: heading ? 14 : size, indent: indent || k > 0, right: false });
        out.push({ text: last, bold: false, size, indent: false, right: true });
      } else out.push({ text: cells.join(' '), bold, size: heading ? 14 : size, indent: indent || k > 0, right: false, bullet: listItem && k === 0 });
    }
  }
  return out;
}

// ───────────────────────── Structure: header, sections, entries ─────────────────────────

const isHeading = (l, body) => {
  const letters = l.text.replace(/[^A-Za-z]/g, '');
  return letters.length >= 5 && l.text === l.text.toUpperCase() && !/\d{4}/.test(l.text) && !l.right && !BULLET.test(l.text) && (l.size >= body + 1.5 || (l.bold && !l.indent)) && l.text.length <= 70;
};

export function structure(lines) {
  const sizes = lines.map((l) => Math.round(l.size)).filter(Boolean);
  const body = sizes.sort((a, b) => sizes.filter((x) => x === a).length - sizes.filter((x) => x === b).length).pop() || 11;
  const first = lines.findIndex((l) => isHeading(l, body));
  const head = lines.slice(0, first < 0 ? 0 : first).map((l) => l.text);
  const sections = [];
  let sec = null;
  let entry = null;
  const startEntry = (title) => { entry = { title, sub: [], dates: [], details: [] }; sec.entries.push(entry); };
  for (const l of lines.slice(first < 0 ? lines.length : first)) {
    if (isHeading(l, body)) { sec = { heading: clean(l.text.replace(/^[^A-Za-z]+/, '')), entries: [] }; sections.push(sec); entry = null; continue; }
    if (!sec) continue;
    const text = l.text;
    if (l.right || (!l.indent && isDateLine(text))) { if (!entry) startEntry(''); entry.dates.push(text); continue; }
    if (l.indent || BULLET.test(text)) {
      if (!entry) startEntry('');
      const bullet = l.bullet || BULLET.test(text);
      const t = clean(text.replace(BULLET, ''));
      if (!t) continue;
      if (bullet || !entry.details.length) entry.details.push(t); else entry.details[entry.details.length - 1] += ` ${t}`;
      continue;
    }
    // Left-aligned text: a bold line is a title (consecutive bold lines are one wrapped title); regular text is the
    // organisation/subtitle line, or the title itself when the CV does not use bold.
    if (l.bold) {
      // Dates are often printed beside a title's first line, so a title can continue after its date.
      if (!entry || entry.sub.length || entry.details.length || !entry.title) startEntry(clean(text));
      else entry.title = clean(`${entry.title} ${text}`);
    } else if (!entry || !entry.title) {
      if (entry && !entry.title) entry.title = clean(text); else startEntry(clean(text));
    } else if (entry.details.length && entry.dates.length) startEntry(clean(text));
    else entry.sub.push(clean(text));
  }
  return { head, sections };
}

// ───────────────────────── Mapping entries to portfolio records ─────────────────────────

const RULES = [
  [/LITERARY|ANTHOLOG|CREATIVE WORK|CREATIVE WRITING/i, 'literary'],
  [/RESEARCH|PUBLICATION|SCHOLARLY/i, 'research'],
  [/PROJECT.?BASED/i, 'project'],
  [/INTERN|PRACTICUM|ON.?THE.?JOB/i, 'internship'],
  [/EXPERIENCE|EMPLOYMENT|WORK HISTORY|CAREER/i, 'employment'],
  [/EDUCATION|ACADEMIC BACKGROUND|QUALIFICATION/i, 'education'],
  [/LICEN[CS]E|ELIGIBILIT|PRC|REGISTRATION/i, 'licenses'],
  [/CERTIFICATION/i, 'certifications'],
  [/SPEAKER|SPEAKERSHIP|INVITED|TALKS|LECTURES GIVEN|RESOURCE PERSON/i, 'speaking'],
  [/SEMINAR|TRAINING|WORKSHOP|CONFERENCE|PROFESSIONAL DEVELOPMENT/i, 'trainings'],
  [/STUDENT ORGANI|LEADERSHIP|EXTRA.?CURRICULAR|CO.?CURRICULAR/i, 'student_orgs'],
  [/ORGANI[SZ]ATION|MEMBERSHIP|AFFILIATION|ASSOCIATION/i, 'memberships'],
  [/AWARD|HONOU?R|RECOGNITION|ACHIEVEMENT/i, 'awards'],
  [/REFERENCE/i, 'skip_references'],
  [/SKILL|COMPETENC|LANGUAGE|INTEREST/i, 'skip_skills'],
];
const kindOf = (heading) => (RULES.find(([re]) => re.test(heading)) || [null, 'unknown'])[1];

function dates(e) {
  for (const d of e.dates) { const r = parseRange(d); if (r) return r; }
  return { start: null, end: null, current: false };
}
const note = (e, extra = []) => [...extra, ...e.details].filter(Boolean).join('\n') || null;

function mapEntry(kind, e, owner) {
  const d = dates(e);
  const missing = [];
  const need = (v, field) => { if (!v) missing.push(field); return v || ''; };
  switch (kind) {
    case 'education':
      return { resource: 'education', values: { degree: need(e.title, 'degree'), institution: need(e.sub[0], 'institution'), start_date: d.start, end_date: d.current ? null : d.end,
        graduation_date: d.current ? null : (d.end || null), status: d.current ? 'ongoing' : 'completed', distinctions: e.details.join('\n') || null }, missing };
    case 'employment': case 'project': case 'internship':
      return { resource: 'employment', values: { position: need(e.title, 'position'), institution: need(e.sub[0], 'institution'), office: e.sub[1] || null,
        employment_type: kind === 'project' ? 'Project-based' : kind === 'internship' ? 'Internship' : null,
        start_date: d.start, end_date: d.current ? null : d.end, is_current: d.current, responsibilities: e.details.join('\n') || null }, missing };
    case 'licenses':
      return { resource: 'licenses', values: { license_type: need(e.title, 'license_type'), issuing_authority: need(e.sub[0], 'issuing_authority'), registration_date: d.start || d.end }, missing };
    case 'certifications': case 'trainings': case 'speaking':
      return { resource: 'trainings', values: { title: need(e.title, 'title'), organizer: e.sub[0] || null, location: e.sub[1] || null,
        training_type: kind === 'certifications' ? 'certification' : 'seminar', role: kind === 'speaking' ? 'speaker' : 'participant',
        start_date: d.start, end_date: d.current ? null : d.end, notes: note(e) }, missing };
    case 'memberships': case 'student_orgs': {
      const roles = e.details.filter((x) => /\b(president|vice|secretary|treasurer|director|member|officer|staff|chair|head|coordinator|representative)\b/i.test(x) && x.length < 90);
      return { resource: 'memberships', values: { organization: need(e.title, 'organization'),
        membership_type: e.sub.find((x) => !/universit|college|school|department/i.test(x)) || roles.join('; ') || null,
        start_date: d.start, end_date: d.current ? null : d.end, is_current: d.current || null,
        notes: note(e, e.sub.filter((x) => /universit|college|school|department/i.test(x))) }, missing };
    }
    case 'awards':
      return { resource: 'awards', values: { title: need(e.title, 'title'), issuer: e.sub[0] || null, date_received: d.start || d.end, description: e.details.join('\n') || null }, missing };
    case 'research': {
      const all = e.details.join('\n');
      const doi = (/(?:https?:\/\/(?:dx\.)?doi\.org\/)?(10\.\d{4,9}\/[^\s;,]+)/i.exec(all) || [])[1] || null;
      const roleLine = e.details.find((x) => /author|assistant|investigator|researcher|working with/i.test(x)) || '';
      const withWhom = (/working with (.+)$/i.exec(roleLine) || [])[1];
      const venueLine = e.details.find((x) => doi && x.includes(doi.slice(0, 12)));
      const venue = venueLine ? clean(venueLine.split(/;|https?:/)[0]) || null : null;
      const forthcoming = /for publication|forthcoming|under review|submitted|in press/i.test(all);
      return { resource: 'publications', values: { title: need(e.title, 'title'),
        authors: need(withWhom ? [owner, ...clean(withWhom).replace(/\([^)]*\)/g, '').split(/,\s*and\s+|,\s*|\s+and\s+/).map((x) => clean(x)).filter(Boolean)].join('; ') : owner, 'authors'),
        publication_type: 'other', venue, doi, status: doi ? 'published' : forthcoming ? (/under review/i.test(all) ? 'under_review' : /submitted/i.test(all) ? 'submitted' : 'in_preparation') : 'in_preparation',
        publication_date: d.start || null, notes: note(e) }, missing,
      hint: 'Authors are taken from the CV text (“working with …”). Check the exact author order before using this in a citation.' };
    }
    case 'literary': {
      const piece = e.details.map((x) => /["“]([^"”]+)["”]/.exec(x)).find(Boolean);
      const byline = e.details.map((x) => /as (?:author name|penname|pen name|pseudonym)\s+(.+)$/i.exec(x)).find(Boolean);
      const isbns = e.details.filter((x) => /ISBN/i.test(x));
      return { resource: 'publications', values: { title: need(piece ? piece[1] : e.title, 'title'), authors: need(byline ? clean(byline[1]) : owner, 'authors'),
        publication_type: 'book_chapter', venue: piece ? e.title : null, publisher: e.sub[0] || null, publication_date: d.start, status: 'published',
        notes: isbns.length ? isbns.join('\n') : null }, missing };
    }
    default: return null;
  }
}

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
function duplicateOf(db, userId, item) {
  const v = item.values;
  const q = {
    education: ['SELECT id, degree AS t, institution AS u FROM ' + T('education') + ' WHERE user_id = ? AND deleted_at IS NULL', (r) => norm(r.t) === norm(v.degree) && norm(r.u) === norm(v.institution)],
    employment: ['SELECT id, position AS t, institution AS u, start_date AS d FROM ' + T('employment') + ' WHERE user_id = ? AND deleted_at IS NULL', (r) => norm(r.t) === norm(v.position) && norm(r.u) === norm(v.institution)],
    licenses: ['SELECT id, license_type AS t FROM ' + T('licenses') + ' WHERE user_id = ? AND deleted_at IS NULL', (r) => norm(r.t) === norm(v.license_type)],
    trainings: ['SELECT id, title AS t, start_date AS d FROM ' + T('trainings') + ' WHERE user_id = ? AND deleted_at IS NULL', (r) => norm(r.t) === norm(v.title) && (!r.d || !v.start_date || r.d.slice(0, 4) === v.start_date.slice(0, 4))],
    memberships: ['SELECT id, organization AS t FROM ' + T('memberships') + ' WHERE user_id = ? AND deleted_at IS NULL', (r) => norm(r.t) === norm(v.organization)],
    awards: ['SELECT id, title AS t FROM ' + T('awards') + ' WHERE user_id = ? AND deleted_at IS NULL', (r) => norm(r.t) === norm(v.title)],
    publications: ['SELECT id, title AS t FROM ' + T('publications') + ' WHERE user_id = ? AND deleted_at IS NULL', (r) => norm(r.t) === norm(v.title)],
  }[item.resource];
  if (!q) return null;
  return db.prepare(q[0]).all(userId).find(q[1])?.id || null;
}

/** Read a CV file and propose profile details and portfolio records for review. Saves nothing. */
export async function previewCv(db, userId, buffer, fileName = 'cv') {
  if (!Buffer.isBuffer(buffer) || buffer.length < 100) throw new HttpError(422, 'Choose a CV file (PDF or Word .docx).');
  const isPdf = buffer.subarray(0, 5).toString('latin1') === '%PDF-';
  const isZip = buffer[0] === 0x50 && buffer[1] === 0x4b;
  if (!isPdf && !isZip) throw new HttpError(415, 'That file is not a PDF or Word (.docx) document.');
  let lines;
  try { lines = isPdf ? await pdfLines(buffer) : await docxLines(buffer); } catch (e) { if (e instanceof HttpError) throw e; throw new HttpError(422, 'The file could not be read. If it is a scanned image, SYNCHRONIA cannot read its text.'); }
  if (lines.length < 5) throw new HttpError(422, 'Very little text could be read from this file. If it is a scanned image, export the CV as a text PDF or Word document instead.');
  const { head, sections } = structure(lines);
  const prof = db.prepare('SELECT * FROM professional_profiles WHERE user_id = ?').get(userId) || {};
  const headText = head.join(' \n ');
  const email = (/[\w.+-]+@[\w-]+\.[\w.-]+/.exec(headText) || [])[0] || null;
  const phone = (/(?:\+?63|0)9\d{2}[\s-]?\d{3}[\s-]?\d{4}|\+?\d[\d\s()-]{8,}\d/.exec(headText.replace(email || '', '')) || [])[0] || null;
  const urls = [...headText.matchAll(/(?:https?:\/\/)?(?:www\.)?[\w-]+(?:\.[\w-]+)+\/?[^\s,]*/g)].map((m) => m[0]).filter((u) => !u.includes('@') && /[a-z]{2,}\.[a-z]{2,}/i.test(u) && !/^\d/.test(u));
  const address = clean(head.slice(1).join(' ').replace(email || '\u0000', '').replace(phone || '\u0000', '').replace(/(?:https?:\/\/)?(?:www\.)?[\w-]+(?:\.[\w-]+)+\/?[^\s,]*/g, (u) => (urls.includes(u) ? '' : u))) || null;
  const found = { full_name: head[0] ? clean(head[0]) : null, email, phone: phone ? clean(phone) : null, address, website: urls.find((u) => !/linkedin/i.test(u)) || urls[0] || null };
  const owner = (found.full_name || prof.full_name || '').split(',')[0].trim() || 'Owner';
  const profile = Object.entries(found).filter(([, v]) => v).map(([field, value]) => ({ field, value, current: prof[field] || null, apply: !prof[field] }));
  if (urls.length > 1) profile.push({ field: 'website', value: urls.filter((u) => u !== found.website).join(' '), current: prof.website || null, apply: false, note: 'Additional link from the CV header' });

  const items = [];
  const skipped = [];
  for (const s of sections) {
    const kind = kindOf(s.heading);
    if (kind.startsWith('skip') || kind === 'unknown') {
      skipped.push({ heading: s.heading, reason: kind === 'skip_references' ? 'References name other people; add them yourself if you want them in a CV.' : kind === 'skip_skills' ? 'Skills and languages are not separate portfolio records; add them to your profile or a CV section.' : 'This section was not recognised.', lines: s.entries.flatMap((e) => [e.title, ...e.sub, ...e.dates, ...e.details]).filter(Boolean) });
      continue;
    }
    for (const e of s.entries) {
      if (!e.title && !e.sub.length) continue;
      const m = mapEntry(kind, e, owner);
      if (!m) continue;
      const item = { key: `${items.length}`, section: s.heading, resource: m.resource, values: Object.fromEntries(Object.entries(m.values).filter(([, v]) => v !== null && v !== '' && v !== undefined)),
        missing: m.missing, hint: m.hint || null, source: [e.title, ...e.sub, ...e.dates, ...e.details.map((x) => `• ${x}`)].filter(Boolean) };
      item.duplicate_of = duplicateOf(db, userId, item);
      item.include = !item.duplicate_of && !item.missing.length;
      items.push(item);
    }
  }
  return { source: String(fileName).split(/[\\/]/).pop().slice(0, 200), format: isPdf ? 'pdf' : 'docx', profile, items, skipped,
    counts: Object.fromEntries([...new Set(items.map((i) => i.resource))].map((r) => [r, items.filter((i) => i.resource === r).length])) };
}

const ALLOWED = new Set(['education', 'employment', 'licenses', 'trainings', 'memberships', 'awards', 'publications']);
const PROFILE_KEYS = ['full_name', 'email', 'phone', 'address', 'website'];

/** Save the reviewed items. All-or-nothing; each record is marked self-reported and notes where it came from. */
export function commitCv(db, userId, body = {}) {
  const items = (Array.isArray(body.items) ? body.items : []).filter((i) => i && i.include);
  const profile = (Array.isArray(body.profile) ? body.profile : []).filter((p) => p && p.apply && PROFILE_KEYS.includes(p.field));
  if (!items.length && !profile.length) throw new HttpError(422, 'Nothing selected to import.');
  const source = String(body.source || 'CV').slice(0, 200);
  const created = {};
  const failures = [];
  tx(db, () => {
    for (const it of items) {
      if (!ALLOWED.has(it.resource)) throw new HttpError(422, `Unknown record type: ${it.resource}`);
      const values = { ...it.values, verification: 'self_reported' };
      const tag = `Imported from ${source}.`;
      if (it.resource !== 'education' && it.resource !== 'licenses') values.notes = values.notes ? `${values.notes}\n${tag}` : tag;
      else values.notes = tag;
      if (it.resource === 'education' && values.distinctions && values.notes) { /* distinctions kept in their own field */ }
      try { create(db, userId, it.resource, values); created[it.resource] = (created[it.resource] || 0) + 1; }
      catch (e) { failures.push({ key: it.key, title: Object.values(it.values)[0], error: e.message, details: e.details || null }); }
    }
    if (failures.length) { const e = new HttpError(422, `${failures.length} item${failures.length > 1 ? 's' : ''} could not be saved. Nothing was imported; fix them and try again.`, { failures }); throw e; }
    if (profile.length) {
      const sets = Object.fromEntries(profile.map((p) => [p.field, String(p.value).slice(0, p.field === 'address' ? 500 : 200)]));
      const exists = db.prepare('SELECT id FROM professional_profiles WHERE user_id = ?').get(userId);
      if (!exists) db.prepare('INSERT INTO professional_profiles (user_id) VALUES (?)').run(userId);
      db.prepare(`UPDATE professional_profiles SET ${Object.keys(sets).map((k) => `${k} = ?`).join(', ')}, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE user_id = ?`).run(...Object.values(sets), userId);
      indexProfile(db, userId);
    }
    audit(db, userId, 'portfolio', null, 'create', `Imported ${items.length} record(s)${profile.length ? ' and profile details' : ''} from ${source}`);
  });
  return { created, profile_updated: profile.map((p) => p.field) };
}
