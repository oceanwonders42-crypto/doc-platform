# OCR and Extraction Quality — Test Checklist

Use these scenarios to validate the pipeline. Run with real or placeholder fixtures.

## 1. Clean typed English PDF

- **Input:** PDF with embedded text, English, clear layout.
- **Expect:** `ocr_engine: "embedded"`, `ocr_confidence` high, `detected_language: "en"`, `has_handwriting: false`. Fields extracted; confidence above threshold; no uncertain flags. Review not required unless routing confidence low.

## 2. Multilingual typed document

- **Input:** PDF with mixed English + Spanish (or French) text.
- **Expect:** `detected_language` one of en/es/fr; `possible_languages` may list multiple. Extraction runs; no English-only failure.

## 3. Poor scan

- **Input:** Low-quality scan (if image OCR were enabled) or PDF with very little embedded text.
- **Expect:** Low or empty text; `ocr_confidence` low or zero; page_diagnostics status LOW_CONFIDENCE or NEEDS_REVIEW. Document may go to NEEDS_REVIEW.

## 4. Rotated scan

- **Input:** PDF page(s) rotated 90/180° (embedded text may still extract).
- **Expect:** Preprocessing stub does not correct rotation; if embedded text exists, extraction proceeds. With image OCR, would need preprocess rotation.

## 5. Handwritten notes on typed medical record

- **Input:** Mostly typed PDF with some handwritten annotations (or fragmented/short-line text simulating it).
- **Expect:** `has_handwriting` possibly true from heuristic; page_diagnostics may include NEEDS_REVIEW. Handwriting not treated as reliable as typed.

## 6. Mostly handwritten form

- **Input:** Document that yields short, fragmented lines (simulate or use real handwritten form).
- **Expect:** `handwriting_heavy` possibly true; confidence lowered; document flagged for review. No fabricated typed values from handwritten regions.

## 7. Conflicting values across pages

- **Input:** Multi-page PDF where page 1 has client "Jane Doe" and page 2 has "John Smith" (or different incident dates).
- **Expect:** `runConsistencyChecks` detects conflict; `consistencyConflicts` and `consistencyCandidates` in extractedFields; confidence lowered; `uncertainFields` includes reason "conflicting_values_across_pages". Review triggered.

## 8. Embedded-text PDF vs scanned-image PDF

- **Input (embedded):** PDF with selectable text.
- **Expect:** `ocr_engine: "embedded"`, text populated, extraction runs.
- **Input (image-only):** PDF with no text layer (pure images).
- **Expect:** `runOcrPipeline` returns minimal/empty fullText; ocr_confidence low. No image OCR in current implementation, so text stays empty unless embedded.

---

## Validation points

- **Strict mode:** Set firm `extractionStrictMode: true` (default). Low confidence → fields nulled and `_uncertain` / `_suppressedValue` set.
- **Review diagnostics:** `GET /documents/:id/recognition-diagnostics` returns uncertainFields, pageDiagnostics, hasHandwriting, detectedLanguage, ocrConfidence.
- **No guessing:** When confidence &lt; threshold, extracted value must not be used as final truth; review UI should show suppressed value and reason.

## Fixture placeholders

- `fixtures/clean_english.pdf` — (add sample)
- `fixtures/multilingual.pdf` — (add sample)
- `fixtures/poor_scan.pdf` — (add sample)
- `fixtures/rotated.pdf` — (add sample)
- `fixtures/handwritten_notes.pdf` — (add sample)
- `fixtures/handwritten_form.pdf` — (add sample)
- `fixtures/conflicting_pages.pdf` — (add sample)
- `fixtures/image_only_scan.pdf` — (add sample)
