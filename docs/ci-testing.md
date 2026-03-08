# CI test runs

How to run the smoke pack in CI and what to expect without secrets.

**Local launch path:** To get services up, seed, and run smoke/regression locally, see [launch-readiness-runbook.md](launch-readiness-runbook.md).

## Exact commands (CI or local)

From **repo root** after checkout and install:

```bash
# 1. Install dependencies (root)
pnpm install --frozen-lockfile

# 2. Install Playwright browsers (chromium only is enough for smoke)
cd apps/web && pnpm exec playwright install --with-deps chromium

# 3a. With web app already running (e.g. started in a previous step):
cd apps/web && pnpm test:e2e tests/smoke.spec.ts

# 3b. Or let Playwright start the web app (local only; config disables this in CI):
cd apps/web && CI= pnpm test:e2e tests/smoke.spec.ts
```

In **CI**, the workflow must start the web app before the test step because `playwright.config.ts` sets `webServer: undefined` when `CI` is set. Example (no API):

```bash
cd apps/web && pnpm run dev &
# wait for http://localhost:3000 to respond (e.g. curl loop or wait-on)
cd apps/web && CI=1 PLAYWRIGHT_BASE_URL=http://localhost:3000 pnpm test:e2e tests/smoke.spec.ts
```

## What runs without API or secrets

- **Web app only:** Smoke tests run against the Next.js app. Pages that call the API may show "Missing DOC_API" or empty state; tests are written to accept that (e.g. dashboard shows content *or* env error). Most smoke tests still pass (main visible, headings, navigation).
- **With API but no DOC_API_KEY:** Same as above for the web app; dashboard and API-backed pages show env error or empty data.
- **With API + DOC_API_KEY:** Full smoke pass (dashboard with data, cases, documents, etc.). In CI you’d set `DOC_API_KEY` (and optionally start the API) as a secret or env var if you want a full pass.

## GitHub Actions scaffold

The repo includes a minimal workflow:

- **File:** `.github/workflows/e2e.yml`
- **Triggers:** Push and PR to `main`
- **Steps:** Checkout → pnpm install → Playwright install chromium → Start web app (background) → Run `pnpm test:e2e tests/smoke.spec.ts`
- **No secrets:** Workflow does not assume `DOC_API_KEY`, API URL, or database. It only starts the web app and runs Playwright. For a full pass (data on dashboard), add a job that starts the API with env and run the same test command.

---

## Optional full-pass CI (planning)

This section describes what would be required to run a **fuller** CI pass (smoke with data + optional seeded regression). It is **documentation only**; the current workflow remains web-only smoke. For open choices and tradeoffs (service setup, API key strategy, seed, demo-regression), see [Decision notes (for future implementation)](#decision-notes-for-future-implementation) below.

### Current CI behavior

- **Workflow:** [.github/workflows/e2e.yml](../.github/workflows/e2e.yml)
- **Runs:** One job on `ubuntu-latest`: checkout → `pnpm install` → Playwright chromium → start web app (background) → `pnpm test:e2e tests/smoke.spec.ts`
- **No API, DB, Redis, or secrets.** The web app runs alone; pages that call the API see "Missing DOC_API" or empty state. Tests are written to accept that, so most smoke tests still pass.

### What a fuller CI pass would require

| Need | Purpose |
|------|--------|
| **PostgreSQL** | API database (e.g. GitHub Actions service or container). |
| **Redis** | API queue (default `redis://localhost:6379` or service). |
| **API env** | `DATABASE_URL`, `REDIS_URL` in the job that starts the API. |
| **Migrations** | `cd apps/api && pnpm exec prisma migrate deploy` before starting the API. |
| **API process** | Start API (e.g. `cd apps/api && pnpm dev`) and wait for health before starting web. |
| **Firm + API key** | Create once per run (e.g. `POST /dev/create-firm`, `POST /dev/create-api-key/:firmId`) or use a pre-seeded DB; get `apiKey` for web. |
| **Web/test env** | `DOC_API_URL` (e.g. `http://127.0.0.1:4000`) and `DOC_API_KEY` (from step above) as env or secrets for the test step. |
| **Optional: demo seed** | Run `cd apps/api && pnpm run seed:demo:http` (with `DOC_API_KEY` in API env) so demo data exists; then seeded regression and detail tests can run without skipping. |

### Likely order of setup (if implemented)

1. Add PostgreSQL and Redis services (or containers) to the job.
2. Set `DATABASE_URL`, `REDIS_URL`; run migrations; start the API; wait for `curl http://127.0.0.1:4000/health` → OK.
3. Create firm + API key via API dev endpoints; export or capture `apiKey`.
4. Start web app (as today); set `DOC_API_URL` and `DOC_API_KEY` in the test step env.
5. Run `pnpm test:e2e tests/smoke.spec.ts` (full smoke pass with data).
6. Optionally run `pnpm test:e2e tests/demo-regression.spec.ts` in the same or a follow-up step if seed was applied.

### Tests that would become eligible

- **Smoke:** Dashboard, cases, documents, review queue, providers, records requests, and admin pages would load with real data; tests that currently skip when no link (e.g. document detail, provider detail, records request detail, admin firm detail) could pass when firms/data exist.
- **Seeded regression:** The eight gated flows (login → dashboard, dashboard → cases → case detail, dashboard → cases → timeline, dashboard → cases → narrative, dashboard → documents → document detail, dashboard → review queue, dashboard → records requests → records request detail, dashboard → providers → provider detail) would run without skip when `DOC_API_KEY` is set and demo seed has been applied.

See [launch-readiness-runbook.md](launch-readiness-runbook.md) for the local equivalent (install, env, startup order, seed, test commands).

### Decision notes (for future implementation)

These choices are **not yet implemented**; the current workflow remains web-only smoke. When implementing a fuller CI pass, consider:

| Decision | Options | Tradeoffs |
|----------|---------|-----------|
| **Service setup** | GitHub Actions `services:` (PostgreSQL, Redis) vs Docker Compose / custom containers | `services:` is simpler and well-supported; containers give more control and parity with local Docker setups. |
| **API key strategy** | Create per run via `POST /dev/create-firm` + `POST /dev/create-api-key/:firmId` vs stored secret | Per-run creation avoids storing a live key and matches a fresh DB each run; a stored secret is simpler but ties CI to one firm and key. |
| **Run seed in CI** | Yes vs no | With seed: smoke and demo-regression see real data; more steps and time. Without: only smoke with API + key (dashboard loads but many tests still skip for lack of links). |
| **Run demo-regression in CI** | Yes vs no | With demo-regression: full coverage of gated flows; requires seed and longer run. Without: smoke-only full pass is enough for many teams. |

**Current recommendation (planning):** Start with services + API + per-run firm/key + smoke only; add seed and demo-regression as a follow-up job or optional matrix if needed. Do not claim full-pass CI exists until a workflow is merged.

## See also

- [local-testing.md](local-testing.md) — running tests locally
- [smoke-test-matrix.md](smoke-test-matrix.md) — what each route expects
- [launch-readiness-runbook.md](launch-readiness-runbook.md) — local launch and test commands
