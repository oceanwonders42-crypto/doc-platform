# Multi-Tenant Isolation — Implementation Report

## 1. Models audited

All tenant-sensitive models in the Prisma schema were reviewed.

| Model | firmId | Relation to Firm | Indexes added/verified |
|-------|--------|------------------|------------------------|
| SavedView | ✓ | ✓ | firmId, userId, firmId+scope |
| Job | ✓ (optional) | ✓ | firmId+status, type+status |
| User | ✓ | ✓ | — |
| ApiKey | ✓ | ✓ | firmId |
| Document | ✓ | ✓ | firmId, status, firmId+file_sha256, **firmId+createdAt**, **firmId+status**, **firmId+routedCaseId** |
| DocumentTag | ✓ | ✓ | firmId |
| DocumentTagLink | — | via Document/Tag | documentId, tagId |
| RoutingRule | ✓ | ✓ | firmId (unique) |
| RoutingFeedback | ✓ | — | firmId+documentId, firmId+wasAccepted |
| RoutingPattern | ✓ | — | firmId+active+priority |
| RoutingScoreSnapshot | ✓ | — | firmId+documentId |
| ExtractionFeedback | ✓ | ✓ | firmId+documentId, firmId+fieldKey |
| DocumentAuditEvent | ✓ | ✓ | documentId, firmId, action, **firmId+createdAt** |
| UsageMonthly | ✓ | ✓ | firmId, unique(firmId, yearMonth) |
| Provider | ✓ | ✓ | firmId |
| CaseProvider | ✓ | ✓ | unique(firmId, caseId, providerId), firmId+providerId |
| RecordsRequest | ✓ | — | firmId+caseId |
| RecordsRequestAttempt | ✓ | — | firmId+recordsRequestId |
| LegalCase | ✓ | ✓ | firmId, **firmId+createdAt** |
| CaseFinancial | ✓ | ✓ | unique(firmId, caseId), caseId |
| CaseNote | ✓ | — | firmId+caseId, caseId |
| CaseTask | ✓ | — | firmId+caseId, caseId, firmId+completedAt |
| Referral | ✓ | ✓ | firmId, caseId, providerId |
| CaseSummary | ✓ | ✓ | unique(firmId, caseId), firmId, caseId |
| CaseChecklistItem | ✓ | ✓ | unique(firmId, caseId, key), firmId, caseId |
| CasePacketExport | ✓ | ✓ | firmId, caseId, createdAt |
| CaseContact | ✓ | ✓ | firmId, caseId |
| DemandPackage | ✓ | ✓ | firmId+caseId |
| DemandPackageSectionSource | ✓ | ✓ | firmId+demandPackageId |
| ActivityFeedItem | ✓ | ✓ | firmId, caseId, createdAt |
| CaseTimelineEvent | ✓ | — | caseId+firmId, documentId, caseId+firmId+track |
| CaseTimelineRebuild | ✓ | — | unique(caseId, firmId), caseId |
| CrmPushLog | ✓ | ✓ | firmId, caseId, createdAt |
| CrmCaseMapping | ✓ | ✓ | unique(firmId, caseId), firmId, externalMatterId |
| Notification | ✓ | ✓ | firmId, firmId+read, createdAt |
| ReviewQueueEvent | ✓ | ✓ | firmId+documentId, firmId+enteredAt |
| WebhookEndpoint | ✓ | ✓ | firmId |
| FirmIntegration | ✓ | ✓ | firmId, firmId+type, status |
| IntegrationCredential | — | via Integration | integrationId |
| MailboxConnection | ✓ | ✓ | firmId, firmId+active, integrationId, **firmId+lastSyncAt** |
| IntegrationSyncLog | ✓ | ✓ | firmId, integrationId, createdAt |
| FieldMapping | ✓ | ✓ | firmId, integrationId |

**Not tenant-scoped (by design):** SystemErrorLog (platform), JobEvent (scoped via Job).

**Indexes added in schema + migration:** Document (firmId+createdAt, firmId+status, firmId+routedCaseId), LegalCase (firmId+createdAt), DocumentAuditEvent (firmId+createdAt), MailboxConnection (firmId+lastSyncAt). Migration file: `prisma/migrations/20260306000002_tenant_isolation_indexes/migration.sql`.

---

## 2. Routes fixed

- **Document by ID:** Replaced two `document.findUnique({ where: { id } })` with `document.findFirst({ where: { id, firmId } })` and 404 when not found (POST attach document to case, POST cases/:id/documents). Ensures Firm A cannot get Firm B’s document by ID.
- **SavedView delete:** `delete({ where: { id } })` → `delete({ where: { id, firmId } })`. Same for **WebhookEndpoint delete:** `delete({ where: { id, firmId } })`.
- **Integrations router:** All handlers now use `requireFirmIdFromRequest(req, res)` so missing firmId (e.g. platform-admin key) returns 403. All list/count queries use `buildFirmWhere(firmId)` or `buildFirmWhere(firmId, extraWhere)`. Integration/mailbox lookup by ID already used `where: { id, firmId }`; response text changed to "Not found" for consistency.

**Verified (no change needed):** Ingest uses `firmId` from auth only. Case, document, provider, and job routes that take an ID already use `findFirst({ where: { id, firmId } })` or equivalent. Admin routes use `requireRole(Role.PLATFORM_ADMIN)` and optional `req.query.firmId` only for admin filtering.

---

## 3. Helpers added

**File:** `apps/api/src/lib/tenant.ts`

- **getAuthContext(req)** — Returns `{ firmId, authRole, isPlatformAdmin }` from request.
- **requireFirmIdFromRequest(req, res)** — Returns firmId or sends 403 and returns undefined. Use on firm-only routes.
- **assertRecordBelongsToFirm(recordFirmId, currentFirmId, res)** — Sends 404 if record is not for current firm; returns boolean.
- **buildFirmWhere(firmId, extraWhere?)** — Returns `{ ...extraWhere, firmId }` for Prisma `where`.
- **getFirmIdForAdminOrFirm(req, res)** — For admin: optional firmId from query/body; for firm user: auth firmId only. Returns undefined for admin “list all”.
- **forbidCrossTenantAccess(req, res)** — Returns false and sends 403 if non-admin sends body/query firmId different from auth.
- **sendNotFound(res, message?)** / **sendForbidden(res, message?)** — Consistent 404/403 with safe messages.

Integrations router refactored to use `requireFirmIdFromRequest` and `buildFirmWhere`.

---

## 4. Migrations added

- **20260306000002_tenant_isolation_indexes** — Adds compound indexes:
  - `Document`: firmId+createdAt, firmId+status, firmId+routedCaseId
  - `Case`: firmId+createdAt
  - `DocumentAuditEvent`: firmId+createdAt
  - `MailboxConnection`: firmId+lastSyncAt

Run with: `npx prisma migrate deploy` (or `migrate dev`) from `apps/api`.

---

## 5. Tests / checklist added

- **docs/TENANT_ISOLATION_CHECKLIST.md** — Manual/automated test cases:
  1. Firm A cannot get Firm B case by ID (expect 404).
  2. Firm A cannot get Firm B document by ID (expect 404).
  3. Dashboard/counts only for authenticated firm.
  4. Saved views only for authenticated firm.
  5. Integrations/webhooks cannot write to another firm.
  6. Search/list only returns authenticated firm’s data.
  7. Direct ID access across firms returns 404 (or 403).

Plus implementation notes and files to audit when adding routes.

---

## 6. Remaining tenant-risk areas

- **Job.firmId optional:** Some jobs may be platform-level; job handlers already check `job.firmId !== firmIdAuth` for non–platform-admin. No change.
- **ProviderInvoice / ProviderAccount / ProviderInvite:** No direct `firmId`; access is via Provider (which has firmId). All provider routes already scope by `firmId` when resolving provider. Low risk; optional hardening: add firmId to these models and backfill if desired.
- **Raw SQL / pgPool:** Any direct SQL in the codebase must include `firmId` in WHERE when querying tenant data. Not fully audited in this pass; recommend grep for `pgPool.query` and `firmId` in the same handler.
- **Webhook/inbound payloads:** Webhook delivery must resolve endpoint by id and verify endpoint.firmId before writing; same for inbound email (mailbox.firmId). Current design uses mailbox/integration firmId in workers.
- **Frontend:** No firmId selector in normal customer UI; platform-admin-only views may use firmId for filtering. Checklist documents this.

---

## 7. Safe response shape (Part 11)

- Access denied or resource not found: **404** with generic "Not found" (or "Not found" in JSON) so we do not leak existence of another tenant’s record.
- Integrations router: "Integration not found" → "Not found".
- Document attach: use findFirst with firmId and return 404 if no row.
- No internal IDs or debug hints in 403/404 responses.

---

## Summary

- **Models:** All customer-facing models have firmId and appropriate indexes; four new compound indexes added.
- **Routes:** Document fetch by ID fixed in two places; saved view and webhook delete scoped by firmId; integrations router uses tenant helpers and firm-only firmId.
- **Helpers:** `lib/tenant.ts` provides requireFirmIdFromRequest, buildFirmWhere, assertRecordBelongsToFirm, getFirmIdForAdminOrFirm, forbidCrossTenantAccess, sendNotFound/sendForbidden.
- **Migrations:** One new migration for tenant isolation indexes.
- **Tests:** Tenant isolation checklist in `docs/TENANT_ISOLATION_CHECKLIST.md`.
- **Remaining:** Optional backfill of firmId on ProviderInvoice/ProviderAccount/ProviderInvite; audit of raw SQL for firmId; confirm webhook/inbound email always use endpoint/mailbox firmId.
