# Support handoff / runbook

Short runbook for resetting demo, reseeding, and what to check when things fail.

**Launch readiness:** For quick start, smoke/seeded regression commands, and a troubleshooting matrix, see [launch-readiness-runbook.md](launch-readiness-runbook.md).

## How to reset local demo

1. **Optional: reset database** (destroys all data)
   ```bash
   cd apps/api
   pnpm run db:reset
   ```
   Confirm when prompted. Migrations reapply automatically.

2. **Restart API and web**
   - Stop both (Ctrl+C).
   - Start API: `cd apps/api && pnpm dev`
   - Start web: `cd apps/web && pnpm dev`

3. **Create firm and API key again** (after DB reset)
   ```bash
   curl -s -X POST http://127.0.0.1:4000/dev/create-firm \
     -H "Content-Type: application/json" -d '{"name":"Demo Firm"}' | jq
   # Use the "id" from output as YOUR_FIRM_ID below
   curl -s -X POST "http://127.0.0.1:4000/dev/create-api-key/YOUR_FIRM_ID" \
     -H "Content-Type: application/json" -d '{"name":"Web app"}' | jq
   ```
   Put the returned `apiKey` into `apps/web/.env.local` as `DOC_API_KEY=sk_live_...`.

4. **Reseed** (see below).

## How to reseed

**Option A — From the UI**  
Open http://localhost:3000/dashboard and click **Generate demo data**. (Dev only, or when `DEMO_MODE=true`.)

**Option B — From the command line**  
With the API running and `DOC_API_KEY` set in `apps/api/.env` for the firm you want to seed:
```bash
cd apps/api
pnpm run seed:demo:http
```

After reseeding, ensure `DOC_API_KEY` in `apps/web/.env.local` is the key for the same firm so the dashboard shows the new data.

## If login “fails” (dashboard shows env error or no data)

- **"Missing DOC_API_URL" or "Missing DOC_API_KEY"**  
  Set both in `apps/web/.env.local`. Restart the web app. No login form — auth is via API key in env.

- **Dashboard loads but shows no documents/cases**  
  1. Confirm API is running (`curl -s http://127.0.0.1:4000/health`).
  2. Confirm `DOC_API_KEY` in `apps/web/.env.local` is for the firm that has data (e.g. the one you seeded). Create a key via `POST /dev/create-api-key/:firmId` if needed.
  3. Reseed if you expect demo data (see above).

- **401 or “Unauthorized” in network tab**  
  The API key is invalid or revoked. Create a new key for the firm and set it in `apps/web/.env.local`.

## If dashboard has no data

1. **API running?** `curl -s http://127.0.0.1:4000/health` → `{"ok":true}`.
2. **Correct API key?** Key in `DOC_API_KEY` must belong to the firm you seeded (or the first firm in dev). Create key: `POST /dev/create-api-key/:firmId`.
3. **Data exists?** Run demo seed (UI button or `pnpm run seed:demo:http` from apps/api with DOC_API_KEY in apps/api/.env).
4. **Web env reloaded?** Restart `pnpm dev` in apps/web after changing .env.local.

## If API is down

1. **Start API:** `cd apps/api && pnpm dev`.
2. **Check env:** `apps/api/.env` must have `DATABASE_URL` and optionally `REDIS_URL`. Redis must be running if the app uses the queue.
3. **Check port:** Default 4000. If in use, set `PORT=4001` in `apps/api/.env` and set `DOC_API_URL=http://127.0.0.1:4001` in `apps/web/.env.local`.
4. **Health:** `curl -s http://127.0.0.1:4000/health` should return OK.

## Quick reference

| Goal | Action |
|------|--------|
| Reset demo (full) | `cd apps/api && pnpm run db:reset` then recreate firm + key, reseed |
| Reseed only | Dashboard → “Generate demo data” or `cd apps/api && pnpm run seed:demo:http` |
| Login/env error | Set DOC_API_URL + DOC_API_KEY in apps/web/.env.local, restart web |
| No data on dashboard | Check API up, DOC_API_KEY for correct firm, run seed |
| API down | Start API; check DATABASE_URL, Redis, port |

See also: [launch-readiness-runbook.md](launch-readiness-runbook.md), [demo-setup.md](demo-setup.md), [troubleshooting.md](troubleshooting.md), [demo-day-checklist.md](demo-day-checklist.md).
