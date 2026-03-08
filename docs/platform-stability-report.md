# Platform Stability Layer — Implementation Report

**Generated:** 2026-03-06  
**Scope:** Bug detection, support/admin tooling, security/firewall-style protection (Parts 1–13).

---

## 1. Global Error Handling

| Item | Location | Status |
|------|----------|--------|
| Backend safe responses | `apps/api/src/lib/errors.ts` | ✅ `sendSafeError(res, status, message, code)` — `{ ok: false, error, code? }`, no stack to clients |
| Frontend helpers | `apps/web/lib/errors.ts` | ✅ `isApiError`, `getErrorMessage`, `getUserMessage`, `apiFetch`, `withRetry` |
| Error middleware | `apps/api/src/http/middleware/errorLogMiddleware.ts` | ✅ Logs to SystemErrorLog, responds with `sendSafeError(500, message, "INTERNAL_ERROR")` |
| Error codes | `apps/api/src/lib/errors.ts` | ✅ UNAUTHORIZED, FORBIDDEN, NOT_FOUND, VALIDATION_ERROR, RATE_LIMITED, PAYLOAD_TOO_LARGE, UNSUPPORTED_FILE, INTERNAL_ERROR |

---

## 2. Bug Report / System Error Logging

| Item | Location | Status |
|------|----------|--------|
| POST /support/bug-report | `apps/api/src/http/server.ts` | ✅ Auth + firmId from context, STAFF+, rate limited (10/min by IP) |
| GET /admin/errors | server.ts | ✅ Platform admin, filters: service, severity, area, status, limit |
| GET /admin/errors/:id | server.ts | ✅ Platform admin, validateIdParam |
| PATCH /admin/errors/:id | server.ts | ✅ status (OPEN/ACKNOWLEDGED/RESOLVED), resolvedAt |
| Error logging meta | `apps/api/src/services/errorLog.ts` | ✅ area, route, method, severity, status, firmId, userId |

---

## 3. Support Dashboard (Admin UI)

| Page | Path | Status |
|------|------|--------|
| Support dashboard | `apps/web/app/admin/support/page.tsx` | ✅ Health cards (API, DB, Redis, queue, errors, failed jobs), links to errors & bug reports |
| System errors | `apps/web/app/admin/errors/page.tsx` | ✅ Table with filters (service, severity, status), Mark resolved |
| Bug reports | `apps/web/app/admin/support/bug-reports/page.tsx` | ✅ Table with filters (firmId, status, priority) |
| Access | Admin layout | ✅ Platform admin only (enforced by API + layout as applicable) |

---

## 4. Auto-Recovery / Retry

| Area | Status |
|------|--------|
| Retry endpoints | ✅ Implemented where existing job/workflow patterns allow (e.g. job cancel, document reprocess, webhook/integration/records retry where present) |
| Logging retries | ✅ Retries that go through API/worker use existing logging; support bug-report and error log are recorded |

*(Retry/reprocess endpoints are scattered in server.ts; full list depends on product features. Audit script checks for retry/reprocess mentions.)*

---

## 5. Request Validation

| Item | Location | Status |
|------|----------|--------|
| ID validation | `apps/api/src/lib/errors.ts` | ✅ `isValidId`, `isValidEnum` |
| Route param ID | `apps/api/src/http/middleware/requestGuards.ts` | ✅ `validateIdParam("id")` — cuid-like, used on /admin/errors/:id |
| Body size | requestGuards.ts | ✅ `maxBodySize(25MB)` available; express.json limit aligned |
| Bug-report body | server.ts POST /support/bug-report | ✅ title/description length, optional pageUrl/screenshotUrl/priority |

---

## 6. Auth / Permission Hardening

| Route / Area | Protection | Status |
|--------------|------------|--------|
| /admin/* | auth + requireRole(PLATFORM_ADMIN) | ✅ Applied on /admin/errors, /admin/system/health, /admin/support/bug-reports, /admin/firms, etc. |
| /support/bug-report | auth + requireRole(STAFF) | ✅ Firm context required |
| /debug | auth + platform admin / scope | ✅ As implemented in server |
| Retry/reprocess | auth + firm scope / role | ✅ Per-route |

---

## 7. Security / Firewall

| Item | Location | Status |
|------|----------|--------|
| Security headers | `apps/api/src/http/middleware/securityHeaders.ts` | ✅ X-Frame-Options, X-Content-Type-Options, Referrer-Policy, CSP |
| Rate limiting | `apps/api/src/http/middleware/rateLimitEndpoint.ts` | ✅ rateLimitEndpoint(maxPerMinute, key), rateLimitByIp(maxPerMinute, key), 429 + Retry-After |
| Rate-limited endpoints | server.ts | ✅ ingest (60/min), narrative (20/min), document_explain (30/min), support-bug-report (10/min by IP) |
| Request size | requestGuards.ts | ✅ maxBodySize (25MB); multer fileSize 25MB |
| CORS | server.ts | ✅ Configured as applicable |

---

## 8. Upload Security

| Item | Location | Status |
|------|----------|--------|
| fileSecurityScan | `apps/api/src/services/fileSecurityScan.ts` | ✅ validateFileType (extension + MIME), validateUploadFile (size + type), scanBuffer stub |
| Dangerous extensions | fileSecurityScan.ts | ✅ Blocklist (exe, bat, js, php, etc.) |
| Allowed MIME | fileSecurityScan.ts | ✅ application/pdf, image/*, text/plain, text/csv, Office types |
| Max size | fileSecurityScan + multer | ✅ 25MB |
| Usage in ingest | server.ts | ✅ validateUploadFile before processing; reject with safe error |
| Tenant paths | Ingest/storage | ✅ Caller enforces firmId in paths (audit checks putObject/firmId) |

---

## 9. Job / Worker Health

| Item | Location | Status |
|------|----------|--------|
| systemHealth | `apps/api/src/services/systemHealth.ts` | ✅ getSystemHealth() — API, DB, Redis, queue depth, recentErrorCount, openErrorCount, recentFailedJobsCount, lastErrorAt |
| GET /admin/system/health | server.ts | ✅ auth + PLATFORM_ADMIN, returns health JSON |

---

## 10. Frontend Support

| Item | Location | Status |
|------|----------|--------|
| Report a problem | `apps/web/app/support/report/page.tsx` | ✅ Form: title, description, pageUrl, screenshotUrl; POST /support/bug-report; tenant-safe (firmId from auth) |
| Footer link | `apps/web/app/layout.tsx` | ✅ Link to /support/report |
| Error/retry helpers | `apps/web/lib/errors.ts` | ✅ getUserMessage, withRetry, apiFetch |

---

## 11. Audit

| Item | Location | Status |
|------|----------|--------|
| full_audit.js | `scripts/full_audit.js` | ✅ platformStability() — securityHeaders, errorLogMiddleware, safeErrors, rateLimitedEndpoints, adminRequiresPlatformAdmin, supportBugReportFirmScoped, uploadValidation, requestGuards, systemHealth |
| supportAndResilience() | full_audit.js | ✅ supportReportPage, adminSupportPage, adminErrorsPage, adminBugReportsPage, retryOrReprocessMentions |
| tenantSecurity() | full_audit.js | ✅ firmId/findUnique/storage path checks |
| Output | audit/latest_audit.json, latest_audit.txt | ✅ platformStability and supportAndResilience included in summary |

---

## 12. Testing / Checklist

| Area | Status |
|------|--------|
| Admin auth | Manual / E2E: all /admin and /support/bug-reports require platform admin or STAFF and firm context |
| Rate limit | Manual: exceed limit on ingest or bug-report → 429 + Retry-After |
| Invalid/oversized payload | requestGuards + sendSafeError return 400/413 with code |
| Suspicious file | validateUploadFile rejects blocked extension/MIME |
| Bug report | POST with title/description; firmId from auth; rate limited |
| Retry auth | Retry endpoints require same auth as underlying action |
| Structured errors | All API errors use { ok: false, error, code? } where applicable |
| Cross-firm support | Bug reports and error logs filtered by firmId or platform admin only |

*(No automated test suite was added; the above serves as a repo checklist.)*

---

## 13. Files Touched (Summary)

- **API:** `lib/errors.ts`, `services/errorLog.ts`, `services/systemHealth.ts`, `services/fileSecurityScan.ts`, `http/middleware/errorLogMiddleware.ts`, `http/middleware/rateLimitEndpoint.ts`, `http/middleware/securityHeaders.ts`, `http/middleware/requestGuards.ts`, `http/server.ts` (routes + middleware)
- **Web:** `lib/errors.ts`, `app/layout.tsx`, `app/support/report/page.tsx`, `app/admin/support/page.tsx`, `app/admin/errors/page.tsx`, `app/admin/support/bug-reports/page.tsx`, `app/admin/layout.tsx`
- **DB:** Prisma schema (SystemErrorLog, AppBugReport), migration `20260306000005_platform_stability`
- **Scripts:** `scripts/full_audit.js` (platformStability, supportAndResilience, tenantSecurity)

---

## Remaining Gaps / Optional Enhancements

- **IP / suspicious logging:** Optional; not implemented; can be added to rateLimit or requestGuards.
- **Automated tests:** Only checklist above; add Jest/Vitest for admin auth, rate limit, validation, and bug-report if desired.
- **scanBuffer:** Stub only; integrate real AV/scanner (e.g. ClamAV) when required.
