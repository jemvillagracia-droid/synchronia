# SYNCHRONIA — Development Checklist

Directive Section XIV asks for a maintained development checklist with every major workflow tested.

## Phase 1 — Identity and Foundation ✅

| Directive item | Status | Notes |
|---|---|---|
| SYNCHRONIA name and branding throughout | ✅ | Title, sign-in, navigation, page titles, favicon, API metadata, export files. No "Sublime Sync Rate" codebase existed, so nothing needed renaming or migrating. |
| Evangelion-inspired visual identity | ✅ | Charcoal/near-black, restrained violet/orange/red, chamfered geometric panels, condensed didone display face, IBM Plex for UI/data |
| Layout: sidebar, top nav, main, right context panel | ✅ | Collapsible sidebar; top bar has search, Quick Capture, academic mode, notifications, context toggle, settings, profile |
| Responsive (desktop, tablet, mobile) | ✅ | Icon rail ≤1180px, off-canvas navigation ≤720px; no horizontal overflow at iPhone width |
| Unified database architecture (Section XI) | ✅ | All core entities in `001_foundation.sql`; migrations versioned |
| Central Nexus with all Section III widgets | ✅ | Profile, position, development progress, teaching, research, extension, PD, deadlines, admin queue, recent records, recent CVs, accomplishments, captures |
| Configurable widgets | ✅ | Reorder (drag or buttons), hide/show, reset to role default; saved per user |
| Quick Capture | ✅ | Task, activity, idea, research note, accomplishment; keyboard `C` |
| Global search over all structured records | ✅ | SQLite FTS5 with prefix matching and highlighting; `/` or `Ctrl K` |
| Secure authentication | ✅ → revised | Phase 1 shipped password sign-in; replaced at the owner's request by single-owner desktop access (see below) |
| Role reconfiguration (Section VIII) | ✅ | Academic mode: administrative / instructor / researcher / faculty development |

### Also in place early (foundations for later phases)

- Generic record API and basic registers for every entity type (data entered now carries into the full modules)
- Recycle bin and restore, audit trail with field-level version history, full JSON export
- Licence registration numbers encrypted at rest (AES-256-GCM)
- Verification states; `evidence_verified` refused by the server unless evidence is linked
- Duplicate prevention via partial unique indexes

## Verified workflows

**Automated, `npm test`: 13 API tests, all passing**
schema and seeds · first-run setup and auth gate · CSRF · sign-in/out and wrong password · Quick Capture routing and validation ·
CRUD, duplicates, recycle bin, history · encryption at rest and masking · evidence-verification guard · reference
ownership · search, including deleted-record removal and index rebuild · Nexus aggregation · preferences and layout ·
isolation between users.

**End-to-end browser walkthrough (Playwright, production build)**
owner setup → profile → 7 quick captures → portfolio and academic registers (including a validation error) →
populated Nexus → notifications → complete task from widget → search → record drawer → edit → version history →
configure widgets and confirm after reload → mode switch → settings and data → wide layout with context panel →
mobile layout and navigation → sign out → wrong password rejected.

## Platform change — Windows desktop, single owner ✅

| Item | Status | Notes |
|---|---|---|
| Windows desktop app | ✅ | Electron 38 shell; NSIS installer `SYNCHRONIA-Setup-<version>.exe`, per-user install, Start-menu and desktop shortcuts |
| No sign-in | ✅ | Owner account created automatically. Fresh random access key at each launch, delivered only to the app window as an HttpOnly, SameSite=Strict cookie |
| Local-only data service | ✅ | Binds to 127.0.0.1 on a random port. Host-header guard (DNS rebinding), CSRF header, CSP, no dev tools or menu in the installed app |
| Data location | ✅ | `%APPDATA%\SYNCHRONIA\data`, kept on uninstall. Shown in Settings › Application |
| Native integration | ✅ | Title bar overlay with native window controls, native file picker for evidence, opens files and links with their default apps, single instance, remembers window size |

## Phase 2 — Professional Portfolio ✅

| Directive item (Section V) | Status | Notes |
|---|---|---|
| A. Professional profile | ✅ | Identity, current role, next appointment target, contact. Photo management is Phase 3 (CV Studio) |
| B. Educational background | ✅ | Degree, major, institution, location, attendance dates, graduation, distinctions |
| C. Professional licenses | ✅ | Registration number AES-256-GCM encrypted and masked, with an audited Reveal. Validity tracking, expiry notifications 60 days ahead |
| D. Employment history | ✅ | Position, office, period, current flag, responsibilities, accomplishments |
| E. Academic appointments | ✅ | Rank, designation, department, period, courses and teaching responsibilities |
| F. Research and publications | ✅ | Publications with APA-style citation display, conference presentations, research projects |
| G. Professional development | ✅ | Type, role, organizer, dates, hours, CPD units; totals per category |
| H. Institutional service | ✅ | Committees, secretariat and administrative contributions, leadership, professional affiliations |
| I. Awards and recognition | ✅ | Title, issuer, level, date, description |
| Editable, searchable, classifiable | ✅ | Per-category editors with sections, labels and hints; filter by text, missing evidence, unconfirmed, missing details; sort by event date or last edit; global search |
| Linkable to supporting evidence | ✅ | Google Drive share links (file ID extracted), web links, files on this PC (native picker, opened in place). References can be reused across records; no files are copied |
| Evidence completeness indicators | ✅ | Per record (evidence count, completeness ring of recommended fields), per category, portfolio-wide, plus a "Needs attention" list |
| Never shown as verified without evidence or confirmation | ✅ | Self-reported → Confirm accurate → Mark evidenced. The server refuses "evidenced" without linked evidence and reverts it when the last evidence is removed |
| Chronology rules | ✅ | End dates must not precede start dates, including on partial edits |
| Quick Capture accomplishments | ✅ | Saved straight into the portfolio. Migration 002 moved Phase 1 captures |

## Verified workflows (Phase 2)

**Automated (`npm test`): 20 API tests, all passing.** Added in Phase 2: per-launch access key and open-redirect guard,
DNS-rebinding guard, chronology validation, completeness, evidence (Drive, web, local, reuse, duplicate link, verify,
auto-revert), audited reveal, licence expiry notification, portfolio summary, and migration 002 on a Phase 1 database.

**End-to-end in the real Electron app (Playwright + Xvfb).** Opens with no sign-in → profile → 9 records across 7
categories → date-order error shown → Drive evidence then "Mark evidenced" → local-file evidence through the file
picker → Confirm accurate → licence Reveal → captured accomplishment appears in the portfolio → filters → overview,
Nexus and settings screens.

**Packaged build.** The bundled (asar) app launches. Data is created in the configured folder, menu and dev tools
are off, and a request to the data service from outside the window gets 401.

**Not verified here:** the Windows installers were built on Linux (with Wine) and their contents inspected, but have not
been run on a Windows machine.

## Phase 3 — Curriculum Vitae Studio ✅

| Directive item (Section VI and UI/UX directive III–VIII) | Status | Notes |
|---|---|---|
| A. CV profiles | ✅ | Academic, professional, faculty, research, administrative, short biography and customized application CVs, all drawing on one portfolio |
| B. Comprehensive sections | ✅ | 22 standard sections plus custom ones. Reorder by drag or arrows, show/hide, hide empty sections, rename, page break before |
| Manual editing | ✅ | Per-CV wording overrides, with "Use portfolio wording" to undo. Manual entries in any section |
| C. Template engine | ✅ | Seven presets: Harvard-inspired (not an official Harvard template), traditional, modern, research, faculty and teaching, comprehensive, minimalist ATS. Switching templates keeps all content |
| Layout controls | ✅ | Letter, A4 or folio (8.5×13) page; margins; font; size; spacing; reverse or chronological order; date format; page numbers; footer text; optional photograph |
| D. Photographs | ✅ | Drag-and-drop or file picker, upload progress, 100 MB limit enforced while streaming. Server checks file signature, declared type and header dimensions. Crop and reposition with aspect presets; decoding and optimizing run in a Web Worker so the app never freezes. Original kept byte-for-byte; optimized JPEG used in CVs; multiple photographs; per-CV selection; replace and remove |
| E. Portfolio-to-CV sync | ✅ | Entries reference portfolio records (no copies). New records are offered per section (Add / Not on this CV) and also raised as notifications. Never applied silently; never applied to finalized CVs |
| Duplicates, inclusion, versions | ✅ | Each record links once per section. Include/exclude per entry. Draft and finalized versions; "New draft version" copies everything |
| F. Export | ✅ | Genuine DOCX (Heading 1 and Title styles, real bullets, tab-stop dates, no tables or text boxes); tagged, text-based PDF printed by Chromium; ATS DOCX and PDF; re-export any time; descriptive filenames; export history |
| ATS mode | ✅ | Single column, conventional headings (sections merged where they share one), no photograph, rules or colour |
| ATS compatibility analyzer | ✅ | Text extraction, heading recognition, section organization, reading order, chronology, date association, font, graphics, image-only text, structure, duplicates, publication details, keyword relevance, essential information. No compatibility guarantee claimed |
| AI-readability validation | ✅ | Extracted-text preview of what a parser reads from the PDF and from the Word file |
| AI-assisted review | — | Not available offline; the app says so. Nothing is generated or invented |
| Two-panel editor and live preview | ✅ | Content, Design, and Check & approve tabs. Page-by-page preview of the actual PDF (pdf.js), with Academic / ATS / Extracted text views and zoom |
| Quality control and approval | ✅ | Checklist separates complete, incomplete, missing and not applicable. Explicit approval freezes the version as a snapshot; later portfolio edits never change it |

### Verified (Phase 3)

- **Automated (`npm test`): 29 tests, all passing.** The 9 CV tests cover section assembly, sync offers and dismissals, overrides and ordering, settings validation, and DOCX structure (no tables or text boxes). They also cover ATS headings, PDF text extraction and analyzer results, and photo validation (type mismatch, garbage data, wrong format, over 100 MB). Finalization is tested too: the frozen snapshot, new versions, and licence-number visibility.
- **End to end in the real Electron app.** Steps covered:
  - Seed the portfolio, create a CV, and see a 2-page live preview.
  - Reword an entry, then check the ATS preview and the extracted text.
  - Switch templates; upload, crop and place a photograph.
  - Get a new portfolio record offered and add it.
  - Run the checks and approve.
  - Export all four formats with descriptive filenames, then create a new draft version.
- **Exported DOCX opened in LibreOffice:** the layout matches the PDF preview.
- **Packaged (asar) build:** generates and analyzes PDFs.
- **Finding fixed during testing:** Chromium writes small-caps text into PDFs as capitals, so the name is never set in small caps.

## Revisions after Phase 3 ✅

| Request | Status | Notes |
|---|---|---|
| Visual compatibility with SOUL ARCHIVE | ✅ | Palette taken from `soul_archive/ui/theme.py` (Evangelion theme): `#080808` backgrounds, NERV orange `#FF5A1F`, EVA purple `#9B6BD3`, text `#F2F2F2`. Solid orange panel title bars, filled active navigation and tabs, orange-edged sidebar, bold letter-spaced labels, accent-coloured figures. Secondary text raised from `#A7A3AD` to `#C2C2C2` and hint text from `#6F6C78` to `#8F8F8F` for legibility |
| Text wrapping in fields | ✅ | Single-line text fields grow and wrap long values (Enter still submits). Lists, tabs, sidebar and portfolio navigation wrap instead of truncating |
| Harvard conventions as the CV basis | ✅ | Harvard entry layout: organization **bold** with location right, then position/degree *italic* with dates right. Thesis and adviser under degrees. "Education" heading and Education-first order for academic types. Bold capital headings with a rule; centred name with a • contact line. New Fellowships and Grants and Languages sections. Quality checklist gains a **Harvard CV conventions** check: action-verb bullets, no first-person pronouns, Education first, locations, no photograph, 10–12 pt, 0.5–1 in margins |
| Export process review | ✅ | Every download now goes through a native Save dialog (starting in Documents\SYNCHRONIA) with Open and Show in folder afterwards. Cancelling says the export stays in the history. **Fixed:** the DOCX defined Title and Heading 1 twice (Word may use the library defaults); now each style is defined once. **Fixed:** manual entries in list sections (e.g. Languages) were not rendered. Verified `&`, `ñ` and curly quotes in DOCX and PDF |

## Phase 4 — Academic Workspace ✅

| Directive item (Section IV) | Status | Notes |
|---|---|---|
| A. Course inventory and per-course workspaces | ✅ | Courses with offerings (AY, term, section, schedule, students). Tabs: Classes, Syllabus, Outcomes, Lessons and materials, Assessments, Class records |
| Syllabus management (versions) | ✅ | Structured editor in the URS outcomes-based format: description, prerequisites, learner term, course outline (week / hours / ILOs / OBA / content / TLA / resources), grading policy with a running total, references, numbered policies, consultation hours, signatories. Word export on 8.5 × 13 landscape with the official letterhead |
| Syllabus import (.docx) | ✅ | Reads existing, loosely formatted Word syllabi (nested tables, tabs, line breaks) into a reviewable preview; commit creates or reuses the course, POs (grouped), CILOs, I/P/D map and a draft syllabus atomically, and fills empty institution fields |
| Institution profile and letterhead | ✅ | VMGO, college, default signatories; header/footer banners imported from the office's own Word template and placed on every exported document |
| Course learning outcomes and program alignment | ✅ | CILOs per course; POs shared per program and grouped (A/B/C); curriculum map I – Introductory / P – Practiced / D – Demonstrative (older E values migrated to P) |
| Lesson plans, materials, resources | ✅ | Linked to course, class offering, week and CLOs. Files attached through Evidence (Drive, link or file on this PC) |
| Assessments, Tables of Specifications, rubrics | ✅ | TOS builder allocates items by teaching hours and Bloom levels (largest remainder, so totals always match) with item placement. Rubric builder: levels × criteria, optional weights. Both export to Word |
| Class activity records | ✅ | Sessions with attendance; attendance rate per offering |
| Teaching accomplishment report | ✅ | Per term, Word: summary, teaching load, syllabi, materials, assessments. Only recorded figures |
| B. Research | ✅ | Pipeline by status with progress, sample collected / target, instrument validation, ethics review, linked publications and presentations |
| C. Extension and engagement | ✅ | Projects with partner, role, participants, training hours, objectives, narrative, outcomes, evidence. Narrative report export (Word) lists linked evidence and verification status |
| D. Faculty and professional development | ✅ | Development goals (area, status, progress, target date, linked training) plus this year's trainings, hours, CPD units, certifications and licences |
| Generated documents archive | ✅ | Every syllabus, TOS, rubric and report is kept and can be saved again |

### Verified (Phase 4)

- **Automated (`npm test`): 37 tests, all passing.** The 7 Phase 4 tests cover the apportionment method, TOS allocation and placement, alignment validation, syllabus cleaning and export, TOS and rubric round-trips and exports, attendance and the teaching report, and the research, extension and development summaries. A Harvard layout test checks special characters in both formats.
- **End to end in the real Electron app:**
  - Styling, and field wrapping (a long office name grows to 97 px tall).
  - Course and offering; CLO, PO and alignment.
  - Syllabus edited and exported through the Save dialog.
  - Assessment with TOS and rubric; class session at 95% attendance.
  - Teaching report; research pipeline card; extension narrative report; development goal.
  - A Harvard-layout CV exported as PDF through the Save dialog.
  - Re-running the Phase 3 CV walkthrough found no regressions.
- **Generated Word documents rendered in LibreOffice to check layout.** Table column widths are fixed so headers don't break mid-word.

### Release 0.5 — UI, Nexus command display, data safety, URS documents

| Item | Status | Notes |
|---|---|---|
| Saturated violet primary on the SOUL ARCHIVE palette | ✅ | Violet fills (`#8a3ffc`); small violet text uses `#b98aff` so it meets 4.5:1 |
| Full-width pages, wrapping fields, centred pop-ups, smooth scrolling | ✅ | Record forms and the context panel open as centred Evangelion-style modals |
| Central Nexus command display | ✅ | LCD clock (12-hour, AM/PM lamps), 30-day sync graph, MAGI status, deadline lamps, workload bars |
| Status bar | ✅ | Database integrity, last save, last backup, record count, live clock |
| Save-path quality control | ✅ | WAL + synchronous=FULL; autosave with dirty guards; backups at startup, every 6 h, on demand, before updates and restores (15 automatic kept); verified restore on next start |
| URS letterhead, syllabus format and importer | ✅ | See Academic Workspace rows above |

See `docs/QC_REPORT.md` for the quality-control results.

## Phase 5 — Intelligence ✅

| Requirement (directive §VII) | Status | Implementation |
|---|---|---|
| A. Academic analytics | ✅ | Courses managed, classes handled (students), syllabi, materials, teaching activities, assessments, TOS, rubrics, faculty development (hours, CPD) |
| B. Research analytics | ✅ | Initiated, ongoing, completed, published, manuscripts in progress, presentations, collaborations, research training |
| C. Extension analytics | ✅ | Extension projects, community activities, trainings conducted (participants, hours), resource-person engagements, distinct partners, completed programs |
| D. Portfolio analytics | ✅ | Qualifications, licences (valid/expired), trainings, awards, appointments, employment, institutional service, memberships, development goals, accomplishments |
| E. Administrative analytics | ✅ | Incoming/outgoing correspondence, meetings, reports prepared, secretariat responsibilities, completed administrative tasks |
| F. Report generation | ✅ | Annual academic accomplishment, faculty development, research productivity, extension accomplishment, professional development, portfolio summary, administrative accomplishment, custom period-based; CV stays in CV Studio |
| DOCX, PDF and spreadsheet output | ✅ | Word and PDF with the official letterhead (PDF footer banner on every page); XLSX with Summary, Records and Sources sheets, frozen headers, filters, real dates; analytics view exportable as XLSX |
| Date and category filtering | ✅ | Period presets (school year June–May, calendar year, last 12 months, all) or custom dates; sections A–E; support level (all / confirmed or evidenced / evidence only) |
| Source-record traceability | ✅ | Every indicator opens to its records (click through to the record); reports cite numbered sources [S#] with record type and ID |
| Never fabricate | ✅ | Only stored records are counted; undated records are reported as left out rather than guessed; an empty period says so |
| Distinguish user-entered from verified | ✅ | Each record is classed as evidence linked/verified, confirmed by you, self-reported, or prepared/logged in SYNCHRONIA; shown per indicator, per record and in reports |

### Verified (Phase 5)

- `npm test`: **55 tests, all passing** (8 new: catalog, period counting with undated handling, traceability and support filter, validation, Word, spreadsheet, PDF, empty-period and custom-section rules).
- In Electron: seeded a realistic school year, generated Word, PDF and spreadsheet reports through the Save dialog, rendered them in LibreOffice and checked the layout; UI sweep at 1500/1024/760 px with axe-core including the indicator pop-up.

## Upcoming phases

- [ ] **Phase 6 — Administrative Operations**: correspondence registry, routing, minutes, turnover documentation
- [ ] **Phase 7 — Integration and Continuity**: Google Drive OAuth, unified timeline, backup/restore, security testing
