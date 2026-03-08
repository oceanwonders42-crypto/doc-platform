# Support & Admin

Short reference for support and admin flows. (Not a substitute for full product docs.)

## Admin pages

- **Firms** — `/admin/firms` — List firms; requires `PLATFORM_ADMIN_API_KEY` in `apps/web/.env.local` for API calls.
- **Quality** — `/admin/quality` — Quality/review metrics.
- **Errors** — `/admin/errors` — System error log view.
- **Jobs** — `/admin/jobs` — Background job list and retry.
- **Debug** — `/admin/debug` — Dev/debug utilities (e.g. ingest test).

## Env for admin

| Variable | Used by | Purpose |
|----------|---------|---------|
| `DOC_API_URL` | Web | API base URL (e.g. `http://127.0.0.1:4000`). |
| `DOC_API_KEY` | Web | Firm API key for dashboard and most app flows. |
| `PLATFORM_ADMIN_API_KEY` | Web | Admin API key for admin-only routes (e.g. firms list). |

Create admin keys via API (e.g. `POST /admin/dev/create-api-key` when implemented) or use a firm key that has admin scope if your backend supports it.

## Demo seed

- **From UI:** Dashboard → “Generate demo data” (dev or when `DEMO_MODE=true`).
- **From CLI:** `cd apps/api && pnpm run seed:demo:http` (requires `DOC_API_KEY` in `apps/api/.env`; API must be running).

Demo creates one firm (if none), 3 cases (demo-case-1, demo-case-2, demo-case-3), 10 documents, and timeline events. After seeding, ensure `DOC_API_KEY` in `apps/web/.env.local` is for that firm so the dashboard shows data.

## Reporting / support checks

- **Dashboard** — Usage, recent activity, needs attention; “Recent documents” table and filters.
- **Review queue** — NEEDS_REVIEW documents; confirm/reject/route; preview drawer.
- **Cases** — List and detail; documents tab; timeline; records requests.
- **Documents** — Detail page: recognition, routing, audit, duplicates.
- **Providers** — List and provider detail (if used).
- **Records requests** — List and detail; letter generation, send.

For full step-by-step verification, use [README_DEV_SMOKE_TEST.md](../README_DEV_SMOKE_TEST.md) at repo root.
