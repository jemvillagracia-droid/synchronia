// Rich documents edited like a word processor (the editor's ProseMirror/TipTap JSON), shared by syllabi and research
// writing. This module cleans what the editor sends, counts words, and renders the document through the existing
// document engine: Word (docx) paragraphs and tables for buildDocument, and HTML for the PDF renderer.
import { pageSizeCss } from './paper.js';
import { AlignmentType, ImageRun, Paragraph, Table, TableCell, TableRow, TextRun, WidthType, BorderStyle, ShadingType, VerticalAlign } from 'docx';
import { HttpError } from './repo.js';

const BLOCKS = new Set(['image', 'paragraph', 'heading', 'bulletList', 'orderedList', 'listItem', 'table', 'tableRow', 'tableCell', 'tableHeader', 'horizontalRule', 'blockquote']);
const INLINE = new Set(['text', 'hardBreak']);
const MARKS = new Set(['bold', 'italic', 'underline', 'strike']);
const ALIGN = new Set(['left', 'center', 'right', 'justify']);
/** Pictures are kept only when stored in SYNCHRONIA (never outside links). */
export const LOCAL_IMAGE = /^\/api\/doc-images\/\d+$/;
const MAX_BYTES = 5 * 1024 * 1024;

/** Keep only the node types, marks and attributes SYNCHRONIA renders; anything else is dropped or unwrapped. */
export function sanitize(doc) {
  if (!doc || typeof doc !== 'object' || doc.type !== 'doc') throw new HttpError(422, 'The document could not be read.');
  if (JSON.stringify(doc).length > MAX_BYTES) throw new HttpError(413, 'The document is larger than 5 MB.');
  const clean = (n, depth) => {
    if (!n || typeof n !== 'object' || depth > 40) return null;
    if (n.type === 'text') {
      if (typeof n.text !== 'string' || !n.text) return null;
      const marks = (Array.isArray(n.marks) ? n.marks : []).filter((m) => m && MARKS.has(m.type)).map((m) => ({ type: m.type }));
      return { type: 'text', text: n.text.slice(0, 100000), ...(marks.length ? { marks } : {}) };
    }
    if (n.type === 'hardBreak') return { type: 'hardBreak' };
    if (n.type === 'image') {
      const a = n.attrs || {};
      if (!LOCAL_IMAGE.test(String(a.src || ''))) return null;
      const attrs = { src: a.src };
      if (typeof a.alt === 'string' && a.alt.trim()) attrs.alt = a.alt.trim().slice(0, 300);
      const w = Number(a.width);
      if (Number.isFinite(w) && w >= 5 && w <= 100) attrs.width = Math.round(w);
      if (ALIGN.has(a.align) && a.align !== 'left') attrs.align = a.align;
      return { type: 'image', attrs };
    }
    if (!BLOCKS.has(n.type)) {
      // Unknown block: keep its text content as paragraphs rather than losing it.
      const inner = (Array.isArray(n.content) ? n.content : []).map((c) => clean(c, depth + 1)).filter(Boolean);
      return inner.length ? { type: 'paragraph', content: inner.filter((c) => INLINE.has(c.type)) } : null;
    }
    const out = { type: n.type };
    const a = n.attrs || {};
    const attrs = {};
    if (n.type === 'heading') attrs.level = [1, 2, 3].includes(a.level) ? a.level : 2;
    if ((n.type === 'paragraph' || n.type === 'heading') && ALIGN.has(a.textAlign) && a.textAlign !== 'left') attrs.textAlign = a.textAlign;
    if (n.type === 'orderedList' && Number.isInteger(a.start) && a.start > 1) attrs.start = a.start;
    if (n.type === 'tableCell' || n.type === 'tableHeader') {
      if (Number.isInteger(a.colspan) && a.colspan > 1) attrs.colspan = Math.min(a.colspan, 30);
      if (Number.isInteger(a.rowspan) && a.rowspan > 1) attrs.rowspan = Math.min(a.rowspan, 200);
      if (Array.isArray(a.colwidth) && a.colwidth.every((w) => Number.isFinite(w) && w > 0)) attrs.colwidth = a.colwidth.slice(0, 30).map((w) => Math.round(w));
    }
    if (Object.keys(attrs).length) out.attrs = attrs;
    if (Array.isArray(n.content)) {
      const content = n.content.map((c) => clean(c, depth + 1)).filter(Boolean);
      if (content.length) out.content = content;
    }
    return out;
  };
  const content = (Array.isArray(doc.content) ? doc.content : []).map((c) => clean(c, 0)).filter(Boolean);
  return { type: 'doc', content: content.length ? content : [{ type: 'paragraph' }] };
}

/** Plain text of a node (paragraphs separated by newlines). */
export function plainText(n) {
  if (!n) return '';
  if (n.type === 'text') return n.text;
  if (n.type === 'hardBreak') return '\n';
  const inner = (n.content || []).map(plainText);
  return ['doc', 'bulletList', 'orderedList', 'listItem', 'table', 'tableRow', 'blockquote'].includes(n.type) ? inner.join('\n') : inner.join('') + (BLOCKS.has(n.type) ? '\n' : '');
}
export const wordCount = (doc) => (plainText(doc).match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) || []).length;

// ---------- builders (for templates and conversions) ----------
const txt = (t, marks) => (t ? [{ type: 'text', text: String(t), ...(marks ? { marks: marks.map((m) => ({ type: m })) } : {}) }] : undefined);
/** Paragraph from text; line breaks become hard breaks. */
export const para = (t = '', { bold = false, align } = {}) => {
  const parts = String(t ?? '').split('\n');
  const content = parts.flatMap((p, i) => [...(i ? [{ type: 'hardBreak' }] : []), ...(txt(p, bold ? ['bold'] : null) || [])]);
  return { type: 'paragraph', ...(align ? { attrs: { textAlign: align } } : {}), ...(content.length ? { content } : {}) };
};
export const heading = (t, level = 2, align) => ({ type: 'heading', attrs: { level, ...(align ? { textAlign: align } : {}) }, content: txt(t) });
export const bullets = (items) => ({ type: 'bulletList', content: items.map((i) => ({ type: 'listItem', content: [para(i)] })) });
export const numbered = (items) => ({ type: 'orderedList', content: items.map((i) => ({ type: 'listItem', content: [para(i)] })) });
/** Table from rows of cell text; the first row is a header row unless header is false. A cell may be { text, colspan, bold }. */
export const tableOf = (rows, { header = true } = {}) => ({
  type: 'table',
  content: rows.map((r, ri) => ({
    type: 'tableRow',
    content: r.map((c) => {
      const cell = typeof c === 'object' && c !== null ? c : { text: c };
      const attrs = { ...(cell.colspan > 1 ? { colspan: cell.colspan } : {}), ...(cell.rowspan > 1 ? { rowspan: cell.rowspan } : {}), ...(cell.width ? { colwidth: [cell.width] } : {}) };
      return { type: header && ri === 0 ? 'tableHeader' : 'tableCell', ...(Object.keys(attrs).length ? { attrs } : {}),
        content: [para(cell.text ?? '', { bold: !!cell.bold, align: cell.align })] };
    }),
  })),
});

// ---------- Word (docx) ----------
const DOCX_ALIGN = { center: AlignmentType.CENTER, right: AlignmentType.RIGHT, justify: AlignmentType.JUSTIFIED };
const HEAD_SIZE = { 1: 28, 2: 24, 3: 22 };

function runs(nodes = [], base = {}) {
  const out = [];
  for (const n of nodes) {
    if (n.type === 'hardBreak') { out.push(new TextRun({ break: 1, ...base })); continue; }
    if (n.type !== 'text') continue;
    const m = new Set((n.marks || []).map((x) => x.type));
    const parts = n.text.split('\t');
    parts.forEach((p, i) => {
      if (i) out.push(new TextRun({ text: '\t', ...base }));
      if (p) out.push(new TextRun({ text: p, ...base, bold: base.bold || m.has('bold'), italics: m.has('italic'), underline: m.has('underline') ? {} : undefined, strike: m.has('strike') }));
    });
  }
  return out;
}

function blockToDocx(n, ctx) {
  const align = DOCX_ALIGN[n.attrs?.textAlign];
  switch (n.type) {
    case 'paragraph':
      return [new Paragraph({ alignment: align, spacing: { after: ctx.inCell ? 20 : 100 }, indent: ctx.quote ? { left: 567 } : undefined, children: runs(n.content, { size: ctx.size, bold: ctx.bold || undefined }) })];
    case 'heading':
      return [new Paragraph({ alignment: align, keepNext: true, spacing: { before: n.attrs.level === 1 ? 240 : 180, after: 80 },
        children: runs(n.content, { bold: true, size: HEAD_SIZE[n.attrs.level] || 22 }) })];
    case 'image': {
      const img = ctx.image?.(n.attrs.src);
      if (!img) return [new Paragraph({ children: [new TextRun({ text: `[picture: ${n.attrs.alt || 'not available'}]`, italics: true })] })];
      // Fit to the usable width (twips → px at 96 dpi), honouring the width chosen in the editor.
      const maxPx = Math.floor(ctx.width / 15);
      const natural = img.width || maxPx;
      const wantPx = n.attrs.width ? Math.round((maxPx * n.attrs.width) / 100) : Math.min(natural, maxPx);
      const wPx = Math.max(16, Math.min(wantPx, maxPx));
      const hPx = img.width && img.height ? Math.round((wPx * img.height) / img.width) : Math.round(wPx * 0.75);
      return [new Paragraph({ alignment: DOCX_ALIGN[n.attrs.align], spacing: { after: 80 }, children: [new ImageRun({
        type: img.mime === 'image/jpeg' ? 'jpg' : img.mime === 'image/gif' ? 'gif' : 'png', data: img.data,
        transformation: { width: wPx, height: hPx }, altText: { title: n.attrs.alt || 'Picture', description: n.attrs.alt || 'Picture', name: `picture-${img.id}` } })] })];
    }
    case 'horizontalRule':
      return [new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: '000000', space: 1 } }, children: [] })];
    case 'blockquote':
      return (n.content || []).flatMap((c) => blockToDocx(c, { ...ctx, quote: true }));
    case 'bulletList':
    case 'orderedList':
      return listToDocx(n, ctx, 0);
    case 'table':
      return [tableToDocx(n, ctx)];
    default:
      return [];
  }
}

function listToDocx(list, ctx, level) {
  const ordered = list.type === 'orderedList';
  let i = (list.attrs?.start || 1) - 1;
  const out = [];
  for (const item of list.content || []) {
    i += 1;
    (item.content || []).forEach((c, k) => {
      if (c.type === 'bulletList' || c.type === 'orderedList') { out.push(...listToDocx(c, ctx, level + 1)); return; }
      if (c.type !== 'paragraph' && c.type !== 'heading') { out.push(...blockToDocx(c, ctx)); return; }
      const lead = k === 0 ? (ordered ? `${i}.` : '•') : '';
      const left = 360 + level * 360;
      out.push(new Paragraph({ spacing: { after: ctx.inCell ? 20 : 40 }, indent: { left, hanging: k === 0 ? 300 : 0 }, tabStops: [{ type: 'left', position: left }],
        children: [...(lead ? [new TextRun({ text: `${lead}\t`, size: ctx.size })] : []), ...runs(c.content, { size: ctx.size })] }));
    });
  }
  return out;
}

function tableToDocx(t, ctx) {
  const rows = t.content || [];
  // Column count from the widest row (colspans counted); widths from the editor's column widths when present.
  const cols = Math.max(1, ...rows.map((r) => (r.content || []).reduce((s, c) => s + (c.attrs?.colspan || 1), 0)));
  const first = rows.find((r) => (r.content || []).every((c) => !c.attrs?.colspan || c.attrs.colspan === 1)) || rows[0];
  let widths = (first?.content || []).map((c) => c.attrs?.colwidth?.[0] || 0);
  if (widths.length !== cols || widths.some((w) => !w)) widths = Array(cols).fill(1);
  const total = widths.reduce((a, b) => a + b, 0);
  const tw = widths.map((w) => Math.round((w / total) * ctx.width));
  const border = { style: BorderStyle.SINGLE, size: 4, color: '000000' };
  return new Table({
    width: { size: ctx.width, type: WidthType.DXA },
    columnWidths: tw,
    rows: rows.map((r, ri) => {
      let col = 0;
      return new TableRow({
        tableHeader: ri === 0 && (r.content || []).every((c) => c.type === 'tableHeader'),
        cantSplit: false,
        children: (r.content || []).map((c) => {
          const span = c.attrs?.colspan || 1;
          const w = tw.slice(col, col + span).reduce((a, b) => a + b, 0) || Math.round(ctx.width / cols);
          col += span;
          const head = c.type === 'tableHeader';
          const inner = (c.content || []).flatMap((b) => blockToDocx(b, { ...ctx, inCell: true, width: w - 200, size: ctx.cellSize, bold: head }));
          return new TableCell({
            width: { size: w, type: WidthType.DXA }, columnSpan: span > 1 ? span : undefined, rowSpan: c.attrs?.rowspan > 1 ? c.attrs.rowspan : undefined,
            verticalAlign: VerticalAlign.TOP, borders: { top: border, bottom: border, left: border, right: border },
            margins: { top: 40, bottom: 40, left: 80, right: 80 },
            shading: head ? { type: ShadingType.CLEAR, color: 'auto', fill: 'E7E6E6' } : undefined,
            children: inner.length ? inner : [new Paragraph({ children: [] })],
          });
        }),
      });
    }),
  });
}

/** Word paragraphs and tables for buildDocument. width: usable page width in twips; image(src) loads a stored picture. */
export function toDocxChildren(doc, { width = 9360, size = 22, cellSize = 20, image = null } = {}) {
  return (doc.content || []).flatMap((n) => blockToDocx(n, { width, size, cellSize, image }));
}

// ---------- HTML (PDF) ----------
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function inlineHtml(nodes = []) {
  return nodes.map((n) => {
    if (n.type === 'hardBreak') return '<br>';
    if (n.type !== 'text') return '';
    let s = esc(n.text).replace(/\t/g, '&emsp;');
    for (const m of n.marks || []) s = `<${{ bold: 'strong', italic: 'em', underline: 'u', strike: 's' }[m.type]}>${s}</${{ bold: 'strong', italic: 'em', underline: 'u', strike: 's' }[m.type]}>`;
    return s;
  }).join('');
}
function blockHtml(n, image) {
  const st = n.attrs?.textAlign ? ` style="text-align:${n.attrs.textAlign}"` : '';
  const kids = () => (n.content || []).map((c) => blockHtml(c, image)).join('');
  switch (n.type) {
    case 'image': {
      const img = image?.(n.attrs.src);
      if (!img) return `<p><em>[picture: ${esc(n.attrs.alt || 'not available')}]</em></p>`;
      const just = { center: 'center', right: 'right' }[n.attrs.align] || 'left';
      return `<div style="text-align:${just}"><img src="data:${img.mime};base64,${img.data.toString('base64')}" alt="${esc(n.attrs.alt || '')}" style="max-width:100%;${n.attrs.width ? `width:${n.attrs.width}%;` : ''}"></div>`;
    }
    case 'paragraph': return `<p${st}>${inlineHtml(n.content) || '&nbsp;'}</p>`;
    case 'heading': return `<h${n.attrs.level}${st}>${inlineHtml(n.content)}</h${n.attrs.level}>`;
    case 'horizontalRule': return '<hr>';
    case 'blockquote': return `<blockquote>${kids()}</blockquote>`;
    case 'bulletList': return `<ul>${kids()}</ul>`;
    case 'orderedList': return `<ol${n.attrs?.start ? ` start="${n.attrs.start}"` : ''}>${kids()}</ol>`;
    case 'listItem': return `<li>${kids()}</li>`;
    case 'table': {
      // Column widths as set in the editor (or by the export), so PDF matches Word.
      const rows = n.content || [];
      const cols = Math.max(1, ...rows.map((r) => (r.content || []).reduce((t, c) => t + (c.attrs?.colspan || 1), 0)));
      const first = rows.find((r) => (r.content || []).every((c) => !c.attrs?.colspan || c.attrs.colspan === 1)) || rows[0];
      const w = (first?.content || []).map((c) => c.attrs?.colwidth?.[0] || 0);
      if (w.length !== cols || w.some((x) => !x)) return `<table>${kids()}</table>`;
      const total = w.reduce((a, b) => a + b, 0);
      return `<table style="table-layout:fixed"><colgroup>${w.map((x) => `<col style="width:${((x / total) * 100).toFixed(2)}%">`).join('')}</colgroup>${kids()}</table>`;
    }
    case 'tableRow': return `<tr>${kids()}</tr>`;
    case 'tableCell': case 'tableHeader': {
      const tag = n.type === 'tableHeader' ? 'th' : 'td';
      const span = `${n.attrs?.colspan > 1 ? ` colspan="${n.attrs.colspan}"` : ''}${n.attrs?.rowspan > 1 ? ` rowspan="${n.attrs.rowspan}"` : ''}`;
      return `<${tag}${span}>${kids()}</${tag}>`;
    }
    default: return '';
  }
}
export const toHtmlBody = (doc, image = null) => (doc.content || []).map((n) => blockHtml(n, image)).join('\n');

/** A complete printable page for the PDF renderer. */
export function toHtmlPage(doc, { title = '', page = '8.5in 11in', landscape = false, letterhead = null, font = 'Arial', image = null } = {}) {
  const img = (part) => (part ? `<img class="lh" src="data:${part.mime};base64,${part.data.toString('base64')}" alt="">` : '');
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>
@page { size: ${pageSizeCss(page, landscape)}; margin: 0.75in 0.8in 0.9in; }
body { font: 11pt ${font}, Arial, sans-serif; color: #000; margin: 0; }
.lh { display: block; width: 100%; margin-bottom: 10pt; }
h1 { font-size: 14pt; margin: 14pt 0 6pt; } h2 { font-size: 12pt; margin: 12pt 0 5pt; } h3 { font-size: 11pt; margin: 10pt 0 4pt; }
h1, h2, h3 { break-after: avoid; }
p { margin: 0 0 5pt; } ul, ol { margin: 0 0 6pt; padding-left: 22pt; }
table { width: 100%; border-collapse: collapse; margin: 4pt 0 8pt; page-break-inside: auto; }
tr { break-inside: avoid; } th, td { border: 0.75pt solid #000; padding: 3pt 5pt; vertical-align: top; font-size: 10pt; text-align: left; }
th, td { overflow-wrap: anywhere; } /* text that cannot fit its column wraps inside it, never over the next */
th { background: #e7e6e6; -webkit-print-color-adjust: exact; } td p, th p { margin: 0; }
blockquote { margin: 0 0 6pt 24pt; } hr { border: 0; border-top: 0.75pt solid #000; }
</style></head><body>${img(letterhead?.header)}${toHtmlBody(doc, image)}</body></html>`;
}
