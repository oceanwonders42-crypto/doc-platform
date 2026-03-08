# Firm Integration System — Implementation Report

## Overview

A simple onboarding and integration system allows law firms to connect via **email intake** or **case management API**. All processing is server-side; credentials are encrypted; existing document processing logic was not modified.

---

## 1. Files Created

### API

| Path | Purpose |
|------|--------|
| `apps/api/src/services/credentialEncryption.ts` | AES-256-GCM encrypt/decrypt for stored secrets (uses `ENCRYPTION_KEY`) |
| `apps/api/src/services/ingestFromBuffer.ts` | Internal document ingestion from buffer (create Document, putObject, enqueueDocumentJob) |
| `apps/api/src/services/emailIngestion.ts` | Poll mailboxes, fetch attachments, send PDFs to ingest pipeline, log to IntegrationSyncLog |
| `apps/api/src/http/routes/integrations.ts` | All integration HTTP routes (connect-email, connect-api, status, test, sync-log, health, disconnect) |
| `apps/api/src/workers/integrationSyncWorker.ts` | Background worker: poll active mailboxes every N minutes (default 5), run email ingestion |

### Prisma

| Path | Purpose |
|------|--------|
| `apps/api/prisma/migrations/20260306000001_firm_integration_models/migration.sql` | Migration adding integration enums and tables |

### Web

| Path | Purpose |
|------|--------|
| `apps/web/app/onboarding/integration/page.tsx` | Onboarding wizard (choose type → connect → preferences → test) |
| `apps/web/app/settings/integrations/page.tsx` | Settings: list integrations, health, last sync, reconnect/disconnect, sync log |

### Modified

| Path | Change |
|------|--------|
| `apps/api/prisma/schema.prisma` | New enums and models (see below); `Firm` relation arrays |
| `apps/api/src/http/server.ts` | Mount `integrationsRouter` at `/integrations` |

---

## 2. Prisma Models Added

- **Enums:** `IntegrationType` (EMAIL, CASE_API), `IntegrationProvider` (GMAIL, OUTLOOK, CLIO, FILEVINE, GENERIC), `IntegrationStatus` (CONNECTED, ERROR, DISCONNECTED), `MailboxProvider` (GMAIL, OUTLOOK, IMAP).
- **FirmIntegration:** id, firmId, type, provider, status, createdAt, updatedAt.
- **IntegrationCredential:** id, integrationId, encryptedSecret, refreshToken?, expiresAt?, createdAt, updatedAt.
- **MailboxConnection:** id, firmId, emailAddress, provider, lastSyncAt, lastUid?, active, integrationId?, createdAt, updatedAt.
- **IntegrationSyncLog:** id, firmId, integrationId, eventType, status, message?, createdAt.
- **FieldMapping:** id, firmId, integrationId, sourceField, targetField, createdAt.

Run migration when DB is available: `pnpm exec prisma migrate deploy` (or `migrate dev`) from `apps/api`. Ensure `ENCRYPTION_KEY` is set for credential encryption.

---

## 3. API Routes Created

All under `/integrations`, auth required; `firmId` from token. Secrets are never returned.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/integrations/connect-email` | FIRM_ADMIN | Create mailbox + optional FirmIntegration + encrypted credentials; test IMAP when provider is IMAP. |
| POST | `/integrations/connect-api` | FIRM_ADMIN | Store encrypted API key for CLIO/FILEVINE/GENERIC. |
| GET | `/integrations/status` | STAFF | List integrations and mailboxes for the firm. |
| POST | `/integrations/test` | FIRM_ADMIN | Run connection test for a given integration/mailbox. |
| GET | `/integrations/sync-log` | STAFF | Last sync attempts (paginated by limit). |
| POST | `/integrations/:id/disconnect` | FIRM_ADMIN | Set integration DISCONNECTED and mailboxes inactive. |
| GET | `/integrations/health` | STAFF | Dashboard: active count, last sync, error count (24h), connection list. |

---

## 4. Services Created

- **credentialEncryption:** `encryptSecret(plain)`, `decryptSecret(encrypted)` — env `ENCRYPTION_KEY` (32+ chars, hex or base64).
- **ingestFromBuffer:** `ingestDocumentFromBuffer({ firmId, buffer, originalName, mimeType, source, externalId? })` — creates Document, uploads to storage, enqueues document job; used by email ingestion only (existing POST `/ingest` unchanged).
- **emailIngestion:** `pollMailbox(mailbox, integration)` — one mailbox: fetch new messages via IMAP, ingest PDF attachments via `ingestDocumentFromBuffer`, update lastSyncAt/lastUid, write IntegrationSyncLog; `pollAllActiveMailboxes(firmId?)` — all active mailboxes (optionally for one firm).

---

## 5. Frontend Pages Created

- **Onboarding wizard** (`/onboarding/integration`):  
  Step 1 — Choose: Email / Case API / Both.  
  Step 2 — Connect: Email (Gmail/Outlook/IMAP with credentials) or API (Clio/Filevine/Generic + API key).  
  Step 3 — Workflow: default review queue, auto-sync, unmatched document handling.  
  Step 4 — Test integration and link to settings.  
  Uses `window.__API_BASE` and `window.__API_KEY` for API base URL and Bearer token (set by host app or env).

- **Settings** (`/settings/integrations`):  
  Connection health summary, list of integrations and mailboxes, last sync, “Test” per integration, disconnect, sync log. Same auth pattern as onboarding.

---

## 6. Integration Flow

1. **Email**
   - User goes to onboarding → chooses Email → enters provider (Gmail/Outlook/IMAP), email, password (and IMAP host/port if IMAP).
   - Backend creates FirmIntegration (EMAIL), IntegrationCredential (encrypted IMAP config), MailboxConnection (emailAddress, provider, active, integrationId). For IMAP, runs `testImapConnection`; on failure sets status ERROR and returns error.
   - Integration sync worker (or cron) runs periodically: `pollAllActiveMailboxes()` → for each mailbox loads credentials, `pollImapSinceUid`, for each PDF attachment calls `ingestDocumentFromBuffer` (source `"email"`), logs to IntegrationSyncLog, updates lastSyncAt/lastUid.

2. **Case API**
   - User chooses Case API → provider + API key. Backend creates FirmIntegration (CASE_API) and IntegrationCredential (encrypted JSON with apiKey). No external API test in this implementation; “Test” checks presence of credentials.

3. **Document pipeline**
   - Email attachments (PDF only) are sent through the existing pipeline via `ingestDocumentFromBuffer` (create Document → putObject → enqueueDocumentJob). No changes to existing document processing or review queue logic.

4. **Security**
   - Credentials encrypted before storage; decryption only in server code.
   - Integration routes require auth; responses never include raw secrets.
   - All queries scoped by `firmId` from the authenticated context.

---

## 7. Testing Flow (Part 9)

1. **Connect mailbox:** Use onboarding → Email → IMAP (or Gmail/Outlook) with valid credentials; complete through Step 2.
2. **Send test email:** From another account, send an email to the connected mailbox with a PDF attachment.
3. **Confirm ingestion:** Run the integration sync worker (e.g. `npx ts-node src/workers/integrationSyncWorker.ts`) or wait for the next poll interval; check IntegrationSyncLog for `attachment_ingested` success and the new Document in the DB.
4. **Confirm review queue:** The document is enqueued via `enqueueDocumentJob` and will appear in the review queue after the existing document pipeline (OCR → classification → etc.) runs.

Optional: use POST `/integrations/test` with the integration id to verify mailbox connectivity before or after sending the test email.

---

## 8. Environment / Run

- **API:** Set `ENCRYPTION_KEY` (e.g. 64-char hex or 44-char base64). Run migration. Start API server; mount integrations router (already done in server.ts).
- **Worker:** Run `npx ts-node src/workers/integrationSyncWorker.ts` (or equivalent); optional `INTEGRATION_SYNC_INTERVAL_MS` (default 5 min).
- **Web:** Set `window.__API_BASE` and `window.__API_KEY` (or wire your auth) so onboarding and settings pages can call the API.

No changes were made to core document processing logic; only new integration models, routes, services, worker, and frontend were added.
