# Troubleshooting

Common failure modes and how to fix them.

**Quick matrix:** For a one-page troubleshooting table (API not running, missing API URL/key, demo seed, demo user, Playwright browsers, wrong port/base URL), see [launch-readiness-runbook.md](launch-readiness-runbook.md)#troubleshooting.

## Setup and env

### "Missing DOC_API_URL" or "Missing DOC_API_KEY" on dashboard

- **Cause:** Web app env not set or not loaded.
- **Fix:** Create `apps/web/.env.local` from `apps/web/.env.example`. Set `DOC_API_URL=http://127.0.0.1:4000` and `DOC_API_KEY=sk_live_...` (get the key from API: create firm + key via `/dev/create-firm` and `/dev/create-api-key/:firmId`). Restart the web app (`pnpm dev` in `apps/web`).

### API won’t start: "DATABASE_URL is not set" / "DATABASE_URL missing"

- **Cause:** API has no database connection string.
- **Fix:** Create `apps/api/.env` from `apps/api/.env.example`. Set `DATABASE_URL=postgresql://USER:PASSWORD@localhost:5432/DATABASE_NAME`. Create the database if needed (e.g. `createdb doc_platform`). Run migrations: `cd apps/api && pnpm exec prisma migrate deploy`.

### API won’t start: Redis / queue errors

- **Cause:** Redis not running or wrong URL.
- **Fix:** Start Redis (e.g. `redis-server` or your system service). In `apps/api/.env` set `REDIS_URL=redis://localhost:6379` or leave unset to use that default.

### E2E or web app can’t reach API

- **Cause:** API not running or wrong port/URL.
- **Fix:** Start API with `cd apps/api && pnpm dev` (default port 4000). Ensure `DOC_API_URL` in `apps/web/.env.local` is `http://127.0.0.1:4000` (avoid `localhost` if you see CORS or resolution issues).

## Demo and data

### Empty dashboard after running demo seed

- **Cause:** Web app is using an API key for a different firm than the one that was seeded.
- **Fix:** In dev, the seed uses the first firm or creates "Demo Firm". Create an API key for that firm: `POST /dev/create-api-key/:firmId` (get `firmId` from API logs after seed or from seed response). Set the returned `apiKey` in `apps/web/.env.local` as `DOC_API_KEY` and restart the web app.

### 401 on "Generate demo data"

- **Cause:** In production, demo seed requires a valid API key. In dev, the route may still expect a key in some setups.
- **Fix:** Ensure API is running. Set `DOC_API_KEY` in `apps/web/.env.local` to a key for the firm you want to seed (or the first firm in dev). If you use CLI seed, set `DOC_API_KEY` in `apps/api/.env` and run `cd apps/api && pnpm run seed:demo:http`.

### "Generate demo data" button not visible

- **Cause:** Button is shown only when `NODE_ENV !== "production"` or `DEMO_MODE=true`.
- **Fix:** Run the web app in development: `cd apps/web && pnpm dev`. For production-like runs, set `DEMO_MODE=true` in env if you need the button.

## Running the app

### Port already in use (3000 or 4000)

- **Cause:** Another process is using the port.
- **Fix:** Stop the other process or use a different port. For API: set `PORT=4001` in `apps/api/.env`. For web: `pnpm dev -- -p 3001` and use `http://localhost:3001`.

### Web app shows "Failed to fetch" or network errors

- **Cause:** API is down, wrong URL, or CORS.
- **Fix:** Confirm API is running and reachable: `curl -s http://127.0.0.1:4000/health`. Ensure `DOC_API_URL` in `apps/web/.env.local` matches (use `http://127.0.0.1:4000` for local).

### E2E tests fail: "page.goto: net::ERR_CONNECTION_REFUSED"

- **Cause:** Web app (or API) not running when tests start.
- **Fix:** Start web (and API if tests need data): `cd apps/web && pnpm dev`. Playwright config can start the web server automatically when not in CI; ensure nothing else is bound to port 3000.

## Database and migrations

### Prisma migrate fails or schema drift

- **Cause:** DB state doesn’t match migrations or connection issue.
- **Fix:** Check `DATABASE_URL`. For a clean reset (dev only): `cd apps/api && pnpm run db:reset`. Otherwise run `pnpm exec prisma migrate deploy` or `prisma migrate dev` as appropriate.

### "Firm not found" or missing data after reset

- **Cause:** DB was reset; no firms or API keys.
- **Fix:** Create a firm and API key again (see [demo-setup.md](demo-setup.md)), then run demo seed if needed.

## Quick reference

| Symptom | Check | Fix |
|--------|--------|-----|
| Dashboard env error | `apps/web/.env.local` | Set DOC_API_URL + DOC_API_KEY |
| API won’t start | `apps/api/.env`, PostgreSQL, Redis | DATABASE_URL, REDIS_URL; run migrations |
| Empty dashboard after seed | DOC_API_KEY firm vs seeded firm | Create key for seeded firm, set in web .env.local |
| E2E connection refused | Web/API running, port | Start apps; free port 3000/4000 |
| 401 on demo seed | API key in prod/dev | Set valid DOC_API_KEY for target firm |

For full setup steps, see [demo-setup.md](demo-setup.md). For a short operator runbook and troubleshooting matrix, see [launch-readiness-runbook.md](launch-readiness-runbook.md). For reset/reseed, see [runbook.md](runbook.md).
