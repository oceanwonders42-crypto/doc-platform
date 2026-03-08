# Records Request Automation — Implementation Report

## Summary

End-to-end EMAIL-based records request workflow: law firms can create draft requests from case + provider, send request emails with letter PDF and attachments, track status, run follow-up automation, and attach returned documents to the correct request. Tenant isolation is enforced throughout; firmId is never taken from the request body.

---

## Part 1 — Prisma models

**Extended**
- **RecordsRequest**: Added fields `patientName`, `patientDob`, `dateOfLoss`, `requestType`, `destinationType`, `destinationValue`, `subject`, `messageBody`, `requestedDateFrom`, `requestedDateTo`, `sentAt`, `dueAt`, `completedAt`, `createdByUserId`, `followUpCount`, `lastFollowUpAt`. Default `status` set to `DRAFT`. Relations: `attachments`, `events`. Indexes: `[firmId, providerId]`, `[firmId, status]`, `[firmId, dueAt]`, `[firmId, createdAt]` (existing `[firmId, caseId]` kept).

**Added**
- **RecordsRequestAttachment**: `id`, `firmId`, `recordsRequestId`, `documentId`, `kind` (AUTHORIZATION | LETTER | SUPPORTING_DOC | RESPONSE_DOC), `createdAt`. Indexes on `firmId`, `recordsRequestId`.
- **RecordsRequestEvent**: `id`, `firmId`, `recordsRequestId`, `eventType`, `status`, `message`, `metaJson`, `createdAt`. Indexes on `firmId`, `recordsRequestId`, `createdAt`.
- **RecordsRequestTemplate**: `id`, `firmId`, `name`, `requestType`, `subject`, `body`, `isDefault`, `createdAt`, `updatedAt`. Index on `firmId`.
- **RecordsRequestFollowUpRule**: `id`, `firmId`, `enabled`, `daysAfterSend`, `maxFollowUps`, `messageTemplate`, `createdAt`, `updatedAt`. Index on `firmId`.

**Migration**
- `apps/api/prisma/migrations/20260306000003_records_request_automation/migration.sql` — run with `npx prisma migrate deploy` (or `prisma migrate dev` with DATABASE_URL set).

---

## Part 2 — API routes

**Location:** `apps/api/src/http/routes/recordsRequests.ts`  
**Mount:** `app.use("/records-requests", recordsRequestsRouter)` in `server.ts`.

**Routes (all require auth + STAFF; firmId from token only):**
- `GET /records-requests/dashboard` — summary counts: open, sent, followUpDue, received, failed, completedThisWeek.
- `GET /records-requests/templates` — list templates for firm.
- `POST /records-requests/templates` — create template (name required).
- `PATCH /records-requests/templates/:id` — update template.
- `POST /records-requests` — create draft (body: caseId, providerId?, requestType?, destinationType?, destinationValue?, subject?, messageBody?, requestedDateFrom/To?, patientName?, etc.).
- `GET /records-requests` — list with query filters: caseId, providerId, status, requestType.
- `GET /records-requests/:id` — single request with attachments and events (tenant-safe).
- `POST /records-requests/:id/send` — generate letter PDF, send email, set SENT, create event.
- `POST /records-requests/:id/follow-up` — send follow-up email, increment followUpCount, create event.
- `POST /records-requests/:id/complete` — set status COMPLETED, completedAt.
- `POST /records-requests/:id/cancel` — set status CANCELLED.
- `POST /records-requests/:id/attach-document` — body: documentId, kind (AUTHORIZATION | LETTER | SUPPORTING_DOC | RESPONSE_DOC).

---

## Part 3 — Request generation service

**File:** `apps/api/src/services/recordsRequestService.ts`

- **createRecordsRequestDraft**: Validates firmId/caseId; loads case, provider (optional), and firm’s follow-up rule; builds default subject/body by requestType (RECORDS | BILLS | BOTH); sets destination from provider email/fax when possible; computes dueAt from rule or 14 days; creates RecordsRequest and CREATED event.
- **validateForSend**: Ensures request is DRAFT/FAILED/FOLLOW_UP_DUE, has message body, and valid destination (email format for EMAIL, non-empty for FAX).
- **getRequestWithRelations**: Returns request with attachments and events (for tenant-scoped GET :id).

---

## Part 4 — Email delivery service

**File:** `apps/api/src/services/recordsRequestDelivery.ts`

- **deliverRecordsRequestEmail**: Loads request and attachments; builds subject/body; for EMAIL destination only, collects letter PDF buffer (from caller) and attachment docs (AUTHORIZATION, SUPPORTING_DOC, LETTER) from storage; calls sendAdapter.sendEmail; on failure creates FAILED event and sets status FAILED; on success returns ok.

---

## Part 5 — Request letter PDF

**File:** `apps/api/src/services/recordsRequestPdf.ts`

- **generateAndStoreRecordsRequestLetter**: Uses existing `buildRecordsRequestLetterPdf` (recordsLetterPdf.ts) with firm/case/provider and request fields; stores PDF under tenant-safe key `${firmId}/records_request/${timestamp}_${random}.pdf`; creates Document and optionally RecordsRequestAttachment kind LETTER; updates request.generatedDocumentId.

---

## Part 6 — Follow-up automation worker

**File:** `apps/api/src/workers/recordsRequestFollowUpWorker.ts`

- Runs on interval (default 1 hour; `RECORDS_REQUEST_FOLLOW_UP_INTERVAL_MS`).
- For each enabled RecordsRequestFollowUpRule, finds SENT/FOLLOW_UP_DUE requests with sentAt set and (dueAt ≤ now or lastFollowUpAt set).
- If followUpCount ≥ maxFollowUps: sets status FAILED, creates event.
- Otherwise, if days since send ≥ daysAfterSend (and days since last follow-up ≥ daysAfterSend): sends follow-up email, increments followUpCount, sets lastFollowUpAt, creates FOLLOW_UP_SENT or FAILED event.

**Run:** `npx ts-node src/workers/recordsRequestFollowUpWorker.ts` (or equivalent in your process manager).

---

## Part 7 — Inbound response linking

**File:** `apps/api/src/services/recordsRequestResponseMatcher.ts`

- **tryMatchDocumentToRecordsRequest**: Input firmId, documentId, optional caseId, providerId, patientName, referenceTokens. Requires caseId or providerId to match (avoids attaching to wrong request). Finds open requests (SENT, FOLLOW_UP_DUE, RECEIVED) for firm/case/provider; optionally filters by patient name; creates RecordsRequestAttachment kind RESPONSE_DOC, RESPONSE_RECEIVED event, sets status RECEIVED.

**Hooks:**
- **Email ingestion** (`emailIngestion.ts`): After successful ingest, calls matcher with firmId, documentId, referenceTokens (subject). Matcher returns without attaching when caseId/providerId are missing (routing not yet done).
- **Routing pipeline**: For full linking when a document is routed to a case, call `tryMatchDocumentToRecordsRequest({ firmId, documentId, caseId: doc.routedCaseId, providerId?, patientName? })` where document gets its routedCaseId (e.g. after routeDocument or manual case assignment). This hook is not added inside routeDocument to avoid touching recognition logic; it can be added in one place where documents are updated with routedCaseId.

---

## Part 8 — Frontend pages

**Base path:** `apps/web/app/dashboard/records-requests/`

1. **page.tsx** — Dashboard: summary cards (open, sent, followUpDue, received, failed, completedThisWeek); table of requests with filters (status, caseId, providerId); “New Request” button; links to detail.
2. **new/page.tsx** — New request: case (required) and provider (optional) select; request type (RECORDS | BILLS | BOTH); date range; destination type and value; subject and body; “Save draft” and “Send now” (create then send).
3. **[id]/page.tsx** — Detail: summary, status badge, provider/case/destination, message body, attachments list, event timeline; “Send follow-up” and “Mark completed” when applicable.

API calls use `window.__API_BASE` and `window.__API_KEY`; cases from `GET /cases` (items), providers from `GET /providers` (items).

---

## Part 9 — Case page integration

**URL prefill (implemented):** The new-request page reads query params and prefills the form:

- `?caseId=<id>` — preselects the case
- `?providerId=<id>` — preselects the provider (and destination email/fax when applicable)
- `?requestType=RECORDS|BILLS|BOTH` — sets request type

From a case or provider UI you can link to:

- **Request Updated Records:** `/dashboard/records-requests/new?caseId=<caseId>&providerId=<providerId>&requestType=RECORDS`
- **Request Updated Bills:** same with `requestType=BILLS`
- **Request Both:** same with `requestType=BOTH`

The web app does not yet have dedicated case or provider detail pages. When those exist, add buttons or links that use the URLs above; no further backend changes are required.

---

## Part 10 — Provider page integration

**Quick action URL:** When provider pages exist, add a “New request” link that goes to  
`/dashboard/records-requests/new?providerId=<id>` (and optionally `caseId=<id>`). The new-request page prefills provider and destination from the URL.

**Recent requests:** To show “recent requests for this provider”, use `GET /records-requests?providerId=<id>` (already supported). Provider destination email/fax can be shown from the provider record; the request detail page already shows destination.

---

## Part 11 — Tenant isolation

- Every RecordsRequest (and attachment, event, template, follow-up rule) query is scoped by `buildFirmWhere(firmId)` or equivalent; firmId is taken from `requireFirmIdFromRequest(req, res)` (auth context), never from body.
- `forbidCrossTenantAccess` is used on mutating/list routes; `assertRecordBelongsToFirm` on get-one; 404/safe denial for cross-firm access.
- New models (RecordsRequestAttachment, RecordsRequestEvent, RecordsRequestTemplate, RecordsRequestFollowUpRule) are included in audit’s TENANT_SCOPED_MODELS.

---

## Part 12 — Audit integration

**File:** `scripts/full_audit.js`

- **suspiciousPartials**: RecordsRequest model vs routes now accepts `recordsRequests` route name; added: RecordsRequest routes exist but dashboard page missing; RecordsRequestFollowUpRule exists but follow-up worker missing; RecordsRequest exists but PDF service missing.
- **TENANT_SCOPED_MODELS**: Added RecordsRequestAttachment, RecordsRequestEvent, RecordsRequestTemplate, RecordsRequestFollowUpRule.

---

## Part 13 — Testing

- **API tests**: Not added in this repo (no existing records-request test file). Recommended manual/automated checks:
  1. Create draft request (POST /records-requests with caseId, firmId from auth).
  2. Send request (POST /records-requests/:id/send) — expect SENT and event.
  3. Attach document (POST /records-requests/:id/attach-document with documentId, kind AUTHORIZATION).
  4. Follow-up worker: run worker with a SENT request past dueAt; expect follow-up email and event.
  5. Response matcher: call tryMatchDocumentToRecordsRequest with firmId, documentId, caseId; expect RESPONSE_DOC attachment and RECEIVED.
  6. Firm A cannot access Firm B request: GET/PATCH with other firm’s id returns 404.
  7. Dashboard counts: GET /records-requests/dashboard returns only current firm’s counts.

- **Checklist** (for maintainers): See above; add integration tests when test framework is in place.

---

## Part 14 — Known gaps

- **FAX / PORTAL / MANUAL**: Only EMAIL delivery is implemented. Destination types FAX, PORTAL, MANUAL are stored and shown in UI but send and follow-up use email only; fax/portal would require additional adapters and flows.
- **Case/Provider UI**: “Request Updated Records / Bills / Both” can be linked from any case or provider context using URL prefill (see Part 9). Dedicated case/provider pages in the web app do not exist yet; when added, link to the new-request page with `?caseId=...&providerId=...&requestType=...`.
- **Templates UI**: Templates API is implemented; dashboard UI does not yet offer template picker in the new-request form.
- **Response linking on route**: Automatic call to `tryMatchDocumentToRecordsRequest` when a document is assigned to a case (routedCaseId set) is not added; recommended as a single hook in the routing/assignment path.

---

## Files touched/added

| Area | Path |
|------|------|
| Prisma | `apps/api/prisma/schema.prisma` (extended RecordsRequest; added 4 models) |
| Migration | `apps/api/prisma/migrations/20260306000003_records_request_automation/migration.sql` |
| API routes | `apps/api/src/http/routes/recordsRequests.ts` |
| Server mount | `apps/api/src/http/server.ts` (import + app.use) |
| Services | `recordsRequestService.ts`, `recordsRequestDelivery.ts`, `recordsRequestPdf.ts`, `recordsRequestResponseMatcher.ts` |
| Worker | `apps/api/src/workers/recordsRequestFollowUpWorker.ts` |
| Email hook | `apps/api/src/services/emailIngestion.ts` (optional matcher call) |
| Frontend | `apps/web/app/dashboard/records-requests/page.tsx`, `new/page.tsx`, `[id]/page.tsx` |
| Audit | `scripts/full_audit.js` (suspiciousPartials + TENANT_SCOPED_MODELS) |
| Report | `docs/RECORDS_REQUEST_AUTOMATION_REPORT.md` |

Existing `recordsRequestSend.ts` and `recordsLetterPdf.ts` are unchanged except that the new flow uses the new services (recordsRequestPdf, recordsRequestDelivery) and event model; the old send path can remain for backward compatibility.
