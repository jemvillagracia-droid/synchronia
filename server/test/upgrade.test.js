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
