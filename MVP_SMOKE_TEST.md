# MVP Smoke Test

Use this checklist on the normal local stack.

## Preconditions

- API running on `http://127.0.0.1:4000`
- Active web app running on `http://127.0.0.1:3000`
- `pnpm run bootstrap:dev` already completed in `apps/api`

## Smoke Steps

1. Open `/dashboard`
   - Confirm the page loads without error

2. Upload one fresh file
   - Confirm upload succeeds
   - Confirm the document appears in recent documents
   - Confirm it advances beyond `uploaded`

3. Upload multiple fresh files in one batch
   - Confirm each file shows a per-file result
   - Confirm successful files appear in recent documents

4. Re-upload a duplicate
   - Confirm it is marked duplicate
   - Confirm the existing document link is shown

5. Confirm review entry
   - Open review queue
   - Confirm fresh uploaded documents appear there
   - Confirm persisted review state is `IN_REVIEW`

6. Exercise review lifecycle
   - Approve one document
   - Reject one document
   - Mark one approved document as `EXPORT_READY`
   - Confirm state persists after refresh

7. Create a case with contact data
   - Create a new case from `/cases/new`
   - Confirm the case appears in the case list
   - Confirm case detail shows structured client/contact data

8. Create and update a records request
   - Create a draft request for the case
   - Edit the request
   - Confirm normalized status remains correct

9. Send or simulate records-request progression
   - If SMTP env is configured, send the request and confirm:
     - HTTP success
     - `status = SENT`
     - `sentAt` is populated
     - `requestDate` is populated
   - If SMTP env is not configured, confirm the send path returns a clear error and persists `FAILED`
   - Confirm receive/complete behavior still transitions to normalized status

10. Export from the case page
   - Export contacts CSV
   - Export matters CSV
   - Export packet bundle
   - Confirm packet export includes only `EXPORT_READY` documents once persisted review states exist

## Quick Command Checks

From `apps/api`:

```bash
pnpm run doctor
pnpm run bootstrap:dev
```

From any shell:

```bash
curl -s http://127.0.0.1:4000/health
curl -s http://127.0.0.1:3000/healthz
curl -s http://127.0.0.1:3000/dashboard
```

SMTP env required for real outbound email:

```bash
SMTP_HOST=...
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=...
SMTP_PASS=...
SMTP_FROM=...
```

## Pass Criteria

- Fresh uploads process automatically into review on the normal local stack
- Duplicate uploads are handled cleanly
- Review state is durable
- Case and contact data persist correctly
- Records-request lifecycle uses normalized statuses
- Case exports succeed and packet export respects `EXPORT_READY`
- If SMTP is configured, outbound records-request email succeeds through the active send path
