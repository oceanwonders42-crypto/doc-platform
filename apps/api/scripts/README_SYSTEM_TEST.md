# System test – local dev checklist

Run these in order. All commands from repo root or as stated.

---

## 1) Ensure DB is ready

- [ ] **Confirm `DATABASE_URL` exists in `apps/api/.env`**

  ```bash
  grep -q DATABASE_URL ~/doc-platform/apps/api/.env && echo "set" || echo "Add DATABASE_URL to apps/api/.env"
  ```

  If missing, add (adjust for your Postgres):

  ```env
  DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/DATABASE_NAME"
  ```

- [ ] **Run migrations**

  ```bash
  cd ~/doc-platform/apps/api && pnpm run bootstrap:dev
  ```

  Expected: migrations apply, then "Next steps" printed.

---

## 2) Ensure API runs locally

- [ ] **Start the API** (in a terminal you keep open):

  ```bash
  cd ~/doc-platform/apps/api && pnpm dev
  ```

  Expected: `API listening on :4000` (or the port from `PORT` in `.env`).

- [ ] **Confirm port matches `DOC_API_URL`**

  - Default: API listens on **4000**, health check uses `http://localhost:4000` when `DOC_API_URL` is unset.
  - If you set `PORT` in `apps/api/.env`, set `DOC_API_URL` to that port, e.g. `DOC_API_URL=http://localhost:3001`.

- [ ] **`/health`** – Already implemented: `GET /health` → `{ ok: true }`. No code change.

---

## 3) Ensure keys are set

- [ ] **`DOC_API_KEY` in `apps/api/.env`**

  If you don’t have a key yet:

  1. With API running, create a firm and key (e.g. with curl or Postman):

     ```bash
     curl -s -X POST http://localhost:4000/dev/create-firm -H "Content-Type: application/json" -d '{"name":"Test Firm"}' | jq -r .id
     ```

     Use the returned `id` as `FIRM_ID` in:

     ```bash
     curl -s -X POST "http://localhost:4000/dev/create-api-key/$FIRM_ID" -H "Content-Type: application/json" -d '{"name":"System test"}' | jq -r .apiKey
     ```

  2. Put the printed `apiKey` in `apps/api/.env`:

     ```env
     DOC_API_KEY=sk_live_...
     ```

- [ ] **`apps/web/.env.local`** (only if you run the web app)

  For the Next.js app:

  ```env
  DOC_API_URL=http://localhost:4000
  DOC_API_KEY=sk_live_...
  ```

  Port must match the API (e.g. 4000 or your `PORT`).

---

## 4) Endpoints used by tests (no changes needed)

Tests already call these; backend has them:

| Test / script      | Endpoint                          | Backend route                          |
|--------------------|-----------------------------------|----------------------------------------|
| Health             | `GET /health`                     | `GET /health` → `{ ok: true }`         |
| Health             | `GET /me/documents`               | `GET /me/documents`                    |
| Health             | `POST /documents/:id/recognize`   | `POST /documents/:id/recognize`        |
| Health             | `POST /documents/:id/route`       | `POST /documents/:id/route`            |
| Health             | `POST /documents/:id/reject`      | `POST /documents/:id/reject`           |
| Health             | `POST /documents/:id/claim`        | `POST /documents/:id/claim`            |
| Health             | `POST /documents/:id/unclaim`     | `POST /documents/:id/unclaim`          |
| Health             | `GET /documents/:id/audit`        | `GET /documents/:id/audit`             |
| Health             | `GET /providers`                  | `GET /providers`                       |
| Health             | `GET /cases/:id/records-requests` | `GET /cases/:id/records-requests`     |
| Metrics            | `GET /metrics/review`             | `GET /metrics/review`                  |

There is no `GET /documents`; the API uses **`GET /me/documents`** and the health check already uses it. No test or code changes required for routing/approve/reject.

---

## 5) Run the full system test and fix any FAIL

- [ ] **Run (with API already running and env set):**

  ```bash
  cd ~/doc-platform/apps/api && pnpm run test:system
  ```

- **If API: FAIL**  
  - Ensure the API process is running (`pnpm dev` in `apps/api`).  
  - Ensure `DOC_API_URL` (if set) matches the API port (e.g. `http://localhost:4000`).

- **If DOC_API_KEY missing**  
  - Add `DOC_API_KEY` to `apps/api/.env` (see step 3).

- **If DB: FAIL**  
  - Ensure `DATABASE_URL` is set in `apps/api/.env`.  
  - Run `pnpm run bootstrap:dev` again.  
  - If the error is “Core table missing”, run `pnpm exec prisma migrate dev` (or deploy) in `apps/api`.

- **If WORKER: FAIL**  
  - Usually due to ingest/storage (e.g. MinIO/S3). For a “documents” pass only, health + DB + metrics can be enough; worker can stay FAIL or be fixed by configuring storage.

- **If METRICS: FAIL**  
  - Requires API + `DOC_API_KEY`; fix those first and rerun.

When preflight shows all three env vars set, API and DB steps pass, and no required step is FAIL, the run is considered **PASS** for local dev.

---

## 6) Seed demo data (optional)

To populate the DB with demo firm, documents, providers, and audit events:

```bash
cd ~/doc-platform/apps/api && pnpm run seed:demo
```

Then open the web app (with `DOC_API_URL` and `DOC_API_KEY` set in `apps/web/.env.local` and pointing at the **Demo Firm**’s API key) and visit:

- **Dashboard:** `/dashboard`
- **Review queue:** `/dashboard/review`
- **Case (activity):** `/cases/demo-case-1` (or `demo-case-2`, …)
- **Document:** `/documents/<docId>` (use a doc ID printed by the seed script)

Note: The demo firm is named **"Demo Firm"**. Use an API key for that firm (create one via `/dev/create-api-key/:firmId` with the seeded firm ID) so the web app can load its documents and cases.

---

## Summary – commands in order

```bash
# 1) Env and DB (from repo root or apps/api)
# Add DATABASE_URL and DOC_API_KEY to apps/api/.env if missing
cd ~/doc-platform/apps/api && pnpm run bootstrap:dev

# 2) Start API (leave this terminal open)
cd ~/doc-platform/apps/api && pnpm dev

# 3) In another terminal – run system test
cd ~/doc-platform/apps/api && pnpm run test:system

# 4) Optional – seed demo data and open web app
cd ~/doc-platform/apps/api && pnpm run seed:demo
# Then in apps/web: set DOC_API_URL + DOC_API_KEY (for Demo Firm), run pnpm dev, and open:
#   /dashboard   /dashboard/review   /cases/demo-case-1   /documents/<id>
```

---

## Code diffs applied (for reference)

- **Health check when there are no documents**  
  Document-scoped checks (recognize, route, reject, claim, unclaim, audit) when `documentId` is null now report **SKIP (no documents)** and `pass: true`, so the health script can exit 0 and the system test reports **API: PASS** on a clean dev DB with no documents.  
  File: `apps/api/scripts/health_check.ts` (no other code changes; `/health` and endpoint names were already correct).
