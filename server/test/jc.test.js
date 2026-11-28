// DBM-CHED credentials checklist (JC No. 01 s. 2026, Annex A): catalogue, claims with document statuses, planned goals,
// criterion caps, the reclassification CV type, and importing a credentials tracker workbook.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import ExcelJS from 'exceljs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'synchronia-jc-'));
process.env.SYNCHRONIA_DATA_DIR = tmp;
const { openDatabase } = await import('../src/db.js');
const repo = await import('../src/repo.js');
const jc = await import('../src/portfolio/jc.js');
const imp = await import('../src/portfolio/jcimport.js');
const cv = await import('../src/cv/model.js');

const db = openDatabase(path.join(tmp, 's.db'));
const uid = Number(db.prepare("INSERT INTO users (email, password_hash) VALUES ('o@x.local', '!')").run().lastInsertRowid);
db.prepare('INSERT OR IGNORE INTO user_profiles (user_id) VALUES (?)').run(uid);
const ind = (c, code) => c.kras.flatMap((k) => k.criteria.flatMap((x) => x.indicators)).find((i) => i.code === code);

test('the catalogue follows Annex A: four KRAs of 100 points, criterion maxima and indicator points', () => {
  assert.deepEqual(jc.KRAS.map((k) => [k.code, k.max]), [['I', 100], ['II', 100], ['III', 100], ['IV', 100]]);
  const max = Object.fromEntries(jc.KRAS.flatMap((k) => k.criteria.map((c) => [c.code, c.max])));
  assert.deepEqual([max['I.A'], max['I.B'], max['I.C'], max['III.A'], max['III.B'], max['III.C'], max['IV.A'], max['IV.B'], max['IV.C']], [60, 30, 10, 30, 50, 20, 20, 60, 20]);
  const p = (c) => jc.INDICATORS.get(c).points;
  assert.deepEqual([p('I.C.1.1.DD'), p('I.C.1.2.MT'), p('II.A.3'), p('II.C.2.2'), p('III.B.1.5.1'), p('IV.A.1'), p('IV.B.1.4'), p('IV.B.2.1'), p('IV.B.3.2'), p('IV.C.1.3')], [10, 2, 50, 10, 2, 5, 40, 1, 5, 4]);
  assert.ok([...jc.INDICATORS.values()].every((i) => i.evidence.length), 'every indicator lists its required documents');
});

test('records are suggested, claimed with document statuses, and capped at the criterion maximum', () => {
  for (let i = 0; i < 12; i++) repo.create(db, uid, 'trainings', { title: `Seminar ${i}`, start_date: `2025-0${(i % 9) + 1}-01`, role: 'participant' });
  const sp = repo.create(db, uid, 'trainings', { title: 'Talk on wellbeing', start_date: '2025-02-02', role: 'speaker', hours: 3 });
  let c = jc.checklist(db, uid);
  assert.equal(ind(c, 'IV.B.2.1').suggestions.length, 12, 'trainings attended are suggested as local capacity building');
  const s = ind(c, 'III.B.1.5.1').suggestions.find((x) => x.id === sp.id);
  assert.equal(s.quantity, 3, 'a resource speakership is suggested per hour');
  for (const t of ind(c, 'IV.B.2.1').suggestions) jc.addClaim(db, uid, { indicator: 'IV.B.2.1', type: 'trainings', id: t.id });
  c = jc.checklist(db, uid);
  assert.equal(ind(c, 'IV.B.2.1').estimated, 10, '12 seminars at 1 point each stop at the indicator’s 10-point cap');
  assert.equal(ind(c, 'IV.B.2.1').suggestions.length, 0, 'claimed records are no longer suggested');
  const claim = ind(c, 'IV.B.2.1').claims[0];
  assert.equal(claim.docs.length, jc.INDICATORS.get('IV.B.2.1').evidence.length);
  jc.updateClaim(db, uid, claim.claim_id, { docs: { 0: 'secured', 1: 'missing' } });
  c = jc.checklist(db, uid);
  assert.deepEqual(ind(c, 'IV.B.2.1').claims[0].docs.slice(0, 3).map((d) => d.status), ['secured', 'missing', 'unset']);
  assert.equal(c.actions[0].status, 'missing', 'missing documents come first in the action list');
  assert.throws(() => jc.updateClaim(db, uid, claim.claim_id, { docs: { 0: 'maybe' } }), /secured, missing, pending/);
  assert.throws(() => jc.addClaim(db, uid, { indicator: 'IV.B.2.1', type: 'trainings', id: claim.id }), /already claimed/);
  assert.throws(() => jc.addClaim(db, uid, { indicator: 'IX.Z', type: 'note', note: 'x' }), /indicator/);
});

test('ratings scale the indicator’s weight; planned goals are projected, not counted', () => {
  jc.addClaim(db, uid, { indicator: 'I.A.1', type: 'note', note: 'SET average AY 2023–2026', quantity: 90 });
  jc.addClaim(db, uid, { indicator: 'IV.B.1.4', type: 'note', note: 'PhD in Psychology', status: 'planned' });
  const c = jc.checklist(db, uid);
  assert.equal(ind(c, 'I.A.1').estimated, 32.4, '90% of the 36 SET points');
  assert.equal(ind(c, 'IV.B.1.4').estimated, 0);
  assert.ok(c.projected >= 40, 'the planned doctorate is projected');
  assert.throws(() => jc.addClaim(db, uid, { indicator: 'I.A.2', type: 'note', note: 'SEF', quantity: 140 }), /rating/);
});

test('the reclassification CV follows the four KRAs and the analyzer checks them', () => {
  const r = cv.createCv(db, uid, { name: 'Reclassification CV', cv_type: 'reclassification' });
  const secs = db.prepare('SELECT section_key, heading, visible FROM cv_sections WHERE cv_profile_id = ? ORDER BY sort_order').all(r.id).filter((x) => x.visible);
  assert.equal(secs[0].section_key, 'education');
  const keys = secs.map((x) => x.section_key);
  assert.ok(keys.indexOf('teaching') < keys.indexOf('publications') && keys.indexOf('publications') < keys.indexOf('extension') && keys.indexOf('extension') < keys.indexOf('development'), 'KRA I, II, III, IV in order');
  assert.match(secs.find((x) => x.section_key === 'teaching').heading, /^KRA I · Instruction/);
});

test('a credentials tracker workbook imports as records, claims, document statuses and planned goals', async () => {
  const wb = new ExcelJS.Workbook();
  const sheet = (name, title, header, rows) => { const ws = wb.addWorksheet(name); ws.addRow([title]); ws.mergeCells('A1:F1'); ws.addRow(header); ws.addRow(['ⓘ  note row']); for (const r of rows) ws.addRow(r); };
  sheet('📋 Cover & Legend', 'COVER', ['a', 'b'], []);
  sheet('🎤 Resource Speakerships', 'RESOURCE SPEAKERSHIPS', ['Date', 'Topic', 'Audience', 'Host / Organization', 'Location / Venue', "Level\n(Local/Nat'l/Int'l)", 'Invitation\nLetter', 'Program of\nActivity', 'Certificate of\nAppreciation', 'Authorization\n(Campus Dir/VP/Dean)', 'Remarks / Action'],
    [[new Date('2024-11-21'), 'Study Habits and Wellbeing', 'Students', 'Sample College', 'Sample Campus', 'Local', '✔ YES', '✘ NO', '✔ YES', '🔄 PENDING', 'Secure the program'],
      [new Date('2025-03-02'), 'Global Classrooms', 'Teachers', 'Sample Org', 'Singapore', "Int'l", '✔ YES', '✔ YES', '✔ YES', '— N/A', '']]);
  sheet('📚 Educational Attainment', 'EDUCATION', ['Level of Education', 'Degree / Qualification', 'Field of Study', 'Institution', 'Year Completed', 'Honors / Awards', 'CAV / Diploma / Certificate\n(Secured?)', 'Remarks / Action'],
    [['Secondary', 'High School Diploma', 'Secondary', 'Sample HS', 2014, 'N/A', '— N/A', ''],
      ['Doctorate (ASPIRATIONAL)', 'Doctor of Philosophy (PhD)', 'Psychology', 'Sample University', '', '', '☐ Future', 'Aspirational']]);
  sheet('🏛️ Professional Organizations', 'ORGS', ['Organization Name', 'Type', 'Membership Type', 'Role / Position', 'Year Joined', 'Status', 'Certificate of Membership / ID Card\n(Secured?)'],
    [['Sample Association of Educators', 'National', 'Member', 'Member', 2020, 'Active', '✔ YES']]);
  const buf = Buffer.from(await wb.xlsx.writeBuffer());
  const p = await imp.previewTracker(db, uid, buf);
  const rows = p.sheets.flatMap((s) => s.rows);
  assert.equal(rows.length, 4, 'secondary education and note rows are left out');
  const local = rows.find((r) => r.title === 'Study Habits and Wellbeing');
  assert.equal(local.indicator, 'III.B.1.5.1');
  assert.deepEqual(local.docs, { 0: 'secured', 1: 'missing', 2: 'secured', 3: 'pending' });
  assert.equal(rows.find((r) => r.title === 'Global Classrooms').indicator, 'III.B.1.5.2', 'an international engagement');
  const phd = rows.find((r) => r.type === 'education');
  assert.equal(phd.indicator, 'IV.B.1.4'); assert.equal(phd.planned, true);
  assert.ok(p.skipped.some((s) => /Cover/.test(s.sheet)));
  const res = imp.commitTracker(db, uid, { rows });
  assert.deepEqual([res.created, res.claimed, res.problems.length], [4, 4, 0]);
  const again = imp.commitTracker(db, uid, { rows: (await imp.previewTracker(db, uid, buf)).sheets.flatMap((s) => s.rows) });
  assert.deepEqual([again.created, again.reused, again.claimed], [0, 4, 0], 'importing the same workbook again duplicates nothing');
  const c = jc.checklist(db, uid);
  assert.equal(ind(c, 'III.B.1.5.1').claims.find((x) => x.title === 'Study Habits and Wellbeing').docs[3].status, 'pending');
  await assert.rejects(() => imp.previewTracker(db, uid, Buffer.from('not a workbook')), /not an Excel workbook/);
});
