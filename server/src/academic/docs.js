// Small builder for formal academic Word documents (syllabi, tables of specifications, rubrics, reports).
// Unlike CVs, these documents are expected to contain tables.
import fs from 'node:fs';
import path from 'node:path';
import {
  AlignmentType, BorderStyle, Document, Footer, Header, HeadingLevel, HorizontalPositionAlign, HorizontalPositionRelativeFrom, ImageRun,
  LevelFormat, Packer, PageNumber, Paragraph, ShadingType, Table, TableCell, TableLayoutType, TableRow, TextRun, TextWrappingType,
  VerticalPositionRelativeFrom, WidthType,
} from 'docx';
import { DATA_DIR } from '../config.js';
import { indexReport } from '../repo.js';

const FONT = 'Times New Roman';
const border = { style: BorderStyle.SINGLE, size: 4, color: '808080' };
const borders = { top: border, bottom: border, left: border, right: border };

export const p = (text, opts = {}) => new Paragraph({ spacing: { after: 80 }, ...opts, children: [new TextRun({ text: String(text ?? ''), ...(opts.run || {}) })] });
export const h1 = (text) => new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(text)] });
export const h2 = (text) => new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(text)] });
export const bullet = (text) => new Paragraph({ numbering: { reference: 'doc-bullets', level: 0 }, spacing: { after: 40 }, children: [new TextRun(String(text))] });
export const field = (label, value) => new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: `${label}: `, bold: true }), new TextRun(value == null || value === '' ? '—' : String(value))] });

/** rows: array of arrays of strings; first row is the header. widths: optional percentages. */
export function table(rows, { widths = null, header = true, center = [], contentWidth = 9360, size = 20, boldFirstCol = false, boldCols = [], noBorders = false, boldRow = -1, keepTogether = false } = {}) {
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
        borders: noBorders ? { top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' } } : borders,
        width: { size: columnWidths[j], type: WidthType.DXA },
        shading: header && i === 0 ? { type: ShadingType.CLEAR, color: 'auto', fill: 'E7E6E6' } : undefined,
        margins: { top: 60, bottom: 60, left: 80, right: 80 },
        children: String(c ?? '').split('\n').map((line) => new Paragraph({
          ...(keepTogether && i < rows.length - 1 ? { keepNext: true, keepLines: true } : {}),
          alignment: center.includes(j) ? AlignmentType.CENTER : AlignmentType.LEFT,
          children: [new TextRun({ text: line, bold: (header && i === 0) || (boldFirstCol && j === 0) || boldCols.includes(j) || i === boldRow, size: header && i === 0 ? size - 2 : size })],
        })),
      })),
    })),
  });
}

const PAGES = { letter: [12240, 15840], a4: [11906, 16838], folio: [12240, 18720] };
const SIDE = 1440; // 1-inch side margins, as in the official templates

/** Page width/height and usable content width (twips) for a paper size and orientation. */
export function pageGeometry(pageSize = 'letter', landscape = false) {
  const [w, h] = PAGES[pageSize] || PAGES.letter;
  const [W, H] = landscape ? [h, w] : [w, h];
  return { width: W, height: H, contentWidth: W - SIDE * 2 };
}

const EMU_PER_PX = 9525;
const BANNER_PX = 816; // 8.5 in at 96 px/in — the width the official templates use

function banner(part, pageHeightTwips, atBottom) {
  const h = Math.round((BANNER_PX * part.height) / part.width);
  const yEmu = atBottom ? Math.round((pageHeightTwips / 1440) * 914400 - h * EMU_PER_PX) : 0;
  return {
    heightTwips: h * 15,
    run: new ImageRun({
      type: part.mime === 'image/jpeg' ? 'jpg' : part.mime === 'image/webp' ? 'png' : 'png',
      data: part.data,
      transformation: { width: BANNER_PX, height: h },
      floating: {
        horizontalPosition: { relative: HorizontalPositionRelativeFrom.PAGE, align: HorizontalPositionAlign.CENTER },
        verticalPosition: { relative: VerticalPositionRelativeFrom.PAGE, offset: yEmu },
        behindDocument: true, allowOverlap: true, wrap: { type: TextWrappingType.NONE },
      },
      altText: { title: atBottom ? 'Letterhead footer' : 'Letterhead', description: atBottom ? 'Official letterhead footer' : 'Official letterhead', name: atBottom ? 'letterhead-footer' : 'letterhead-header' },
    }),
  };
}

export async function buildDocument({ title, subtitle, children, landscape = false, pageSize = 'letter', letterhead = null, showTitle = true, font = FONT }) {
  const g = pageGeometry(pageSize, landscape);
  const pageNum = new TextRun({ children: [`${title} · Page `, PageNumber.CURRENT, ' of ', PageNumber.TOTAL_PAGES], size: 16, font: 'Arial' });
  let margin = { top: 1440, right: SIDE, bottom: 1440, left: SIDE, header: 432, footer: 432 };
  let headers;
  let footers = { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [pageNum] })] }) };
  if (letterhead?.header) {
    const b = banner(letterhead.header, g.height, false);
    const lines = [];
    if (letterhead.office) lines.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: Math.max(0, b.heightTwips - 432 + 30), after: 0 },
      children: [new TextRun({ text: letterhead.office, font: 'Arial', size: 22, bold: true, italics: true, color: '0070C0' })] }));
    if (letterhead.contact) lines.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: letterhead.office ? 0 : Math.max(0, b.heightTwips - 432 + 30), after: 0 },
      children: [new TextRun({ text: letterhead.contact, font: 'Arial', size: 18, bold: true, color: '0070C0' })] }));
    headers = { default: new Header({ children: [new Paragraph({ children: [b.run] }), ...lines] }) };
    margin.top = b.heightTwips + (letterhead.office ? 280 : 0) + (letterhead.contact ? 230 : 0) + 260;
  }
  if (letterhead?.footer) {
    const f = banner(letterhead.footer, g.height, true);
    footers = { default: new Footer({ children: [new Paragraph({ children: [f.run] }), new Paragraph({ alignment: AlignmentType.RIGHT, children: [pageNum] })] }) };
    margin.footer = f.heightTwips + 120;
    margin.bottom = margin.footer + 420;
  }
  const doc = new Document({
    creator: 'SYNCHRONIA', title,
    styles: {
      default: {
        document: { run: { font, size: 22 }, paragraph: { spacing: { after: 60 } } },
        title: { run: { font, size: 32, bold: true, color: '000000' }, paragraph: { alignment: AlignmentType.CENTER, spacing: { after: 60 } } },
        heading1: { run: { font, size: 24, bold: true, allCaps: true, color: '000000' }, paragraph: { spacing: { before: 240, after: 100 }, keepNext: true, border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: '000000', space: 1 } } } },
        heading2: { run: { font, size: 22, bold: true, color: '000000' }, paragraph: { spacing: { before: 160, after: 60 }, keepNext: true } },
      },
    },
    numbering: { config: [
      { reference: 'doc-bullets', levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 360, hanging: 260 } } } }] },
      { reference: 'doc-numbers', levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 400, hanging: 360 } } } }] },
    ] },
    sections: [{
      // docx swaps width/height itself for landscape, so it is given the portrait dimensions.
      properties: { page: { size: landscape ? { width: g.height, height: g.width, orientation: 'landscape' } : { width: g.width, height: g.height }, margin } },
      ...(headers ? { headers } : {}),
      footers,
      children: [
        ...(showTitle ? [new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun(title)] })] : []),
        ...(showTitle && subtitle ? [new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 240 }, children: [new TextRun({ text: subtitle, italics: true })] })] : []),
        ...children,
      ],
    }],
  });
  return Packer.toBuffer(doc);
}

/** A numbered list item. Items sharing an `instance` form one list; a new instance starts again at 1. */
export const numbered = (text, instance = 0) => new Paragraph({ numbering: { reference: 'doc-numbers', level: 0, ...(instance ? { instance } : {}) }, spacing: { after: 40 }, children: [new TextRun(String(text))] });

/** Save a generated report, record it, and return its download metadata. */
export function saveReport(db, userId, { type, title, buffer, fileStem, periodStart = null, periodEnd = null, params = null, format = 'docx' }) {
  if (!['docx', 'pdf', 'xlsx', 'csv'].includes(format)) throw new Error(`Unsupported report format ${format}`);
  const dir = path.join(DATA_DIR, 'exports', 'reports');
  fs.mkdirSync(dir, { recursive: true });
  const safe = String(fileStem).normalize('NFKD').replace(/[^\w-]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '').slice(0, 90) || 'report';
  let name = `${safe}_${new Date().toISOString().slice(0, 10)}.${format}`;
  for (let i = 2; fs.existsSync(path.join(dir, name)); i += 1) name = `${safe}_${new Date().toISOString().slice(0, 10)}_${i}.${format}`;
  const rel = path.join('exports', 'reports', name);
  fs.writeFileSync(path.join(DATA_DIR, rel), buffer);
  const r = db.prepare('INSERT INTO reports (user_id, report_type, title, period_start, period_end, format, file_path, params_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(userId, type, title, periodStart, periodEnd, format, rel, params ? JSON.stringify(params) : null);
  indexReport(db, db.prepare('SELECT * FROM reports WHERE id = ?').get(r.lastInsertRowid));
  return { id: Number(r.lastInsertRowid), file_name: name, download: `/api/academic/reports/${r.lastInsertRowid}/download`, size_bytes: buffer.length };
}
