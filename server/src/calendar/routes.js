import express from 'express';
import * as c from './service.js';

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
  return r;
}
