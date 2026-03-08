# Local testing

How to run tests and verify the app locally.

**Quick path:** For a short operator checklist (install → services → env → seed → smoke/regression) and a troubleshooting matrix, see [launch-readiness-runbook.md](launch-readiness-runbook.md) first.

## Run modes

| Mode | Command | When to use |
|------|--------|-------------|
| **Smoke pack only** | `cd apps/web && pnpm test:e2e tests/smoke.spec.ts` | Quick regression; works with or without API/demo data. |
| **Seeded regression pack** | `cd apps/web && pnpm test:e2e tests/demo-regression.spec.ts` | Local only; requires API + DOC_API_KEY + demo seed. Tests skip when env unavailable. |
| **Local full E2E** | `cd apps/web && pnpm test:e2e` | All specs; smoke + demo-flow + demo-regression + review queue. |
| **CI smoke** | See [ci-testing.md](ci-testing.md). Workflow starts web, runs smoke pack. No API by default. | Push/PR; validates app loads and key routes respond. |

**Smoke vs seeded regression:** The **smoke pack** (`smoke.spec.ts`) asserts key routes load and accepts empty state or env errors. The **seeded regression pack** (`demo-regression.spec.ts`) runs real user flows (login → dashboard, dashboard → cases → case detail, **dashboard → cases → case timeline**, **dashboard → cases → case narrative**, dashboard → documents → document detail, **dashboard → review queue**, **dashboard → records requests → records request detail**, **dashboard → providers → provider detail**) and **skips** when the dashboard shows "Missing DOC_API…". Run the seeded pack locally when API, DOC_API_KEY, and demo seed are available; CI does not run it with a full demo env unless configured.

Ensure Playwright browsers are installed: `cd apps/web && pnpm exec playwright install chromium`.

## E2E tests (Playwright)

### Prerequisites

- **Web app** must be reachable at `http://localhost:3000` (or set `PLAYWRIGHT_BASE_URL`).
- **API** should be running if you want the dashboard to show data (tests are resilient to empty state).
- **DOC_API_KEY** in `apps/web/.env.local` so the dashboard can load without env errors (recommended).

### Run all E2E tests

```bash
cd apps/web
pnpm test:e2e
```

Playwright can start the web app automatically (see `playwright.config.ts`). If you prefer to start it yourself, run `pnpm dev` in another terminal and set `CI=1` or adjust config so Playwright doesn’t start a second server.

### Run only the smoke pack

```bash
cd apps/web
pnpm test:e2e tests/smoke.spec.ts
```

### Run minimal demo flow

```bash
cd apps/web
pnpm test:e2e tests/demo-flow.spec.ts
```

### Run demo regression (gated; skips without demo env)

```bash
cd apps/web
pnpm test:e2e tests/demo-regression.spec.ts
```

**Seeded regression pack** — eight gated flows:

1. **Login → dashboard** — skips when dashboard shows missing API key.
2. **Dashboard → cases → case detail** — uses sidebar Cases, then first case link or demo-case-1.
3. **Dashboard → cases → case timeline** — navigates to cases list, then first case timeline (or demo-case-1); gated.
4. **Dashboard → cases → case narrative** — navigates to cases list, then first case narrative (or demo-case-1); gated.
5. **Dashboard → documents → document detail** — uses first document link from dashboard; skips if none.
6. **Dashboard → review queue** — navigates to review queue and asserts page loaded (table or empty state).
7. **Dashboard → records requests → records request detail** — navigates to records requests list, then first request detail if present; **skips when no request exists** (seeded local path only).
8. **Dashboard → providers → provider detail** — navigates to providers list, then first provider detail if present; **skips when no provider exists** (seeded local path only).

**Env / services required for a full run (no skips):**

- **Web** at `http://localhost:3000` (or `PLAYWRIGHT_BASE_URL`).
- **API** at `DOC_API_URL` (e.g. `http://127.0.0.1:4000`).
- **DOC_API_KEY** in `apps/web/.env.local` (key for the firm that has demo data).
- **Demo seed** applied: dashboard "Generate demo data" or `cd apps/api && pnpm run seed:demo:http`. Demo seed creates cases (demo-case-1, etc.), providers, and records requests; timeline and narrative use first case from list or demo-case-1.

**Demo credentials:** Create a firm and API key, then seed. See [demo-setup.md](demo-setup.md) for exact steps (create-firm, create-api-key, seed, set `DOC_API_KEY`).

**CI:** This pack is intended for local use. In CI without API/key, all eight tests skip; the workflow does not run a full demo env unless you add one.

### Run review queue tests

```bash
cd apps/web
pnpm test:queue
# or
pnpm test:e2e tests/review_queue.spec.ts
```

### Config

- **Config file:** `apps/web/playwright.config.ts`
- **Base URL:** `process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000"`
- **Test dir:** `./tests`
- **Web server:** In non-CI, Playwright can run `pnpm run dev` and wait for the URL; `reuseExistingServer` avoids starting a second one if the app is already up.

## CI

For exact commands and a minimal GitHub Actions workflow, see [ci-testing.md](ci-testing.md). Smoke tests can run in CI with only the web app (no API); tests accept env-error or empty state. For an optional plan to run a fuller CI pass (API + seed + regression), see the **Optional full-pass CI (planning)** section in [ci-testing.md](ci-testing.md); that section includes decision notes and tradeoffs for future implementation.

## Smoke test checklist (manual)

For a quick manual pass, use the developer smoke test checklist at repo root:

- [README_DEV_SMOKE_TEST.md](../README_DEV_SMOKE_TEST.md)

It covers dashboard, documents, review queue, cases, timeline, providers, records requests, and one admin page.

## API / backend scripts

- **Health check:** `cd apps/api && pnpm run test:health` (or use the script in `scripts/health_check.ts`) — checks API is up and optionally DB/Redis.
- **Smoke (API-only):** From repo root, `pnpm smoke` runs `scripts/smoke_test.sh` (create firm, create key, ingest PDF, poll for processing). Requires API (and optionally worker) running.

## Verifying the app quickly

1. **API:** `curl -s http://127.0.0.1:4000/health` → `{"ok":true}` or similar.
2. **Web:** Open http://localhost:3000/dashboard → dashboard or env message (no 5xx).
3. **E2E:** `cd apps/web && pnpm test:e2e tests/smoke.spec.ts` → all tests pass or known skips. Ensure Playwright browsers are installed: `cd apps/web && pnpm exec playwright install chromium`.

## Troubleshooting (E2E)

For a quick troubleshooting matrix (API not running, seed not run, demo user, Playwright, port), see [launch-readiness-runbook.md](launch-readiness-runbook.md)#troubleshooting.

| Issue | What to check |
|-------|----------------|
| **Web app not ready** | Tests fail with connection refused or timeouts. Start web: `cd apps/web && pnpm dev`. Playwright can start it automatically when not in CI; ensure port 3000 is free. |
| **Playwright browsers missing** | Error: "Executable doesn't exist". Run `cd apps/web && pnpm exec playwright install chromium` (or `playwright install` for all). |
| **Flaky selector / debug** | Run one test: `pnpm test:e2e tests/smoke.spec.ts -g "dashboard"`. Use `--debug` or `--headed`. Inspect trace: `pnpm exec playwright show-trace test-results/…/trace.zip`. |

## Test stability (reducing flakiness)

- **Preferred selectors:** Prefer `page.locator("main")` for page shell and `page.getByRole("heading", { name: /…/ })` or main-scoped text for content. Avoid `page.getByText(/x/i).first()` over the whole page — use `assertListPageLoaded(page, /heading/)` so the heading is resolved inside `main` when possible.
- **Use helper assertions** from `tests/helpers/assertions.ts`: `assertMainVisible`, `assertListPageLoaded`, `assertMainVisibleWithOneOf`, `assertAdminPageLoaded`, `assertReviewPageLoaded`. They centralize timeouts and accept env/empty states where appropriate.
- **Review queue tests:** Prefer state-based waits over fixed `waitForTimeout`. After confirm/reject/route actions, wait for the toast (e.g. `waitForReviewQueueToast(page, /Confirmed|Rejected|Routed/, 5000)` from `assertions.ts`). After opening the preview drawer, wait for the Route button or drawer content to be visible instead of a short timeout. This reduces flakiness without changing product behavior.
- **After navigation:** Call a helper that waits for `main` (or main + content) instead of ad-hoc `expect(main).toBeVisible()` plus custom content checks.
- **Debugging flaky runs:** Run the failing test in isolation with `-g "test name"`. Use `--headed` or `--debug` to watch. Check `test-results/` for traces; run `pnpm exec playwright show-trace test-results/…/trace.zip`. If a test fails on “element not visible”, ensure the page has finished loading (use the helper that waits for `main` and optional content).
- **Optional content / skip:** For list-detail flows (e.g. first document link), use helpers that wait for `main` before querying links (e.g. `getFirstDocumentLinkFromDashboard`), and `test.skip()` when no link is found instead of failing.

## Smoke-test matrix

For a route-by-route matrix (what must be running, expected result, common failures), see [smoke-test-matrix.md](smoke-test-matrix.md).

## See also

- [launch-readiness-runbook.md](launch-readiness-runbook.md) — operator checklist, smoke/seeded regression commands, troubleshooting matrix
- [demo-setup.md](demo-setup.md) — full local setup and demo credentials
- [troubleshooting.md](troubleshooting.md) — common failures and fixes
- [runbook.md](runbook.md) — reset demo, reseed, what to check when things fail
- [ci-testing.md](ci-testing.md) — running smoke tests in CI
