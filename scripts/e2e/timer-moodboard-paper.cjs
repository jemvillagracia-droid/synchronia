// Command Center additions and PDF paper sizes, in the real app:
//   npm run build && xvfb-run -a node scripts/e2e/timer-moodboard-paper.cjs   (Linux; on Windows omit xvfb-run)
// Covers calendar quick entry (from the Nexus day cells too), the System Timer (warning, system down, recharge,
// full screen), the moodboard (Quick Capture → board, notes, colours, delete and undo) and PDF exports at every
// paper size (page size, and no text outside the page).
const { _electron } = require('playwright');
const fs = require('fs'); const path = require('path'); const { execFileSync } = require('child_process');
const S = fs.mkdtempSync(path.join(require('os').tmpdir(), 'synchronia-tmp-')); fs.mkdirSync(S + '/shots'); const R = [];
const ok = (n, c, x = '') => { R.push(!!c); console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${x ? '  ' + x : ''}`); };
const PT = { letter: [612, 792], folio: [612, 936], a4: [595.3, 841.9], legal: [612, 1008], a5: [419.5, 595.3], b5: [515.9, 728.5] };
(async () => {
  const app = await _electron.launch({ executablePath: require('electron'), args: ['--no-sandbox', path.join(__dirname, '..', '..')], env: { ...process.env, SYNCHRONIA_DATA_DIR: S + '/data' }, timeout: 90000 });
  const w = await app.firstWindow();
  const errors = []; w.on('pageerror', (e) => errors.push(e.message)); w.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await w.setViewportSize({ width: 1440, height: 950 });
  await w.waitForSelector('.eva-status', { timeout: 30000 });
  const go = (r) => w.evaluate((r) => { history.pushState({}, '', r); dispatchEvent(new PopStateEvent('popstate')); }, r);
  const api = (m, u, b) => w.evaluate(async ([m, u, b]) => { const r = await fetch('/api' + u, { method: m, headers: { 'Content-Type': 'application/json', 'X-Synchronia': '1' }, body: b ? JSON.stringify(b) : undefined }); return { status: r.status, body: await r.json().catch(() => null) }; }, [m, u, b]);
  const bytes = (u) => w.evaluate(async (u) => { const b = new Uint8Array(await (await fetch(u)).arrayBuffer()); let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000)); return btoa(s); }, u).then((s) => Buffer.from(s, 'base64'));
  await api('PUT', '/profile', { full_name: 'Maria Santos' });

  // ── Calendar: a day on the Nexus calendar opens the quick entry for that day
  const cell = w.locator('a[href*="/calendar?date="]').first(); const href = await cell.getAttribute('href');
  const day = /date=([\d-]+)/.exec(href)[1];
  await cell.click(); await w.waitForSelector('.cal-quick input', { timeout: 10000 }); await w.waitForTimeout(500);
  ok('Nexus day cell opens the calendar on that day, ready for an entry', (await w.locator('.cal-quick').getAttribute('aria-label')).endsWith(day) && await w.evaluate(() => document.activeElement?.getAttribute('aria-label')) === 'Entry title', await w.evaluate(() => document.activeElement?.outerHTML.slice(0, 90)));
  await w.fill('.cal-quick input', 'Submit grades'); await w.selectOption('.cal-quick select', 'deadline'); await w.locator('.cal-quick button').click();
  await w.waitForTimeout(900);
  const tasks = (await api('GET', '/records/tasks?limit=50')).body; const t = (tasks.items || tasks).find((x) => x.title === 'Submit grades');
  ok('Quick entry saves a deadline on the chosen day', t && t.due_date === day && !!t.is_deadline, JSON.stringify(t && { due: t.due_date, dl: t.is_deadline }));
  const ev = (await api('GET', `/calendar?from=${day}&to=${day}`)).body;
  ok('Entry appears on the calendar', JSON.stringify(ev).includes('Submit grades'));
  await w.screenshot({ path: S + '/shots/calendar.png' });

  // ── System Timer
  await w.getByRole('link', { name: 'System Timer' }).click(); await w.waitForSelector('.tmr-digits');
  ok('System Timer opens from the Command Center', /\/timer$/.test(w.url()));
  await w.fill('[aria-label="Custom minutes"]', '1.05'); await w.getByRole('button', { name: 'Set', exact: true }).click();
  await w.fill('[aria-label="Timer label"]', 'Thesis writing block');
  await w.getByRole('button', { name: 'Start', exact: true }).click();
  await w.waitForSelector('.tmr-warn', { timeout: 8000 }).catch(() => {});
  ok('One-minute warning strip appears', await w.locator('.tmr-warn').isVisible().catch(() => false));
  ok('Power mode switches to RACING in the final minute', await w.locator('.tmr-mode.on').innerText() === 'RACING');
  ok('Timer chip shows in the top bar while running', await w.locator('.tmr-chip').isVisible());
  await w.screenshot({ path: S + '/shots/timer-running.png' });
  await w.getByRole('button', { name: 'Pause' }).click(); const a = await w.locator('.tmr-digits .live').innerText(); await w.waitForTimeout(1200);
  ok('Pause holds the time', a === await w.locator('.tmr-digits .live').innerText() && await w.locator('.tmr-status b').innerText() === 'HOLD');
  await w.getByRole('button', { name: 'Reset' }).click();
  await w.fill('[aria-label="Custom minutes"]', '0.05'); await w.getByRole('button', { name: 'Set', exact: true }).click();
  await w.getByRole('button', { name: 'Start', exact: true }).click();
  await go('/research'); // system down must reach you anywhere in the app
  await w.waitForSelector('.tmr-down', { timeout: 10000 }).catch(() => {});
  ok('SYSTEM DOWN pop-up appears on another page when time runs out', await w.locator('.tmr-down-title').isVisible().catch(() => false));
  await w.screenshot({ path: S + '/shots/system-down.png' });
  await w.keyboard.press('Shift'); await w.waitForTimeout(200);
  ok('Shift does not close the system-down pop-up', await w.locator('.tmr-down').isVisible());
  await w.getByRole('button', { name: /Recharge — 5 min/ }).click(); await go('/timer'); await w.waitForSelector('.tmr-digits');
  ok('Recharge starts a 5-minute break shown as RECHARGING', await w.locator('.tmr-status b').innerText() === 'RECHARGING' && (await w.locator('.tmr-digits .live').innerText()).startsWith('04:') || (await w.locator('.tmr-digits .live').innerText()).startsWith('05:'));
  await w.getByRole('button', { name: 'Full screen' }).click(); await w.waitForTimeout(800);
  const full = await w.evaluate(() => ({ el: !!document.fullscreenElement, w: document.querySelector('.tmr').getBoundingClientRect().width, vw: innerWidth }));
  ok('Full screen fills the screen with the timer', full.el && full.w >= full.vw - 2, JSON.stringify(full));
  await w.screenshot({ path: S + '/shots/timer-full.png' });
  await w.keyboard.press('Escape'); await w.waitForTimeout(500);
  ok('Escape leaves full screen', await w.evaluate(() => !document.fullscreenElement));
  await w.getByRole('button', { name: 'Reset' }).click();
  // Theme: the timer follows the theme accent
  const accent = async () => w.evaluate(() => getComputedStyle(document.querySelector('.tmr-digits .live')).color);
  const c1 = await accent(); await api('PUT', '/preferences', { theme: 'blue-white' }); await w.evaluate(() => document.documentElement.setAttribute('data-theme', 'blue-white')); await w.waitForTimeout(400);
  ok('Timer colours follow the theme', c1 !== await accent(), `${c1} → ${await accent()}`);
  await w.screenshot({ path: S + '/shots/timer-theme.png' });
  await api('PUT', '/preferences', { theme: 'violet' }); await w.evaluate(() => document.documentElement.setAttribute('data-theme', 'violet'));

  // ── Moodboard via Quick Capture, on the research project being worked on
  const p = (await api('POST', '/records/research_projects', { title: 'Blended learning readiness' })).body;
  await go(`/research/projects/${p.id}`); await w.waitForSelector('#stage');
  await w.locator('.topbar').getByRole('button', { name: 'Capture' }).click();
  await w.waitForSelector('.overlay'); await w.getByRole('dialog', { name: 'Quick Capture' }).getByRole('button', { name: 'Moodboard', exact: true }).click();
  await w.locator('.overlay [data-autofocus]').first().fill('Use photovoice with learners'); await w.keyboard.press('Control+Enter'); await w.waitForTimeout(900);
  const b = (await api('GET', `/moodboards/for?type=research_projects&id=${p.id}`)).body;
  ok('Quick Capture pins the idea on the moodboard of the project being worked on', JSON.stringify(b).includes('Use photovoice with learners'));
  await w.locator('#main').getByRole('button', { name: 'Moodboard' }).click(); await w.waitForSelector('.mb-stage', { timeout: 10000 });
  ok('Project page opens its moodboard', (await w.locator('.mb-card').count()) === 1);
  await w.getByRole('button', { name: 'Note', exact: true }).click(); await w.waitForTimeout(600);
  await w.locator('.mb-card textarea').last().fill('Pilot in two schools'); await w.locator('.mb-stage').click({ position: { x: 5, y: 5 } }); await w.waitForTimeout(700);
  ok('New note added and saved', (await api('GET', `/moodboards/${b.board.id}`)).body.items.some((i) => i.text === 'Pilot in two schools'));
  const card = w.locator('.mb-card').first(); const box = await card.boundingBox();
  await w.mouse.move(box.x + 30, box.y + 7); await w.mouse.down(); await w.mouse.move(box.x + 190, box.y + 87, { steps: 8 }); await w.mouse.up(); await w.waitForTimeout(700);
  const moved = (await api('GET', `/moodboards/${b.board.id}`)).body.items.find((i) => i.text?.startsWith('Use photovoice'));
  ok('Cards can be dragged and the place is kept', moved.x !== 0 || moved.y !== 0, `${moved.x},${moved.y}`);
  await card.click({ position: { x: 30, y: 7 } }); const sw = w.locator('.mb-colors [role=radio]').nth(2);
  if (await sw.count()) { await sw.click(); await w.waitForTimeout(600); }
  ok('Card colour can be changed', (await api('GET', `/moodboards/${b.board.id}`)).body.items.some((i) => i.color && i.color !== 'violet'));
  await w.screenshot({ path: S + '/shots/moodboard.png' });
  const n0 = await w.locator('.mb-card').count(); await card.click({ position: { x: 30, y: 7 } }); await w.keyboard.press('Delete'); await w.waitForTimeout(600);
  const n1 = await w.locator('.mb-card').count(); const undo = w.getByRole('button', { name: 'Undo' });
  if (await undo.count()) { await undo.first().click(); await w.waitForTimeout(800); }
  ok('Delete removes a card and Undo brings it back', n1 === n0 - 1 && await w.locator('.mb-card').count() === n0, `${n0}→${n1}→${await w.locator('.mb-card').count()}`);
  await go('/moodboard'); await w.waitForTimeout(800);
  ok('Moodboard list shows the project board', (await w.locator('main').innerText()).includes('Blended learning readiness'));

  // ── PDF exports at every paper size
  const course = (await api('POST', '/records/courses', { code: 'EDUC 101', title: 'Foundations of Education', units: 3 })).body;
  const syl = (await api('POST', `/academic/courses/${course.id}/syllabi`, { academic_year: '2026-2027', semester: 'first' })).body;
  const sid = syl.syllabus?.id || syl.id; if (!sid) console.log('syllabus create:', JSON.stringify(syl).slice(0, 200));
  const ins = (await api('POST', '/research/instruments', { project_id: p.id, title: 'Readiness Scale' })).body;
  await api('POST', '/research/literature', { project_id: p.id, title: 'Teacher readiness for blended learning in rural schools, a very long title for wrapping', authors: 'Cruz, Ana; Lim, Ben', year: '2022', source: 'Asia Pacific Education Review', findings: 'Readiness depends on access and training. '.repeat(8) });
  const cvs = (await api('GET', '/cv')).body; let cvId = (Array.isArray(cvs) ? cvs : cvs.items || cvs.cvs || [])[0]?.id;
  if (!cvId) cvId = (await api('POST', '/cv', { name: 'Academic CV', cv_type: 'academic' })).body.id;
  const bad = []; const LAND = (paper) => ['folio', 'a4'].includes(paper); // the syllabus is also checked in landscape
  for (const paper of Object.keys(PT)) {
    await api('PUT', '/preferences', { paper_size: paper });
    const jobs = [
      ['syllabus', async () => { const d = (await api('GET', `/academic/syllabi/${sid}/document`)).body; await api('PUT', `/academic/syllabi/${sid}/document`, { document: d.document, page: { ...(d.page || {}), size: paper, landscape: LAND(paper) }, base_updated_at: d.syllabus.updated_at }); return api('POST', `/academic/syllabi/${sid}/document/export`, { format: 'pdf' }); }],
      ['research progress', () => api('POST', `/research/projects/${p.id}/report`, { format: 'pdf' })],
      ['literature matrix', () => api('POST', '/research/literature/matrix/export', { project_id: p.id, format: 'pdf' })],
      ['instrument', () => api('POST', `/research/instruments/${ins.instrument.id}/export`, { format: 'pdf' })],
      ['intelligence', () => api('POST', '/intelligence/reports', { type: 'annual_academic', format: 'pdf' })],
      ['cv', async () => { const r = await api('PATCH', `/cv/${cvId}`, { settings: { page_size: paper } }); if (r.status >= 400) await api('PUT', `/cv/${cvId}/settings`, { page_size: paper }); return api('POST', `/cv/${cvId}/exports`, { format: 'pdf' }); }],
    ];
    for (const [name, run] of jobs) {
      const r = await run(); const dl = r.body?.download || r.body?.export?.download || r.body?.url;
      if (r.status >= 400 || !dl) { bad.push(`${paper} ${name}: ${r.status} ${JSON.stringify(r.body).slice(0, 120)}`); continue; }
      const f = `${S}/${paper}-${name.replace(/ /g, '_')}.pdf`; fs.writeFileSync(f, await bytes(dl));
      const info = execFileSync('pdfinfo', [f]).toString(); const m = /Page size:\s+([\d.]+) x ([\d.]+)/.exec(info);
      const [W, H] = [Number(m[1]), Number(m[2])]; const landscape = name === 'literature matrix' || (name === 'syllabus' && LAND(paper)); /* the matrix is landscape by design */ const [ew, eh] = landscape ? [PT[paper][1], PT[paper][0]] : PT[paper];
      if (Math.abs(W - ew) > 1.5 || Math.abs(H - eh) > 1.5) bad.push(`${paper} ${name}: page ${W}×${H}, expected ${ew}×${eh}`);
      const html = execFileSync('pdftotext', ['-bbox', f, '-']).toString();
      const out = [...html.matchAll(/xMin="([\d.-]+)" yMin="([\d.-]+)" xMax="([\d.-]+)" yMax="([\d.-]+)">([^<]*)/g)].filter((x) => +x[1] < 0 || +x[2] < 0 || +x[3] > W + 0.5 || +x[4] > H + 0.5);
      if (out.length) bad.push(`${paper} ${name}: ${out.length} words outside the page, e.g. "${out[0][5]}"`);
      if (!/[A-Za-z]{3}/.test(html.replace(/<[^>]+>/g, ''))) bad.push(`${paper} ${name}: no text`);
    }
  }
  ok('PDF exports: 6 documents × 6 paper sizes at the right page size, nothing outside the page', bad.length === 0, bad.slice(0, 6).join(' | '));
  await api('PUT', '/preferences', { paper_size: 'letter' });
  // Settings shows the paper choice
  await go('/settings?tab=documents'); await w.waitForTimeout(800);
  ok('Settings › Documents offers the paper size', (await w.locator('main select option').allInnerTexts()).some((t) => /Folio/.test(t)));
  await w.screenshot({ path: S + '/shots/settings-paper.png' });
  const real = errors.filter((e) => !/favicon|ResizeObserver/.test(e));
  ok('No errors in the console', real.length === 0, real.slice(0, 3).join(' | '));
  await app.close();
  console.log(`\n${R.filter(Boolean).length}/${R.length} checks passed — screenshots and PDFs in ${S}`);
  process.exit(R.every(Boolean) ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
