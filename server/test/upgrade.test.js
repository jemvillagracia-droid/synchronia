// Upgrading an existing database: every pending migration must apply to a populated database without losing rows,
// and must not rely on PRAGMA writable_schema (refused by the defensive-mode SQLite inside Electron).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { openDatabase } from '../src/db.js';

const DIR = path.join(import.meta.dirname, '..', 'migrations');

test('no migration edits sqlite_master directly', () => {
  for (const f of fs.readdirSync(DIR)) assert.doesNotMatch(fs.readFileSync(path.join(DIR, f), 'utf8').replace(/^\s*\/\/.*$/gm, ''), /writable_schema/i, f);
});

test('a 1.0.0 database with CVs upgrades without losing sections, and accepts the portfolio CV type', () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'synchronia-upg-')), 'synchronia.db');
  // Build the database as 1.0.0 left it: the .sql migrations up to 009 only.
  const old = new DatabaseSync(file);
  old.exec('PRAGMA foreign_keys = ON');
  old.exec("CREATE TABLE schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')))");
  for (const f of fs.readdirSync(DIR).filter((f) => f.endsWith('.sql') && f < '008').sort()) {
    old.exec(fs.readFileSync(path.join(DIR, f), 'utf8'));
    old.prepare('INSERT INTO schema_migrations (name) VALUES (?)').run(f);
  }
  const uid = old.prepare('SELECT id FROM users LIMIT 1').get()?.id
    ?? old.prepare("INSERT INTO users (email, password_hash) VALUES ('owner@local', 'x') RETURNING id").get().id;
  const cv = old.prepare("INSERT INTO cv_profiles (user_id, name, cv_type) VALUES (?, 'Academic CV', 'academic') RETURNING id").get(uid).id;
  for (let i = 0; i < 5; i++) old.prepare('INSERT INTO cv_sections (cv_profile_id, section_key, heading, sort_order) VALUES (?, ?, ?, ?)').run(cv, `s${i}`, `Section ${i}`, i);
  old.close();

  const db = openDatabase(file);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM cv_profiles').get().n, 1);
  assert.ok(db.prepare('SELECT COUNT(*) AS n FROM cv_sections WHERE cv_profile_id = ?').get(cv).n >= 5, 'sections kept');
  assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
  assert.equal(db.prepare('PRAGMA foreign_key_check').all().length, 0);
  assert.equal(db.prepare('PRAGMA foreign_keys').get().foreign_keys, 1, 'foreign keys back on');
  db.prepare("UPDATE cv_profiles SET cv_type = 'portfolio' WHERE id = ?").run(cv);
  db.prepare('DELETE FROM cv_profiles WHERE id = ?').run(cv);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM cv_sections').get().n, 0, 'cascade still applies after the rebuild');
  db.close();
});

test('1.2: statements and signatories entered in Settings move into existing syllabi, filling only empty places', async () => {
  const { createRequire } = await import('node:module');
  const require = createRequire(import.meta.url);
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'synchronia-upg2-')), 'synchronia.db');
  const old = new DatabaseSync(file);
  old.exec('PRAGMA foreign_keys = ON');
  old.exec("CREATE TABLE schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')))");
  for (const f of fs.readdirSync(DIR).filter((f) => f < '015').sort()) {
    if (f.endsWith('.sql')) old.exec(fs.readFileSync(path.join(DIR, f), 'utf8'));
    else if (f.endsWith('.cjs')) require(path.join(DIR, f))(old);
    else continue;
    old.prepare('INSERT INTO schema_migrations (name) VALUES (?)').run(f);
  }
  const uid = old.prepare("INSERT INTO users (email, password_hash) VALUES ('o@local', 'x') RETURNING id").get().id;
  old.prepare('INSERT INTO institution_settings (user_id, data_json) VALUES (?, ?)').run(uid, JSON.stringify({ vision: 'Excellence in teacher education', dean_name: 'Dr. Dean', dean_title: 'College Dean', program_head_name: 'Prof. Head' }));
  const course = old.prepare("INSERT INTO courses (user_id, code, title) VALUES (?, 'ED 1', 'Ed') RETURNING id").get(uid).id;
  const a = old.prepare('INSERT INTO syllabi (user_id, course_id, content_json) VALUES (?, ?, ?) RETURNING id').get(uid, course, JSON.stringify({ signatories: { approved_by_name: 'Own Approver' } })).id;
  const b = old.prepare("INSERT INTO syllabi (user_id, course_id, content_json, document_json) VALUES (?, ?, '{}', ?) RETURNING id").get(uid, course, JSON.stringify({ type: 'doc', content: [] })).id;
  old.close();

  const db = openDatabase(file);
  const ca = JSON.parse(db.prepare('SELECT content_json FROM syllabi WHERE id = ?').get(a).content_json);
  assert.equal(ca.vmgo.vision, 'Excellence in teacher education');
  assert.equal(ca.signatories.reviewed_by_name, 'Prof. Head');
  assert.equal(ca.signatories.approved_by_name, 'Own Approver', 'a syllabus\'s own signatory is never replaced');
  assert.equal(db.prepare('SELECT content_json FROM syllabi WHERE id = ?').get(b).content_json, '{}', 'already-converted documents are left alone');
  assert.match(db.prepare('SELECT data_json FROM institution_settings').get().data_json, /Dr\. Dean/, 'the original values stay stored');
  db.close();
});
