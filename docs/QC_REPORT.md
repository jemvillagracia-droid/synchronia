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
