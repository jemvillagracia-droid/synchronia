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
