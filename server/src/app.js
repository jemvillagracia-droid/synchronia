import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { accessMiddleware, hostGuard, requireAuth, csrfGuard, openHandler } from './auth.js';
import * as repo from './repo.js';
import { HttpError, audit } from './repo.js';
import { RESOURCES } from './resources.js';
import { nexus, notifications, search, capture, normaliseLayout, profileRow, portfolioSummary, WIDGETS } from './nexus.js';
import { decrypt } from './secrets.js';
import { cvRouter, imageRouter } from './cv/routes.js';
import { intelligenceRouter } from './intelligence/routes.js';
import { adminRouter } from './admin/routes.js';
import { knowledgeRouter } from './knowledge/routes.js';
import { calendarRouter } from './calendar/routes.js';
import { portfolioImportRouter } from './portfolio/routes.js';
import { googleCallbackRouter, integrationsRouter } from './integrations/routes.js';
import { researchRouter } from './research/routes.js';
import { docImagesRouter } from './docimages.js';
import { academicRouter } from './academic/routes.js';
import { backupFile, backupNow, importBackup, integrity, listBackups, scheduleRestore } from './backup.js';
import { tx } from './db.js';
import { ROOT, APP_NAME, APP_TAGLINE, APP_VERSION } from './config.js';

const PROFILE_FIELDS = {
  full_name: 200, professional_title: 200, academic_designation: 200, biography: 5000, email: 200, phone: 60,
  address: 500, website: 500, specialization: 500, research_interests: 2000, current_position: 200,
  current_office: 200, current_institution: 200, career_goal: 200,
};
const MODES = ['administrative', 'instructor', 'researcher', 'faculty_development'];

export function createApp(db, { accessToken, pdfRenderer, dataDir = null, health = {} } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 'loopback');
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy',
      "default-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self' data:; img-src 'self' data: blob:; connect-src 'self'; worker-src 'self' blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
    next();
  });
  app.use(hostGuard);
  app.use(express.json({ limit: '1mb' }));
  app.use(accessMiddleware(db, accessToken));

  const api = express.Router();
  api.use(csrfGuard);
  api.get('/meta', (_req, res) => res.json({ name: APP_NAME, tagline: APP_TAGLINE, version: APP_VERSION }));
  api.get('/open', openHandler(accessToken));
  api.get('/auth/state', (req, res) => res.json({ user: req.user || null }));
  api.use(googleCallbackRouter(db));
  api.use(requireAuth);

  // ── Central Nexus ─────────────────────────────────────────
  api.get('/nexus', (req, res) => res.json(nexus(db, req.user.id)));
  api.get('/portfolio/summary', (req, res) => res.json(portfolioSummary(db, req.user.id)));
  api.get('/notifications', (req, res) => res.json(notifications(db, req.user.id)));
  api.get('/search', (req, res) => res.json(search(db, req.user.id, req.query.q, req.query.limit, typeof req.query.module === 'string' ? req.query.module : null)));
  api.post('/capture', (req, res) => res.status(201).json(capture(db, req.user.id, req.body)));

  // ── Professional profile (one per user) ───────────────────
  api.get('/profile', (req, res) => {
    const p = profileRow(db, req.user.id);
    const { user_id, ...rest } = p || {};
    res.json(rest);
  });
  api.put('/profile', (req, res) => {
    const input = req.body || {};
    const errors = {};
    const values = {};
    for (const [k, v] of Object.entries(input)) {
      if (!(k in PROFILE_FIELDS)) { errors[k] = 'Unknown field'; continue; }
      if (v !== null && typeof v !== 'string') { errors[k] = 'Must be text'; continue; }
      const s = (v ?? '').trim();
      if (s.length > PROFILE_FIELDS[k]) { errors[k] = `At most ${PROFILE_FIELDS[k]} characters`; continue; }
      values[k] = s || null;
    }
    if (Object.keys(errors).length) throw new HttpError(422, 'Validation failed', errors);
    const uid = req.user.id;
    const out = tx(db, () => {
      const before = profileRow(db, uid);
      const changes = {};
      for (const [k, v] of Object.entries(values)) if ((before?.[k] ?? null) !== v) changes[k] = [before?.[k] ?? null, v];
      if (Object.keys(changes).length) {
        const sets = Object.keys(values).map((k) => `${k} = ?`).join(', ');
        db.prepare(`UPDATE professional_profiles SET ${sets}, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE user_id = ?`)
          .run(...Object.values(values), uid);
        audit(db, uid, 'profile', before.id, 'update', 'Updated professional profile', changes);
        repo.indexProfile(db, uid);
      }
      const { user_id, ...rest } = profileRow(db, uid);
      return rest;
    });
    res.json(out);
  });

  // ── Preferences: role / academic mode, dashboard layout, panels ──
  const readPrefs = (uid) => {
    const p = db.prepare('SELECT * FROM user_profiles WHERE user_id = ?').get(uid);
    let layout = null;
    try { layout = p.dashboard_layout ? JSON.parse(p.dashboard_layout) : null; } catch { layout = null; }
    return {
      academic_mode: p.academic_mode,
      dashboard_layout: normaliseLayout(layout, p.academic_mode),
      layout_customised: !!layout,
      context_panel_open: !!p.context_panel_open,
      sidebar_collapsed: !!p.sidebar_collapsed,
      reduce_motion: !!p.reduce_motion,
    };
  };
  api.get('/preferences', (req, res) => res.json(readPrefs(req.user.id)));
  api.put('/preferences', (req, res) => {
    const b = req.body || {};
    const sets = [];
    const params = [];
    const changes = {};
    if ('academic_mode' in b) {
      if (!MODES.includes(b.academic_mode)) throw new HttpError(422, 'Unknown academic mode', { academic_mode: `One of: ${MODES.join(', ')}` });
      sets.push('academic_mode = ?'); params.push(b.academic_mode); changes.academic_mode = b.academic_mode;
    }
    if ('dashboard_layout' in b) {
      if (b.dashboard_layout === null) { sets.push('dashboard_layout = NULL'); changes.dashboard_layout = 'reset'; }
      else {
        if (!Array.isArray(b.dashboard_layout)) throw new HttpError(422, 'dashboard_layout must be a list');
        const ids = new Set(WIDGETS.map((w) => w.id));
        const clean = b.dashboard_layout.filter((w) => w && ids.has(w.id)).map((w) => ({ id: w.id, visible: w.visible !== false }));
        sets.push('dashboard_layout = ?'); params.push(JSON.stringify(clean)); changes.dashboard_layout = 'customised';
      }
    }
    for (const k of ['context_panel_open', 'sidebar_collapsed', 'reduce_motion']) {
      if (k in b) { sets.push(`${k} = ?`); params.push(b[k] ? 1 : 0); if (k === 'reduce_motion') changes.reduce_motion = !!b[k]; }
    }
    if (sets.length) {
      db.prepare(`UPDATE user_profiles SET ${sets.join(', ')}, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE user_id = ?`).run(...params, req.user.id);
      if (Object.keys(changes).length) audit(db, req.user.id, 'preferences', req.user.id, 'settings', 'Updated workspace preferences', changes);
    }
    res.json(readPrefs(req.user.id));
  });

  // ── Schema: lets the client render view/edit forms for any record type ──
  api.get('/schema', (_req, res) => {
    const out = {};
    for (const r of Object.values(RESOURCES)) {
      out[r.key] = {
        label: r.label, module: r.module, title: r.title, subtitle: r.subtitle || [], date: r.date || null,
        group: r.group || null, recommended: r.recommended || [],
        fields: Object.fromEntries(Object.entries(r.fields).map(([n, f]) => [n, {
          type: f.type, required: !!f.required, values: f.values, resource: f.resource, max: f.max, min: f.min, format: f.format, partial: f.partial || undefined,
        }])),
      };
    }
    res.json(out);
  });

  // ── Record counts per type (used by module overviews) ─────
  api.get('/stats/counts', (req, res) => {
    const out = {};
    for (const r of Object.values(RESOURCES)) {
      out[r.key] = { label: r.label, module: r.module, count: db.prepare(`SELECT COUNT(*) n FROM ${r.table} WHERE user_id = ? AND deleted_at IS NULL`).get(req.user.id).n };
    }
    res.json(out);
  });

  // ── Activity log / recycle bin ────────────────────────────
  api.get('/audit', (req, res) => {
    const lim = Math.min(Number(req.query.limit) || 50, 200);
    res.json(db.prepare('SELECT id, entity_type, entity_id, action, summary, at FROM audit_logs WHERE user_id = ? ORDER BY id DESC LIMIT ?').all(req.user.id, lim));
  });
  api.get('/recycle-bin', (req, res) => {
    const items = [];
    for (const r of Object.values(RESOURCES)) {
      for (const row of db.prepare(`SELECT * FROM ${r.table} WHERE user_id = ? AND deleted_at IS NOT NULL ORDER BY deleted_at DESC LIMIT 100`).all(req.user.id)) {
        items.push({ type: r.key, label: r.label, id: row.id, title: repo.displayTitle(r, row), deleted_at: row.deleted_at });
      }
    }
    items.sort((a, b) => b.deleted_at.localeCompare(a.deleted_at));
    res.json({ items });
  });

  // ── Full data export (prevents platform lock-in) ──────────
  api.get('/export', (req, res) => {
    const uid = req.user.id;
    const data = { profile: (({ user_id, ...p }) => p)(profileRow(db, uid) || {}), records: {} };
    for (const r of Object.values(RESOURCES)) {
      data.records[r.key] = db.prepare(`SELECT * FROM ${r.table} WHERE user_id = ? ORDER BY id`).all(uid).map((row) => {
        const { user_id, ...rest } = row;
        for (const [name, f] of Object.entries(r.fields)) {
          if (f.type === 'secret') {
            rest[name] = row[`${name}_enc`] ? decrypt(row[`${name}_enc`]) : null;
            delete rest[`${name}_enc`]; delete rest[`${name}_last4`];
          }
        }
        return rest;
      });
    }
    data.evidence_links = db.prepare('SELECT * FROM evidence_links WHERE user_id = ?').all(uid);
    data.cv_sections = db.prepare('SELECT s.* FROM cv_sections s JOIN cv_profiles p ON p.id = s.cv_profile_id WHERE p.user_id = ?').all(uid);
    data.cv_entries = db.prepare(`SELECT e.* FROM cv_entries e JOIN cv_sections s ON s.id = e.cv_section_id
                                  JOIN cv_profiles p ON p.id = s.cv_profile_id WHERE p.user_id = ?`).all(uid);
    audit(db, uid, 'export', null, 'export', 'Exported all structured records (JSON)');
    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Disposition', `attachment; filename="synchronia-export-${stamp}.json"`);
    res.json({ application: APP_NAME, version: APP_VERSION, exported_at: new Date().toISOString(), ...data });
  });

  // ── Save-path status, backups and restore ─────────────────
  api.get('/system/status', (req, res) => {
    const last = db.prepare("SELECT at FROM audit_logs WHERE user_id = ? AND action IN ('create','update','delete','restore','settings') ORDER BY id DESC LIMIT 1").get(req.user.id);
    const backups = dataDir ? listBackups(dataDir) : [];
    let records = 0;
    for (const r of Object.values(RESOURCES)) records += db.prepare(`SELECT COUNT(*) n FROM ${r.table} WHERE user_id = ? AND deleted_at IS NULL`).get(req.user.id).n;
    res.json({
      version: APP_VERSION, integrity: health.integrity || 'ok', restored: health.restore || null, backup_error: health.backup_error || null,
      last_saved_at: last ? last.at : null, last_backup: backups[0] || null, backups: backups.length, records,
    });
  });
  api.post('/system/integrity', (req, res) => { health.integrity = integrity(db); res.json({ integrity: health.integrity }); });
  api.get('/system/backups', (_req, res) => res.json(dataDir ? listBackups(dataDir) : []));
  api.post('/system/backups', (req, res) => {
    if (!dataDir) throw new HttpError(503, 'Backups are available in the desktop app');
    const b = backupNow(db, dataDir, 'manual');
    audit(db, req.user.id, 'export', null, 'export', `Backup written: ${b.file}`);
    res.status(201).json(b);
  });
  api.get('/system/backups/:name/download', (req, res) => {
    if (!dataDir) throw new HttpError(503, 'Backups are available in the desktop app');
    const file = backupFile(dataDir, req.params.name);
    audit(db, req.user.id, 'export', null, 'export', `Saved a copy of backup ${req.params.name}`);
    res.download(file, req.params.name);
  });
  api.post('/system/backups/import', express.raw({ type: () => true, limit: '2gb' }), (req, res) => {
    if (!dataDir) throw new HttpError(503, 'Backups are available in the desktop app');
    const known = fs.readdirSync(path.join(ROOT, 'server', 'migrations')).filter((f) => f.endsWith('.sql') || f.endsWith('.cjs'));
    const r = importBackup(dataDir, req.body, known);
    audit(db, req.user.id, 'export', null, 'settings', `Imported backup ${r.file} (verified)`);
    res.status(201).json(r);
  });
  api.post('/system/backups/:name/restore', (req, res) => {
    if (!dataDir) throw new HttpError(503, 'Restore is available in the desktop app');
    const r = scheduleRestore(dataDir, req.params.name);
    audit(db, req.user.id, 'export', null, 'settings', `Restore scheduled from ${r.scheduled}; applied on next start`);
    res.json({ ...r, restart_required: true });
  });

  // ── Curriculum Vitae Studio and photograph library ───────
  api.use('/cv', cvRouter(db, { pdfRenderer }));
  api.use('/intelligence', intelligenceRouter(db, { pdfRenderer }));
  api.use('/admin', adminRouter(db));
  api.use('/knowledge', knowledgeRouter(db));
  api.use('/calendar', calendarRouter(db));
  api.use('/doc-images', docImagesRouter(db));
  api.use('/research', researchRouter(db, { pdfRenderer }));
  api.use('/portfolio', portfolioImportRouter(db));
  api.use('/integrations', integrationsRouter(db));
  api.use('/images', imageRouter(db));
  api.use('/academic', academicRouter(db, { pdfRenderer }));

  // ── Generic record API for every registered type ──────────
  api.get('/records/:type', (req, res) => {
    const { deleted, limit, offset, sort, order, ...where } = req.query;
    res.json(repo.list(db, req.user.id, req.params.type, { deleted: deleted === '1', limit, offset, sort, order, where }));
  });
  api.post('/records/:type', (req, res) => res.status(201).json(repo.create(db, req.user.id, req.params.type, req.body)));
  api.get('/records/:type/:id', (req, res) => res.json(repo.get(db, req.user.id, req.params.type, req.params.id)));
  api.patch('/records/:type/:id', (req, res) => res.json(repo.update(db, req.user.id, req.params.type, req.params.id, req.body)));
  api.delete('/records/:type/:id', (req, res) => res.json(repo.remove(db, req.user.id, req.params.type, req.params.id)));
  api.post('/records/:type/:id/restore', (req, res) => res.json(repo.restore(db, req.user.id, req.params.type, req.params.id)));
  api.get('/records/:type/:id/evidence', (req, res) => res.json(repo.listEvidence(db, req.user.id, req.params.type, req.params.id)));
  api.post('/records/:type/:id/evidence', (req, res) => res.status(201).json(repo.attachEvidence(db, req.user.id, req.params.type, req.params.id, req.body)));
  api.delete('/records/:type/:id/evidence/:linkId', (req, res) => res.json(repo.detachEvidence(db, req.user.id, req.params.type, req.params.id, req.params.linkId)));
  api.get('/records/:type/:id/secret/:field', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json(repo.revealSecret(db, req.user.id, req.params.type, req.params.id, req.params.field));
  });
  api.get('/records/:type/:id/history', (req, res) => res.json(repo.history(db, req.user.id, req.params.type, req.params.id)));

  api.use((_req, _res, next) => next(new HttpError(404, 'Not found')));
  app.use('/api', api);

  // ── Static web client (production build) ──────────────────
  const dist = path.join(ROOT, 'web', 'dist');
  if (fs.existsSync(dist)) {
    app.use(express.static(dist, { index: false, maxAge: '1h' }));
    app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
  }

  // ── Errors ────────────────────────────────────────────────
  app.use((err, _req, res, _next) => {
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Malformed JSON' });
    // Request-body errors from the parsers carry their own status; answer with a plain message, never internals.
    if (err.type === 'entity.too.large') { res.setHeader('Connection', 'close'); return res.status(413).json({ error: 'The request is too large.' }); }
    if (typeof err.type === 'string' && err.type.startsWith('entity.') || err.type === 'charset.unsupported' || err.type === 'encoding.unsupported') {
      return res.status(err.status && err.status < 500 ? err.status : 400).json({ error: 'The request could not be read.' });
    }
    if (err instanceof HttpError) {
      // An upload rejected before its body was read leaves the connection unusable; close it.
      if (err.status === 413 || err.status === 415) res.setHeader('Connection', 'close');
      return res.status(err.status).json({ error: err.message, details: err.details });
    }
    console.error(err);
    res.status(500).json({ error: 'Internal error' });
  });
  return app;
}
