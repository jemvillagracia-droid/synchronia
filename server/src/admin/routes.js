import express from 'express';
import * as s from './service.js';
import { exportMinutes, exportTurnover } from './documents.js';

export function adminRouter(db) {
  const r = express.Router();
  const u = (req) => req.user.id;
  r.get('/overview', (req, res) => res.json(s.overview(db, u(req))));
  r.get('/follow-ups', (req, res) => res.json(s.followUps(db, u(req))));

  r.get('/correspondence', (req, res) => res.json(s.listCorrespondence(db, u(req), req.query)));
  r.get('/correspondence/next-reference', (req, res) => res.json({ reference_no: s.nextReference(db, u(req), req.query.direction === 'outgoing' ? 'outgoing' : 'incoming') }));
  r.post('/correspondence', (req, res) => res.status(201).json(s.createCorrespondence(db, u(req), req.body || {})));
  r.get('/correspondence/:id', (req, res) => res.json(s.correspondenceDetail(db, u(req), req.params.id)));
  r.post('/correspondence/:id/routes', (req, res) => res.status(201).json(s.addRoute(db, u(req), req.params.id, req.body || {})));
  r.post('/correspondence/:id/complete', (req, res) => res.json(s.completeCorrespondence(db, u(req), req.params.id, req.body || {})));
  r.patch('/routes/:id', (req, res) => res.json(s.updateRoute(db, u(req), req.params.id, req.body || {})));
  r.delete('/routes/:id', (req, res) => res.json(s.deleteRoute(db, u(req), req.params.id)));

  r.get('/meetings/:id', (req, res) => res.json(s.meetingDetail(db, u(req), req.params.id)));
  r.put('/meetings/:id/minutes', (req, res) => res.json(s.saveMinutes(db, u(req), req.params.id, req.body || {})));
  r.post('/meetings/:id/action-items', (req, res) => res.json(s.createActionTasks(db, u(req), req.params.id)));
  r.post('/meetings/:id/export', async (req, res) => res.status(201).json(await exportMinutes(db, u(req), req.params.id)));

  r.get('/secretariat/next-number', (req, res) => res.json({ record_no: s.nextRecordNo(db, u(req), String(req.query.type || 'resolution')) }));
  r.post('/secretariat', (req, res) => res.status(201).json(s.createSecretariatRecord(db, u(req), req.body || {})));

  r.get('/log', (req, res) => res.json(s.dailyLog(db, u(req), req.query)));

  r.get('/turnover/:id', (req, res) => res.json(s.turnoverDetail(db, u(req), req.params.id)));
  r.put('/turnover/:id/notes', (req, res) => res.json(s.saveTurnoverNotes(db, u(req), req.params.id, req.body || {})));
  r.post('/turnover/:id/export', async (req, res) => res.status(201).json(await exportTurnover(db, u(req), req.params.id)));

  r.post('/role-change', (req, res) => res.status(201).json(s.roleChange(db, u(req), req.body || {})));
  return r;
}
