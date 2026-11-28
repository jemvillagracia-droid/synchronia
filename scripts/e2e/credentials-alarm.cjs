// 1.5.0 in the real app: DBM-CHED credentials checklist (import a tracker workbook, claim, set document statuses,
// export), the alarm sound (files served, settings saved, preview plays and stops), the animated System Timer, and
// the sidebar (main compartments only, no Administrative Operations, no mode switcher).
//   npm run build && xvfb-run -a node scripts/e2e/credentials-alarm.cjs   (Linux; on Windows omit xvfb-run)
const { _electron } = require('playwright');
const fs = require('fs'); const path = require('path');
const S = fs.mkdtempSync(path.join(require('os').tmpdir(), 'synchronia-jc-')); fs.mkdirSync(S + '/shots'); const R = [];
const ok = (n, c, x = '') => { R.push(!!c); console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${x ? '  ' + x : ''}`); };
(async () => {
  const ExcelJS = require('exceljs');
  const wb = new ExcelJS.Workbook();
  const sheet = (name, title, header, rows) => { const ws = wb.addWorksheet(name); ws.addRow([title]); ws.mergeCells('A1:F1'); ws.addRow(header); for (const r of rows) ws.addRow(r); };
  sheet('🎤 Resource Speakerships', 'RESOURCE SPEAKERSHIPS', ['Date', 'Topic', 'Audience', 'Host / Organization', 'Location / Venue', 'Level', 'Invitation Letter', 'Program of Activity', 'Certificate of Appreciation', 'Authorization', 'Remarks / Action'],
    [[new Date('2024-11-21'), 'Study Habits and Wellbeing', 'Students', 'Sample College', 'Sample Campus', 'Local', '✔ YES', '✘ NO', '✔ YES', '🔄 PENDING', 'Secure the program']]);
  sheet('🏛️ Professional Organizations', 'ORGS', ['Organization Name', 'Type', 'Membership Type', 'Role / Position', 'Year Joined', 'Status', 'Certificate of Membership / ID Card (Secured?)'],
    [['Sample Association of Educators', 'National', 'Member', 'Member', 2020, 'Active', '✔ YES']]);
  sheet('📚 Educational Attainment', 'EDUCATION', ['Level of Education', 'Degree / Qualification', 'Field of Study', 'Institution', 'Year Completed', 'Honors', 'CAV / Diploma (Secured?)'],
    [['Doctorate (ASPIRATIONAL)', 'Doctor of Philosophy (PhD)', 'Psychology', 'Sample University', '', '', '☐ Future']]);
  const xlsx = S + '/tracker.xlsx'; await wb.xlsx.writeFile(xlsx);

  const app = await _electron.launch({ executablePath: require('electron'), args: ['--no-sandbox', path.join(__dirname, '..', '..')], env: { ...process.env, SYNCHRONIA_DATA_DIR: S + '/data', SYNCHRONIA_DOWNLOAD_DIR: S + '/downloads' }, timeout: 90000 });
  const w = await app.firstWindow(); w.on('dialog', (d) => d.accept().catch(() => {}));
  const errors = []; w.on('pageerror', (e) => errors.push(e.message)); w.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await w.setViewportSize({ width: 1440, height: 950 });
  await w.waitForSelector('.eva-status', { timeout: 30000 });
  const api = (m, u, b) => w.evaluate(async ([m, u, b]) => { const r = await fetch('/api' + u, { method: m, headers: { 'Content-Type': 'application/json', 'X-Synchronia': '1' }, body: b ? JSON.stringify(b) : undefined }); return { status: r.status, body: await r.json().catch(() => null) }; }, [m, u, b]);
  await api('PUT', '/profile', { full_name: 'Maria Santos' });

  // Sidebar: main compartments only
  const nav = await w.locator('.nav .nav-item').allInnerTexts();
  const names = nav.map((t) => t.replace(/^\d+\s*/, '').replace(/\s+/g, ' ').trim().toUpperCase());
  ok('The sidebar lists only main compartments', !names.some((n) => /LITERATURE|FACULTY DEVELOPMENT|EXTENSION AND|PROFESSIONAL TIMELINE|BACKUP|QUICK CAPTURE|CORRESPONDENCE|MEETINGS|SECRETARIAT|ADMINISTRATIVE/.test(n)) && names.includes('ACADEMIC WORKSPACE'), names.join(' · '));
  ok('No academic-mode switcher in the top bar', await w.locator('.mode-chip').count() === 0);
  await w.goto(w.url().replace(/\/[^/]*$/, '/admin')); await w.waitForTimeout(600);
  ok('Administrative Operations no longer exists', /not found/i.test(await w.locator('main').innerText()));

  // Credentials checklist: import, claim, document status, export
  await w.getByRole('link', { name: 'Credentials Tracker' }).click(); await w.waitForSelector('.jc-summary');
  ok('Credentials Tracker is its own compartment under Professional Development, with the four KRAs', /\/credentials$/.test(w.url()) && await w.locator('.jc-kra-tile').count() === 4);
  ok('It is not repeated inside the Portfolio', !(await w.evaluate(async () => (await (await fetch('/')).text()).includes('portfolio/credentials'))));
  await w.locator('input[type=file][accept=".xlsx"]').setInputFiles(xlsx);
  await w.waitForSelector('.jc-import', { timeout: 30000 });
  ok('The tracker is read and its rows listed for review', (await w.locator('.jc-imp-list li').count()) === 3);
  await w.screenshot({ path: S + '/shots/1-import.png' });
  await w.getByRole('button', { name: 'Import 3' }).click(); await w.waitForTimeout(1200);
  const c = (await api('GET', '/portfolio/jc')).body;
  const indOf = (code) => c.kras.flatMap((k) => k.criteria.flatMap((x) => x.indicators)).find((i) => i.code === code);
  const talk = indOf('III.B.1.5.1').claims[0];
  ok('Imported records are claimed with their document statuses', talk && talk.docs.map((d) => d.status).slice(0, 4).join(',') === 'secured,missing,secured,pending');
  ok('An aspirational degree becomes a planned goal with projected points', indOf('IV.B.1.4').claims[0]?.status === 'planned' && c.projected >= 40, `projected ${c.projected}`);
  ok('Estimated points and the document summary appear', /\d/.test(await w.locator('.jc-total b').innerText()) && c.counts.docs_missing >= 1);
  await w.getByRole('tab', { name: /^Documents/ }).click(); await w.waitForSelector('.jc-doctable');
  const missing = w.locator('.jc-doctable li', { hasText: 'Program showing the assigned topic' });
  await missing.getByRole('radio', { name: 'Secured' }).click(); await w.waitForTimeout(800);
  const c2 = (await api('GET', '/portfolio/jc')).body;
  ok('The Documents tab sets a missing document to Secured in one click', c2.kras[2].criteria[1].indicators.find((i) => i.code === 'III.B.1.5.1').claims[0].docs[1].status === 'secured');
  ok('…and it leaves the to-do list', await w.locator('.jc-doctable li', { hasText: 'Program showing the assigned topic' }).count() === 0);
  await w.screenshot({ path: S + '/shots/2-documents.png' });
  await w.getByRole('tab', { name: /^Planned goals/ }).click(); await w.waitForTimeout(300);
  ok('Planned goals lists the doctorate with the points it will add', /Doctor of Philosophy[\s\S]*\+40 pts/i.test(await w.locator('main').innerText()));
  await w.getByRole('tab', { name: 'Requirements by KRA' }).click(); await w.waitForTimeout(300);
  ok('Requirements show only what applies by default', await w.locator('.jc-ind').count() < 20, `${await w.locator('.jc-ind').count()} shown`);
  await w.screenshot({ path: S + '/shots/3-requirements.png' });
  await w.getByRole('button', { name: 'Word', exact: true }).click();
  await w.waitForFunction(() => /Exported/.test(document.body.innerText), null, { timeout: 30000 }).catch(() => {});
  const files = fs.existsSync(S + '/downloads') ? fs.readdirSync(S + '/downloads') : [];
  ok('The checklist exports to Word', files.some((f) => /DBM-CHED_Credentials_Checklist.*\.docx$/.test(f)), files.join(', '));

  // CV: the reclassification type is the default for a new CV
  const cv = await api('POST', '/cv', { name: 'Reclassification CV', cv_type: 'reclassification' });
  ok('A DBM-CHED reclassification CV can be created', cv.status === 201);

  // Alarm sound
  const sounds = await w.evaluate(async () => Promise.all(['battle-loop', 'warning', 'restored'].map(async (n) => { const r = await fetch(`/sounds/${n}.flac`); const b = await r.arrayBuffer(); return [n, r.status, b.byteLength]; })));
  ok('The alarm sounds are served', sounds.every(([, s, n]) => s === 200 && n > 100000), JSON.stringify(sounds));
  const decoded = await w.evaluate(async () => { const ctx = new AudioContext(); const b = await ctx.decodeAudioData(await (await fetch('/sounds/battle-loop.flac')).arrayBuffer()); return [b.duration, b.numberOfChannels, b.sampleRate]; });
  ok('The battle march decodes to its exact loop length', Math.abs(decoded[0] - 13.913) < 0.01 && decoded[1] === 2, decoded.join(' · '));
  await w.getByRole('link', { name: 'Settings' }).click(); await w.waitForSelector('.alarm-set');
  await w.getByRole('radio', { name: 'Simple beeps' }).click(); await w.waitForTimeout(600);
  ok('Choosing simple beeps is saved', (await api('GET', '/preferences')).body.alarm_style === 'beep');
  await w.getByRole('radio', { name: 'Battle march' }).click(); await w.waitForTimeout(600);
  ok('Choosing the battle march is saved', (await api('GET', '/preferences')).body.alarm_style === 'battle');
  ok('No academic-mode panel in Settings', !/Academic mode/i.test(await w.locator('main').innerText()));
  await w.getByRole('button', { name: 'Preview' }).click(); await w.waitForTimeout(1500);
  ok('Preview plays the march and offers Stop', await w.getByRole('button', { name: 'Stop' }).count() === 1);
  await w.getByRole('button', { name: 'Stop' }).click(); await w.waitForTimeout(800);
  ok('Stop ends the preview', await w.getByRole('button', { name: 'Preview' }).count() === 1);
  await w.screenshot({ path: S + '/shots/3-alarm.png' });

  // Animated timer and system down
  await w.getByRole('link', { name: 'System Timer' }).click(); await w.waitForSelector('.tmr');
  await w.getByRole('button', { name: 'Start' }).click(); await w.waitForTimeout(1200);
  ok('The running timer shows its animated system backdrop', await w.locator('.tmr.running .tmr-bg .tmr-rings').count() === 1 && await w.locator('.tmr-segs i.on').count() > 40 && await w.locator('canvas.tmr-wave').count() === 1);
  await w.evaluate(() => { const s = JSON.parse(localStorage.getItem('synchronia-timer')); s.endsAt = Date.now() + 1200; s.warned = [300000, 60000]; localStorage.setItem('synchronia-timer', JSON.stringify(s)); });
  await w.reload(); await w.waitForSelector('.tmr'); await w.waitForSelector('.tmr-down', { timeout: 8000 });
  ok('When time runs out, the system-down pop-up appears', await w.locator('.tmr-down').count() === 1);
  await w.screenshot({ path: S + '/shots/4-down.png' });
  await w.getByRole('button', { name: 'Dismiss' }).click(); await w.waitForTimeout(500);
  ok('Dismiss closes it', await w.locator('.tmr-down').count() === 0);

  ok('No errors in the console', errors.length === 0, errors.slice(0, 3).join(' | '));
  console.log(`\n${R.filter(Boolean).length}/${R.length} checks passed — screenshots in ${S}/shots`);
  await app.evaluate(({ app }) => app.exit(0)).catch(() => {});
  process.exit(R.every(Boolean) ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(2); });
