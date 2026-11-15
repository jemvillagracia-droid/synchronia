// Research Development Workspace walkthrough in the real app:
//   npm run build && xvfb-run -a node scripts/e2e/research-workspace.cjs   (Linux; on Windows omit xvfb-run)
// Covers quick idea capture, inline stage changes, usual milestones and milestone-based progress, one-click suggested
// tasks, literature quick-add with duplicate linking, and an instrument from initial to final (final version locked).
const { _electron } = require('playwright');
const S = require('fs').mkdtempSync(require('path').join(require('os').tmpdir(), 'synchronia-res-')); require('fs').mkdirSync(S + '/shots'); const R = [];
const ok = (n, c, x = '') => { R.push(!!c); console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${x ? '  ' + x : ''}`); };
(async () => {
  const app = await _electron.launch({ executablePath: require('electron'), args: ['--no-sandbox', require('path').join(__dirname, '..', '..')], env: { ...process.env, SYNCHRONIA_DATA_DIR: S + '/data' }, timeout: 90000 });
  const w = await app.firstWindow(); w.on('dialog', (d) => d.accept(d.type() === 'prompt' ? 'Blended Learning Readiness Scale' : undefined).catch(() => {}));
  const errors = []; w.on('pageerror', (e) => errors.push(e.message)); w.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await w.setViewportSize({ width: 1440, height: 950 });
  await w.waitForSelector('.eva-status', { timeout: 30000 });
  const go = (r) => w.evaluate((r) => { history.pushState({}, '', r); dispatchEvent(new PopStateEvent('popstate')); }, r);
  const api = (m, u, b) => w.evaluate(async ([m, u, b]) => { const r = await fetch('/api' + u, { method: m, headers: { 'Content-Type': 'application/json', 'X-Synchronia': '1' }, body: b ? JSON.stringify(b) : undefined }); return { status: r.status, body: await r.json().catch(() => null) }; }, [m, u, b]);
  await api('PUT', '/profile', { full_name: 'Maria Santos' });
  // Sidebar: Research Development
  await w.getByRole('link', { name: 'Research Development' }).click(); await w.waitForSelector('#quick-idea');
  ok('Sidebar opens the Research Development workspace', /\/research$/.test(w.url()));
  await w.fill('#quick-idea', 'Blended learning readiness in rural schools'); await w.keyboard.press('Enter');
  await w.waitForSelector('.res-card', { timeout: 10000 });
  ok('Quick capture saves an idea with only its title', (await w.locator('.res-card').count()) === 1);
  await w.screenshot({ path: S + '/shots/dashboard.png' });
  await w.locator('.res-card').first().click(); await w.waitForSelector('#stage');
  const pid = Number(w.url().match(/projects\/(\d+)/)[1]);
  await w.selectOption('#stage', 'methodology'); await w.waitForTimeout(600);
  ok('Stage changes inline', (await api('GET', `/research/projects/${pid}`)).body.project.stage === 'methodology');
  await w.getByRole('button', { name: 'Add usual milestones' }).click(); await w.waitForTimeout(800);
  ok('Usual milestones added', (await w.locator('.panel', { hasText: 'Milestones' }).locator('li').count()) >= 1);
  await w.locator('.panel', { hasText: 'Milestones' }).locator('input[type=checkbox]').first().check(); await w.waitForTimeout(700);
  ok('Ticking a milestone updates milestone-based progress', /1 of \d+ milestones completed/.test(await w.locator('.panel', { hasText: 'milestones completed' }).first().innerText()));
  const sugBefore = await w.getByRole('button', { name: 'Add task' }).count();
  if (sugBefore) { await w.getByRole('button', { name: 'Add task' }).first().click(); await w.waitForTimeout(700); }
  ok('A suggested task can be accepted in one click', sugBefore > 0 && (await w.locator('.panel', { hasText: 'Tasks' }).locator('li').count()) >= 1);
  await w.screenshot({ path: S + '/shots/project.png' });
  // Literature quick add + duplicate
  await w.getByRole('tab', { name: 'Literature' }).click();
  for (let k = 0; k < 2; k++) {
    await w.getByRole('button', { name: 'Quick add reference' }).click();
    await w.locator('form.panel input').nth(0).fill('Teacher readiness for blended learning in rural schools');
    await w.locator('form.panel input').nth(1).fill('Cruz, Ana; Lim, Ben'); await w.locator('form.panel input').nth(2).fill('2022');
    await w.getByRole('button', { name: 'Add', exact: true }).click(); await w.waitForTimeout(800);
  }
  const toasts = (await w.locator('.toast').allInnerTexts()).join(' | ');
  ok('Second identical reference is linked, not duplicated', /already in your literature/.test(toasts) && (await api('GET', '/research/literature')).body.items.length === 1, toasts.slice(0, 160));
  // Instrument
  await go(`/research/projects/${pid}?tab=methods`); await w.waitForSelector('text=Instruments');
  await w.getByRole('button', { name: 'Instrument', exact: true }).click();
  await w.waitForSelector('.overlay input'); await w.locator('.overlay input').fill('Blended Learning Readiness Scale'); await w.keyboard.press('Enter');
  await w.waitForSelector('.res-track', { timeout: 10000 });
  await w.getByRole('button', { name: 'Dimension', exact: true }).click();
  await w.getByLabel('Dimension 1 name', { exact: true }).fill('Access to devices'); await w.getByLabel('Item 1', { exact: true }).fill('I have a device for online classes.');
  await w.waitForTimeout(2000);
  await w.getByRole('button', { name: 'Send for expert review' }).click(); await w.waitForTimeout(800);
  await w.getByRole('button', { name: 'Start revision from reviews' }).click(); await w.waitForTimeout(800);
  await w.getByRole('button', { name: 'Mark as final' }).click(); await w.waitForTimeout(800);
  ok('Instrument moves Initial → Review → Revision → Final, versions kept', (await w.locator('#ver option').count()) === 3 && await w.locator('.res-track li.on').innerText() === 'FINAL INSTRUMENT' || /final/i.test(await w.locator('.res-track li.on').innerText()));
  ok('Final version is locked', await w.getByLabel('Item 1', { exact: true }).isDisabled() && /final approved version/.test(await w.locator('.alert').innerText()));
  const iv = await w.evaluate(() => document.querySelector('#ver').value);
  await w.screenshot({ path: S + '/shots/instrument.png' });
  // Tabs render
  for (const t of ['Ethics', 'Dissemination', 'Funding and team']) { await go(`/research/projects/${pid}`); await w.getByRole('tab', { name: t }).click(); await w.waitForTimeout(300); }
  for (const t of ['literature', 'instruments', 'writing', 'dissemination', 'stages', 'projects']) { await go(`/research?tab=${t}`); await w.waitForTimeout(400); }
  await go('/research?tab=literature'); await w.waitForTimeout(500); await w.screenshot({ path: S + '/shots/literature.png' });
  ok('All research tabs render without errors', errors.length === 0, JSON.stringify(errors).slice(0, 300));
  console.log(`\n${R.filter(Boolean).length} passed, ${R.filter((r) => !r).length} failed`); process.exitCode = R.every(Boolean) ? 0 : 1;
  await app.evaluate(({ app }) => app.exit(0)).catch(() => {});
})().catch((e) => { console.log('ERROR', e.message.split('\n').slice(0, 3).join(' ')); process.exit(2); });
