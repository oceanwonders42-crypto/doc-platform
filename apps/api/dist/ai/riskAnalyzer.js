"use strict";
/**
 * Detects risky phrases in medical and insurance document text.
 * Results are stored in document_recognition.risks.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyzeRisks = analyzeRisks;
/** Phrase (case-insensitive) → { type, severity } */
const PHRASES = [
    { phrase: "pre-existing condition", type: "pre_existing", severity: "high" },
    { phrase: "preexisting condition", type: "pre_existing", severity: "high" },
    { phrase: "degenerative", type: "degenerative", severity: "high" },
    { phrase: "gap in treatment", type: "gap_in_treatment", severity: "high" },
    { phrase: "gap in care", type: "gap_in_treatment", severity: "medium" },
    { phrase: "liability disputed", type: "liability_disputed", severity: "high" },
    { phrase: "disputed liability", type: "liability_disputed", severity: "high" },
];
/**
 * Analyzes document text for risky phrases. Returns deduplicated list of risks.
 */
function analyzeRisks(text) {
    if (!text || typeof text !== "string")
        return { risks: [] };
    const lower = text.toLowerCase();
    const seen = new Set();
    const risks = [];
    for (const { phrase, type, severity } of PHRASES) {
        if (seen.has(type))
            continue;
        if (lower.includes(phrase.toLowerCase())) {
            seen.add(type);
            risks.push({ type, severity });
        }
    }
    return { risks };
}
