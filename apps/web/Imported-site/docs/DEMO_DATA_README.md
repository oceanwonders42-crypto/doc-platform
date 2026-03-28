# Demo Data Layer — MVP App Surfaces

Centralized seeded/demo data so the dashboard and upload-result workflows feel real before the backend is complete.

## Files

| File | Role |
|------|------|
| **`src/lib/demo-seed.ts`** | Single source of truth: cases, documents, providers, timeline events, billing, review flags, sync activity. Exports types and derived getters. |
| **`src/lib/demo-dashboard-data.ts`** | Dashboard view: re-exports from `demo-seed` (e.g. `getRecentDocuments()`, `getReviewQueue()`, `getTimelineForCase("c1")`) so the dashboard page imports one place. |
| **`src/lib/demo-extraction.ts`** | Mock extraction for upload flow: uses seed providers and timeline so upload results match the dashboard story. SessionStorage for result handoff until API exists. |

## Shape of Demo Data

- **Cases** — `id`, `name`, `matterNumber`, `cmsMatterId?` (e.g. Johnson v. Defendant, Martinez v. City).
- **Providers** — `id`, `name`, `type` (Emergency, Primary Care, Imaging, PT, Lab, etc.).
- **Documents** — `id`, `caseId`, `name`, `category`, `status` (Processing \| Review needed \| Processed \| Synced \| Failed), `processedAt`.
- **Timeline events** — `id`, `caseId`, `date`, `eventType`, `eventLabel`, `providerName`.
- **Billing** — per case: `totalAmount`, `lineItems[]` (`label`, `amount`).
- **Review flags** — `documentId`, `documentName`, `caseLabel`, `reason`, `priority` (high \| medium \| low).
- **Sync activity** — `action`, `detail`, `at`, `success` (boolean \| null for in-progress).
- **Integration status** — `provider`, `connected`, `syncStatus?`, `lastSyncAt`, `nextSyncIn`, `mattersSynced`.

## Components / Routes Using It

- **`/dashboard`** — `src/app/dashboard/page.tsx` imports `demo-dashboard-data` (KPIs, recent documents, review queue, timeline, integration, activity).
- **`/dashboard/upload`** — Uses `runMockExtraction()` from `demo-extraction`, which reads providers and timeline from `demo-seed`.
- **`/dashboard/documents/[id]** — Reads result from sessionStorage (written by upload); extraction result shape matches seed providers/timeline.
- **Marketing `DashboardPreview`** — Uses its own inline data; could be switched to import from `demo-seed` for one story.

## Replacing With Live Data Later

1. **Backend** — Add APIs that return the same shapes (or DTOs you map to these types).
2. **`demo-dashboard-data.ts`** — Replace each getter with `fetch`/`useSWR`/server component; keep export names so the dashboard page does not change.
3. **`demo-seed.ts`** — Remove or keep only types; have dashboard-data (or a new `api/dashboard.ts`) call your APIs.
4. **`demo-extraction.ts`** — Replace `runMockExtraction()` with `POST /api/extract`; replace `getStoredResult(id)` with `GET /api/jobs/:id` or `GET /api/documents/:id`.
