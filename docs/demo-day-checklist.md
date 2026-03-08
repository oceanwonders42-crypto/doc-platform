# Demo day checklist

Use this the morning of a demo to ensure the app is runnable and data looks correct.

**Launch readiness:** For a concise runbook (quick start, smoke and regression commands, troubleshooting), see [launch-readiness-runbook.md](launch-readiness-runbook.md).

## Before the demo (day before or morning of)

- [ ] **Services:** PostgreSQL and Redis are running (or will be started).
- [ ] **Env:** `apps/api/.env` and `apps/web/.env.local` exist and are correct (see [demo-setup.md](demo-setup.md)). No real secrets committed.
- [ ] **API:** From repo root, `cd apps/api && pnpm dev` — API starts and listens on 4000. No DATABASE_URL or Redis errors in logs.
- [ ] **Web:** In another terminal, `cd apps/web && pnpm dev` — Web starts on 3000. Open http://localhost:3000/dashboard and confirm the dashboard loads (no "Missing DOC_API").
- [ ] **Demo data:** If you need fresh data, click **Generate demo data** on the dashboard, or run `cd apps/api && pnpm run seed:demo:http` (with DOC_API_KEY in apps/api/.env). Confirm dashboard shows ~10 documents and cases DEMO-001, DEMO-002, DEMO-003.
- [ ] **Quick verify:** Follow [README_DEV_SMOKE_TEST.md](../README_DEV_SMOKE_TEST.md) or run E2E: `cd apps/web && pnpm test:e2e tests/smoke.spec.ts`.

## Right before the demo

- [ ] Start API: `cd apps/api && pnpm dev`.
- [ ] Start web: `cd apps/web && pnpm dev`.
- [ ] Open http://localhost:3000/dashboard in the browser you’ll use; confirm it loads.
- [ ] Open Review queue, one case (e.g. DEMO-001), and one document from the dashboard to confirm navigation works.
- [ ] If you use a second screen or projector, open the app on that display and resize once to avoid layout glitches during the demo.

## If something breaks during the demo

- **Dashboard won’t load:** Check API is still running (terminal 1). Refresh; if "Missing DOC_API", env was not loaded — restart web.
- **No data:** Reseed once: click **Generate demo data** on the dashboard (quick) or run `pnpm run seed:demo:http` from apps/api.
- **API crashed:** Restart `cd apps/api && pnpm dev`. Refresh the browser.
- **Port in use:** See [troubleshooting.md](troubleshooting.md) (use different PORT or kill process on 4000/3000).

## After the demo

- [ ] Stop API and web (Ctrl+C in each terminal).
- [ ] If you changed env or seeded sensitive data, revert or clear as needed (e.g. new API key for next time).

See also: [demo-setup.md](demo-setup.md), [troubleshooting.md](troubleshooting.md), [runbook.md](runbook.md).
