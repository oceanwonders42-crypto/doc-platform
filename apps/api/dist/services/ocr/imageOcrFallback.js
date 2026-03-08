"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runImageOcrFallback = runImageOcrFallback;
exports.isLowTextResult = isLowTextResult;
const MIN_TEXT_LENGTH_FOR_SUCCESS = 20;
/**
 * Stub image OCR. Returns empty result and reports failure via onFailure.
 * Implement with Tesseract/Textract when needed.
 */
async function runImageOcrFallback(_buffer, _mimeType, opts = {}) {
    const { documentId, firmId, onFailure } = opts;
    const message = "Image OCR fallback not implemented; document has no embedded text";
    onFailure?.({
        stage: "ocr_fallback",
        message,
        documentId,
        firmId,
    });
    return {
        fullText: "",
        pageTexts: [],
        ocrEngine: "fallback_unavailable",
        ocrConfidence: 0,
        pageDiagnostics: [],
        preprocessingApplied: ["attempted_image_ocr"],
    };
}
function isLowTextResult(result) {
    const text = (result.fullText || "").trim();
    return text.length < MIN_TEXT_LENGTH_FOR_SUCCESS;
}
