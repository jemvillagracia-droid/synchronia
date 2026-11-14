// Syllabus editor walkthrough in the real app:
//   npm run build && xvfb-run -a node scripts/e2e/syllabus-editor.cjs   (Linux; on Windows omit xvfb-run)
// Covers the simplified course page, a new syllabus document, typing and formatting, picture paste (as a screenshot
// paste delivers it), a GIF from a file, picture resizing, tables, select-all/copy/paste/cut through the app's native
// commands (pictures included), autosave and reopening, and verified Word and PDF export.
// Note: Playwright's synthetic Ctrl+C/Ctrl+V/Ctrl+End do not trigger Chromium's native editing commands, so the
// clipboard steps use the toolbar buttons, which run the same native commands.
const { _electron } = require('playwright');
const S = require('fs').mkdtempSync(require('path').join(require('os').tmpdir(), 'synchronia-doc-'));
require('fs').writeFileSync(S + '/tiny.gif', Buffer.from('R0lGODlhBAACAIAAAP///wAAACH5BAEAAAAALAAAAAAEAAIAAAIDhI8FADs=', 'base64'));
require('fs').mkdirSync(S + '/shots', { recursive: true });
const R = []; const ok = (n, c, x = '') => { R.push(!!c); console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${x ? '  ' + x : ''}`); };
(async () => {
  const app = await _electron.launch({ executablePath: require('electron'), args: ['--no-sandbox', require('path').join(__dirname, '..', '..')], env: { ...process.env, SYNCHRONIA_DATA_DIR: S + '/data' }, timeout: 90000 });
  const w = await app.firstWindow(); w.on('dialog', (d) => d.accept().catch(() => {}));
  const errors = []; w.on('pageerror', (e) => errors.push(e.message)); w.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await w.setViewportSize({ width: 1440, height: 950 });
  await w.waitForSelector('.eva-status', { timeout: 30000 });
  const api = (m, u, b) => w.evaluate(async ([m, u, b]) => { const r = await fetch('/api' + u, { method: m, headers: { 'Content-Type': 'application/json', 'X-Synchronia': '1' }, body: b ? JSON.stringify(b) : undefined }); return { status: r.status, body: await r.json().catch(() => null) }; }, [m, u, b]);
  await api('PUT', '/profile', { full_name: 'Maria Santos' });
  const course = (await api('POST', '/records/courses', { code: 'EDUC 101', title: 'Foundations of Education', units: 3 })).body;
  const go = (r) => w.evaluate((r) => { history.pushState({}, '', r); dispatchEvent(new PopStateEvent('popstate')); }, r);
  // Course page: simplified tabs; New syllabus opens the editor
  await go(`/academic/courses/${course.id}`); await w.waitForSelector('.tabs');
  const tabs = await w.locator('.tabs [role=tab]').allInnerTexts();
  ok('Course page shows only Syllabus, Classes, Class records', tabs.length === 3 && !tabs.join().match(/Outcome|Assess|Lesson|Material/), JSON.stringify(tabs));
  await w.getByRole('button', { name: /New syllabus/ }).click();
  await w.waitForSelector('.doc-content', { timeout: 15000 });
  ok('New syllabus opens as a document with the outline', (await w.locator('.doc-content').innerText()).includes('COURSE SYLLABUS'));
  await w.screenshot({ path: S + '/shots/editor-new.png' });
  // Type at the end with formatting
  const ed = w.locator('.doc-content');
  await ed.click(); await w.keyboard.press('Control+End');
  await w.keyboard.press('Enter'); await w.keyboard.type('Additional notes: ');
  await w.keyboard.press('Control+B'); await w.keyboard.type('Bring Your Own Device'); await w.keyboard.press('Control+B');
  await w.keyboard.type(' policy applies (A&B) #1!');
  ok('Typing with Shift, symbols and Ctrl+B works', (await ed.innerText()).includes('Additional notes: Bring Your Own Device policy applies (A&B) #1!') && await w.locator('.doc-content strong', { hasText: 'Bring Your Own Device' }).count() === 1);
  // Paste a picture from the system clipboard (like a screenshot)
  await w.keyboard.press('Enter');
  await w.evaluate(() => {
    const b64 = 'iVBORw0KGgoAAAANSUhEUgAAABAAAAAICAIAAAB/FOjAAAAAI0lEQVR4nGP8z4AKmBjQBSjnD+Q8eBgiPQIBNgYGBpgM/7+NAQBj7wYJpLFlkwAAAABJRU5ErkJggg==';
    const dt = new DataTransfer(); dt.items.add(new File([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], 'screenshot.png', { type: 'image/png' }));
    document.querySelector('.doc-content').dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  });
  await w.waitForFunction(() => document.querySelectorAll('.doc-content img[src^="/api/doc-images/"]').length >= 1, null, { timeout: 15000 }).catch(() => {});
  ok('Pasting a picture (as from a screenshot) stores and inserts it', await w.locator('.doc-content img[src^="/api/doc-images/"]').count() >= 1);
  // Insert a GIF from a file
  await w.locator('.doc-toolbar input[type=file]').setInputFiles(S + '/tiny.gif');
  await w.waitForFunction(() => document.querySelectorAll('.doc-content img[src^="/api/doc-images/"]').length >= 2, null, { timeout: 15000 }).catch(() => {});
  ok('Picture button inserts a GIF', await w.locator('.doc-content img[src^="/api/doc-images/"]').count() >= 2);
  // Resize a picture
  await w.locator('.doc-content img').first().click();
  await w.getByRole('button', { name: 'Picture width 50%' }).click();
  ok('Selected picture resizes to 50%', ((await w.locator('.doc-content img').first().getAttribute('style')) || '').includes('width:50%') || ((await w.locator('.doc-content img').first().getAttribute('style')) || '').includes('width: 50%'));
  // Insert a table
  await ed.click(); await w.keyboard.press('Control+End'); await w.keyboard.press('Enter');
  await w.getByRole('button', { name: 'Insert table' }).click();
  await w.keyboard.type('Week'); await w.keyboard.press('Tab'); await w.keyboard.type('Topic');
  await w.getByRole('button', { name: 'Add row below' }).click();
  const mine = w.locator('.doc-content table', { hasText: 'Topic' }).first();
  ok('Table insert, typing in cells, add row', (await mine.locator('tr').count()) === 4, `${await mine.locator('tr').count()} rows`);
  // Select all + copy, then paste at the end duplicates (pictures included)
  const realImgs = () => w.locator('.doc-content img[src^="/api/doc-images/"]').count();
  const imgsBefore = await realImgs();
  // Copy everything and paste it at the end, through the toolbar (the app's native commands, as Ctrl+A/C/V)
  await ed.click(); await w.getByRole('button', { name: 'Select all (Ctrl+A)' }).click(); await w.getByRole('button', { name: 'Copy (Ctrl+C)' }).click();
  await ed.click(); await w.keyboard.press('Control+End'); await w.getByRole('button', { name: 'Paste (Ctrl+V)' }).click();
  await w.waitForTimeout(1500);
  const notes = (await ed.innerText()).split('Bring Your Own Device').length - 1;
  ok('Select all + Copy + Paste duplicates the text', notes === 2, `occurrences=${notes}`);
  await w.waitForTimeout(2500);
  ok('…and the pictures (stored again as SYNCHRONIA pictures)', (await realImgs()) === imgsBefore * 2, `${imgsBefore} → ${await realImgs()}`);
  // Toolbar Cut then Paste (native commands)
  await ed.click(); await w.keyboard.press('Control+End'); await w.keyboard.press('Enter'); await w.keyboard.type('CUTME');
  await w.keyboard.down('Shift'); for (let i = 0; i < 5; i++) await w.keyboard.press('ArrowLeft'); await w.keyboard.up('Shift');
  await w.getByRole('button', { name: 'Cut (Ctrl+X)' }).click(); await w.waitForTimeout(300);
  const afterCut = (await ed.innerText()).includes('CUTME');
  await w.getByRole('button', { name: 'Paste (Ctrl+V)' }).click(); await w.waitForTimeout(500);
  ok('Toolbar Cut removes the text, toolbar Paste puts it back', !afterCut && (await ed.innerText()).includes('CUTME'));
  await w.getByRole('button', { name: 'Select all (Ctrl+A)' }).click();
  ok('Toolbar Select all selects the document', await w.evaluate(() => { const s = window.getSelection(); return s && s.toString().length > 200; }));
  // Autosave and reload
  await w.waitForFunction(() => /Saved|All changes saved/.test(document.querySelector('.doc-status')?.textContent || ''), null, { timeout: 15000 }).catch(() => {});
  const status = await w.locator('.doc-status').innerText();
  ok('Autosaves', /Saved/.test(status), status);
  const sylId = Number(w.url().split('/').pop());
  await go(`/academic/courses/${course.id}`); await w.waitForSelector('.tabs');
  await go(`/academic/syllabi/${sylId}`); await w.waitForSelector('.doc-content');
  const back = await w.locator('.doc-content').innerText();
  ok('Reopened document keeps text, pictures and tables', back.includes('CUTME') && (await realImgs()) === imgsBefore * 2 && back.includes('Week'));
  await w.screenshot({ path: S + '/shots/editor-filled.png' });
  const x = await api('POST', `/academic/syllabi/${sylId}/document/export`, { format: 'docx' });
  ok('Word export verified', x.status === 201 && /Verified/.test(x.body?.validation?.summary || ''), x.body?.validation?.summary || JSON.stringify(x.body));
  const p = await api('POST', `/academic/syllabi/${sylId}/document/export`, { format: 'pdf' });
  ok('PDF export verified', p.status === 201 && /Verified/.test(p.body?.validation?.summary || ''), p.body?.validation?.summary || JSON.stringify(p.body));
  require('fs').writeFileSync(S + '/exports.json', JSON.stringify({ docx: x.body, pdf: p.body }));
  ok('No errors in the page', errors.length === 0, JSON.stringify(errors).slice(0, 300));
  console.log(`\n${R.filter(Boolean).length} passed, ${R.filter((r) => !r).length} failed`); process.exitCode = R.every(Boolean) ? 0 : 1;
  await app.evaluate(({ app }) => app.exit(0)).catch(() => {});
})().catch((e) => { console.log('ERROR', e.message.split('\n').slice(0, 3).join(' ')); process.exit(2); });
