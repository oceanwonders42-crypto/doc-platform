# First Pilot Checklist

This checklist is for the first real pilot environment, not local demo mode.

## Pilot-Critical Before Go-Live

### Runtime and process model

- Run a dedicated API process
- Run a dedicated web process
- Run a dedicated worker process for document jobs
- Use PostgreSQL for application data
- Use Redis for queue transport
- Use S3-compatible object storage for documents and export bundles

### Required API env

- `NODE_ENV=production`
- `DATABASE_URL`
- `REDIS_URL`
- `S3_ENDPOINT`
- `S3_ACCESS_KEY`
- `S3_SECRET_KEY`
- `S3_BUCKET`
- `S3_REGION`
- `DOC_WEB_BASE_URL`
- one non-default auth secret:
  - `JWT_SECRET`, or
  - `SESSION_SECRET`, or
  - `API_SECRET`
- one non-default provider session secret:
  - `PROVIDER_SESSION_SECRET`, or
  - `SESSION_SECRET`

### Required web env

- `DOC_API_URL`
- `DOC_API_KEY`

### Required for live outbound email

- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_SECURE`
- `SMTP_USER`
- `SMTP_PASS`
- `SMTP_FROM`

## Recommended Process Model

API:

```bash
cd apps/api
pnpm build
pnpm start
```

Worker:

```bash
cd apps/api
node dist/workers/worker.js
```

Web:

```bash
cd apps/web
pnpm build
pnpm start
```

## Operational Checks

Health:

```bash
curl -s http://127.0.0.1:4000/health
curl -s http://127.0.0.1:3000/healthz
curl -s http://127.0.0.1:3000/dashboard
```

Restart order:

1. storage dependencies if needed
2. database
3. Redis
4. API
5. worker
6. web

## Backup Basics

- Back up PostgreSQL regularly with `pg_dump`
- Back up the document/object storage bucket
- Keep env secrets outside the repo in the deployment secret manager
- Redis is queue transport, not the system of record; database and object storage backups are the critical recovery assets

## Non-Production Assumptions To Avoid In The Pilot

- Do not run with `DEMO_MODE=true`
- Do not rely on default fallback auth secrets
- Do not rely on the inline worker in a production-style pilot environment
- Do not use the local SMTP sink for live external delivery
- Do not assume fax delivery is available

## Safe To Defer Until After The First Pilot

- External session store replacing the current in-memory `express-session` store
  - keep the pilot as a single API instance if you do not change this yet
- Fax delivery implementation
- Broader deployment automation
- Admin/demo conveniences that are not part of the operator workflow
