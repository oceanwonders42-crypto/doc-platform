# Tenant Isolation Tests + Global Tenant Guard — Implementation Report

## 1. Files created / present

| File | Purpose |
|------|--------|
| `apps/api/src/middleware/tenantGuard.ts` | Tenant guard middleware: sets `req.tenant = { firmId }`, returns 401 if no authenticated firmId. |
| `apps/api/src/lib/tenant.ts` | Helpers: `requireFirmId(req)`, `assertSameFirm(recordFirmId, firmId)`, `firmScopedWhere(firmId, where)`, plus `requireFirmIdFromRequest`, `buildFirmWhere`, `assertRecordBelongsToFirm`, `sendNotFound` / `sendForbidden`. |
| `apps/api/tests/tenantIsolation/runTenantIsolation.ts` | Tenant isolation test runner: 6 cases (see below). |
| `apps/api/tests/seedTenantData.ts` | Seeds Firm A and Firm B with case, document, provider, notification; creates API keys and writes `tests/tenantIsolation/seed-output.json`. |

---

## 2. Tests added

**Location:** `apps/api/tests/tenantIsolation/runTenantIsolation.ts`

1. **Firm A cannot read Firm B case** — `GET /cases/:caseBId` with Firm A API key → expect 404 or 403.
2. **Firm A cannot read Firm B document** — `GET /documents/:documentBId` with Firm A API key → expect 404 or 403.
3. **Firm A cannot update Firm B provider** — `PATCH /providers/:providerBId` with Firm A API key → expect 404 or 403.
4. **Firm A cannot delete Firm B data** — `DELETE /cases/:caseBId` with Firm A API key → expect 404, 403, or 405.
5. **Firm A search cannot return Firm B records** — `GET /me/documents?limit=50` with Firm A key; assert response does not contain Firm B’s document ID.
6. **Direct ID access across firms returns 404** — `GET /documents/:documentAId` with Firm B key and `GET /cases/:caseAId` with Firm B key → expect 404 or 403.

**Run:**  
1. `pnpm exec tsx tests/seedTenantData.ts` (from `apps/api`).  
2. Start API (e.g. `pnpm dev`).  
3. `pnpm exec tsx tests/tenantIsolation/runTenantIsolation.ts` or root `pnpm run test:tenant`.

---

## 3. Routes fixed (tenant isolation)

- **Document by ID:** All document access uses `findFirst({ where: { id, firmId } })` (or equivalent); no `findUnique` by id alone. On mismatch → 404 "Not found".
- **Case by ID:** `GET /cases/:id` uses `findFirst({ where: { id, firmId } })`; 404 when not found.
- **SavedView delete:** `delete({ where: { id, firmId } })`.
- **Webhook delete:** `delete({ where: { id, firmId } })`.
- **Integrations:** All handlers use `requireFirmIdFromRequest` and `buildFirmWhere`; 404 response text is generic "Not found".

---

## 4. Models missing firmId

**Audit result:** All tenant-sensitive models in the schema have `firmId` (or are scoped via a parent that has `firmId`).  

Models without direct `firmId` by design: `DocumentVersion`, `DocumentTagLink` (scoped via Document/DocumentTag), `ProviderInvoice`, `ProviderAccount`, `ProviderInvite` (scoped via Provider), `JobEvent` (scoped via Job), `SystemErrorLog` (platform).  

**No models are missing firmId** for tenant isolation as currently defined.

---

## 5. Security gaps found / addressed

- **findUnique by id without firmId:** Replaced with `findFirst({ where: { id, firmId } })` for document (and case where applicable); 404 on no match.
- **Delete by id only:** SavedView and WebhookEndpoint delete now use `where: { id, firmId }`.
- **Response leakage:** Cross-tenant access returns 404 with generic "Not found" so existence of another firm’s record is not revealed.
- **Storage paths:** All document/export keys are tenant-prefixed (`${firmId}/...`). Format is not literally `/firms/{firmId}/cases/...` but is firm-namespaced (e.g. `{firmId}/...`, `{firmId}/thumbnails/...`, `{firmId}/records_request/...`). No global bucket paths without firmId.

---

## 6. Tenant guard middleware

- **File:** `apps/api/src/middleware/tenantGuard.ts`
- **Behavior:** Reads `req.firmId` (set by auth middleware), sets `req.tenant = { firmId }`. If `firmId` is missing or empty, responds with **401** and does not call `next()`.
- **Usage:** Can be mounted after `auth()` on any route that must have a tenant context (e.g. `app.use("/me", auth, tenantGuard, ...)`). Not yet applied globally so that platform-admin and scope-only routes (e.g. ingest) remain usable.

---

## 7. Tenant audit in full_audit.js

**Section:** `tenantSecurity`

**Checks:**

- **Models missing firmId:** Any model (except Firm, SystemErrorLog, JobEvent, DocumentVersion, DocumentTagLink, ProviderInvoice, ProviderAccount, ProviderInvite) that does not contain `firmId` or a Firm relation is reported.
- **findUnique without firmId:** Matches `findUnique({ where: { id: ... } })` in `server.ts` that do not include `firmId` in the same `where`.
- **where { id } without firmId:** Matches `where: { id: ... }` without `firmId` in the same clause.
- **Routes missing firm filter:** In `http/routes/*.ts`, files that use `findMany` but do not mention `firmId`, `buildFirmWhere`, or `firmScopedWhere` are reported.
- **Storage path:** Files that call `putObject` but do not contain `firmId` or `${firmId}` in the file are reported as possible non-tenant keys.

**Output:** Warnings are written to `audit/latest_audit.json` under `tenantSecurity.warnings` and summarized in `audit/latest_audit.txt`.

---

## 8. Response safety

- On firm mismatch or cross-tenant access: **404** with message `"Not found"` (or equivalent generic message).  
- No response reveals that a resource exists in another firm; no internal IDs or debug details in 404/403 bodies.

---

## 9. Scripts

- **Root:** `"test:tenant": "pnpm --filter api test:tenant"`
- **API:** `"test:tenant": "tsx tests/tenantIsolation/runTenantIsolation.ts"`, `"seed:tenant": "tsx tests/seedTenantData.ts"`

---

## Summary

- **Tenant guard:** Implemented in `middleware/tenantGuard.ts`; sets `req.tenant = { firmId }`, 401 if no firmId.
- **Helpers:** `lib/tenant.ts` provides `requireFirmId`, `assertSameFirm`, `firmScopedWhere` plus existing request/response helpers.
- **Tests:** Six tenant isolation cases in `tests/tenantIsolation/runTenantIsolation.ts`; seeder in `tests/seedTenantData.ts`.
- **Audit:** `scripts/full_audit.js` includes `tenantSecurity` (models, findUnique/where, routes, storage) and writes results to `audit/latest_audit.json` and `latest_audit.txt`.
- **Storage:** Document and related keys use firmId-prefixed paths; no global unqualified paths.
- **Responses:** Cross-tenant access returns 404 without leaking existence of other firm’s data.
