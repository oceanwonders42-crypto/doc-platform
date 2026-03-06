"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runExtractors = runExtractors;
/**
 * Run the appropriate extractor by docType and merge into a base extractedFields object.
 */
const court_1 = require("./court");
const insurance_1 = require("./insurance");
const medicalRecord_1 = require("./medicalRecord");
function runExtractors(text, docType, base = {}) {
    const merged = { ...base };
    if (docType === "court_filing" || docType.startsWith("court_")) {
        const court = (0, court_1.extractCourt)(text);
        merged.court = court;
        if (court.caseNumber)
            merged.caseNumber = court.caseNumber;
        if (court.filingDate)
            merged.filingDate = court.filingDate;
        if (court.hearingDate)
            merged.hearingDate = court.hearingDate;
    }
    if (docType === "insurance_letter" || docType.startsWith("insurance_")) {
        const insurance = (0, insurance_1.extractInsurance)(text);
        merged.insurance = insurance;
        if (insurance.claimNumber)
            merged.claimNumber = insurance.claimNumber;
        if (insurance.letterDate)
            merged.letterDate = insurance.letterDate;
        if (insurance.offerAmount)
            merged.offerAmount = insurance.offerAmount;
    }
    if (docType === "medical_record" || docType === "medical" || docType === "police_report") {
        const medical = (0, medicalRecord_1.extractMedicalRecord)(text);
        merged.medicalRecord = medical;
        if (medical.visitDate)
            merged.incidentDate = medical.visitDate;
    }
    return merged;
}
