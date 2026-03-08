"use strict";
/**
 * Automatically detect useful insights in uploaded documents.
 * Results are stored in document_recognition.insights.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyzeDocumentInsights = analyzeDocumentInsights;
/** Phrase (case-insensitive) → { type, severity } */
const PHRASES = [
    { phrase: "pre-existing condition", type: "pre_existing", severity: "high" },
    { phrase: "preexisting condition", type: "pre_existing", severity: "high" },
    { phrase: "degenerative", type: "degenerative", severity: "high" },
    { phrase: "degenerative changes", type: "degenerative", severity: "high" },
    { phrase: "liability disputed", type: "liability_dispute", severity: "high" },
    { phrase: "disputed liability", type: "liability_dispute", severity: "high" },
    { phrase: "gap in treatment", type: "treatment_gap", severity: "high" },
    { phrase: "gap in care", type: "treatment_gap", severity: "medium" },
    { phrase: "lapse in treatment", type: "treatment_gap", severity: "medium" },
    { phrase: "caused by", type: "causation_language", severity: "medium" },
    { phrase: "causally related", type: "causation_language", severity: "medium" },
    { phrase: "causation", type: "causation_language", severity: "low" },
    { phrase: "settlement offer", type: "settlement_offer", severity: "high" },
    { phrase: "offer to settle", type: "settlement_offer", severity: "high" },
    { phrase: "demand for settlement", type: "settlement_offer", severity: "medium" },
    { phrase: "policy limits", type: "policy_limits", severity: "high" },
    { phrase: "policy limit", type: "policy_limits", severity: "high" },
    { phrase: "limits of liability", type: "policy_limits", severity: "medium" },
];
/**
 * Analyzes document text for useful insights. Returns deduplicated list.
 */
function analyzeDocumentInsights(text) {
    if (!text || typeof text !== "string")
        return { insights: [] };
    const lower = text.toLowerCase();
    const seen = new Set();
    const insights = [];
    for (const { phrase, type, severity } of PHRASES) {
        if (seen.has(type))
            continue;
        if (lower.includes(phrase.toLowerCase())) {
            seen.add(type);
            insights.push({ type, severity });
        }
    }
    return { insights };
}
