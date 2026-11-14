import express from 'express';
import * as s from './service.js';
import * as x from './exports.js';

export function researchRouter(db, { pdfRenderer } = {}) {
  const r = express.Router();
  const u = (req) => req.user.id;
  const opts = { pdfRenderer };

  r.get('/overview', (req, res) => res.json(s.overview(db, u(req), { archived: req.query.archived === '1' })));
  r.get('/settings', (req, res) => res.json(s.getSettings(db, u(req))));
  r.put('/settings/stages', (req, res) => res.json(s.saveStages(db, u(req), req.body?.stages ?? null)));

  r.get('/projects/:id', (req, res) => res.json(s.projectWorkspace(db, u(req), req.params.id)));
  r.post('/projects/:id/milestones/template', (req, res) => res.status(201).json(s.addTemplateMilestones(db, u(req), req.params.id, req.body?.stages)));
  r.get('/projects/:id/suggestions', (req, res) => res.json(s.suggestions(db, u(req), req.params.id)));
  r.post('/suggestions/dismiss', (req, res) => res.json(s.dismissSuggestion(db, u(req), req.body?.key)));
  r.post('/projects/:id/literature/:lit', (req, res) => res.json(s.linkLiterature(db, u(req), req.params.id, req.params.lit, true)));
  r.delete('/projects/:id/literature/:lit', (req, res) => res.json(s.linkLiterature(db, u(req), req.params.id, req.params.lit, false)));
  r.post('/projects/:id/ethics/export', async (req, res) => res.status(201).json(await x.exportEthics(db, u(req), req.params.id, req.body || {}, opts)));
  r.post('/projects/:id/report', async (req, res) => res.status(201).json(await x.exportProgress(db, u(req), req.params.id, req.body || {}, opts)));

  r.post('/ideas/:activity/develop', (req, res) => res.status(201).json(s.developIdea(db, u(req), req.params.activity)));

  r.get('/literature', (req, res) => res.json(s.literatureList(db, u(req), req.query)));
  r.post('/literature', (req, res) => res.status(201).json(s.addLiterature(db, u(req), req.body || {})));
  r.post('/literature/duplicates', (req, res) => res.json(s.findDuplicates(db, u(req), req.body || {})));
  r.get('/literature/citations', (req, res) => {
    const c = s.citations(db, u(req), req.query);
    res.set('Content-Disposition', `attachment; filename="references.${c.ext}"`).type(c.mime).send(c.body);
  });
  r.post('/literature/matrix/export', async (req, res) => res.status(201).json(await x.exportMatrix(db, u(req), req.body || {}, opts)));

  r.post('/instruments', (req, res) => res.status(201).json(s.createInstrument(db, u(req), req.body || {})));
  r.get('/instruments/:id', (req, res) => res.json(s.instrumentWorkspace(db, u(req), req.params.id)));
  r.post('/instruments/:id/advance', (req, res) => res.json(s.advanceInstrument(db, u(req), req.params.id, req.body?.stage)));
  r.post('/instruments/:id/projects/:project', (req, res) => res.json(s.linkInstrument(db, u(req), req.params.id, req.params.project, true)));
  r.delete('/instruments/:id/projects/:project', (req, res) => res.json(s.linkInstrument(db, u(req), req.params.id, req.params.project, false)));
  r.put('/instrument-versions/:id', (req, res) => res.json(s.saveVersion(db, u(req), req.params.id, req.body || {})));
  r.post('/instruments/:id/export', async (req, res) => res.status(201).json(await x.exportInstrument(db, u(req), req.params.id, req.body || {}, opts)));

  r.post('/documents', (req, res) => res.status(201).json(s.createDocument(db, u(req), req.body || {})));
  r.get('/documents/:id', (req, res) => res.json(s.documentView(db, u(req), req.params.id)));
  r.post('/documents/:id/sections', (req, res) => res.status(201).json(s.addSection(db, u(req), req.params.id, req.body?.heading)));
  r.post('/documents/:id/export', async (req, res) => res.status(201).json(await x.exportDocument(db, u(req), req.params.id, req.body?.format || 'docx', opts)));
  r.put('/sections/:id', (req, res) => res.json(s.saveSection(db, u(req), req.params.id, req.body || {})));
  r.get('/sections/:id/versions', (req, res) => res.json(s.sectionVersions(db, u(req), req.params.id)));
  r.post('/sections/:id/versions/:v/restore', (req, res) => res.json(s.restoreSectionVersion(db, u(req), req.params.id, req.params.v)));

  r.post('/submissions/:id/record', (req, res) => res.status(201).json(s.recordSubmission(db, u(req), req.params.id)));
  r.post('/dissemination/export', async (req, res) => res.status(201).json(await x.exportDissemination(db, u(req), req.body || {}, opts)));
  return r;
}
