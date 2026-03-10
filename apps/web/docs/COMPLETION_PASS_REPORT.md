# Filevine-inspired redesign — completion pass report

## A. Functional gaps found

1. **Chronologies / Demands sidebar** — Both linked to `/dashboard/cases` (duplicate of Cases). No dedicated pages.
2. **Documents Today** — Card showed `docsProcessedThisMonth` with subtext "This month"; label said "Documents today" (misleading).
3. **Missing Records card** — Always showed 0 with no backend wiring.
4. **Chronologies In Progress / Demands In Progress** — Showed case count but linked to `/dashboard/cases`; no links to chronologies/demands views.
5. **Overdue Records Requests panel** — Static "no overdue" copy; `/me/needs-attention` data not used.
6. **Case detail AI actions** — All buttons were clickable but had no behavior (no API calls or disabled/coming-soon state).
7. **Case detail tab from URL** — No support for `?tab=chronology` or `?tab=demands` to open the correct tab from Chronologies/Demands lists.
8. **Dashboard** — Activity feed and queue-status were called but API had no GET `/activity-feed` or GET `/me/queue-status`; metrics-summary had no `docsProcessedToday`.
9. **Case detail page** — Missing `export default function CaseDetailPage()` declaration (syntax/parse error under build).

---

## B. Exact files changed

| File | Changes |
|------|--------|
| `apps/web/docs/FUNCTIONAL_GAPS_AUDIT.md` | **New.** Short audit: what works, placeholder, misrouted, backend exists, scaffold needs. |
| `apps/web/app/dashboard/chronologies/page.tsx` | **New.** Chronologies list page: cases table with links to `/dashboard/cases/[id]?tab=chronology`. |
| `apps/web/app/dashboard/demands/page.tsx` | **New.** Demands list page: cases table with links to `/dashboard/cases/[id]?tab=medical-bills`. |
| `apps/web/components/dashboard/DashboardSidebar.tsx` | Chronologies href: `/dashboard/cases` → `/dashboard/chronologies`; Demands → `/dashboard/demands`. |
| `apps/web/app/dashboard/page.tsx` | Summary type + `docsProcessedToday`; `needsAttention` state and fetch; `loadingNeedsAttention`; Documents card uses `docsProcessedToday` when present and "Today" subtext; Missing Records uses `unmatchedDocs` and "Unmatched" subtext; Chronologies/Demands cards link to `/dashboard/chronologies` and `/dashboard/demands`; Overdue panel wired to `needs-attention` (count + items + links). |
| `apps/web/app/dashboard/cases/[id]/page.tsx` | Restored `export default function CaseDetailPage()`; added `useSearchParams`; `useEffect` to set `activeTab` from `?tab=`; AI_ACTIONS with `comingSoon`; `chronologyRebuilding` state; `rebuildChronology()` calling POST `/cases/:id/timeline/rebuild` and refetching timeline; AI buttons: Build chronology wired, others disabled with "(coming soon)"; single-return structure with loading/error/main content. |
| `apps/web/locales/en.json` | `dashboard.today`, `dashboard.unmatchedDocs` added. |
| `apps/web/locales/es.json` | Same keys added. |
| `apps/api/src/http/server.ts` | Import `getJobCounts` from `../services/jobQueue`; metrics-summary: `todayStart` UTC, `docsProcessedTodayCount` from `Document.processedAt >= todayStart`, added to summary; new GET `/me/queue-status` returning `db: { queued, running, failed }`, `documentPipelinePending`. |

---

## C. New routes added

| Route | Purpose |
|-------|--------|
| `/dashboard/chronologies` | List cases with links to case detail Chronology tab. |
| `/dashboard/demands` | List cases with links to case detail Medical Bills tab. |

No new API routes; existing `/cases`, `/cases/:id/timeline/rebuild`, `/me/metrics-summary`, `/me/needs-attention` used. Added implementation only: `/me/queue-status` and `docsProcessedToday` in metrics-summary.

---

## D. Data wiring changes made

- **Dashboard summary cards**  
  - Documents: value = `summary.docsProcessedToday` when present, else `summary.docsProcessedThisMonth`; subtext = "Today" vs "This month".  
  - Missing Records: value = `summary.unmatchedDocs`; subtext = "Unmatched".  
  - Chronologies In Progress / Demands In Progress: links to `/dashboard/chronologies` and `/dashboard/demands`; values unchanged (case count).  
- **Dashboard Overdue panel**  
  - Fetches `/me/needs-attention`; shows `overdueCaseTasks.count` + `recordsRequestsNeedingFollowUp.count`, with up to 2 list items and links to case and records-request detail.  
- **API metrics-summary**  
  - `docsProcessedToday`: count of `Document` where `firmId` and `processedAt >= todayStart` (UTC).  
- **API queue-status**  
  - GET `/me/queue-status`: returns `getJobCounts(firmId)` as `db: { queued, running, failed }` and `documentPipelinePending: queued + running`.  

---

## E. AI actions connected vs disabled

| Action | Status |
|--------|--------|
| Build chronology | **Connected.** Calls POST `/cases/:id/timeline/rebuild`, then refetches timeline; button shows "Rebuilding…" while in progress. |
| Summarize this packet | Disabled, "(coming soon)". |
| Extract providers/dates/costs | Disabled, "(coming soon)". |
| Identify missing records | Disabled, "(coming soon)". |
| Compare bills to treatment | Disabled, "(coming soon)". |
| Draft demand section | Disabled, "(coming soon)". |
| Answer questions about case file | Disabled, "(coming soon)". |

---

## F. Role visibility confirmation

- **No changes** to role-based visibility in this pass.  
- Sidebar still uses `DashboardAuthContext`: `canAccessTeam`, `canAccessBilling`, `canAccessFirmSettings`, `canAccessIntegrations`, `canAccessAuditQuality`, `isStaffOrAbove`, `platformAdminOnly` for nav items.  
- New pages Chronologies and Demands are visible to all roles that see the sidebar (no extra gating).  
- API routes used (`/me/metrics-summary`, `/me/needs-attention`, `/me/queue-status`, `/cases`, `/cases/:id/timeline/rebuild`) remain behind existing `auth` and `requireRole(Role.STAFF)`.  
- **Remaining:** Management-only vs staff-only distinctions are unchanged; no new permission logic added.

---

## G. Verification results

- **Web app build:** `pnpm run build` in `apps/web` **succeeds** (Next.js 14).  
- **New routes in build:** `dashboard/chronologies`, `dashboard/demands` appear in the build output.  
- **API build:** `pnpm run build` in `apps/api` **fails** with **pre-existing** TypeScript errors (e.g. `requireRole` PARALEGAL/LEGAL_ASSISTANT/DOC_REVIEWER, `express-session`, integrations/Prisma, recordsRequests schema/typing). None of the reported errors reference `server.ts`, `getJobCounts`, or `queue-status`.  
- **Route loading / sidebar / links:** Not re-tested in a browser; structure and hrefs are consistent and point to existing or new pages.  
- **Case detail:** Tab from URL and AI behavior implemented as above; build passes.

---

## H. Remaining backend/API gaps still not solved

1. **GET /activity-feed** — Dashboard calls `activity-feed?limit=10`; no such route. Activity feed items are created via `createActivityFeedItem` but there is no GET handler. Schema may not expose `ActivityFeedItem` in Prisma (migration-only table).  
2. **True “missing records” metric** — Missing Records card now shows `unmatchedDocs` (unmatched documents) with subtext "Unmatched". A dedicated missing-records count or model is not implemented.  
3. **Chronologies / Demands in progress** — Still shown as case count; no per-case “chronology in progress” or “demand in progress” flags in this pass.  
4. **AI actions (except Build chronology)** — No backend for summarize, extract, missing-records, compare, draft, Q&A; all left as disabled/coming soon.  
5. **API TypeScript/build** — Pre-existing failures in `requireRole`, `session`, integrations routes, recordsRequests routes (and possibly others) remain and are outside this pass.
