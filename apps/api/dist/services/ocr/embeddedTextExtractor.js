"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractEmbeddedText = extractEmbeddedText;
exports.hasEmbeddedText = hasEmbeddedText;
/**
 * Extract text from PDF using embedded text layer (pdfjs).
 * No image OCR - use when PDF has selectable text.
 * Returns engine "embedded" and high confidence when text is substantial.
 */
const docRecognition_1 = require("../../ai/docRecognition");
async function extractEmbeddedText(buffer) {
    const { fullText, pageTexts } = await (0, docRecognition_1.extractTextFromPdfPerPage)(buffer);
    const trimmed = fullText.trim();
    if (trimmed.length < 10)
        return null;
    const pageDiagnostics = pageTexts.map((p) => ({
        pageNumber: p.page,
        ocrMethod: "embedded",
        status: (p.text.trim().length > 20 ? "GOOD" : "LOW_CONFIDENCE"),
        textLength: p.text.length,
        averageConfidence: 0.95,
    }));
    return {
        fullText: trimmed,
        pageTexts: pageTexts.map((p) => ({ page: p.page, text: p.text })),
        ocrEngine: "embedded",
        ocrConfidence: 0.95,
        pageDiagnostics,
        preprocessingApplied: [],
    };
}
/** Check if buffer likely has embedded text by trying extraction and seeing if we get enough text. */
async function hasEmbeddedText(buffer) {
    try {
        const result = await extractEmbeddedText(buffer);
        return result != null && result.fullText.trim().length >= 20;
    }
    catch {
        return false;
    }
}
