# Cross-Tenant Security — Isolation Checklist

Use this checklist to verify and test that Firm A cannot access Firm B's data.

## Automated / Manual Test Cases

1. **Firm A user requests Firm B case by ID**
   - Call `GET /cases/:id` or case detail with Firm B's case ID using Firm A's API key.
   - **Expected:** 404 (Not found). Must not return case data.

2. **Firm A user requests Firm B document by ID**
   - Call document endpoints (e.g. `GET /documents/:id`, download, preview) with Firm B's document ID using Firm A's API key.
   - **Expected:** 404. Must not return document or file content.

3. **Firm A user cannot see Firm B dashboard counts**
   - Call dashboard/digest/metrics with Firm A's key; verify counts only include Firm A data.
   - **Expected:** All counts scoped to Firm A. No Firm B data in response.

4. **Firm A saved views cannot load Firm B filters**
   - Create saved view as Firm A. Request saved views list with Firm A key.
   - **Expected:** Only Firm A's saved views. Access to saved view by ID must use firmId in where clause.

5. **Firm A integration/webhook cannot write into Firm B**
   - Integration sync and webhook handlers must resolve firm from integration/mailbox/webhook endpoint and only write to that firm.
   - **Expected:** No endpoint allows body/query firmId to override auth for writes.

6. **Firm A cannot search Firm B clients/providers/documents**
   - Use search or list endpoints with Firm A key; attempt to filter or access by known Firm B identifiers.
   - **Expected:** Empty or only Firm A results. All list/search must include `where: { firmId }` from auth.

7. **Direct object ID access across firms returns 403 or 404**
   - For any resource by ID (case, document, provider, integration, etc.), use Firm B's resource ID with Firm A's API key.
   - **Expected:** 404 (preferred) or 403. Do not leak existence of other tenant's resource.

## Implementation Notes

- **firmId source:** All customer-facing routes must derive `firmId` from authenticated context (API key or session), never from `req.body`, `req.query`, or `req.params` for data access.
- **Admin routes:** Only `PLATFORM_ADMIN` may use optional `?firmId=` for cross-firm read; firm users must never pass firmId to switch context.
- **Responses:** Use 404 for "resource not found or not allowed" to avoid leaking whether another firm's record exists.
- **Storage paths:** Document and file keys are namespaced by firmId (e.g. `{firmId}/...`); never serve files without verifying document belongs to request firm.

## Files to Audit When Adding New Routes

- `apps/api/src/http/server.ts` — all `app.get/post/patch/delete` that touch tenant data.
- `apps/api/src/http/routes/*.ts` — use `requireFirmIdFromRequest` and `buildFirmWhere` from `lib/tenant.ts`.
- Workers and cron jobs that process per-firm data must filter by firmId from the job payload or integration record, not from user input.
