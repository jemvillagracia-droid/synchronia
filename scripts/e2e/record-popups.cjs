// Every record type, through its pop-up: open a new record, fill the required fields, save, reopen, edit, save, close.
//   npm run build && xvfb-run -a node scripts/e2e/record-popups.cjs   (Linux; on Windows omit xvfb-run)
const { _electron } = require('playwright'); const fs = require('fs'); const path = require('path');
const S = fs.mkdtempSync(path.join(require('os').tmpdir(), 'synchronia-popups-'));
(async () => {
  const app = await _electron.launch({ executablePath: require('electron'), args: ['--no-sandbox', path.join(__dirname, '..', '..')], env: { ...process.env, SYNCHRONIA_DATA_DIR: S, SYNCHRONIA_DOWNLOAD_DIR: S }, timeout: 90000 });
  const w = await app.firstWindow(); let errors = []; w.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message)); w.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  w.on('dialog', (d) => d.accept().catch(() => {}));
  await w.setViewportSize({ width: 1440, height: 900 });
  await w.waitForSelector('.eva-status', { timeout: 30000 });
  const api = (m, u, b) => w.evaluate(async ([m, u, b]) => { const r = await fetch('/api' + u, { method: m, headers: { 'Content-Type': 'application/json', 'X-Synchronia': '1' }, body: b ? JSON.stringify(b) : undefined }); return { status: r.status, body: await r.json().catch(() => null) }; }, [m, u, b]);
  await api('PUT', '/profile', { full_name: 'Maria Santos' });
  const schema = (await api('GET', '/schema')).body;
  const sample = (type, name, f) => f.type === 'enum' ? f.values[0] : f.type === 'date' ? '2026-03-15' : f.type === 'int' || f.type === 'real' ? Math.max(1, f.min ?? 1) : f.type === 'bool' ? false : f.format === 'time' ? '09:00' : f.format === 'email' ? 'a@example.edu' : f.format === 'url' ? 'https://example.edu' : `${type} ${name}`.slice(0, f.max || 100);
  const made = {};
  async function make(type) {
    if (made[type]) return made[type];
    const have = (await api('GET', `/records/${type}?limit=1`)).body; const first = (have.items || have)[0];
    if (first) return (made[type] = first.id); // reuse one made through a pop-up earlier
    const body = {};
    for (const [n, f] of Object.entries(schema[type].fields)) if (f.required) body[n] = f.type === 'ref' ? await make(f.resource) : sample(type, n, f);
    const r = await api('POST', `/records/${type}`, body);
    if (r.status >= 400) throw new Error(`seed ${type}: ${JSON.stringify(r.body).slice(0, 200)}`);
    return (made[type] = r.body.id);
  }
  const go = (r) => w.evaluate((r) => { history.pushState({}, '', r); dispatchEvent(new PopStateEvent('popstate')); }, r);
  const out = []; const note = (t, m) => out.push(`${t}: ${m}`);
  for (const [type, spec] of Object.entries(schema)) {
    errors = [];
    try {
      // refs first
      const refs = {};
      for (const [n, f] of Object.entries(spec.fields)) if (f.required && f.type === 'ref') refs[n] = await make(f.resource);
      await go(`/calendar?new=${type}`);
      const form = await w.waitForSelector('#record-form', { timeout: 6000 }).catch(() => null);
      if (!form) { note(type, 'new-record pop-up did not open'); continue; }
      await w.waitForTimeout(250);
      const box = await w.locator('.overlay .drawer, .overlay .modal').first().boundingBox();
      if (!box || box.x < -1 || box.y < -1 || box.x + box.width > 1441) note(type, `pop-up off-screen ${JSON.stringify(box)}`);
      for (const [n, f] of Object.entries(spec.fields)) {
        if (!f.required || f.hidden) continue;
        const el = w.locator(`#f-${n}`);
        if (!(await el.count())) { if (f.type === 'date' && f.partial) { const d = w.locator(`[id^="f-${n}"]`); if (await d.count()) continue; } note(type, `required field ${n} not on the form`); continue; }
        const tag = await el.evaluate((e) => e.tagName + ':' + (e.type || ''));
        if (tag.startsWith('SELECT')) {
          const val = f.type === 'ref' ? String(refs[n]) : String(sample(type, n, f));
          await el.selectOption(val).catch(async () => { const opts = await el.locator('option').evaluateAll((o) => o.map((x) => x.value).filter(Boolean)); if (opts[0]) await el.selectOption(opts[0]); });
        } else if (tag === 'INPUT:checkbox') { /* leave */ }
        else await el.fill(String(sample(type, n, f)));
      }
      await w.waitForTimeout(150);
      const before = (await api('GET', `/records/${type}?limit=200`)).body;
      const nBefore = (before.items || before).length;
      await w.locator('.overlay button[type=submit], .overlay button[form="record-form"]').first().click();
      await w.waitForTimeout(900);
      const errText = await w.locator('.overlay .field-error, .overlay .alert, .overlay .error').allInnerTexts().catch(() => []);
      const after = (await api('GET', `/records/${type}?limit=200`)).body; const items = after.items || after;
      if (items.length !== nBefore + 1) { note(type, `save through the pop-up did not create a record ${errText.join(' | ').slice(0, 200)}`); await w.keyboard.press('Escape'); await w.keyboard.press('Escape'); continue; }
      const id = items.map((x) => x.id).sort((a, b) => b - a)[0];
      // close whatever is open, then open the record and edit it
      for (let k = 0; k < 3 && await w.locator('.overlay').count(); k++) { await w.keyboard.press('Escape'); await w.waitForTimeout(200); }
      if (await w.locator('.overlay').count()) note(type, 'pop-up did not close with Escape after saving');
      await go(`/calendar?open=${type}:${id}`);
      const opened = await w.waitForSelector('.overlay', { timeout: 6000 }).catch(() => null);
      if (!opened) { note(type, 'existing record did not open'); continue; }
      await w.waitForTimeout(400);
      const edit = w.locator('.overlay button', { hasText: /^Edit$/ });
      if (await edit.count()) await edit.first().click();
      await w.waitForSelector('#record-form', { timeout: 4000 }).catch(() => {});
      const titleField = spec.title && spec.fields[spec.title] && spec.fields[spec.title].type === 'text' && !spec.fields[spec.title].format ? spec.title : Object.entries(spec.fields).find(([, f]) => f.type === 'text' && !f.format && !f.hidden)?.[0];
      if (titleField && await w.locator(`#f-${titleField}`).count()) {
        await w.locator(`#f-${titleField}`).fill(`Edited ${type}`);
        await w.locator('.overlay button[type=submit], .overlay button[form="record-form"]').first().click(); await w.waitForTimeout(900);
        const row = (await api('GET', `/records/${type}/${id}`)).body;
        if (row?.[titleField] !== `Edited ${type}`) note(type, `edit through the pop-up not saved (${titleField}=${JSON.stringify(row?.[titleField]).slice(0, 60)})`);
      }
      for (let k = 0; k < 3 && await w.locator('.overlay').count(); k++) { await w.keyboard.press('Escape'); await w.waitForTimeout(200); }
      const real = errors.filter((e) => !/favicon|ResizeObserver/.test(e));
      if (real.length) note(type, `console: ${real.slice(0, 2).join(' | ').slice(0, 200)}`);
    } catch (e) { note(type, 'EXCEPTION ' + e.message.split('\n')[0].slice(0, 200)); for (let k = 0; k < 3; k++) await w.keyboard.press('Escape').catch(() => {}); }
  }
  // Unknown type in a deep link must not break the app
  errors = []; await go('/calendar?new=not_a_type'); await w.waitForTimeout(800);
  if (errors.some((e) => /PAGEERROR/.test(e)) || !(await w.locator('.cal-cells').count())) note('deep link', `unknown type breaks the page: ${errors.join(' | ').slice(0, 200)}`);
  out.forEach((o) => console.log('FAIL  ' + o));
  console.log(`\n${Object.keys(schema).length} record types: ${out.length ? `${out.length} problems` : 'all created, reopened, edited and closed through their pop-ups'}`);
  await app.close();
  process.exit(out.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
