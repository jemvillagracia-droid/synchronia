import express from 'express';
import { commitCv, previewCv } from './cvImport.js';

export function portfolioImportRouter(db) {
  const r = express.Router();
  const u = (req) => req.user.id;
  const fileName = (req) => { try { return decodeURIComponent(String(req.get('X-Filename') || 'cv')); } catch { return 'cv'; } };
  r.post('/import-cv', express.raw({ type: () => true, limit: '30mb' }), async (req, res) => res.json(await previewCv(db, u(req), req.body, fileName(req))));
  r.post('/import-cv/commit', (req, res) => res.status(201).json(commitCv(db, u(req), req.body || {})));
  return r;
}
