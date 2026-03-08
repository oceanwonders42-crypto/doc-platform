# Platform Stability Layer — Implementation Report

Summary of what was implemented for bug detection, support tools, and security/firewall (13 parts).

---

## Part 1 — Global error handling

- **API:** `apps/api/src/lib/errors.ts` — `sendSafeError`, `sendInternalError`, `SafeErrorResponse` (`ok: false`, `error`, optional `code`). No stack sent to clients. `isValidId`, `isValidEnum` for validation.
- **Web:** `apps/web/lib/errors.ts` — `isApiError`, `getErrorMessage`, `getUserMessage`, `apiFetch`, `withRetry` for user-facing errors and retries.
- **Middleware:** `errorLogMiddleware` logs uncaught errors to SystemErrorLog and responds with `sendSafeError(res, 500, message, "INTERNAL_ERROR")`.

---

## Part 2 — Centralized error logging & support API

- **SystemErrorLog** (Prisma): id, service, message, stack, firmId, userId, area, route, method, severity, metaJson, status, resolvedAt, createdAt.
- **AppBugReport** (Prisma): id, firmId, userId, title, description, pageUrl, screenshotUrl, status, priority, createdAt, updatedAt.
- **Endpoints:**
  - **POST /support/bug-report** — Auth + STAFF, rate limited by IP (10/min). Creates AppBugReport with firmId/userId from auth. Validates title (required, max 500), description (required, max 10000).
  - **GET /admin/errors** — Platform admin. Query: limit, service, severity, area, status. Returns SystemErrorLog list.
  - **GET /admin/errors/:id** — Platform admin, validateIdParam. Returns single error log.
  - **PATCH /admin/errors/:id** — Platform admin, validateIdParam. Body: status (OPEN | ACKNOWLEDGED | RESOLVED). Sets resolvedAt when RESOLVED.

---

## Part 3 — Support dashboard (platform admin)

- **apps/web/app/admin/support/page.tsx** — Health dashboard: API, DB, Redis, queue depth, open/recent errors, failed jobs (24h), last error time. Links to errors and bug reports.
- **apps/web/app/admin/errors/page.tsx** — Error table with filters (service, severity, status). Mark resolved.
- **apps/web/app/admin/support/bug-reports/page.tsx** — Bug reports table with filters (firmId, status, priority).
- **apps/web/app/admin/layout.tsx** — Nav: Support, Errors, Bug reports. All admin routes require platform admin (API enforces).

---

## Part 4 — Auto-recovery / retry

- **POST /admin/jobs/:id/retry** — Platform admin (or firm-scoped for job’s firm). Retries failed job.
- **POST /admin/jobs/:id/cancel** — Cancel job. Retries are logged via existing job/worker flow.

---

## Part 5 — Request validation

- **apps/api/src/lib/errors.ts:** `isValidId`, `isValidEnum`.
- **apps/api/src/http/middleware/requestGuards.ts:** `validateIdParam("id")` for :id params (cuid-like); `maxBodySize` (default 25MB). Used on /admin/errors/:id GET and PATCH.

---

## Part 6 — Auth/permission audit

- All `/admin/*` routes that list system-wide data use `auth` + `requireRole(Role.PLATFORM_ADMIN)`.
- `/support/bug-report` uses `auth` + `requireRole(Role.STAFF)` and firmId from auth (tenant-safe).
- Admin errors, system health, bug reports, firms, jobs — platform admin only.

---

## Part 7 — Security / firewall

- **securityHeaders** — X-Frame-Options, X-Content-Type-Options, Referrer-Policy, CSP. Applied in server.
- **Rate limiting:** `rateLimitEndpoint(60, "ingest")` on /ingest; `rateLimitByIp(10, "support-bug-report")` on POST /support/bug-report.
- **requestGuards:** validateIdParam, maxBodySize. express.json limit (25MB) and Content-Length check where applicable.

---

## Part 8 — Upload security

- **apps/api/src/services/fileSecurityScan.ts** — `validateFileType(originalName, mimeType)` (dangerous extensions blocklist, allowed MIME prefixes); `validateUploadFile(originalname, mimetype, size, buffer)` (size ≤ 25MB + type check); `scanBuffer` stub for future AV.
- **Used on:** POST /ingest, POST /documents/:id/new-version, POST /cases/:id/documents/upload. Reject with `sendSafeError(res, 400, scan.reason, "UNSUPPORTED_FILE")`.
- Multer: memoryStorage, fileSize 25MB. Tenant-safe paths enforced by firmId in route handlers.

---

## Part 9 — Job/worker health

- **apps/api/src/services/systemHealth.ts** — `getSystemHealth()`: API up, DB ping, Redis + queue depth, recentErrorCount (24h), openErrorCount, lastErrorAt, recentFailedJobsCount (24h), timestamp.
- **GET /admin/system/health** — Platform admin. Returns `{ ok: true, health }`.

---

## Part 10 — Frontend support

- **apps/web/app/support/report/page.tsx** — “Report a problem” form: title, description, page URL (auto-filled), optional screenshot URL. POST to /support/bug-report with auth. Uses lib/errors (getUserMessage, isApiError).
- **Root layout** — Footer link “Report a problem” → /support/report.

---

## Part 11 — Audit script

- **scripts/full_audit.js** — `platformStability(apiSrc)`: securityHeaders, errorLogMiddleware, safeErrors, rateLimitedEndpoints, adminRequiresPlatformAdmin, supportBugReportFirmScoped, uploadValidation, requestGuards, systemHealth. `supportAndResilience(webApp, apiSrc)`: supportReportPage, adminSupportPage, adminErrorsPage, adminBugReportsPage, retryOrReprocessMentions. Results written to audit/latest_audit.json and summary to latest_audit.txt.

---

## Part 12 — Tests / checklist

- **Checklist (manual or automated):**
  - Unauthorized requests to /admin/errors, /admin/system/health, /admin/support/bug-reports return 401/403.
  - Rate limit: excess POST /support/bug-report returns 429.
  - Invalid or oversized payload: 400/413 with structured error body.
  - Suspicious file (e.g. .exe or disallowed MIME) on /ingest or document upload: 400, code UNSUPPORTED_FILE.
  - Bug report create: 201 with id; firmId from auth.
  - Retry: POST /admin/jobs/:id/retry with platform admin succeeds for failed job.
  - Structured errors: all API error responses use { ok: false, error, code? }.
  - Cross-firm: support/bug-report only creates report for authenticated user’s firm.

---

## Part 13 — This report

- **Files touched (summary):**
  - **Security middleware:** securityHeaders.ts, rateLimitEndpoint.ts, requestGuards.ts, errorLogMiddleware.ts.
  - **Rate-limited routes:** /ingest (60/hour per API key), POST /support/bug-report (10/min by IP).
  - **Support pages:** admin/support, admin/errors, admin/support/bug-reports; support/report.
  - **Retry:** /admin/jobs/:id/retry, /admin/jobs/:id/cancel.
  - **Validation:** lib/errors (isValidId, isValidEnum), validateIdParam on admin/errors/:id.
  - **Upload:** fileSecurityScan.ts used on ingest, documents/:id/new-version, cases/:id/documents/upload.
  - **Health:** systemHealth.ts, GET /admin/system/health.

**Remaining gaps (optional):**

- Automated tests for the checklist in Part 12.
- Real AV/malware integration in `scanBuffer` when available.
- Optional IP/suspicious request logging for firewall tuning.
