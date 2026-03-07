# Platform Stability Layer — Implementation Report

Generated as part of the Platform Stability work. Lists files changed, middleware, routes, support pages, and remaining gaps.

## 1. Files Changed / Added

### API (`apps/api/src`)

| Area | File | Purpose |
|------|------|---------|
| Errors | `lib/errors.ts` | `sendSafeError`, `sendInternalError`, `isValidId`, `isValidEnum`; safe responses `{ ok: false, error, code? }` |
| Errors | `services/errorLog.ts` | `logSystemError`, failure categories |
| Middleware | `http/middleware/errorLogMiddleware.ts` | Catch errors, log via errorLog, respond with sendSafeError |
| Middleware | `http/middleware/securityHeaders.ts` | X-Frame-Options, X-Content-Type-Options, Referrer-Policy, CSP |
| Middleware | `http/middleware/rateLimitEndpoint.ts` | `rateLimitEndpoint`, `rateLimitByIp` |
| Middleware | `http/middleware/requestGuards.ts` | `validateIdParam`, `maxBodySize`, normalizeEmptyString |
| Security | `services/fileSecurityScan.ts` | `validateFileType`, `validateUploadFile`, `scanBuffer` stub; extension/MIME/size checks |
| Health | `services/systemHealth.ts` | `getSystemHealth`: API, DB, Redis, queue depth, recent/open errors, failed jobs |
| Server | `http/server.ts` | Uses all above; support + admin routes |

### Web (`apps/web`)

| Area | File | Purpose |
|------|------|---------|
| Errors | `lib/errors.ts` | `isApiError`, `getErrorMessage`, `getUserMessage`, `apiFetch`, `withRetry` |
| Support | `app/support/report/page.tsx` | “Report a problem” form (title, description, page URL, screenshot URL); tenant-safe |
| Admin | `app/admin/support/page.tsx` | Support dashboard: system health, links to errors & bug reports |
| Admin | `app/admin/errors/page.tsx` | List system errors; filters; mark resolved |
| Admin | `app/admin/support/bug-reports/page.tsx` | List bug reports; status filter |
| Layout | `app/layout.tsx` | Footer link: “Report a problem” → `/support/report` |

### Scripts

| File | Purpose |
|------|---------|
| `scripts/full_audit.js` | Audit extended with `platformStability()` and `supportAndResilience()`; outputs security, support, resilience checks |

### Database

| Migration | Purpose |
|------------|---------|
| `20260306000005_platform_stability` | SystemErrorLog columns (firmId, userId, area, route, method, severity, metaJson, resolvedAt, status); AppBugReport table + indexes |

---

## 2. Security Middleware

- **securityHeaders**: Applied in server; sets X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Content-Security-Policy.
- **rateLimitEndpoint / rateLimitByIp**: Used on ingest, narrative, document_explain, and `support-bug-report` (10/min by IP).
- **requestGuards**: `validateIdParam("id")` on `/admin/errors/:id` (GET/PATCH); `maxBodySize` available for routes that need it.
- **fileSecurityScan**: `validateUploadFile` used in ingest (server.ts) for size, extension, and MIME checks; dangerous extensions rejected.

---

## 3. Rate-Limited Routes

- Ingest, narrative, document_explain (per API key).
- `POST /support/bug-report`: 10 requests/min by IP.

---

## 4. Support & Admin API Routes

| Method | Route | Auth | Purpose |
|--------|-------|------|---------|
| POST | `/support/bug-report` | STAFF, firm context | Create AppBugReport; rate limited |
| GET | `/admin/errors` | PLATFORM_ADMIN | List SystemErrorLog (filters: service, severity, area, status) |
| GET | `/admin/errors/:id` | PLATFORM_ADMIN | Get one error log |
| PATCH | `/admin/errors/:id` | PLATFORM_ADMIN | Update status (e.g. RESOLVED) |
| GET | `/admin/system/health` | PLATFORM_ADMIN | Health summary (API, DB, Redis, queue, errors, failed jobs) |
| GET | `/admin/support/bug-reports` | PLATFORM_ADMIN | List AppBugReport (optional firmId, status filter) |

---

## 5. Support Pages (Frontend)

- **Report a problem**: `/support/report` — form for title, description, page URL, optional screenshot URL; firm-scoped via API auth.
- **Support dashboard**: `/admin/support` — platform admin only; shows health and links to errors and bug reports.
- **System errors**: `/admin/errors` — platform admin; list/filter, mark resolved.
- **Bug reports**: `/admin/support/bug-reports` — platform admin; list/filter by status.

---

## 6. Retry / Recovery

- **Current**: Retry/reprocess logic exists in codebase where applicable (e.g. document processing, jobs). No dedicated “retry” admin API endpoints were added in this layer.
- **Gap**: Optional follow-up: explicit admin endpoints to re-run OCR, reprocess document, retry webhook, or retry records request send, with logging.

---

## 7. Validation

- **IDs**: `validateIdParam("id")` on admin/errors/:id; `isValidId` / `isValidEnum` in lib/errors for use in routes.
- **Bug report body**: title/description length and required; priority enum.
- **Request size**: express.json limit + optional `maxBodySize` middleware; uploads capped via fileSecurityScan (e.g. 25MB).

---

## 8. Upload Protections

- **fileSecurityScan.ts**: Max size (25MB), allowed MIME prefixes, blocked extensions (e.g. exe, script extensions). Ingest calls `validateUploadFile`; rejections logged/sent to client.
- **Stub**: `scanBuffer` returns ok (no virus scan); can be replaced with ClamAV or similar later.

---

## 9. Remaining Gaps

- **Rate limiting**: Broader coverage on auth, upload, and webhook endpoints if not already applied.
- **Retry API**: Optional admin “retry” actions for failed jobs, webhooks, records request send, OCR.
- **Tests**: Manual or automated tests for: admin routes (unauthorized blocked, platform-admin required), rate limit, invalid/oversized upload rejected, bug report create, structured errors, cross-firm support blocked. See `audit/PLATFORM_STABILITY_TEST_CHECKLIST.md`.

---

## 10. Audit Integration

- `scripts/full_audit.js` includes:
  - **platformStability**: securityHeaders, errorLogMiddleware, sendSafeError, rateLimitedEndpoints, adminRequiresPlatformAdmin, supportBugReportFirmScoped, uploadValidation, requestGuards, systemHealth.
  - **supportAndResilience**: supportReportPage, adminSupportPage, adminErrorsPage, adminBugReportsPage, retryOrReprocessMentions.

Run from repo root: `node scripts/full_audit.js`. Output: `audit/latest_audit.json`, `audit/latest_audit.txt`.
