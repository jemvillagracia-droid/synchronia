import express from 'express';
import { HttpError, audit } from '../repo.js';
import { METRICS, SECTIONS, SUPPORT, analytics, computeMetric, parseFilters } from './analytics.js';
import { REPORT_TYPES, analyticsWorkbook, generateReport } from './reports.js';

export function intelligenceRouter(db, { pdfRenderer } = {}) {
  const r = express.Router();
  const u = (req) => req.user.id;

  r.get('/catalog', (_req, res) => res.json({
    sections: SECTIONS,
    metrics: METRICS.map(({ key, section, label, resource, basis }) => ({ key, section, label, resource, basis })),
    support: SUPPORT,
    reports: Object.entries(REPORT_TYPES).map(([key, d]) => ({ key, label: d.label, short: d.short, description: d.description, metrics: d.metrics })),
    pdf_available: !!pdfRenderer,
  }));
  r.get('/analytics', (req, res) => res.json(analytics(db, u(req), req.query)));
  r.get('/metrics/:key', (req, res) => {
    const m = METRICS.find((x) => x.key === req.params.key);
    if (!m) throw new HttpError(404, 'Unknown indicator');
    res.json(computeMetric(db, u(req), m, parseFilters(req.query)));
  });
  r.get('/analytics.xlsx', async (req, res) => {
    const buf = await analyticsWorkbook(db, u(req), req.query);
    audit(db, u(req), 'reports', null, 'export', 'Exported analytics spreadsheet');
    res.attachment(`SYNCHRONIA_Analytics_${new Date().toISOString().slice(0, 10)}.xlsx`)
      .type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').send(buf);
  });
  r.post('/reports', async (req, res) => {
    const out = await generateReport(db, u(req), req.body || {}, { pdfRenderer });
    audit(db, u(req), 'reports', out.id, 'export', `Generated ${out.file_name}`);
    res.status(201).json(out);
  });
  r.get('/reports', (req, res) => res.json(db.prepare(`SELECT id, report_type, title, period_start, period_end, format, params_json, created_at FROM reports
      WHERE user_id = ? AND report_type LIKE 'intelligence_%' ORDER BY id DESC LIMIT 200`).all(u(req)).map((x) => ({ ...x, params: x.params_json ? JSON.parse(x.params_json) : null, params_json: undefined,
    download: `/api/academic/reports/${x.id}/download` }))));
  return r;
}
