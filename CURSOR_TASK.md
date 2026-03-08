# Doc-Platform Master Task (single source of truth)

## Goal
Build a firm-scoped AI document intake layer:
Sources: upload + IMAP (any provider host/port).
Pipeline: ingest → store → worker → text extract (pdf-parse) → OCR (AWS Textract for scanned/image) → classify → extract fields (medical records) → match to Case DB → status set (UPLOADED / NEEDS_REVIEW / UNMATCHED) → optional route to CRM adapter (Clio/Litify/webhook).
Dashboard: list documents, show docType/confidence/client/case#/status badge; NeedsReview card for NEEDS_REVIEW; Change Case search; approve/reject routes.

## Hard Rules
- Do NOT query non-existent Document columns (docType, suggestedFolder).
- Recognition data lives in `document_recognition` (doc_type, confidence, client_name, case_number, incident_date, ocr_*, match_*).
- Status logic:
  - matchConfidence > 0.9 → auto-assign (status stays UPLOADED), routingStatus="auto-assigned"
  - 0.5 ≤ matchConfidence ≤ 0.9 → status=NEEDS_REVIEW, suggestedCaseId=caseId
  - matchConfidence < 0.5 → status=UNMATCHED, suggestedCaseId=null

## Acceptance checklist (Cursor should implement/verify in this order)
1) API: GET /documents returns docType/confidence/clientName/caseNumber/matchConfidence/matchReason/ocrProvider from JOIN with document_recognition (or null if missing).
2) Worker: processes PDFs + images; writes recognition + match fields; sets status per rules.
3) Seed: dev endpoints can generate test docs for green/yellow/red states (or adjust matching thresholds for testing).
4) Web dashboard: shows green/yellow/red badges correctly and can open doc detail with NeedsReview card for NEEDS_REVIEW.
5) Change Case modal: autocomplete via /cases/search; Approve routes to /documents/:id/approve.
6) Routing: /documents/:id/route supports generic webhook + stubs for Clio/Litify.

## How to run locally
API:   cd apps/api && pnpm dev
Worker: cd apps/api && pnpm dev:worker
Web:   cd apps/web && pnpm dev

