"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runPrimaryOcr = runPrimaryOcr;
/**
 * Primary OCR provider: embedded text first, then full text extraction.
 * Builds diagnostics (language, handwriting heuristic, page status).
 */
const docRecognition_1 = require("../../ai/docRecognition");
const languageDetection_1 = require("./languageDetection");
const handwritingDetection_1 = require("./handwritingDetection");
async function runPrimaryOcr(buffer) {
    const pageTexts = [];
    let fullText = "";
    try {
        const result = await (0, docRecognition_1.extractTextFromPdfPerPage)(buffer);
        fullText = result.fullText.trim();
        for (const p of result.pageTexts) {
            pageTexts.push({ page: p.page, text: p.text });
        }
    }
    catch (e) {
        console.warn("[ocr] primary extract failed:", e instanceof Error ? e.message : e);
        return {
            fullText: "",
            pageTexts: [],
            ocrEngine: "pdfjs",
            ocrConfidence: 0,
            pageDiagnostics: [],
            preprocessingApplied: [],
        };
    }
    const lang = (0, languageDetection_1.detectLanguage)(fullText);
    const nonLatin = (0, languageDetection_1.hasNonLatinScript)(fullText);
    const handwriting = (0, handwritingDetection_1.detectHandwritingFromText)(fullText);
    const pageDiagnostics = pageTexts.map((p) => {
        const wordCount = p.text.trim().split(/\s+/).filter(Boolean).length;
        let status = "GOOD";
        if (wordCount < 10 && fullText.length > 100)
            status = "LOW_CONFIDENCE";
        if (handwriting.hasHandwriting)
            status = handwriting.handwritingHeavy ? "HANDWRITTEN" : "NEEDS_REVIEW";
        if (nonLatin)
            status = "MIXED_LANGUAGE";
        return {
            pageNumber: p.page,
            ocrMethod: "pdfjs",
            status,
            averageConfidence: 0.9,
            detectedLanguage: lang.detectedLanguage,
            hasHandwriting: handwriting.hasHandwriting,
            needsHumanReview: status !== "GOOD",
            textLength: p.text.length,
        };
    });
    return {
        fullText,
        pageTexts,
        ocrEngine: "pdfjs",
        ocrConfidence: fullText.length > 50 ? 0.85 : 0.5,
        detectedLanguage: lang.detectedLanguage,
        possibleLanguages: lang.possibleLanguages,
        hasHandwriting: handwriting.hasHandwriting,
        handwritingHeavy: handwriting.handwritingHeavy,
        handwritingConfidence: handwriting.confidence,
        pageDiagnostics,
        preprocessingApplied: [],
    };
}
