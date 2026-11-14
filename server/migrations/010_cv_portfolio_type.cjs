// Allow the 'portfolio' CV type (Academic and Professional Portfolio CV). SQLite cannot alter a CHECK constraint, so
// cv_profiles is rebuilt with SQLite's documented procedure (create new table, copy, drop, rename, recreate indexes and
// triggers). The runner switches foreign keys off for this migration so the drop does not cascade to CV sections and
// exports, then checks every foreign key before committing. (Editing sqlite_master directly is refused by the SQLite
// build inside Electron, which runs in defensive mode.)
module.exports = function up(db) {
  const before = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'cv_profiles'").get().sql;
  if (before.includes("'portfolio'")) return;
  const from = "'short_bio','application')";
  if (!before.includes(from)) throw new Error('cv_profiles CHECK constraint not in the expected form');
  const extras = db.prepare("SELECT sql FROM sqlite_master WHERE tbl_name = 'cv_profiles' AND type IN ('index','trigger') AND sql IS NOT NULL").all();
  const count = db.prepare('SELECT COUNT(*) AS n FROM cv_profiles').get().n;
  const cols = db.prepare('PRAGMA table_info(cv_profiles)').all().map((c) => `"${c.name}"`).join(', ');
  db.exec(before.replace(from, "'short_bio','application','portfolio')").replace(/^CREATE TABLE\s+"?cv_profiles"?/i, 'CREATE TABLE cv_profiles_new'));
  db.exec(`INSERT INTO cv_profiles_new (${cols}) SELECT ${cols} FROM cv_profiles`);
  db.exec('DROP TABLE cv_profiles');
  db.exec('ALTER TABLE cv_profiles_new RENAME TO cv_profiles');
  for (const e of extras) db.exec(e.sql);
  if (db.prepare('SELECT COUNT(*) AS n FROM cv_profiles').get().n !== count) throw new Error('CV count changed while widening the CV type list');
  const broken = db.prepare('PRAGMA foreign_key_check').all();
  if (broken.length) throw new Error(`Foreign key check failed after rebuilding cv_profiles (${broken.length} rows)`);
};
// Run with foreign keys off (a pragma that cannot change inside a transaction, so the runner sets it beforehand).
module.exports.foreignKeysOff = true;
