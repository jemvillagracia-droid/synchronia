import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { DATA_DIR } from '../config.js';
import { HttpError, audit } from '../repo.js';
import * as a from './service.js';
import * as inst from './institution.js';
import * as sd from './syllabusDoc.js';
import { importSyllabus, parseSyllabusDocx } from './importer.js';

const docx = express.raw({ type: () => true, limit: '25mb' });
const fileName = (req) => { try { return decodeURIComponent(String(req.get('X-Filename') || 'document.docx')); } catch { return 'document.docx'; } };
const needBody = (req) => { if (!Buffer.isBuffer(req.body) || !req.body.length) throw new HttpError(422, 'Choose a .docx file to import.'); };

export function academicRouter(db, { pdfRenderer } = {}) {
  const r = express.Router();
  const u = (req) => req.user.id;

  r.get('/overview', (req, res) => res.json(a.overview(db, u(req))));
  r.get('/courses/:id', (req, res) => res.json(a.courseWorkspace(db, u(req), req.params.id)));
  r.put('/courses/:id/alignments', (req, res) => res.json(a.setAlignments(db, u(req), req.params.id, req.body?.pairs)));

  r.get('/institution', (req, res) => res.json(inst.getInstitution(db, u(req))));
  r.put('/institution', (req, res) => res.json(inst.saveInstitution(db, u(req), req.body || {})));
  r.post('/institution/letterhead', docx, async (req, res) => { needBody(req); res.status(201).json(await inst.importLetterhead(db, u(req), req.body, fileName(req))); });
  r.delete('/institution/letterhead', (req, res) => res.json(inst.removeLetterhead(db, u(req))));
  r.get('/institution/letterhead/:part', (req, res) => {
    const lh = inst.getInstitution(db, u(req)).letterhead;
    const part = ['header', 'footer'].includes(req.params.part) && lh?.[req.params.part];
    if (!part) throw new HttpError(404, 'No letterhead image');
    res.set('Cache-Control', 'no-store').type(part.mime).sendFile(path.join(DATA_DIR, part.file));
  });

  r.post('/syllabi/import', docx, async (req, res) => { needBody(req); res.json(await parseSyllabusDocx(req.body, fileName(req))); });
  r.post('/syllabi/import/commit', (req, res) => res.status(201).json(importSyllabus(db, u(req), req.body)));
  // Syllabi as documents (edited like a word processor).
  r.post('/courses/:id/syllabi', (req, res) => res.status(201).json(sd.createSyllabus(db, u(req), req.params.id, req.body || {})));
  r.get('/syllabi/:id/document', (req, res) => res.json(sd.openSyllabusDocument(db, u(req), req.params.id)));
  r.put('/syllabi/:id/document', (req, res) => res.json(sd.saveSyllabusDocument(db, u(req), req.params.id, req.body || {})));
  r.get('/syllabi/:id/snapshots/:snap', (req, res) => res.json(sd.snapshotDocument(db, u(req), req.params.id, req.params.snap)));
  r.post('/syllabi/:id/snapshots/:snap/restore', (req, res) => res.json(sd.restoreSnapshot(db, u(req), req.params.id, req.params.snap)));
  r.post('/syllabi/:id/document/export', async (req, res) => res.status(201).json(await sd.exportSyllabusDocument(db, u(req), req.params.id, req.body?.format || 'docx', { pdfRenderer })));
  r.get('/syllabi/:id', (req, res) => res.json(a.getSyllabus(db, u(req), req.params.id)));
  r.put('/syllabi/:id/content', (req, res) => res.json(a.saveSyllabus(db, u(req), req.params.id, req.body)));
  // One export path: the syllabus document (pre-1.2 syllabi are converted on first use).
  r.post('/syllabi/:id/export', async (req, res) => res.status(201).json(await sd.exportSyllabusDocument(db, u(req), req.params.id, 'docx', { pdfRenderer })));

  r.get('/tos/:id', (req, res) => res.json(a.getTos(db, u(req), req.params.id)));
  r.put('/tos/:id/content', (req, res) => res.json(a.saveTos(db, u(req), req.params.id, req.body)));
  r.post('/tos/:id/export', async (req, res) => res.status(201).json(await a.exportTos(db, u(req), req.params.id)));

  r.get('/rubrics/:id', (req, res) => res.json(a.getRubric(db, u(req), req.params.id)));
  r.put('/rubrics/:id/criteria', (req, res) => res.json(a.saveRubric(db, u(req), req.params.id, req.body)));
  r.post('/rubrics/:id/export', async (req, res) => res.status(201).json(await a.exportRubric(db, u(req), req.params.id)));

  r.post('/reports/teaching', async (req, res) => res.status(201).json(await a.teachingReport(db, u(req), req.body || {})));
  r.post('/extension/:id/report', async (req, res) => res.status(201).json(await a.extensionReport(db, u(req), req.params.id)));
  r.get('/reports', (req, res) => res.json(db.prepare('SELECT id, report_type, title, period_start, period_end, format, created_at FROM reports WHERE user_id = ? ORDER BY id DESC LIMIT 200').all(u(req))));
  r.get('/reports/:id/download', (req, res) => {
    const rep = db.prepare('SELECT * FROM reports WHERE id = ? AND user_id = ?').get(Number(req.params.id), u(req));
    if (!rep) throw new HttpError(404, 'Report not found');
    const file = path.join(DATA_DIR, rep.file_path);
    if (!fs.existsSync(file)) throw new HttpError(410, 'The report file is no longer on disk. Generate it again.');
    audit(db, u(req), 'reports', rep.id, 'export', `Downloaded ${path.basename(file)}`);
    res.download(file, path.basename(file));
  });
  return r;
}
