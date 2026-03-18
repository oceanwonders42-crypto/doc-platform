# MVP Handoff

This document is the handoff summary for the active local MVP.

## Active Product Shape

- API source of truth: `apps/api`
- Active web app used in local MVP runs: `apps/web`
- Normal local ports:
  - API: `http://127.0.0.1:4000`
  - Web: `http://127.0.0.1:3000`

## What Is Working

- Single-file intake through the active web app
- Batch upload with per-file status and duplicate handling
- Ingest to OCR/recognition/extraction on the normal local stack
- Review entry with durable review states:
  - `IN_REVIEW`
  - `APPROVED`
  - `REJECTED`
  - `EXPORT_READY`
- Manual case creation with persisted structured contact data
- Normalized records-request lifecycle
- Case-scoped exports:
  - contacts CSV
  - matters CSV
  - packet export
- Export packet gating by durable `EXPORT_READY` document state

## Source Of Truth By Workflow

- Upload and intake:
  - API: `apps/api/src/http/server.ts`
  - Worker handoff: `apps/api/src/services/queue.ts`
  - Active web UI: `apps/web/app/dashboard/DocumentsSection.tsx`
- Processing worker:
  - `apps/api/src/workers/documentWorkerLoop.ts`
  - local inline startup in `apps/api/src/http/server.ts`
- Review:
  - API queue/actions: `apps/api/src/http/server.ts`
  - Active web UI: `apps/web/app/dashboard/review/page.tsx`
  - Document detail actions: `apps/web/app/documents/[id]/DocumentActionCenter.tsx`
- Cases and contacts:
  - `apps/api/src/http/routes/cases.ts`
  - `apps/api/src/http/routes/contacts.ts`
  - Active web create flow: `apps/web/app/cases/new/page.tsx`
- Records requests:
  - `apps/api/src/http/routes/recordsRequests.ts`
  - Compatibility case-scoped shim remains in `apps/api/src/http/server.ts`
  - Active web flow: `apps/web/app/records-requests`
- Exports:
  - Case-scoped API endpoints in `apps/api/src/http/routes/cases.ts`
  - CSV generation in `apps/api/src/exports/clioExport.ts`
  - Packet engine in `apps/api/src/services/export`
  - Active web actions: `apps/web/app/cases/[id]/CaseExportActions.tsx`

## Local Run

From `apps/api`:

```bash
pnpm run bootstrap:dev
pnpm dev
```

From `apps/web`:

```bash
pnpm dev
```

Recommended quick checks:

```bash
pnpm run doctor
curl -s http://127.0.0.1:4000/health
curl -s http://127.0.0.1:3000/healthz
```

## Required Env

API `.env` must have working values for at least:

- `DATABASE_URL`
- `REDIS_URL`

`WEB_APP_PATH` is optional in the canonical repo layout because `pnpm run doctor` defaults to `apps/web`.

Web `.env.local` must have:

- `DOC_API_URL=http://127.0.0.1:4000`
- `DOC_API_KEY=<working local API key>`

## Real Email Sending

Core MVP flows do not require live outbound email, but real send delivery does.

The active email send path is:

- route: `apps/api/src/http/routes/recordsRequests.ts`
- service: `apps/api/src/services/recordsRequestSend.ts`
- adapter: `apps/api/src/send/adapters/smtpEmailAdapter.ts`

Required SMTP env for real outbound email:

- `SMTP_HOST`

Usually needed for authenticated SMTP:

- `SMTP_PORT`
- `SMTP_SECURE`
- `SMTP_USER`
- `SMTP_PASS`
- `SMTP_FROM`

Behavior:

- successful send persists `status: SENT`, `sentAt`, `requestDate`, and a `SENT` event
- transport failure persists `status: FAILED` and a `FAILED` event
- without SMTP env, records-request send returns a clear configuration error instead of silently failing

Fax is not a real outbound path yet:

- `apps/api/src/send/adapters/faxAdapter.ts` is still a stub

## Main Operator Flow

1. Upload one file or a batch from `/dashboard`
2. Wait for the document to enter review
3. Approve, reject, route, or mark export-ready
4. Create a case manually when needed
5. Create and manage records requests from the case or records-request views
6. Export contacts, matters, or packet bundle from the case page

## Known Non-Blocking Caveats

- Live outbound email delivery still depends on SMTP env setup on the machine where the API runs.
- Fax sending is not implemented yet; email is the only real outbound records-request channel today.
- Some compatibility routes remain intentionally for older callers:
  - case-scoped records-request URLs in `apps/api/src/http/server.ts`
- Runtime normalization/fallback helpers still exist for safety, but cleaned local data should no longer depend on them as the primary path.

## Verified MVP Scope

The following were verified on the normal local stack:

- upload/intake
- batch upload
- duplicate detection
- OCR/recognition/extraction progression
- review entry
- durable review transitions
- manual case creation with structured contact persistence
- normalized records-request create/update/receive lifecycle
- contacts CSV export
- matters CSV export
- packet export with `EXPORT_READY` gating

Transport-specific verification completed in this repo state:

- draft creation through the normalized records-request API
- send attempt through the active `/records-requests/:id/send` path
- clear failure result when SMTP env is absent
- persistence of `FAILED` state after transport failure

Real outbound success has not been verified in this repo state because no SMTP credentials are configured on this machine.
