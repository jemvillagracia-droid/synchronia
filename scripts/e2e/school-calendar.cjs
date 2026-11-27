// School calendar import in the real app:
//   npm run build && xvfb-run -a node scripts/e2e/school-calendar.cjs   (Linux; on Windows omit xvfb-run)
// Upload a Word academic calendar, check and edit what was read, save, see the dates on the calendar (ranges and
// no-class days included), then remove the whole import.
const { _electron } = require('playwright');
const fs = require('fs'); const path = require('path');
const S = fs.mkdtempSync(path.join(require('os').tmpdir(), 'synchronia-schoolcal-')); fs.mkdirSync(S + '/shots'); const R = [];
const ok = (n, c, x = '') => { R.push(!!c); console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${x ? '  ' + x : ''}`); };
(async () => {
  const { Document, Packer, Paragraph, Table, TableRow, TableCell } = await import('docx');
  const row = (a, b) => new TableRow({ children: [new TableCell({ children: [new Paragraph(a)] }), new TableCell({ children: [new Paragraph(b)] })] });
  const file = S + '/Academic Calendar SY 2026-2027.docx';
  fs.writeFileSync(file, await Packer.toBuffer(new Document({ sections: [{ children: [
    new Paragraph('UNIVERSITY ACADEMIC CALENDAR'), new Paragraph('School Year 2026-2027'),
    new Table({ rows: [row('DATE', 'ACTIVITY'), row('July 20-31, 2026', 'Enrollment for the First Semester'), row('August 10, 2026 (Monday)', 'Opening of Classes'),
      row('August 21', 'Ninoy Aquino Day'), row('September 21 – 26', 'Preliminary Examinations'), row('October 5', 'World Teachers Day Celebration'),
      row('Oct. 19-24', 'Midterm Examinations'), row('November 1-2', 'All Saints and All Souls Day — No Classes'), row('December 14-19', 'Final Examinations'),
      row('December 21, 2026 – January 3, 2027', 'Christmas Break'), row('January 8', 'Deadline of Submission of Grades')] }),
  ] }] })));
  const app = await _electron.launch({ executablePath: require('electron'), args: ['--no-sandbox', path.join(__dirname, '..', '..')], env: { ...process.env, SYNCHRONIA_DATA_DIR: S + '/data' }, timeout: 90000 });
  const w = await app.firstWindow(); w.on('dialog', (d) => d.accept().catch(() => {}));
  const errors = []; w.on('pageerror', (e) => errors.push(e.message)); w.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await w.setViewportSize({ width: 1440, height: 950 });
  await w.waitForSelector('.eva-status', { timeout: 30000 });
  const api = (m, u, b) => w.evaluate(async ([m, u, b]) => { const r = await fetch('/api' + u, { method: m, headers: { 'Content-Type': 'application/json', 'X-Synchronia': '1' }, body: b ? JSON.stringify(b) : undefined }); return { status: r.status, body: await r.json().catch(() => null) }; }, [m, u, b]);
  await api('PUT', '/profile', { full_name: 'Maria Santos' });

  await w.getByRole('link', { name: 'Academic Calendar' }).click(); await w.waitForSelector('.cal-cells');
  await w.getByRole('button', { name: 'Import school calendar' }).click();
  await w.waitForSelector('.sci-drop');
  ok('Import window opens from the Academic Calendar', await w.locator('.overlay').getAttribute('aria-label') === 'Import school calendar');
  await w.screenshot({ path: S + '/shots/1-choose.png' });
  await w.locator('.sci input[type=file]').setInputFiles(file);
  await w.waitForSelector('.sci-table', { timeout: 15000 });
  const rows = w.locator('.sci-row:not(.sci-th)');
  const n = await rows.count();
  ok('Every date in the file is read', n === 10, `${n} rows`);
  ok('School year is recognised', (await w.locator('.sci .modal-body').innerText()).includes('2026–2027'));
  const firstTitle = await rows.nth(0).locator('.sci-what input').inputValue();
  ok('Ranges, titles and types are read', firstTitle === 'Enrollment for the First Semester' && await rows.nth(0).locator('input[type=date]').nth(1).inputValue() === '2026-07-31'
    && await rows.nth(0).locator('select').inputValue() === 'enrollment');
  const xmas = rows.filter({ has: w.locator('input[value="Christmas Break"]') });
  ok('A range across the new year is read (Dec 21 – Jan 3) as a break with no classes', await xmas.locator('input[type=date]').nth(0).inputValue() === '2026-12-21' && await xmas.locator('input[type=date]').nth(1).inputValue() === '2027-01-03'
    && await xmas.locator('select').inputValue() === 'break' && await xmas.locator('input[type=checkbox]').nth(1).isChecked());
  await w.screenshot({ path: S + '/shots/2-review.png' });
  // Edit one, untick one
  const tdy = rows.filter({ has: w.locator('input[value="World Teachers Day Celebration"]') });
  await tdy.locator('.sci-what input').fill("World Teachers' Day Program");
  const ninoy = rows.filter({ has: w.locator('input[value="Ninoy Aquino Day"]') });
  await ninoy.locator('input[type=checkbox]').first().uncheck();
  ok('Footer counts what will be saved', /9 dates selected/.test(await w.locator('.sci .modal-foot').innerText()));
  const overflow = await w.evaluate(() => { const b = document.querySelector('.sci').getBoundingClientRect(); return [...document.querySelectorAll('.sci input, .sci select, .sci button')].filter((e) => e.offsetParent && e.getBoundingClientRect().right > b.right + 1).length; });
  ok('Nothing in the review sticks out of the window', overflow === 0, String(overflow));
  await w.getByRole('button', { name: /^Save 9 dates/ }).click();
  await w.waitForSelector('.sci', { state: 'detached', timeout: 10000 });
  await w.waitForTimeout(800);
  ok('After saving, the calendar opens where the school year begins', (await w.locator('.cal-month').innerText()) === 'July 2026');
  const july = await w.locator('.cal-cells').innerText();
  ok('Range shows on each of its days', (await w.locator('.cal-cell', { hasText: 'Enrollment for the First Semester' }).count()) >= 10, `${await w.locator('.cal-cell', { hasText: 'Enrollment' }).count()} days`);
  await w.screenshot({ path: S + '/shots/3-july.png' });
  await w.getByRole('button', { name: 'Next month' }).click(); await w.getByRole('button', { name: 'Next month' }).click(); await w.getByRole('button', { name: 'Next month' }).click(); await w.waitForTimeout(700);
  ok('Edited title was saved', (await w.locator('.cal-cells').innerText()).includes("World Teachers' Day Program"));
  await w.getByRole('button', { name: 'Next month' }).click(); await w.waitForTimeout(700);
  const nov2 = w.locator('.cal-cell').filter({ hasText: 'All Saints' });
  ok('No-class days are marked on the grid', (await nov2.count()) >= 2 && /no-classes/.test(await nov2.first().getAttribute('class')));
  await w.getByRole('button', { name: 'Next month' }).click(); await w.waitForTimeout(700);
  await w.screenshot({ path: S + '/shots/4-december.png' });
  await w.locator('.cal-cell', { hasText: 'Christmas Break' }).first().click();
  const panel = await w.locator('.cal-layout aside').innerText();
  ok('Day panel names the school calendar entry and its type', /Christmas Break/.test(panel) && /Break · no classes/.test(panel), panel.slice(0, 120));
  await w.getByRole('button', { name: 'Next month' }).click(); await w.waitForTimeout(700);
  ok('A range that began last month continues into January', (await w.locator('.cal-cell:not(.out)', { hasText: 'Christmas Break' }).count()) === 3);
  ok('Unticked date was not saved', !(await api('GET', '/calendar?from=2026-08-01&to=2026-08-31')).body.events.some((e) => e.type === 'school_calendar' && /Ninoy/.test(e.title)));
  // Same file again: everything already there
  await w.getByRole('button', { name: 'Import school calendar' }).click(); await w.waitForSelector('.sci-drop');
  ok('Earlier imports are listed with a way to remove them', /Academic Calendar SY 2026-2027\.docx/.test(await w.locator('.sci').innerText()));
  await w.locator('.sci input[type=file]').setInputFiles(file); await w.waitForSelector('.sci-table');
  ok('Importing the same calendar again marks saved dates (renamed ones too) and leaves them unticked', (await w.locator('.sci .tag', { hasText: 'Already in your calendar' }).count()) === 9 && /1 date selected/.test(await w.locator('.sci .modal-foot').innerText()));
  await w.getByRole('button', { name: 'Choose another file' }).click();
  await w.getByRole('button', { name: 'Remove these dates' }).click(); await w.waitForTimeout(900);
  ok('Removing an import takes all its dates off the calendar', (await api('GET', '/calendar?from=2026-07-01&to=2027-01-31')).body.events.filter((e) => e.type === 'school_calendar').length === 0);
  await w.keyboard.press('Escape');
  // A picture is refused with a clear message
  await w.getByRole('button', { name: 'Import school calendar' }).click(); await w.waitForSelector('.sci-drop');
  fs.writeFileSync(S + '/photo.jpg', Buffer.from([0xff, 0xd8, 0xff, 0xe0]));
  await w.locator('.sci input[type=file]').setInputFiles(S + '/photo.jpg'); await w.waitForTimeout(500);
  ok('A broken picture is refused with advice', /could not be read|No text could be read/.test(await w.locator('.sci .alert').innerText()));
  // A real photo of a calendar is read (offline OCR) and reviewed like any file.
  await w.locator('.sci input[type=file]').setInputFiles(path.join(__dirname, '..', '..', 'server', 'test', 'fixtures', 'calendar-photo.jpg'));
  await w.waitForSelector('.sci-table', { timeout: 60000 });
  const photoNote = await w.locator('.sci [role=note]').innerText();
  const photoRows = await w.locator('.sci-row:not(.sci-th)').count();
  ok('A photo of the calendar is read, with a notice to check it against the original', photoRows === 8 && /read from a photo/.test(photoNote), `${photoRows} rows · ${photoNote.slice(0, 80)}`);
  await w.getByRole('button', { name: 'Choose another file' }).click();
  await w.locator('.sci-paste summary').click(); await w.fill('.sci-paste textarea', 'SY 2026-2027\nFebruary 25 — EDSA People Power Anniversary');
  await w.getByRole('button', { name: 'Read the text' }).click(); await w.waitForSelector('.sci-table');
  ok('Pasted text is read too', await w.locator('.sci-row:not(.sci-th) input[type=date]').first().inputValue() === '2027-02-25');
  await w.keyboard.press('Escape');
  const real = errors.filter((e) => !/favicon|ResizeObserver|422|415/.test(e));
  ok('No errors in the console', real.length === 0, real.slice(0, 3).join(' | '));
  await app.close();
  console.log(`\n${R.filter(Boolean).length}/${R.length} checks passed — screenshots in ${S}/shots`);
  process.exit(R.every(Boolean) ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
