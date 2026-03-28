# Demo Deployment

This document captures the minimum runtime shape for the current MVP demo environment.

## Runtime Requirements

### Required for core app startup

- API process from `apps/api`
- Web process from `apps/web`
- PostgreSQL reachable from `DATABASE_URL`
- Redis reachable from `REDIS_URL`
- S3-compatible object storage reachable from:
  - `S3_ENDPOINT`
  - `S3_ACCESS_KEY`
  - `S3_SECRET_KEY`
  - `S3_BUCKET`
  - `S3_REGION` if not using the default

### Required for the core workflow

- A working API key for the web app:
  - web env: `DOC_API_URL`
  - web env: `DOC_API_KEY`
- Document worker capacity:
  - local dev/demo mode can rely on the inline worker started by `apps/api/src/http/server.ts`
  - production-style demo deployments should run a separate worker process

### Required only for outbound email sending

- `SMTP_HOST`
- Usually also:
  - `SMTP_PORT`
  - `SMTP_SECURE`
  - `SMTP_USER`
  - `SMTP_PASS`
  - `SMTP_FROM`

## Recommended Demo Process Model

### Local demo-style stack

- API: `cd apps/api && pnpm dev`
- Web: `cd apps/web && pnpm dev`

This is the simplest validated demo setup because the API starts the inline document worker when not running in production.

### Production-style demo stack

- API:

```bash
cd apps/api
pnpm build
pnpm start
```

- Worker:

```bash
cd apps/api
node dist/workers/worker.js
```

- Web:

```bash
cd apps/web
pnpm build
pnpm start
```

## Env By Category

### API env used by the validated MVP path

- `PORT`
- `DATABASE_URL`
- `REDIS_URL`
- `S3_ENDPOINT`
- `S3_ACCESS_KEY`
- `S3_SECRET_KEY`
- `S3_BUCKET`
- `S3_REGION`
- `DOC_WEB_BASE_URL` is recommended for links generated back to the web app

### Web env used by the validated MVP path

- `DOC_API_URL`
- `DOC_API_KEY`

### Optional but useful

- `OPENAI_API_KEY`
  - improves summary/extraction quality
  - not required for the validated MVP workflow to function
- `PLATFORM_ADMIN_API_KEY`
  - admin/onboarding only
  - not required for the core demo workflow

## SMTP Notes

Active send path:

- route: `apps/api/src/http/routes/recordsRequests.ts`
- service: `apps/api/src/services/recordsRequestSend.ts`
- adapter: `apps/api/src/send/adapters/smtpEmailAdapter.ts`

Behavior:

- success persists `SENT`, `sentAt`, `requestDate`, and a `SENT` event
- transport failure persists `FAILED` and a `FAILED` event
- fax is still not implemented for real delivery

For demo verification without external credentials, a local SMTP sink on `127.0.0.1:1025` is sufficient to exercise the real SMTP adapter.

For external delivery, replace the local sink with real provider credentials.

## Validated Environment

Validated in this repo state:

- normal local web app on `http://127.0.0.1:3000`
- temporary SMTP-backed API on `http://127.0.0.1:4001`
- local SMTP sink on `127.0.0.1:1025`
- shared local Postgres, Redis, and MinIO-backed object storage

What this proved:

- the current MVP workflow runs on the expected local runtime dependencies
- records-request sending succeeds over SMTP when transport is present
- export and review gating still hold in the SMTP-backed runtime

What still needs real credentials for external email:

- delivery to a real mailbox outside the local SMTP sink

## Quick Validation Checks

```bash
curl -s http://127.0.0.1:4000/health
curl -s http://127.0.0.1:3000/healthz
curl -s http://127.0.0.1:3000/dashboard
```

For a demo SMTP check, point the API at either:

- a real SMTP account, or
- a local SMTP sink such as `127.0.0.1:1025`
