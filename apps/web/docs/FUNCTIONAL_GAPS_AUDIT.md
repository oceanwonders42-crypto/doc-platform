# Functional gaps audit — completion pass

## What already works
- **/dashboard:** Loads; uses /me/metrics-summary, /cases, activity-feed?limit=10, /me/queue-status. Summary cards show case count, needs review, etc. Panels show Review Queue count, Recently Updated Cases (from cases), placeholder text for Missing Doc, AI Exceptions, Overdue, Team.
- **/dashboard/cases:** List from GET /cases. Works.
- **/dashboard/cases/[id]:** Tabbed case detail; Overview, Chronology, Medical Bills, Documents, Contacts use real data. Missing Records, Demands, Tasks, Activity, Notes are placeholder.
- **Sidebar:** Chronologies and Demands link to /dashboard/cases (same as Cases). Reports → /dashboard/analytics. Review, Records Requests, Documents, etc. have real routes.
- **Dashboard data sources:** metrics-summary (docsProcessedThisMonth, needsReviewDocs, unmatchedDocs, recordsRequestsCreatedThisMonth); cases (list); activity-feed (called but no GET route in API); queue-status (called but no /me/queue-status route in API).
- **API:** GET /cases, GET /me/metrics-summary, GET /me/review-queue, GET /me/needs-attention (unmatched, failed, overdueCaseTasks, recordsRequestsNeedingFollowUp), GET /me/overdue-tasks, GET /records-requests/dashboard, GET /records-requests. POST /cases/:id/timeline/rebuild, POST /cases/:id/narrative (AI). No GET /activity-feed, no GET /me/queue-status.

## What is placeholder
- "Documents today" card shows docsProcessedThisMonth (misleading label).
- Missing Records card shows 0; Chronologies In Progress and Demands In Progress show case count (proxy).
- Panels: Missing Documentation Alerts, AI Exceptions, Overdue Records Requests, Team Workload are static copy or empty state.
- Case detail tabs: Missing Records, Demands, Tasks, Activity, Notes are placeholder copy.
- AI action buttons: no behavior.

## What is misrouted
- Chronologies and Demands both link to /dashboard/cases (duplicate of Cases).

## What backend support already exists
- Document.processedAt for "documents processed today" count.
- /me/needs-attention returns recordsRequestsNeedingFollowUp (count + items), overdueCaseTasks.
- Job model (firmId, status: queued|running|failed|done) for queue counts via getQueueCounts.
- ActivityFeedItem table exists (migration); createActivityFeedItem used; no GET route. Schema may not expose ActivityFeedItem in Prisma (migration-only table).

## What needs to be scaffolded
- /dashboard/chronologies: real page (case list + links to case#chronology).
- /dashboard/demands: real page (case list + links to case#medical-bills or #demands).
- Documents today: either add docsProcessedToday to metrics-summary or rename card to "Documents this month".
- /me/queue-status: return { ok, db: { queued, running, failed }, documentPipelinePending } from Job counts + optional Redis.
- Dashboard panels: wire Overdue to needs-attention.recordsRequestsNeedingFollowUp and overdueCaseTasks; keep honest empty states for Missing Doc, AI Exceptions, Team.
- Case detail AI buttons: disable with "Coming soon" or connect Build chronology to existing timeline rebuild.
