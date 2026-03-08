# Platform Stability Layer — Implementation Report

## Summary

The platform stability layer is in place: global error handling, bug reporting, support/admin tools, request protection, upload security, and health monitoring. Core business workflows are unchanged except where required for stability or security.

---

## Part 1 — Global error handling

**Backend**
- **`apps/api/src/lib/errors.ts`**: `sendSafeError(res, status, message, code)` returns `{ ok: false, error: string, code?: string }`. `sendInternalError(res, err, logFn)` for catch blocks. `isValidId`, `isValidEnum` for validation. No stack traces sent to clients.
- **`apps/api/src/http/middleware/errorLogMiddleware.ts`**: Catches uncaught errors, logs to `SystemErrorLog` (with firmId, userId, area, route, method, severity), responds with `sendSafeError(res, 500, message, "INTERNAL_ERROR")`.
- **Usage**: Error middleware is mounted; routes use `sendSafeError` where needed.

**Frontend**
- **`apps/web/lib/errors.ts`**: `isApiError`, `getErrorMessage`, `getUserMessage` (code-based friendly messages), `getErrorCode`, `apiFetch` wrapper, `withRetry`. Used on support report page and can be used for loading/empty/error states and retry actions.

---

## Part 2 — Bug report / system error logging

**Models**
- **SystemErrorLog** (Prisma): id, service, message, stack, createdAt, firmId, userId, area, route, method, severity, metaJson, resolvedAt, status. Indexes on service, createdAt, firmId, severity, status.
- **AppBugReport** (Prisma): id, firmId, userId, title, description, pageUrl, screenshotUrl, status (OPEN | IN_PROGRESS | CLOSED), priority (LOW | MEDIUM | HIGH | URGENT), createdAt, updatedAt.

**API**
- **POST /support/bug-report**: Rate-limited by IP (10/min). Requires auth; firmId from token. Creates AppBugReport. Request body: title, description, pageUrl?, screenshotUrl?.
- **GET /admin/errors**: Platform admin only. List SystemErrorLog with filters (severity, area, status). Pagination.
- **GET /admin/errors/:id**: Platform admin only. Single error detail.
- **PATCH /admin/errors/:id**: Platform admin only. Update status / resolvedAt.

**Service**
- **`apps/api/src/services/errorLog.ts`**: `logSystemError(service, messageOrErr, stack?, meta?)` writes to SystemErrorLog; supports firmId, userId, area, route, method, severity, status. `getFailureCategory`, `FAILURE_CATEGORIES` for aggregation.

---

## Part 3 — Support / troubleshooting dashboard

**Pages (platform admin only)**
- **`apps/web/app/admin/support/page.tsx`**: System health summary, recent errors, failed jobs, failed document processing / syncs, links to errors and bug reports.
- **`apps/web/app/admin/errors/page.tsx`**: Table of system errors; filters (severity, area, status); inspect details; mark resolved.
- **`apps/web/app/admin/support/bug-reports/page.tsx`**: User-submitted bug reports; filter by firm/status/priority.
- **`apps/web/app/admin/layout.tsx`**: Links to Support, Errors, Bug reports.

---

## Part 4 — Auto-recovery / safe retry tools

- **Document reprocess**: `POST /documents/:id/reprocess` (or job `document.reprocess`) with mode full | ocr | extraction. Enqueues OCR or extraction job. Tracked via job events and audit.
- **Job retry**: Admin/STAFF job retry endpoints (e.g. `/jobs/:id/retry`) where implemented. Retry events in job logs.
- **Records request send**: Retry via resend from UI or reprocess; existing records request send job.
- **Integration sync**: Retry via sync trigger or admin tooling where implemented.
- Retry/reprocess usage is referenced in audit (supportAndResilience.retryOrReprocessMentions).

---

## Part 5 — Request validation hardening

- **`apps/api/src/lib/errors.ts`**: `isValidId(value)`, `isValidEnum(value, allowed)`.
- **`apps/api/src/http/middleware/requestGuards.ts`**: `validateIdParam(paramName)` — rejects missing or invalid cuid-like IDs; `maxBodySize(maxBytes)` — rejects oversized Content-Length; `normalizeEmptyString`.
- **Usage**: validateIdParam used on key routes; body/query validation in individual handlers where needed. No global schema validator; reusable helpers available.

---

## Part 6 — Auth + permission hardening

- **Firm routes**: Require auth; firmId from token (requireFirmIdFromRequest, buildFirmWhere). No trust of firmId from body for data access.
- **Admin/debug**: `/admin/*` and `/debug/*` use `auth` and `requireRole(Role.PLATFORM_ADMIN)` where appropriate.
- **Support**: POST /support/bug-report requires auth (firm key); firmId from token. GET/PATCH admin/errors and admin/support/bug-reports require PLATFORM_ADMIN.
- **Audit**: full_audit.js checks adminRequiresPlatformAdmin and supportBugReportFirmScoped.

---

## Part 7 — Security / firewall-style protection

- **Rate limiting**: `rateLimitEndpoint(maxPerMinute, endpointKey)` (per API key) and `rateLimitByIp(maxPerMinute, endpointKey)`. Applied to ingest, narrative, document explain, support/bug-report, etc. 429 + Retry-After when exceeded.
- **Security headers** (`apps/api/src/http/middleware/securityHeaders.ts`): X-Frame-Options DENY, X-Content-Type-Options nosniff, Referrer-Policy strict-origin-when-cross-origin, Content-Security-Policy. Applied early in stack.
- **Request size**: express.json limit (e.g. 25MB); maxBodySize middleware available in requestGuards.
- **Upload restrictions**: See Part 8.
- **CORS**: Configured (e.g. origin: true, credentials: true). Tighten for production if needed.
- **Suspicious activity**: Errors logged to SystemErrorLog with route/method; no dedicated IP block list in this layer.

---

## Part 8 — Upload security

- **`apps/api/src/services/fileSecurityScan.ts`**: `validateFileType(originalName, mimeType)` — blocks dangerous extensions (exe, bat, js, etc.) and allows only listed MIME prefixes (PDF, image, text, Office). `validateUploadFile({ originalname, mimetype, size, buffer })` — enforces max size (25MB), then file type. `scanBuffer` stub for future antivirus.
- **Ingest**: Upload uses multer + size limit; validateUploadFile (or equivalent) used where wired. Rejected uploads can be logged (implementation-specific).
- **Paths**: Storage keys use firmId prefix (tenant-safe). Path traversal prevented by not using user-controlled paths as keys.
- **Logging**: Rejected uploads can be logged via logSystemError or similar when validation fails.

---

## Part 9 — Job / worker health monitoring

- **`apps/api/src/services/systemHealth.ts`**: `getSystemHealth()` returns: api up, database up/down, redis up/down, recentErrorCount (24h), openErrorCount, lastErrorAt, queueDepth (doc_jobs), recentFailedJobsCount (Job model), timestamp.
- **GET /admin/system/health**: Platform admin only. Returns health summary JSON.

---

## Part 10 — Frontend support tools

- **“Report a problem”**: Link in app footer (`apps/web/app/layout.tsx`) to `/support/report`.
- **`apps/web/app/support/report/page.tsx`**: Form: title, description, page URL (auto-filled), optional screenshot URL. Submits to POST /support/bug-report. Confirmation state after submit. Uses getErrorMessage, getUserMessage, isApiError from lib/errors. Tenant-safe (firmId from auth).

---

## Part 11 — Audit integration

**`scripts/full_audit.js`**
- **platformStability()**: securityHeaders, errorLogMiddleware, sendSafeError, rateLimitedEndpoints, adminRequiresPlatformAdmin, supportBugReportFirmScoped, uploadValidation (fileSecurityScan), requestGuards, systemHealth. Warnings if any missing.
- **supportAndResilience()**: supportReportPage, adminSupportPage, adminErrorsPage, adminBugReportsPage, retryOrReprocessMentions. Warnings if pages missing.
- **Audit output**: platformStability and supportAndResilience sections; console summary for security headers, rate limit count, system health, support pages.

---

## Part 12 — Testing

- **Smoke tests**: `apps/api/tests/platformStability/stabilityLayer.test.ts` — run with `pnpm -C apps/api test:stability`. Covers: `isValidId` / `isValidEnum`, `sendSafeError` (no stack to client), `validateFileType` (reject exe/js, allow pdf/png), `validateUploadFile` (oversized and exe rejected).
- **Checklist**: `apps/api/tests/platformStability/PLATFORM_STABILITY_TEST_CHECKLIST.md` — 10 manual scenarios: unauthorized admin access, non-admin admin tools, rate limit, invalid payload, oversized upload, suspicious file, bug report creation, retry auth, structured errors, cross-firm support data.
- **Further automation**: Add API/integration tests for auth, rate limit, and full request flows when the test runner is in place.

---

## Part 13 — Files reference

| Area | Path |
|------|------|
| Errors (API) | `apps/api/src/lib/errors.ts` |
| Errors (Web) | `apps/web/lib/errors.ts` |
| Error log | `apps/api/src/services/errorLog.ts` |
| Error middleware | `apps/api/src/http/middleware/errorLogMiddleware.ts` |
| Request guards | `apps/api/src/http/middleware/requestGuards.ts` |
| Security headers | `apps/api/src/http/middleware/securityHeaders.ts` |
| Rate limit | `apps/api/src/http/middleware/rateLimitEndpoint.ts` |
| File security | `apps/api/src/services/fileSecurityScan.ts` |
| System health | `apps/api/src/services/systemHealth.ts` |
| Prisma | SystemErrorLog, AppBugReport (schema); migration `20260306000005_platform_stability` |
| Admin pages | `apps/web/app/admin/support/page.tsx`, `admin/errors/page.tsx`, `admin/support/bug-reports/page.tsx`, `admin/layout.tsx` |
| Support page | `apps/web/app/support/report/page.tsx` |
| Layout | `apps/web/app/layout.tsx` (Report a problem link) |
| Audit | `scripts/full_audit.js` (platformStability, supportAndResilience) |
| Test checklist | `apps/api/tests/platformStability/PLATFORM_STABILITY_TEST_CHECKLIST.md` |
| Smoke test | `apps/api/tests/platformStability/stabilityLayer.test.ts` (`pnpm -C apps/api test:stability`) |

---

## Remaining gaps / future hardening

- **IP allow/block list**: Not implemented; can be added in middleware if required.
- **Antivirus scan**: fileSecurityScan.scanBuffer is a stub; integrate ClamAV or similar when available.
- **Stricter CSP**: Current CSP may need tuning for third-party scripts or embeds.
- **Request logging for abuse**: Only error logging today; optional request log for suspicious patterns.
- **Automated tests**: Checklist only; add API/integration tests for auth, rate limit, validation, and upload rejection when the test runner is in place.

Priority order reflected: (1) security and auth hardening, (2) upload protection, (3) support/error logging, (4) retry/recovery tools, (5) dashboards and polish.
