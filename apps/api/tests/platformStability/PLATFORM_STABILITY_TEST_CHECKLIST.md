# Platform Stability Layer — Test Checklist

Use these to validate security, support, and resilience. Run with API + web running; use a firm API key and (for admin) platform admin key.

## 1. Unauthorized user blocked from admin routes

- **Request:** `GET /admin/errors` or `GET /admin/system/health` without `Authorization: Bearer <key>`.
- **Expect:** 401.

## 2. Non-admin blocked from support/admin tools

- **Request:** `GET /admin/errors` with a **firm** API key (not platform admin).
- **Expect:** 403 (or 401 if admin routes require PLATFORM_ADMIN).

## 3. Rate limit triggers on repeated requests

- **Request:** Call `POST /support/bug-report` (or another rate-limited endpoint) many times in one minute from same IP.
- **Expect:** After limit (e.g. 10/min for bug-report), 429 with `Retry-After` and body `{ ok: false, error: "...", code: "RATE_LIMITED" }`.

## 4. Invalid payload rejected

- **Request:** `POST /support/bug-report` with body `{ title: 123 }` (missing description) or invalid JSON.
- **Expect:** 400 with structured error `{ ok: false, error: string }`.

## 5. Oversized upload rejected

- **Request:** `POST /ingest` with a file (or `Content-Length`) larger than configured max (e.g. 25MB).
- **Expect:** 413 or 400 with payload-too-large style message.

## 6. Suspicious file type rejected

- **Request:** `POST /ingest` with filename `file.exe` or MIME type not in allow list (if validation runs before multer).
- **Expect:** 400 with unsupported-file style message.

## 7. Bug report creation works

- **Request:** `POST /support/bug-report` with `Authorization: Bearer <firm key>`, body `{ title: "Test", description: "Test description", pageUrl: "https://app.example.com/page" }`.
- **Expect:** 201 or 200, `{ ok: true, ... }`. Record appears in `AppBugReport` for that firm.

## 8. Retry endpoint only allowed for authorized roles

- **Request:** `POST /documents/:id/reprocess` or job retry endpoint with firm key (STAFF).
- **Expect:** 200/202 if allowed by design; if endpoint is admin-only, use admin key and expect 403 with firm key.

## 9. Structured errors returned safely

- **Request:** Trigger an internal error (e.g. invalid ID that causes DB throw) on a normal API route.
- **Expect:** 500 with body `{ ok: false, error: string, code?: string }`. No stack trace in response. Server logs full error.

## 10. Cross-firm support data access blocked

- **Request:** As Firm A, `GET /admin/support/bug-reports` with firm A key. If endpoint is platform-admin only, use platform admin key and filter by firmId; then as Firm B user try to access Firm A’s bug report by ID via a hypothetical GET bug-report/:id — expect 404 or 403.
- **Expect:** Firm users cannot see other firms’ bug reports; admin sees only what is intended (e.g. all reports with firm filter).

## Optional

- **Security headers:** `curl -I https://your-api/health` — expect `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`.
- **System health:** `GET /admin/system/health` with platform admin key — expect `{ api, database, redis, recentErrorCount, ... }`.
- **Report a problem (UI):** Open app → footer “Report a problem” → submit form → confirm success state and that report is created for current firm.
