# Platform Stability Layer — Implementation Report

Generated as Part 13 of the Platform Stability work. This document lists files created or changed for bug detection, support/admin tooling, and security/firewall-style protection.

---

## 1. Global error handling

| Location | Description |
|----------|-------------|
| `apps/api/src/lib/errors.ts` | `sendSafeError(res, status, message, code?)`, `sendInternalError`, `SafeErrorResponse` (`ok: false`, `error`, `code?`). No stack to clients. `isValidId`, `isValidEnum` helpers. |
| `apps/api/src/http/middleware/errorLogMiddleware.ts` | Logs uncaught errors to SystemErrorLog via `logSystemError`; responds with `sendSafeError(res, 500, message, "INTERNAL_ERROR")`. |
| `apps/web/lib/errors.ts` | `ApiError`, `isApiError`, `getErrorMessage`, `getUserMessage`, `apiFetch`, `withRetry`. User-facing messages and retry helpers. |

Routes use try/catch and `sendSafeError` or `next(e)` so errorLogMiddleware handles uncaught errors. Stack traces stay server-side in SystemErrorLog.

---

## 2. Bug report / system error logging

| Location | Description |
|----------|-------------|
| `apps/api/prisma/schema.prisma` | **SystemErrorLog**: id, service, message, stack, createdAt, firmId, userId, area, route, method, severity, metaJson, resolvedAt, status. **AppBugReport**: id, firmId, userId, title, description, pageUrl, screenshotUrl, status, priority, createdAt, updatedAt. |
| `apps/api/src/services/errorLog.ts` | `logSystemError(service, messageOrErr, stack?, meta?)`, `getFailureCategory`, `FAILURE_CATEGORIES`. |
| **POST** `apps/api/src/http/server.ts` **/support/bug-report** | Auth + STAFF, rate limit 10/min by IP. firmId from auth only. Creates AppBugReport (title, description, pageUrl, screenshotUrl, status OPEN, priority). |
| **GET** **/admin/errors** | Platform admin. Query: limit, service, severity, area, status. Returns system error list. |
| **GET** **/admin/errors/:id** | Platform admin, `validateIdParam("id")`. Single SystemErrorLog. |
| **PATCH** **/admin/errors/:id** | Platform admin, `validateIdParam("id")`. Update status (OPEN/ACKNOWLEDGED/RESOLVED), set resolvedAt when RESOLVED. |

---

## 3. Support dashboard (web)

| Location | Description |
|----------|-------------|
| `apps/web/app/admin/layout.tsx` | Admin nav: Support, Errors, Bug reports. |
| `apps/web/app/admin/support/page.tsx` | Support dashboard: health (API, DB, Redis, queue depth, open/recent errors, failed jobs), links to errors and bug reports. |
| `apps/web/app/admin/errors/page.tsx` | System errors table; filters (service, severity, status); Mark resolved. Calls GET /admin/errors, PATCH /admin/errors/:id. |
| `apps/web/app/admin/support/bug-reports/page.tsx` | Bug reports table; filters (firmId, status, priority). Calls GET /admin/support/bug-reports. |

All under `/admin/*`; layout does not enforce role — ensure route-level or middleware enforces platform admin for these pages in your auth setup.

---

## 4. Auto-recovery / retry

Retry/reprocess is implemented where existing workflows allow:

- Document reprocess / re-run: existing enqueue (e.g. document job, OCR, extraction) can be triggered from admin/job endpoints (e.g. cancel/retry patterns in server).
- Webhooks / integration sync / records request send: retry via existing job or manual re-trigger endpoints if present.
- Logging: `logSystemError` and job status in DB record retries and failures.

No new dedicated “retry all” endpoint was added; retry is done via existing job/document APIs and worker re-runs.

---

## 5. Request validation

| Location | Description |
|----------|-------------|
| `apps/api/src/lib/errors.ts` | `isValidId`, `isValidEnum`. |
| `apps/api/src/http/middleware/requestGuards.ts` | `maxBodySize(maxBytes)`, `validateIdParam(paramName)`, `normalizeEmptyString`. |
| **Usage** | `validateIdParam("id")` on GET/PATCH `/admin/errors/:id`. Body/query validation in route handlers (e.g. /support/bug-report: title/description length, priority enum). |

---

## 6. Auth/permission audit

- Firm routes: use `auth` and firm context (firmId from auth/session).
- Admin/debug: `/admin/errors`, `/admin/errors/:id`, `/admin/system/health`, `/admin/support/bug-reports`, `/admin/firms` use `auth` + `requireRole(Role.PLATFORM_ADMIN)`.
- Support: POST `/support/bug-report` uses `auth` + `requireRole(Role.STAFF)`; firmId from auth only.

No unprotected debug/support endpoints identified; admin routes require platform admin.

---

## 7. Security / firewall

| Middleware / config | Description |
|---------------------|-------------|
| `apps/api/src/http/middleware/securityHeaders.ts` | X-Frame-Options DENY, X-Content-Type-Options nosniff, Referrer-Policy, CSP. |
| `apps/api/src/http/middleware/rateLimitEndpoint.ts` | `rateLimitEndpoint(maxPerMinute, endpointKey)` (per apiKeyId), `rateLimitByIp(maxPerMinute, endpointKey)`. |
| **Rate-limited routes** | `/support/bug-report` (10/min by IP), ingest (60/min), narrative (20/min), document_explain (30/min). |
| `apps/api/src/http/middleware/requestGuards.ts` | `maxBodySize` (default 25MB). Can be applied globally or per-route. |
| CORS | Configured in server (cors middleware). |
| Request size | express.json limit and/or maxBodySize guard. |

---

## 8. Upload security

| Location | Description |
|----------|-------------|
| `apps/api/src/services/fileSecurityScan.ts` | `validateFileType(originalName, mimeType)`, `validateUploadFile({ originalname, mimetype, size, buffer })`. Max 25MB; blocklisted extensions; allowed MIME prefixes (PDF, image, text, Office). `scanBuffer` stub for future AV. |
| **Usage** | Ingest and other upload routes call `validateUploadFile` after multer; reject with safe error on failure. |

---

## 9. Job/worker health

| Location | Description |
|----------|-------------|
| `apps/api/src/services/systemHealth.ts` | `getSystemHealth()`: API up, DB ping, Redis + queue depth, recent SystemErrorLog count, open error count, lastErrorAt, recent failed Job count. |
| **GET** **/admin/system/health** | Auth + platform admin. Returns `{ ok: true, health }`. |

---

## 10. Frontend support

| Location | Description |
|----------|-------------|
| `apps/web/app/layout.tsx` | Footer link: “Report a problem” → `/support/report`. |
| `apps/web/app/support/report/page.tsx` | Form: title, description, page URL (auto-filled), optional screenshot URL. Submits to POST `/support/bug-report` with auth header; firmId from API auth. Uses `lib/errors`: `getErrorMessage`, `getUserMessage`, `isApiError`. |

---

## 11. Audit script

| Location | Description |
|----------|-------------|
| `scripts/full_audit.js` | **platformStability()**: securityHeaders, errorLogMiddleware, sendSafeError, rateLimitedEndpoints, adminRequiresPlatformAdmin, supportBugReportFirmScoped, uploadValidation, requestGuards, systemHealth. **supportAndResilience()**: support report page, admin support/errors/bug-reports pages, retry/reprocess mentions. **tenantSecurity()**: firmId usage, findUnique/where checks, route firm filter, storage path. Output: `audit/latest_audit.json` and `audit/latest_audit.txt`. |

---

## 12. Testing

See `docs/PLATFORM_STABILITY_TEST_CHECKLIST.md` for manual/API checklist: unauthorized admin, rate limit, invalid/oversized payload, file type rejection, bug report create, retry auth, structured errors, cross-firm support.

---

## 13. Files changed/created summary

**API**

- `apps/api/src/lib/errors.ts` — safe responses, validation helpers  
- `apps/api/src/http/middleware/errorLogMiddleware.ts` — uses sendSafeError  
- `apps/api/src/http/middleware/requestGuards.ts` — validateIdParam, maxBodySize  
- `apps/api/src/http/middleware/securityHeaders.ts` — security headers  
- `apps/api/src/http/middleware/rateLimitEndpoint.ts` — rate limits  
- `apps/api/src/services/errorLog.ts` — logSystemError, failure categories  
- `apps/api/src/services/fileSecurityScan.ts` — upload validation, stub scan  
- `apps/api/src/services/systemHealth.ts` — health summary  
- `apps/api/src/http/server.ts` — support + admin routes, guards, rate limits, validateUploadFile on uploads  
- Prisma schema + migration for SystemErrorLog and AppBugReport (e.g. `20260306000005_platform_stability`)

**Web**

- `apps/web/lib/errors.ts` — API error handling, retry, user messages  
- `apps/web/app/layout.tsx` — “Report a problem” link  
- `apps/web/app/support/report/page.tsx` — bug report form  
- `apps/web/app/admin/layout.tsx` — admin nav  
- `apps/web/app/admin/support/page.tsx` — support dashboard  
- `apps/web/app/admin/errors/page.tsx` — system errors table  
- `apps/web/app/admin/support/bug-reports/page.tsx` — bug reports table  

**Scripts / docs**

- `scripts/full_audit.js` — platformStability, supportAndResilience, tenantSecurity  
- `docs/PLATFORM_STABILITY_REPORT.md` — this report  
- `docs/PLATFORM_STABILITY_TEST_CHECKLIST.md` — test checklist  

---

## Remaining gaps / follow-ups

1. **Admin UI auth**: Ensure Next.js admin routes (`/admin/*`) are protected by platform-admin check (e.g. middleware or layout that verifies role); API already enforces.
2. **maxBodySize**: Applied where needed; consider applying globally early in server if desired.
3. **Retry endpoints**: Central “retry failed job” or “reprocess document” endpoints can be added; current design uses existing job/document APIs.
4. **CSP**: Tune CSP in securityHeaders if you add inline scripts or third-party assets.
5. **File scan**: `fileSecurityScan.scanBuffer` is a stub; plug in real scanner (e.g. ClamAV) when available.
6. **IP/abuse logging**: Optional; not implemented. Can be added to rateLimitByIp or a dedicated middleware.
