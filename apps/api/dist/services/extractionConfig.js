"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getConfidenceThreshold = getConfidenceThreshold;
exports.getExtractionStrictMode = getExtractionStrictMode;
/**
 * Extraction config: strict mode and confidence threshold.
 * Legal-medical workflow prefers strict mode (no guessing).
 */
const prisma_1 = require("../db/prisma");
const ocr_1 = require("./ocr");
const CONFIDENCE_THRESHOLD_ENV = "EXTRACTION_CONFIDENCE_THRESHOLD";
function getConfidenceThreshold() {
    const raw = process.env[CONFIDENCE_THRESHOLD_ENV];
    if (raw == null || raw === "")
        return ocr_1.DEFAULT_CONFIDENCE_THRESHOLD;
    const n = parseFloat(raw);
    return Number.isFinite(n) && n >= 0 && n <= 1 ? n : ocr_1.DEFAULT_CONFIDENCE_THRESHOLD;
}
/**
 * Resolve extraction strict mode for a firm (async to load firm settings).
 * When true: do not emit low-confidence values as final; mark uncertain and send to review.
 */
async function getExtractionStrictMode(firmId) {
    if (process.env.EXTRACTION_STRICT_MODE === "false")
        return false;
    try {
        const firm = await prisma_1.prisma.firm.findUnique({
            where: { id: firmId },
            select: { settings: true },
        });
        const settings = firm?.settings ?? {};
        if (settings.extractionStrictMode === false)
            return false;
    }
    catch {
        // default true
    }
    return true;
}
