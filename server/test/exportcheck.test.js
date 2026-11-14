// Export verification refuses documents that do not open, have no readable text, or show rendering artefacts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Document, Packer, Paragraph, TextRun } from 'docx';
import ExcelJS from 'exceljs';

process.env.SYNCHRONIA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'synchronia-xc-'));
const { verifyExport, requireValid } = await import('../src/exportcheck.js');
const docx = (text) => Packer.toBuffer(new Document({ sections: [{ children: [new Paragraph({ children: [new TextRun(text)] })] }] }));

test('a good Word file passes and is described', async () => {
  const v = await verifyExport(await docx('Annual Academic Accomplishment Report for the school year'), 'docx', { expect: ['Annual Academic'] });
  assert.equal(v.ok, true, JSON.stringify(v.checks));
  assert.match(v.summary, /^Verified: opens, \d+ words, editable$/);
});

test('rendering artefacts and missing content are caught', async () => {
  const bad = await verifyExport(await docx('Total hours: NaN for undefined'), 'docx');
  assert.equal(bad.ok, false);
  assert.ok(bad.checks.some((c) => !c.ok && /artefact/.test(c.label)));
  const missing = await verifyExport(await docx('Some other report'), 'docx', { expect: ['Faculty Development Report'] });
  assert.equal(missing.ok, false);
  await assert.rejects(requireValid(await docx('[object Object]'), 'docx'), /failed verification, so it was not saved/);
});

test('files that do not open are refused', async () => {
  for (const [buf, fmt] of [[Buffer.from('not a zip'), 'docx'], [Buffer.from('%PDF-1.7 broken'), 'pdf'], [Buffer.from('nope'), 'xlsx']]) {
    const v = await verifyExport(buf, fmt);
    assert.equal(v.ok, false, fmt);
  }
});

test('a workbook is opened and its cells read', async () => {
  const wb = new ExcelJS.Workbook();
  wb.addWorksheet('Summary').addRow(['Indicator', 'Count']).commit();
  wb.getWorksheet('Summary').addRow(['Trainings', 5]);
  const v = await verifyExport(Buffer.from(await wb.xlsx.writeBuffer()), 'xlsx');
  assert.equal(v.ok, true, JSON.stringify(v.checks));
});
