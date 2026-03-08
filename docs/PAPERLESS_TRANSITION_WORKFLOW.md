# Paperless Transition — Operational Workflow

This document defines the **repeatable operational workflow** for the one-time Paperless Transition service: onboarding and migration can be run consistently per firm.

---

## 1. Workflow overview

The transition is a **checklist-driven process** with clear steps, API touchpoints, and fallback procedures.

| Phase | Step ID | Description |
|-------|--------|-------------|
| 1 | `intake` | Intake & scope: confirm document sources, volume, case structure |
| 2 | `migration_upload` | Upload backfile via migration import API |
| 3 | `migration_process` | Wait for queue processing; monitor batch status and failures |
| 4 | `review_queue` | Resolve NEEDS_REVIEW / UNMATCHED; route to cases |
| 5 | `naming_setup` | Set folder/case naming standards (export rules) |
| 6 | `crm_mapping` | Record CRM mapping notes and field decisions |
| 7 | `export_validation` | Run sample export; confirm paths and naming |
| 8 | `cleanup` | Cleanup & fallback: duplicates, failed docs, edge cases |
| 9 | `complete` | Sign-off; hand off to firm for ongoing intake |

**State and checklist** are stored in **Firm.settings.paperlessTransition** (no new DB tables). The app exposes:

- **GET /me/paperless-transition/checklist** — steps, current state, default naming templates, CRM placeholders  
- **PATCH /me/paperless-transition/state** — update `currentStepId`, `completedStepIds`, `notes`, `crmMappingNotes`

---

## 2. Repeatable intake/migration steps

1. **Create a batch**  
   Call **POST /migration/import** with multipart `files` (max 200 per request). Response includes `batchId` (e.g. `mig_abc123...`).

2. **List batches**  
   **GET /migration/batches** — returns batch IDs, `createdAt`, and `migrationQueueLength`.

3. **Monitor processing**  
   Poll **GET /migration/batches/:batchId** until processing is done. Response includes:
   - `total`, `byStatus`, `byStage`
   - `documentIds`
   - `failed` (id, originalName, failureStage, failureReason)

4. **Handle failures**  
   Use `failed` list to re-upload fixed files or document for manual review (see Fallback below).

5. **Review queue**  
   Use **GET /me/review-queue** and route/recognition APIs to clear NEEDS_REVIEW and UNMATCHED docs.

6. **Export**  
   After naming is set (see below), run case packet or single-case export and validate paths.

---

## 3. Folder/case naming standards

- Naming is controlled by **Firm.settings.exportNaming** (see `apps/api/src/services/export/namingRules.ts`).
- **GET /me/paperless-transition/checklist** returns `defaultNaming` (templates). **PATCH /me/export-naming** sets firm rules.

**Placeholders:**  
`{caseNumber}`, `{clientName}`, `{caseTitle}`, `{documentType}`, `{providerName}`, `{serviceDate}`, `{originalName}`, `{date}`

**Default template (from workflow config):**

- File: `{caseNumber}_{documentType}_{serviceDate}_{originalName}`
- Folder: `{clientName}/{caseNumber}`
- Folder by doc type: e.g. Medical Records, Billing, Insurance, Court (see `DEFAULT_NAMING_TEMPLATES` in `paperlessTransitionWorkflow.ts`).

Set naming in the **naming_setup** step; validate in **export_validation**.

---

## 4. CRM mapping notes/config

- **Firm.settings.paperlessTransition.crmMappingNotes** — key/value notes (e.g. matter ID format, folder structure, custom field mappings).
- **GET /me/paperless-transition/checklist** returns `crmPlaceholders`: suggested keys (`matterIdFormat`, `caseNumberSource`, `folderStructure`, `customFieldMappings`) with descriptions and examples.
- **PATCH /me/paperless-transition/state** accepts `crmMappingNotes` to persist these.
- Existing **CrmCaseMapping** and Clio/field mapping features remain the source of truth for case–CRM links; `crmMappingNotes` is for operational notes and decisions during transition.

---

## 5. Fallback and manual cleanup

- **Failed migration docs**  
  From **GET /migration/batches/:batchId**, use `failed`. Fix files (e.g. corrupt PDF, wrong format) and re-ingest via **POST /migration/import**, or mark for manual handling and document in operational notes.

- **Naming mismatches**  
  Adjust **exportNaming** via **PATCH /me/export-naming**; re-run export as needed.

- **Review queue backlog**  
  Bulk-route by case number/client where possible; handle edge cases manually. Use duplicate detection and PATCH document/recognition as needed. Use **admin correction** endpoints to fix wrong routing or provider without DB access (see [Admin corrections](ADMIN_CORRECTIONS.md)).

- **Cleanup step**  
  Export list of FAILED/UNMATCHED if needed; firm decides retain vs drop. Document any manual steps before marking **complete**.

- **Re-running or resetting**  
  To run transition again for the same firm: advance or reset state via **PATCH /me/paperless-transition/state** (e.g. set `currentStepId` to `intake` and clear `completedStepIds` if desired). Migration batches are immutable; new batches are new uploads.

---

## 6. What is automated vs manual

| Area | Productized (automated / in-app) | Manual / operational |
|------|-----------------------------------|------------------------|
| Migration upload | POST /migration/import; batch listing and detail | Splitting very large backfiles into batches; deciding what to re-ingest |
| Processing | Queue (OCR, classification, extraction, case match) | Interpreting failures; deciding re-run vs manual review |
| Review | Review queue API; route/recognition endpoints | Deciding routing for edge cases; bulk actions |
| Naming | exportNaming in settings; default templates in checklist | Agreeing conventions with firm; one-off overrides |
| CRM | crmMappingNotes in workflow state; CrmCaseMapping/Clio elsewhere | Deciding matter ID format and field mappings; handoff to CRM sync |
| Cleanup | Duplicate detection; document PATCH | Deciding what to retain/drop; sign-off |
| Workflow | Checklist and state in API; operational doc | Running steps in order; visibility in admin/UI if built |

---

## 7. Success criteria (recap)

- **Paperless transition is repeatable** — same checklist and APIs for every firm.
- **Migration steps are clear** — intake → upload → process → review → naming → CRM notes → export validation → cleanup → complete.
- **Cleanup and fallback are defined** — failed doc handling, naming fixes, re-run policy, and manual cleanup documented above.

---

## 8. Files and config reference

| Item | Location |
|------|----------|
| Checklist definition & state | `apps/api/src/services/paperlessTransitionWorkflow.ts` |
| Default naming templates | `DEFAULT_NAMING_TEMPLATES` in same file |
| CRM mapping placeholders | `CRM_MAPPING_PLACEHOLDERS` in same file |
| API: checklist + state | GET/PATCH `/me/paperless-transition/*` in `apps/api/src/http/server.ts` |
| Migration import/batches | POST/GET `/migration/*` in same file |
| Export naming read/write | GET/PATCH `/me/export-naming`; `namingRules.ts` |
| This runbook | `docs/PAPERLESS_TRANSITION_WORKFLOW.md` |
