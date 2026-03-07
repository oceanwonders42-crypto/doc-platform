# Platform Stability Layer — Test Checklist

Use this checklist for manual or automated API tests to verify security, support, and resilience behavior.

---

## 1. Unauthorized admin blocked

- [ ] **GET /admin/errors** without auth → 401 (or 403).
- [ ] **GET /admin/errors** with valid auth but non–platform-admin role → 403.
- [ ] **GET /admin/system/health** without auth → 401 (or 403).
- [ ] **GET /admin/support/bug-reports** without auth → 401 (or 403).
- [ ] **PATCH /admin/errors/:id** without auth → 401 (or 403).

---

## 2. Rate limiting

- [ ] **POST /support/bug-report**: send >10 requests per minute from same IP → 429 or rate-limit response after threshold.
- [ ] Ingest (or other rate-limited endpoint): exceed per-key/minute limit → 429 or rate-limit response.

---

## 3. Invalid or oversized payload

- [ ] **POST /support/bug-report** with empty `title` or `description` → 400, `code: "VALIDATION_ERROR"`.
- [ ] **POST /support/bug-report** with `title` longer than 500 chars → 400.
- [ ] **PATCH /admin/errors/:id** with invalid `:id` (e.g. non-cuid string) → 400, `code: "VALIDATION_ERROR"`.
- [ ] **GET /admin/errors/not-a-valid-id** → 400 (validateIdParam) or 404.
- [ ] (If maxBodySize is applied) Request with Content-Length > 25MB → 413, `code: "PAYLOAD_TOO_LARGE"`.

---

## 4. Suspicious file type rejected

- [ ] **POST /ingest** with file extension `.exe` or `.js` (and corresponding MIME) → 400, `code: "UNSUPPORTED_FILE"` or equivalent.
- [ ] **POST /ingest** with file size > 25MB → 400 (e.g. "File too large" or UNSUPPORTED_FILE).
- [ ] **POST /ingest** with allowed type (e.g. PDF) → 201 or expected success path.

---

## 5. Bug report create

- [ ] **POST /support/bug-report** with valid auth (STAFF), body: `{ title: "Test", description: "Details" }` → 201, `{ ok: true, id: "..." }`.
- [ ] Verify record in DB (AppBugReport) with correct firmId and userId from auth (no firmId in body).
- [ ] **POST /support/bug-report** without auth → 401 (or 403).
- [ ] **POST /support/bug-report** with auth but non-STAFF role → 403.

---

## 6. Retry / reprocess authorization

- [ ] If retry/reprocess endpoints exist: call with non–platform-admin → 403.
- [ ] Call with platform admin → success or expected business logic response.

---

## 7. Structured errors (no stack to client)

- [ ] Trigger a 500 (e.g. force an internal error in a dev route). Response body must be `{ ok: false, error: string, code?: string }` with no `stack` or internal paths.
- [ ] 404 for missing resource → `{ ok: false, error: "...", code: "NOT_FOUND" }` (or equivalent).
- [ ] 400 validation → `code: "VALIDATION_ERROR"`.

---

## 8. Cross-firm support isolation

- [ ] **POST /support/bug-report**: ensure firmId is taken only from auth/session; body must not be able to override firmId.
- [ ] **GET /admin/support/bug-reports**: as platform admin, response includes reports from all firms; filtering by `firmId` query works.
- [ ] Non–platform-admin cannot list other firms’ bug reports (admin endpoint returns 403).

---

## 9. Frontend

- [ ] “Report a problem” link visible (e.g. in footer or shell) and goes to `/support/report`.
- [ ] Support form submits successfully when logged in as STAFF; shows success message and optional “Submit another”.
- [ ] Support form shows user-friendly error for 400/403/429 (e.g. via getUserMessage).
- [ ] Admin support dashboard loads for platform admin; shows health and links to errors and bug reports.
- [ ] Admin errors page: list loads, filters work, “Mark resolved” updates status.
- [ ] Admin bug reports page: list loads, filters (firm, status, priority) work.

---

## 10. Audit script

- [ ] Run `node scripts/full_audit.js` from repo root.
- [ ] Check `audit/latest_audit.json`: `platformStability` and `supportAndResilience` sections present; no unexpected warnings for security headers, error log, rate limits, support pages, upload validation, system health.

---

## Minimal API test examples (pseudo)

```bash
# 1. Admin without auth
curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/admin/errors
# Expect: 401 or 403

# 2. Bug report with auth
curl -s -X POST http://localhost:3001/support/bug-report \
  -H "Authorization: Bearer YOUR_STAFF_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"Test","description":"Details"}'
# Expect: 201 and {"ok":true,"id":"..."}

# 3. Invalid ID on PATCH
curl -s -X PATCH http://localhost:3001/admin/errors/invalid-id \
  -H "Authorization: Bearer PLATFORM_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status":"RESOLVED"}'
# Expect: 400 with validation error
```

Adjust host, port, and tokens to your environment.
