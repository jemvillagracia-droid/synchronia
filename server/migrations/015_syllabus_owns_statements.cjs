// From 1.2 the vision, mission, goals (VMGO) and the reviewer/approver signatories belong to each syllabus, not to
// Settings. Values already entered in Settings are copied into every existing syllabus that has not yet been opened
// as a document (those already converted carry them in their text), filling only empty places, so every syllabus
// prints exactly as before. The values are left in storage; Settings no longer shows or uses them.
const VMGO = ['vision', 'mission', 'goals_national', 'goals_regional', 'goals_university', 'core_values', 'graduate_attributes'];

module.exports = function up(db) {
  const parse = (j) => { try { return j ? JSON.parse(j) : {}; } catch { return {}; } };
  for (const row of db.prepare('SELECT user_id, data_json FROM institution_settings').all()) {
    const inst = parse(row.data_json);
    const vmgo = Object.fromEntries(VMGO.map((k) => [k, typeof inst[k] === 'string' ? inst[k] : '']));
    const reviewer = { name: inst.program_head_name || '', title: inst.program_head_title || '' };
    const approver = { name: inst.dean_name || '', title: inst.dean_title || '' };
    if (!VMGO.some((k) => vmgo[k]) && !reviewer.name && !approver.name) continue;
    const syllabi = db.prepare('SELECT id, content_json FROM syllabi WHERE user_id = ? AND document_json IS NULL').all(row.user_id);
    const save = db.prepare('UPDATE syllabi SET content_json = ? WHERE id = ?');
    for (const s of syllabi) {
      const c = parse(s.content_json);
      c.vmgo = c.vmgo && typeof c.vmgo === 'object' ? c.vmgo : {};
      for (const k of VMGO) if (!c.vmgo[k] && vmgo[k]) c.vmgo[k] = vmgo[k];
      c.signatories = c.signatories && typeof c.signatories === 'object' ? c.signatories : {};
      if (!c.signatories.reviewed_by_name && reviewer.name) { c.signatories.reviewed_by_name = reviewer.name; c.signatories.reviewed_by_title = c.signatories.reviewed_by_title || reviewer.title; }
      if (!c.signatories.approved_by_name && approver.name) { c.signatories.approved_by_name = approver.name; c.signatories.approved_by_title = c.signatories.approved_by_title || approver.title; }
      save.run(JSON.stringify(c), s.id);
    }
  }
};
