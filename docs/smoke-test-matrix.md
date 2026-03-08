# Smoke-test matrix

For each key route/flow: what must be running, expected result, common failure, and severity if broken.

| Route / flow | What must be running | Expected result | Common failure | Severity if broken |
|--------------|----------------------|-----------------|----------------|--------------------|
| **Dashboard** `/dashboard` | Web, API | Page loads; firm name and usage or "Recent documents" section; or "Missing DOC_API" if no key | API down → fetch errors. Missing DOC_API_KEY → env message | **High** — main entry |
| **Login** (API key) | Web, API | Dashboard loads when DOC_API_KEY is set in web env; no login form | Wrong key or no key → env error or empty/401 | **High** |
| **Cases list** `/cases` | Web, API | Page loads; "Cases" heading; list or "No cases yet" | API down → empty or error | **High** |
| **Case detail** `/cases/:id` | Web, API | Page loads; case title/number or "Not found" | Wrong id → 404/empty. API down → error | **High** |
| **Case timeline** `/cases/:id/timeline` | Web, API | Page loads; "Case timeline" or "Timeline" / "Medical" / "Events" / "No timeline" | Wrong id → 404. API down → empty. Smoke uses first case from list or demo-case-1. | **Medium** |
| **Case narrative** `/cases/:id/narrative` | Web, API | Page loads; "Demand Narrative Assistant" or "Narrative type" / "add-on is not enabled" | Wrong id → 404. Feature flag can disable UI. Smoke uses first case from list or demo-case-1. | **Medium** |
| **Documents list** (dashboard section) | Web, API | "Recent documents" section; table or "No documents" / Loading | API down → error or empty | **High** |
| **Document detail** `/documents/:id` | Web, API | Page loads; doc metadata or error/not found | Invalid id or API down | **Medium** |
| **Review queue** `/dashboard/review` | Web, API | "Review queue" heading; table with columns or empty state | API down → empty or error | **High** |
| **Providers** `/providers` | Web, API | "Providers" or list; page loads | API down → empty or error | **Medium** |
| **Provider detail** `/providers/:id` | Web, API | Page loads; "Provider" / "Contact" / "Cases" or "not found" | No provider → test skips when list empty. | **Medium** |
| **Records requests** `/records-requests` | Web, API | "Records requests" heading; list or empty state | API down → error | **Medium** |
| **Records request detail** `/records-requests/:id` | Web, API | Page loads; "Records request" or "not found" | No request → skip in E2E | **Medium** |
| **Usage** `/dashboard/usage` | Web, API | "Usage" / "Usage & metering" or env error | Missing DOC_API_KEY → error | **Medium** |
| **Analytics** `/dashboard/analytics` | Web, API | "Analytics" heading or env error | Missing DOC_API_KEY → error | **Medium** |
| **Document audit** (on document detail) | Web, API | "Audit trail" section on `/documents/:id` | Part of document detail smoke | **Low** |
| **Admin firms** `/admin/firms` | Web, API, optional PLATFORM_ADMIN_API_KEY | Page loads; "Platform firms" or list or auth/error message | Missing admin key → error message | **Low** |
| **Admin firm detail** `/admin/firms/:id` | Web, API, optional PLATFORM_ADMIN_API_KEY | Page loads; "Firm" / "Users" / "Documents" or "Not found" | No firm → skip in E2E. Missing admin key → Not found. | **Low** |
| **Admin demo** `/admin/demo` | Web, API | Page loads; "Demo seed" / "Seed demo data" or error message | API/env error when seeding; page itself loads. | **Low** |
| **Admin debug** `/admin/debug` | Web | "Admin Debug" or "Quick links"; no API key required | — | **Low** |
| **Admin errors** `/admin/errors` | Web, API, optional PLATFORM_ADMIN_API_KEY | Page loads; "System errors" or list or "No errors" or "Failed to load" / auth error | Missing PLATFORM_ADMIN_API_KEY → error message | **Low** |
| **Admin jobs** `/admin/jobs` | Web, API, optional PLATFORM_ADMIN_API_KEY | Page loads; "Background jobs" or list or "No jobs" or "Failed to load" / auth error | Missing PLATFORM_ADMIN_API_KEY → error message | **Low** |
| **Admin quality** `/admin/quality` | Web, API, optional PLATFORM_ADMIN_API_KEY | Page loads; "Quality control" or analytics/error message | API/auth error → "Failed to load analytics" or env message | **Low** |
| **Admin dashboard** `/admin/dashboard` | Web, API, optional PLATFORM_ADMIN_API_KEY | Page loads; "Admin Dashboard" or "Total firms" / error message | Missing admin key → "Failed to load firms" or env message | **Low** |

## Severity guide

- **High:** Core demo and daily use; broken = app appears down or unusable.
- **Medium:** Important but workarounds exist (e.g. other pages work).
- **Low:** Admin/support; not critical for typical demo.

## What “running” means

- **Web:** Next.js dev server on port 3000 (`cd apps/web && pnpm dev`).
- **API:** Express API on port 4000 (`cd apps/api && pnpm dev`), with DATABASE_URL and REDIS_URL set and migrations applied.
- **DOC_API_KEY** in `apps/web/.env.local` is required for dashboard and all API-backed pages to show data; without it, dashboard may show env error.

## E2E coverage

- **smoke.spec.ts** covers: login (dashboard load), dashboard, cases list, case detail, **case timeline** (first case from list or demo-case-1), **case narrative** (first case from list or demo-case-1), documents list (section), document detail + audit trail (when link exists), review page (load + table header), providers, **provider detail** (when link exists), records requests list, records request detail (when link exists), usage, analytics, admin firms, **admin firm detail** (when firm exists), **admin demo**, admin debug, **admin errors**, **admin jobs**, **admin quality**, **admin dashboard**, sidebar navigation.
- **demo-flow.spec.ts** covers: dashboard load, cases list, case detail (demo-case-1).
- **demo-regression.spec.ts** covers: **login → dashboard** (gated), **dashboard → cases → case detail** (gated), **dashboard → cases → case timeline** (gated), **dashboard → cases → case narrative** (gated), **dashboard → documents → document detail** (gated), **dashboard → review queue** (gated), **dashboard → records requests → records request detail** (gated; skips when no request exists), **dashboard → providers → provider detail** (gated; skips when no provider exists). **Skips** when dashboard shows env error (no API/key). For full run: API + DOC_API_KEY + demo seed.
- **review_queue.spec.ts** covers: review queue load (shared assertion helper), table header, preview, confirm/reject/route, bulk actions.

See [local-testing.md](local-testing.md) for how to run these tests. For CI commands and workflow, see [ci-testing.md](ci-testing.md).
