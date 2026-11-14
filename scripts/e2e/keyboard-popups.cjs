// Keyboard regression test for pop-ups (run in the real Electron app):
//   npm run build && xvfb-run -a node scripts/e2e/keyboard-popups.cjs   (Linux; on Windows omit xvfb-run)
// Needs Playwright (npm i -D playwright, or a global install). Uses a throwaway data folder.
// Covers: Shift capitals and symbols, long text, bare Shift, arrows, Backspace/Delete, select-and-replace,
// Enter (must not close or submit), Tab, Ctrl+Enter save, reopen, Escape (with the unsaved-changes guard),
// and global shortcut letters typed inside fields.
const { _electron } = require('playwright');
const S = process.argv[2] || require('fs').mkdtempSync(require('path').join(require('os').tmpdir(), 'synchronia-kbd-'));
const results = [];
const ok = (name, cond, extra = '') => { results.push({ name, ok: !!cond }); console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`); };
(async () => {
  const app = await _electron.launch({ executablePath: require('electron'), args: ['--no-sandbox', require('path').join(__dirname, '..', '..')], env: { ...process.env, SYNCHRONIA_DATA_DIR: S + '/data' }, timeout: 90000 });
  const w = await app.firstWindow(); w.on('dialog', (d) => d.accept().catch(() => {}));
  await w.setViewportSize({ width: 1440, height: 900 });
  await w.waitForSelector('.eva-status', { timeout: 30000 });
  const go = (r) => w.evaluate((r) => { history.pushState({}, '', r); dispatchEvent(new PopStateEvent('popstate')); }, r);
  const open = () => w.evaluate(() => document.querySelectorAll('.overlay').length);
  const focusedIs = (el) => el.evaluate((n) => document.activeElement === n);
  const typeShift = async (s) => { for (const ch of s) { if (/[A-Z!@#$%^&*()_+{}|:"<>?~]/.test(ch)) { await w.keyboard.down('Shift'); await w.keyboard.press(ch); await w.keyboard.up('Shift'); } else await w.keyboard.press(ch === ' ' ? 'Space' : ch); } };
  const LONG = 'The study examines how blended learning readiness differs across rural and urban schools, considering teacher training, access to devices, and community support. '.repeat(3);

  async function exercise(name, field) {
    await field.click();
    await typeShift('Hello World');
    await w.keyboard.type(' abc def ');
    await typeShift('!@#$%^&*()_+{}|:"<>?~');
    ok(`${name}: Shift capitals and symbols keep the pop-up open`, (await open()) > 0);
    ok(`${name}: focus stays in the field while typing`, await focusedIs(field));
    const v1 = await field.inputValue();
    ok(`${name}: typed text arrives intact`, v1.includes('Hello World abc def !@#$%^&*()_+{}|:"<>?~'), JSON.stringify(v1.slice(0, 60)));
    await w.keyboard.type(LONG);
    const max = Number(await field.getAttribute('maxlength')) || 0; const v2 = await field.inputValue();
    ok(`${name}: long paragraph${max ? ` (up to the ${max}-character limit)` : ''}`, (max ? v2.length === max : v2.includes(LONG.trim().slice(0, 80))) && (await open()) > 0);
    for (let i = 0; i < 3; i++) await w.keyboard.press('Shift');
    await w.keyboard.press('ArrowLeft'); await w.keyboard.press('Backspace'); await w.keyboard.press('Delete');
    ok(`${name}: bare Shift, arrows, Backspace, Delete keep it open and focused`, (await open()) > 0 && await focusedIs(field));
    await w.keyboard.press('Control+A'); await typeShift('Replaced Title');
    ok(`${name}: select all and replace`, (await field.inputValue()) === 'Replaced Title', JSON.stringify(await field.inputValue()));
    await w.keyboard.press('Enter');
    ok(`${name}: plain Enter neither closes nor submits`, (await open()) > 0 && (await field.inputValue()) === 'Replaced Title');
    await w.keyboard.press('Tab');
    ok(`${name}: Tab moves to another control inside the pop-up`, (await open()) > 0 && !(await focusedIs(field)) && await w.evaluate(() => !!document.activeElement?.closest('.overlay')));
  }

  // 1. New record (drawer), then save with Ctrl+Enter and reopen
  await go('/portfolio/awards');
  await w.getByRole('button', { name: /Add award/i }).first().click(); await w.waitForSelector('.overlay');
  const title = w.locator('.overlay textarea').first();
  await exercise('New record', title);
  // fill required fields if any remain empty: give the date field a value
  const date = w.locator('.overlay input[type=date]').first();
  if (await date.count()) await date.fill('2025-06-01');
  await title.click(); await w.keyboard.press('Control+Enter');
  await w.waitForTimeout(800);
  const toast = await w.locator('.toast').allInnerTexts();
  ok('New record: Ctrl+Enter saves and closes', (await open()) === 0 && toast.some((t) => /saved/i.test(t)), JSON.stringify(toast).slice(0, 120));
  // reopen
  await w.getByText('Replaced Title').first().click(); await w.waitForSelector('.overlay');
  ok('Saved record reopens with the typed text', (await w.locator('.overlay').innerText()).includes('Replaced Title'));
  const editBtn = w.locator('.overlay').getByRole('button', { name: /^Edit$/ });
  if (await editBtn.count()) {
    await editBtn.first().click();
    const t2 = w.locator('.overlay textarea').first();
    await exercise('Edit record', t2);
    await w.keyboard.press('Escape'); await w.waitForTimeout(300);
    ok('Edit record: Escape with unsaved changes asks first (accepted) and closes', (await open()) === 0);
  }

  // 2. Quick Capture
  await w.locator('.topbar').getByRole('button', { name: /capture/i }).first().click(); await w.waitForSelector('.overlay');
  await exercise('Quick Capture', w.locator('.overlay textarea').first());
  await w.locator('.overlay textarea').first().click(); await w.keyboard.press('Control+Enter'); await w.waitForTimeout(800);
  ok('Quick Capture: Ctrl+Enter captures', (await open()) === 0 || (await w.locator('.toast').allInnerTexts()).some((t) => /captur|saved|added/i.test(t)));
  if (await open()) { await w.keyboard.press('Escape'); }

  // 3. Search palette (Ctrl+K)
  await go('/'); await w.waitForTimeout(300);
  await w.keyboard.press('Control+K'); await w.waitForSelector('.overlay');
  const q = w.locator('.overlay input').first();
  await q.click(); await typeShift('Hello World'); await w.keyboard.type(' x'); await typeShift('!?');
  ok('Search: Shift typing keeps it open and focused', (await open()) > 0 && await focusedIs(q) && (await q.inputValue()) === 'Hello World x!?');
  await w.keyboard.press('Escape'); await w.waitForTimeout(200);
  ok('Search: Escape closes it intentionally', (await open()) === 0);

  // 4. New CV dialog
  await go('/cv'); await w.getByRole('button', { name: /New CV/ }).first().click(); await w.waitForSelector('.overlay');
  const cvName = w.locator('.overlay input[type=text], .overlay input:not([type]), .overlay textarea').first();
  await exercise('New CV', cvName);
  await w.keyboard.press('Escape'); await w.waitForTimeout(200);
  ok('New CV: Escape closes it', (await open()) === 0);

  // 5. Typing the global shortcut letters outside fields still works, inside fields never fires
  await go('/'); await w.waitForTimeout(300);
  await w.keyboard.press('c'); await w.waitForTimeout(300);
  ok('Shortcut C opens Quick Capture when not typing', (await open()) === 1);
  const cap = w.locator('.overlay textarea').first(); await cap.click(); await w.keyboard.type('c / C');
  ok('Shortcut letters typed inside a field stay text', (await open()) === 1 && (await cap.inputValue()).includes('c / C'));
  await w.keyboard.press('Escape');

  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed} passed, ${failed} failed`);
  await app.evaluate(({ app }) => app.exit(0)).catch(() => {});
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.log('ERROR', e.message.split('\n')[0]); process.exit(2); });
