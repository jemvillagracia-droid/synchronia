import express from 'express';
import { commitCv, previewCv } from './cvImport.js';
import * as pds from './pds.js';
import * as jc from './jc.js';
import { previewTracker, commitTracker } from './jcimport.js';

export function portfolioImportRouter(db, { pdfRenderer } = {}) {
  const r = express.Router();
  const u = (req) => req.user.id;
  const fileName = (req) => { try { return decodeURIComponent(String(req.get('X-Filename') || 'cv')); } catch { return 'cv'; } };
  r.post('/import-cv', express.raw({ type: () => true, limit: '30mb' }), async (req, res) => res.json(await previewCv(db, u(req), req.body, fileName(req))));
  r.post('/import-cv/commit', (req, res) => res.status(201).json(commitCv(db, u(req), req.body || {})));
  // PDS Section VII: L&D interventions attended, by year.
  r.get('/ld/years', (req, res) => res.json(pds.ldYears(db, u(req))));
  r.get('/ld', (req, res) => res.json(pds.ldList(db, u(req), req.query.year, req.query.order)));
  r.put('/ld/folders/:year', (req, res) => res.json(pds.setFolder(db, u(req), req.params.year, req.body?.url)));
  r.post('/ld/export', async (req, res) => res.status(201).json(await pds.exportLd(db, u(req), req.body || {}, { pdfRenderer })));
  r.post('/ld/import/read', express.raw({ type: () => true, limit: '30mb' }), async (req, res) => res.json(await pds.previewPdsImport(db, u(req), req.body)));
  r.post('/ld/import', (req, res) => res.status(201).json(pds.commitPdsImport(db, u(req), req.body || {})));
  // DBM-CHED credentials checklist (JC No. 01 s. 2026): claims, document statuses, planned goals, export and tracker import.
  r.get('/jc', (req, res) => res.json(jc.checklist(db, u(req))));
  r.post('/jc/claims', (req, res) => res.status(201).json(jc.addClaim(db, u(req), req.body || {})));
  r.put('/jc/claims/:id', (req, res) => res.json(jc.updateClaim(db, u(req), req.params.id, req.body || {})));
  r.delete('/jc/claims/:id', (req, res) => res.json(jc.removeClaim(db, u(req), req.params.id)));
  r.post('/jc/export', async (req, res) => res.status(201).json(await jc.exportChecklist(db, u(req), req.body || {}, { pdfRenderer })));
  r.post('/jc/import/read', express.raw({ type: () => true, limit: '30mb' }), async (req, res) => res.json(await previewTracker(db, u(req), req.body)));
  r.post('/jc/import', (req, res) => res.status(201).json(commitTracker(db, u(req), req.body || {})));
  return r;
}
