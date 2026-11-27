# SYNCHRONIA — 2nd Quality Check: QA Report

Version 1.4.4 · 27 November 2026

## 1. Modules inspected

| Module | Scope |
|---|---|
| Central Nexus | Command display, 12-hour clock, calendar monitor, countdowns, record-activity graph, MAGI panels, Quick Capture, global search, widget customisation |
| Left-side navigation | Grouped numbered sidebar, collapse, active indicator, deep links, back/forward, reload, tablet/phone menu |
| Command Center | Academic Calendar (quick entry, school-calendar import, PH/AU holidays), System Timer, Quick Capture, Idea Moodboard |
| Academic Workspace | Courses, Word-like syllabus editor (autosave, recovery points, pictures, tables), classes, class records, extension, faculty development, generated documents |
| Research Development | Idea capture, projects by stage, milestones, literature (APA, RIS, BibTeX, matrix), instruments (initial → final, locked), ethics, manuscripts as links, publications — workspace only, no full Word editor |
| Professional Portfolio | Profile, timeline, 11 categories, evidence links, verification states, CV import, PDS Section VII by year |
| Curriculum Vitae Studio | 7 templates, 6 CV types, section editing, photographs, ATS analysis, Word / PDF / ATS Word / ATS PDF, versions |
| Reports and Analytics | Analytics A–E with traceable sources, 9 report types in Word / PDF / Excel |
| Administrative Operations | Today, correspondence registry and routing, follow-ups, meetings and minutes, secretariat, daily log, tasks, turnover |
| Knowledge and References | Library of linked references, Google Drive linking, search everything |
| Settings | Workspace and navigation, 10 themes, reduced motion, paper size, document headers and letterhead, backup and recovery, recycle bin, security |
| Document production | Word and PDF engines, export verification (every file is reopened before it is reported saved), six paper sizes |
| Database and storage | SQLite with migrations, audit history, search index, encrypted protected fields, integrity check at start |
| Backup and recovery | Automatic and manual backups, restore on next start, import/export of the whole archive |

## 2. Feature inventory

| Classification | Features |
|---|---|
| Working correctly | All modules and functions listed above, as verified by the tests in section 4. |
| Working with limitations | School-calendar import cannot read photos or scans (no text in them) — the text can be pasted instead. PDF export and live CV preview need the desktop app (by design). Google Drive linking needs a one-time Google sign-in; it could not be exercised in the test environment. |
| Partially functional | None found. |
| Broken | None remaining. Nine defects found in this audit were fixed (section 3). |
| Duplicated | None. (Literature Review appears in the sidebar as a shortcut into Research Development — the same page, intentionally.) |
| Unused | None found. Earlier research document sections are kept in the database only so existing data is never lost. |
| Not implemented (by decision) | Cloud / multi-device synchronization and a mobile app — SYNCHRONIA is desktop-only, as chosen; the status bar says "Local database · offline" and nothing claims to be synced. A separate notification-settings page: notifications are limited to the System Timer (with a Windows notification when the app is in the background) and the in-app bell. |

## 3. Defects found and fixed

9 defects found (0 critical, 0 high, 4 medium, 5 low). All fixed and verified by a test.

### QA2-01 · Medium · All record pop-ups

- **Reproduction:** Open a new record, leave the required title empty, enter −5 hours, press Save.
- **Expected:** Every problem shown under its field with a summary; typed text kept.
- **Actual:** Nothing visible in the app; the browser showed a brief tooltip on the first field only.
- **Root cause:** The browser's built-in form check intercepted Save before the app's own validation could run.
- **Fix:** The app's validation now always runs: a message under each field and a summary line ("Not saved — check the 2 fields marked below. Everything you entered is kept.").
- **Verification:** qa-workflows: 3 checks pass

### QA2-02 · Low · Central Nexus

- **Reproduction:** Open the Central Nexus status strip.
- **Expected:** No wording that suggests cloud synchronization.
- **Actual:** "SYNC 000 THIS WEEK" could be read as data synced to a server.
- **Root cause:** Themed label for a count of records changed this week.
- **Fix:** Relabelled "ACTIVITY", with a tooltip stating that SYNCHRONIA works on this computer only.
- **Verification:** Manual check; consistency sweep clean

### QA2-03 · Medium · CV Studio — export

- **Reproduction:** Export a CV with a long website (e.g. an ORCID link) in the Traditional, Research, Faculty or Minimalist ATS template.
- **Expected:** Contact items kept whole.
- **Actual:** The address broke mid-number ("…1825-" / "0097"); one template left a "|" at a line end.
- **Root cause:** Line breaking was left to the browser and to Word, which break inside long tokens.
- **Fix:** Contact items are packed into lines between items, the same way for Word and PDF.
- **Verification:** cvlayout.test (2); 28 CV files inspected page by page

### QA2-04 · Low · CV Studio — export

- **Reproduction:** Export the Traditional or Comprehensive template.
- **Expected:** Dates on one line.
- **Actual:** "Jun 2016 – May / 2020"; "Valid / until Mar 2026".
- **Root cause:** Date column 1.25 in wide; licence validity in the date column.
- **Fix:** Column widened (1.45–1.5 in); "Valid until …" moved under the title.
- **Verification:** Visual inspection at Letter, A5, B5

### QA2-05 · Low · CV Studio — Word

- **Reproduction:** Export any capitals-heading template to Word.
- **Expected:** Headings in capitals, as in the PDF.
- **Actual:** Headings in title case in Word.
- **Root cause:** The heading style's capitals setting never reached the Word file.
- **Fix:** Capitals written into the heading text.
- **Verification:** Word XML checked; CV tests updated to compare without case

### QA2-06 · Medium · Research Development — exports

- **Reproduction:** Export an instrument with items and an expert review.
- **Expected:** Item text has the width; headings intact.
- **Actual:** "No." column took a third of the table; "Recommenda / tion".
- **Root cause:** Tables had no column widths; the PDF renderer ignored widths even when set.
- **Fix:** Relative widths on every research table; the PDF renderer now honours widths (also fixes resized syllabus tables in PDF).
- **Verification:** Paper QA (90 Word files) + page images

### QA2-07 · Medium · Portfolio — PDS L&D PDF

- **Reproduction:** Export the L&D list to PDF on Long (folio) paper.
- **Expected:** Dates and types inside their columns.
- **Actual:** "27/12/2025" ran into the next column; "TECHNICAL" touched the sponsor.
- **Root cause:** Narrow fixed columns holding text that cannot break.
- **Fix:** Column widths rebalanced, short date headings, text wraps inside a cell as a safety net, landscape on A5/B5.
- **Verification:** pds tests (incl. A5 landscape); pds-learning 19/19; page images

### QA2-08 · Low · Portfolio — PDS L&D Excel

- **Reproduction:** Print the exported spreadsheet.
- **Expected:** Wrapped titles fully visible.
- **Actual:** Rows one line high; text touched borders.
- **Root cause:** Excel fits row heights only when a cell is edited.
- **Fix:** Row heights set from the longest wrapped cell.
- **Verification:** LibreOffice print check

### QA2-09 · Low · Document production

- **Reproduction:** Compare a research or L&D PDF with its Word version.
- **Expected:** The same SYNCHRONIA document font.
- **Actual:** PDF in Arial, Word in Times New Roman.
- **Root cause:** The PDF page template defaulted to Arial.
- **Fix:** Times New Roman for research and L&D PDFs; the syllabus keeps Arial (university format).
- **Verification:** pdffonts on every PDF

## 4. Tests performed and regression results

| Test | Result |
|---|---|
| Automated tests (unit, integration, API, database) | 133 tests in 20 files — all pass |
| QA workflows (new; directive sections III–V) | 28/28 — typing with Shift symbols, accents, Backspace/Delete, Tab inside pop-ups, Enter, validation that keeps input, a failed save never shown as success, back/forward/reload, unsaved-change guard, search/filter/sort, recycle-bin restore, crash recovery, backup and restore, identical repeated exports, tablet and phone widths |
| Every record pop-up | 44 of 44 record types created, reopened, edited and closed through their pop-ups |
| Keyboard | 41 pop-up keyboard checks (Shift key regression) + 31 shortcut checks — all pass |
| Module walkthroughs | Syllabus editor 16, Research 10, School calendar 20, PDS L&D 19, Timer/Moodboard/paper 24 — all pass |
| CV output | 28 files (7 templates × 4 formats) inspected page by page with a full sample portfolio and re-opened in LibreOffice; 52 exports across templates and all six paper sizes — 0 problems |
| Other exports | 90 Word reports (15 types × 6 papers) rendered by LibreOffice; PDFs at every paper size — 0 problems |
| Interface | 157 pages: accessibility, overflow and clipping — clean; 172 page views across 10 themes — clean; controls inside panels at 1024/1280/1500 px — clean; consistency measurements across all modules |
| Security | Security suite (access key, host check, CSRF header, cookies, headers, injection, path traversal, uploads, encryption, markup escaping) plus the newest routes checked by hand |
| Large data | 10,000 records (about ten years of heavy use), see section 6 |
| Crash and restart | App killed mid-work: autosaved syllabus text present, integrity check OK, restart in 0.8 s with no manual cleanup |

## 5. Data integrity findings

- Records saved through every pop-up are stored and read back exactly, including long text, accents and non-English characters.
- A failed save never shows a success message; the pop-up and its text stay.
- Deleting moves records to the recycle bin; restoring brings them back with their history.
- Killing the app mid-work loses nothing that autosave had stored; the database passes its integrity check on restart.
- Backup and restore return the data to the backup's moment; a backup of the current data is taken first.
- Schema upgrades from earlier versions keep all records (upgrade tests). Removed default signatories and institutional VMGO do not reappear (migration and settings tests).

## 6. Performance observations

With 10,000 records (7.2 MB database):

| Operation | Time |
|---|---|
| Central Nexus overview | 79 ms |
| Lists (page of 50 of 3,000) | 3–4 ms |
| Global search | 2–4 ms |
| Calendar month | 2 ms |
| Portfolio summary | 11 ms |
| Reports and Analytics, one school year | 11 ms |
| PDS L&D, all years (3,000 trainings) | 18 ms |
| CV editor data (3,000 trainings) | 70 ms |
| CV Word export (3,000 trainings) | 0.5 s |
| PDS Excel export, all years | 0.5 s |

Lists are paged (50 at a time) and searches use the full-text index, so screens stay fast as the archive grows.

## 7. Export quality findings

- Word files are genuine, editable .docx; PDFs have selectable text and embedded fonts; both are reopened and checked before the app reports them saved.
- Exporting the same records twice gives identical Word content and identical PDF text.
- All six paper sizes produce the right page size with nothing outside the page.
- CV: Harvard-inspired and ATS versions, section order, dates, publications (APA) and photographs (visual versions only) checked page by page. Nothing is invented: missing details are flagged, never filled in.

## 8. Security findings

- Every route refuses requests without the launch's access key (401) and refuses writes without the app's own header (403), including the routes added this month.
- Folder and evidence links accept only web addresses (javascript: and file: links are refused).
- Uploads are checked by their content; generated documents escape any markup typed into records; protected fields are encrypted in the database file.
- No security defects were found in this audit.

## 9. Outstanding issues and limitations

- No claim of 100% bug-free operation: the figures above are what was tested; untested combinations may still hide defects.
- Fonts were checked on Linux with metric-identical substitutes for Times New Roman and Arial; Windows uses the real fonts, so line breaks should match.
- Large-data testing went to 10,000 records; larger archives were not measured.
- Google Drive linking needs a Google sign-in and could not be exercised in the test environment.
- The installer is not code-signed, so Windows SmartScreen may warn on first install.
- Multi-device synchronization is not implemented (desktop-only by decision). To move data between computers, use Settings › Backup and recovery › export, then import on the other computer.

## 10. Release recommendation

**Recommended for release as 1.4.4.** No critical or high-severity defects are open; all nine defects found in this audit are fixed and verified; core workflows, data persistence, backup and recovery, document export, keyboard and pop-up behaviour all pass their tests.
