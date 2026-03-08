# Demo Seed + suggested_case_id Verification Results

## Summary

The `document_recognition.suggested_case_id` column and demo seed logic have been implemented. Several fixes were applied during verification; one manual step is required.

---

## Code Changes Applied

### 1. Migration: `suggested_case_id`

- `prisma/migrations/20260335000000_document_recognition_suggested_case_id` — adds `suggested_case_id TEXT` to `document_recognition`.

### 2. Demo Seed (`server.ts`)

- Delete order: `MedicalEvent` (by `firmId`) → `CaseTimelineEvent` → `DocumentAuditEvent` → `Document` → `LegalCase`.
- Case insert: raw SQL (DB has `clientId` NOT NULL; Prisma schema does not).
- `document_recognition`: `case_number` = display (e.g. DEMO-001), `suggested_case_id` = case id (e.g. demo-case-1).

### 3. Review Queue API

- Reads `suggested_case_id` from `document_recognition`.
- `suggestedCaseId = rec?.suggested_case_id ?? null`.

### 4. Worker & Rematch

- Worker: `suggestedCaseId = matchedCaseId` (no longer `caseNumber`).
- Worker and rematch: update `suggested_case_id` on `document_recognition`.

---

## Manual Step Required

Restart the API server so it picks up the latest code:

```bash
# In the terminal running the API:
# Ctrl+C to stop, then:
cd ~/doc-platform/apps/api && pnpm dev
```

The seed was failing with `prisma.legalCase.createMany` because:

1. The DB `Case` table has `clientId` NOT NULL (schema drift).
2. Prisma `LegalCase` does not model `clientId`.
3. The seed now uses raw SQL to insert into `Case` (with `clientId`).

---

## Verification Commands

After restarting the API:

### STEP 1–2: Migration + Services

```bash
cd ~/doc-platform/apps/api
pnpm exec prisma migrate deploy
pnpm exec prisma generate
pnpm dev
```

(Web in another terminal: `cd apps/web && pnpm dev`)

### STEP 3: Seed

```bash
DOC_API_KEY="<your-key>" pnpm run seed:demo:http
```

Or use the "Generate demo data" button on http://localhost:3000/dashboard.

### STEP 4: DB Sanity Check

```bash
psql "$DATABASE_URL" -c "
select document_id, case_number, suggested_case_id, match_confidence, match_reason
from document_recognition
order by updated_at desc
limit 10;
"
```

Expected: `case_number` like `DEMO-001`, `suggested_case_id` like `demo-case-1`.

### STEP 5: API Checks

```bash
curl -s http://127.0.0.1:4000/health
curl -s -H "Authorization: Bearer $DOC_API_KEY" http://127.0.0.1:4000/cases | head -c 400
curl -s -H "Authorization: Bearer $DOC_API_KEY" http://127.0.0.1:4000/me/review-queue | head -c 600
```

### STEP 6: Web Proxy

```bash
curl -s http://127.0.0.1:3000/api/cases | head -c 300
curl -s http://127.0.0.1:3000/api/documents | head -c 300
```

---

## Fixes Applied During Verification

| Issue | Fix |
|-------|-----|
| FK violation on Document delete | Delete `MedicalEvent` by `firmId` before documents |
| FK order | Delete `CaseTimelineEvent` before `Document` |
| Case createMany null constraint | Raw SQL `INSERT` into `Case` with `clientId`, `status` |
| Rematch not writing suggested_case_id | Added `suggested_case_id = $4` to rematch `UPDATE` |

---

## Smoke Test Checklist (from README_DEV_SMOKE_TEST.md)

1. `/dashboard` — loads, shows docs, "Offer: $50,000" on 2 docs.
2. Case column links — use `suggestedCaseId`, go to `/cases/{id}`.
3. `/dashboard/review` — at least 2 NEEDS_REVIEW rows; Preview works.
4. Confirm/Reject/Route — moves docs and auto-advances.
5. `/cases/:id` — documents list + Medical Timeline link.
6. `/cases/:id/timeline` — events render.
7. `/cases/:id/narrative` — if enabled, generates and is editable.
