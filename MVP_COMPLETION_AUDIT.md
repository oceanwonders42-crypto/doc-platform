# MVP Completion Audit — Full Report

Audit of the platform after core, provider, paperless transition, Essential/Growth/Premium, records request, and billing work. **No code changes were made;** this is a structural and integration audit only.

---

## COMPLETED AND CONNECTED

### Document pipeline
- **Ingest:** POST /ingest, POST /me/ingest, POST /me/ingest/bulk, POST /migration/import, `ingestDocumentFromBuffer` — all enforce billing status and doc limit via `canIngestDocument`; create Document and enqueue job.
- **Worker** (`apps/api/src/workers/worker.ts`): OCR → classification → extraction → case_match; sets `failureStage` and `failureReason` on failure at fetch, page_count, ocr, recognition_save, classification, extraction, case_match; increments `UsageMonthly.docsProcessed` (and pages) on success; duplicate docs skip processing.
- **Routing:** `routeDocument`, POST /documents/:id/route, auto-route in worker using `getEffectiveMinAutoRouteConfidence` when premium; review queue enter/exit; correct-routing and correct-provider admin corrections.

### Billing and plans
- **Plans:** `apps/api/src/services/billingPlans.ts` — PLAN_METADATA (Essential $499/1500 docs/$0.20, Growth $999/4000/$0.15, Premium $1999/10000/$0.10, Paperless $3500 one-time); `getDocLimitForFirm`, `canIngestDocument`, `getUsageForPeriod`, `getOverageForPeriod`, `listPlansForDisplay`.
- **Enforcement:** Doc limit checked before document create in server ingest paths and `ingestFromBuffer`; 402 with `docsProcessed`/`documentLimitMonthly` when over.
- **APIs:** GET /billing/status (usage, documentLimitMonthly, overage, planMetadata); GET /billing/plans; GET /admin/firms/:firmId/billing; PATCH /admin/firms/:firmId supports plan, pageLimitMonthly, status, documentLimitMonthly (in settings).

### Premium workflow
- **Feature:** `hasPremiumWorkflow` (plan premium/enterprise or feature `premium_workflow`); GET /me/features includes `premium_workflow`.
- **Config:** GET/PATCH /me/premium/workflow-config; stored in Firm.settings.premiumWorkflow; worker uses `getEffectiveMinAutoRouteConfidence` for auto-route threshold.
- **Bulk:** POST /me/documents/bulk-route, POST /me/documents/bulk-unroute; `bulkDocumentActions` uses `routeDocument` and `getBulkRouteLimit`; `recordPremiumEvent` for analytics hook.

### Records requests
- **Router:** Mounted at `/records-requests`; dashboard, templates CRUD, create draft, list, get, send, follow-up, complete, receive, mark-failed, cancel, attach-document; `recordsRequestService`, `recordsRequestDelivery`, `recordsRequestPdf`; `buildFirmWhere` for tenant scope.
- **Server:** POST /records-requests/:id/generate-pdf, GET /records-requests/:id/attempts (in server.ts); deliver via `deliverRecordsRequestEmail` (EMAIL only); RecordsRequest has firmId and indexes.

### Paperless transition
- **Checklist:** GET /me/paperless-transition/checklist, PATCH /me/paperless-transition/state; state in Firm.settings.paperlessTransition; `paperlessTransitionWorkflow.ts` steps and default naming.
- **Migration:** POST /migration/import, GET /migration/batches, GET /migration/batches/:batchId; `migrationIngest`, `ingestMigrationDocument`.

### Providers, cases, integrations
- **Providers:** CRUD, verify, subscription, invoices, pay-status; provider-detail, provider-management, providers list; map and aliases (/me/provider-map, /me/provider-aliases).
- **Cases:** casesRouter GET /; server has /cases/:id (HTML vs JSON by Accept), /cases/:id/documents, tasks, contacts, referrals, summary, checklist, export-packet, timeline, financial, demand-packages, etc.
- **Integrations:** /integrations router; CRM config, Clio connect/matters/mappings; webhooks; mailboxes.

### Admin and frontend
- **Admin pages:** dashboard, cases-list, case-detail, search, review-queue, document-detail, jobs, job-detail, quality, recognition-quality, routing-learning, providers, provider-detail, provider-management, demand-packages, demand-package-detail, records-request-detail, notifications.
- **Document/case HTML:** GET /documents/:id and GET /cases/:id use `req.accepts("html")` to serve document-detail.html / case-detail.html; links to /documents/:id and /cases/:id work for browser navigation.
- **API parity:** Dashboard uses /dashboard/attention, /me/analytics, /jobs/counts, /me/documents, /saved-views, /activity-feed; search uses /search; review-queue uses /me/review-queue; routing-learning uses /routing/learning-stats, /routing/patterns; records-request-detail uses /records-requests/:id, /attempts, /generate-pdf, /send.

### Feature flags and usage
- **Flags:** `hasFeature(firmId, feature)` for insurance_extraction, court_extraction, demand_narratives, duplicates_detection, crm_sync, crm_push, case_insights, growth_extraction; GET /me/features returns them plus premium_workflow.
- **Usage:** UsageMonthly (docsProcessed, pagesProcessed, insuranceDocsExtracted, courtDocsExtracted, narrativeGenerated, duplicateDetected); incremented in worker and ingest duplicate path.

---

## BUILT BUT NEEDS FIXES

### 1. Duplicate route: GET /me/overdue-tasks
- **Location:** `apps/api/src/http/server.ts` — same route registered twice (around lines **4097** and **4733**).
- **Impact:** Second registration wins; no runtime error but redundant and confusing for maintenance.
- **Fix:** Remove one of the two `app.get("/me/overdue-tasks", ...)` blocks.

### 2. Records request “follow-up” semantics
- **Dashboard card** (“Records requests needing follow-up”): Data comes from `recordsRequestsNeedingFollowUp` which is built from requests with **at least one failed send attempt** (`attempts: { some: { ok: false } }`), not from status `FOLLOW_UP_DUE` or from due date.
- **FOLLOW_UP_DUE:** Never set by the system. `recordsRequestFollowUpWorker.ts` only **reads** SENT/FOLLOW_UP_DUE and sends follow-up emails; it then sets status to SENT or FAILED (max follow-ups). No cron or job ever sets status to FOLLOW_UP_DUE when a request becomes “due” by date.
- **Impact:** Card label is misleading; “due for follow-up” by date is not implemented.
- **Fix (choose one or both):** (a) Rename dashboard card to e.g. “Records requests with failed sends” and optionally add a separate “Due for follow-up” card using dueAt + RecordsRequestFollowUpRule; (b) Add a scheduled job/cron that sets status to FOLLOW_UP_DUE when dueAt has passed and status is SENT.

### 3. Premium config: autoRouteExcludeDocTypes not applied
- **Location:** `apps/api/src/services/premiumWorkflowConfig.ts` — `PremiumWorkflowConfig.autoRouteExcludeDocTypes` is defined and accepted in PATCH /me/premium/workflow-config.
- **Gap:** Worker auto-route logic (`handleCaseMatchJob`) does not read or apply `autoRouteExcludeDocTypes`; only `minAutoRouteConfidenceOverride` is used.
- **Impact:** Config can be set but has no effect; doc-type exclusion for auto-route is not functional.
- **Fix:** In worker, after resolving doc type (or from document_recognition), call `getWorkflowConfig(firmId)` and if `autoRouteExcludeDocTypes` includes the doc type, skip auto-route (e.g. leave for review).

### 4. recognition-quality.html API_BASE
- **Location:** `apps/api/public/admin/recognition-quality.html` — `const API_BASE = window.location.origin;`
- **Other admin pages:** Use `var API_BASE = '';` (relative to current origin/path).
- **Impact:** If the app is served under a path (e.g. https://host/admin/) and API is at same origin but different path, origin-only could be wrong for API calls; relative '' is consistent with other pages.
- **Fix:** Use `var API_BASE = '';` for consistency, unless intentional for a different deployment.

---

## PARTIALLY IMPLEMENTED

### 1. Records request follow-up worker
- **Location:** `apps/api/src/workers/recordsRequestFollowUpWorker.ts` — standalone process; runs on interval (RECORDS_REQUEST_FOLLOW_UP_INTERVAL_MS or 1 hour).
- **Wired:** npm script `pnpm run records-follow-up` (from `apps/api`) runs `tsx src/workers/recordsRequestFollowUpWorker.ts`. Process runs once on startup then on the configured interval. For production, run as a long-lived process (e.g. systemd, PM2) or invoke periodically via cron. See `apps/api/tests/recordsRequests/RECORDS_REQUEST_TEST_CHECKLIST.md` §4.
- **Gap (if any):** No cron endpoint in the API that triggers it; must run as separate process.

### 2. Premium analytics
- **Location:** `apps/api/src/services/premiumAnalytics.ts` — `recordPremiumEvent` is called from bulk-route, bulk-unroute, and workflow-config PATCH.
- **Gap:** Events are only logged (console.info when not test); no DB table or export to warehouse.
- **Impact:** No historical reporting or billing integration for premium events.
- **Fix:** Add persistence (e.g. PremiumAnalyticsEvent table or external pipeline) when reporting/billing is required.

### 3. Billing / subscription provider
- **Location:** `apps/api/src/services/billingIntegration.ts` — `applySubscriptionUpdate`, `isBillingProviderConfigured()` (STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET).
- **Gap:** No Stripe (or other) webhook handler or customer/checkout implementation; Firm.billingCustomerId and plan are updated only via admin PATCH or simulate.
- **Impact:** No self-serve upgrade or automated subscription sync; trial/plan changes are manual.
- **Fix:** Add Stripe (or chosen provider) webhook route that maps subscription to plan and calls `applySubscriptionUpdate`; optional customer creation and checkout/portal.

### 4. Paperless Transition “complete” step
- **Location:** `paperlessTransitionWorkflow.ts` — step “complete” has apiHint “No API; set state to 'complete'”.
- **Gap:** PATCH /me/paperless-transition/state accepts `currentStepId: "complete"` and sets `completedAt`; no separate “sign-off” or lock; checklist is operational only.
- **Impact:** Complete is functional but could be extended with formal sign-off or export if needed.

---

## MISSING / BROKEN

### 1. Admin UI for premium workflow and billing
- **APIs exist:** GET/PATCH /me/premium/workflow-config, POST /me/documents/bulk-route, POST /me/documents/bulk-unroute; GET /billing/status, GET /billing/plans; GET /admin/firms/:firmId/billing.
- **Gap:** No admin HTML page for workflow config, bulk route/unroute, or firm billing/usage. Users must use API directly or a separate app.
- **Impact:** Premium and billing are API-only; harder for admins to operate without a proper UI.

### 2. RecordsRequest relation on Firm (schema)
- **Schema:** `Firm` model in `apps/api/prisma/schema.prisma` does not list a `recordsRequests RecordsRequest[]` relation, while `RecordsRequest` has `firmId` and indexes.
- **Impact:** Prisma client may not expose `firm.recordsRequests`; queries use `buildFirmWhere(firmId)` so no functional bug, but schema is incomplete for relations.
- **Fix:** Add `recordsRequests RecordsRequest[]` to Firm model if you want Prisma relations for RecordsRequest from Firm.

### 3. Document merge response link (dashboard)
- **Location:** `apps/api/public/admin/dashboard.html` — after merge, link is built as `var link = '/documents/' + data.document.documentId;`
- **Verification:** `documentMerge.ts` returns `MergeDocumentsResult` with `documentId`; server sends `{ ok: true, document: result }`, so `data.document.documentId` is correct. No change needed.

---

## TRIAL-BLOCKING ISSUES

### 1. None that fully block trial usage
- **Billing:** Ingest returns 402 when billingStatus is not active/trial or trial expired; doc limit enforced. Manual admin can set plan and billingStatus (or use billing/simulate/upgrade in dev). So trials can run if an admin sets status.
- **Auth/session:** Login, auth/me, requireRole, firmId from token — no obvious gap that would prevent a trial user from using the app once firm and user exist.

### 2. Possible trial friction (polish)
- **Records follow-up:** If the firm expects “automatic follow-up” and the follow-up worker is not run, they may think the feature is broken.
- **Dashboard “follow-up” label:** Misleading label could cause support questions.
- **No Stripe:** Cannot self-serve upgrade; depends on “manual trial” workflow.

---

## RECOMMENDED NEXT FIX ORDER

1. **Remove duplicate GET /me/overdue-tasks** — Single edit in `server.ts`; eliminates redundancy and confusion.
2. **Clarify or implement records “follow-up”** — Either rename dashboard card to “Records requests with failed sends” or add a job that sets FOLLOW_UP_DUE by dueAt and keep the card as “needing follow-up”; then ensure `recordsRequestFollowUpWorker` is run (script + docs or cron).
3. **Apply autoRouteExcludeDocTypes in worker** — Read config in handleCaseMatchJob; skip auto-route when doc type is in exclude list.
4. **Align recognition-quality.html API_BASE** — Use `API_BASE = ''` unless deployment requires otherwise.
5. **Wire records request follow-up worker** — Add npm script and/or call from a cron endpoint so follow-ups run in production.
6. **Admin UI for premium and billing** — Add at least one admin page for workflow config + bulk actions, and one for firm billing/usage (or document that these are API-only for now).
7. **Optional: Firm.recordsRequests relation** — Add to Prisma schema if you want full relation from Firm to RecordsRequest.
8. **Optional: Firm.recordsRequests relation** — Add to Prisma schema if you want full relation from Firm to RecordsRequest.

---

## FILE REFERENCE (key areas)

| Area | Files |
|------|--------|
| Billing | `apps/api/src/services/billingPlans.ts`, `billingIntegration.ts`; server.ts (billing/status, billing/plans, admin/firms/:id/billing, canIngestDocument at ingest) |
| Premium | `apps/api/src/services/featureFlags.ts` (hasPremiumWorkflow), `premiumWorkflowConfig.ts`, `bulkDocumentActions.ts`, `premiumAnalytics.ts`; server.ts (premium routes); worker.ts (getEffectiveMinAutoRouteConfidence) |
| Records requests | `apps/api/src/http/routes/recordsRequests.ts`, `recordsRequestService.ts`, `recordsRequestDelivery.ts`, `recordsRequestPdf.ts`; server.ts (generate-pdf, attempts); `recordsRequestFollowUpWorker.ts` |
| Paperless | `apps/api/src/services/paperlessTransitionWorkflow.ts`; server.ts (/me/paperless-transition/*, /migration/*) |
| Worker pipeline | `apps/api/src/workers/worker.ts` (handleOcrJob, handleClassificationJob, handleExtractionJob, handleCaseMatchJob; failureStage set at fetch, page_count, ocr, recognition_save, classification, extraction, case_match) |
| Admin HTML | `apps/api/public/admin/*.html`; server.ts (sendFile for document-detail, case-detail, dashboard, etc.) |
| Tenant/auth | `apps/api/src/lib/tenant.ts` (buildFirmWhere, requireFirmIdFromRequest, forbidCrossTenantAccess) |
