// Small builder for formal academic Word documents (syllabi, tables of specifications, rubrics, reports).
// Unlike CVs, these documents are expected to contain tables.
import fs from 'node:fs';
import path from 'node:path';
import {
  AlignmentType, BorderStyle, Document, Footer, HeadingLevel, LevelFormat, Packer, PageNumber, Paragraph, ShadingType,
  Table, TableCell, TableLayoutType, TableRow, TextRun, WidthType,
} from 'docx';
import { DATA_DIR } from '../config.js';

const FONT = 'Times New Roman';
const border = { style: BorderStyle.SINGLE, size: 4, color: '808080' };
const borders = { top: border, bottom: border, left: border, right: border };

export const p = (text, opts = {}) => new Paragraph({ spacing: { after: 80 }, ...opts, children: [new TextRun({ text: String(text ?? ''), ...(opts.run || {}) })] });
export const h1 = (text) => new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(text)] });
export const h2 = (text) => new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(text)] });
export const bullet = (text) => new Paragraph({ numbering: { reference: 'doc-bullets', level: 0 }, spacing: { after: 40 }, children: [new TextRun(String(text))] });
export const field = (label, value) => new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: `${label}: `, bold: true }), new TextRun(value == null || value === '' ? '—' : String(value))] });

/** rows: array of arrays of strings; first row is the header. widths: optional percentages. */
export function table(rows, { widths = null, header = true, center = [], contentWidth = 9360 } = {}) {
  const cols = rows[0]?.length || 1;
  const pct = widths || Array(cols).fill(100 / cols);
  // Explicit twip column widths with a fixed layout: honoured by Word and LibreOffice alike.
  const columnWidths = pct.map((w) => Math.round((w / 100) * contentWidth));
  return new Table({
    width: { size: contentWidth, type: WidthType.DXA },
    columnWidths,
    layout: TableLayoutType.FIXED,
    rows: rows.map((r, i) => new TableRow({
      tableHeader: header && i === 0,
      cantSplit: true,
      children: r.map((c, j) => new TableCell({
        borders,
        width: { size: columnWidths[j], type: WidthType.DXA },
        shading: header && i === 0 ? { type: ShadingType.CLEAR, color: 'auto', fill: 'E7E6E6' } : undefined,
        margins: { top: 60, bottom: 60, left: 80, right: 80 },
        children: String(c ?? '').split('\n').map((line) => new Paragraph({
          alignment: center.includes(j) ? AlignmentType.CENTER : AlignmentType.LEFT,
          children: [new TextRun({ text: line, bold: header && i === 0, size: header && i === 0 ? 18 : 20 })],
        })),
      })),
    })),
  });
}

export async function buildDocument({ title, subtitle, children, landscape = false }) {
  const doc = new Document({
    creator: 'SYNCHRONIA', title,
    styles: {
      default: {
        document: { run: { font: FONT, size: 22 }, paragraph: { spacing: { after: 60 } } },
        title: { run: { font: FONT, size: 32, bold: true, color: '000000' }, paragraph: { alignment: AlignmentType.CENTER, spacing: { after: 60 } } },
        heading1: { run: { font: FONT, size: 24, bold: true, allCaps: true, color: '000000' }, paragraph: { spacing: { before: 240, after: 100 }, keepNext: true, border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: '000000', space: 1 } } } },
        heading2: { run: { font: FONT, size: 22, bold: true, color: '000000' }, paragraph: { spacing: { before: 160, after: 60 }, keepNext: true } },
      },
    },
    numbering: { config: [{ reference: 'doc-bullets', levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 360, hanging: 260 } } } }] }] },
    sections: [{
      properties: { page: { size: landscape ? { width: 15840, height: 12240, orientation: 'landscape' } : { width: 12240, height: 15840 }, margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } },
      footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ children: [`${title} · Page `, PageNumber.CURRENT, ' of ', PageNumber.TOTAL_PAGES], size: 16 })] })] }) },
      children: [
        new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun(title)] }),
        ...(subtitle ? [new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 240 }, children: [new TextRun({ text: subtitle, italics: true })] })] : []),
        ...children,
      ],
    }],
  });
  return Packer.toBuffer(doc);
}

/** Save a generated report, record it, and return its download metadata. */
export function saveReport(db, userId, { type, title, buffer, fileStem, periodStart = null, periodEnd = null, params = null }) {
  const dir = path.join(DATA_DIR, 'exports', 'reports');
  fs.mkdirSync(dir, { recursive: true });
  const safe = String(fileStem).normalize('NFKD').replace(/[^\w-]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '').slice(0, 90) || 'report';
  let name = `${safe}_${new Date().toISOString().slice(0, 10)}.docx`;
  for (let i = 2; fs.existsSync(path.join(dir, name)); i += 1) name = name.replace(/(_\d+)?\.docx$/, `_${i}.docx`);
  const rel = path.join('exports', 'reports', name);
  fs.writeFileSync(path.join(DATA_DIR, rel), buffer);
  const r = db.prepare('INSERT INTO reports (user_id, report_type, title, period_start, period_end, format, file_path, params_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(userId, type, title, periodStart, periodEnd, 'docx', rel, params ? JSON.stringify(params) : null);
  return { id: Number(r.lastInsertRowid), file_name: name, download: `/api/academic/reports/${r.lastInsertRowid}/download`, size_bytes: buffer.length };
}
