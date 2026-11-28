// The search index stays one entry per record through create, edit, delete, restore and rebuild,
// and replacing an entry is a keyed lookup (it no longer scans the whole index on every save).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'synchronia-search-'));
process.env.SYNCHRONIA_DATA_DIR = tmp;
const { openDatabase, tx } = await import('../src/db.js');
const repo = await import('../src/repo.js');
const { search } = await import('../src/nexus.js');

const db = openDatabase(path.join(tmp, 's.db'));
const uid = Number(db.prepare("INSERT INTO users (email, password_hash) VALUES ('o@x.local', '!')").run().lastInsertRowid);
const entries = (type, id) => db.prepare('SELECT COUNT(*) AS n FROM search_index WHERE entity_type = ? AND entity_id = ?').get(type, id).n;
const consistent = () => {
  const idx = db.prepare('SELECT COUNT(*) AS n FROM search_index').get().n;
  const map = db.prepare('SELECT COUNT(*) AS n FROM search_rows').get().n;
  const orphans = db.prepare('SELECT COUNT(*) AS n FROM search_rows m LEFT JOIN search_index s ON s.rowid = m.fts_rowid WHERE s.rowid IS NULL').get().n;
  assert.equal(idx, map, 'every index entry is mapped'); assert.equal(orphans, 0, 'no mapping points at a missing entry');
};

test('one entry per record through edit, delete, restore and rebuild', () => {
  const t = repo.create(db, uid, 'trainings', { title: 'Seminar on inclusive assessment', start_date: '2025-03-01', hours: 8, ld_type: 'technical' });
  assert.equal(entries('trainings', t.id), 1);
  repo.update(db, uid, 'trainings', t.id, { title: 'Seminar on differentiated assessment' });
  assert.equal(entries('trainings', t.id), 1);
  assert.equal(search(db, uid, 'differentiated').results.length, 1);
  assert.equal(search(db, uid, 'inclusive').results.length, 0, 'the old wording is gone from search');
  repo.remove(db, uid, 'trainings', t.id);
  assert.equal(entries('trainings', t.id), 0);
  repo.restore(db, uid, 'trainings', t.id);
  assert.equal(entries('trainings', t.id), 1);
  consistent();
  repo.rebuildSearchIndex(db);
  assert.equal(entries('trainings', t.id), 1);
  consistent();
});

test('replacing an entry uses the keyed lookup, not a scan of the index', () => {
  const plan = db.prepare('EXPLAIN QUERY PLAN SELECT fts_rowid FROM search_rows WHERE entity_type = ? AND entity_id = ?').all('trainings', 1).map((r) => r.detail).join(' ');
  assert.match(plan, /SEARCH search_rows USING PRIMARY KEY/);
  // Saves stay flat as the index grows: the last 2,000 of 6,000 take about as long as the first 2,000.
  const batch = (k) => { const t0 = performance.now(); tx(db, () => { for (let i = 0; i < 2000; i++) repo.create(db, uid, 'tasks', { title: `Follow up item ${k}-${i}`, due_date: '2025-01-01', status: 'open', priority: 'normal', module: 'general' }); }); return performance.now() - t0; };
  const first = batch(1); batch(2); let last = batch(3);
  // A busy machine can slow one batch; measure again before calling it a slowdown (the old full scan grew ~5×).
  if (last >= first * 2.5) last = Math.min(last, batch(4));
  assert.ok(last < first * 2.5, `saves slowed as the index grew (${first.toFixed(0)} ms → ${last.toFixed(0)} ms)`);
  consistent();
});
