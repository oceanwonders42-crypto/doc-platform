"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.withEvidence = withEvidence;
exports.getStrictModeFromFirm = getStrictModeFromFirm;
const types_1 = require("./types");
function withEvidence(value, confidence, opts) {
    const threshold = opts.threshold ?? types_1.DEFAULT_CONFIDENCE_THRESHOLD;
    const strict = opts.strictMode ?? true;
    const uncertain = confidence < threshold;
    const finalValue = strict && uncertain ? null : (value != null && String(value).trim() !== "" ? String(value).trim() : null);
    return {
        extractedValue: finalValue,
        rawValue: value != null ? String(value).trim() : null,
        normalizedValue: opts.normalizedValue ?? finalValue,
        confidence,
        sourceText: opts.sourceText ?? null,
        pageNumber: opts.pageNumber ?? null,
        extractionMethod: opts.extractionMethod,
        uncertain,
    };
}
function getStrictModeFromFirm(firmSettings) {
    return (0, types_1.getExtractionStrictMode)(firmSettings ?? null);
}
