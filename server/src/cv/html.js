// Renders the CV document model to print-ready HTML. The PDF is printed from this HTML by Chromium, so the PDF keeps
// real, selectable text in reading order (never an image of the page).
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from '../config.js';
import { contactLines, splitColumnDate } from './contact.js';
import { FONT_STACKS, styleFor } from './templates.js';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function photoDataUri(photo) {
  if (!photo?.path) return null;
  try {
    const file = path.join(DATA_DIR, photo.path);
    return `data:image/jpeg;base64,${fs.readFileSync(file).toString('base64')}`;
  } catch { return null; }
}

function headingCss(st) {
  const base = `font-weight:700;margin:${(1.15 * st.spacing).toFixed(2)}em 0 ${(0.45 * st.spacing).toFixed(2)}em;padding-bottom:2pt;break-after:avoid;color:${st.accent};`;
  switch (st.heading) {
    case 'smallcaps-rule': return `${base}font-variant:small-caps;letter-spacing:.04em;font-size:1.12em;border-bottom:.75pt solid #000;`;
    case 'caps-rule': return `${base}text-transform:uppercase;letter-spacing:.06em;font-size:.98em;border-bottom:.75pt solid #000;`;
    case 'accent-rule': return `${base}text-transform:uppercase;letter-spacing:.08em;font-size:.95em;border-bottom:1pt solid ${st.accent};`;
    default: return `${base}text-transform:uppercase;font-size:1em;`;
  }
}

function entryHtml(e, st) {
  if (e.kind === 'text') return e.text ? `<p class="text">${esc(e.text)}</p>` : '';
  if (e.kind === 'list') return e.items?.length ? `<p class="list">${e.items.map(esc).join('; ')}</p>` : '';
  if (e.kind === 'citation' || (!e.title && e.text)) return `<p class="cite">${esc(e.text || e.title)}</p>`;
  const details = e.details?.length ? `<ul>${e.details.map((d) => `<li>${esc(d)}</li>`).join('')}</ul>` : '';
  const text = e.text ? `<p class="text">${esc(e.text)}</p>` : '';
  let sub = e.subtitle ? `<div class="sub">${esc(e.subtitle)}</div>` : '';
  const note = e.note ? `<div class="note">${esc(e.note)}</div>` : '';
  if (st.layout === 'harvard' && e.org) {
    // Harvard convention: organization (bold) + location on the first line; role or degree (italic) + dates on the second.
    return `<div class="entry"><div class="line1"><span class="t">${esc(e.org)}</span>${e.location ? `<span class="loc">${esc(e.location)}</span>` : ''}</div>`
      + `<div class="line1"><span class="role">${esc(e.role || e.title || '')}</span>${e.dates ? `<span class="d">${esc(e.dates)}</span>` : ''}</div>${note}${details}${text}</div>`;
  }
  if (st.dates === 'column') {
    const cd = splitColumnDate(e.dates);
    if (cd.extra) sub = `${sub}<div class="sub">${esc(cd.extra)}</div>`;
    return `<div class="entry col"><div class="d">${esc(cd.date)}</div><div class="body"><div class="t">${esc(e.title || '')}</div>${sub}${note}${details}${text}</div></div>`;
  }
  if (st.dates === 'line') {
    return `<div class="entry"><div class="t">${esc(e.title || '')}</div>${sub}${e.dates ? `<div class="dl">${esc(e.dates)}</div>` : ''}${note}${details}${text}</div>`;
  }
  return `<div class="entry"><div class="line1"><span class="t">${esc(e.title || '')}</span>${e.dates ? `<span class="d">${esc(e.dates)}</span>` : ''}</div>${sub}${note}${details}${text}</div>`;
}

export function renderHtml(model) {
  const st = styleFor(model);
  const m = st.margins;
  const font = FONT_STACKS[st.font] || FONT_STACKS['Times New Roman'];
  const h = model.header;
  const photo = h.photo ? photoDataUri(h.photo) : null;
  const css = `
@page { size: ${st.page.css}; margin: ${m.top}in ${m.right}in ${Math.max(m.bottom, model.settings.page_numbers ? 0.55 : 0)}in ${m.left}in; }
* { box-sizing: border-box; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { margin: 0; font-family: ${font}; font-size: ${st.size}pt; line-height: ${(1.25 + 0.05 * (st.spacing - 1)).toFixed(2)}; color: #000; background: #fff; }
.cv-head { text-align: ${st.align}; margin-bottom: ${(0.6 * st.spacing).toFixed(2)}em; ${photo ? 'min-height: 1.35in;' : ''} }
.cv-head .photo { float: right; width: 1.15in; height: auto; margin: 0 0 0.1in 0.2in; border: .5pt solid #999; }
.role { font-style: italic; }
.loc { white-space: nowrap; }
.name { font-size: ${st.nameSize || 1.9}em; font-weight: 700; margin: 0 0 2pt; letter-spacing: ${st.heading === 'smallcaps-rule' ? '.02em' : '0'}; color: ${st.accent}; }
/* The name is never small-caps or uppercased: Chromium writes such text into the PDF as capitals, and parsers would read the name in all caps. */
.title { margin: 0 0 2pt; font-size: 1.02em; }
.contact { margin: 0; font-size: .95em; }
.contact .ci { white-space: nowrap; }
h2 { ${headingCss(st)} }
section.pb { break-before: page; }
.entry { margin: 0 0 ${(0.55 * st.spacing).toFixed(2)}em; break-inside: avoid; }
.line1 { display: flex; justify-content: space-between; gap: 12pt; align-items: baseline; }
.t { font-weight: 700; }
.d { white-space: nowrap; }
.dl { font-style: italic; }
.sub { font-style: italic; }
.note { font-size: .92em; }
.col { display: grid; grid-template-columns: 1.45in 1fr; gap: 10pt; }
.col .d { white-space: nowrap; }
ul { margin: 2pt 0 0 0; padding-left: 1.2em; }
li { margin: 0 0 1pt; }
p { margin: 0 0 ${(0.45 * st.spacing).toFixed(2)}em; }
.cite { padding-left: 2em; text-indent: -2em; break-inside: avoid; }
.text { text-align: left; }
`;
  const sepHtml = st.separator ? esc(st.separator).replace(/ /g, '&nbsp;') : ' &nbsp;|&nbsp; ';
  const cLines = contactLines(h.contact, { widthIn: st.page.width - m.left - m.right, sizePt: st.size, sep: st.separator || '  |  ' });
  const contact = cLines.map((line) => line.map((it) => `<span class="ci">${esc(it)}</span>`).join(sepHtml)).join('<br>');
  const head = `<header class="cv-head">${photo ? `<img class="photo" src="${photo}" alt="Photograph of ${esc(h.name || '')}">` : ''}`
    + `<h1 class="name">${esc(h.name || 'Name not recorded')}</h1>${h.title ? `<p class="title">${esc(h.title)}</p>` : ''}`
    + `${contact ? `<p class="contact">${contact}</p>` : ''}</header>`;
  const body = model.sections.map((s) => `<section class="${s.page_break_before ? 'pb' : ''}"><h2>${esc(s.heading)}</h2>${s.entries.map((e) => entryHtml(e, st)).join('')}</section>`).join('\n');
  const title = `${h.name || 'Curriculum Vitae'} — Curriculum Vitae`;
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(title)}</title>`
    + `<meta name="author" content="${esc(h.name || '')}"><meta name="generator" content="SYNCHRONIA"><style>${css}</style></head>`
    + `<body>${head}<main>${body}</main></body></html>`;

  const footerBits = [model.settings.footer_text ? esc(model.settings.footer_text) : '', model.settings.page_numbers ? 'Page <span class="pageNumber"></span> of <span class="totalPages"></span>' : ''].filter(Boolean);
  const footerTemplate = footerBits.length
    ? `<div style="width:100%;font-family:${esc(font)};font-size:8pt;color:#444;padding:0 ${m.left}in;display:flex;justify-content:space-between;"><span>${footerBits.length > 1 ? footerBits[0] : ''}</span><span>${footerBits[footerBits.length - 1]}</span></div>`
    : null;
  return { html, footerTemplate, title };
}
