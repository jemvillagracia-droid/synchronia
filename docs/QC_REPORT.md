# Quality-control report — release 0.5.0

Date: 13 November 2026. Scope: the whole application after the violet UI, Nexus command display, save-path work and
URS syllabus tools.

## 1. Automated tests — 47 / 47 passing (`npm test`)

| Suite | Tests | Covers |
|---|---|---|
| `api.test.js` | Foundation and portfolio | Access key and host guard, CSRF header, validation, soft delete and restore, audit history, search, capture, migrations (5) |
| `cv.test.js` | CV Studio | Model composition, Harvard layout, PDF/DOCX export, text extraction, ATS analysis, image uploads, rejected uploads |
| `academic.test.js` | Academic Workspace | TOS apportionment, I/P/D alignment, URS syllabus export structure, TOS/rubric round-trips, reports |
| `backup.test.js` | Save path | Durability settings, backup and verified restore, corrupt snapshot refused, pruning, pre-update snapshot |
| `importer.test.js` | Institution and import | Institution validation, letterhead extraction, messy-syllabus parsing (nested tables, tabs, line breaks, grouped outcomes, map, outline, grading, signatories), atomic commit and re-import, landscape 8.5 × 13 export with banners, non-Word refusal |

## 2. Interface sweep in the real Electron app

19 screens (every module, every Academic tab, every course tab with an imported syllabus open, Portfolio, CV Studio,
Settings) at three window widths (1500, 1024, 760 px) — 57 page loads.

| Check | Result |
|---|---|
| JavaScript errors or React warnings | **None** |
| Page wider than the window (sideways scroll) | **Fixed.** At 760 px the top bar pushed 162 px past the edge; the search box now shrinks and labels give way to icons |
| Text cut off with an ellipsis inside page content | **None** |
| Accessibility (axe-core 4.10, WCAG 2 A/AA + best practice) | **Fixed:** small violet text was 3.2–3.6:1, now uses the lighter violet (above 4.5:1); the status bar had a role not allowed on `footer`. **Remaining by design:** the unlit LCD lamps (AM/PM, Caution, Danger) on the Nexus clock are dim on purpose, hidden from screen readers, and exempt as inactive decoration; the lit state is announced |

## 3. Generated documents (rendered in LibreOffice)

| Document | Page | Result |
|---|---|---|
| Syllabus (imported sample, 18 weeks, 20 POs, 6 CILOs, 73 map links) | 8.5 × 13 landscape, 10 pages | Letterhead banner and footer on every page; table headers repeat across pages; degrees kept as written in signatories |
| Table of Specifications | Letter landscape | **Fixed:** cognitive-level headers broke mid-word (“Rememberin‑g”); header font and widths adjusted |
| Scoring rubric (4 levels) | Letter landscape | Correct |
| Teaching accomplishment report | Letter portrait | Correct |
| Extension narrative report | Letter portrait | Correct |

**Defect found and fixed:** every landscape export was written with portrait page dimensions plus a landscape flag
(the document library swaps the dimensions itself). Word and LibreOffice showed these pages as portrait. All landscape
documents are now true landscape, and a test checks the page size.

## 4. Save path

- Every write is committed with `synchronous=FULL` in WAL mode before the app reports it saved.
- Editors autosave after 1.2 s of quiet and flush on close. Leaving a page or closing the window with unsaved
  changes asks first.
- Imports are all-or-nothing: a failed syllabus import leaves no partial course, outcomes or syllabus behind (nested
  transactions use savepoints).
- Snapshots are verified with an integrity check before a restore is scheduled, and the restore is applied on the next
  start after the current database is snapshotted.

## 5. Known limits

- The installer is not code-signed, so Windows SmartScreen shows “Unknown publisher” on first run.
- Phases 5–7 (Intelligence, Administrative Operations, Integration) are still placeholders.

---

# Quality-control addendum — release 0.6.0 (Phase 5, Intelligence)

| Check | Result |
|---|---|
| Automated tests | **55 / 55 passing** (`intelligence.test.js` adds 8) |
| Counting rules | Verified against a seeded school year: in-period, out-of-period and undated records; school-year overlap; ongoing spans; distinct partners ignoring letter case; current assignments started before the period |
| Traceability | Every indicator lists its records with type, ID, date basis and support level; reports cite [S#] and list all sources with record IDs |
| Formats | Word and PDF rendered and inspected (letterhead; PDF footer banner on every page); spreadsheet read back: three sheets, frozen header, filters, real dates |
| Interface | 55 page loads at three widths plus the indicator pop-up: no errors, no sideways scroll, no clipped text |

Defects found and fixed during this pass:

- A custom report with no sections selected silently included every section; it is now refused.
- "Manuscripts in progress" counted manuscripts recorded after a historical period; it now counts only those recorded by the end of the period.
- Course rows read "Undated" although courses are counted by their offerings; they now show "—", and class offerings show their school year (e.g. "SY 2026–2027").
- Unit labels in report details read "45 student"; they now come from the indicator ("45 students").
- PDF reports carried the letterhead only at the top of page 1; the footer banner now appears on every page.
- Support tags for "Confirmed" and "Self-reported" looked alike; each support level now has its own colour, matching the legend.
- Accessibility: the research pipeline headers had dark text on violet (below 4.5:1), now white; action columns in two tables had empty headers, now labelled for screen readers.

---

# Quality-control addendum — release 0.7.0 (Phase 6, Administrative Operations)

| Check | Result |
|---|---|
| Automated tests | **66 / 66 passing** (`admin.test.js` adds 11, including the migration of legacy routing notes) |
| End-to-end in Electron | The whole module driven through the interface (forms, quick log, routing, minutes, action items, exports, turnover, role change, office report): all steps passed, no console errors |
| Documents | Minutes, turnover documentation and office accomplishment report rendered in LibreOffice and inspected |
| Interface | 28 admin views and pop-ups at three widths, plus a 58-page regression sweep: no errors, no sideways scroll, no clipped text; only the documented decorative LCD lamps remain |

Defects found and fixed during this pass:

- Records created through the standard record form were not numbered; numbering now applies to every way a document or secretariat record is created.
- Numbered lists in Word continued one shared count (the Absent list started at 4, the agenda at 5); each list now restarts at 1.
- Signature blocks could split across pages (names on the next page); signature tables now stay together.
- In the daily log, the time boxes were too narrow and hid the first digit ("1:30" for "11:30").
- With the sidebar narrowed to icons (≤ 1100 px), its links had no accessible names; every link is now named.
- Routing steps listed under an Intelligence indicator opened nothing when clicked; they are now shown as plain entries.

---

# Quality-control addendum — release 1.0.0 (Phase 7, Integration and Continuity)

| Check | Result |
|---|---|
| Automated tests | **85 / 85 passing** (`continuity.test.js` 8, `security.test.js` 11) |
| Security | Every API route enumerated from source and refused without the access key (and with a wrong key); see `docs/SECURITY.md` |
| Dependencies | Production: **0 known vulnerabilities** after upgrading Electron 38 → 45.1.0 and react-router-dom → 6.30.6 and pinning uuid 11.1.1; remaining advisories are in build-only tools |
| Runtime (Electron 45) | All end-to-end walkthroughs re-run; renderer isolation, CSP enforcement, blocked navigation and pop-ups, denied permissions verified in the running app |
| Interface | 64 page loads at three widths plus 28 administrative views/pop-ups: no errors, no sideways scroll, no clipped text; only the documented decorative lamps remain |

Defects found and fixed during this pass:

- The app reported its version as 0.1.0 (hard-coded); it now reads the real version.
- An oversized request returned 500 and logged a stack trace; it now returns 413 with a plain message.
- Electron 38 had reached end of support with open security advisories; upgraded to Electron 45.
- Opening a local file reference could launch a program or script, or touch a network path; these are now refused.
- Permission requests (camera, microphone, location, notifications) were not explicitly denied; they now are, in every window.
- A Drive hint said “Drive sync arrives in Phase 7” — misleading, since nothing is synchronized; corrected.
- Library titles and timeline entries showed default button styling, and timeline labels ran into titles; fixed.
- A status tag on a violet panel header was below the contrast minimum; fixed.

# Quality-control addendum — release 1.1.0 (owner requests and quality-check directive)

Scope: the owner's requests (centred pop-ups, an Evangelion-style Central Nexus, a Philippine/Australian calendar, CV
import) and the gaps found when the build was measured against *SYNCHRONIA Quality Check* (export self-validation, CV
modes, wording review, never claiming success without verification, QA checklist and defect log).

| Check | Result |
|---|---|
| Automated tests | **102 / 102 passing** (new: `calendar.test.js` 4, `cvimport.test.js` 7, `exportcheck.test.js` 4, `upgrade.test.js` 2) |
| Upgrade path | A populated 1.0.0 database upgrades inside Electron's own runtime: CVs, sections and exports kept, integrity and foreign-key checks pass, cascades still apply |
| Fresh install | Empty data folder → all migrations → CV import of a real two-column PDF CV (36 records, 5 profile fields) → CV PDF export, verified |
| Pop-up position | Record drawers, quick capture, search and context pop-ups measured at 1500×950, 1280×720 and 1024×768: equal space above/below and left/right |
| Interface | 67 page loads at three widths (now including the calendar) plus 28 administrative views and pop-ups: no errors, no sideways scroll, no clipped text; only the documented decorative lamps remain |
| Calendar | PH 2026–2027 and AU (all states) checked against published lists; moving an estimated holiday and hiding a day verified in the app |
| Exports | Every DOCX/PDF/XLSX path reopened by an independent reader before saving; deliberately broken files are refused (tests) |

## Defect log

| # | Severity | Defect | Found by | Fix | Verified by |
|---|---|---|---|---|---|
| 1 | **Critical** | Migration 010 widened the CV-type CHECK by editing `sqlite_master`; Electron's SQLite runs in defensive mode and refuses this, so **every install (new or upgraded) would have failed to open** | Electron UI sweep hung at launch; reproduced under Electron's Node | Rebuild `cv_profiles` by SQLite's documented procedure, foreign keys off for that migration only, then `foreign_key_check`; a test forbids `writable_schema` | `upgrade.test.js`; populated database migrated under Electron; fresh install end to end |
| 2 | High | Exports were reported as saved without being reopened, so a broken file could be reported as success | Quality directive | `exportcheck.js`: reopen, check text, pages, editability and artefacts; refuse to save on failure; the result is shown to the user | `exportcheck.test.js`; all report, CV and document tests |
| 3 | High | Historical records required an exact day, pushing users to invent dates (risk of false precision in CVs) | Owner's CV (year-only entries) | Partial dates (year / month / day) end to end: forms, validation, CV, timeline, analytics | Tests; CV rendered with "2019" and "Jun 2019" |
| 4 | Medium | Record pop-ups sat low on the desktop window (padding only at the top for the title bar) | Owner | Symmetric padding and auto margins | Measured at three window sizes |
| 5 | Medium | Talks given as resource speaker were listed under trainings attended | Owner's CV | Separate "Resource speakership and invited talks" section; migration adds it, hidden, to existing CVs | `cvimport.test.js`; rendered CV |
| 6 | Medium | Ongoing degree sorted below completed ones in Education | Rendered CV review | Ongoing studies sort first | Rendered CV |
| 7 | Medium | Word CV import: a date in the same paragraph made bold titles read as plain, and list bullets merged into one line | Synthetic .docx fixtures | Boldness measured without the date run; numbered/bulleted paragraphs kept separate | `cvimport.test.js` |
| 8 | Medium | PDF CV import: wrapped titles split into two entries; words run together | Real CV (kept outside the repository) | Title continues after its date; joins use the measured gap between words | Real-CV walkthrough |
| 9 | Low | Calendar grid cells lacked ARIA rows and column headers | axe sweep | Rows with `role="row"` and `columnheader`s | Sweep clean |
| 10 | Low | Out-of-month days, done items and the Nexus status labels fell below the contrast minimum | axe sweep | Muted colours instead of opacity; brighter status labels | Sweep clean |
| 11 | Low | Calendar service and duplicate check used table names that differ from the registry | Tests | Use registry table names | Tests |

## Not built, by decision

- **Multi-device sync, cloud storage, mobile app or PWA**: out of scope. SYNCHRONIA stays a single-owner Windows desktop
  app (owner's decision for 1.1). The complete archive and backup copy/import cover moving data between computers.
- **AI writing review**: not built in. Wording suggestions are rule-based and say so; nothing is sent anywhere.
- **Holiday dates fixed by proclamation** (Eid'l Fitr, Eid'l Adha and occasional special days) are estimates until
  proclaimed; the calendar marks them and lets the owner set the proclaimed date.
- **CV import accuracy** depends on the CV's layout. Every item is reviewed before saving and saved as self-reported;
  author lists of research papers in particular should be checked.
