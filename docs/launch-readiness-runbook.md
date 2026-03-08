# Launch-readiness runbook

Operator-friendly guide: get services up, seed demo data, and run smoke and seeded regression tests.

**Full setup:** [demo-setup.md](demo-setup.md) — step-by-step env and credentials.  
**E2E details:** [local-testing.md](local-testing.md) — all test commands and config.  
**CI:** [ci-testing.md](ci-testing.md) — running smoke in CI.

---

## 1. Install once

From **repo root:**

```bash
pnpm install --frozen-lockfile
```

Requires **Node.js** v18+, **pnpm** (see root `package.json`), **PostgreSQL** (for API), **Redis** (default `redis://localhost:6379`).

---

## 2. Environment

- **API:** Copy `apps/api/.env.example` → `apps/api/.env`. Set `DATABASE_URL`, `REDIS_URL` (optional; defaults to localhost:6379).
- **Web:** Copy `apps/web/.env.example` → `apps/web/.env.local`. Set `DOC_API_URL=http://127.0.0.1:4000` and `DOC_API_KEY=sk_live_...` (create key after firm exists; see step 4).

---

## 3. Startup order

1. **Database:** `cd apps/api && pnpm exec prisma migrate deploy`
2. **API (port 4000):** `cd apps/api && pnpm dev`
3. **Web (port 3000):** `cd apps/web && pnpm dev`

---

## 4. Demo “login” and seed

App uses API-key auth (no login form). “Login” = dashboard loads with a valid key.

1. **Create firm and API key** (API must be running):
   ```bash
   curl -s -X POST http://127.0.0.1:4000/dev/create-firm -H "Content-Type: application/json" -d '{"name":"Demo Firm"}' | jq
   # Use "id" as YOUR_FIRM_ID:
   curl -s -X POST "http://127.0.0.1:4000/dev/create-api-key/YOUR_FIRM_ID" -H "Content-Type: application/json" -d '{"name":"Web app"}' | jq
   ```
2. Set the returned `apiKey` in `apps/web/.env.local` as `DOC_API_KEY=sk_live_...`. Restart web if it’s already running.
3. **Seed demo data:** Open http://localhost:3000/dashboard and click **Generate demo data**, or from CLI (set `DOC_API_KEY` in `apps/api/.env` for the same firm): `cd apps/api && pnpm run seed:demo:http`. Ensure `DOC_API_KEY` in `apps/web/.env.local` matches the seeded firm.

---

## 5. Run tests

**Smoke** (key routes; works with or without API/demo data):

```bash
cd apps/web
pnpm test:e2e tests/smoke.spec.ts
```

Install Playwright browsers once: `cd apps/web && pnpm exec playwright install chromium`.

**Seeded regression** (full flows; skips if dashboard shows “Missing DOC_API…”):

```bash
cd apps/web
pnpm test:e2e tests/demo-regression.spec.ts
```

For a full run with no skips: web + API running, `DOC_API_KEY` in `apps/web/.env.local`, demo seed applied. See [demo-setup.md](demo-setup.md) and [local-testing.md](local-testing.md).

---

## 6. Troubleshooting

| Issue | What to do |
|-------|------------|
| **API not running** | Start API: `cd apps/api && pnpm dev`. Check `apps/api/.env` has `DATABASE_URL`; run migrations if needed. Health: `curl -s http://127.0.0.1:4000/health` → `{"ok":true}`. |
| **Missing API URL / DOC_API_KEY** | Dashboard shows “Missing DOC_API…”. Set `DOC_API_URL` and `DOC_API_KEY` in `apps/web/.env.local`. Restart web: `cd apps/web && pnpm dev`. |
| **Demo seed not run** | Dashboard loads but no cases/documents. Click **Generate demo data** at http://localhost:3000/dashboard, or `cd apps/api && pnpm run seed:demo:http` (set `DOC_API_KEY` in `apps/api/.env` for the firm to seed). Ensure `DOC_API_KEY` in `apps/web/.env.local` matches the seeded firm. |
| **Demo user missing** | “Demo user” = valid `DOC_API_KEY` for a firm. Create firm + key (step 4). Put returned `apiKey` in `apps/web/.env.local` as `DOC_API_KEY`. |
| **Playwright browser missing** | Error: “Executable doesn’t exist”. Run `cd apps/web && pnpm exec playwright install chromium` (or `playwright install` for all). |
| **Wrong port / base URL** | E2E uses `PLAYWRIGHT_BASE_URL` (default http://localhost:3000). If web runs on another port: `PLAYWRIGHT_BASE_URL=http://localhost:3001 pnpm test:e2e …`. If API runs on another port, set `DOC_API_URL` in `apps/web/.env.local` (e.g. `http://127.0.0.1:4001`). |

More causes and fixes: [troubleshooting.md](troubleshooting.md). Reset demo / reseed: [runbook.md](runbook.md).

---

## See also

- [demo-setup.md](demo-setup.md) — full setup and demo credentials
- [local-testing.md](local-testing.md) — E2E commands, config, test stability
- [runbook.md](runbook.md) — reset demo, reseed, login/API failures
- [troubleshooting.md](troubleshooting.md) — detailed cause/fix for setup and env
- [ci-testing.md](ci-testing.md) — running smoke in CI
