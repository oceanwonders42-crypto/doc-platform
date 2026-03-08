# Records Request Automation — Test Checklist

Run API with a valid database and (optionally) seed data. Use same API_URL and seed-output as tenant tests if available.

## 1. Create draft request

- **Request:** `POST /records-requests` with `Authorization: Bearer <firm API key>`, body: `{ "caseId": "<valid case id>" }`.
- **Expect:** 201, `ok: true`, `request.id`, `request.status === "DRAFT"`.
- **Optional:** Include `providerId`, `requestType`, `destinationType`, `destinationValue`, `subject`, `messageBody`.

## 2. Send request

- **Prereq:** Draft with `messageBody` and `destinationType: "EMAIL"`, `destinationValue` valid email.
- **Request:** `POST /records-requests/:id/send`.
- **Expect:** 200, `ok: true`, `request.status === "SENT"`, `request.sentAt` set. Event log has SENT.

## 3. Attach authorization document

- **Request:** `POST /records-requests/:id/attach-document` with body `{ "documentId": "<firm document id>", "kind": "AUTHORIZATION" }`.
- **Expect:** 201, `ok: true`, `attachment.kind === "AUTHORIZATION"`, request.attachments includes it.

## 4. Follow-up worker

- Create a follow-up rule (RecordsRequestFollowUpRule) for the firm with `enabled: true`, `daysAfterSend: 0` (or 1), `maxFollowUps: 3`.
- Create a SENT request with `sentAt` in the past.
- **Run worker:** From `apps/api`, run `pnpm run records-follow-up`. This starts the follow-up worker process (tsx src/workers/recordsRequestFollowUpWorker.ts). It runs once on startup then every `RECORDS_REQUEST_FOLLOW_UP_INTERVAL_MS` ms (default 1 hour). For production, run it as a separate long-lived process (e.g. systemd, PM2, or a cron that invokes the script periodically).
- **Expect:** Request gets follow-up email (if SMTP configured), `followUpCount` incremented, FOLLOW_UP_SENT event.

## 5. Response matcher

- **Request:** Call service `tryMatchDocumentToRecordsRequest({ firmId, documentId, caseId: <routed case id> })` (e.g. from a test script or after routing a document to a case).
- **Expect:** `matched: true`, `attached: true`; request has new RESPONSE_DOC attachment and status RECEIVED (if implementation sets it).

## 6. Firm A cannot access Firm B request

- Create a records request as Firm A (POST with key A), get `id`.
- **Request:** `GET /records-requests/:id` with Firm B API key (same id).
- **Expect:** 404 (or 403). Same for PATCH, POST send, etc.

## 7. Dashboard counts scoped to firm

- **Request:** `GET /records-requests/dashboard` with Firm A key.
- **Expect:** 200, counts (open, sent, followUpDue, etc.) reflect only Firm A’s requests.

## Running tenant + records-request tests

- Seed: `pnpm exec tsx tests/seedTenantData.ts`
- Start API: `pnpm dev` (or your start command)
- Tenant tests: `pnpm exec tsx tests/tenantIsolation/runTenantIsolation.ts`
- Records-request isolation: `pnpm exec tsx tests/recordsRequests/runRecordsRequestTests.ts` (if added)
