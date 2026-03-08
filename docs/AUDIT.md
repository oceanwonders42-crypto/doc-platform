# Onyx Intel — Dashboard & audit summary

**Generated:** Manual audit  
**Scope:** Dashboard app (apps/web), API audit endpoints, activity/audit data

---

## 1. Audit features

### 1.1 Activity audit (document/case trail)

| Location | Description |
|----------|-------------|
| **API** `apps/api/src/services/audit.ts` | `addDocumentAuditEvent()` — writes to `DocumentAuditEvent` (firmId, documentId, actor, action, fromCaseId, toCaseId, metaJson). |
| **API** `GET /documents/:id/audit` | Returns audit events for a single document (firm-scoped). |
| **API** `GET /documents/:id/audit-events` | Alias for above. |
| **API** `GET /cases/:id/audit` | Returns document audit events where `fromCaseId` or `toCaseId` = caseId. |
| **API** `GET /me/audit-events` **(new)** | Firm-wide audit log: recent `DocumentAuditEvent` (limit 50/100/200), ordered by `createdAt` desc. |
| **Dashboard** `/dashboard/audit` **(new)** | Audit log page: table of time, actor, action, document link, case link; limit selector. |
| **Sidebar** | "Audit" link added to dashboard nav (between Analytics and Usage). |

**Model** `DocumentAuditEvent`: id, documentId, firmId, actor, action, fromCaseId, toCaseId, metaJson, createdAt.

### 1.2 Project/codebase audit (debug)

| Location | Description |
|----------|-------------|
| **Web** `app/debug/audit/page.tsx` | Debug page that shows project audit (git, routes, API files, DB, build, TODOs, migrations). |
| **Web** `app/api/debug/audit/route.ts` | Reads `../audit/latest_audit.json`; run `pnpm run audit` at repo root to generate. |

---

## 2. Dashboard structure (post-audit)

- **Layout:** Dark theme (globals.css), sidebar + header, breadcrumbs.
- **Routes:** Dashboard, Cases (list + detail), Documents (list + detail), Providers (list + detail), Records Requests (existing), Review Queue, Analytics, **Audit**, Usage, Integrations, Settings.
- **API usage:** All dashboard pages use `getApiBase()`, `getAuthHeader()`, `parseJsonResponse()` from `lib/api.ts`; no hardcoded API URL.

---

## 3. Recommendations

1. **Audit retention:** If compliance requires long-term retention, consider archiving `DocumentAuditEvent` (e.g. by date) or a separate audit export job.
2. **Audit filters:** Add optional filters on `/me/audit-events` (e.g. by actor, action, date range, documentId) if needed.
3. **Activity feed vs audit:** `/activity-feed` returns `ActivityFeedItem` (CRM-style); `/me/audit-events` returns `DocumentAuditEvent`. Use audit for compliance trail, activity feed for user-facing “recent activity.”
4. **Debug audit:** Ensure `pnpm run audit` exists at monorepo root and writes `audit/latest_audit.json` so `/debug/audit` works.

---

## 4. Files changed in this audit pass

- **API:** `apps/api/src/http/server.ts` — added `GET /me/audit-events`.
- **Web:** `apps/web/app/dashboard/audit/page.tsx` — new Audit log page.
- **Web:** `apps/web/components/dashboard/DashboardSidebar.tsx` — added Audit to `NAV_ITEMS`.
- **Web:** `apps/web/components/dashboard/DashboardHeader.tsx` — added Audit to `NAV_ITEMS`.
- **Doc:** `docs/AUDIT.md` — this file.
