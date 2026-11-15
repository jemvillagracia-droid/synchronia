// PDS Section VII (L&D attended, by year) in the real app:
//   npm run build && xvfb-run -a node scripts/e2e/pds-learning.cjs   (Linux; on Windows omit xvfb-run)
const { _electron } = require('playwright');
const fs = require('fs'); const path = require('path'); const { execFileSync } = require('child_process');
const S = fs.mkdtempSync(path.join(require('os').tmpdir(), 'synchronia-pds-')); fs.mkdirSync(S + '/shots'); const R = [];
const ok = (n, c, x = '') => { R.push(!!c); console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${x ? '  ' + x : ''}`); };
(async () => {
  const ExcelJS = require('exceljs');
  const app = await _electron.launch({ executablePath: require('electron'), args: ['--no-sandbox', path.join(__dirname, '..', '..')], env: { ...process.env, SYNCHRONIA_DATA_DIR: S + '/data', SYNCHRONIA_DOWNLOAD_DIR: S }, timeout: 90000 });
  const w = await app.firstWindow();
  const errors = []; w.on('pageerror', (e) => errors.push(e.message)); w.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await w.setViewportSize({ width: 1440, height: 950 });
  await w.waitForSelector('.eva-status', { timeout: 30000 });
  const go = (r) => w.evaluate((r) => { history.pushState({}, '', r); dispatchEvent(new PopStateEvent('popstate')); }, r);
  const api = (m, u, b) => w.evaluate(async ([m, u, b]) => { const r = await fetch('/api' + u, { method: m, headers: { 'Content-Type': 'application/json', 'X-Synchronia': '1' }, body: b ? JSON.stringify(b) : undefined }); return { status: r.status, body: await r.json().catch(() => null) }; }, [m, u, b]);
  const bytes = (u) => w.evaluate(async (u) => { const b = new Uint8Array(await (await fetch(u)).arrayBuffer()); let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000)); return btoa(s); }, u).then((s) => Buffer.from(s, 'base64'));
  await api('PUT', '/profile', { full_name: 'Maria Santos' });
  const T = (o) => api('POST', '/records/trainings', { role: 'participant', ...o });
  await T({ title: 'Foundations of Guidance Work: (Series 3) Guidance Program Development', start_date: '2025-12-27', end_date: '2025-12-27', hours: 3, ld_type: 'technical', organizer: 'RGC Connect Consultancy Group' });
  await T({ title: 'Records Management Fundamentals: Organizing, Storing, and Retaining Documents', start_date: '2025-05-22', end_date: '2025-11-02', hours: 80, ld_type: 'technical', organizer: 'Primaexcellence Review and Training Center' });
  await T({ title: 'Virtual Informaton Session "Learn ChatGPT"', start_date: '2025-10-06', hours: 4, organizer: 'Department of Information and Communications Technology - South Cotabato Provincial Field Office' });
  await T({ title: 'Inclusive Education Summit', start_date: '2024-08-15', end_date: '2024-08-16', hours: 16, ld_type: 'technical', organizer: 'DepEd' });

  await go('/portfolio/development'); await w.waitForSelector('.pds-switch');
  await w.getByRole('button', { name: 'PDS · L&D attended by year' }).click(); await w.waitForSelector('.pds-sheet');
  ok('PDS view opens on the latest year', (await w.locator('.pds-title').innerText()) === '2025');
  const rows = w.locator('.pds-r:not(.pds-h):not(.pds-total)');
  ok('Rows follow the PDS: most recent first, dd/mm/yyyy', (await rows.count()) === 3 && (await rows.nth(0).innerText()).includes('27/12/2025') && (await rows.nth(2).innerText()).includes('22/05/2025'));
  ok('Total hours shown', /87\.0/.test(await w.locator('.pds-total').innerText()));
  ok('A training without a type of L&D is pointed out', (await w.locator('.pds .alert').innerText()).includes('1 training has no Type of L&D'));
  await w.screenshot({ path: S + '/shots/pds-2025.png' });
  await w.locator('select.pds-type.empty').selectOption('technical'); await w.waitForTimeout(700);
  ok('Type of L&D set inline and saved', (await api('GET', '/portfolio/ld?year=2025')).body.items.every((i) => i.ld_type === 'technical') && !(await w.locator('.pds .alert.info').count()));
  // Sorting by date
  await w.getByRole('button', { name: 'Oldest first', exact: true }).click(); await w.waitForTimeout(600);
  ok('Oldest first sorts the seminars ascending', (await rows.nth(0).innerText()).includes('22/05/2025') && (await rows.nth(2).innerText()).includes('27/12/2025'));
  await w.locator('.pds-sort').click(); await w.waitForTimeout(600);
  ok('Clicking the From heading reverses the order', (await rows.nth(0).innerText()).includes('27/12/2025') && await w.getByRole('button', { name: 'Newest first', exact: true }).getAttribute('aria-pressed') === 'true');
  // Folder link
  await w.getByRole('button', { name: 'Link 2025 Drive folder' }).click(); await w.waitForSelector('.overlay input');
  await w.locator('.overlay input').fill('https://drive.google.com/drive/folders/seminars2025'); await w.keyboard.press('Control+Enter'); await w.waitForTimeout(700);
  ok('Year folder linked; opens from the year', await w.getByRole('link', { name: 'Open 2025 certificates folder' }).getAttribute('href') === 'https://drive.google.com/drive/folders/seminars2025');
  ok('Linked years are marked in the year list', await w.locator('.pds-years button.on svg').count() === 1);
  // Year switch
  await w.locator('.pds-years button', { hasText: '2024' }).click(); await w.waitForTimeout(600);
  ok('Switching year shows that year only', (await rows.count()) === 1 && (await rows.first().innerText()).includes('Inclusive Education Summit'));
  await w.locator('.pds-years button', { hasText: '2025' }).click(); await w.waitForTimeout(600);
  // Exports
  const runExport = async (label, fmt) => { const p = w.waitForResponse((r) => r.url().includes('/portfolio/ld/export')); await w.locator('.pds-actions').getByRole('button', { name: label, exact: true }).click(); const r = await (await p).json(); return r; };
  const xl = await runExport('Excel'); const wb = new ExcelJS.Workbook(); await wb.xlsx.load(await bytes(xl.download)); const ws = wb.worksheets[0];
  ok('Excel export in the PDS layout', /^VII\. LEARNING AND DEVELOPMENT/.test(ws.getCell('A1').value) && ws.getCell('B4').value === '27/12/2025' && ws.getCell('E4').value === 'TECHNICAL');
  for (const [label, paper, pt] of [['PDF', 'folio', [612, 936]], ['PDF', 'a4', [595.3, 841.9]]]) {
    await api('PUT', '/preferences', { paper_size: paper });
    const pdf = await runExport(label); fs.writeFileSync(`${S}/ld-${paper}.pdf`, await bytes(pdf.download));
    const m = /Page size:\s+([\d.]+) x ([\d.]+)/.exec(execFileSync('pdfinfo', [`${S}/ld-${paper}.pdf`]).toString());
    const txt = execFileSync('pdftotext', ['-layout', `${S}/ld-${paper}.pdf`, '-']).toString();
    ok(`PDF on ${paper}: right page size, PDS rows readable`, Math.abs(m[1] - pt[0]) < 2 && Math.abs(m[2] - pt[1]) < 2 && txt.includes('27/12/2025') && /TOTAL NUMBER OF HOURS/i.test(txt));
  }
  await api('PUT', '/preferences', { paper_size: 'letter' });
  const wd = await runExport('Word'); ok('Word export saved and verified', /\.docx$/.test(wd.file_name) && !!wd.validation);
  // Import from a PDS
  const pw = new ExcelJS.Workbook(); const c = pw.addWorksheet('C2');
  c.getCell('B15').value = 'TITLE OF LEARNING AND DEVELOPMENT INTERVENTIONS/TRAINING PROGRAMS'; c.getCell('I15').value = 'INCLUSIVE DATES OF ATTENDANCE'; c.getCell('K15').value = 'NUMBER OF HOURS'; c.getCell('L15').value = 'Type of LD'; c.getCell('M15').value = 'CONDUCTED/ SPONSORED BY';
  c.getCell('I16').value = 'From'; c.getCell('J16').value = 'To';
  [['Foundations of Guidance Work: (Series 2) Strengthening Case Management & Referral Systems', '26/12/2025', '26/12/2025', '3.0', 'TECHNICAL', 'RGC Connect Consultancy Group'],
    ['Foundations of Guidance Work: (Series 3) Guidance Program Development', '27/12/2025', '27/12/2025', '3.0', 'TECHNICAL', 'RGC Connect Consultancy Group']]
    .forEach((r, i) => { const n = 17 + i; ['B', 'I', 'J', 'K', 'L', 'M'].forEach((col, k) => { c.getCell(`${col}${n}`).value = r[k]; }); });
  fs.writeFileSync(S + '/PDS.xlsx', Buffer.from(await pw.xlsx.writeBuffer()));
  await w.getByRole('button', { name: 'Import from PDS (Excel)' }).click(); await w.waitForSelector('.overlay .sci-drop');
  await w.locator('.overlay input[type=file]').setInputFiles(S + '/PDS.xlsx'); await w.waitForSelector('.pds-import');
  ok('PDS rows read; the one already saved is unticked', (await w.locator('.pds-import li').count()) === 2 && (await w.locator('.pds-import .tag', { hasText: 'Already in your portfolio' }).count()) === 1);
  await w.getByRole('button', { name: 'Save 1 training' }).click(); await w.waitForTimeout(900);
  ok('Imported training appears in its year', (await rows.count()) === 4 && (await rows.nth(0).innerText()).includes('27/12/2025') && (await rows.nth(1).innerText()).includes('26/12/2025'));
  // Add through the pop-up
  await w.getByRole('button', { name: 'Add training attended' }).click(); await w.waitForSelector('.overlay form, .overlay .drawer');
  await w.waitForSelector('.overlay :text("Type of L&D (PDS)")', { timeout: 6000 }).catch(() => {});
  await w.screenshot({ path: S + '/shots/pds-add.png' });
  const dlg = await w.locator('.overlay').last().innerText();
  ok('Add pop-up opens with Type of L&D ready', /type of l&d \(pds\)/i.test(dlg), dlg.slice(0, 300).replace(/\n/g, ' / '));
  await w.keyboard.press('Escape');
  const overflow = await w.evaluate(() => { const b = document.querySelector('.pds-main').getBoundingClientRect(); return [...document.querySelectorAll('.pds-actions button, .pds-head a, .pds-head button')].filter((e) => e.getBoundingClientRect().right > b.right + 1).length; });
  ok('Buttons stay inside the page', overflow === 0);
  await w.screenshot({ path: S + '/shots/pds-final.png' });
  const real = errors.filter((e) => !/favicon|ResizeObserver/.test(e));
  ok('No errors in the console', real.length === 0, real.slice(0, 3).join(' | '));
  await app.close();
  console.log(`\n${R.filter(Boolean).length}/${R.length} checks passed — screenshots in ${S}/shots`);
  process.exit(R.every(Boolean) ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
