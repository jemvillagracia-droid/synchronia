import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { DATA_DIR } from '../config.js';
import { HttpError, audit } from '../repo.js';
import * as a from './service.js';

export function academicRouter(db) {
  const r = express.Router();
  const u = (req) => req.user.id;

  r.get('/overview', (req, res) => res.json(a.overview(db, u(req))));
  r.get('/courses/:id', (req, res) => res.json(a.courseWorkspace(db, u(req), req.params.id)));
  r.put('/courses/:id/alignments', (req, res) => res.json(a.setAlignments(db, u(req), req.params.id, req.body?.pairs)));

  r.get('/syllabi/:id', (req, res) => res.json(a.getSyllabus(db, u(req), req.params.id)));
  r.put('/syllabi/:id/content', (req, res) => res.json(a.saveSyllabus(db, u(req), req.params.id, req.body)));
  r.post('/syllabi/:id/export', async (req, res) => res.status(201).json(await a.exportSyllabus(db, u(req), req.params.id)));

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
