# Pre-development audit — Research Development Workspace and system-wide refinement (1.2)

Audit of SYNCHRONIA 1.1 against the *Research Development and Productivity Workspace* and *System-wide UI/UX
Refinement* directives. Each capability is classed as **reuse** (exists, used as is), **improve** (exists, extended)
or **build** (genuinely missing). One authoritative research project record is kept; everything else links to it.

## Research

| Directive need | Exists in 1.1 | Decision |
|---|---|---|
| Research project record | `research_projects` (title, role, status, dates, questions, objectives, methodology, instruments text, ethics fields, collaborators/funding text, progress %) as a tab of the Academic Workspace | **Improve**: stays the one authoritative record. Adds a customizable *stage* (11 default stages; the old fixed `status` is derived from it so analytics and CV keep working) and idea fields (problem, area, tags, variables, population, theory, significance). The arbitrary progress % is replaced in the interface by milestone-based progress. Moves to a dedicated **Research Development** workspace; the Academic tab is removed |
| Quick idea capture | Quick Capture "Idea" (stored as an activity) | **Reuse + improve**: Quick Capture can save straight into Research; captured research ideas can be developed into projects in one click |
| Tasks and auto tasks | `tasks` with `linked_entity_type/id` | **Reuse**: suggested tasks (approve / edit / dismiss) are ordinary tasks linked to the project |
| Calendar | `/calendar` (events from tasks, meetings, trainings…) | **Reuse**: milestones, ethics expiries and submission deadlines are added as event sources. No second calendar |
| Proposal / concept paper / methodology / manuscript writing | none (only long text fields) | **Build**: one *research document* model with sections (used for proposals, concept papers and manuscripts), autosave, per-section status, notes, word counts; version history comes from the existing audit history |
| Literature | Knowledge library holds file references, not bibliographic records | **Build** literature records (bibliographic + review fields), linked to projects; **reuse** the library / Google Drive / evidence links for the documents themselves; matrix and citation export |
| Instruments | text field on the project | **Build** instrument laboratory: instrument, versions (dimensions, items, scale, scoring), expert reviews; Initial → Expert review → Revision → Final; no statistics |
| Ethics | `ethics_status`, `ethics_reference` on the project | **Improve**: ethics review records (submission, approval, conditions, expiry), with calendar reminders |
| Publications and presentations | `publications`, `conference_presentations` (portfolio + CV) | **Reuse**: they stay the record of what was published or presented. **Build** a *submission tracker* (planned → submitted → under review → revision → accepted → published, or rejected / withdrawn); "Record in portfolio" fills the existing publication or presentation from the submission, so nothing is typed twice |
| Funding, collaborators | free-text fields on the project | **Improve**: small funding and collaborator lists on the project (the old text is shown and kept) |
| Document production | DOCX/PDF engine with export verification | **Reuse**: proposals, manuscripts, literature matrices, instruments, validation and ethics records, progress reports export through it, APA style |
| Reports and analytics | Intelligence section B (research) | **Reuse**: reads the same records |
| Attachments | evidence links to Drive, web links, local files | **Reuse** on every new research record |

## System-wide refinement

| Directive need | Exists in 1.1 | Decision |
|---|---|---|
| Soul Archive-style left navigation | Numbered flat sidebar, collapsible, preference saved | **Improve**: grouped sections, collapse control at the top, sidebar search, tooltips when collapsed, version line; links only to modules that exist |
| Central Nexus purple gradient identity | Orange/amber command deck (1.1) | **Improve**: purple gradient identity, orange/red only as restrained accents |
| Administrative Operations consistency | Same shell and components | **Improve**: same panels and colours as the Nexus |
| Shift key closing pop-ups | Root cause found: the overlay re-initialised on every keystroke and moved focus to its Close button | **Fixed** in the shared overlay; keyboard regression test added |
| Animation reduction | Several continuous animations | **Improve**: 100–180 ms transitions, continuous motion removed, setting to turn off non-essential motion, OS reduced-motion respected |
| Default signatories and VMGO in Settings | Institution profile in Settings feeds syllabi and report "Noted by" | **Improve**: removed from Settings; supplied with the syllabus or report itself; existing values moved into existing syllabi so nothing is lost |
| Long-term retention, scale | SQLite with indexes, FTS search, paged lists, version history, backups, archive export | **Reuse + verify** with a large data set; **build** archiving of inactive research records (archive ≠ delete) |
| Cloud sync, Data Synchronization menu | none | **Not built** (owner's decision: desktop only); no menu link to it |
| AI context management | no AI features | **Not applicable** |
| Academic quality assurance, accomplishment monitoring, performance overview menu items | no such modules | **Not linked** (the directive forbids links to unbuilt features) |
