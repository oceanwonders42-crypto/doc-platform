# Doc-Platform — Full Technical Audit Report (Reference-Specific)

**Date:** March 7, 2025  
**Scope:** Repository structure, backend API, document pipeline, database, workers, frontend, integrations, error handling, security, and MVP completion status.  
**Note:** Analysis only; no code modifications.

---

## 1. Project Overview

**Doc-Platform** is a multi-tenant document management and legal-case platform. Core flow: **upload → ingest → OCR → classification → extraction → case matching → routing → timeline → AI tools (narratives, records requests)**.

- **Stack:** Node.js (Express API in `apps/api`), Next.js (App Router in `apps/web`), Prisma + PostgreSQL, Redis (job queue), MinIO-compatible object storage.
- **Auth:** Bearer API keys (per-firm) resolved in `apps/api/src/http/middleware/auth.ts`; optional `PLATFORM_ADMIN_API_KEY`; session-based user auth is stubbed (comment at `auth.ts` line 57: "TODO: session user").
- **Config:** Root `package.json` (pnpm scripts: test, smoke, audit, cleanup:run, etc.); `apps/api/package.json` and `apps/web/package.json`; env via `.env` / `.env.local` (DATABASE_URL, REDIS_URL, DOC_API_KEY, etc.).

---

## 2. Architecture

### 2.1 Repository Structure — Exact Paths and Purpose

| Path | Purpose |
|------|--------|
| **apps/api** | Backend: Express server, workers, AI, services, integrations, Prisma. |
| **apps/api/src/http/server.ts** | Single Express app; majority of routes defined inline (lines ~124–10277); mounts routers at lines 189–191. |
| **apps/api/src/http/routes/cases.ts** | Router for GET `/` (list cases); mounted at `/cases` in server.ts:189. |
| **apps/api/src/http/routes/recordsRequests.ts** | Router for records-requests (dashboard, templates, CRUD, send, etc.); mounted at `/records-requests` in server.ts:191. |
| **apps/api/src/http/routes/integrations.ts** | Router for POST `/connect-email`, `/connect-api`, GET `/status`, `/health`, `/sync-log`, POST `/test`, `/:id/disconnect`; mounted at `/integrations` in server.ts:190. |
| **apps/api/src/http/middleware/auth.ts** | Main auth: Bearer token → ApiKey lookup, bcrypt compare, sets `req.firmId`, `req.authRole`, `req.authScopes`; rate limit per key. |
| **apps/api/src/workers/worker.ts** | Single background process: `popJob()` from Redis, handles `ocr`, `classification`, `extraction`, `case_match`, `timeline_rebuild`. |
| **apps/api/src/ai/docRecognition.ts** | `extractTextFromPdf`, `extractTextFromPdfPerPage`, `classifyAndExtract` (regex-based doc type, case number, client name, incident date). |
| **apps/api/src/ai/docClassifier.ts** | `classify(text, filename)` → docType (court, insurance, medical, other), confidence. |
| **apps/api/src/ai/extractors/** | Insurance and court extractors; `runExtractors` used in worker. |
| **apps/api/src/ai/narrativeAssistant.ts** | `generateNarrative` (OpenAI); used by POST `/cases/:id/narrative`. |
| **apps/api/src/services/queue.ts** | Redis queue `doc_jobs`; `enqueueDocumentJob` → `enqueueOcrJob`; `popJob`, `enqueueClassificationJob`, `enqueueExtractionJob`, `enqueueCaseMatchJob`, `enqueueTimelineRebuildJob`. |
| **apps/api/src/services/storage** | getObjectBuffer, putObject (MinIO-compatible). |
| **apps/api/src/services/caseMatching.ts** | `matchDocumentToCase(firmId, { caseNumber, clientName }, ...)`. |
| **apps/api/src/services/documentRouting.ts** | `routeDocument` (audit, Document update, optional CRM). |
| **apps/api/src/services/caseTimeline.ts** | `rebuildCaseTimeline(caseId, firmId)`. |
| **apps/api/src/services/errorLog.ts** | `logSystemError(service, messageOrErr, stack?, meta?)` → `SystemErrorLog` table. |
| **apps/api/src/integrations/crm/pushService.ts** | `pushCaseIntelligenceToCrm`, `pushCrmWebhook`; gated by `hasFeature(firmId, "crm_push")`. |
| **apps/api/src/integrations/crm/webhookAdapter.ts** | Generic webhook: POST to `firm.settings.crmWebhookUrl` or `FIRM_CRM_WEBHOOK_URL`. |
| **apps/api/src/email/emailIngestRunner.ts** | `runEmailPollOnce`; reads `mailbox_connections` (raw SQL), polls IMAP, extracts attachments, calls `ingestFromBuffer`. |
| **apps/api/src/email/imapPoller.ts** | `pollImapSinceUid`, low-level IMAP. |
| **apps/api/src/db/prisma.ts** | Prisma client. |
| **apps/api/src/db/pg.ts** | Raw PostgreSQL pool for `document_recognition`, etc. |
| **apps/api/prisma/schema.prisma** | All Prisma models (Firm, User, Document, LegalCase, etc.); no `document_recognition` model. |
| **apps/api/create_recognition_table.js** | Standalone script: `CREATE TABLE IF NOT EXISTS document_recognition (...)` — base columns only; run manually for new envs. |
| **apps/web/app/** | Next.js App Router pages (dashboard, admin, settings, onboarding, support, debug). |
| **apps/web/app/api/** | Next.js API routes (proxies to backend). |
| **apps/web/lib/api.ts** | `getApiBase()`, `getAuthHeader()`, `parseJsonResponse()` used by dashboard pages. |
| **scripts/** | snapshot.sh, smoke_test.sh, full_audit.sh, full_audit.js, git-auto-sync.sh. |

### 2.2 Layer Summary

- **Frontend:** `apps/web` (Next.js); pages under `app/dashboard`, `app/admin`, `app/settings`, `app/onboarding`, `app/support`, `app/debug`.
- **Backend:** `apps/api/src/http/server.ts` + `apps/api/src/http/routes/*.ts`.
- **Workers:** `apps/api/src/workers/worker.ts` (Redis consumer; separate process).
- **Database:** PostgreSQL via Prisma (`apps/api/prisma/schema.prisma`) + raw pool for `document_recognition`, `mailbox_connections`, `email_messages`, `email_attachments`.
- **Configuration:** Root and app-level `package.json`; `.env`; middleware and env reads in server and worker.

---

## 3. Backend Audit

### 3.1 Route Registration

- **Main app:** `apps/api/src/http/server.ts`. Routers mounted: `app.use("/cases", casesRouter)` (L189), `app.use("/integrations", integrationsRouter)` (L190), `app.use("/records-requests", recordsRequestsRouter)` (L191).
- **Inline routes:** All other endpoints are `app.get/post/patch/delete(...)` in server.ts. Order of registration: health → admin → firms → webhooks → jobs → errors → system → incidents → security → quality → cron → demo → dev → ingest → me/* → dashboard → documents → cases → providers → document-tags → documents/:id/* → cases/:id/* → records-requests (inline duplicates) → mailboxes → metrics → documents/:id (get, recognition) → ... (see below for full list with line numbers).

### 3.2 All API Routes — File and Line References

**Health & readiness** (server.ts)  
- GET `/health` — L124 — returns `{ ok: true }`.  
- GET `/healthz` — L126 — returns `{ ok: true, service: "api" }`.  
- GET `/readyz` — L128 — async; checks DB and optional Redis.

**Dev / admin dev** (server.ts)  
- POST `/dev/create-firm` — L2591 — no auth; creates firm.  
- POST `/admin/dev/create-api-key` — L2601 — no auth; creates API key.  
- POST `/dev/create-api-key/:firmId` — L2626 — no auth; creates API key for firm.

**Ingest** (server.ts)  
- POST `/ingest` — L2650 — `authWithScope("ingest")`, `rateLimitEndpoint(60, "ingest")`, `upload.single("file")`. Validates file via `validateUploadFile` (L2657); checks billing and page limit; duplicate check when `duplicates_detection` feature on (L2704–2774); stores via `putObject`; creates `Document`; calls `enqueueDocumentJob` (L2802). Returns `{ ok, documentId, spacesKey }` or `{ ok, duplicate: true, existingId, ... }`. **Implemented.** Missing: no idempotency key; body validation beyond file and two optional fields.

**Cases router** (`apps/api/src/http/routes/cases.ts`)  
- GET `/` (i.e. GET `/cases`) — L9 — auth, requireRole(STAFF); returns `prisma.legalCase.findMany({ where: { firmId } })` as `{ ok: true, items }`. **Implemented.** No pagination; no query validation.

**Records-requests router** (`apps/api/src/http/routes/recordsRequests.ts`)  
- GET `/dashboard` — L33 — counts by status.  
- GET `/templates` — L75 — list templates.  
- POST `/templates` — L92 — create template; validates `name` required (L99).  
- PATCH `/templates/:id` — L119 — update template.  
- POST `/` — L148 — create draft; uses `createRecordsRequestDraft`.  
- GET `/` — L185 — list with filters (caseId, providerId, status, requestType).  
- GET `/:id` — L216 — get one with relations.  
- POST `/:id/send` — L232 — validate, generate letter, deliver.  
- Additional routes in same file: letter, generate-pdf, attempts, follow-up, etc.  
**Implemented** with tenant checks (`requireFirmIdFromRequest`, `buildFirmWhere`). Some body validation (e.g. name required); not all fields validated with schema.

**Integrations router** (`apps/api/src/http/routes/integrations.ts`)  
- POST `/connect-email` — L23 — create mailbox + encrypted credentials; validates `emailAddress`, `provider` (L41).  
- POST `/connect-api` — L180 — case API onboarding.  
- GET `/status` — L242.  
- POST `/test` — L288.  
- GET `/sync-log` — L369.  
- POST `/:id/disconnect` — L398.  
- GET `/health` — L416.  
**Implemented.** Email connect uses `encryptSecret`; depends on ENCRYPTION_KEY.

**Inline in server.ts (selected; all auth + requireRole unless noted)**  
- GET `/admin/firms` — L194 — PLATFORM_ADMIN; list firms.  
- GET `/admin/providers` — L252 — auth only.  
- GET `/admin/cases` — L299 — STAFF; placeholder (returns empty or redirect).  
- GET `/admin/firms/:firmId` — L307.  
- PATCH `/admin/firms/:firmId` — L390.  
- POST `/firms` — L418.  
- POST `/firms/:id/users` — L438.  
- POST `/firms/:id/api-keys` — L463.  
- GET `/exports/clio/contacts.csv` — L495 — requireExportFirm.  
- GET `/exports/clio/matters.csv` — L507.  
- GET `/crm/clio/mappings` — L520.  
- GET/POST/PATCH/DELETE `/webhooks` — L581–730 (STAFF and FIRM_ADMIN variants).  
- GET/POST `/admin/jobs`, `/admin/jobs/:id/retry|cancel` — L760–797.  
- POST/GET `/jobs`, `/jobs/counts`, `/jobs/:id`, retry, cancel — L809–924.  
- GET `/admin/errors` — L943.  
- GET/PATCH `/admin/errors/:id` — L975, L996.  
- GET `/admin/system/health` — L1023.  
- POST `/admin/system/backup` — L1033.  
- GET `/admin/system/backups` — L1046.  
- POST/GET/PATCH `/admin/incidents` — L1105–1171.  
- GET `/admin/security/activity` — L1171.  
- GET `/admin/support/bug-reports` — L1177.  
- GET `/admin/quality` — L1199.  
- GET `/settings/routing-learning` — L1207.  
- GET `/admin/quality/ocr-extraction-metrics` — L1215.  
- GET `/admin/quality/analytics` — L1277.  
- GET `/admin/quality/funnel` — L1527.  
- GET `/admin/quality/recognition` — L1623 — serves HTML from `public/admin/recognition-quality.html` and returns JSON data.  
- GET `/admin/quality/classification-stats` — L1726.  
- GET `/admin/quality/failure-categories` — L1807.  
- GET `/admin/quality/health-score` — L1879.  
- GET `/admin/quality/review-sla` — L2028.  
- GET `/admin/quality/low-confidence-routes` — L2101.  
- GET `/admin/quality/weekly-summary` — L2154.  
- POST `/admin/cron/overdue-task-reminders` — L2352.  
- POST `/admin/cron/retention-cleanup` — L2368.  
- POST `/admin/demo/seed` — L2386 — no auth; seeds demo data (LegalCase, Document, document_recognition, etc.).  
- GET `/me/notifications`, PATCH `/me/notifications/:id/read`, `/me/notifications/read-all` — L2811–2848.  
- GET `/notifications`, PATCH read-all, `/:id/read` — L2863–2906.  
- GET `/me/metrics-summary` — L2919.  
- GET `/me/overdue-tasks` — L2995, L3615.  
- GET `/me/audit-events` — L3017.  
- GET `/me/needs-attention` — L3059.  
- GET `/activity-feed` — L3180.  
- GET/POST/DELETE `/saved-views` — L3227–3308.  
- GET `/dashboard/daily-digest` — L3328.  
- GET `/dashboard/attention` — L3482.  
- GET `/dashboard` — L3607.  
- GET `/me/usage` — L3646.  
- GET `/billing/status` — L3749.  
- POST `/billing/simulate/upgrade` — L3795.  
- GET `/firm/usage` — L3825.  
- GET `/me/documents` — L3861 — cursor pagination, filters.  
- GET `/me/review-queue` — L4118 — cursor pagination, joins document_recognition.  
- GET `/me/search` — L4295.  
- GET `/review-queue` — L4404.  
- GET `/search` — L4412.  
- GET `/me/features` — L4518.  
- GET/PATCH `/me/settings` — L4536, L4550.  
- POST `/me/crm-push-test` — L4571.  
- GET/PATCH `/routing-rule` — L4602, L4637.  
- GET/PATCH `/me/routing-rules`, `/firms/:firmId/routing-rules` — L4687–4765.  
- GET `/providers/search`, `/providers/map`, `/providers`, `/providers/:id`, `/providers/:id/cases`, `/providers/:id/summary`, `/providers/:id/referrals`, `/providers/:id/invoices` — L4810–5183.  
- POST `/providers`, `/providers/:id/invoices` — L5218, L5317.  
- PATCH `/provider-invoices/:id/pay-status` — L5276.  
- PATCH `/providers/:id/verify`, `/providers/:id/subscription`, `/providers/:id` — L5352–5396.  
- POST `/provider/auth/login`, `/provider/auth/logout` — L5522, L5561.  
- GET `/provider/me`, PATCH `/provider/me/provider` — L5566, L5580.  
- GET `/provider/invite/accept`, POST `/provider/invite/accept` — L5623, L5647.  
- GET/POST `/document-tags` — L5735, L5750.  
- PATCH `/documents/bulk` — L5771.  
- POST `/documents/merge` — L5863.  
- POST `/documents/:id/recognize` — L5882 — runs OCR + classification + extraction + case match; writes document_recognition.  
- POST `/documents/:id/reprocess` — L6045.  
- GET `/documents/:id/recognition-diagnostics` — L6091.  
- POST `/documents/:id/rematch` — L6150 — re-runs case matching only.  
- POST `/documents/:id/approve` — L6232.  
- POST `/documents/:id/reject` — L6275.  
- POST `/documents/:id/route` — L6304 — body: caseId; calls routeDocument; optional pushCaseIntelligenceToCrm; enqueueTimelineRebuildJob.  
- POST `/documents/:id/claim`, `/documents/:id/unclaim` — L6405, L6445.  
- GET `/documents/:id/thumbnail`, `/documents/:id/download` — L6474, L6493.  
- PATCH `/documents/:id` — L6512.  
- GET `/documents/:id/preview` — L6620.  
- GET `/documents/:id/duplicates` — L6650.  
- GET `/documents/:id/audit`, `/documents/:id/audit-events` — L6697–6698 — handler `getDocumentAuditEvents`.  
- GET/POST/DELETE `/documents/:id/tags`, `/documents/:id/tags/:tagId` — L6701–6759.  
- GET `/documents/:id/versions` — L6783.  
- POST `/documents/:id/new-version` — L6819 — upload.single("file").  
- GET `/documents/:id` — L6917.  
- GET `/cases/:id` — L6939.  
- GET `/cases/:id/audit`, `/cases/:id/insights`, `/cases/:id/report`, `/cases/:id/summary` — L6960–7024.  
- POST `/cases/:id/summary/generate` — L7055.  
- GET `/cases/:id/checklist`, PATCH `/cases/checklist-items/:id` — L7100–7147.  
- GET/PATCH `/cases/:id/financial` — L7185–7231.  
- GET `/cases/:id/export-packet/history`, POST `/cases/:id/export-packet` — L7358–7386.  
- GET `/packet-exports/:id/download` — L7415.  
- POST `/cases/:id/fetch-docket` — L7434.  
- GET `/cases/:id/timeline-meta`, GET `/cases/:id/timeline` — L7466–7480.  
- POST `/cases/:id/timeline/rebuild` — L7528 — enqueueTimelineRebuildJob.  
- POST `/cases/:id/timeline/export` — L7550.  
- POST `/cases/:id/narrative` — L7626 — rateLimitEndpoint(20, "narrative"); hasFeature(firmId, "demand_narratives"); body: narrativeType/type, tone, notes, questionnaire; generateNarrative; upsert UsageMonthly.narrativeGenerated; createNotification; pushCaseIntelligenceToCrm. **Implemented.**  
- POST `/cases/:id/rebuild-timeline` — L7705.  
- POST `/cases/:id/push-test` — L7722.  
- GET/POST/DELETE `/cases/:id/providers`, `/cases/:id/providers/:providerId` — L7754–7820.  
- POST `/cases/:id/provider-packet` — L7862.  
- (Further case/document/mailbox/metrics routes continue in server.ts; see grep results for full list.)  
- GET `/records-requests/:id` — L8951 (inline; router also has GET `/:id`).  
- PATCH `/records-requests/:id` — L8991.  
- POST `/records-requests/:id/generate-pdf` — L9026.  
- GET `/records-requests/:id/letter` — L9122.  
- POST `/records-requests/:id/send` — L9195.  
- GET `/records-requests/:id/attempts` — L9236.  
- GET `/metrics/review` — L9280.  
- GET `/mailboxes/recent-ingests`, `/mailboxes/:id/recent-ingests` — L10012–10054.  
- POST `/mailboxes/:id/poll-now`, `/mailboxes/:id/test` — L10108–10129.  
- PATCH `/mailboxes/:id` — L10165.  
- POST `/mailboxes` — L10194.  
- GET `/mailboxes` — L10248.  
- GET `/documents/:id/recognition` — L9455 (later in file).  

**Error middleware:** `app.use(errorLogMiddleware)` — L10277.

### 3.3 Fully Implemented vs Incomplete Endpoints

- **Fully implemented (logic complete, returns expected shape):** POST `/ingest`, GET `/cases`, GET `/me/documents`, GET `/me/review-queue`, POST `/documents/:id/route`, POST `/documents/:id/recognize`, POST `/cases/:id/narrative`, GET `/cases/:id/timeline`, GET `/me/usage`, GET `/me/features`, records-requests CRUD and send, providers CRUD, routing-rules GET/PATCH, admin quality/errors/jobs/demo seed, mailboxes list/recent-ingests/test/poll-now.  
- **Incomplete or stubbed:**  
  - GET `/admin/cases` (L299) — returns placeholder; no full cases list implementation here (list is on GET `/cases` via router).  
  - Clio exports/mappings (L495–520) — CSV export and mapping read; no OAuth or write-back to Clio.  
  - Session-based auth — not implemented; auth middleware is Bearer-only (auth.ts L57 TODO).  
- **Missing validation:** Many handlers use `(req.body ?? {}) as any` and no zod/joi; only spot checks (e.g. providerId required, name required on templates). Ingest uses `validateUploadFile` (server.ts L2657) and `sendSafeError` for invalid file.  
- **Missing error handling:** Many `catch (e: any) { res.status(500).json({ ok: false, error: String(e?.message ?? e) }); }` with no error code or structured shape. No global error code enum.

---

## 4. Document Processing Pipeline Audit

### 4.1 Ingestion

- **Location:** POST `/ingest` in `server.ts` L2650; `apps/api/src/services/ingestFromBuffer.ts` for buffer-based ingest (e.g. email).  
- **Flow:** Validate file → check billing/page limit → duplicate check (feature `duplicates_detection`, 30-day window, `file_sha256` + `fileSizeBytes`) → putObject → Prisma `Document` create (RECEIVED) → `enqueueDocumentJob({ documentId, firmId })` (queue.ts).  
- **Implemented:** Yes. Duplicate path creates another Document with `duplicateOfId` and returns `duplicate: true`; usage and duplicateMatchCount updated.

### 4.2 OCR / Text Extraction

- **Location:** `apps/api/src/workers/worker.ts` — `handleOcrJob` (L55).  
- **Flow:** Update Document status PROCESSING → getObjectBuffer → countPagesFromBuffer → upsert UsageMonthly (pagesProcessed, docsProcessed) → set Document UPLOADED, processedAt. For PDF: set processingStage "ocr" → `runOcrPipeline(buf, ...)` (from `apps/api/src/services/ocr`) → INSERT/UPDATE `document_recognition` (text_excerpt, page_texts_json, detected_language, ocr_engine, ocr_confidence, has_handwriting, etc.) via raw SQL (L194–278) → Document status SCANNED → thumbnail optional → `enqueueClassificationJob`. Non-PDF skips OCR and completes.  
- **Implemented:** Yes. OCR pipeline uses embedded text + primary OCR provider; worker writes all OCR columns used elsewhere.

### 4.3 Document Classification

- **Location:** `worker.ts` — `handleClassificationJob` (L264).  
- **Flow:** Read `text_excerpt` from `document_recognition` (L270–272) → `classifyAndExtract(text)` (docRecognition.ts) + `classify(text, originalName)` (docClassifier) → merge docType/confidence; apply feature flags (insurance_extraction, court_extraction) to doc type → UPDATE `document_recognition` (doc_type, client_name, case_number, incident_date, confidence) (L294–318) → Document status CLASSIFIED → `enqueueExtractionJob`.  
- **Implemented:** Yes.

### 4.4 Provider Detection

- **Location:** Extraction step in worker and extractors.  
- **Flow:** `provider_name` is set in `document_recognition` during extraction (worker.ts L321–324, L429) from insurance extractor (insuranceCompany/adjusterName). No separate “provider detection” pipeline stage; provider is derived from insurance/court extractors.  
- **Implemented:** Partial (provider_name populated from extraction only).

### 4.5 Case Matching

- **Location:** `worker.ts` — `handleCaseMatchJob` (L396).  
- **Flow:** Read case_number, client_name from `document_recognition` (L395–401) → get RoutingRule (minAutoRouteConfidence, autoRouteEnabled) → `matchDocumentToCase(firmId, { caseNumber, clientName }, null)` (caseMatching service) → optional auto-create case (firm.settings.autoCreateCaseFromDoc) → if autoRouteEnabled and matchConfidence ≥ threshold, call `routeDocument` and enqueue timeline rebuild; else set Document NEEDS_REVIEW, recordReviewQueueEnter → UPDATE `document_recognition` (match_confidence, match_reason, suggested_case_id) (L458–461, L701–703).  
- **Implemented:** Yes.

### 4.6 Timeline Extraction

- **Location:** `apps/api/src/services/caseTimeline.ts` — `rebuildCaseTimeline`; worker handles job type `timeline_rebuild` (worker.ts L47–53, L469–472).  
- **Flow:** Rebuild CaseTimelineEvent from documents and document_recognition; invoked after route or auto-route and from POST `/cases/:id/timeline/rebuild`.  
- **Implemented:** Yes.

### 4.7 Billing Extraction

- **Location:** Insurance extractor writes `insurance_fields` (e.g. settlementOffer) to `document_recognition`; worker L346–365 create notification when settlementOffer present.  
- **Flow:** CaseFinancial (medicalBillsTotal, settlementOffer, etc.) is updated via PATCH `/cases/:id/financial` (server.ts L7224), not auto-derived from pipeline.  
- **Implemented:** Partial — extraction of amounts/offer in recognition; no automatic write to CaseFinancial from pipeline.

### 4.8 Duplicate Detection

- **Location:** Ingest in server.ts L2704–2774 (SHA256 + file size, 30 days); `apps/api/src/services/duplicateDetection.ts` uses `normalized_text_hash` from document_recognition for content-based dupes.  
- **Implemented:** Yes for ingest; content-based used where service is called.

### 4.9 Document Routing

- **Location:** POST `/documents/:id/route` server.ts L6304; `routeDocument` in `apps/api/src/services/documentRouting.ts`; worker auto-route in handleCaseMatchJob.  
- **Flow:** Audit event, Document.routedCaseId/routingStatus updated, optional pushCaseIntelligenceToCrm, enqueueTimelineRebuildJob.  
- **Implemented:** Yes.

### 4.10 Review Queue

- **Location:** GET `/me/review-queue` server.ts L4118; `recordReviewQueueEnter` in worker; ReviewQueueEvent model.  
- **Flow:** Documents NEEDS_REVIEW or UPLOADED with routingStatus needs_review; join document_recognition (suggested_case_id, match_confidence, doc_type, etc.); cursor pagination.  
- **Implemented:** Yes.

---

## 5. Database Schema Audit

### 5.1 Prisma Models — File: `apps/api/prisma/schema.prisma`

- **Firm** — id, name, plan, pageLimitMonthly, retentionDays, status, billingCustomerId, billingStatus, trialEndsAt, features (Json), settings (Json), createdAt. Relations: users, apiKeys, documents, usageMonthly, routingRule, providers, cases, caseProviders, crmPushLogs, crmCaseMappings, notifications, jobs, webhookEndpoints, reviewQueueEvents, referrals, caseSummaries, caseChecklistItems, casePacketExports, activityFeedItems, savedViews, caseFinancials, documentTags, caseContacts, demandPackages, firmIntegrations, mailboxConnections.  
- **User** — id, firmId, email, role (enum Role), createdAt.  
- **ApiKey** — id, firmId, userId, name, keyPrefix, keyHash, scopes, lastUsedAt, revokedAt, createdAt.  
- **Document** — id, firmId, source, spacesKey, originalName, mimeType, pageCount, status (DocumentStatus), processingStage (ProcessingStage), external_id, file_sha256, fileSizeBytes, duplicateMatchCount, duplicateOfId, ingestedAt, extractedFields (Json), confidence, routedSystem, routedCaseId, routingStatus, thumbnailKey, createdAt, processedAt, metaJson. Relations: duplicateOf/duplicates, firm, auditEvents, activityFeedItems, tagLinks, versions.  
- **DocumentVersion** — documentId, versionNumber, spacesKey.  
- **DocumentTag**, **DocumentTagLink** — firm-scoped tags.  
- **DocumentAuditEvent** — documentId, firmId, actor, action, fromCaseId, toCaseId, metaJson, createdAt.  
- **RoutingRule** — firmId (unique), minAutoRouteConfidence, autoRouteEnabled.  
- **UsageMonthly** — firmId, yearMonth (unique with firmId), pagesProcessed, docsProcessed, insuranceDocsExtracted, courtDocsExtracted, narrativeGenerated, duplicateDetected, updatedAt.  
- **Provider** — id, firmId, name, address, city, state, phone, fax, email, specialty, specialtiesJson, verified, subscriptionTier, listingActive, expiresAt, lat, lng, hoursJson, serviceAreasJson, intakeInstructions.  
- **ProviderInvoice**, **ProviderAccount**, **ProviderInvite** — provider billing and portal.  
- **CaseProvider** — firmId, caseId, providerId, relationship (treating|referral|lien|records_only).  
- **LegalCase** — id, firmId, title, caseNumber, clientName, createdAt; @@map("Case").  
- **CaseFinancial** — caseId (unique), medicalBillsTotal, liensTotal, settlementOffer, settlementAccepted, attorneyFees, costs, netToClient.  
- **CaseNote**, **CaseTask** — notes and tasks per case.  
- **CaseSummary** — caseId, body.  
- **CaseChecklistItem** — caseId, key, label, completed.  
- **CaseContact** — caseId, name, role, phone, email, notes.  
- **CaseTimelineEvent** — caseId, firmId, eventDate, eventType, track, facilityId, provider, diagnosis, procedure, amount, documentId, metadataJson.  
- **CaseTimelineRebuild** — caseId, firmId, rebuiltAt (unique on caseId, firmId).  
- **RecordsRequest** — caseId, providerId, providerName, providerContact, dateFrom, dateTo, notes, letterBody, status, generatedDocumentId, plus automation fields (patientName, requestType, destinationType, etc.).  
- **RecordsRequestAttempt**, **RecordsRequestEvent**, **RecordsRequestAttachment** — send attempts and attachments.  
- **RecordsRequestTemplate**, **RecordsRequestFollowUpRule** — templates and follow-up.  
- **DemandPackage**, **DemandPackageSectionSource** — demand packages.  
- **Job**, **JobEvent** — Prisma job model (separate from Redis pipeline).  
- **Notification** — firmId, type, title, message, meta, read.  
- **ReviewQueueEvent** — firmId, documentId, enteredAt, exitedAt, resolutionType.  
- **WebhookEndpoint** — firmId, url, secret, eventsJson, enabled.  
- **CrmPushLog**, **CrmCaseMapping** — CRM push log and case ↔ external matter.  
- **SystemErrorLog** — service, message, stack, firmId, userId, area, route, method, severity, metaJson, resolvedAt, status.  
- **AppBugReport** — firmId, userId, title, description, pageUrl, screenshotUrl, status, priority.  
- **SystemBackup**, **SystemIncident** — admin.  
- **FirmIntegration**, **IntegrationCredential**, **MailboxConnection**, **IntegrationSyncLog**, **FieldMapping** — integrations.

### 5.2 Raw Tables (Not in Prisma)

- **document_recognition** — Created by `apps/api/create_recognition_table.js`: document_id (PK), text_excerpt, doc_type, client_name, case_number, incident_date, confidence, created_at, updated_at. Migrations add: match_confidence, match_reason, suggested_case_id, insurance_fields, court_fields, risks, insights, summary, page_texts_json, detected_language, possible_languages, ocr_engine, ocr_confidence, has_handwriting, handwriting_heavy, handwriting_confidence, page_diagnostics, page_count_detected, normalized_text_hash, text_fingerprint, provider_name, extraction_strict_mode, etc. (see migrations under `apps/api/prisma/migrations/` with names containing `document_recognition`).  
- **mailbox_connections** — Created in migration `20260309000000_mailbox_email_tables`; used by `emailIngestRunner.ts` with columns such as id, firm_id, provider, imap_host, imap_port, last_uid, status.  
- **email_messages**, **email_attachments** — Same migration; email metadata and attachment links.

### 5.3 Relationships and Key Fields

- **Documents:** Document.firmId → Firm; Document.routedCaseId → LegalCase; Document.duplicateOfId → Document; DocumentAuditEvent.documentId → Document.  
- **Cases:** LegalCase.firmId → Firm; CaseTimelineEvent.caseId → LegalCase; CaseFinancial.caseId → LegalCase; RecordsRequest.caseId → LegalCase; CaseProvider links LegalCase and Provider.  
- **Recognition:** No FK in DB; application uses document_id as logical FK to Document.id.  
- **Unused/incomplete:** LegalCase in DB may have clientId NOT NULL (migration drift); Prisma has clientName. Demo seed uses raw SQL for Case insert (VERIFICATION_RESULTS.md). document_recognition has no Prisma model — type safety and migrations are manual.

---

## 6. Worker / Background Jobs

### 6.1 Job Systems

- **Redis queue** — Key `doc_jobs` in `apps/api/src/services/queue.ts`. Types: `ocr`, `classification`, `extraction`, `case_match`, `timeline_rebuild`. Consumed by `apps/api/src/workers/worker.ts` via `popJob()` (rpop).  
- **Prisma Job** — Model in schema; API endpoints POST/GET /jobs, retry, cancel. Used for API-created jobs (e.g. document.process, timeline.rebuild as job type string); **not** used by the main pipeline worker (worker.ts only uses Redis).

### 6.2 Job Flow (Ingest → Scan → Classify → Route)

1. **Ingest** — API creates Document, calls `enqueueDocumentJob` → `enqueueOcrJob` → lpush to Redis.  
2. **Worker** — `popJob()` → type `ocr` → `handleOcrJob`: fetch file, page count, write document_recognition (OCR text), status SCANNED → `enqueueClassificationJob`.  
3. **Classification** — `handleClassificationJob`: read text, classifyAndExtract + classify, update document_recognition (doc_type, client_name, case_number, incident_date, confidence), status CLASSIFIED → `enqueueExtractionJob`.  
4. **Extraction** — `handleExtractionJob`: runExtractors, insurance/court fields, risks, insights, summary, update document_recognition and Document.extractedFields → `enqueueCaseMatchJob`.  
5. **Case match** — `handleCaseMatchJob`: matchDocumentToCase, optional auto-create case, optional auto-route (routeDocument), else NEEDS_REVIEW, recordReviewQueueEnter; update document_recognition (match_confidence, match_reason, suggested_case_id).  
6. **Timeline rebuild** — Job type `timeline_rebuild`: `handleTimelineRebuild` → `rebuildCaseTimeline`; optional pushCaseIntelligenceToCrm.

**Missing steps:** No dedicated “billing” job that writes to CaseFinancial. No image-only OCR path (non-PDF skips OCR). Worker is single-process (no horizontal scaling of consumers documented).

---

## 7. Frontend Dashboard Audit

### 7.1 Pages Under /dashboard and /admin — Exact Paths and Functionality

| Route | File | Functionality |
|-------|------|----------------|
| `/dashboard` | `apps/web/app/dashboard/page.tsx` | Fetches `getApiBase()/me/metrics-summary` and `getApiBase()/cases`; shows summary (docsProcessedThisMonth, pagesProcessedThisMonth, etc.), cases list, recent activity; uses PageHeader, StatsWidget, DashboardCard; links to review, cases, documents, providers, records-requests, settings, integrations. |
| `/dashboard/review` | `apps/web/app/dashboard/review/page.tsx` | Fetches `getApiBase()/me/review-queue?limit=50`; DataTable with columns document (link to `/dashboard/documents/[id]`), confidence, suggested case (link to `/dashboard/cases/[id]`), docType, recommendation, action (Review/Route links). Uses PageHeader, getAuthHeader(). |
| `/dashboard/cases` | `apps/web/app/dashboard/cases/page.tsx` | Fetches `getApiBase()/cases`; lists cases (id, title, caseNumber, clientName); links to `/dashboard/cases/[id]`. |
| `/dashboard/cases/[id]` | `apps/web/app/dashboard/cases/[id]/page.tsx` | Case detail page (case-specific content). |
| `/dashboard/documents` | `apps/web/app/dashboard/documents/page.tsx` | Fetches `getApiBase()/me/documents` with query params; documents list. |
| `/dashboard/documents/[id]` | `apps/web/app/dashboard/documents/[id]/page.tsx` | Document detail. |
| `/dashboard/providers` | `apps/web/app/dashboard/providers/page.tsx` | Providers list. |
| `/dashboard/providers/[id]` | `apps/web/app/dashboard/providers/[id]/page.tsx` | Provider detail/edit. |
| `/dashboard/records-requests` | `apps/web/app/dashboard/records-requests/page.tsx` | Records requests list. |
| `/dashboard/records-requests/[id]` | `apps/web/app/dashboard/records-requests/[id]/page.tsx` | Records request detail. |
| `/dashboard/records-requests/new` | `apps/web/app/dashboard/records-requests/new/page.tsx` | New records request. |
| `/dashboard/usage` | `apps/web/app/dashboard/usage/page.tsx` | Usage view. |
| `/dashboard/analytics` | `apps/web/app/dashboard/analytics/page.tsx` | Fetches from API (getApiBase(), getAuthHeader()); analytics content. |
| `/dashboard/audit` | `apps/web/app/dashboard/audit/page.tsx` | Fetches `getApiBase()/me/audit-events?limit=${limit}`; audit events list. |
| `/dashboard/settings` | `apps/web/app/dashboard/settings/page.tsx` | Settings. |
| `/dashboard/integrations` | `apps/web/app/dashboard/integrations/page.tsx` | Integrations. |
| `/admin/errors` | `apps/web/app/admin/errors/page.tsx` | Admin errors. |
| `/admin/incidents` | `apps/web/app/admin/incidents/page.tsx` | Admin incidents. |
| `/admin/support` | `apps/web/app/admin/support/page.tsx` | Fetches `getApiBase()/admin/system/health`; support/health. |
| `/admin/support/bug-reports` | `apps/web/app/admin/support/bug-reports/page.tsx` | Bug reports. |
| `/admin/security` | `apps/web/app/admin/security/page.tsx` | Security. |

### 7.2 Other App Routes

- **Root:** `apps/web/app/page.tsx` — Default Next.js template; not a doc-platform home or redirect to /dashboard.  
- **Settings:** `apps/web/app/settings/integrations/page.tsx` — Fetches `getApiBase()/integrations/status`, `/integrations/health`, `/integrations/sync-log`; POST `/integrations/test`.  
- **Onboarding:** `apps/web/app/onboarding/integration/page.tsx` — POST `/integrations/connect-email`, `/integrations/connect-api`.  
- **Support:** `apps/web/app/support/report/page.tsx` — Support report.  
- **Debug:** `apps/web/app/debug/audit/page.tsx` — Debug audit (e.g. GET /api/debug/audit in `apps/web/app/api/debug/audit/route.ts`).  

### 7.3 Missing UI Features

- **Case timeline page** — No dedicated `app/dashboard/cases/[id]/timeline/page.tsx` in the glob results; timeline may be a section or link on case detail.  
- **Narrative page** — No dedicated `app/dashboard/cases/[id]/narrative/page.tsx` in the glob results; may be on case detail.  
- **Routing rules UI** — API exists (GET/PATCH `/routing-rule`, `/me/routing-rules`); no dedicated page path found under dashboard/settings (may be under settings).  
- **Mailboxes list UI** — API: GET `/mailboxes`, `/mailboxes/recent-ingests`; no explicit `app/dashboard/mailboxes/page.tsx` in list.  
- **Demo seed button** — README_DEV_SMOKE_TEST mentions “Generate demo data” on dashboard in dev; implementation may be in dashboard page or a dev-only component.

---

## 8. Integration Audit

### 8.1 CRM Integrations

- **Implemented:**  
  - **Generic webhook** — `apps/api/src/integrations/crm/webhookAdapter.ts`: reads `firm.settings.crmWebhookUrl` or env `FIRM_CRM_WEBHOOK_URL`; POSTs JSON payload (title, bodyMarkdown, caseId, meta).  
  - **Push service** — `apps/api/src/integrations/crm/pushService.ts`: `pushCaseIntelligenceToCrm` builds message via `messageBuilder`, calls `pushCrmWebhook`, logs to `CrmPushLog`. Used after document route, timeline rebuild, narrative (server.ts).  
- **Stubbed / export-only:**  
  - GET `/exports/clio/contacts.csv` (server.ts L495), GET `/exports/clio/matters.csv` (L507) — requireExportFirm; CSV export.  
  - GET `/crm/clio/mappings` (L520) — returns mappings.  
  - No Clio OAuth or write-back to Clio matters; no Litify/Filevine/Salesforce SDK.

### 8.2 External APIs Used

- **OpenAI** — Used by narrative assistant (generateNarrative).  
- **IMAP** — Used by email ingest (imapPoller, emailIngestRunner).  
- **MinIO-compatible storage** — putObject, getObjectBuffer (env-configured).  
- **Redis** — Queue (REDIS_URL).  
- **PostgreSQL** — Prisma + raw pool (DATABASE_URL).

---

## 9. Error Handling and Logging

### 9.1 Logging Systems

- **SystemErrorLog** — Prisma model in `schema.prisma`; written by `apps/api/src/services/errorLog.ts` — `logSystemError(service, messageOrErr, stack?, meta?)`; meta can include firmId, userId, area, route, method, severity, metaJson, status.  
- **Worker** — Uses `logSystemError("worker", ...)` on OCR fetch/page count/recognition save failures (worker.ts L82–86, L100–105, L236–241).  
- **Console** — Worker uses `console.log`/`console.warn`/`console.error` for job progress and errors.

### 9.2 Error Tracking

- **Admin API** — GET `/admin/errors` (server.ts L943) returns paginated SystemErrorLog.  
- **Failure categorization** — `errorLog.ts` exports `getFailureCategory(message, service)` (OCR failure, PDF parse failure, upload failure, CRM push failure, mailbox auth failure, records request send failure, unknown).  
- **No Sentry/DataDog** — Not referenced in codebase.

### 9.3 Missing Observability

- No requestId in logs or responses.  
- No distributed tracing.  
- No structured JSON log format for ingestion by log aggregators.  
- Global error middleware: `errorLogMiddleware` at server.ts L10277 — behavior not inspected here but present.

---

## 10. Security Audit

### 10.1 Authentication

- **File:** `apps/api/src/http/middleware/auth.ts`.  
- **Mechanism:** Bearer token from Authorization header; if token === PLATFORM_ADMIN_API_KEY → isAdmin, authRole PLATFORM_ADMIN; else lookup ApiKey by keyPrefix (first 12 chars), bcrypt.compare(token, keyHash); on success sets req.firmId, apiKeyId, authScopes (parsed from ApiKey.scopes), userId and authRole from User if userId present, else STAFF.  
- **Session:** Comment at L57: "TODO: session user - if no Bearer, check req.session?.userId"; not implemented.  
- **Failure:** 401 with message "Missing Authorization" or "Invalid API key"; abuse recorded via `recordAbuse` (L108–110).

### 10.2 Permissions

- **Roles:** Role enum in schema: PLATFORM_ADMIN, FIRM_ADMIN, STAFF.  
- **Middleware:** `requireRole(Role.STAFF)` etc. used on most routes; `requireAdminOrFirmAdminForFirm`, `requireExportFirm` for firm-scoped admin and Clio export.  
- **Scopes:** ApiKey.scopes (e.g. "ingest"); `authWithScope("ingest")` used for POST `/ingest`.  
- **Provider portal:** `requireProviderSession` for `/provider/me` and PATCH `/provider/me/provider`; separate from main API key auth.

### 10.3 API Protection

- **Rate limiting:** In auth.ts, per-apiKey limit (default 120/min), window 60s; returns 429 with Retry-After.  
- **Ingest rate limit:** `rateLimitEndpoint(60, "ingest")` on POST `/ingest` (60 req/min).  
- **Narrative rate limit:** `rateLimitEndpoint(20, "narrative")` on POST `/cases/:id/narrative`.  
- **CORS:** `cors({ origin: true, credentials: true })` (server.ts L119).  
- **Security headers:** `securityHeaders` middleware (L121).  
- **Body size:** `express.json({ limit: "25mb" })` (L122).

### 10.4 Data Handling

- **Credentials:** Integration credentials encrypted via `encryptSecret` (integrations router); decryption in email runner (decryptMaybePlaintext in emailIngestRunner.ts — currently plaintext placeholder per comment).  
- **API keys:** Stored hashed (bcrypt); raw key returned only on create (dev/create-api-key endpoints).  
- **Firm isolation:** Queries use firmId from req.firmId; tenant helpers in `apps/api/src/lib/tenant.ts` (requireFirmIdFromRequest, buildFirmWhere, assertRecordBelongsToFirm, forbidCrossTenantAccess).

---

## 11. Overall Project Status

| Area | % Complete (estimate) | Notes |
|------|------------------------|--------|
| **MVP overall** | **~75%** | Core pipeline, dashboard, and API present; session auth, request validation, and CRM native integrations missing. |
| **Document scanning pipeline** | **~90%** | Ingest → OCR → classification → extraction → case match → route → timeline implemented; billing auto-update from pipeline and image-only OCR path partial. |
| **Dashboard** | **~70%** | Dashboard home, review, cases, documents, providers, records-requests, usage, analytics, audit, settings, integrations, admin pages exist; root page and some deep links (timeline/narrative) may need verification. |

---

## 12. Biggest Gaps — Top 10 for Production MVP

1. **Session-based auth and login** — auth.ts L57 TODO; no login/signup or session resolution.  
2. **Request validation** — No schema validation (zod/joi) on most endpoints; body/params cast as `any` with ad hoc checks.  
3. **document_recognition table lifecycle** — Table created only by standalone `create_recognition_table.js`; migrations only ALTER. New envs must run script manually.  
4. **Root app entry** — `app/page.tsx` is default template; no redirect to `/dashboard` or dedicated landing.  
5. **Billing pipeline** — CaseFinancial not auto-updated from extracted insurance_fields (e.g. settlement offer) when document is routed.  
6. **Structured error contract** — No consistent error code enum or response shape; many 500 with generic message.  
7. **CRM native integrations** — Clio/Litify/Filevine only stubbed (exports/mappings); no OAuth or matter sync.  
8. **Observability** — No requestId, no Sentry/APM, no structured JSON logging.  
9. **E2E tests** — Playwright/Cypress not summarized; run_full_system_test references Playwright as SKIP.  
10. **Usage in dashboard** — Ensure /me/usage returns all UsageMonthly counters and dashboard displays them for quotas/add-on metering.

---

## 13. Report Sections Summary

- **Project Overview** — §1.  
- **Architecture** — §2 (repository structure, layers).  
- **Implemented Systems** — §3 (backend audit: routes, implementation status, validation/error gaps).  
- **Partially Implemented Systems** — §4 (pipeline: provider detection, billing extraction); §8 (CRM webhook vs Clio).  
- **Missing Systems** — §3.3 (validation, error handling, session auth), §4.7 (billing auto-update), §6.2 (missing worker steps), §7.3 (missing UI), §9.3 (observability).  
- **Database Overview** — §5 (Prisma models, raw tables, relationships).  
- **API Endpoints** — §3.2 (full list with file/line).  
- **Dashboard Features** — §7 (pages with paths and functionality).  
- **Document Processing Pipeline** — §4 (ingestion through review queue).  
- **Next Development Priorities** — §12 (top 10 gaps).

This report references exact files, routes, models, and components and is analysis-only (no code modifications).
