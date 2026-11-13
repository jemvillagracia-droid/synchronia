import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { DATA_DIR } from '../config.js';
import { HttpError, audit } from '../repo.js';
import * as cv from './model.js';
import { TEMPLATES, PAGE_SIZES, styleFor } from './templates.js';
import { SECTIONS } from './sections.js';
import { renderHtml } from './html.js';
import { buildDocx } from './docx.js';
import { docxText, pdfText } from './extract.js';
import { analyzeAts, qualityChecklist } from './analyze.js';
import * as images from './images.js';

const FORMATS = {
  docx: { ext: 'docx', mode: 'visual', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
  pdf: { ext: 'pdf', mode: 'visual', mime: 'application/pdf' },
  docx_ats: { ext: 'docx', mode: 'ats', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
  pdf_ats: { ext: 'pdf', mode: 'ats', mime: 'application/pdf' },
};
const TYPE_LABEL = { academic: 'Academic', faculty: 'Faculty', research: 'Research', administrative: 'Administrative', professional: 'Professional', application: 'Application', short_bio: 'ShortBio' };

/**
 * pdfRenderer(html, { footerTemplate, title }) → Promise<Buffer>
 * Supplied by the desktop shell (Chromium printToPDF). Without it, PDF features report that they need the desktop app.
 */
export function cvRouter(db, { pdfRenderer } = {}) {
  const r = express.Router();
  const cache = new Map(); // cv:mode → { key, pdf, docx }

  const modeOf = (q) => (q === 'ats' ? 'ats' : 'visual');
  const keyOf = (model) => crypto.createHash('sha1').update(JSON.stringify({ ...model, meta: { ...model.meta, generated_at: null } })).digest('hex');

  async function artifacts(userId, id, mode, { pdf = true, docx = true } = {}) {
    const model = cv.composeCv(db, userId, id, { mode });
    const key = keyOf(model);
    const slot = `${id}:${mode}`;
    let entry = cache.get(slot);
    if (!entry || entry.key !== key) { entry = { key }; cache.set(slot, entry); if (cache.size > 40) cache.delete(cache.keys().next().value); }
    if (pdf && !entry.pdf) {
      if (!pdfRenderer) throw new HttpError(503, 'PDF output is produced by the SYNCHRONIA desktop app.');
      const { html, footerTemplate, title } = renderHtml(model);
      entry.pdf = await pdfRenderer(html, { footerTemplate, title });
    }
    if (docx && !entry.docx) entry.docx = await buildDocx(model);
    return { model, ...entry };
  }

  // ── Catalogue ──
  r.get('/catalog', (_req, res) => res.json({
    templates: Object.entries(TEMPLATES).map(([key, t]) => ({ key, name: t.name, description: t.description, ats: !!t.ats, font: t.font, size: t.size })),
    sections: SECTIONS.map((s) => ({ key: s.key, heading: s.heading, ats: s.ats, source: s.source })),
    page_sizes: Object.entries(PAGE_SIZES).map(([key, p]) => ({ key, label: p.label })),
    fonts: cv.FONTS,
    defaults: cv.DEFAULT_SETTINGS,
    pdf_available: !!pdfRenderer,
  }));

  // ── Profiles ──
  r.get('/', (req, res) => res.json(cv.listCvs(db, req.user.id)));
  r.post('/', (req, res) => res.status(201).json(cv.createCv(db, req.user.id, req.body)));
  r.get('/exports', (req, res) => res.json(db.prepare(`SELECT x.id, x.cv_profile_id, x.format, x.file_name, x.size_bytes, x.cv_version, x.cv_status, x.created_at, p.name AS cv_name
      FROM cv_exports x JOIN cv_profiles p ON p.id = x.cv_profile_id WHERE x.user_id = ? ORDER BY x.id DESC LIMIT 200`).all(req.user.id)));
  r.get('/exports/:xid/download', (req, res) => {
    const x = db.prepare('SELECT * FROM cv_exports WHERE id = ? AND user_id = ?').get(Number(req.params.xid), req.user.id);
    if (!x) throw new HttpError(404, 'Export not found');
    const file = path.join(DATA_DIR, x.file_path);
    if (!fs.existsSync(file)) throw new HttpError(410, 'The exported file is no longer on disk. Export again.');
    res.download(file, x.file_name);
  });

  r.get('/:id', (req, res) => res.json(cv.getCv(db, req.user.id, req.params.id)));
  r.patch('/:id', (req, res) => res.json(cv.updateCv(db, req.user.id, req.params.id, req.body)));
  r.delete('/:id', (req, res) => res.json(cv.deleteCv(db, req.user.id, req.params.id)));
  r.post('/:id/versions', (req, res) => res.status(201).json(cv.newVersion(db, req.user.id, req.params.id)));

  // ── Sections and entries ──
  r.post('/:id/sections', (req, res) => res.status(201).json(cv.addCustomSection(db, req.user.id, req.params.id, req.body)));
  r.put('/:id/sections/order', (req, res) => res.json(cv.reorderSections(db, req.user.id, req.params.id, req.body?.ids)));
  r.patch('/:id/sections/:sid', (req, res) => res.json(cv.updateSection(db, req.user.id, req.params.id, req.params.sid, req.body)));
  r.delete('/:id/sections/:sid', (req, res) => res.json(cv.deleteSection(db, req.user.id, req.params.id, req.params.sid)));
  r.post('/:id/sections/:sid/entries', (req, res) => res.status(201).json(cv.addManualEntry(db, req.user.id, req.params.id, req.params.sid, req.body)));
  r.put('/:id/sections/:sid/entries/order', (req, res) => res.json(cv.reorderEntries(db, req.user.id, req.params.id, req.params.sid, req.body?.ids)));
  r.patch('/:id/entries/:eid', (req, res) => res.json(cv.updateEntry(db, req.user.id, req.params.id, req.params.eid, req.body)));
  r.delete('/:id/entries/:eid', (req, res) => res.json(cv.deleteEntry(db, req.user.id, req.params.id, req.params.eid)));
  r.post('/:id/sync', (req, res) => res.json(cv.syncPending(db, req.user.id, req.params.id, req.body)));

  // ── Output ──
  r.get('/:id/preview.pdf', async (req, res) => {
    const a = await artifacts(req.user.id, req.params.id, modeOf(req.query.mode), { docx: false });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Model-Key', a.key);
    res.send(a.pdf);
  });
  r.get('/:id/html', (req, res) => {
    const model = cv.composeCv(db, req.user.id, req.params.id, { mode: modeOf(req.query.mode) });
    res.type('html').send(renderHtml(model).html);
  });
  r.get('/:id/analysis', async (req, res) => {
    const mode = modeOf(req.query.mode);
    const a = await artifacts(req.user.id, req.params.id, mode);
    const [pdf, docx] = await Promise.all([pdfText(a.pdf), docxText(a.docx)]);
    const ats = analyzeAts(a.model, { pdf, docx, style: styleFor(a.model) });
    const checklist = qualityChecklist(a.model, cv.getCv(db, req.user.id, req.params.id), ats);
    res.json({ mode, ats, checklist, extracted: { pdf: pdf.text, pdf_pages: pdf.pages, pdf_title: pdf.title, docx: docx.text, docx_headings: docx.headings } });
  });

  r.post('/:id/finalize', async (req, res) => {
    if (req.body?.acknowledged !== true) throw new HttpError(422, 'Review the quality checklist and confirm before approving.');
    const a = await artifacts(req.user.id, req.params.id, 'visual');
    const [pdf, docx] = await Promise.all([pdfText(a.pdf), docxText(a.docx)]);
    const ats = analyzeAts(a.model, { pdf, docx, style: styleFor(a.model) });
    const checklist = qualityChecklist(a.model, cv.getCv(db, req.user.id, req.params.id), ats);
    res.json(cv.finalizeCv(db, req.user.id, req.params.id, { at: new Date().toISOString(), checklist: checklist.counts, ats: ats.summary }));
  });

  r.post('/:id/exports', async (req, res) => {
    const fmt = FORMATS[req.body?.format];
    if (!fmt) throw new HttpError(422, 'Unknown format', { format: Object.keys(FORMATS).join(', ') });
    const userId = req.user.id;
    const a = await artifacts(userId, req.params.id, fmt.mode, { pdf: fmt.ext === 'pdf', docx: fmt.ext === 'docx' });
    const data = fmt.ext === 'pdf' ? a.pdf : a.docx;
    const view = cv.getCvRow(db, userId, req.params.id);
    const profile = db.prepare('SELECT full_name FROM professional_profiles WHERE user_id = ?').get(userId) || {};
    const nameParts = (profile.full_name || 'CV').trim().split(/\s+/);
    const person = nameParts.length > 1 ? `${nameParts[nameParts.length - 1]}_${nameParts.slice(0, -1).join('_')}` : nameParts[0];
    const safe = (s) => String(s).normalize('NFKD').replace(/[^\w-]+/g, '').slice(0, 40);
    const tpl = safe(TEMPLATES[a.model.meta.template_key]?.name.replace(/ CV$/, '').replace(/-/g, '') || 'CV');
    const stamp = new Date().toISOString().slice(0, 10);
    const fileName = `${safe(person)}_CV_${TYPE_LABEL[view.cv_type] || 'CV'}_${tpl}_v${view.version}${view.status === 'draft' ? '_DRAFT' : ''}_${stamp}.${fmt.ext}`;
    const dir = path.join(DATA_DIR, 'exports');
    fs.mkdirSync(dir, { recursive: true });
    let rel = path.join('exports', fileName);
    for (let i = 2; fs.existsSync(path.join(DATA_DIR, rel)); i += 1) rel = path.join('exports', fileName.replace(`.${fmt.ext}`, `_${i}.${fmt.ext}`));
    fs.writeFileSync(path.join(DATA_DIR, rel), data);
    const out = db.prepare(`INSERT INTO cv_exports (user_id, cv_profile_id, format, file_name, file_path, size_bytes, cv_version, cv_status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(userId, view.id, req.body.format, path.basename(rel), rel, data.length, view.version, view.status);
    audit(db, userId, 'cv_profiles', view.id, 'export', `Exported ${path.basename(rel)}`);
    res.status(201).json({ id: Number(out.lastInsertRowid), file_name: path.basename(rel), format: req.body.format, size_bytes: data.length, download: `/api/cv/exports/${out.lastInsertRowid}/download` });
  });

  return r;
}

export function imageRouter(db) {
  const r = express.Router();
  r.get('/', (req, res) => res.json(images.listImages(db, req.user.id)));
  r.post('/', async (req, res) => res.status(201).json(await images.uploadImage(db, req.user.id, req)));
  r.put('/:id/optimized', async (req, res) => res.json(await images.saveOptimized(db, req.user.id, req.params.id, req)));
  r.get('/:id/file', (req, res) => images.sendImage(db, req.user.id, req.params.id, req.query.variant === 'original' ? 'original' : 'optimized', res));
  r.patch('/:id', (req, res) => res.json(images.updateImage(db, req.user.id, req.params.id, req.body)));
  r.delete('/:id', (req, res) => res.json(images.deleteImage(db, req.user.id, req.params.id)));
  return r;
}
