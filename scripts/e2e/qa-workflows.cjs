// Quality-assurance workflows from the 2nd quality-check directive, in the real desktop app:
//   npm run build && xvfb-run -a node scripts/e2e/qa-workflows.cjs   (Linux; on Windows omit xvfb-run)
// 1 typing in pop-ups (Shift symbols, accents, Backspace/Delete, Tab stays inside, Enter, Esc)  2 validation keeps input
// 3 a failed save never shows success  4 back / forward / reload / unsaved-change guard  5 search, filter, sort
// 6 recycle bin restore  7 crash recovery of autosaved work  8 backup and restore  9 identical exports  10 tablet/phone widths
const { _electron } = require('playwright');
const fs = require('fs'); const path = require('path');
const S = fs.mkdtempSync(path.join(require('os').tmpdir(), 'synchronia-qa-')); const DATA = S + '/data'; const R = [];
const ok = (n, c, x = '') => { R.push(!!c); console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${x ? '  ' + x : ''}`); };
const launch = async () => {
  for (const f of ['SingletonLock', 'SingletonCookie', 'SingletonSocket']) { try { fs.rmSync(path.join(require('os').homedir(), '.config', 'SYNCHRONIA', f)); } catch { /* none */ } }
  const app = await _electron.launch({ executablePath: require('electron'), args: ['--no-sandbox', path.join(__dirname, '..', '..')], env: { ...process.env, SYNCHRONIA_DATA_DIR: DATA, SYNCHRONIA_DOWNLOAD_DIR: S }, timeout: 180000 });
  const w = await app.firstWindow(); await w.setViewportSize({ width: 1440, height: 950 }); await w.waitForSelector('.eva-status', { timeout: 60000 });
  return { app, w };
};
(async () => {
  let { app, w } = await launch();
  let errors = []; const listen = () => { w.on('pageerror', (e) => errors.push(e.message)); w.on('console', (m) => m.type() === 'error' && errors.push(m.text())); };
  listen();
  const go = (r) => w.evaluate((r) => { history.pushState({}, '', r); dispatchEvent(new PopStateEvent('popstate')); }, r);
  const api = (m, u, b) => w.evaluate(async ([m, u, b]) => { const r = await fetch('/api' + u, { method: m, headers: { 'Content-Type': 'application/json', 'X-Synchronia': '1' }, body: b ? JSON.stringify(b) : undefined }); return { status: r.status, body: await r.json().catch(() => null) }; }, [m, u, b]);
  const key = async (keyCode, modifiers = [], char) => app.evaluate(({ BrowserWindow }, [keyCode, modifiers, char]) => {
    const wc = BrowserWindow.getAllWindows().find((b) => b.isVisible()).webContents;
    wc.sendInputEvent({ type: 'keyDown', keyCode, modifiers });
    if (char) wc.sendInputEvent({ type: 'char', keyCode: char, modifiers });
    wc.sendInputEvent({ type: 'keyUp', keyCode, modifiers });
  }, [keyCode, modifiers, char]);
  // Type text as a person would: Shift held for capitals and symbols, real key events.
  const SHIFTED = { '!': '1', '@': '2', '#': '3', '$': '4', '%': '5', '^': '6', '&': '7', '*': '8', '(': '9', ')': '0', '_': '-', '+': '=', ':': ';', '"': "'", '<': ',', '>': '.', '?': '/' };
  const typeReal = async (text) => {
    for (const ch of text) {
      const up = /[A-Z]/.test(ch); const sym = SHIFTED[ch];
      if (up || sym) { await key('Shift', ['shift']); await key(up ? ch : sym, ['shift'], ch); await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((b) => b.isVisible()).webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Shift' })); }
      else await key(/[a-z0-9]/.test(ch) ? ch.toUpperCase() : ch === ' ' ? 'Space' : ch, [], ch);
    }
    await w.waitForTimeout(150);
  };
  await api('PUT', '/profile', { full_name: 'María Peñaflor', current_position: 'Instructor I' });

  // ── 1. Typing in a pop-up ───────────────────────────────
  await go('/portfolio?new=trainings'); await w.waitForSelector('#record-form #f-title');
  await w.click('#f-title');
  const typed = 'Seminar: Guidance #1 (50%) & "Peer Support" @ URS!';
  await typeReal(typed);
  ok('Shift + letters and Shift + numbers type capitals and symbols; the pop-up stays open', await w.inputValue('#f-title') === typed && await w.locator('#record-form').count() === 1, JSON.stringify(await w.inputValue('#f-title')));
  await w.keyboard.type(' — Señor Café, Ñiño, 中文');
  ok('Accented and non-English characters are accepted', (await w.inputValue('#f-title')).endsWith('Señor Café, Ñiño, 中文'));
  await w.fill('#f-title', 'Abcdef'); await key('End'); await key('Backspace'); await key('Backspace'); await key('Home'); await key('Delete');
  ok('Backspace and Delete edit the text', await w.inputValue('#f-title') === 'bcd', await w.inputValue('#f-title'));
  let inside = true;
  for (let i = 0; i < 40; i++) { await key('Tab'); if (!await w.evaluate(() => !!document.activeElement?.closest('.overlay'))) inside = false; }
  for (let i = 0; i < 10; i++) { await key('Tab', ['shift']); if (!await w.evaluate(() => !!document.activeElement?.closest('.overlay'))) inside = false; }
  ok('Tab and Shift+Tab move through the pop-up without leaving it', inside);
  await w.click('#f-title'); await key('Enter');
  ok('Enter in a field does not submit or close the pop-up', await w.locator('#record-form').count() === 1);

  // ── 2. Validation keeps what was typed ──────────────────
  await w.fill('#f-title', ''); await w.fill('#f-hours', '-5'); await w.fill('#f-organizer', 'Philippine Mental Health Association');
  const before = (await api('GET', '/records/trainings?limit=200')).body; const nBefore = (before.items || before).length;
  await w.locator('.overlay button[type=submit]').click(); await w.waitForTimeout(700);
  const errs = await w.locator('.overlay [role=alert]').allInnerTexts();
  ok('Empty required title and a negative number are refused, each with its own message and a summary', errs.length >= 3 && /Not saved/.test(errs.join(' ')) && (await api('GET', '/records/trainings?limit=200')).body.items.length === nBefore, errs.join(' | ').slice(0, 160));
  ok('Valid input is kept after the refusal', await w.inputValue('#f-organizer') === 'Philippine Mental Health Association' && await w.inputValue('#f-hours') === '-5');
  const longNote = ('Long note with ñ, é and 中文. ').repeat(70).trim(); // the app trims outer spaces
  await w.fill('#f-title', 'Caring for Carers: PaHinga Muna — PMHA’s Annual Membership Meeting'); await w.fill('#f-hours', '4'); await w.fill('#f-notes', longNote);
  await w.locator('.overlay button[type=submit]').click(); await w.waitForTimeout(900);
  const saved = (await api('GET', '/records/trainings?limit=200')).body.items.find((t) => t.title.startsWith('Caring for Carers'));
  ok('Correcting the fields saves the record; long and special text comes back exactly', saved && saved.notes === longNote && saved.title === 'Caring for Carers: PaHinga Muna — PMHA’s Annual Membership Meeting');
  for (let k = 0; k < 3 && await w.locator('.overlay').count(); k++) { await w.keyboard.press('Escape'); await w.waitForTimeout(200); }

  // ── 3. A failed save never looks successful ─────────────
  await go('/portfolio?new=awards'); await w.waitForSelector('#record-form #f-title');
  await w.fill('#f-title', 'Outstanding Faculty Award');
  await w.route('**/api/records/awards', (route) => (route.request().method() === 'POST' ? route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'Database is busy' }) }) : route.continue()));
  const okBefore = await w.locator('.toast.ok').count();
  await w.locator('.overlay button[type=submit]').click(); await w.waitForTimeout(900);
  const okToasts = (await w.locator('.toast.ok').count()) - okBefore;
  const shown = (await w.locator('.toast.error, .overlay .alert, .overlay [role=alert]').allInnerTexts()).join(' | ');
  ok('When saving fails: no success message, the error is shown, the pop-up and text stay', okToasts === 0 && /busy|not saved|failed/i.test(shown) && await w.inputValue('#f-title') === 'Outstanding Faculty Award', shown.slice(0, 120));
  await w.unroute('**/api/records/awards');
  await w.locator('.overlay button[type=submit]').click(); await w.waitForTimeout(900);
  ok('Saving again once the problem clears works', (await api('GET', '/records/awards')).body.items.some((a) => a.title === 'Outstanding Faculty Award'));
  for (let k = 0; k < 3 && await w.locator('.overlay').count(); k++) { await w.keyboard.press('Escape'); await w.waitForTimeout(200); }

  // ── 4. Navigation ────────────────────────────────────────
  await w.getByRole('link', { name: 'Research Development' }).click(); await w.waitForSelector('#quick-idea');
  await w.getByRole('link', { name: 'Professional Portfolio' }).click(); await w.waitForTimeout(700);
  await w.goBack(); await w.waitForTimeout(700);
  const back = w.url(); await w.goForward(); await w.waitForTimeout(700);
  ok('Back and forward move between modules', /\/research$/.test(back) && /\/portfolio$/.test(w.url()), `${back} → ${w.url()}`);
  await go('/portfolio/development'); await w.waitForTimeout(600); await w.reload(); await w.waitForSelector('.statusbar', { timeout: 30000 }); await w.waitForTimeout(800);
  ok('Reloading keeps the page you were on', /\/portfolio\/development$/.test(w.url()) && (await w.locator('main h1').innerText()).toUpperCase().includes('PROFESSIONAL DEVELOPMENT'));
  const trainId = saved.id;
  await go(`/portfolio?open=trainings:${trainId}`); await w.waitForSelector('.overlay'); await w.waitForTimeout(400);
  await w.locator('.overlay button', { hasText: /^Edit$/ }).first().click(); await w.waitForSelector('#f-title');
  await w.fill('#f-title', 'Changed but not saved');
  let asked = 0; const dismiss = (d) => { asked++; d.dismiss().catch(() => {}); }; w.on('dialog', dismiss);
  await w.keyboard.press('Escape'); await w.waitForTimeout(500);
  ok('Closing with unsaved changes asks first; choosing to stay keeps the text', asked === 1 && await w.inputValue('#f-title') === 'Changed but not saved');
  w.off('dialog', dismiss); const accept = (d) => d.accept().catch(() => {}); w.on('dialog', accept);
  await w.keyboard.press('Escape'); await w.waitForTimeout(500); for (let k = 0; k < 2 && await w.locator('.overlay').count(); k++) { await w.keyboard.press('Escape'); await w.waitForTimeout(200); }
  ok('Discarding leaves the saved record unchanged', (await api('GET', `/records/trainings/${trainId}`)).body.title.startsWith('Caring for Carers'));

  // ── 5. Search, filter and sort ───────────────────────────
  for (const [t, d] of [['Records Management Fundamentals', '2025-05-22'], ['Virtual Information Session', '2025-10-06'], ['Inclusive Education Summit', '2024-08-15']]) await api('POST', '/records/trainings', { title: t, start_date: d, role: 'participant' });
  await key('K', ['control']); await w.waitForSelector('.overlay input'); await w.keyboard.type('Inclusive Education'); await w.waitForTimeout(900);
  const hits = await w.locator('.overlay').innerText();
  ok('Global search finds a record by its title', hits.includes('Inclusive Education Summit'));
  await w.keyboard.press('Escape'); await w.waitForTimeout(300);
  await go('/portfolio/development'); await w.waitForTimeout(700);
  const allRecords = w.getByRole('button', { name: 'All records' }); if (await allRecords.count()) await allRecords.click();
  await w.waitForSelector('.toolbar'); await w.locator('.toolbar input').fill('Session'); await w.waitForTimeout(700);
  const filtered = await w.locator('main').innerText();
  ok('Filtering narrows the list', filtered.includes('Virtual Information Session') && !filtered.includes('Inclusive Education Summit'));
  await w.locator('.toolbar input').fill(''); await w.waitForTimeout(500);
  const sortSel = w.locator('.toolbar select[aria-label="Sort order"]');
  const opts = await sortSel.locator('option').evaluateAll((o) => o.map((x) => x.value));
  const firstTitle = async () => (await w.locator('main .dossier-row .what .t, main .rowlink .t').first().innerText()).trim();
  const a = await firstTitle(); await sortSel.selectOption(opts[opts.length - 1]); await w.waitForTimeout(600); const b = await firstTitle();
  ok('Sorting changes the order', a !== b, `${a} / ${b}`);

  // ── 6. Recycle bin ───────────────────────────────────────
  const victim = (await api('GET', '/records/trainings?limit=200')).body.items.find((t) => t.title === 'Inclusive Education Summit');
  await api('DELETE', `/records/trainings/${victim.id}`);
  await go('/settings?tab=data'); await w.waitForTimeout(900);
  const binRow = w.locator('tr', { hasText: 'Inclusive Education Summit', has: w.getByRole('button', { name: 'Restore' }) }); // the bin row, not the activity-log lines
  ok('A deleted record waits in the recycle bin', await binRow.count() === 1, JSON.stringify(await binRow.allInnerTexts()).slice(0, 300));
  await binRow.getByRole('button', { name: 'Restore' }).click(); await w.waitForTimeout(800);
  ok('Restoring brings it back', (await api('GET', `/records/trainings/${victim.id}`)).status === 200);

  // ── 7. Crash recovery ────────────────────────────────────
  const course = (await api('POST', '/records/courses', { code: 'EDUC 101', title: 'Foundations of Education', units: 3 })).body;
  const syl = (await api('POST', `/academic/courses/${course.id}/syllabi`, { academic_year: '2026-2027', semester: 'first' })).body; const sid = syl.syllabus?.id || syl.id;
  await go(`/academic/syllabi/${sid}`); await w.waitForSelector('.ProseMirror');
  await w.locator('.ProseMirror h2').first().click(); await key('End'); await key('Enter'); await w.keyboard.type('Written just before the crash');
  await w.waitForTimeout(2600); // autosave runs 1.2 s after typing stops
  await app.process().kill('SIGKILL'); await new Promise((r) => setTimeout(r, 1500));
  ({ app, w } = await launch()); errors = []; listen();
  const doc = (await api('GET', `/academic/syllabi/${sid}/document`)).body;
  ok('After the app is killed, autosaved work is there on reopening', JSON.stringify(doc.document).includes('Written just before the crash'));
  ok('The database passes its integrity check after the crash', (await api('GET', '/system/status')).body.integrity === 'ok');

  // ── 8. Backup and restore ────────────────────────────────
  await go('/settings?tab=data'); await w.waitForSelector('text=Back up now');
  const nB = (await api('GET', '/system/backups')).body.length;
  await w.getByRole('button', { name: 'Back up now' }).click(); await w.waitForTimeout(1500);
  const backups = (await api('GET', '/system/backups')).body;
  ok('Back up now creates a backup', backups.length === nB + 1);
  await api('POST', '/records/awards', { title: 'Added after the backup' });
  w.on('dialog', (d) => d.accept().catch(() => {}));
  await w.locator('tr', { hasText: backups[0].file }).getByRole('button', { name: 'Restore' }).click().catch(async () => { await w.getByRole('button', { name: 'Restore' }).first().click(); });
  await w.waitForTimeout(1000);
  await app.close(); await new Promise((r) => setTimeout(r, 1000));
  ({ app, w } = await launch()); errors = []; listen();
  const awards = (await api('GET', '/records/awards')).body.items.map((x) => x.title);
  ok('Restoring the backup returns the data to that moment', awards.includes('Outstanding Faculty Award') && !awards.includes('Added after the backup'), awards.join(', '));
  ok('Data from before the backup is intact', (await api('GET', `/academic/syllabi/${sid}/document`)).status === 200 && (await api('GET', '/records/trainings?limit=200')).body.items.length >= 4);

  // ── 8b. Copies of backups in another folder (e.g. a cloud-drive folder) ──
  const cloud = S + '/cloud'; fs.mkdirSync(cloud);
  await api('PUT', '/system/backup-copy', { dir: cloud }); // the folder picker is a native dialog; set it the same way the app does
  await go('/settings?tab=data'); await w.waitForSelector('text=Copy backups to another folder');
  await w.getByRole('button', { name: 'Back up and copy now' }).click(); await w.waitForTimeout(1500);
  const copied = fs.readdirSync(path.join(cloud, 'SYNCHRONIA Backups')).filter((f) => f.endsWith('.db'));
  ok('Back up and copy now puts the backup in the chosen folder and says so', copied.length >= 1 && /Last copied/.test(await w.locator('section.panel', { hasText: 'Copy backups to another folder' }).innerText()));
  fs.rmSync(cloud, { recursive: true, force: true });
  await w.getByRole('button', { name: 'Back up and copy now' }).click(); await w.waitForTimeout(1500);
  ok('If the folder is gone, the failure is shown and the backup is still made here', /last copy failed/i.test(await w.locator('section.panel', { hasText: 'Copy backups to another folder' }).innerText()));
  await w.getByRole('button', { name: 'Stop copying' }).click(); await w.waitForTimeout(500);

  // ── 8c. Notification settings ──
  await go('/settings'); await w.waitForSelector('text=Windows notifications while SYNCHRONIA is in the background');
  await w.getByLabel('Sounds for System Timer warnings and “system down”').uncheck(); await w.waitForTimeout(600);
  const mirrored = await w.evaluate(() => JSON.parse(localStorage.getItem('synchronia-notify') || '{}'));
  ok('Turning timer sounds off is saved and reaches the timer', (await api('GET', '/preferences')).body.notify_sound === false && mirrored.sound === false);
  await w.getByLabel('Sounds for System Timer warnings and “system down”').check(); await w.waitForTimeout(400);
  await w.route('**/api/preferences', (route) => (route.request().method() === 'PUT' ? route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'Disk is full' }) }) : route.continue()));
  const okB = await w.locator('.toast.ok').count();
  await w.getByLabel('Windows notifications while SYNCHRONIA is in the background').click(); await w.waitForTimeout(900);
  ok('A setting that fails to save goes back, says why, and shows no success', await w.getByLabel('Windows notifications while SYNCHRONIA is in the background').isChecked()
    && /Setting not saved: Disk is full/.test((await w.locator('.toast.error').allInnerTexts()).join(' ')) && (await w.locator('.toast.ok').count()) === okB);
  await w.unroute('**/api/preferences');

  // ── 9. The same records export the same way every time ───
  const cv = (await api('POST', '/cv', { name: 'Academic CV', cv_type: 'academic' })).body;
  const JSZip = require('jszip');
  const xml = async (fmt) => { const r = await api('POST', `/cv/${cv.id}/exports`, { format: fmt }); const b = await w.evaluate(async (u) => { const a = new Uint8Array(await (await fetch(u)).arrayBuffer()); let s = ''; for (let i = 0; i < a.length; i += 0x8000) s += String.fromCharCode(...a.subarray(i, i + 0x8000)); return btoa(s); }, r.body.download); return (await JSZip.loadAsync(Buffer.from(b, 'base64'))).file('word/document.xml').async('string'); };
  ok('Exporting the same CV twice gives identical Word content', (await xml('docx')) === (await xml('docx')));
  const pdfText = async () => { const r = await api('GET', `/cv/${cv.id}/analysis?mode=visual`); return r.body.extracted.pdf; };
  ok('…and identical PDF text', (await pdfText()) === (await pdfText()));

  // ── 10. Tablet and phone widths ──────────────────────────
  const narrow = [];
  for (const [vw, vh] of [[768, 1024], [390, 844]]) {
    await w.setViewportSize({ width: vw, height: vh });
    for (const r of ['/', '/calendar', '/research', '/portfolio', '/cv', '/admin', '/settings', '/timer', '/portfolio/development']) {
      await go(r); await w.waitForTimeout(700);
      const o = await w.evaluate(() => ({ sw: document.scrollingElement.scrollWidth, iw: innerWidth, main: (() => { const m = document.querySelector('#main'); return m ? m.scrollWidth - m.clientWidth : 0; })() }));
      if (o.sw > o.iw + 1) narrow.push(`${vw}px ${r}: page scrolls sideways (${o.sw} > ${o.iw})`);
    }
    const menu = w.getByRole('button', { name: 'Open navigation' });
    if (vw < 800 && await menu.count()) { await menu.click(); await w.waitForTimeout(400); if (!(await w.locator('.sidebar').isVisible())) narrow.push(`${vw}px: navigation does not open`); await w.keyboard.press('Escape'); }
  }
  ok('Tablet and phone widths: no sideways scrolling, navigation opens', narrow.length === 0, narrow.slice(0, 4).join(' | '));

  const real = errors.filter((e) => !/favicon|ResizeObserver|status of 500|status of 422/.test(e));
  ok('No unexpected errors in the console', real.length === 0, real.slice(0, 3).join(' | '));
  await app.close();
  console.log(`\n${R.filter(Boolean).length}/${R.length} checks passed`);
  process.exit(R.every(Boolean) ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
