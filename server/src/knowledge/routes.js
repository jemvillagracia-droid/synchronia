import express from 'express';
import { audit } from '../repo.js';
import { archive, library, timeline } from './service.js';

export function knowledgeRouter(db) {
  const r = express.Router();
  const u = (req) => req.user.id;
  r.get('/library', (req, res) => res.json(library(db, u(req), req.query)));
  r.get('/timeline', (req, res) => res.json(timeline(db, u(req), req.query)));
  r.get('/archive', async (req, res) => {
    const includeSecrets = req.query.include_secrets === '1';
    const buf = await archive(db, u(req), { includeSecrets });
    audit(db, u(req), 'export', null, 'export', `Exported a complete archive${includeSecrets ? ' including protected fields' : ''}`);
    res.attachment(`SYNCHRONIA_Archive_${new Date().toISOString().slice(0, 10)}.zip`).type('application/zip').set('Cache-Control', 'no-store').send(buf);
  });
  return r;
}
