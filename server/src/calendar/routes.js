import express from 'express';
import * as c from './service.js';
import * as imp from './importer.js';

export function calendarRouter(db) {
  const r = express.Router();
  const u = (req) => req.user.id;
  r.get('/', (req, res) => res.json(c.calendar(db, u(req), req.query)));
  r.get('/settings', (req, res) => res.json(c.getSettings(db, u(req))));
  r.put('/settings', (req, res) => res.json(c.saveSettings(db, u(req), req.body || {})));
  r.get('/holidays/corrections', (req, res) => res.json(c.listOverrides(db, u(req))));
  r.post('/holidays', (req, res) => res.status(201).json(c.addHoliday(db, u(req), req.body || {})));
  r.post('/holidays/hide', (req, res) => res.json(c.hideHoliday(db, u(req), req.body || {})));
  r.delete('/holidays/corrections/:id', (req, res) => res.json(c.deleteOverride(db, u(req), req.params.id)));
  // School calendar import: read (nothing saved), save the chosen dates, list and remove imports.
  const fileName = (req) => { try { return decodeURIComponent(String(req.get('X-Filename') || '')); } catch { return ''; } };
  r.post('/import/read', express.raw({ type: () => true, limit: '30mb' }), async (req, res) => res.json(await imp.previewImport(db, u(req), { buffer: req.body, fileName: fileName(req) })));
  r.post('/import/read-text', async (req, res) => res.json(await imp.previewImport(db, u(req), { text: String(req.body?.text || '').slice(0, 200000) })));
  r.post('/import', (req, res) => res.status(201).json(imp.commitImport(db, u(req), req.body || {})));
  r.get('/imports', (req, res) => res.json(imp.listImports(db, u(req))));
  r.delete('/imports/:id', (req, res) => res.json(imp.removeImport(db, u(req), req.params.id)));
  return r;
}
