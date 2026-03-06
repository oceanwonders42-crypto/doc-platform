# Doc Platform — Full Implementation Summary

This report summarizes all major features, backend and frontend components, database models, feature flags, usage tracking, scripts, and architecture in the doc-platform repository.

---

## 1) FEATURES IMPLEMENTED

- **Document ingestion** — Multipart file upload via POST /ingest; storage to object storage (MinIO); job enqueue for processing; optional externalId and source.
- **Duplicates detection** — SHA256 + file size on ingest; when feature flag is on, avoids re-creating duplicates for same firm within last 30 days; returns duplicate flag and existing document id; tracks duplicate_detected usage and duplicateMatchCount on documents.
- **OCR / document recognition** — PDF text extraction; classification (medical, court, insurance, other); idempotent upsert into document_recognition table with text excerpt, doc type, client name, case number, incident date, confidence.
- **Document classification** — Doc classifier (court, insurance, medical, other) and generic extractor for case number, client name, incident date; optional insurance and court extractors gated by feature flags.
- **Insurance extraction** — Add-on extractor for insurance documents (claim number, policy, insurer, adjuster, dates, offer amount, etc.); gated by insurance_extraction feature; usage tracked as insuranceDocsExtracted.
- **Court document extraction** — Add-on extractor for court documents (case number, court name, parties, filing/hearing dates, etc.); gated by court_extraction feature; usage tracked as courtDocsExtracted.
- **Case matching** — Matches documents to cases by case number, client name, and partial matches; writes match_confidence and match_reason to document_recognition; used for review queue suggestions.
- **Document routing** — Manual route to case (POST /documents/:id/route); approve/reject; claim/unclaim for review; auto-route when confidence above threshold (routing rule); audit events for routed, auto_routed, rejected, etc.
- **Review queue** — Documents needing review (NEEDS_REVIEW/UPLOADED with routingStatus null or needs_review); filters by confidence, status, doc type; bulk confirm/reject/route; preview drawer; SLA highlighting.
- **Medical timeline** — Case-scoped timeline events (eventDate, eventType, track: medical/legal/insurance, facility, provider, diagnosis, procedure, amount, documentId); rebuild from documents; timeline-meta and timeline endpoints.
- **Demand narrative assistant** — AI-generated narrative sections (treatment summary, injury summary, pain and suffering, liability, demand rationale, response to denial/offer); tone (neutral, assertive, aggressive); uses case timeline + extracted fields; gated by demand_narratives feature; usage tracked as narrativeGenerated.
- **Records requests** — Case-scoped records requests (provider, date range, notes, status); letter generation for requests; PATCH and GET letter endpoints.
- **Feature flags** — Firm-level features stored in Firm.features (JSON array); hasFeature(firmId, feature) used to gate add-ons and UI; GET /me/features returns flags for web.
- **Usage tracking** — Per-firm, per-month (UsageMonthly): pagesProcessed, docsProcessed, insuranceDocsExtracted, courtDocsExtracted, narrativeGenerated, duplicateDetected; used for quotas and add-on metering.
- **Email intake** — IMAP polling for configured mailboxes; attachment extraction; ingest into platform with optional dedupe by SHA256; mailbox enable/disable/test; recent ingests API.
- **Providers** — Firm-scoped provider directory (name, address, city, state, phone, fax, email, specialties); CRUD; used in records requests and timeline.
- **Routing rules** — Per-firm min auto-route confidence and autoRouteEnabled; GET/PATCH for current firm and by firmId.
- **Mailboxes** — List mailboxes; per-mailbox recent ingests; test connection; PATCH settings; enable/disable.

---

## 2) BACKEND COMPONENTS

### API endpoints (Express, apps/api/src/http/server.ts)

- **Health / dev**
  - GET /health — Returns { ok: true }.
  - POST /dev/create-firm — Creates a firm (dev only).
  - POST /dev/create-api-key/:firmId — Creates API key for firm; returns raw key once.

- **Ingest**
  - POST /ingest — Multipart file (field "file"); optional source, externalId; auth required; duplicate check when duplicates_detection on; stores file, creates Document, enqueues job; returns ok, documentId, spacesKey, or duplicate + existingId.

- **Firm-scoped (authApiKey)**
  - GET /me/usage — Current month usage + firm (plan, pageLimitMonthly, status).
  - GET /me/documents — Cursor-paginated document list (items, nextCursor); includes lastAuditAction, duplicateMatchCount.
  - GET /me/review-queue — Documents needing review with recognition data (match confidence, suggested case, doc type); cursor pagination.
  - GET /me/features — Returns { insurance_extraction, court_extraction, demand_narratives, duplicates_detection }.
  - GET /me/routing-rules — Current firm routing rule.
  - PATCH /me/routing-rules — Update current firm routing rule.
  - GET /firms/:firmId/routing-rules — Get routing rule by firm (auth).
  - PATCH /firms/:firmId/routing-rules — Update routing rule by firm.

- **Providers**
  - GET /providers — List providers for firm.
  - GET /providers/:id — Single provider.
  - POST /providers — Create provider.
  - PATCH /providers/:id — Update provider.

- **Documents**
  - POST /documents/:id/recognize — Run recognition (OCR, classify, extract, case match); writes document_recognition; may increment insuranceDocsExtracted/courtDocsExtracted when features on.
  - POST /documents/:id/rematch — Re-run case matching only; update match_confidence, match_reason.
  - POST /documents/:id/approve — Approve routing (legacy).
  - POST /documents/:id/reject — Set routingStatus rejected.
  - POST /documents/:id/route — Route document to case (audit event, Document.routedCaseId, routingStatus).
  - POST /documents/:id/claim — Claim for review.
  - POST /documents/:id/unclaim — Unclaim.
  - GET /documents/:id/preview — Image preview (page, size); streams from storage.
  - GET /documents/:id/audit — List audit events for document.
  - GET /documents/:id/recognition — Recognition result + document (including duplicateMatchCount).

- **Cases**
  - GET /cases/:id/audit — Audit events for case.
  - GET /cases/:id/timeline-meta — Timeline metadata (last rebuilt).
  - GET /cases/:id/timeline — Timeline events (optional track filter: medical, legal, insurance).
  - POST /cases/:id/narrative — Generate narrative (type, tone, notes); demand_narratives gated; increments narrativeGenerated.
  - POST /cases/:id/rebuild-timeline — Rebuild case timeline from documents.
  - POST /cases/:id/records-requests — Create records request.
  - GET /cases/:id/records-requests — List records requests for case.
  - PATCH /records-requests/:id — Update records request.
  - GET /records-requests/:id/letter — Generated letter for request.

- **Metrics**
  - GET /metrics/review — Per-day ingested/routed counts; median time to route; top facilities/providers; queue size.

- **Mailboxes**
  - GET /mailboxes — List mailbox connections for firm.
  - GET /mailboxes/recent-ingests — Recent ingests across mailboxes.
  - GET /mailboxes/:id/recent-ingests — Recent ingests for one mailbox.
  - POST /mailboxes/:id/test — Test mailbox connection.
  - PATCH /mailboxes/:id — Update mailbox.
  - (Enable/disable may be implemented via PATCH or dedicated routes.)

### Background workers

- **Document job worker** (apps/api/src/workers/worker.ts) — Pops jobs from queue; downloads file from storage; counts pages; updates Document (pageCount, status UPLOADED, processedAt); upserts UsageMonthly (pagesProcessed, docsProcessed); runs recognition for PDFs (extract text, classify, run extractors, case match); upserts document_recognition; increments insuranceDocsExtracted/courtDocsExtracted when features on; enqueues case timeline rebuild when applicable.
- **Email ingest runner** (apps/api/src/email/emailIngestRunner.ts) — Polls IMAP for active mailboxes; fetches new messages; extracts attachments; dedupes by SHA256 per message; ingests via internal API or direct DB/storage; updates last UID per mailbox.

### AI modules

- **docRecognition** — extractTextFromPdf; classifyAndExtract (generic case number, client, date, excerpt).
- **docClassifier** — classify(text, filename) → docType, confidence (court, insurance, medical, other).
- **extractors** — runExtractors(text, docType, baseFields): insurance extractor, court extractor; return enriched fields.
- **extractors/insurance** — Insurance-specific field extraction.
- **extractors/court** — Court-specific field extraction.
- **narrativeAssistant** — generateNarrative (OpenAI); builds prompt from case timeline + extracted fields; returns text and usedEvents.

### Database (Prisma + raw PostgreSQL)

- **Prisma models** — See section 4.
- **Raw PostgreSQL** — document_recognition table (see create_recognition_table.js and code references: match_confidence, match_reason, text_excerpt, doc_type, client_name, case_number, incident_date, confidence, updated_at; optional columns in some code paths); mailbox_connections, email_messages, email_attachments (migrations).

### Scripts (apps/api/scripts)

- **bootstrap_dev.ts** — Runs Prisma migrate deploy when DATABASE_URL set; prints next steps.
- **health_check.ts** — Hits GET /health, GET /me/documents (with DOC_API_KEY); reports pass/fail; exits non-zero if API unreachable.
- **run_full_system_test.ts** — Preflight (DOC_API_URL, DOC_API_KEY, DATABASE_URL); runs health_check, test_worker_pipeline, test_metrics, db_integrity_check; prints PASS/FAIL/SKIP; exit 1 if API fail or DB fail.
- **test_worker_pipeline.ts** — Uploads test PDF via ingest; polls until processed; checks document and recognition.
- **test_metrics.ts** — Calls GET /metrics/review; validates shape.
- **db_integrity_check.ts** — Checks document_recognition exists; Prisma migrations applied; orphan audit events; etc.
- **e2e_system_test.ts** — Full E2E: health, auth (/me/documents), cases (GET /cases), documents (/me/documents), ingest (POST /ingest with test PDF), confirm document in list, timeline (GET /cases/:id/timeline); prints SYSTEM TEST RESULTS (API, AUTH, INGEST, TIMELINE, DB); exit 1 if any required check fails.
- **seed_demo_data.ts** — Seeds demo data (e.g. document_recognition rows).
- **createApiKey.ts** — Script to create API key (src/scripts).

### Other backend

- **Queue** — Document job queue (e.g. in-memory or Redis); popDocumentJob, enqueueDocumentJob.
- **Storage** — getObjectBuffer, putObject (MinIO-compatible).
- **Page count** — countPagesFromBuffer (PDF/images).
- **Auth** — authApiKey middleware: Bearer token → firmId from ApiKey.
- **Case matching** — matchDocumentToCase (document_recognition + case data).
- **Document routing** — routeDocument (audit, update Document, optional CRM).
- **Case timeline** — build/rebuild from documents and document_recognition; CaseTimelineEvent writes.

---

## 3) FRONTEND COMPONENTS

### Pages (apps/web/app)

- **app/page.tsx** — Default Next.js home (generic template).
- **app/dashboard/page.tsx** — Main dashboard: usage cards (month, pages processed, docs processed), links to Review queue, Metrics, Routing rules, Email intake; DocumentsSection; UploadBox.
- **app/dashboard/review/page.tsx** — Review queue page; loads review-queue API; ReviewQueueTable with filters, bulk actions, preview drawer.
- **app/dashboard/metrics/page.tsx** — Metrics from GET /metrics/review; per-day ingested/routed; queue size; table of daily counts.
- **app/dashboard/settings/routing/page.tsx** — Routing rules form (min confidence, auto-route enabled); uses settings/routing API.
- **app/dashboard/email/page.tsx** — Email intake UI; recent ingests; link to mailboxes.
- **app/documents/[id]/page.tsx** — Document detail: preview image, DocumentActions (recognize, route, etc.), key fields (court/insurance), activity (audit); duplicate badge when duplicateMatchCount > 0.
- **app/cases/[id]/page.tsx** — Case overview (if present).
- **app/cases/[id]/timeline/page.tsx** — Case timeline view.
- **app/cases/[id]/narrative/page.tsx** — Narrative assistant UI: type, tone, notes; generate; display result (NarrativeClient).
- **app/cases/[id]/records-requests/page.tsx** — List records requests for case.
- **app/cases/[id]/records-request/page.tsx** — Single records request (possibly detail/edit).
- **app/providers/page.tsx** — Providers list.
- **app/providers/[id]/page.tsx** — Provider detail/edit.
- **app/mailboxes/page.tsx** — Mailboxes list; link to recent ingests per mailbox.
- **app/mailboxes/[id]/recent-ingests/page.tsx** — Recent ingests for one mailbox.
- **app/admin/debug/page.tsx** — Admin debug; IngestTest component (upload test PDF, poll status, duplicate message).

### Dashboard modules

- **DocumentsSection** — Client component; fetches /api/documents with cursor; DocumentTable; Load more.
- **DocumentTable** — Table of documents (originalName, age, status, pages, created, processed); link to document; duplicate match badge when duplicateMatchCount > 0; status filter (all/stuck).
- **UploadBox** — File input, upload to /api/ingest; success/duplicate message; link to existing document when duplicate.
- **AutoRefresh** — Optional refresh for dashboard.
- **ReviewQueueTable** — Full review queue: search, confidence/status/doc-type filters, sort; checkboxes; bulk confirm/reject/route; preview drawer with confirm/reject/route; document link; SLA highlighting.
- **ReviewActions** — Per-row actions (e.g. route, confirm, reject) and suggested case label.

### Case / document / narrative

- **Document detail** — Preview, key fields (court/insurance), audit log, duplicate badge.
- **DocumentActions** — Buttons for recognize, route, etc.
- **NarrativeClient** — Narrative type/tone/notes; submit; show generated text and warnings.
- **Case timeline** — Displays timeline events (from GET /cases/:id/timeline).
- **Records requests** — List and letter view.

### API routes (Next.js, apps/web/app/api)

- **ingest** — Proxies POST to backend /ingest.
- **documents** — Proxies GET /me/documents.
- **documents/[id]/recognition** — Proxies GET /documents/:id/recognition.
- **documents/[id]/recognize** — Proxies POST /documents/:id/recognize.
- **documents/[id]/rematch** — Proxies POST /documents/:id/rematch.
- **documents/[id]/audit** — Proxies GET /documents/:id/audit.
- **documents/[id]/preview** — Proxies GET /documents/:id/preview.
- **documents/[id]/claim, unclaim** — Proxies for claim/unclaim.
- **review-queue** — Proxies GET /me/review-queue.
- **me/features** — Proxies GET /me/features (or implements from backend).
- **routing-rules** — Proxies for routing rules.
- **settings/routing** — Proxies for routing settings.
- **providers, providers/[id]** — Proxies for providers CRUD.
- **cases/[id]/timeline, timeline-meta, rebuild-timeline** — Proxies for case timeline.
- **cases/[id]/narrative** — Proxies POST /cases/:id/narrative.
- **cases/[id]/records-requests** — Proxies for records requests.
- **cases/[id]/audit** — Proxies case audit.
- **records-requests/[id], [id]/letter** — Proxies for records request and letter.
- **mailboxes, mailboxes/[id]** — Proxies for mailboxes and per-mailbox.
- **mailboxes/recent-ingests, mailboxes/[id]/recent-ingests** — Proxies for recent ingests.
- **mailboxes/[id]/test** — Proxies test connection.
- **mailboxes/[id]/enable, disable** — Enable/disable mailbox.
- **debug/ping, debug/status** — Debug endpoints.

---

## 4) DATABASE MODELS (Prisma)

- **Firm** — Tenant: id, name, plan, pageLimitMonthly, retentionDays, status, features (JSON), createdAt. Relations: users, apiKeys, documents, usageMonthly, routingRule, providers.
- **User** — id, firmId, email, role (PLATFORM_ADMIN, FIRM_ADMIN, STAFF), createdAt.
- **ApiKey** — id, firmId, userId, name, keyPrefix, keyHash, scopes, lastUsedAt, revokedAt, createdAt.
- **Document** — id, firmId, source, spacesKey, originalName, mimeType, pageCount, status (RECEIVED, PROCESSING, NEEDS_REVIEW, UPLOADED, FAILED), external_id, file_sha256, fileSizeBytes, duplicateMatchCount, ingestedAt, extractedFields, confidence, routedSystem, routedCaseId, routingStatus, createdAt, processedAt. Relations: firm, auditEvents.
- **RoutingRule** — id, firmId (unique), minAutoRouteConfidence, autoRouteEnabled, createdAt, updatedAt.
- **DocumentAuditEvent** — id, documentId, firmId, actor, action, fromCaseId, toCaseId, metaJson, createdAt.
- **UsageMonthly** — id, firmId, yearMonth (unique with firmId), pagesProcessed, docsProcessed, insuranceDocsExtracted, courtDocsExtracted, narrativeGenerated, duplicateDetected, updatedAt.
- **Provider** — id, firmId, name, address, city, state, phone, fax, email, specialtiesJson, createdAt.
- **RecordsRequest** — id, firmId, caseId, providerId, providerName, providerContact, dateFrom, dateTo, notes, status, createdAt, updatedAt.
- **CaseTimelineEvent** — id, caseId, firmId, eventDate, eventType, track (default medical), facilityId, provider, diagnosis, procedure, amount, documentId, metadataJson, createdAt.
- **CaseTimelineRebuild** — id, caseId, firmId, rebuiltAt (unique on caseId, firmId).

**Raw SQL tables (not in Prisma schema):**

- **document_recognition** — document_id (PK), text_excerpt, doc_type, client_name, case_number, incident_date, confidence, created_at, updated_at; application code also uses match_confidence, match_reason (and possibly ocr_*, facility_id in some paths).
- **mailbox_connections** — Mailbox config and status.
- **email_messages** — Email metadata.
- **email_attachments** — Attachment metadata and link to ingest document.

---

## 5) FEATURE FLAGS

- **insurance_extraction** — When on: insurance document extractor runs; doc type insurance_* allowed; review queue shows insurance doc type; usage: insuranceDocsExtracted incremented per document.
- **court_extraction** — When on: court document extractor runs; doc type court_* allowed; review queue shows court doc type; usage: courtDocsExtracted incremented per document.
- **demand_narratives** — When on: POST /cases/:id/narrative allowed; narrative generation increments narrativeGenerated.
- **duplicates_detection** — When on: ingest checks for duplicate by file_sha256 + fileSizeBytes in last 30 days for firm; if found, returns duplicate + existing id and increments UsageMonthly.duplicateDetected and Document.duplicateMatchCount on existing doc; no new document created.

Flags are stored in Firm.features (JSON array of strings). GET /me/features returns { insurance_extraction, court_extraction, demand_narratives, duplicates_detection } for the authenticated firm.

---

## 6) USAGE TRACKING

All counters are per firm per calendar month (UsageMonthly). Updated via upsert on (firmId, yearMonth).

- **pagesProcessed** — Incremented by worker when document is processed (page count added).
- **docsProcessed** — Incremented by worker when document is processed (one per doc).
- **insuranceDocsExtracted** — Incremented when recognition runs and insurance extractor is used (and insurance_extraction feature on).
- **courtDocsExtracted** — Incremented when recognition runs and court extractor is used (and court_extraction feature on).
- **narrativeGenerated** — Incremented when POST /cases/:id/narrative is called successfully (demand_narratives feature on).
- **duplicateDetected** — Incremented when ingest detects a duplicate (duplicates_detection on) and returns existing document.

GET /me/usage returns firm and usage for current month; currently returns yearMonth, pagesProcessed, docsProcessed, updatedAt (extended add-on counters may not be exposed in that response depending on implementation).

---

## 7) SYSTEM SCRIPTS

- **bootstrap_dev** — Run Prisma migrate deploy; requires DATABASE_URL; suggests next steps.
- **health_check** — Verify API (GET /health, GET /me/documents with DOC_API_KEY); exit non-zero if API unreachable.
- **run_full_system_test** — Preflight env; run health_check, test_worker_pipeline, test_metrics, db_integrity_check; report PASS/FAIL/SKIP; exit 1 if API or DB fails.
- **test_worker_pipeline** — Upload test PDF, poll until processed, assert document and recognition.
- **test_metrics** — Call GET /metrics/review; validate response.
- **db_integrity_check** — Check document_recognition exists; migrations; orphan audit events.
- **e2e_system_test** — Full E2E: health, auth, cases, documents, ingest, confirm document, timeline; print SYSTEM TEST RESULTS; exit 1 on any required failure.
- **seed_demo_data** — Insert demo data (e.g. document_recognition).
- **createApiKey** — Create API key for a firm (src/scripts).
- **create_recognition_table.js** — Standalone script to create document_recognition table (CREATE TABLE IF NOT EXISTS).

---

## 8) MISSING PIECES

- **GET /cases** — No list-cases endpoint; E2E test calls GET /cases and may fail unless the app adds this route (e.g. return empty array).
- **CRM adapter** — integrations/crmAdapter is a placeholder (noopRouteToCrm); real Clio/Litify integrations not implemented.
- **/me/usage extended fields** — Dashboard may not receive or display insuranceDocsExtracted, courtDocsExtracted, narrativeGenerated, duplicateDetected in the usage response; only yearMonth, pagesProcessed, docsProcessed confirmed in select.
- **document_recognition schema** — Created by create_recognition_table.js with a minimal set of columns; application code expects match_confidence, match_reason (and possibly more); these may be added by migrations or manual ALTER; no single Prisma migration for document_recognition.
- **Root app entry** — app/page.tsx is default Next.js template; main app entry may be /dashboard or a redirect; no explicit “doc platform home” page in app/page.tsx.
- **Playwright** — run_full_system_test mentions Playwright tests as separate (SKIP); no summary of Playwright coverage in this report.

---

## 9) ARCHITECTURE OVERVIEW

**Upload → Ingest → OCR → Classification → Case Matching → Timeline → AI Tools**

1. **Upload** — User or email ingest uploads a file (PDF/image). Web uses POST /api/ingest → backend POST /ingest (multipart, Bearer API key).

2. **Ingest** — Backend computes file SHA256 and size; if duplicates_detection is on, looks up existing document (same firm, same hash, last 30 days). If duplicate: increment duplicateDetected and duplicateMatchCount, return existing id. Otherwise: store file in object storage, create Document (RECEIVED), enqueue document job.

3. **Worker (OCR / processing)** — Job worker pops job; downloads file; counts pages; updates Document (pageCount, status UPLOADED, processedAt); upserts UsageMonthly (pagesProcessed, docsProcessed). For PDFs: extracts text (OCR), classifies doc type (medical, court, insurance, other), runs extractors when feature flags on, upserts document_recognition (text excerpt, doc type, client, case number, incident date, confidence); runs case matching → match_confidence, match_reason; increments insuranceDocsExtracted/courtDocsExtracted when applicable; may enqueue timeline rebuild.

4. **Classification** — docClassifier + generic extractor produce doc type and base fields; insurance/court extractors add structured fields when flags on; results stored in document_recognition and Document.extractedFields where used.

5. **Case matching** — matchDocumentToCase uses document_recognition and case data (e.g. case numbers, client names); suggests case and confidence; stored in document_recognition (match_confidence, match_reason). Used by review queue and auto-route (routing rule).

6. **Document routing** — User or auto-route assigns document to case: POST /documents/:id/route; audit event; Document.routedCaseId and routingStatus updated; optional CRM adapter (placeholder).

7. **Timeline** — Case timeline built from documents and document_recognition (e.g. eventDate, eventType, track); CaseTimelineEvent rows; rebuild via POST /cases/:id/rebuild-timeline. GET /cases/:id/timeline returns events (optional track filter).

8. **AI tools** — Demand narrative: user picks case, narrative type, tone, notes; POST /cases/:id/narrative builds prompt from timeline + extracted fields, calls OpenAI, returns draft; usage narrativeGenerated; gated by demand_narratives.

End-to-end: file in → stored → processed → recognized → classified → matched to case → routed → timeline updated → narrative and records requests available on case.
