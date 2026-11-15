// Every keyboard shortcut, pressed as real key input (Electron sendInputEvent, so Chromium's own editing commands run):
//   npm run build && xvfb-run -a node scripts/e2e/keyboard-shortcuts.cjs   (Linux; on Windows omit xvfb-run)
const { _electron } = require('playwright');
const fs = require('fs'); const path = require('path');
const S = fs.mkdtempSync(path.join(require('os').tmpdir(), 'synchronia-keys-')); const R = [];
const ok = (n, c, x = '') => { R.push(!!c); console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${x ? '  ' + x : ''}`); };
(async () => {
  const app = await _electron.launch({ executablePath: require('electron'), args: ['--no-sandbox', path.join(__dirname, '..', '..')], env: { ...process.env, SYNCHRONIA_DATA_DIR: S + '/data' }, timeout: 90000 });
  const w = await app.firstWindow();
  const errors = []; w.on('pageerror', (e) => errors.push(e.message)); w.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await w.setViewportSize({ width: 1440, height: 950 });
  await w.waitForSelector('.eva-status', { timeout: 30000 });
  const go = (r) => w.evaluate((r) => { history.pushState({}, '', r); dispatchEvent(new PopStateEvent('popstate')); }, r);
  const api = (m, u, b) => w.evaluate(async ([m, u, b]) => { const r = await fetch('/api' + u, { method: m, headers: { 'Content-Type': 'application/json', 'X-Synchronia': '1' }, body: b ? JSON.stringify(b) : undefined }); return { status: r.status, body: await r.json().catch(() => null) }; }, [m, u, b]);
  // Real key input. keyCode as Electron accelerators name it ('A', 'Enter', 'Space', 'F11', '=', 'Escape', 'Right', 'Delete').
  const key = async (keyCode, modifiers = []) => {
    await app.evaluate(({ BrowserWindow }, [keyCode, modifiers]) => {
      const wc = BrowserWindow.getAllWindows().find((b) => b.isVisible()).webContents;
      wc.sendInputEvent({ type: 'keyDown', keyCode, modifiers });
      if (!modifiers.some((m) => m === 'control' || m === 'meta' || m === 'alt') && keyCode.length === 1) wc.sendInputEvent({ type: 'char', keyCode, modifiers });
      wc.sendInputEvent({ type: 'keyUp', keyCode, modifiers });
    }, [keyCode, modifiers]);
    await w.waitForTimeout(180);
  };
  const main = (f) => app.evaluate(({ BrowserWindow }, f) => { const b = BrowserWindow.getAllWindows().find((x) => x.isVisible()); return new Function('b', `return (${f})(b)`)(b); }, f.toString());
  const overlay = () => w.evaluate(() => document.querySelector('.overlay')?.getAttribute('aria-label') || null);
  await api('PUT', '/profile', { full_name: 'Maria Santos' });
  await w.locator('main').click({ position: { x: 5, y: 5 } }).catch(() => {});

  // Global
  await key('K', ['control']); ok('Ctrl+K opens global search', await overlay() === 'Global search');
  await key('Escape'); ok('Esc closes it', await overlay() === null);
  await key('/'); ok('/ opens global search', await overlay() === 'Global search');
  await key('Escape');
  await key('C'); ok('C opens Quick Capture', await overlay() === 'Quick Capture');
  await w.keyboard.type('hello world');
  await key('A', ['control']); await key('X', ['control']);
  const field = w.locator('.overlay [data-autofocus]').first();
  ok('Ctrl+A then Ctrl+X cuts the text', await field.inputValue() === '');
  await key('V', ['control']); ok('Ctrl+V pastes it back', await field.inputValue() === 'hello world', JSON.stringify(await field.inputValue()));
  await key('A', ['control']); await key('C', ['control']); await key('End'); await key('V', ['control']);
  ok('Ctrl+C copies (pasted again at the end)', await field.inputValue() === 'hello worldhello world', JSON.stringify(await field.inputValue()));
  await key('Z', ['control']); ok('Ctrl+Z undoes the paste', await field.inputValue() === 'hello world', JSON.stringify(await field.inputValue()));
  await key('Shift', ['shift']); ok('Shift does not close the dialog', await overlay() === 'Quick Capture');
  await key('Enter'); ok('Enter alone does not submit', await overlay() === 'Quick Capture');
  await key('Enter', ['control']); await w.waitForTimeout(700);
  const tasks = (await api('GET', '/records/tasks?limit=20')).body;
  ok('Ctrl+Enter saves the dialog', (tasks.items || tasks).some((t) => /hello world/.test(t.title)) && await overlay() === null);
  await key('/', ['shift']); // "?" on a US layout
  const help = await w.evaluate(() => document.body.innerText.includes('Save the syllabus now'));
  ok('? opens the shortcut list', help);
  await key('Escape');
  // C typed in a text field must type, not open Quick Capture
  await go('/research'); await w.waitForSelector('#quick-idea'); await w.click('#quick-idea'); await key('c');
  ok('Shortcut letters type normally inside a text field', await w.inputValue('#quick-idea') === 'c' && await overlay() === null, JSON.stringify([await w.inputValue('#quick-idea'), await overlay()]));
  await w.fill('#quick-idea', '');

  // Window: zoom and full screen
  await w.locator('h1').first().click();
  await key('=', ['control']); const z1 = await main((b) => b.webContents.getZoomLevel());
  await key('-', ['control']); await key('-', ['control']); const z2 = await main((b) => b.webContents.getZoomLevel());
  await key('0', ['control']); const z3 = await main((b) => b.webContents.getZoomLevel());
  ok('Ctrl+= zooms in, Ctrl+- zooms out, Ctrl+0 resets', z1 > 0 && z2 < 0 && z3 === 0, `${z1} ${z2} ${z3}`);
  await key('F11'); await w.waitForTimeout(800); const f1 = await main((b) => b.isFullScreen());
  await key('F11'); await w.waitForTimeout(800); const f2 = await main((b) => b.isFullScreen());
  ok('F11 toggles a full-screen window', f1 && !f2, `${f1} ${f2}`);

  // Syllabus editor
  const course = (await api('POST', '/records/courses', { code: 'EDUC 101', title: 'Foundations of Education', units: 3 })).body;
  const syl = (await api('POST', `/academic/courses/${course.id}/syllabi`, { academic_year: '2026-2027', semester: 'first' })).body;
  const sid = syl.syllabus?.id || syl.id;
  await go(`/academic/syllabi/${sid}`); await w.waitForSelector('.ProseMirror', { timeout: 15000 });
  const pm = w.locator('.ProseMirror');
  await pm.locator('h2').first().click(); await key('End'); await key('Enter'); await w.keyboard.type('Keyboard line');
  await key('Left', ['shift', 'control']); await key('B', ['control']);
  ok('Ctrl+B makes the selection bold', await pm.locator('strong', { hasText: 'line' }).count() === 1);
  await key('I', ['control']); ok('Ctrl+I makes it italic', await pm.locator('em', { hasText: 'line' }).count() === 1);
  await key('U', ['control']); ok('Ctrl+U underlines it', await pm.locator('u', { hasText: 'line' }).count() === 1);
  await key('Z', ['control']); await key('Z', ['control']); await key('Z', ['control']);
  ok('Ctrl+Z undoes formatting', await pm.locator('strong, em, u', { hasText: 'line' }).count() === 0);
  await key('Y', ['control']); ok('Ctrl+Y redoes', await pm.locator('strong', { hasText: 'line' }).count() === 1);
  await key('C', ['control']); await key('End'); await key('V', ['control']);
  ok('Ctrl+C / Ctrl+V copy and paste in the editor', (await pm.innerText()).includes('Keyboard lineline'), (await pm.innerText()).match(/Keyboard[^\n]*/)?.[0]);
  await key('Left', ['shift', 'control']); await key('X', ['control']);
  ok('Ctrl+X cuts in the editor (the selected word)', (await pm.innerText()).match(/Keyboard[^\n]*/)?.[0].trim() === 'Keyboard', (await pm.innerText()).match(/Keyboard[^\n]*/)?.[0]);
  await w.keyboard.type('saved now'); await key('S', ['control']); await w.waitForTimeout(500); // autosave would wait 1.2 s
  const after = (await api('GET', `/academic/syllabi/${sid}/document`)).body;
  ok('Ctrl+S saves the syllabus at once', JSON.stringify(after.document).includes('saved now'));
  await pm.click(); await key('A', ['control']);
  ok('Ctrl+A selects the whole document', await w.evaluate(() => (getSelection()?.toString() || '').length > 200));
  await key('Right');

  // System Timer keys
  await go('/timer'); await w.waitForSelector('.tmr-digits'); await w.locator('.tmr-cap').click();
  await key('Space'); ok('Space starts the timer', await w.locator('.tmr-status b').innerText() === 'INTERNAL');
  await key('Space'); ok('Space pauses it', await w.locator('.tmr-status b').innerText() === 'HOLD');
  await key('R'); ok('R resets it', await w.locator('.tmr-status b').innerText() === 'EXTERNAL' && (await w.locator('.tmr-digits .live').innerText()) === '25:00:00');
  await key('F'); await w.waitForTimeout(700); const tf = await w.evaluate(() => !!document.fullscreenElement);
  await key('Escape'); await w.waitForTimeout(700);
  ok('F enters full screen, Esc leaves it', tf && await w.evaluate(() => !document.fullscreenElement));

  // Moodboard keys
  const bd = (await api('GET', '/moodboards/for?type=general')).body;
  const it = (await api('POST', `/moodboards/${bd.board.id}/items`, { kind: 'note', text: 'Key card', x: 100, y: 100, w: 240, h: 170 })).body;
  await go(`/moodboard/${bd.board.id}`); await w.waitForSelector('.mb-card');
  await w.locator('.mb-card .mb-grip').first().click({ position: { x: 20, y: 8 } });
  await key('Right'); await key('Down', ['shift']); await w.waitForTimeout(500);
  const moved = (await api('GET', `/moodboards/${bd.board.id}`)).body.items.find((x) => x.id === (it.id || it.item?.id));
  ok('Arrow keys move the selected card (Shift = bigger step)', moved && moved.x === 110 && moved.y === 150, moved && `${moved.x},${moved.y}`);
  await w.locator('.mb-card textarea').first().click(); await key('Escape'); await key('Delete'); await w.waitForTimeout(500);
  ok('Esc leaves the card text, then Delete removes the card', await w.locator('.mb-card').count() === 0);

  const real = errors.filter((e) => !/favicon|ResizeObserver/.test(e));
  ok('No errors in the console', real.length === 0, real.slice(0, 3).join(' | '));
  await app.close();
  console.log(`\n${R.filter(Boolean).length}/${R.length} checks passed`);
  process.exit(R.every(Boolean) ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
