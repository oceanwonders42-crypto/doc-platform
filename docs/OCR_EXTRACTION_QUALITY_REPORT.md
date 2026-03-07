# OCR and Extraction Quality — Implementation Report

## Summary

The document ingestion and extraction pipeline was upgraded to support:
- **Extraction principles**: confidence and evidence on fields; no guessing when below threshold; separate OCR vs classification vs extraction confidence.
- **Multilingual**: language detection (heuristic en/es/fr), stored on document_recognition.
- **Handwriting-aware**: heuristic detection from text; flags stored; lower trust by default.
- **Page-level diagnostics**: status per page (GOOD, LOW_CONFIDENCE, HANDWRITTEN, NEEDS_REVIEW, etc.).
- **No-guess mode**: strict extraction; low-confidence or conflicting values are nulled or marked uncertain and sent to review.
- **Consistency checks**: compare client name and incident date across pages; lower confidence and flag conflicts.
- **Review API**: GET /documents/:id/recognition now returns OCR diagnostics (detectedLanguage, hasHandwriting, pageDiagnostics, etc.) for the review queue UI.

Existing business logic (classification, extractors, case matching, routing) is unchanged except where integration was required.

---

## Part 1 — Extraction principles

- **Types** (`apps/api/src/services/ocr/types.ts`): `ExtractedFieldWithEvidence` (extractedValue, confidence, sourceText, pageNumber, sourceRegion, extractionMethod, uncertain, candidates). `DEFAULT_CONFIDENCE_THRESHOLD = 0.7`. `getExtractionStrictMode(firmSettings)` (default true).
- **Evidence helper** (`apps/api/src/services/ocr/evidence.ts`): `withEvidence()` builds a field with confidence and uncertain flag; in strict mode, below threshold → extractedValue null.
- **Worker**: Uses `getExtractionStrictMode(firmId)` and `getConfidenceThreshold()`; applies `applyStrictModeToFlatFields()` so low-confidence key fields are nulled and `*_uncertain` / `*_raw` set; stores `consistencyConflicts` and `consistencyCandidates` in extractedFields when conflicts exist.

---

## Part 2 — Multilingual OCR support

- **Language detection** (`apps/api/src/services/ocr/languageDetection.ts`): `detectLanguageFromText(text)` — heuristic keyword counts for English, Spanish, French; returns `detectedLanguage`, `possibleLanguages`, `confidence`.
- **Pipeline**: After embedded text extraction, `runOcrPipeline()` calls `detectLanguageFromText()` and sets `ocrResult.detectedLanguage` and `ocrResult.possibleLanguages`.
- **Storage**: `document_recognition.detected_language`, `document_recognition.possible_languages` (JSONB). Exposed in GET `/documents/:id/recognition` as `detectedLanguage`, `possibleLanguages`.
- **Note**: Current OCR is embedded text only (pdfjs). When image OCR is added, language packs or multilingual mode can be wired in the OCR provider.

---

## Part 3 — Handwriting-aware processing

- **Handwriting detection** (`apps/api/src/services/ocr/handwritingDetection.ts`): `detectHandwritingFromText(text)` — heuristic (fragmented lines, short words, variance); returns `hasHandwriting`, `handwritingHeavy`, `confidence`.
- **Pipeline**: `runOcrPipeline()` sets `ocrResult.hasHandwriting`, `ocrResult.handwritingHeavy`, `ocrResult.handwritingConfidence`. Page diagnostics get `hasHandwriting` and `needsReview` when handwriting is heavy.
- **Storage**: `document_recognition.has_handwriting`, `handwriting_heavy`, `handwriting_confidence`. Exposed in GET `/documents/:id/recognition`.
- **Trust**: Handwriting is not treated as equally reliable as clean typed text; page status can be NEEDS_REVIEW.

---

## Part 4 — Image/PDF preprocessing

- **Preprocess module** (`apps/api/src/services/ocr/preprocess.ts`): `preprocessPageImage()`, `preprocessPdfPage()` — stubs; return buffer unchanged and `applied: []`. Track what was applied when a real implementation (e.g. sharp for deskew/denoise/contrast) is added.
- **Embedded text first**: Pipeline uses embedded text extraction first; image OCR fallback is not implemented.

---

## Part 5 — Page-level OCR diagnostics

- **Types**: `PageDiagnostic` (pageNumber, ocrMethod, averageConfidence, detectedLanguage, hasHandwriting, qualityPoor, needsReview, status). `PageStatus`: GOOD | LOW_CONFIDENCE | HANDWRITTEN | BLURRY | MIXED_LANGUAGE | NEEDS_REVIEW.
- **Pipeline**: `extractEmbeddedText()` builds `pageDiagnostics` per page (status GOOD or LOW_CONFIDENCE from text length). `runOcrPipeline()` adds detectedLanguage, hasHandwriting, needsReview.
- **Storage**: `document_recognition.page_diagnostics` (JSONB). Exposed in GET `/documents/:id/recognition` as `pageDiagnostics`.

---

## Part 6 — Field extraction with evidence

- **Shape**: Extracted fields can carry `ExtractedFieldWithEvidence` (value, confidence, sourceText, pageNumber, normalizedValue, rawValue, uncertain, candidates). Current extractors (medical, court, insurance) still return flat fields; worker merges with base fields and then applies strict mode and consistency.
- **Strict mode** (`extractionEvidence.ts`): `applyStrictModeToFlatFields(extracted, documentConfidence, strictMode, threshold)` nulls key fields when strict and below threshold, and sets `*_raw` and `*_uncertain`.
- **Storage**: `Document.extractedFields` (JSON) can contain consistencyConflicts, consistencyCandidates; key fields may be null with `clientName_raw`, `clientName_uncertain`, etc.

---

## Part 7 — No-guess mode

- **Config** (`apps/api/src/services/extractionConfig.ts`): `getExtractionStrictMode(firmId)` (async) from firm settings; `getConfidenceThreshold()` from env `EXTRACTION_CONFIDENCE_THRESHOLD` or default 0.7.
- **Behavior**: When strict and document confidence &lt; threshold, key fields (caseNumber, clientName, incidentDate) are nulled and marked uncertain; raw values kept for review. Ambiguous or conflicting values are not treated as final truth.
- **Storage**: `document_recognition.extraction_strict_mode` (boolean) set from firm at extraction time.

---

## Part 8 — Cross-checking / consistency logic

- **Service** (`apps/api/src/services/extractionConsistency.ts`): `runConsistencyChecks({ clientName, incidentDate, caseNumber, pageCandidates })` compares values across pages; returns `conflicts[]`, `candidates`, `loweredConfidence`.
- **Worker**: Runs consistency when `page_texts_json` has multiple pages; uses lowered confidence if conflicts; attaches `consistencyConflicts` and `consistencyCandidates` to extractedFields.

---

## Part 9 — Human review improvements

- **API**: GET `/documents/:id/recognition` now includes:
  - `detectedLanguage`, `possibleLanguages`, `ocrEngine`, `ocrConfidence`
  - `hasHandwriting`, `handwritingHeavy`, `handwritingConfidence`
  - `pageDiagnostics`, `extractionStrictMode`
- **Uncertain fields**: In extractedFields, `*_uncertain` and `*_raw` indicate low-confidence or strict-mode nulling. `consistencyConflicts` and `consistencyCandidates` explain conflicts.
- **Review UI**: Frontend can highlight uncertain fields, show source snippet/page, and show reasons (low OCR confidence, handwriting, conflicts, etc.). Correction and audit trail use existing document/case routing and feedback APIs; no new correction endpoint was added in this pass.

---

## Part 10 — OCR/extraction metrics

- **Stored**: document_recognition stores ocr_confidence, has_handwriting, detected_language, page_diagnostics (including status counts). extraction_strict_mode and confidence are stored.
- **Aggregation**: No new metrics table or admin dashboard widget was added. Existing quality/analytics queries can be extended to SELECT ocr_confidence, has_handwriting, detected_language from document_recognition for quality reporting (e.g. low-confidence field rate, handwriting doc rate, multilingual rate).

---

## Part 11 — Engine abstraction

- **Layout** (`apps/api/src/services/ocr/`):
  - `index.ts`: `runOcrPipeline()`, re-exports types and helpers.
  - `types.ts`: OcrResult, PageDiagnostic, PageStatus, ExtractedFieldWithEvidence, DEFAULT_CONFIDENCE_THRESHOLD, getExtractionStrictMode.
  - `embeddedTextExtractor.ts`: uses pdfjs `extractTextFromPdfPerPage`; returns OcrResult with engine "embedded".
  - `languageDetection.ts`: heuristic en/es/fr.
  - `handwritingDetection.ts`: heuristic from text.
  - `preprocess.ts`: stubs for deskew/denoise/etc.
  - `evidence.ts`: withEvidence(), getStrictModeFromFirm().
- **Flow**: 1) Extract embedded text; 2) detect language and handwriting; 3) build page diagnostics; 4) return OcrResult. Worker persists to document_recognition and continues to classification → extraction → case_match.

---

## Part 12 — Document types

- No hardcoded English-only assumptions in the new code. Language detection and diagnostics are generic. Existing classifiers and extractors (medical, insurance, court, billing, police) are unchanged; they can be extended later for multilingual patterns.

---

## Part 13 — Testing

- **Checklist** (`apps/api/tests/ocrExtractionQuality/OCR_EXTRACTION_QUALITY_TEST_CHECKLIST.md`): scenarios for clean English PDF, multilingual, poor scan, rotated, handwritten on typed, mostly handwritten, conflicting values, embedded vs scanned. What to verify: fields extracted, confidence levels, review triggered.
- **Fixtures**: No fixture PDFs added; checklist references placeholder paths. Integration tests can be added when fixture docs are available.

---

## Part 14 — Files created/changed

| Area | Path |
|------|------|
| OCR types | `apps/api/src/services/ocr/types.ts` |
| OCR pipeline | `apps/api/src/services/ocr/index.ts` |
| Embedded text | `apps/api/src/services/ocr/embeddedTextExtractor.ts` |
| Language detection | `apps/api/src/services/ocr/languageDetection.ts` |
| Handwriting detection | `apps/api/src/services/ocr/handwritingDetection.ts` |
| Preprocess | `apps/api/src/services/ocr/preprocess.ts` |
| Evidence helper | `apps/api/src/services/ocr/evidence.ts` |
| Extraction config | `apps/api/src/services/extractionConfig.ts` |
| Strict mode / evidence | `apps/api/src/services/extractionEvidence.ts` |
| Consistency | `apps/api/src/services/extractionConsistency.ts` |
| Migration | `apps/api/prisma/migrations/20260306000004_ocr_extraction_quality/migration.sql` (already existed) |
| Worker | `apps/api/src/workers/worker.ts` (uses runOcrPipeline, persistence of new columns, getExtractionStrictMode, applyStrictModeToFlatFields, runConsistencyChecks) |
| API | `apps/api/src/http/server.ts` (GET /documents/:id/recognition extended with OCR diagnostics) |
| Report | `docs/OCR_EXTRACTION_QUALITY_REPORT.md` |

---

## Known limitations

- **Image OCR**: Only embedded PDF text is used. Scanned PDFs with no text layer still yield empty or minimal text; no Tesseract or other image OCR integrated.
- **Preprocessing**: Deskew, denoise, contrast are stubs; no actual image preprocessing.
- **Handwriting**: Heuristic only; no vision-based handwriting model. Handwriting-heavy docs should be routed to review.
- **Language**: Heuristic keyword detection (en/es/fr); no CLD or full-language pack OCR.
- **Metrics dashboard**: No new admin widget; data is in document_recognition for future reporting.
- **Correction storage**: Corrections continue to use existing routing/feedback; no new “corrected value” store for extraction tuning in this pass.

Priority was kept on accuracy and strict no-guess extraction; low-confidence and conflicting extractions are marked uncertain and sent to review rather than autofilled.
