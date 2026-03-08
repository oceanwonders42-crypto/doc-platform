"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runPrimaryOcr = runPrimaryOcr;
/**
 * Primary OCR provider: embedded text first, then full text extraction.
 * Builds diagnostics (language, handwriting heuristic, page status).
 */
const docRecognition_1 = require("../../../ai/docRecognition");
const languageDetection_1 = require("./languageDetection");
const handwritingDetection_1 = require("./handwritingDetection");
async function runPrimaryOcr(buffer) {
    const pageTexts = [];
    let fullText = "";
    try {
        const { fullText: text, pageTexts: pts } = await (0, docRecognition_1.extractTextFromPdfPerPage)(buffer);
        fullText = text.trim();
        for (const p of pts) {
            pageTexts.push({ pageNumber: p.page, text: p.text });
        }
    }
    catch (e) {
        console.warn("[ocr] primary extract failed:", e instanceof Error ? e.message : e);
        return {
            fullText: "",
            pageTexts: [],
            diagnostics: {
                ocrEngine: "pdfjs",
                ocrConfidence: 0,
                pageDiagnostics: [],
                preprocessingApplied: [],
            },
            fromEmbeddedText: false,
        };
    }
    const lang = (0, languageDetection_1.detectLanguage)(fullText);
    const nonLatin = (0, languageDetection_1.hasNonLatinScript)(fullText);
    const handwriting = (0, handwritingDetection_1.detectHandwritingFromText)(pageTexts, fullText.length > 0 ? 0.9 : undefined);
    const pageResults = pageTexts.map((p) => {
        const wordCount = p.text.trim().split(/\s+/).filter(Boolean).length;
        let qualityStatus = "GOOD";
        if (wordCount < 10 && fullText.length > 100)
            qualityStatus = "LOW_CONFIDENCE";
        if (handwriting.hasHandwriting)
            qualityStatus = handwriting.handwritingHeavy ? "HANDWRITTEN" : "NEEDS_REVIEW";
        if (nonLatin)
            qualityStatus = "MIXED_LANGUAGE";
        return {
            pageNumber: p.pageNumber,
            text: p.text,
            confidence: 0.9,
            language: lang.detectedLanguage,
            hasHandwriting: handwriting.hasHandwriting,
            qualityStatus,
        };
    });
    const pageDiagnostics = pageResults.map((p) => ({
        pageNumber: p.pageNumber,
        ocrMethod: "pdfjs",
        averageConfidence: p.confidence,
        detectedLanguage: p.language,
        hasHandwriting: p.hasHandwriting,
        qualityStatus: p.qualityStatus ?? "GOOD",
        needsHumanReview: p.qualityStatus !== "GOOD",
        wordCount: p.text.trim().split(/\s+/).filter(Boolean).length,
    }));
    const diagnostics = {
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
    return {
        fullText,
        pageTexts: pageResults,
        diagnostics,
        fromEmbeddedText: false,
    };
}
