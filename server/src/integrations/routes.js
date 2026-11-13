import express from 'express';
import * as g from './google.js';

/** Mounted before the access check: Google redirects the system browser here, which has no app cookie. */
export function googleCallbackRouter(db) {
  const r = express.Router();
  r.get('/integrations/google/callback', async (req, res) => {
    const out = await g.callback(db, req.query);
    res.status(out.status).set('Cache-Control', 'no-store')
      .set('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'")
      .type('html').send(out.html);
  });
  return r;
}

export function integrationsRouter(db) {
  const r = express.Router();
  const u = (req) => req.user.id;
  r.get('/google', (req, res) => res.json(g.status(db, u(req))));
  r.put('/google/client', (req, res) => res.json(g.saveClient(db, u(req), req.body || {})));
  r.delete('/google/client', (req, res) => res.json(g.forgetClient(db, u(req))));
  r.post('/google/connect', (req, res) => {
    const port = req.socket.localPort;
    res.json(g.start(db, u(req), `http://127.0.0.1:${port}`));
  });
  r.post('/google/disconnect', async (req, res) => res.json(await g.disconnect(db, u(req))));
  r.get('/google/files', async (req, res) => res.json(await g.search(db, u(req), req.query.q || '', req.query.page || '')));
  r.post('/google/files/:id/library', async (req, res) => res.status(201).json(await g.addToLibrary(db, u(req), req.params.id)));
  r.post('/google/refresh', async (req, res) => res.json(await g.refreshMetadata(db, u(req), Array.isArray(req.body?.ids) ? req.body.ids.map(Number).filter(Number.isInteger) : null)));
  return r;
}
