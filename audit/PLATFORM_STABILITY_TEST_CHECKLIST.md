# Platform Stability Layer — Test Checklist

Use this checklist to verify security, support, and resilience behavior. Can be run manually or used to derive automated tests.

## Auth & admin

- [ ] Unauthenticated request to `GET /admin/errors` returns 401 (or 403).
- [ ] Unauthenticated request to `GET /admin/system/health` returns 401 (or 403).
- [ ] Unauthenticated request to `GET /admin/support/bug-reports` returns 401 (or 403).
- [ ] Request with firm admin (non–platform-admin) to `GET /admin/errors` returns 403.
- [ ] Request with platform admin API key to `GET /admin/errors` returns 200 and list of errors (or empty array).
- [ ] Request with platform admin to `GET /admin/system/health` returns 200 and `health` object (api, database, redis, queueDepth, etc.).
- [ ] Request with platform admin to `GET /admin/support/bug-reports` returns 200 and `reports` array.

## Rate limiting

- [ ] `POST /support/bug-report`: after exceeding limit (e.g. 10/min by IP), next request returns 429 or rate-limit response.
- [ ] Ingest (or other rate-limited endpoint) returns rate-limit response when over limit (if testable without side effects).

## Request validation

- [ ] `GET /admin/errors/invalid-id-format` with invalid ID format returns 400 and validation error.
- [ ] `PATCH /admin/errors/:id` with invalid body (e.g. invalid status) does not update; valid status (OPEN, ACKNOWLEDGED, RESOLVED) updates.

## Upload / file security

- [ ] Upload with disallowed extension (e.g. .exe) is rejected with 400/415 and clear error (e.g. “File type not allowed” or UNSUPPORTED_FILE).
- [ ] Upload over max size (e.g. >25MB) is rejected with 413 or PAYLOAD_TOO_LARGE.
- [ ] Upload with allowed type (e.g. PDF) is accepted when other validations pass.

## Bug report (support)

- [ ] Authenticated STAFF user can `POST /support/bug-report` with title + description; response 201 and `ok: true`, `id` returned.
- [ ] Bug report is created with correct firmId from auth (no cross-firm submission).
- [ ] Missing title or description returns 400 VALIDATION_ERROR.
- [ ] Title over 500 chars or description over 10000 chars returns 400.

## Structured errors

- [ ] API error response (e.g. 400, 403, 404, 500) has shape `{ ok: false, error: string, code?: string }`.
- [ ] 500 responses do not include stack trace in body (check in production-like mode).

## Frontend

- [ ] “Report a problem” link in layout/footer goes to `/support/report`.
- [ ] Support report form submits and shows success message; validation errors shown for invalid input.
- [ ] Admin support dashboard (platform admin only) loads and shows health; links to errors and bug reports work.
- [ ] Admin errors page lists errors; filters and “Mark resolved” work when permitted.
- [ ] Admin bug reports page lists reports and status filter works.

## Retry (optional)

- [ ] If retry/reprocess endpoints exist: only platform admin (or intended role) can call them; others get 403.
- [ ] Retry action is logged (e.g. in system error log or job event).

Mark each item when verified. Note any environment-specific steps (e.g. use platform admin API key, run against staging).
