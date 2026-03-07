# Essential Tier — End-to-End Flow

This document describes the **Essential** plan as a complete, testable flow from upload to organization. Essential does not depend on paid add-on features; all core steps work with the base product (plan `starter` or `essential`, no `Firm.features` required).

---

## 1. Essential includes (what actually works)

| Capability | Implementation | Notes |
|------------|----------------|--------|
| **AI document reading** | OCR pipeline (`runOcrPipeline`), text stored in `document_recognition.text_excerpt` | PDF only; non-PDF gets page count and status UPLOADED without classification |
| **Document classification** | `classifyOnyx` + `onyxToLegacyDocType` in worker; doc_type in `document_recognition` | Without `insurance_extraction`/`court_extraction`, insurance/court types become `other` |
| **Smart renaming** | `renameDocumentInStorage` after classification; uses doc type, provider, date | Optional; failure is logged, pipeline continues |
| **Basic routing** | `matchDocumentToCase` + optional auto-route (RoutingRule.minAutoRouteConfidence, autoRouteEnabled) | Manual route always available via POST /documents/:id/route |
| **Review queue** | Docs with status NEEDS_REVIEW, UNMATCHED, FAILED, or UPLOADED with routingStatus needs_review | GET /me/review-queue; POST /documents/:id/route to assign case |
| **Basic provider recognition** | `extractProviderFromText`, `resolveProvider`, suggested_provider_id in document_recognition | Provider–case linking when doc is routed |
| **Provider-to-case linking** | `ensureProviderCaseLinkFromDocument` in documentRouting; CaseProvider table | Runs on route (manual or auto) |
| **Dashboard visibility** | GET /me/queue-status, GET /me/needs-attention, GET /me/documents, GET /me/metrics-summary | Counts by status, failed docs, overdue tasks |
| **Basic workflow automation** | Pipeline: OCR → classification → extraction → case_match; auto-route when confidence ≥ threshold | Optional auto-create case (Firm.settings.autoCreateCaseFromDoc) |

---

## 2. End-to-end flow (Essential)

1. **Upload**  
   - **POST /me/ingest** (single file) or **POST /me/ingest/bulk** (multiple).  
   - Document created with status `RECEIVED`, job enqueued (OCR).

2. **Processing**  
   - Worker: **OCR** → status `SCANNED`, enqueue classification.  
   - **Classification** → doc_type, client/case number, provider (if any), status `CLASSIFIED`, smart rename attempted, enqueue extraction.  
   - **Extraction** → insights/summary/risks, provider resolution, status stays; enqueue case_match.  
   - **Case match** → suggested_case_id, match_confidence; if auto-route on and confidence ≥ threshold → **route** and status `ROUTED`; else status `NEEDS_REVIEW` (or `UNMATCHED` if no match).

3. **Review**  
   - **GET /me/review-queue** — list of docs needing review (NEEDS_REVIEW, UNMATCHED, FAILED, or UPLOADED with needs_review).  
   - **POST /documents/:id/route** — body `{ caseId }` to assign (or omit to unroute).  
   - **PATCH /documents/:id/recognition** — correct doc type, provider name, client/case number.  
   - **POST /documents/:id/correct-routing** | **correct-provider** | **PATCH export-overrides** — admin corrections (audited).

4. **Organization**  
   - Routed docs appear on case; **provider-to-case** link created when provider is resolved.  
   - **GET /cases/:id** (or case documents) — documents for the case.  
   - Export naming: **GET /me/export-naming**, **PATCH /me/export-naming**; **GET /documents/:id/export-preview** for file/folder preview.

5. **Failures**  
   - Pipeline failures set status `FAILED`, `failureStage`, `failureReason`.  
   - **GET /me/needs-attention** includes recent failed docs with failureStage/failureReason.  
   - **GET /me/review-queue** and **GET /me/documents** include failureStage/failureReason; document detail **GET /documents/:id** exposes errors/pipelineStage/failureReason for FAILED docs.

---

## 3. Cross-stage integration

- **Ingest** → always enqueues OCR (no feature gate for pipeline start).  
- **OCR** → on success enqueues **classification** (not extraction directly).  
- **Classification** → enqueues **extraction**; insurance/court doc types downgraded to `other` when features off.  
- **Extraction** → enqueues **case_match**.  
- **Case match** → either auto-routes (and sets ROUTED + timeline + provider link) or sets NEEDS_REVIEW/UNMATCHED and records suggested_case_id for UI.  
- **Manual route** → `routeDocument` updates document, writes audit, rebuilds timeline, ensures provider–case link.

No critical step depends on an unfinished higher-tier feature: insurance/court extraction and duplicate detection are additive; CRM sync/push and narratives are optional.

---

## 4. Dashboard and review consistency

- **GET /me/queue-status** — Redis pending count + firm job counts (for “in progress” visibility).  
- **GET /me/needs-attention** — unmatched count, failed docs (with failureStage/failureReason), overdue tasks, etc.  
- **GET /me/review-queue** — paginated list with recognition, suggested case, failure info; same docs that need staff action.  
- **GET /me/documents** — all firm docs with status, failureStage, failureReason, processingStage.  
- **GET /me/features** — which add-ons are on (Essential = all false); UI can hide premium-only actions.

---

## 5. Failure and review states

- **FAILED** — pipeline error; failureStage (e.g. fetch, ocr, classification, extraction, case_match), failureReason and metaJson.pipelineError.  
- **NEEDS_REVIEW** — processing complete; suggested case may exist; staff routes or corrects.  
- **UNMATCHED** — no case match; staff creates case and routes or uses auto-create if enabled.  
- **UPLOADED** (routed) — manually or auto-routed to a case.  
- **ROUTED** — auto-routed by worker (same meaning as “on a case” for display).

All of these are returned in list/detail with enough context (failureStage, failureReason, suggestedCaseId, matchConfidence) so the UI can show clear messages and next actions.

---

## 6. What Essential does not promise

- **Insurance/court extraction** — requires features `insurance_extraction`, `court_extraction`; otherwise those doc types become `other`.  
- **Duplicate detection** — requires `duplicates_detection`; without it, duplicate uploads are not deduplicated.  
- **CRM sync / Clio push** — requires `crm_sync` / `crm_push`; routing and organization still work without them.  
- **Demand narratives / case insights** — require `demand_narratives`, `case_insights`; not required for upload → review → organize.

---

## 7. Files and endpoints (quick reference)

| Area | Location / endpoint |
|------|---------------------|
| Ingest | POST /me/ingest, POST /me/ingest/bulk; ingestFromBuffer, server.ts |
| Pipeline | worker.ts (handleOcrJob → handleClassificationJob → handleExtractionJob → handleCaseMatchJob) |
| Routing | documentRouting.ts; POST /documents/:id/route, POST /documents/:id/correct-routing |
| Provider linking | providerCaseLinking.ts (ensureProviderCaseLinkFromDocument from documentRouting) |
| Review queue | GET /me/review-queue; POST /documents/:id/route, PATCH /documents/:id/recognition |
| Corrections | adminCorrections.ts; POST correct-provider, PATCH export-overrides; PATCH recognition (audit) |
| Dashboard | GET /me/queue-status, /me/needs-attention, /me/documents, /me/metrics-summary, /me/features |
| Failure visibility | failureStage, failureReason on document; needs-attention, review-queue, document detail |

---

## 8. Status: end-to-end Essential flow

- **Upload → process → review → correct → organize** is implemented and does not depend on paid add-ons.  
- Failures surface via status FAILED plus failureStage/failureReason in queue, dashboard, and document detail.  
- Review queue and dashboard are aligned (same statuses and failure info).  
- **Remaining blockers:** None critical. Optional: align “ROUTED” vs “UPLOADED” in UI copy (both mean “on a case”); ensure front-end uses /me/features to hide premium-only actions so Essential only promises what actually works.
