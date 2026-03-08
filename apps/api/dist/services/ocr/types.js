"use strict";
/**
 * OCR and extraction quality types.
 * - Never assume missing values.
 * - Every extracted field: value, confidence, source snippet, extraction method.
 * - Below threshold → mark uncertain, do not autofill as final truth.
 * - Separate: OCR text quality, field extraction confidence, document classification confidence.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_CONFIDENCE_THRESHOLD = void 0;
exports.getExtractionStrictMode = getExtractionStrictMode;
/** Threshold below which we mark uncertain and (in strict mode) do not emit value as final */
exports.DEFAULT_CONFIDENCE_THRESHOLD = 0.7;
/** Strict mode: prefer null/uncertain over guessing. Default true for legal-medical. */
function getExtractionStrictMode(firmSettings) {
    if (firmSettings?.extractionStrictMode === false)
        return false;
    if (process.env.EXTRACTION_STRICT_MODE === "false")
        return false;
    return true;
}
