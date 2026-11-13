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

**Not verified here:** the Windows installer was built on Linux (with Wine) and its contents inspected, but it has not
been run on a Windows machine.

## Upcoming phases

- [ ] **Phase 3 — Curriculum Vitae Studio**: profiles, templates, 100 MB photo upload with backend validation, portfolio sync, DOCX/PDF export, ATS analyzer
- [ ] **Phase 4 — Academic Workspace**: course workspaces, syllabi, outcomes alignment, TOS, rubrics, research, extension
- [ ] **Phase 5 — Intelligence**: analytics and evidence-traceable reports (DOCX/PDF/XLSX)
- [ ] **Phase 6 — Administrative Operations**: correspondence registry, routing, minutes, turnover documentation
- [ ] **Phase 7 — Integration and Continuity**: Google Drive OAuth, unified timeline, backup/restore, security testing
