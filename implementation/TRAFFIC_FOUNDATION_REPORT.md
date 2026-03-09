# Traffic Foundation — Implementation Report

## Summary

This phase adds the first traffic automation foundation: TRAFFIC as a first-class matter type, TrafficMatter model, citation/statute extraction, and a minimal demo UI. **Recommendations, CRM sync, and draft generation are NOT included in this phase.**

---

## Files Changed

### New files

| Path | Purpose |
|------|--------|
| `apps/api/src/types/matterType.ts` | MatterType (PI, TRAFFIC) and helpers; separates document type from matter/workflow type |
| `apps/api/src/ai/trafficMatterDetector.ts` | Detects TRAFFIC vs PI matter type; returns document type, routing confidence, review flag |
| `apps/api/src/ai/extractors/trafficCitationExtractor.ts` | Citation field extraction (defendant, citation #, state, county, court, dates, charge) |
| `apps/api/src/ai/extractors/trafficStatuteExtractor.ts` | Statute/code extraction + normalization (extractTrafficStatuteCode, normalizeTrafficStatuteCode) |
| `apps/api/src/services/trafficMatterService.ts` | createOrUpdateTrafficMatter, findMatchingTrafficMatter (citation/defendant/jurisdiction/date) |
| `apps/api/src/http/routes/traffic.ts` | GET /traffic (list), GET /traffic/:id (detail) |
| `apps/api/prisma/migrations/20260614000000_traffic_matter/migration.sql` | TrafficMatter table + document_recognition columns (suggested_matter_type, matter_routing_reason, matter_review_required) |
| `apps/web/app/dashboard/traffic/page.tsx` | Traffic list page |
| `apps/web/app/dashboard/traffic/[id]/page.tsx` | Traffic detail page |
| `implementation/TRAFFIC_FOUNDATION_REPORT.md` | This report |

### Modified files

| Path | Changes |
|------|--------|
| `apps/api/prisma/schema.prisma` | TrafficMatter model; Firm.trafficMatters relation |
| `apps/api/src/workers/worker.ts` | Classification: run traffic matter detection, write suggested_matter_type/matter_review_required; Extraction: if TRAFFIC run citation + statute extraction, create/update TrafficMatter, skip case_match; Case match: no-op when suggested_matter_type === TRAFFIC |
| `apps/api/src/http/server.ts` | Mount trafficRouter at /traffic |
| `apps/web/components/dashboard/DashboardSidebar.tsx` | Nav item Traffic + IconTraffic |
| `apps/web/components/dashboard/DashboardHeader.tsx` | Nav item Traffic |
| `apps/web/locales/en.json` | nav.traffic |
| `apps/web/locales/es.json` | nav.traffic |
| `apps/api/scripts/seed_demo_data.ts` | Two demo TrafficMatter rows (clean citation + review-required) |

---

## Schema Changes

- **TrafficMatter**: New table with id, firmId, caseId (nullable), crmRecordId, crmProvider, matterType (default TRAFFIC), status (NEW_CITATION, REVIEW_REQUIRED, RESPONSE_DUE, HEARING_PENDING, DRAFT_READY, CLOSED), documentTypeOfOrigin, sourceDocumentId, defendantName, defendantDob, citationNumber, statuteCodeRaw, statuteCodeNormalized, chargeDescriptionRaw, chargeListJson, jurisdictionState, jurisdictionCounty, courtName, courtType, issueDate, dueDate, hearingDate, extractedFactsJson, extractionConfidenceJson, routingConfidence, reviewRequired, createdAt, updatedAt. Indexes: firmId, (firmId, citationNumber), (firmId, jurisdictionState), (firmId, dueDate), (firmId, status), (firmId, createdAt).
- **document_recognition** (raw SQL): suggested_matter_type, matter_routing_reason, matter_review_required.

---

## Ingestion / Classification Changes

- **Document type vs matter type**: DocumentType (e.g. citation, court_filing) remains from existing classifier; MatterType (TRAFFIC vs PI) is computed in `detectTrafficMatterType()` and stored in document_recognition.suggested_matter_type.
- **Routing priority**: (1) No explicit case-on-upload for traffic in this phase; (2) document content and signals drive matter type; (3) if ambiguous (low confidence or missing citation #), matter_review_required is set and traffic matter gets status REVIEW_REQUIRED.
- **Pipeline**: After OCR → classification runs doc classifier + traffic matter detector → extraction; if TRAFFIC, citation + statute extraction run and TrafficMatter is created/updated, then pipeline completes without PI case_match. If PI, existing case_match flow unchanged.

---

## Extraction Logic Added

- **Citation fields**: trafficCitationExtractor — defendant name, citation number, state, county, court name/type, charge description, issue/due/hearing dates; raw + confidence + source snippets.
- **Statute**: trafficStatuteExtractor — statuteCodeRaw, subsection, chargeContext; normalizeTrafficStatuteCode for jurisdiction-aware format (e.g. Fla. Stat. §). Low confidence sets reviewRecommended.

---

## UI / Routes Added

- **Dashboard**: Nav item “Traffic” (staff-only in sidebar).
- **List**: `/dashboard/traffic` — defendant, citation #, state, status, issue date, due date, review-required badge.
- **Detail**: `/dashboard/traffic/[id]` — matter summary, extracted fields, statute raw + normalized, confidence summary, review-required warning, source document link.

---

## Review Queue Support

- **Triggers**: Matter type ambiguous; statute extraction weak; citation number missing/unclear; state/jurisdiction unclear; due/hearing date uncertain; possible duplicate match uncertain.
- **Storage**: TrafficMatter.reviewRequired and status REVIEW_REQUIRED; document_recognition.matter_review_required.
- **Exposure**: Detail page shows “Review required” banner and confidence; list shows “Review” badge. Existing document review queue (NEEDS_REVIEW) unchanged; traffic review is traffic-matter-centric.

---

## Completed in This Phase

- TRAFFIC matter type and separation from DocumentType.
- TrafficMatter model and migration; document_recognition matter columns.
- Traffic document detection (citation, hearing notice, court notice, disposition, order) and matter routing (TRAFFIC vs PI).
- Citation field extraction and statute extraction + normalization.
- TrafficMatter create/update with match by citation number / defendant / jurisdiction / issue date; no blind duplicates.
- Review flags and status; review surface on list/detail.
- Minimal demo UI (list + detail) and demo seed (one clean, one review-required).
- PI ingestion, OCR, document routing, review queue, and CRM behavior preserved.

---

## Intentionally Deferred

- **Recommendations**: Not in scope.
- **CRM sync for traffic matters**: Not in scope.
- **Draft generation**: Not in scope.
- **E-filing, full template generation, docket watching, multi-state statute library**: Not in scope.
- **Explicit “selected case on upload” for traffic**: Can be added later when traffic case picker exists.

---

## Known Limitations

- Statute normalization supports Florida-style and generic numeric patterns; other states can be added in normalizeTrafficStatuteCode.
- No link from Traffic detail to “source document” preview if document storage is not configured (link is present when sourceDocumentId is set).
- Migration `20260614000000_traffic_matter` must be applied (and document_recognition columns exist); if DB has pending migration issues, apply manually.
- Repeat-upload de-dup is verified by smoke test (upload same citation twice → update, not duplicate); not covered by seed data.

---

## Verification (Phase 10)

- **prisma validate**: Schema valid.
- **Migration**: `prisma migrate deploy` (or apply `20260614000000_traffic_matter` manually if shadow DB has issues).
- **API build**: `pnpm -C apps/api build` (or equivalent).
- **Web build**: `pnpm -C apps/web build` (or equivalent).
- **Routes**: GET /traffic, GET /traffic/:id.
- **Smoke**: Upload a PDF with traffic citation text → TrafficMatter created; list/detail show data. Upload again with same citation # → update, not duplicate. Low-confidence / missing citation → REVIEW_REQUIRED.
- **PI**: Upload PI-style document → still goes to case_match and review queue as before.

---

## Next Step Continuation

**Add one-state statute library + traffic recommendation engine + CRM sync for traffic matters.**
