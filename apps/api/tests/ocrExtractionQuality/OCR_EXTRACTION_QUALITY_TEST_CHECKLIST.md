# OCR and Extraction Quality — Test Checklist

Use these scenarios to validate the pipeline. Run with a running API and worker; ingest documents and inspect document_recognition and Document.extractedFields.

## 1. Clean typed English PDF

- **Input**: PDF with embedded text, English, clear font.
- **Expect**: ocr_engine = "embedded", ocr_confidence high; detected_language = "en"; has_handwriting = false; page_diagnostics status GOOD; key fields (clientName, caseNumber, incidentDate) populated if present in text; no consistency conflicts.

## 2. Multilingual typed document

- **Input**: PDF with Spanish or French keywords (e.g. "paciente", "fecha", "diagnóstico" or "patient", "date", "diagnostic" in French).
- **Expect**: detected_language in ["es","fr"] or "en"; possible_languages array; extraction still runs; no hardcoded English-only failure.

## 3. Poor scan

- **Input**: PDF that is a scan with no embedded text (or very little).
- **Expect**: Minimal or empty text_excerpt; ocr_confidence low or 0; page_diagnostics may show LOW_CONFIDENCE or NEEDS_REVIEW; document may go to NEEDS_REVIEW.

## 4. Rotated scan

- **Input**: Scanned PDF with rotated pages (if we had preprocessing, we would deskew/rotate).
- **Expect**: Currently no image preprocessing; if embedded text exists after rotation, same as clean PDF; otherwise same as poor scan.

## 5. Handwritten notes on typed medical record

- **Input**: Mostly typed text with some short/fragmented lines (simulating handwritten annotations).
- **Expect**: has_handwriting may be true depending on heuristic; handwriting_heavy possibly false; page_diagnostics may show NEEDS_REVIEW; confidence may be lowered; strict mode may null key fields if confidence < threshold.

## 6. Mostly handwritten form

- **Input**: Document where extracted “text” is fragmented/short (or use real handwritten doc when image OCR exists).
- **Expect**: has_handwriting true, handwriting_heavy true; low trust; page status NEEDS_REVIEW; key fields uncertain or null in strict mode.

## 7. Conflicting values across pages

- **Input**: Multi-page document where page_texts_json has different client names or incident dates per page (e.g. seed or mock page_texts_json).
- **Expect**: runConsistencyChecks sets consistencyConflicts and consistencyCandidates; loweredConfidence applied; extractedFields.consistencyConflicts and consistencyCandidates present; document confidence reduced; sent to review.

## 8. Embedded-text PDF vs scanned-image PDF

- **Input A**: PDF with selectable text.
- **Input B**: PDF that is image-only (no text layer).
- **Expect**: A — ocr_engine "embedded", good text length. B — empty or minimal text, ocr_confidence 0 or low; no image OCR fallback yet.

## What to report per run

- Which fields were extracted (e.g. clientName, caseNumber, incidentDate, docType).
- Confidence levels (document confidence, ocr_confidence, per-field if available).
- Whether document status is NEEDS_REVIEW and whether consistencyConflicts or *_uncertain flags are set.
- Values of detected_language, has_handwriting, page_diagnostics for review UI.

## Fixture placeholders

- `fixtures/ocr/clean_english.pdf` — clean typed English.
- `fixtures/ocr/multilingual_es.pdf` — Spanish keywords.
- `fixtures/ocr/poor_scan.pdf` — no embedded text.
- `fixtures/ocr/rotated.pdf` — rotated page(s).
- `fixtures/ocr/handwritten_notes.pdf` — typed + handwritten.
- `fixtures/ocr/mostly_handwritten.pdf` — handwritten form.
- `fixtures/ocr/conflicting_pages.pdf` — different client/date per page.

Add real PDFs when available and run ingestion + worker; then query document_recognition and Document for the document ID to verify.
