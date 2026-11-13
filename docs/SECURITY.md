# SYNCHRONIA security

SYNCHRONIA is a single-owner Windows desktop application. Its data service runs inside the app on the loopback
interface; nothing listens on the network. This document lists the threats considered, the controls in place and how
each is tested.

## Threat model

| Threat | Control | Tested by |
|---|---|---|
| Another program or web page on the same computer calls the data service | A new random 256-bit access key is created at every launch and given only to the app window, as an `HttpOnly; SameSite=Strict` cookie. Every API route except four public ones refuses requests without it (constant-time comparison). | `security.test.js` enumerates **every route in the source** and calls each without a key and with a wrong key; a new router fails the test until it is covered. |
| DNS rebinding (a web page reaching `127.0.0.1` under its own host name) | Requests addressed to any host other than `127.0.0.1`, `localhost` or `[::1]` are refused (421). | `security.test.js` |
| Cross-site request forgery | `SameSite=Strict` cookie, plus a custom `X-Synchronia: 1` header required on every state-changing request. | `security.test.js` |
| Open redirect through the entry point | `/api/open?next=` accepts only same-app paths. | `security.test.js` (`//host`, `/\host`, encoded forms) |
| SQL injection | All values are bound parameters; sort columns and record types come from allow-lists; full-text queries are rebuilt from word tokens. | `security.test.js` (sort, order, filter values, FTS syntax, unknown and protected fields) |
| Path traversal in downloads | Reports are found by numeric ID in the database; backups by a strict file-name pattern inside the backup folder; letterhead parts by an allow-list. | `security.test.js`, `continuity.test.js` |
| Malicious uploads | Images are identified by their bytes (magic numbers), decoded and re-encoded; Word files must be valid ZIP/OOXML; backups must carry the SQLite header and pass an integrity check; size limits on every upload; rejected uploads close the connection. | `cv.test.js`, `importer.test.js`, `continuity.test.js`, `security.test.js` |
| Script injection (XSS) | React escapes all text; the Content Security Policy allows scripts only from the app itself (no inline scripts, no `eval`, no remote content); generated PDF HTML escapes every value; Word output is escaped XML. | `security.test.js`; runtime check in Electron (inline handlers and remote images blocked, CSP violations reported) |
| Exposure of protected fields | Licence numbers and similar fields are encrypted with AES-256-GCM; the key is in `secret.key` (owner-only permissions) and never exported; values are masked in responses and revealing one is audited. | `security.test.js` (database file scanned for the plain value) |
| Google account access | Optional; uses the owner's own OAuth client, PKCE (S256), a single-use 256-bit `state` with a 10-minute lifetime and a loopback redirect. Read-only **metadata** scope (`drive.metadata.readonly`): SYNCHRONIA cannot read file contents, upload, change or delete anything in Drive. Tokens and the client secret are encrypted at rest and never returned to the interface; disconnecting revokes the token at Google and deletes it locally. | `continuity.test.js` against a local stand-in for Google (forged and replayed `state`, PKCE verification, token refresh, revoked grant, revocation) |
| Error details leaking internals | Unexpected errors return a generic message; body-parser errors (too large, malformed) return 413/400 with plain text. | `security.test.js` |
| The desktop shell as an attack surface | Renderer runs with `contextIsolation`, `sandbox`, no Node integration and `webSecurity`; the preload exposes a fixed list of functions; new windows are denied and external links go to the system browser; navigation away from the app is blocked; camera/microphone and other permission requests are denied; developer tools and menus are disabled in the installed app. | Runtime checks in Electron (see QC report) |
| Launching programs from stored file references | "Open" on a local file reference refuses programs and scripts (`.exe`, `.bat`, `.cmd`, `.ps1`, `.lnk`, `.msi`, `.js`, `.vbs`, …) and network paths (which can leak Windows credentials to the remote host); the file must exist and be a regular file or folder. | Runtime check in Electron |
| Data loss | WAL with `synchronous=FULL`; autosave and unsaved-change guards; verified snapshots at startup, every six hours, before updates and before restores; restores are verified and applied at the next start; backups from newer versions are refused. | `backup.test.js`, `continuity.test.js` |

## Dependencies

`npm audit --omit=dev` (everything bundled into the application): **0 known vulnerabilities**.

- Electron was upgraded from 38 (no longer supported, with open advisories) to **45.1.0**.
- react-router-dom was upgraded to **6.30.6**.
- `uuid` (used by the spreadsheet library) is pinned to **11.1.1** through `overrides`.

Remaining advisories in the full tree affect only build and development tools, which are not part of the installed
application:

- The Vite and esbuild development server (`npm run dev`, bound to localhost).
- minimatch inside electron-builder.

react-router reports a moderate advisory that is only fixed in version 7: an open redirect when an *untrusted* path
string is passed to `<Link>` or `navigate()`. SYNCHRONIA never navigates to user-supplied paths. Every navigation
target is a fixed route or is built from a record type and numeric ID. The access-entry redirect is validated on the
server, as tested above.

## Reporting

This is a personal application. Back up the data folder (`%APPDATA%\SYNCHRONIA\data`); keep `secret.key` with it,
because the backups' protected fields cannot be read without it.
