// Export verification: every generated document is opened again with an independent reader before it is reported as
// saved. A file that does not open, has no readable text, or shows rendering artefacts ("undefined", "NaN",
// "[object Object]") is refused, so the app never reports a broken export as a success.
import JSZip from 'jszip';
import ExcelJS from 'exceljs';
import { HttpError } from './repo.js';
import { pdfText } from './cv/extract.js';

const ARTEFACT = /\b(undefined|NaN)\b|\[object Object\]/;
const words = (t) => (String(t).match(/[\p{L}\p{N}]+/gu) || []).length;

export async function verifyExport(buffer, format, { expect = [] } = {}) {
  const checks = [];
  const add = (ok, label) => checks.push({ ok, label });
  let text = '';
  let pages = null;
  try {
    if (format === 'docx') {
      const zip = await JSZip.loadAsync(buffer);
      const doc = await zip.file('word/document.xml')?.async('string');
      add(!!doc && !!zip.file('[Content_Types].xml'), 'Opens as a Word document');
      text = (doc || '').replace(/<w:tab\/>/g, ' ').replace(/<\/w:p>/g, '\n').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
      add(!/<w:documentProtection/.test(await zip.file('word/settings.xml')?.async('string') || ''), 'Editable (not protected)');
    } else if (format === 'pdf') {
      add(buffer.subarray(0, 5).toString('latin1') === '%PDF-', 'Has a PDF header');
      const r = await pdfText(buffer);
      pages = r.pages;
      text = r.text;
      add(pages > 0, `Opens as a PDF (${pages} page${pages === 1 ? '' : 's'})`);
      add(words(text) >= 10 * Math.max(1, pages) * 0.5, 'Text is selectable and searchable');
    } else if (format === 'xlsx') {
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(buffer);
      add(wb.worksheets.length > 0, `Opens as a workbook (${wb.worksheets.length} sheet${wb.worksheets.length === 1 ? '' : 's'})`);
      for (const ws of wb.worksheets) ws.eachRow((row) => { text += `${row.values.slice(1).map((v) => (v instanceof Date ? v.toISOString() : v?.text ?? v ?? '')).join(' ')}\n`; });
    } else {
      add(false, `Unknown format ${format}`);
    }
  } catch (e) {
    add(false, `Could not be opened (${String(e.message).slice(0, 120)})`);
  }
  add(words(text) > 0, 'Contains text');
  const artefact = ARTEFACT.exec(text);
  add(!artefact, artefact ? `Contains a rendering artefact: “${artefact[0]}”` : 'No rendering artefacts');
  for (const e of expect.filter(Boolean)) add(text.toLowerCase().includes(String(e).toLowerCase().slice(0, 60)), `Includes “${String(e).slice(0, 40)}”`);
  const ok = checks.every((c) => c.ok);
  return { ok, format, pages, words: words(text), bytes: buffer.length, checks, summary: summary({ ok, format, pages, words: words(text) }) };
}

const summary = (v) => (v.ok ? `Verified: opens${v.pages ? `, ${v.pages} page${v.pages === 1 ? '' : 's'}` : ''}, ${v.words.toLocaleString('en')} words${v.format === 'pdf' ? ', text selectable' : v.format === 'docx' ? ', editable' : ''}` : 'Failed verification');

/** Verify, or refuse with the failed checks. */
export async function requireValid(buffer, format, opts) {
  const v = await verifyExport(buffer, format, opts);
  if (!v.ok) throw new HttpError(500, `The document was generated but failed verification, so it was not saved: ${v.checks.filter((c) => !c.ok).map((c) => c.label).join('; ')}.`, { checks: v.checks });
  return v;
}
