# Full Sellable MVP Pass — Summary

This document summarizes the current state of the Onyx Intel marketing + MVP app after the full sellable-MVP pass. Everything is built to be **demoable and credible** with minimal speculative work; demo-backed surfaces are clearly separated from what will need backend wiring.

---

## Completed changes

### 1. Working lead capture
- **`POST /api/leads`** — Validation (required fields, email format), honeypot, rate limit (5/min per IP). Saves to DB via Prisma when `DATABASE_URL` is set; falls back to Resend email when `RESEND_API_KEY` and `LEAD_NOTIFICATION_EMAIL` are set; if both missing, logs lead and returns 200 so the form never fails.
- **DemoForm** — Loading, success, error, and field-level error states. Success state uses dark-theme teal checkmark. Submit button: “Book a demo.”
- **All demo/request forms** that POST to `/api/leads` (homepage, `/demo`) work end-to-end.

### 2. Real dashboard route
- **`/dashboard`** — Full dashboard page with Header, upload entry card, KPI cards (documents processed, cases active, providers found, billing extracted), recent documents table, treatment timeline preview, review queue panel, integration status card, activity feed.
- **Nav** — “Dashboard” link in Header (desktop + mobile) and Hero “See the dashboard” CTA.
- **Loading** — `dashboard/loading.tsx` shows spinner while route loads.

### 3. Upload and processing flow
- **`/dashboard/upload`** — Drag-and-drop + file picker (PDF), “Process document” triggers mock extraction, step-by-step processing UI (upload → detect type → extract provider/dates → parse billing/timeline → complete), then redirect to result.
- **`/dashboard/documents/[id]`** — Reads result from sessionStorage; shows document type, provider, date range, billing (if any), timeline entries, confidence, review flag. “Upload another” and “Back to Dashboard” links.
- **Dashboard** — “Upload document” card links to `/dashboard/upload`.

### 4. Review queue and activity
- **Review queue panel** — Lists items needing review (document name, case, reason, priority). Empty state: “All caught up.” Loading skeleton.
- **Activity feed** — Sync completed, documents processed, processing, billing extracted, sync failed, review flagged. Success / failed / in-progress states (green, amber, blue pulse). Empty state and loading.
- **Integration status card** — Clio connected, last/next sync, matters synced. Supports `synced` | `syncing` | `failed` for future use.
- **Recent documents table** — Status badges: Processing, Review needed, Processed, Synced, Failed.

### 5. Trust / legal pages
- **`/privacy`** — Privacy policy (info collected, use, security, cookies, subprocessors, international, rights, contact). Legal-review disclaimer and link to Terms.
- **`/terms`** — Terms of service (agreement, services, acceptable use, IP, termination, liability, dispute resolution, contact). Legal-review disclaimer and link to Privacy.
- **Footer** — Privacy and Terms links. **TrustStrip** in footer: Security, Privacy, Terms cards with short summaries and links.

### 6. Better product visuals
- **DashboardPreview** (Solution, Features, Platform, Product Tour) — Workflow-based: treatment timeline, billing extracted, providers extracted, document categories, sync status, review-needed panel, recent activity strip. Same case/story as real dashboard. No “+ 7 more” placeholders.
- **CaseIntelligenceDashboard** — Real metrics (5 visits, $47,892, 12 docs, Synced 2m ago) and “1 review needed” callout; ready to drop into a page if needed.
- **Integrations** — Pill styling fixed (readable text on dark background).

### 7. Stronger homepage conversion
- **Hero** — “Medical records → timelines, billing, sync. Automatically.” Concrete subline and “Book a 15‑min demo” / “See the dashboard” / “How it works.” Trust line: “See the product in 15 minutes. No commitment.”
- **Section order** — Hero → Solution → How it works → Problem → Features → Integrations → Demo. Product and flow before pain.
- **Solution** — “Upload once. Get timelines, billing, and sync—automatically.” Concrete bullets; CTA “Book a demo.”
- **How it works** — Concrete step copy; CTA “Book a 15‑min demo” at bottom; connector line color fixed for dark theme.
- **Features** — “Built for PI: organize, timeline, bill, sync.”
- **Demo section** — Trust strip above form; “Book a 15‑min demo” and “We’ll show you the dashboard, upload flow, and how sync works with your CMS.”

### 8. Demo data foundation
- **`src/lib/demo-seed.ts`** — Central seed: cases, providers, documents, timeline events, billing, review flags, sync activity, integration status. Types aligned with likely backend models. Getters: `getRecentDocuments`, `getReviewQueue`, `getTimelineForCase`, `getBillingForCase`, `getActivityFeed`, `getDashboardKpis`, `getIntegrationStatus`, `getProviders`.
- **`src/lib/demo-dashboard-data.ts`** — Derives all dashboard view data from `demo-seed`.
- **`src/lib/demo-extraction.ts`** — Mock extraction uses seed providers and timeline so upload results match dashboard story; sessionStorage for result handoff.

### 9. Cleanup
- Removed unused **PlatformCapabilities** import from homepage.

---

## Routes added

| Route | Purpose |
|-------|---------|
| `/dashboard` | Main app dashboard (KPIs, documents, timeline, review queue, integration, activity). |
| `/dashboard/upload` | Upload PDF → processing → redirect to result. |
| `/dashboard/documents/[id]` | Extraction result for a job id (from sessionStorage in demo). |
| `/privacy` | Privacy policy. |
| `/terms` | Terms of service. |
| `POST /api/leads` | Lead capture (validation, DB/email/fallback). |

---

## Components added

| Component | Location | Purpose |
|-----------|----------|---------|
| DashboardKpiCard | `components/dashboard/` | Single KPI with optional accent and loading. |
| RecentDocumentsTable | `components/dashboard/` | Documents table with status badges, empty/loading. |
| ReviewQueuePanel | `components/dashboard/` | Review-needed list with empty/loading. |
| TreatmentTimelinePreview | `components/dashboard/` | Timeline entries for a case. |
| IntegrationStatusCard | `components/dashboard/` | Clio (or other) connection and sync status. |
| ActivityFeed | `components/dashboard/` | Recent sync/processing activity. |
| DocumentResultPanel | `components/dashboard/` | Extraction result (type, provider, dates, billing, timeline, confidence, review). |
| TrustStrip | `components/` | Footer trust block: Security, Privacy, Terms. |

---

## What now works end-to-end

1. **Visitor lands on homepage** → Sees clear value prop, “Book a 15‑min demo,” “See the dashboard,” and how it works.
2. **Clicks “Book a demo”** → Goes to `/demo` or scrolls to #demo; fills form; submits to `/api/leads`; sees success or validation/error. Lead is stored (DB or email) or logged.
3. **Clicks “See the dashboard”** → Goes to `/dashboard`; sees KPIs, recent documents, timeline, review queue, integration status, activity feed; can click “Upload document.”
4. **Clicks “Upload document”** → Goes to `/dashboard/upload`; drops or selects PDF; clicks “Process document”; sees processing steps; redirects to `/dashboard/documents/[id]` with extraction result (type, provider, dates, billing if any, timeline, confidence, review flag).
5. **Trust** → Footer and TrustStrip link to Security, Privacy, Terms. Privacy and Terms pages are complete for demo/sales use with legal-review callouts.

---

## What is demo-backed

- **Dashboard data** — KPIs, recent documents, review queue, timeline, integration status, activity feed all come from `demo-seed` via `demo-dashboard-data`. No API yet.
- **Upload “processing”** — No real OCR/NLP. `runMockExtraction(fileName)` in `demo-extraction` derives result from filename and seed providers/timeline. File is not stored server-side.
- **Result page** — Result is in sessionStorage under `onyx-demo-extraction-{jobId}`. Reload or new tab loses it unless you upload again.
- **Integration status** — Static “Clio connected, last sync 2 min ago” from seed. No live CMS connection.

All of the above are clearly commented in code and structured so they can be replaced with API calls without changing component APIs.

---

## Top 5 next priorities

1. **Backend extraction pipeline** — Replace `runMockExtraction()` with a real pipeline (or third-party API) that processes the uploaded file and returns document type, provider, dates, billing, timeline. Persist job and result in DB; document result page fetches by job or document id.
2. **Dashboard API** — Replace `demo-dashboard-data` getters with `GET /api/dashboard` (or equivalent) returning KPIs, documents, review queue, activity, integration status from your DB and integrations.
3. **Persistence and env** — Ensure `DATABASE_URL` is set and migrations run so leads save to DB. Optionally set `RESEND_API_KEY` and `LEAD_NOTIFICATION_EMAIL` for email fallback. Add a simple admin or export to view leads.
4. **Auth (optional for MVP)** — If the dashboard should be gated, add sign-in (e.g. NextAuth or similar) and protect `/dashboard`, `/dashboard/upload`, and document result by user/org.
5. **Legal and contact** — Have counsel review Privacy and Terms; replace placeholder contact emails (`privacy@`, `legal@`) with real addresses and confirm governing law/jurisdiction.
