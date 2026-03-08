"use strict";
/**
 * Document type classifier for automatic folder routing.
 * Keyword-based classification (simple rules for now).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.classifyDocumentType = classifyDocumentType;
const folderMap = {
    medical_record: "Medical Records",
    medical_bill: "Medical Bills",
    police_report: "Police",
    insurance_correspondence: "Insurance",
    demand_letter: "Demand",
    lien: "Liens",
    litigation_filing: "Litigation",
    intake_form: "Intake",
    other: "Other",
};
function matchCount(text, keywords) {
    const lower = text.toLowerCase();
    let count = 0;
    for (const kw of keywords) {
        if (lower.includes(kw.toLowerCase()))
            count++;
    }
    return count;
}
/**
 * Classify document type from extracted text and return suggested CRM folder.
 */
function classifyDocumentType(text) {
    const trimmed = text.replace(/\s+/g, " ").trim();
    const lower = trimmed.toLowerCase();
    const len = trimmed.length;
    if (len < 10) {
        return { docType: "other", folder: folderMap.other, confidence: 0.3 };
    }
    const rules = [
        {
            docType: "medical_record",
            keywords: ["patient", "diagnosis", "treatment", "medical record", "date of service"],
        },
        {
            docType: "medical_bill",
            keywords: ["invoice", "balance due", "total charges", "amount due"],
        },
        {
            docType: "police_report",
            keywords: ["incident report", "officer", "vehicle", "citation"],
        },
        {
            docType: "insurance_correspondence",
            keywords: ["claim number", "policy number", "adjuster", "coverage"],
        },
        {
            docType: "demand_letter",
            keywords: ["demand", "settlement", "liability", "damages"],
        },
        {
            docType: "lien",
            keywords: ["lien", "subrogation", "medicaid", "medicare"],
        },
        {
            docType: "litigation_filing",
            keywords: ["complaint", "motion", "court", "plaintiff", "defendant"],
        },
        {
            docType: "intake_form",
            keywords: ["intake", "new client", "questionnaire", "client intake"],
        },
    ];
    let best = "other";
    let bestScore = 0;
    for (const { docType, keywords } of rules) {
        const score = matchCount(lower, keywords);
        if (score > bestScore) {
            bestScore = score;
            best = docType;
        }
    }
    const confidence = best === "other" ? 0.4 : Math.min(0.95, 0.5 + bestScore * 0.12);
    return {
        docType: best,
        folder: folderMap[best] ?? folderMap.other,
        confidence,
    };
}
