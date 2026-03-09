# Local Demo Setup

This guide gets the Doc Platform running locally with demo data for demos and development.

**Launch readiness:** For a short operator checklist (services, startup order, smoke and regression commands, troubleshooting), see [launch-readiness-runbook.md](launch-readiness-runbook.md).

## Required services

- **Node.js** (v18+)
- **pnpm** (project uses `pnpm@10.30.3`)
- **PostgreSQL** (for the API database)
- **Redis** (default: `redis://localhost:6379`, used by API queue)

Install from your system package manager or [nodejs.org](https://nodejs.org), [pnpm](https://pnpm.io), [PostgreSQL](https://www.postgresql.org/download/), and [Redis](https://redis.io/docs/getting-started/installation/).

## 1. Clone and install

```bash
cd doc-platform
pnpm install
```

## 2. Environment variables

### API (`apps/api/.env`)

Copy `apps/api/.env.example` to `apps/api/.env` and fill in. Never commit `.env` or real secrets.

```env
# Required for local dev/demo
DATABASE_URL=postgresql://USER:PASSWORD@localhost:5432/DATABASE_NAME
REDIS_URL=redis://localhost:6379

# Optional (defaults)
PORT=4000
```

- **DATABASE_URL** — PostgreSQL connection string. Create a database first (e.g. `createdb doc_platform`).
- **REDIS_URL** — Omit to use `redis://localhost:6379`.

### Web app (`apps/web/.env.local`)

Copy `apps/web/.env.local.example` to `apps/web/.env.local` and set at least:

```env
NEXT_PUBLIC_API_URL=http://localhost:4000
```

- **NEXT_PUBLIC_API_URL** — API base URL (e.g. `http://localhost:4000`). Required for login and dashboard.
- For **browser login**: run `pnpm run seed:demo` in `apps/api`, then use **demo@example.com** / **demo** (see step 5).
- Optional: **DOC_API_KEY** or **window.__API_KEY** for API-key auth without login.

Optional (see `.env.example`):

- **DOC_WEB_BASE_URL** — Base URL of the web app (e.g. `http://localhost:3000`). Used for server-side fetches; defaults work for local dev.
- **DEMO_MODE=true** — Enables demo seed in production-like runs.
- **PLATFORM_ADMIN_API_KEY** — Only needed for admin pages that call admin API routes (e.g. Firms list).

## 3. Database

From repo root:

```bash
cd apps/api && pnpm exec prisma migrate deploy
```

Or, to reset and apply migrations:

```bash
cd apps/api && pnpm run db:reset
```

## 4. Start API and web

Use two terminals.

**Terminal 1 — API (port 4000):**

```bash
cd apps/api && pnpm dev
```

**Terminal 2 — Web (port 3000):**

```bash
cd apps/web && pnpm dev
```

Leave both running.

## 5. Demo credentials (first-time)

**Browser login (recommended):** Run `cd apps/api && pnpm run seed:demo`. Then open http://localhost:3000/login and sign in with **demo@example.com** / **demo** (or **password**). Set `NEXT_PUBLIC_API_URL=http://localhost:4000` in `apps/web/.env.local`.

**API key (alternative):** The app also supports API key auth. You need one firm and one API key, then set `DOC_API_KEY` in `apps/web/.env.local` (or use the browser login above).

**Option A — Create firm and key, then seed (recommended)****

1. With the API running, create a firm and API key:

   ```bash
   # Create firm (replace name if you like)
   curl -s -X POST http://127.0.0.1:4000/dev/create-firm \
     -H "Content-Type: application/json" \
     -d '{"name":"Demo Firm"}' | jq

   # Copy the "id" from the response, then create an API key (replace YOUR_FIRM_ID)
   curl -s -X POST "http://127.0.0.1:4000/dev/create-api-key/YOUR_FIRM_ID" \
     -H "Content-Type: application/json" \
     -d '{"name":"Web app"}' | jq
   ```

2. Copy the **apiKey** value from the second response (shown only once).
3. Put it in **apps/web/.env.local** as `DOC_API_KEY=sk_live_...`.
4. Restart the web app (or rely on Next.js env reload).
5. Open **http://localhost:3000/dashboard** and click **"Generate demo data"**. Demo data will be created for your firm.

**Option B — Seed first, then create key**

1. Temporarily set any valid `DOC_API_KEY` in `apps/web/.env.local` (or leave it empty if the API allows unauthenticated demo seed in dev — it uses the first firm or creates "Demo Firm").
2. Open **http://localhost:3000/dashboard** and click **"Generate demo data"**.
3. In the API logs you’ll see the created **firmId**. Create an API key for that firm:

   ```bash
   curl -s -X POST "http://127.0.0.1:4000/dev/create-api-key/FIRM_ID_FROM_LOGS" \
     -H "Content-Type: application/json" \
     -d '{"name":"Web app"}' | jq
   ```

4. Set the returned **apiKey** in `apps/web/.env.local` as `DOC_API_KEY`, then refresh the dashboard.

**CLI seed (optional)**

If you already have `DOC_API_KEY` set in `apps/api/.env` (and the API is running), you can seed from the command line:

```bash
cd apps/api && pnpm run seed:demo:http
```

This calls `POST /admin/demo/seed` with the key in `apps/api/.env`. Ensure the key belongs to the firm you want to attach demo data to (in dev, the seed often uses the first firm or creates one).

## 6. Open the app and verify

1. Open **http://localhost:3000/dashboard** (not the root URL; the app’s main entry is the dashboard).
2. You should see:
   - Firm name, plan, and usage
   - **Recent documents** (after demo seed: ~10 demo documents)
   - **Generate demo data** button in dev (if `NODE_ENV !== "production"` or `DEMO_MODE=true`)
3. Quick checks:
   - Click **Review queue** in the nav → review queue with NEEDS_REVIEW docs.
   - Click a **case** link (e.g. DEMO-001) → case detail with documents and timeline.
   - Click a **document** name → document detail page.

Demo cases use fixed IDs: **demo-case-1**, **demo-case-2**, **demo-case-3** (case numbers DEMO-001, DEMO-002, DEMO-003).

## Troubleshooting

| Issue | What to do |
|-------|------------|
| Dashboard shows "Missing DOC_API_URL" or "Missing DOC_API_KEY" | Set both in `apps/web/.env.local` and restart the web app. |
| 401 on "Generate demo data" | In production, demo seed requires a valid API key. In dev, the API may allow seed without a key and create/use the first firm. Ensure API is running and, if required, `DOC_API_KEY` matches a key for that firm. |
| Empty dashboard after seed | Ensure `DOC_API_KEY` in `apps/web/.env.local` is the key for the firm that was seeded. Create a key via `POST /dev/create-api-key/:firmId` if needed. |
| API won’t start: DATABASE_URL | Add `DATABASE_URL` to `apps/api/.env` and run migrations (step 3). |
| API queue/worker not processing | Start Redis and ensure `REDIS_URL` is correct. For full processing, run the worker: `cd apps/api && pnpm dev:worker`. |
| "Generate demo data" not visible | Shown only when `NODE_ENV !== "production"` or `DEMO_MODE=true`. Use `pnpm dev` for development. |

## Summary

| Step | Action |
|------|--------|
| 1 | `pnpm install` |
| 2 | Add `apps/api/.env` (DATABASE_URL, REDIS_URL) and `apps/web/.env.local` (DOC_API_URL, DOC_API_KEY) |
| 3 | `cd apps/api && pnpm exec prisma migrate deploy` |
| 4 | Start API: `cd apps/api && pnpm dev`; start web: `cd apps/web && pnpm dev` |
| 5 | Create firm + API key (Option A or B), set `DOC_API_KEY` in `apps/web/.env.local` |
| 6 | Open http://localhost:3000/dashboard and click **Generate demo data** (or run `pnpm run seed:demo:http` from apps/api) |
| 7 | Verify dashboard, review queue, cases, and document detail |

## Running E2E tests (Playwright)

E2E tests live in `apps/web/tests/`. Run with API and web up and `DOC_API_KEY` set so the dashboard loads:

```bash
cd apps/web && pnpm test:e2e
```

- **Full smoke pack:** `pnpm test:e2e tests/smoke.spec.ts`
- **Seeded regression pack:** `pnpm test:e2e tests/demo-regression.spec.ts` (see [launch-readiness-runbook.md](launch-readiness-runbook.md))
- **Minimal demo flow:** `pnpm test:e2e tests/demo-flow.spec.ts`
- **Review queue:** `pnpm test:e2e tests/review_queue.spec.ts`

See [local-testing.md](local-testing.md) for details and [smoke-test-matrix.md](smoke-test-matrix.md) for route coverage.

## See also

- [launch-readiness-runbook.md](launch-readiness-runbook.md) — quick start, smoke and regression commands, troubleshooting
- [troubleshooting.md](troubleshooting.md) — common failures and fixes
- [demo-day-checklist.md](demo-day-checklist.md) — pre-demo checklist
- [runbook.md](runbook.md) — reset demo, reseed, what to check if login or API fails
- [local-testing.md](local-testing.md) — how to run E2E and verify the app
