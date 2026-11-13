# SYNCHRONIA

**The Academic Ascension System** · *Synchronize. Evolve. Transcend.*

An academic and professional advancement environment for managing teaching, research, extension, professional
portfolio, curriculum vitae and administrative work in one place. Built in phases per the SYNCHRONIA Master Product
Directive. **Phase 1 (Identity and Foundation) is complete.**

## Running it

Requires **Node.js 22.13+**. The database is SQLite built into Node, so there is nothing else to install.

```bash
npm install
```

```bash
npm run build && npm start
```

Open <http://127.0.0.1:4317>. On first run you create the owner account.

For development with hot reload, run the API on :4317 and the Vite client on :5173 (it proxies `/api`):

```bash
npm run dev
```

```bash
npm test
```

### Configuration (environment variables)

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `4317` | HTTP port |
| `HOST` | `127.0.0.1` | Bind address (local only by default) |
| `SYNCHRONIA_DATA_DIR` | `./data` | Database and encryption key location |
| `SYNCHRONIA_DB` | `<data>/synchronia.db` | Database file |
| `SYNCHRONIA_SECRET_KEY` | generated into `<data>/secret.key` | 64-hex-char AES-256 key for sensitive fields |

**Back up `data/` (both `synchronia.db` and `secret.key`).** Without the key, encrypted licence numbers cannot be read.
Settings › Data & recovery also exports every record as JSON.

## Architecture

```
server/                 Node 22 + Express 5, node:sqlite
  migrations/           Versioned SQL; 001_foundation.sql holds the full Section XI schema
  src/resources.js      Registry describing every record type (fields, validation, search, module)
  src/repo.js           Generic data layer: validation, ownership, soft delete, audit, search indexing
  src/nexus.js          Central Nexus aggregation, notifications, global search, quick capture
  src/auth.js           Owner setup, sessions (scrypt + HttpOnly SameSite=Strict cookies), CSRF guard
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

All endpoints are under `/api`, require a session, and require the header `X-Synchronia: 1` on writes.

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
| `GET /schema` | Field definitions for every record type |
| `GET /recycle-bin`, `GET /audit`, `GET /export` | Recovery, audit trail, full JSON export |

See [`docs/DEVELOPMENT_CHECKLIST.md`](docs/DEVELOPMENT_CHECKLIST.md) for phase status and verified workflows.
