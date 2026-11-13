// Builds a genuine, editable Word document from the CV model: native Heading 1 / Title styles, real bullet lists,
// tab-stop aligned dates (no layout tables or text boxes), page numbers in the footer only.
import fs from 'node:fs';
import path from 'node:path';
import {
  AlignmentType, BorderStyle, Document, Footer, HeadingLevel, ImageRun, LevelFormat, Packer, PageNumber, Paragraph, Tab, TabStopType, TextRun,
} from 'docx';
import { DATA_DIR } from '../config.js';
import { styleFor } from './templates.js';

const TWIP = 1440;
const PAGE_TWIPS = { letter: [12240, 15840], a4: [11906, 16838], folio: [12240, 18720] };
const hex = (c) => (c || '#000000').replace('#', '').toUpperCase();

export async function buildDocx(model) {
  const st = styleFor(model);
  const s = model.settings;
  const [pw, ph] = PAGE_TWIPS[s.page_size] || PAGE_TWIPS.letter;
  const m = st.margins;
  const contentWidth = pw - Math.round((m.left + m.right) * TWIP);
  const half = (pt) => Math.round(pt * 2);
  const sp = (pt) => Math.round(pt * 20 * st.spacing); // points → twentieths, scaled by spacing
  const dateCol = Math.round(1.3 * TWIP);

  const headingRun = {
    bold: true,
    color: hex(st.accent),
    size: half(st.size * (st.heading === 'smallcaps-rule' ? 1.12 : 1)),
    smallCaps: st.heading === 'smallcaps-rule',
    allCaps: st.heading !== 'smallcaps-rule',
  };
  const ruled = st.heading !== 'caps';

  const children = [];
  const h = model.header;

  if (h.photo?.path) {
    try {
      const data = fs.readFileSync(path.join(DATA_DIR, h.photo.path));
      const ratio = h.photo.height && h.photo.width ? h.photo.height / h.photo.width : 1.25;
      children.push(new Paragraph({
        alignment: AlignmentType.RIGHT,
        children: [new ImageRun({
          type: 'jpg', data, transformation: { width: 110, height: Math.round(110 * ratio) },
          altText: { title: 'Photograph', description: `Photograph of ${h.name || ''}`, name: 'photo' },
        })],
      }));
    } catch { /* photo file missing: skip */ }
  }

  const align = st.align === 'center' ? AlignmentType.CENTER : AlignmentType.LEFT;
  children.push(new Paragraph({ heading: HeadingLevel.TITLE, alignment: align, children: [new TextRun({ text: h.name || 'Name not recorded' })] }));
  if (h.title) children.push(new Paragraph({ alignment: align, spacing: { after: 40 }, children: [new TextRun(h.title)] }));
  if (h.contact.length) children.push(new Paragraph({ alignment: align, spacing: { after: sp(8) }, children: [new TextRun(h.contact.join(st.separator || '  |  '))] }));

  const P = (o) => o; // paragraph options; converted to Paragraph objects at the end
  const bullet = (text, indentLeft = 0) => P({
    numbering: { reference: 'cv-bullets', level: 0 },
    indent: indentLeft ? { left: indentLeft + 360, hanging: 260 } : undefined,
    spacing: { after: 20 },
    children: [new TextRun(text)],
  });

  for (const sec of model.sections) {
    children.push(P({ heading: HeadingLevel.HEADING_1, pageBreakBefore: !!sec.page_break_before, children: [new TextRun(sec.heading)] }));
    for (const e of sec.entries) {
      if (e.kind === 'text') { if (e.text) children.push(P({ spacing: { after: sp(6) }, children: [new TextRun(e.text)] })); continue; }
      if (e.kind === 'list') { if (e.items?.length) children.push(P({ spacing: { after: sp(6) }, children: [new TextRun(e.items.join('; '))] })); continue; }
      if (e.kind === 'citation' || (!e.title && e.text)) {
        children.push(P({ indent: { left: 720, hanging: 720 }, spacing: { after: sp(6) }, keepLines: true, children: [new TextRun(e.text || e.title)] }));
        continue;
      }
      const after = sp(7);
      if (st.layout === 'harvard' && e.org) {
        const tabs = [{ type: TabStopType.RIGHT, position: contentWidth }];
        children.push(P({ tabStops: tabs, keepNext: true, children: [new TextRun({ text: e.org, bold: true }), ...(e.location ? [new TextRun({ children: [new Tab(), e.location] })] : [])] }));
        children.push(P({ tabStops: tabs, keepNext: !!(e.details?.length), children: [new TextRun({ text: e.role || e.title || '', italics: true }), ...(e.dates ? [new TextRun({ children: [new Tab(), e.dates] })] : [])] }));
        if (e.note) children.push(P({ children: [new TextRun({ text: e.note, size: half(st.size * 0.92) })] }));
        for (const d of e.details || []) children.push(bullet(d));
        if (e.text) children.push(P({ children: [new TextRun(e.text)] }));
      } else if (st.dates === 'column') {
        const ind = { left: dateCol, hanging: dateCol };
        children.push(P({
          indent: ind, tabStops: [{ type: TabStopType.LEFT, position: dateCol }], keepNext: true, spacing: { after: 0 },
          children: [new TextRun(e.dates || ''), new TextRun({ children: [new Tab(), e.title || ''], bold: true })],
        }));
        const rest = [];
        if (e.subtitle) rest.push(P({ indent: { left: dateCol }, children: [new TextRun({ text: e.subtitle, italics: true })] }));
        if (e.note) rest.push(P({ indent: { left: dateCol }, children: [new TextRun(e.note)] }));
        for (const d of e.details || []) rest.push(bullet(d, dateCol));
        if (e.text) rest.push(P({ indent: { left: dateCol }, children: [new TextRun(e.text)] }));
        children.push(...rest);
      } else if (st.dates === 'line') {
        children.push(P({ keepNext: true, children: [new TextRun({ text: e.title || '', bold: true })] }));
        if (e.subtitle) children.push(P({ keepNext: true, children: [new TextRun(e.subtitle)] }));
        if (e.dates) children.push(P({ keepNext: !!(e.details?.length || e.note), children: [new TextRun({ text: e.dates, italics: true })] }));
        if (e.note) children.push(P({ children: [new TextRun(e.note)] }));
        for (const d of e.details || []) children.push(bullet(d));
        if (e.text) children.push(P({ children: [new TextRun(e.text)] }));
      } else {
        children.push(P({
          tabStops: [{ type: TabStopType.RIGHT, position: contentWidth }], keepNext: true,
          children: [new TextRun({ text: e.title || '', bold: true }), ...(e.dates ? [new TextRun({ children: [new Tab(), e.dates] })] : [])],
        }));
        if (e.subtitle) children.push(P({ keepNext: !!(e.details?.length), children: [new TextRun({ text: e.subtitle, italics: true })] }));
        if (e.note) children.push(P({ children: [new TextRun({ text: e.note, size: half(st.size * 0.92) })] }));
        for (const d of e.details || []) children.push(bullet(d));
        if (e.text) children.push(P({ children: [new TextRun(e.text)] }));
      }
      // spacing after each entry goes on its last paragraph (no empty spacer paragraphs)
      const last = children[children.length - 1];
      if (last && !(last instanceof Paragraph)) last.spacing = { ...(last.spacing || {}), after };
    }
  }

  const footerParts = [];
  if (s.footer_text) footerParts.push(new TextRun(`${s.footer_text}    `));
  if (s.page_numbers) footerParts.push(new TextRun({ children: ['Page ', PageNumber.CURRENT, ' of ', PageNumber.TOTAL_PAGES] }));

  const doc = new Document({
    creator: h.name || 'SYNCHRONIA',
    title: `${h.name || 'Curriculum Vitae'} — Curriculum Vitae`,
    description: `${model.meta.template_name} · generated by SYNCHRONIA`,
    // Override the built-in Title / Heading 1 definitions (never add duplicate style ids: Word honours the first one).
    styles: {
      default: {
        document: { run: { font: st.font, size: half(st.size) }, paragraph: { spacing: { after: 20, line: Math.round(240 * (1.05 + 0.05 * (st.spacing - 1))) } } },
        title: {
          run: { font: st.font, size: half(st.size * (st.nameSize || 1.9)), bold: true, color: hex(st.accent) },
          paragraph: { spacing: { after: 40 } },
        },
        heading1: {
          run: { font: st.font, ...headingRun },
          paragraph: {
            keepNext: true, keepLines: true, spacing: { before: sp(13), after: sp(5) },
            border: ruled ? { bottom: { style: BorderStyle.SINGLE, size: 6, color: hex(st.heading === 'accent-rule' ? st.accent : '#000000'), space: 1 } } : undefined,
          },
        },
      },
    },
    numbering: {
      config: [{
        reference: 'cv-bullets',
        levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 360, hanging: 260 } } } }],
      }],
    },
    sections: [{
      properties: {
        page: {
          size: { width: pw, height: ph },
          margin: { top: Math.round(m.top * TWIP), right: Math.round(m.right * TWIP), bottom: Math.round(m.bottom * TWIP), left: Math.round(m.left * TWIP), footer: 360 },
        },
      },
      footers: footerParts.length ? { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: footerParts })] }) } : undefined,
      children: children.map((c) => (c instanceof Paragraph ? c : new Paragraph(c))),
    }],
  });
  return Packer.toBuffer(doc);
}
