// Calendar: Philippine and Australian public holidays computed from the rules, owner corrections, and dated records.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'synchronia-cal-'));
process.env.SYNCHRONIA_DATA_DIR = tmp;
const { openDatabase } = await import('../src/db.js');
const { createApp } = await import('../src/app.js');
const { easter, nthWeekday, philippineHolidays, australianHolidays } = await import('../src/calendar/holidays.js');

const TOKEN = 'calendar-test-token-'.padEnd(48, 'k');
let server, base, db, cookie = '';
async function call(method, url, body) {
  const r = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json', 'X-Synchronia': '1', Cookie: cookie }, body: body === undefined ? undefined : JSON.stringify(body) });
  const t = await r.text();
  return { status: r.status, body: t ? JSON.parse(t) : null };
}
const ok = (r, code = 200) => { assert.equal(r.status, code, JSON.stringify(r.body)); return r.body; };
const names = (list, date) => list.filter((h) => h.date === date).map((h) => h.name);

before(async () => {
  db = openDatabase(':memory:');
  server = createApp(db, { accessToken: TOKEN }).listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}/api`;
  cookie = (await fetch(`${base}/open?token=${TOKEN}`, { redirect: 'manual' })).headers.get('set-cookie').split(';')[0];
});
after(() => { server.close(); db.close(); fs.rmSync(tmp, { recursive: true, force: true }); });

test('Easter and weekday rules', () => {
  assert.deepEqual([2019, 2024, 2025, 2026, 2027, 2038].map(easter), ['2019-04-21', '2024-03-31', '2025-04-20', '2026-04-05', '2027-03-28', '2038-04-25']);
  assert.equal(nthWeekday(2026, 8, 1, -1), '2026-08-31', 'last Monday of August 2026');
  assert.equal(nthWeekday(2026, 6, 1, 2), '2026-06-08', 'second Monday of June 2026');
  assert.equal(nthWeekday(2026, 11, 2, 1), '2026-11-03', 'first Tuesday of November 2026');
});

test('Philippine holidays 2026 follow RA 9492 as amended', () => {
  const ph = philippineHolidays(2026);
  const reg = ph.filter((h) => h.type === 'regular' && !h.estimated).map((h) => h.date).sort();
  assert.deepEqual(reg, ['2026-01-01', '2026-04-02', '2026-04-03', '2026-04-09', '2026-05-01', '2026-06-12', '2026-08-31', '2026-11-30', '2026-12-25', '2026-12-30']);
  assert.deepEqual(names(ph, '2026-04-04'), ['Black Saturday']);
  assert.deepEqual(names(ph, '2026-02-17'), ['Chinese New Year']);
  for (const d of ['2026-08-21', '2026-11-01', '2026-12-08', '2026-12-24', '2026-12-31']) assert.equal(ph.find((h) => h.date === d).type, 'special', d);
  const eids = ph.filter((h) => /Eid/.test(h.name));
  assert.equal(eids.length, 2);
  assert.ok(eids.every((h) => h.estimated && /proclamation/.test(h.note)), 'proclaimed dates are flagged as estimates');
  assert.ok(philippineHolidays(2040).every((h) => !/Eid/.test(h.name)), 'no guessed Eid dates beyond the known table');
});

test('Australian holidays: national days, state days and substitute days', () => {
  const vic = australianHolidays(2026, 'VIC');
  assert.deepEqual(names(vic, '2026-03-09'), ['Labour Day']);
  assert.deepEqual(names(vic, '2026-11-03'), ['Melbourne Cup Day']);
  assert.deepEqual(names(vic, '2026-12-28'), ['Boxing Day (observed)'], 'Boxing Day on a Saturday is observed on Monday');
  const nsw27 = australianHolidays(2027, 'NSW');
  assert.deepEqual(names(nsw27, '2027-12-27'), ['Christmas Day (observed)']);
  assert.deepEqual(names(nsw27, '2027-12-28'), ['Boxing Day (observed)']);
  assert.deepEqual(names(nsw27, '2027-10-04'), ['Labour Day']);
  const qld = australianHolidays(2026, 'QLD');
  assert.deepEqual(names(qld, '2026-10-05'), ["King's Birthday"], 'Queensland: first Monday of October');
  assert.deepEqual(names(qld, '2026-05-04'), ['Labour Day']);
  const wa = australianHolidays(2026, 'WA');
  assert.ok(!wa.some((h) => h.name === 'Easter Saturday'));
  assert.ok(wa.find((h) => h.name === "King's Birthday").estimated);
  assert.deepEqual(names(australianHolidays(2026, 'SA'), '2026-12-26'), ['Proclamation Day']);
  assert.deepEqual(names(australianHolidays(2026, 'ACT'), '2026-06-01'), ['Reconciliation Day'], 'Monday on or after 27 May (a Wednesday in 2026)');
});

test('calendar API: settings, holidays by region, corrections that win, and dated records', async () => {
  let s = ok(await call('GET', '/calendar/settings'));
  assert.deepEqual([s.show_ph, s.show_au, s.au_state], [true, false, 'VIC']);
  assert.equal((await call('PUT', '/calendar/settings', { au_state: 'XX' })).status, 422);
  s = ok(await call('PUT', '/calendar/settings', { show_au: true, au_state: 'NSW', week_start: 1 }));
  assert.deepEqual([s.show_au, s.au_state, s.week_start], [true, 'NSW', 1]);

  let c = ok(await call('GET', '/calendar?from=2026-03-01&to=2026-03-31'));
  const eid = c.holidays.find((h) => h.region === 'PH' && /Eid'l Fitr/.test(h.name));
  assert.equal(eid.date, '2026-03-20');
  // The proclamation says otherwise: move it.
  ok(await call('POST', '/calendar/holidays', { region: 'PH', date: '2026-03-21', name: "Eid'l Fitr (Feast of Ramadan)", holiday_type: 'regular', note: 'Proclamation No. 000', replaces: { date: '2026-03-20', name: eid.name } }), 201);
  c = ok(await call('GET', '/calendar?from=2026-03-01&to=2026-03-31'));
  assert.deepEqual(c.holidays.filter((h) => /Eid'l Fitr/.test(h.name)).map((h) => [h.date, h.source]), [['2026-03-21', 'you']]);
  // A one-off special non-working day, and hiding a rule-based day.
  ok(await call('POST', '/calendar/holidays', { region: 'PH', date: '2026-07-27', name: 'Special non-working day (typhoon)', holiday_type: 'special' }), 201);
  ok(await call('POST', '/calendar/holidays/hide', { region: 'AU', date: '2026-10-05', name: 'Labour Day' }));
  c = ok(await call('GET', '/calendar?from=2026-07-01&to=2026-10-31'));
  assert.ok(c.holidays.some((h) => h.date === '2026-07-27'));
  assert.ok(!c.holidays.some((h) => h.region === 'AU' && h.name === 'Labour Day'));
  const corrections = ok(await call('GET', '/calendar/holidays/corrections'));
  assert.equal(corrections.length, 4);
  ok(await call('DELETE', `/calendar/holidays/corrections/${corrections.find((x) => x.action === 'remove' && x.region === 'AU').id}`));
  assert.ok(ok(await call('GET', '/calendar?from=2026-10-01&to=2026-10-31')).holidays.some((h) => h.region === 'AU' && h.name === 'Labour Day'));
  assert.equal((await call('POST', '/calendar/holidays', { region: 'JP', date: '2026-01-01', name: 'x' })).status, 422);

  // Dated records appear, each linked to its record.
  ok(await call('POST', '/records/tasks', { title: 'Submit grades', due_date: '2026-10-15', is_deadline: true }), 201);
  ok(await call('POST', '/records/meetings', { title: 'College council', meeting_date: '2026-10-07', start_time: '14:00' }), 201);
  ok(await call('POST', '/records/licenses', { license_type: 'Registered Psychometrician', issuing_authority: 'PRC', registration_date: '2019-10-01', valid_until: '2026-10-30' }), 201);
  ok(await call('POST', '/records/trainings', { title: 'Clocked In: A Symposium', role: 'speaker', start_date: '2026-10-20' }), 201);
  c = ok(await call('GET', '/calendar?from=2026-10-01&to=2026-10-31&show_ph=0&show_au=0'));
  assert.equal(c.holidays.length, 0, 'regions can be switched off per request');
  assert.deepEqual(c.events.map((e) => [e.date, e.kind]), [['2026-10-07', 'meeting'], ['2026-10-15', 'deadline'], ['2026-10-20', 'speaking'], ['2026-10-30', 'renewal']]);
  assert.ok(c.events.every((e) => e.type && e.id));
  for (const q of ['from=2026-10-31&to=2026-10-01', 'from=x&to=y', 'from=2020-01-01&to=2026-01-01']) assert.equal((await call('GET', `/calendar?${q}`)).status, 422, q);
});
