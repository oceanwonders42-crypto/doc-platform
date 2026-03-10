"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isLowTextResult = exports.runImageOcrFallback = exports.detectHandwritingFromText = exports.detectLanguageFromText = exports.hasEmbeddedText = exports.extractEmbeddedText = exports.getExtractionStrictMode = exports.DEFAULT_CONFIDENCE_THRESHOLD = void 0;
exports.runOcrPipeline = runOcrPipeline;
const embeddedTextExtractor_1 = require("./embeddedTextExtractor");
const languageDetection_1 = require("./languageDetection");
const handwritingDetection_1 = require("./handwritingDetection");
const imageOcrFallback_1 = require("./imageOcrFallback");
var types_1 = require("./types");
Object.defineProperty(exports, "DEFAULT_CONFIDENCE_THRESHOLD", { enumerable: true, get: function () { return types_1.DEFAULT_CONFIDENCE_THRESHOLD; } });
Object.defineProperty(exports, "getExtractionStrictMode", { enumerable: true, get: function () { return types_1.getExtractionStrictMode; } });
var embeddedTextExtractor_2 = require("./embeddedTextExtractor");
Object.defineProperty(exports, "extractEmbeddedText", { enumerable: true, get: function () { return embeddedTextExtractor_2.extractEmbeddedText; } });
Object.defineProperty(exports, "hasEmbeddedText", { enumerable: true, get: function () { return embeddedTextExtractor_2.hasEmbeddedText; } });
var languageDetection_2 = require("./languageDetection");
Object.defineProperty(exports, "detectLanguageFromText", { enumerable: true, get: function () { return languageDetection_2.detectLanguageFromText; } });
var handwritingDetection_2 = require("./handwritingDetection");
Object.defineProperty(exports, "detectHandwritingFromText", { enumerable: true, get: function () { return handwritingDetection_2.detectHandwritingFromText; } });
var imageOcrFallback_2 = require("./imageOcrFallback");
Object.defineProperty(exports, "runImageOcrFallback", { enumerable: true, get: function () { return imageOcrFallback_2.runImageOcrFallback; } });
Object.defineProperty(exports, "isLowTextResult", { enumerable: true, get: function () { return imageOcrFallback_2.isLowTextResult; } });
async function runOcrPipeline(pdfBuffer, options) {
    const hasEmbedded = await (0, embeddedTextExtractor_1.hasEmbeddedText)(pdfBuffer);
    let result = hasEmbedded ? await (0, embeddedTextExtractor_1.extractEmbeddedText)(pdfBuffer) : null;
    if (!result) {
        result = await (0, embeddedTextExtractor_1.extractEmbeddedText)(pdfBuffer).catch(() => null);
    }
    if (!result || (0, imageOcrFallback_1.isLowTextResult)(result)) {
        const fallback = await (0, imageOcrFallback_1.runImageOcrFallback)(pdfBuffer, "application/pdf", {
            documentId: options?.documentId,
            firmId: options?.firmId,
            onFailure: options?.onOcrFailure,
        });
        if (result && result.fullText.trim().length > fallback.fullText.trim().length)
            return result;
        const merged = fallback.fullText.trim().length > 0 ? fallback : { ...fallback, lowQualityExtraction: true };
        return merged;
    }
    const lang = (0, languageDetection_1.detectLanguageFromText)(result.fullText);
    result.detectedLanguage = lang.detectedLanguage;
    result.possibleLanguages = lang.possibleLanguages;
    const hw = (0, handwritingDetection_1.detectHandwritingFromText)(result.fullText);
    result.hasHandwriting = hw.hasHandwriting;
    result.handwritingHeavy = hw.handwritingHeavy;
    result.handwritingConfidence = hw.confidence;
    if (result.pageDiagnostics?.length) {
        result.pageDiagnostics = result.pageDiagnostics.map((p) => {
            const needsReview = p.status === "LOW_CONFIDENCE" ||
                p.status === "HANDWRITTEN" ||
                (result.hasHandwriting && result.handwritingHeavy);
            return {
                ...p,
                detectedLanguage: result.detectedLanguage,
                hasHandwriting: result.hasHandwriting,
                needsReview,
                status: needsReview ? "NEEDS_REVIEW" : p.status,
            };
        });
    }
    return result;
}
