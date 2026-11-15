// Research Development Workspace: one project record with linked milestones, writing, literature, instruments,
// ethics and dissemination; progress from milestones only; reuse into the portfolio; exports verified.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'synchronia-res-'));
process.env.SYNCHRONIA_DATA_DIR = tmp;
const { openDatabase } = await import('../src/db.js');
const { createApp } = await import('../src/app.js');
const { apa, authorsAPA, progressOf } = await import('../src/research/service.js');
const JSZip = (await import('jszip')).default;
const ExcelJS = (await import('exceljs')).default;

const TOKEN = 'research-test-token-'.padEnd(48, 'r');
let server, base, db, cookie = '', P;
async function call(method, url, body, raw = false) {
  const res = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json', 'X-Synchronia': '1', Cookie: cookie }, body: body === undefined ? undefined : JSON.stringify(body) });
  if (raw) return { status: res.status, buf: Buffer.from(await res.arrayBuffer()), type: res.headers.get('content-type') };
  const t = await res.text();
  return { status: res.status, body: t ? JSON.parse(t) : null };
}
const docxText = async (download) => {
  const f = await call('GET', download.replace('/api', ''), undefined, true);
  return (await (await JSZip.loadAsync(f.buf)).file('word/document.xml').async('string')).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
};
const day = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

before(async () => {
  db = openDatabase(':memory:');
  server = createApp(db, { accessToken: TOKEN }).listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}/api`;
  cookie = (await fetch(`${base}/open?token=${TOKEN}`, { redirect: 'manual' })).headers.get('set-cookie').split(';')[0];
  await call('PUT', '/profile', { full_name: 'Maria Santos' });
});
after(() => { server.close(); db.close(); fs.rmSync(tmp, { recursive: true, force: true }); });

test('APA 7 author and reference formatting', () => {
  assert.equal(authorsAPA('Santos, Maria Clara; Reyes, Juan'), 'Santos, M. C., & Reyes, J.');
  assert.equal(authorsAPA('Maria Santos and Juan dela Reyes'), 'Santos, M., & Reyes, J. D.', 'without a comma the last word is taken as the family name');
  assert.equal(apa({ item_type: 'journal_article', authors: 'Cruz, Ana', year: '2021', title: 'Inclusive classrooms', source: 'Journal of Education', volume: '12', issue: '3', pages: '45-60', doi: 'https://doi.org/10.1000/xyz' }),
    'Cruz, A. (2021). Inclusive classrooms. Journal of Education, 12(3), 45-60. https://doi.org/10.1000/xyz');
  assert.equal(apa({ item_type: 'book', authors: 'Dewey, John', year: '1916', title: 'Democracy and education', publisher: 'Macmillan' }), 'Dewey, J. (1916). Democracy and education. Macmillan.');
  assert.deepEqual(progressOf([{ status: 'done' }, { status: 'pending' }, { status: 'skipped' }]), { done: 1, total: 2, pct: 50 });
  assert.deepEqual(progressOf([]), { done: 0, total: 0, pct: null });
});

test('quick idea capture, stages with derived status, custom stages that cannot drop one in use', async () => {
  const idea = await call('POST', '/records/research_projects', { title: 'Blended learning readiness in rural schools' });
  assert.equal(idea.status, 201, JSON.stringify(idea.body));
  assert.equal(idea.body.stage, 'idea'); assert.equal(idea.body.status, 'idea');
  P = idea.body.id;
  const moved = (await call('PATCH', `/records/research_projects/${P}`, { stage: 'manuscript' })).body;
  assert.equal(moved.status, 'writing', 'lifecycle status follows the stage');
  assert.equal((await call('PATCH', `/records/research_projects/${P}`, { stage: 'nonsense' })).status, 422);
  await call('PATCH', `/records/research_projects/${P}`, { stage: 'methodology' });
  const custom = await call('PUT', '/research/settings/stages', { stages: [{ key: 'idea', label: 'Idea' }, { label: 'Pilot study' }, { key: 'completed', label: 'Done' }] });
  assert.equal(custom.status, 422, 'methodology is in use');
  assert.match(custom.body.error, /Methodology Development/);
  const ok = await call('PUT', '/research/settings/stages', { stages: [{ key: 'idea', label: 'Idea' }, { key: 'methodology', label: 'Methods' }, { label: 'Pilot study' }, { key: 'completed', label: 'Done' }] });
  assert.equal(ok.status, 200);
  assert.ok(ok.body.stages.some((s) => s.key === 'custom_pilot_study'));
  const keep = (await call('PATCH', `/records/research_projects/${P}`, { stage: 'custom_pilot_study' })).body;
  assert.equal(keep.status, 'proposal', 'a custom stage leaves the lifecycle status as it was');
  await call('PUT', '/research/settings/stages', { stages: null });
  await call('PATCH', `/records/research_projects/${P}`, { stage: 'methodology' });
});

test('a captured idea develops into a project once', async () => {
  const a = (await call('POST', '/records/activities', { kind: 'idea', title: 'Peer tutoring and reading fluency', body: 'Observed gains in Grade 4', module: 'research' })).body;
  let o = (await call('GET', '/research/overview')).body;
  assert.ok(o.captured.some((c) => c.id === a.id));
  const p = await call('POST', `/research/ideas/${a.id}/develop`);
  assert.equal(p.status, 201);
  assert.equal(p.body.problem, 'Observed gains in Grade 4');
  assert.equal((await call('POST', `/research/ideas/${a.id}/develop`)).body.id, p.body.id, 'developing twice returns the same project');
  o = (await call('GET', '/research/overview')).body;
  assert.ok(!o.captured.some((c) => c.id === a.id));
});

test('milestones drive progress and the next action; suggestions can be accepted or dismissed; the calendar shows them', async () => {
  const made = (await call('POST', `/research/projects/${P}/milestones/template`, { stages: ['methodology', 'instrument'] })).body;
  assert.equal(made.length, 4);
  assert.equal((await call('POST', `/research/projects/${P}/milestones/template`, { stages: ['methodology'] })).body.length, 0, 'no duplicates');
  await call('PATCH', `/records/research_milestones/${made[0].id}`, { status: 'done', completed_on: day(0) });
  await call('PATCH', `/records/research_milestones/${made[1].id}`, { due_date: day(-3) });
  const w = (await call('GET', `/research/projects/${P}`)).body;
  assert.deepEqual(w.progress, { done: 1, total: 4, pct: 25 });
  assert.match(w.next_action.text, /overdue/);
  assert.equal(w.next_action.urgent, true);
  const sug = w.suggestions;
  assert.ok(sug.some((x) => x.title === made[1].title));
  await call('POST', '/records/tasks', { title: made[1].title, module: 'research', linked_entity_type: 'research_projects', linked_entity_id: P, due_date: made[1].due_date });
  await call('POST', '/research/suggestions/dismiss', { key: `m:${made[2].id}` });
  const after = (await call('GET', `/research/projects/${P}/suggestions`)).body;
  assert.ok(!after.some((x) => x.title === made[1].title), 'accepted (task exists)');
  assert.ok(!after.some((x) => x.key === `m:${made[2].id}`), 'dismissed');
  const cal = (await call('GET', `/calendar?from=${day(-10)}&to=${day(10)}`)).body;
  assert.ok(cal.events.some((e) => e.type === 'research_milestones' && e.kind === 'research'));
  const ov = (await call('GET', '/research/overview')).body;
  assert.ok(ov.deadlines.some((d) => d.kind === 'Milestone' && d.overdue));
});

test('literature: duplicates are linked not created; matrix and citation exports', async () => {
  const a = await call('POST', '/research/literature', { project_id: P, title: 'Teacher readiness for blended learning in rural schools', authors: 'Cruz, Ana; Lim, Ben', year: '2022', source: 'Asia Pacific Education Review', volume: '23', issue: '1', pages: '1-15', doi: '10.1007/abc123', findings: 'Readiness depends on training.', relevance: 'Frames the readiness construct.', theme: 'Readiness' });
  assert.equal(a.status, 201, JSON.stringify(a.body));
  assert.equal(a.body.duplicate, false);
  const byDoi = await call('POST', '/research/literature', { title: 'Something else', doi: 'https://doi.org/10.1007/ABC123' });
  assert.equal(byDoi.body.duplicate, true); assert.equal(byDoi.body.literature.id, a.body.literature.id);
  const byTitle = (await call('POST', '/research/literature/duplicates', { title: 'Teacher Readiness for Blended Learning in Rural Schools!', year: '2022' })).body;
  assert.equal(byTitle.length, 1);
  await call('POST', '/research/literature', { project_id: P, item_type: 'book', title: 'Democracy and education', authors: 'Dewey, John', year: '1916', publisher: 'Macmillan' });
  const list = (await call('GET', `/research/literature?project_id=${P}`)).body;
  assert.equal(list.items.length, 2);
  assert.deepEqual(list.themes, ['Readiness']);
  const apaTxt = await call('GET', `/research/literature/citations?project_id=${P}&format=apa`, undefined, true);
  assert.match(apaTxt.buf.toString(), /Cruz, A\., & Lim, B\. \(2022\)\. Teacher readiness .* https:\/\/doi\.org\/10\.1007\/abc123/);
  assert.match((await call('GET', `/research/literature/citations?project_id=${P}&format=ris`, undefined, true)).buf.toString(), /TY {2}- JOUR[\s\S]*DO {2}- 10\.1007\/abc123[\s\S]*ER {2}- /);
  assert.match((await call('GET', `/research/literature/citations?project_id=${P}&format=bibtex`, undefined, true)).buf.toString(), /@article\{cruz2022,[\s\S]*doi = \{10\.1007\/abc123\}/);
  const xl = await call('POST', '/research/literature/matrix/export', { project_id: P, format: 'xlsx' });
  assert.equal(xl.status, 201, JSON.stringify(xl.body));
  const wb = new ExcelJS.Workbook(); await wb.xlsx.load((await call('GET', xl.body.download.replace('/api', ''), undefined, true)).buf);
  assert.equal(wb.worksheets[0].getRow(2).getCell(6).value, 'Readiness depends on training.');
  const dx = await call('POST', '/research/literature/matrix/export', { project_id: P, format: 'docx' });
  assert.match(dx.body.validation.summary, /Verified/);
  assert.match(await docxText(dx.body.download), /Literature Review Matrix .* Frames the readiness construct\./);
});

test('instrument laboratory: initial → expert review → revision → final, versions kept, final protected, export documents validation', async () => {
  let w = (await call('POST', '/research/instruments', { project_id: P, title: 'Blended Learning Readiness Scale', origin: 'developed' })).body;
  const i = w.instrument.id;
  assert.equal(w.versions.length, 1); assert.deepEqual(w.projects.map((p) => p.id), [P]);
  const v1 = w.versions[0].id;
  w = (await call('PUT', `/research/instrument-versions/${v1}`, { response_scale: '1 Strongly disagree – 4 Strongly agree', structure: { dimensions: [{ name: 'Access to devices', items: [{ text: 'I have a device for online classes.' }, { text: 'Internet is unreliable at home.', reverse: true }] }] } })).body;
  assert.equal(w.versions[0].structure.dimensions[0].items.length, 2);
  w = (await call('POST', `/research/instruments/${i}/advance`, { stage: 'expert_review' })).body;
  assert.equal(w.versions.length, 1, 'the reviewed version is the initial one');
  await call('POST', '/records/instrument_reviews', { instrument_id: i, version_id: v1, validator: 'Dr. Ana Cruz', credentials: 'PhD Educational Measurement', recommendation: 'minor_revision', comments: 'Clarify item 2.' });
  w = (await call('POST', `/research/instruments/${i}/advance`, { stage: 'revision' })).body;
  assert.equal(w.versions.length, 2); assert.equal(w.versions[0].structure.dimensions[0].items.length, 2, 'revision starts from the reviewed items');
  w = (await call('POST', `/research/instruments/${i}/advance`, { stage: 'final' })).body;
  assert.equal(w.instrument.stage, 'final');
  assert.equal((await call('PUT', `/research/instrument-versions/${w.versions[0].id}`, { label: 'changed' })).status, 409, 'final version is preserved');
  const x = await call('POST', `/research/instruments/${i}/export`, { format: 'docx' });
  assert.equal(x.status, 201, JSON.stringify(x.body));
  const t = await docxText(x.body.download);
  for (const s of ['Blended Learning Readiness Scale', 'I have a device for online classes.', '(reverse-scored)', 'Dr. Ana Cruz', 'Clarify item 2.', 'Version History']) assert.ok(t.includes(s), s);
});

test('writing: sections from the template, autosave with conflict guard, recovery points, checklist, APA references on export', async () => {
  const d = (await call('POST', '/research/documents', { project_id: P, kind: 'manuscript', word_limit: 6000 })).body;
  assert.deepEqual(d.sections.map((s) => s.heading).slice(0, 3), ['Abstract', 'Introduction', 'Literature Review']);
  const abs = d.sections[0];
  const doc = (t) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: t }] }] });
  const s1 = await call('PUT', `/research/sections/${abs.id}`, { body: doc('This study examined readiness for blended learning among 120 rural teachers.'), base_updated_at: abs.updated_at });
  assert.equal(s1.status, 200, JSON.stringify(s1.body)); assert.equal(s1.body.status, 'drafting');
  assert.equal((await call('PUT', `/research/sections/${abs.id}`, { body: doc('stale'), base_updated_at: abs.updated_at })).status, 409);
  await call('PUT', `/research/sections/${abs.id}`, { status: 'complete' });
  for (const s of d.sections.filter((x) => !['abstract', 'introduction', 'references'].includes(x.section_key))) await call('PUT', `/research/sections/${s.id}`, { status: 'not_applicable' });
  const intro = d.sections.find((s) => s.section_key === 'introduction');
  await call('PUT', `/research/sections/${intro.id}`, { body: doc('Rural schools face connectivity gaps.') });
  let v = (await call('GET', `/research/documents/${d.document.id}`)).body;
  const labels = v.checklist.map((c) => c.label).join(' | ');
  assert.match(labels, /2 sections not marked complete: Introduction, References/);
  assert.match(labels, /Abstract: 11 words/);
  assert.match(labels, /References: 2 linked sources will be listed in APA style/);
  assert.match(labels, /No target journal/);
  const x = await call('POST', `/research/documents/${d.document.id}/export`, { format: 'docx' });
  assert.equal(x.status, 201, JSON.stringify(x.body));
  const t = await docxText(x.body.download);
  assert.ok(t.includes('Rural schools face connectivity gaps.'));
  assert.ok(!t.includes('Results'), 'not-applicable sections are left out');
  assert.match(t, /References .*Cruz, A\., &amp; Lim, B\. \(2022\)\..*Dewey, J\. \(1916\)\./);
  // recovery point after a later edit
  db.prepare("UPDATE research_section_versions SET created_at = '2000-01-01T00:00:00Z'").run();
  await call('PUT', `/research/sections/${intro.id}`, { body: doc('Completely rewritten introduction.') });
  const versions = (await call('GET', `/research/sections/${intro.id}/versions`)).body;
  assert.ok(versions.length >= 1);
  v = (await call('POST', `/research/sections/${intro.id}/versions/${versions[0].id}/restore`)).body;
  assert.match(JSON.stringify(v.sections.find((s) => s.id === intro.id).body), /connectivity gaps/);
  assert.ok(JSON.stringify((await call('GET', '/search?q=connectivity')).body).includes('Introduction'), 'section text is searchable');
});

test('ethics with calendar reminders; submissions recorded into the portfolio once; exports', async () => {
  const e = (await call('POST', '/records/ethics_reviews', { project_id: P, committee: 'University REC', status: 'revisions_required', submission_date: day(-20), required_revisions: 'Revise consent form', revisions_due: day(5) })).body;
  let w = (await call('GET', `/research/projects/${P}`)).body;
  assert.match(w.next_action.text, /overdue|ethics/);
  assert.ok((await call('GET', `/calendar?from=${day(0)}&to=${day(10)}`)).body.events.some((x) => x.type === 'ethics_reviews'));
  await call('PATCH', `/records/ethics_reviews/${e.id}`, { status: 'approved', approval_date: day(0), reference_no: 'REC-2026-014', expiry_date: day(365) });
  const ex = await call('POST', `/research/projects/${P}/ethics/export`, { format: 'docx' });
  assert.match(await docxText(ex.body.download), /REC-2026-014/);

  await call('POST', '/records/research_collaborators', { project_id: P, name: 'Ben Lim', affiliation: 'State University', project_role: 'Co-author' });
  const s = (await call('POST', '/records/research_submissions', { project_id: P, kind: 'journal', title: 'Blended learning readiness in rural schools', venue: 'Asia Pacific Education Review', status: 'submitted', submission_date: day(-90) })).body;
  assert.ok((await call('GET', `/research/projects/${P}/suggestions`)).body.some((x) => /Follow up on the submission/.test(x.title)));
  assert.equal((await call('POST', `/research/submissions/${s.id}/record`)).status, 422, 'not yet accepted');
  await call('PATCH', `/records/research_submissions/${s.id}`, { status: 'accepted', acceptance_date: day(0), doi: '10.1007/accepted1' });
  const rec = await call('POST', `/research/submissions/${s.id}/record`);
  assert.equal(rec.status, 201, JSON.stringify(rec.body));
  assert.equal(rec.body.type, 'publications'); assert.equal(rec.body.record.authors, 'Maria Santos; Ben Lim'); assert.equal(rec.body.record.research_project_id, P);
  await call('PATCH', `/records/research_submissions/${s.id}`, { status: 'published', publication_date: '2026-11' });
  const again = await call('POST', `/research/submissions/${s.id}/record`);
  assert.equal(again.body.record.id, rec.body.record.id, 'the same publication is updated, not duplicated');
  assert.equal(again.body.record.status, 'published');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM publications WHERE deleted_at IS NULL').get().n, 1);
  w = (await call('GET', `/research/projects/${P}`)).body;
  assert.equal(w.publications.length, 1);

  const pr = await call('POST', `/research/projects/${P}/report`, { format: 'docx' });
  assert.equal(pr.status, 201, JSON.stringify(pr.body));
  const pt = await docxText(pr.body.download);
  assert.match(pt, /Research Progress Report .* of 4 milestones completed/);
  assert.match(pt, /Blended Learning Readiness Scale — Final/);
  const dis = await call('POST', '/research/dissemination/export', { format: 'docx' });
  assert.match(await docxText(dis.body.download), /Publications and Presentations Record .* Asia Pacific Education Review/);
  assert.equal((await call('POST', `/research/projects/${P}/report`, { format: 'pdf' })).status, 503, 'PDF needs the desktop renderer');
});

test('archiving takes a project off the dashboard without deleting it', async () => {
  await call('PATCH', `/records/research_projects/${P}`, { archived_at: new Date().toISOString() });
  let o = (await call('GET', '/research/overview')).body;
  assert.ok(!o.projects.some((p) => p.id === P)); assert.equal(o.counts.archived, 1);
  o = (await call('GET', '/research/overview?archived=1')).body;
  assert.ok(o.projects.some((p) => p.id === P));
  assert.ok(JSON.stringify((await call('GET', '/search?q=readiness')).body).includes('Blended learning readiness'), 'still searchable');
  await call('PATCH', `/records/research_projects/${P}`, { archived_at: null });
});

test('manuscripts are tracked, not written: a manuscript record links its Word or Drive document', async () => {
  const m = (await call('POST', '/records/research_documents', { project_id: P, kind: 'manuscript', title: 'Readiness manuscript', status: 'drafting', target: 'Asia Pacific Education Review' })).body;
  const link = await call('POST', `/records/research_documents/${m.id}/evidence`, { provider: 'url', url: 'https://docs.google.com/document/d/abc/edit', title: 'Manuscript draft v3' });
  assert.equal(link.status, 201, JSON.stringify(link.body));
  assert.equal((await call('GET', `/records/research_documents/${m.id}/evidence`)).body[0].title, 'Manuscript draft v3');
  const pl = await call('POST', `/records/research_projects/${P}/evidence`, { provider: 'url', url: 'https://example.org/approval.pdf', title: 'Ethics approval letter' });
  assert.equal(pl.status, 201);
  assert.ok((await call('GET', '/research/overview')).body.manuscripts.some((x) => x.id === m.id));
});

test('appearance: the theme preference defaults to violet, is saved, and refuses unknown themes', async () => {
  assert.equal((await call('GET', '/preferences')).body.theme, 'violet');
  for (const t of ['light', 'sepia', 'crimson-orange', 'violet']) assert.equal((await call('PUT', '/preferences', { theme: t })).body.theme, t);
  assert.equal((await call('PUT', '/preferences', { theme: 'hacker-green' })).status, 422);
});

test('exports follow the chosen paper size; tables stay within the usable width (all six sizes)', async () => {
  const { PAPERS } = await import('../src/paper.js');
  for (const [paper, def] of Object.entries(PAPERS)) {
    assert.equal((await call('PUT', '/preferences', { paper_size: paper })).body.paper_size, paper);
    for (const req of [[`/research/projects/${P}/report`, { format: 'docx' }, false], ['/research/literature/matrix/export', { project_id: P, format: 'docx' }, true]]) {
      const x = await call('POST', req[0], req[1]);
      assert.equal(x.status, 201, `${paper} ${req[0]} ${JSON.stringify(x.body)}`);
      const xml = await (await JSZip.loadAsync((await call('GET', x.body.download.replace('/api', ''), undefined, true)).buf)).file('word/document.xml').async('string');
      const [, w, h] = /<w:pgSz w:w="(\d+)" w:h="(\d+)"/.exec(xml).map(Number);
      const [ew, eh] = def.twips;
      assert.deepEqual([w, h], req[2] ? [eh, ew] : [ew, eh], `${paper} page size`);
      const [, right, left] = /<w:pgMar[^>]*w:right="(\d+)"[^>]*w:left="(\d+)"/.exec(xml).map(Number);
      const widest = Math.max(0, ...[...xml.matchAll(/<w:tblGrid>([\s\S]*?)<\/w:tblGrid>/g)].map((g) => [...g[1].matchAll(/w:w="(\d+)"/g)].reduce((a, m) => a + Number(m[1]), 0)));
      assert.ok(widest <= w - left - right + 20, `${paper}: table ${widest} wider than ${w - left - right}`);
    }
  }
  assert.equal((await call('PUT', '/preferences', { paper_size: 'tabloid' })).status, 422);
  await call('PUT', '/preferences', { paper_size: 'letter' });
});

test('moodboards: one per place of work; notes, stored pictures and links; searchable; outside pictures refused', async () => {
  const g = (await call('GET', '/moodboards/for?type=general')).body;
  assert.equal(g.board.title, 'General ideas');
  assert.equal((await call('GET', '/moodboards/for?type=general')).body.board.id, g.board.id, 'one general board');
  const pb = (await call('GET', `/moodboards/for?type=research_projects&id=${P}`)).body;
  assert.match(pb.board.title, /Blended learning/);
  const n = await call('POST', `/moodboards/${pb.board.id}/items`, { kind: 'note', text: 'Interview teachers about bandwidth constraints', x: 10, y: 20, color: 'yellow' });
  assert.equal(n.status, 201);
  assert.equal((await call('PATCH', `/moodboards/items/${n.body.id}`, { x: 300, y: -40, w: 320 })).body.x, 300);
  assert.equal((await call('POST', `/moodboards/${pb.board.id}/items`, { kind: 'image', image_src: 'https://tracker.example/a.png' })).status, 422);
  assert.equal((await call('POST', `/moodboards/${pb.board.id}/items`, { kind: 'link', url: 'javascript:alert(1)' })).status, 422);
  assert.equal((await call('POST', `/moodboards/${pb.board.id}/items`, { kind: 'link', url: 'https://example.org/readiness' })).status, 201);
  assert.ok(JSON.stringify((await call('GET', '/search?q=bandwidth')).body).includes('Moodboard'));
  assert.equal((await call('DELETE', `/moodboards/items/${n.body.id}`)).status, 200);
  assert.equal((await call('GET', `/moodboards/${pb.board.id}`)).body.items.length, 1);
  assert.equal((await call('GET', '/moodboards/for?type=courses&id=99999')).status, 404);
});
