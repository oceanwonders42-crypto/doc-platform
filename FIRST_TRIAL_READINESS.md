# First Controlled Trial — Readiness After MVP Audit

Prepare the platform for a **narrow, controlled first trial** using the current stable product surface. No scope expansion.

---

## RECOMMENDED FIRST TRIAL SCOPE

**Narrowest reliable feature set:**

| Area | In scope for first trial |
|------|---------------------------|
| **Documents** | Ingest (POST /me/ingest, POST /me/ingest/bulk), list, filter by status, view detail, download. Pipeline: OCR → classification → extraction → case match. Statuses: RECEIVED, PROCESSING, SCANNED, CLASSIFIED, ROUTED, NEEDS_REVIEW, UPLOADED, FAILED, UNMATCHED. |
| **Cases** | List cases, view case detail, case documents, case timeline, case tasks. No requirement to use CRM/migration in trial. |
| **Review queue** | Documents in NEEDS_REVIEW; staff can route to case, mark unmatched, or leave in queue. Single-doc route (POST /documents/:id/route) and document detail routing controls. |
| **Routing** | Auto-route when confidence ≥ threshold (Essential/Growth: fixed threshold; Premium: configurable). Manual route and correct-routing for wrong/uncertain routing. |
| **Providers** | List providers, provider detail, provider–case link from routed docs. Provider search and map. No requirement to expose provider billing/invoices in trial. |
| **Records requests** | Create draft, edit letter, **manual send** (email) from records-request-detail. View attempts. No reliance on automated follow-up for trial. |
| **Dashboard** | Attention panel (unmatched, failed, overdue tasks, review queue, records requests with failed sends), daily digest, document list with filters. |
| **Billing** | **Trial only:** firm has `billingStatus: "trial"` and `trialEndsAt` in the future (or null). Plan set to **Essential** (1,500 docs/month) or a custom limit via `settings.documentLimitMonthly`. GET /billing/status and doc limit enforced at ingest. |

**Explicitly out of scope for first trial:**

- Premium workflow config (minAutoRouteConfidenceOverride, autoRouteExcludeDocTypes) and bulk-route/bulk-unroute — keep internal/admin.
- Paperless Transition checklist and migration import — internal only unless specifically needed.
- CRM sync/push, webhooks, demand packages, case insights, demand narratives.
- Records request **automated follow-up** (worker) — do not promise; manual resend only.
- Stripe/self-serve upgrade — manual plan changes via admin.
- All add-on features (insurance_extraction, court_extraction, growth_extraction, duplicates_detection, crm_sync, crm_push, case_insights) unless explicitly enabled for the trial firm.

---

## FEATURES SAFE TO EXPOSE

- **Document ingest** (single + bulk) with doc limit and billing check.
- **Document list and filters** (status, case, etc.) and document detail (view, download, route, correct routing/provider/recognition).
- **Review queue** (NEEDS_REVIEW) with route / mark unmatched / mark needs review.
- **Cases** (list, detail, timeline, documents, tasks).
- **Providers** (list, detail, search, map, aliases) — optional: hide “Billing” tab for trial if provider invoices are internal.
- **Records requests** (create, edit, **send once** via email from UI; view attempts).
- **Dashboard** (attention cards, daily digest) and **notifications**.
- **GET /billing/status** and **GET /billing/plans** (read-only); no self-serve upgrade.
- **GET /me/features** — expose only flags that are actually enabled for the trial firm (no premium_workflow if not enabled).
- **Single-document route** (POST /documents/:id/route, PATCH document with routedCaseId) and **corrections** (correct-routing, correct-provider, recognition, export-overrides) per `docs/ADMIN_CORRECTIONS.md`.

---

## FEATURES TO KEEP INTERNAL

- **Platform admin APIs and UI:** GET/PATCH /admin/firms, GET /admin/firms/:id/billing, GET /admin/jobs, /admin/errors, /admin/quality/*, /admin/system/*, /admin/incidents, /admin/security/activity, POST /admin/demo/seed. Access with PLATFORM_ADMIN API key only.
- **Premium workflow:** GET/PATCH /me/premium/workflow-config, POST /me/documents/bulk-route, POST /me/documents/bulk-unroute. Gated by `hasPremiumWorkflow`; do not enable for first trial unless explicitly needed.
- **Firm admin only:** POST /firms (create firm), POST /firms/:id/users, POST /firms/:id/api-keys, PATCH /routing-rule, PATCH /me/routing-rules, webhook create/patch, CRM connect/disconnect, PATCH /me/paperless-settings.
- **Records request follow-up worker:** Run only as internal process; do not market “automatic follow-up” for trial.
- **Migration import:** POST /migration/import, GET /migration/batches — internal only.
- **Paperless Transition:** Checklist and state APIs — internal only unless trial specifically includes them.
- **Billing simulate:** POST /billing/simulate/upgrade — dev/internal only.
- **Feature flags** (insurance_extraction, court_extraction, growth_extraction, duplicates_detection, crm_sync, crm_push, case_insights, premium_workflow): enable only when explicitly part of trial; otherwise leave off.

---

## REQUIRED ADMIN MONITORING

- **Dashboard attention panel** — Unmatched documents, Failed documents, Overdue tasks, Documents in review queue, Records requests with failed sends, Recent request send failures. Review at least daily during trial.
- **Jobs:** GET /jobs/counts and /jobs — monitor queued, running, failed; retry failed jobs via POST /jobs/:id/retry (STAFF for own firm).
- **Quality:** GET /admin/quality (PLATFORM_ADMIN) — auto-route rate, review queue count, low-confidence routes; GET /admin/quality/mvp if available.
- **Billing/usage:** GET /admin/firms/:firmId/billing — docsProcessed vs documentLimitMonthly; set trialEndsAt and plan via PATCH /admin/firms/:firmId.
- **Errors:** GET /admin/errors (PLATFORM_ADMIN) for recent system errors.
- **Records requests:** For “Records requests with failed sends,” use records-request-detail to inspect attempts and manually resend (POST /records-requests/:id/send with channel + destination) or fix letter/destination.

---

## MANUAL FALLBACKS

| Issue | Manual correction path |
|-------|-------------------------|
| **Bad routing** | Document detail: change “Routed to” case or unroute. API: POST /documents/:id/route with `caseId` or POST /documents/:id/correct-routing with `toCaseId`; PATCH /documents/:id with `routedCaseId`. All audited. |
| **Bad provider match** | Document detail or API: POST /documents/:id/correct-provider with `providerId`. Audited. |
| **Review queue uncertainty** | Route to correct case, mark unmatched, or leave in review queue. Bulk: use POST /me/documents/bulk-route (if premium enabled) or single-doc route from review-queue/document-detail. |
| **Recognition errors** | PATCH /documents/:id/recognition (docType, providerName, clientName, caseNumber, incidentDate). Audited. |
| **Records request issues** | Fix letter/destination on records-request-detail; resend via “Send” modal (POST /records-requests/:id/send with channel + destination). View attempts; no automatic retry — staff retries manually. |
| **Failed document pipeline** | Check job status (GET /jobs/:id); retry with POST /jobs/:id/retry. Inspect document status and failureStage/failureReason on document detail. |
| **Export naming** | PATCH /documents/:id/export-overrides (exportFileNameOverride, exportFolderPathOverride). Audited. |

---

## TOP RISKS TO WATCH

1. **Auto-route threshold too low** — Documents routed to wrong case with no review. Mitigation: Use Essential/Growth default threshold for trial; do not enable premium workflow config unless needed; monitor low-confidence routes in admin quality; correct routing via manual fallbacks.
2. **Review queue backlog** — NEEDS_REVIEW items pile up if staff do not clear them. Mitigation: Daily check of “Documents in review queue” and review-queue page; set expectation that staff must resolve review queue.
3. **Records request send failures** — Email/fax fails; no automatic retry. Mitigation: Monitor “Records requests with failed sends” and “Recent request send failures”; staff resend from records-request-detail after fixing destination or letter; do not promise automated follow-up.
4. **Doc limit hit mid-trial** — Ingest returns 402 when docsProcessed ≥ documentLimitMonthly. Mitigation: Set trial limit (e.g. Essential 1,500) and optionally raise via PATCH /admin/firms/:firmId (documentLimitMonthly in settings); communicate limit to trial firm.
5. **Trial expiry** — If trialEndsAt is set and passes, ingest returns 402 “Billing required. Trial expired or inactive.” Mitigation: Set trialEndsAt to a date beyond trial end; or leave null and control trial end by changing billingStatus manually.

---

## TRIAL READINESS CHECKLIST

- [ ] **Firm created** for trial (POST /firms or existing firm); not the same firm used for “Demo Firm” seed.
- [ ] **Plan set** to Essential (or desired plan) via PATCH /admin/firms/:firmId (`plan`).
- [ ] **billingStatus** = `"trial"`; **trialEndsAt** set to a date after trial end (or null).
- [ ] **documentLimitMonthly** (optional) set in firm settings if custom cap desired; otherwise plan default applies.
- [ ] **Users and API keys** created for trial firm (POST /firms/:id/users, POST /firms/:id/api-keys); staff can log in and call STAFF APIs.
- [ ] **Demo/test data separation:** Do not run POST /admin/demo/seed (or script seed_demo_data.ts) against the trial firm. Use a separate firm for “Demo Firm”; in production, demo seed is disabled unless DEMO_MODE=true or called with Bearer API key for the demo firm.
- [ ] **Manual correction paths** available: document detail and API for route, correct-routing, correct-provider, recognition; records-request-detail for send/attempts.
- [ ] **Dashboard and review queue** verified (attention panel, review-queue, document-detail routing).
- [ ] **Records request send** verified (create draft, add letter, send via email from UI; check attempts on failure).
- [ ] **Admin monitoring** in place: attention panel, jobs counts, quality metrics, firm billing/usage; process for retrying failed jobs and resending failed records requests.
- [ ] **Expectations set:** No automated records follow-up; no self-serve upgrade; review queue requires staff action; doc limit and trial end date communicated.

---

## FINAL PRE-TRIAL FIXES (IF ANY)

- **None mandatory** for a controlled first trial. Optional polish from MVP audit:
  - Fix duplicate GET /me/overdue-tasks registration in server.ts.
  - Align recognition-quality.html API_BASE with other admin pages (`var API_BASE = '';`).
  - Ensure records request follow-up worker is **not** advertised; dashboard card already reflects “Records requests with failed sends” / “Recent request send failures” (post–truth pass).
- **Do not** enable premium_workflow or add-on features (insurance_extraction, court_extraction, etc.) unless explicitly required for the trial.
- **Do not** expand product scope; use only the narrow reliable set above.

---

## FILES REFERENCE

| Topic | Location |
|------|----------|
| Billing / doc limit | `apps/api/src/services/billingPlans.ts` (canIngestDocument, getDocLimitForFirm); server.ts ingest paths (billingStatus + trialEndsAt then canIngestDocument) |
| Trial / billing status | Firm.billingStatus, Firm.trialEndsAt; server.ts 3278–3286, 3379–3387, 3520–3530, 9872–9887 |
| Manual corrections | `docs/ADMIN_CORRECTIONS.md`; server.ts (route, correct-routing, correct-provider, recognition, export-overrides) |
| Records request send | server.ts POST /records-requests/:id/send; records-request-detail.html Send modal; recordsRequestSend.ts / recordsRequestDelivery |
| Demo seed | server.ts POST /admin/demo/seed; apps/api/scripts/seed_demo_data.ts; tenant test: tests/seedTenantData.ts |
| Feature flags | `apps/api/src/services/featureFlags.ts` (hasFeature, hasPremiumWorkflow); GET /me/features in server.ts |
| Premium workflow | hasPremiumWorkflow; GET/PATCH /me/premium/workflow-config; bulk-route/bulk-unroute; worker getEffectiveMinAutoRouteConfidence |
