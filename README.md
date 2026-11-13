# SYNCHRONIA

**The Academic Ascension System** · *Synchronize. Evolve. Transcend.*

An academic and professional advancement environment for managing teaching, research, extension, professional
portfolio, curriculum vitae and administrative work in one place. Built in phases per the SYNCHRONIA Master Product
Directive. **Phases 1–3 (Identity and Foundation, Professional Portfolio, Curriculum Vitae Studio) are complete.** SYNCHRONIA is a Windows
desktop application for a single owner.

## Installing on Windows

Run **`SYNCHRONIA-Setup-<version>.exe`**. It installs per user (no administrator rights needed) and adds Start-menu and
desktop shortcuts. SYNCHRONIA opens straight into your workspace; there is no sign-in.

Your data lives in `%APPDATA%\SYNCHRONIA\data` (Settings › Application › *Show in Explorer*). Back up that folder: it
holds `synchronia.db` and `secret.key`, the key that decrypts licence numbers. Uninstalling does not delete it.
Settings › Data & recovery also exports every record as JSON.

### How access is protected without a sign-in

The desktop app starts its data service on `127.0.0.1` (never the network) and creates a new random access key at
every launch. Only the app's own window receives that key, as an HttpOnly, SameSite=Strict cookie. Requests without it
are refused. Requests addressed to any host name other than localhost are refused, which blocks DNS-rebinding.
Writes also need a custom header, which blocks cross-site requests. Developer tools and the menu bar are disabled in
the installed app.

## Building

Requires **Node.js 22.13+**.

```bash
npm install
```

```bash
npm test
```

```bash
npm start
```

`npm start` builds the interface and opens the desktop app. To produce the Windows installer in `release/`:

```bash
npm run dist:win
```

On Linux, building the Windows installer additionally needs Wine with 32-bit support (`wine64` and `wine32:i386`).
For development with hot reload (API, Vite and Electron together):

```bash
npm run dev
```

## Architecture

```
desktop/                Electron shell: starts the data service, window, native file picker / open-file bridge
server/                 Node 22 + Express 5, node:sqlite (runs inside the desktop app)
  migrations/           Versioned SQL; 001_foundation.sql holds the full Section XI schema
  src/resources.js      Registry describing every record type (fields, validation, search, module)
  src/repo.js           Generic data layer: validation, ownership, soft delete, audit, search indexing
  src/nexus.js          Central Nexus aggregation, notifications, global search, quick capture
  src/auth.js           Single-owner access: per-launch key, loopback host guard, CSRF guard
  src/server.js         Starts the service (used by the desktop shell)
  src/cv/               CV Studio: sections, composition/versioning, HTML/PDF and DOCX renderers,
                        text extraction, ATS analyzer, photograph pipeline, routes
  src/app.js            HTTP API + static client
  test/                 API tests (node:test)
web/                    React 18 + TypeScript + Vite
  src/styles/           Design tokens and application styles
  src/components/       Shell (sidebar, top bar, context panel), Quick Capture, search palette, record drawer
  src/pages/            Central Nexus, module pages, professional profile, settings, sign-in
```

**Data principles built into the foundation**

- *One source of truth.* CV entries reference portfolio rows (`source_type`, `source_id`) rather than copying them.
- *Nothing is presented as verified without proof.* Every portfolio-type record carries
  `verification` (`self_reported` → `user_confirmed` → `evidence_verified`). The server refuses `evidence_verified`
  unless supporting evidence is actually linked.
- *Event date ≠ record date.* Event dates (`start_date`, `event_date`, …) are separate from `created_at`, so
  retrospective entries keep the right history.
- *Recoverable.* Deletes go to a recycle bin. Every change is written to `audit_logs` with before/after values,
  which serves as version history.
- *Duplicate prevention.* Partial unique indexes on education, licences, trainings, courses and DOIs.
- *Sensitive fields encrypted.* Licence registration numbers are stored AES-256-GCM encrypted and shown masked.
- *Google Drive is the document repository.* `external_file_references` + `evidence_links` store references, not files.

## API overview

All endpoints are under `/api`, require the launch access key, and require the header `X-Synchronia: 1` on writes.

| Endpoint | Purpose |
|---|---|
| `GET /nexus` | All Central Nexus widget data, computed from stored records |
| `GET /search?q=` | Full-text search across every record type (SQLite FTS5) |
| `POST /capture` | Quick Capture: task, activity, idea, research note, accomplishment |
| `GET /notifications` | Overdue / due-soon tasks and correspondence follow-ups |
| `GET/PUT /profile` | Professional profile |
| `GET/PUT /preferences` | Academic mode, widget layout, panels |
| `GET/POST /records/:type` | List / create any registered record type |
| `GET/PATCH/DELETE /records/:type/:id` | Read / update / move to recycle bin |
| `POST /records/:type/:id/restore` | Restore from recycle bin |
| `GET /records/:type/:id/history` | Version history |
| `GET /schema` | Field definitions (and recommended fields) for every record type |
| `GET /portfolio/summary` | Per-category counts, evidence, confirmation, completeness, attention list |
| `GET/POST /records/:type/:id/evidence` | List / link evidence (Google Drive link, web link, file on this PC, or an existing reference) |
| `DELETE /records/:type/:id/evidence/:linkId` | Unlink evidence; with none left, "evidence verified" falls back to self-reported |
| `GET /records/:type/:id/secret/:field` | Reveal an encrypted field (audited) |
| `GET/POST /cv`, `GET/PATCH/DELETE /cv/:id` | CV profiles |
| `/cv/:id/sections…`, `/cv/:id/entries/:eid`, `POST /cv/:id/sync` | Sections, entries, portfolio synchronisation |
| `GET /cv/:id/preview.pdf?mode=visual\|ats`, `GET /cv/:id/analysis` | Live PDF; ATS report, quality checklist and extracted text |
| `POST /cv/:id/finalize`, `POST /cv/:id/versions` | Approve and freeze; new draft version |
| `POST /cv/:id/exports`, `GET /cv/exports/:id/download` | DOCX / PDF / ATS exports and history |
| `GET/POST /images`, `PUT /images/:id/optimized`, `GET /images/:id/file` | Photograph library (raw uploads ≤ 100 MB) |
| `GET /recycle-bin`, `GET /audit`, `GET /export` | Recovery, audit trail, full JSON export |

See [`docs/DEVELOPMENT_CHECKLIST.md`](docs/DEVELOPMENT_CHECKLIST.md) for phase status and verified workflows.
