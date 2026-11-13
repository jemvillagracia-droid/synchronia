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
| Secure authentication | ✅ | One-time owner setup, scrypt hashes, HttpOnly SameSite=Strict sessions, CSRF header, sign-in throttling |
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

## Upcoming phases

- [ ] **Phase 2 — Professional Portfolio**: full editors per category, evidence linking UI, completeness indicators per record
- [ ] **Phase 3 — Curriculum Vitae Studio**: profiles, templates, 100 MB photo upload with backend validation, portfolio sync, DOCX/PDF export, ATS analyzer
- [ ] **Phase 4 — Academic Workspace**: course workspaces, syllabi, outcomes alignment, TOS, rubrics, research, extension
- [ ] **Phase 5 — Intelligence**: analytics and evidence-traceable reports (DOCX/PDF/XLSX)
- [ ] **Phase 6 — Administrative Operations**: correspondence registry, routing, minutes, turnover documentation
- [ ] **Phase 7 — Integration and Continuity**: Google Drive OAuth, unified timeline, backup/restore, security testing
