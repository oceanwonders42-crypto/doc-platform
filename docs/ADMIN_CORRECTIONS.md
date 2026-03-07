# Admin cleanup and manual correction tools

Staff/admins can fix wrong case routing, provider matches, recognition (doc type/client/case number), and export naming **in-product** without direct DB edits. All corrections are **audited**.

---

## Correction endpoints

| Endpoint | Purpose | Body | Audit action |
|----------|---------|------|--------------|
| **POST /documents/:id/correct-routing** | Fix wrong case routing (or unroute) | `{ toCaseId: string \| null }` | `routing_corrected` |
| **POST /documents/:id/correct-provider** | Fix wrong provider match | `{ providerId: string \| null }` | `provider_corrected` |
| **PATCH /documents/:id/recognition** | Fix doc type, provider name, client/case number, incident date | `{ docType?, providerName?, clientName?, caseNumber?, incidentDate? }` | `recognition_corrected` |
| **PATCH /documents/:id/export-overrides** | Override export file name / folder path | `{ exportFileNameOverride?, exportFolderPathOverride? }` | `export_name_corrected` |

All require **auth** and **STAFF** role. Actor for audit is `apiKeyPrefix` or `"staff"`.

---

## Audit trail

- Every correction writes a **DocumentAuditEvent** with a distinct `action` and optional `metaJson` (e.g. from/to case or provider, corrected fields).
- **GET /me/audit-events** returns recent events; optional query **?action=routing_corrected,recognition_corrected** (comma-separated) filters to correction actions only.
- **GET /documents/:id/audit** (or **/documents/:id/audit-events**) returns audit for a single document.

**Audit action constants** (for filtering or UI):

- `routing_corrected`
- `provider_corrected`
- `recognition_corrected`
- `export_name_corrected`

---

## Behavior summary

- **Correct routing** — Uses shared `routeDocument` logic: updates document’s `routedCaseId`, rebuilds case timeline, ensures provider–case link when routing to a case. Pass `toCaseId: null` to unroute.
- **Correct provider** — Updates `document_recognition.suggested_provider_id` (and resolution status). If the document is already routed to a case, ensures a **CaseProvider** link for the new provider. Provider must belong to the firm.
- **Recognition** — Updates `document_recognition` fields (doc_type, provider_name, client_name, case_number, incident_date). Provider name is resolved via existing provider matching; audit records which fields were corrected.
- **Export overrides** — Sets `Document.metaJson.exportFileNameOverride` and/or `exportFolderPathOverride` for export/filing preview and case packet export. Use when naming rules are correct but one document needs a different name/path.

---

## Files

| Item | Location |
|------|----------|
| Correction service | `apps/api/src/services/adminCorrections.ts` |
| Audit service | `apps/api/src/services/audit.ts` |
| Routes | `apps/api/src/http/server.ts` (correct-routing, correct-provider, export-overrides; PATCH recognition already present, audit added) |
| Audit filter | GET `/me/audit-events?action=...` in same file |
