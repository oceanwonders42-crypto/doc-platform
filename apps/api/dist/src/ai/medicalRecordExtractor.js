"use strict";
/**
 * Medical record extractor for personal injury documents.
 * Extracts common fields from hospital, clinic, and billing records using pattern matching.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractMedicalRecordFields = extractMedicalRecordFields;
function clean(s) {
    return s.replace(/\s+/g, " ").trim();
}
const EMPTY = {
    patientName: null,
    dateOfBirth: null,
    facilityName: null,
    providerName: null,
    dateOfService: null,
    dateOfServiceEnd: null,
    chiefComplaint: null,
    diagnosis: null,
    procedures: [],
    medications: [],
    totalCharges: null,
    referringPhysician: null,
    mrn: null,
};
function firstMatch(text, regex) {
    const m = text.match(regex);
    return m ? clean(m[1]) : null;
}
function allMatches(text, regex) {
    const out = [];
    let m;
    const g = new RegExp(regex.source, regex.flags);
    while ((m = g.exec(text)) !== null) {
        const v = clean(m[1]);
        if (v && !out.includes(v))
            out.push(v);
    }
    return out;
}
/**
 * Extract medical-record-specific fields from text (e.g. hospital notes, clinic records, bills).
 * Optimized for personal injury: dates of service, diagnosis, procedures, charges.
 */
function extractMedicalRecordFields(textRaw) {
    const text = clean(textRaw);
    const len = text.length;
    if (len < 50)
        return { ...EMPTY };
    const result = { ...EMPTY };
    // Patient name (common labels)
    result.patientName =
        firstMatch(text, /\b(?:patient|name of patient|patient name)\s*[:\-]\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})\b/i) ||
            firstMatch(text, /\b(?:patient|pt)\s*[:\-]\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})\b/i) ||
            null;
    // DOB
    result.dateOfBirth =
        firstMatch(text, /\b(?:dob|date of birth|birth date)\s*[:\-]?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})\b/i) ||
            firstMatch(text, /\b(?:dob|date of birth)\s*[:\-]?\s*([A-Z][a-z]+\s+\d{1,2},?\s+\d{4})\b/i) ||
            null;
    // Facility / hospital / clinic name (often at top or after "facility", "hospital", "clinic")
    result.facilityName =
        firstMatch(text, /\b(?:facility|hospital|clinic|provider)\s*[:\-]\s*([A-Za-z0-9\s&\.\-]{3,60}?)(?=\n|$|patient|dob|date)/i) ||
            firstMatch(text, /^([A-Z][A-Za-z0-9\s&\.\-]{5,50})\s*(?:medical center|hospital|health system|clinic|urgent care)/im) ||
            null;
    if (result.facilityName)
        result.facilityName = result.facilityName.replace(/\s{2,}/g, " ").trim();
    // Attending / treating provider
    result.providerName =
        firstMatch(text, /\b(?:attending|treating physician|provider|doctor|md)\s*[:\-]\s*([A-Z][a-z]+(?:\s+[A-Z][a-z\.]+){1,3})\b/i) ||
            firstMatch(text, /\b(?:attending|provider)\s*[:\-]\s*([A-Za-z\s\.]+?)(?=\n|$|date|diagnosis)/i) ||
            null;
    if (result.providerName)
        result.providerName = result.providerName.trim();
    // Date of service (single or start)
    result.dateOfService =
        firstMatch(text, /\b(?:date of service|dos|service date|date of visit)\s*[:\-]?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})\b/i) ||
            firstMatch(text, /\b(?:dos|date of service)\s*[:\-]?\s*([A-Z][a-z]+\s+\d{1,2},?\s+\d{4})\b/i) ||
            firstMatch(text, /\b(?:admission date|admit date)\s*[:\-]?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})\b/i) ||
            null;
    result.dateOfServiceEnd =
        firstMatch(text, /\b(?:discharge date|end date|to date)\s*[:\-]?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})\b/i) ||
            firstMatch(text, /\b(?:through|to)\s*[:\-]?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})\b/i) ||
            null;
    // Chief complaint
    result.chiefComplaint =
        firstMatch(text, /\b(?:chief complaint|cc|reason for visit)\s*[:\-]\s*([^\n]{10,200}?)(?=\n\n|\n(?:diagnosis|assessment|history)|$)/i) ||
            firstMatch(text, /\b(?:chief complaint|cc)\s*[:\-]\s*([^\n]{10,120})\n/i) ||
            null;
    if (result.chiefComplaint)
        result.chiefComplaint = result.chiefComplaint.trim();
    // Diagnosis (ICD or free text)
    result.diagnosis =
        firstMatch(text, /\b(?:diagnosis|dx|assessment)\s*[:\-]\s*([^\n]{5,200}?)(?=\n\n|\n(?:procedure|treatment|plan)|$)/i) ||
            firstMatch(text, /\b(?:primary diagnosis)\s*[:\-]\s*([^\n]{5,150})\n/i) ||
            null;
    if (result.diagnosis)
        result.diagnosis = result.diagnosis.trim();
    // Procedures (list or line items)
    const procedureLines = allMatches(text, /\b(?:procedure|treatment|service)\s*[:\-]\s*([A-Za-z0-9\s\-\/\(\)]{4,80})\b/gi);
    const cptLike = allMatches(text, /\b(\d{5}(?:\s*[-\/]\s*\d{2})?\s+[A-Za-z\s\-]{6,60})/g);
    if (cptLike.length > 0) {
        cptLike.forEach((v) => {
            const trimmed = clean(v);
            if (trimmed && !procedureLines.some((p) => p.includes(trimmed) || trimmed.includes(p)))
                procedureLines.push(trimmed);
        });
    }
    result.procedures = procedureLines.slice(0, 20);
    // Medications
    result.medications = allMatches(text, /\b(?:medication|medications|rx|prescription)\s*[:\-]\s*([A-Za-z0-9\s\-\.]{3,80})\b/gi).slice(0, 15);
    if (result.medications.length === 0) {
        result.medications = allMatches(text, /\b((?:[A-Z][a-z]+(?:ol|ide|ine|ate))\s+\d+\s*mg)/gi);
    }
    result.medications = result.medications.slice(0, 15);
    // Total charges / amount
    result.totalCharges =
        firstMatch(text, /\b(?:total charges|total amount|balance due|amount due)\s*[:\-]?\s*\$?\s*([\d,]+\.?\d*)\b/i) ||
            firstMatch(text, /\b(?:total)\s*[:\-]?\s*\$?\s*([\d,]+\.?\d*)\s*$/im) ||
            firstMatch(text, /\$\s*([\d,]+\.?\d{2})\s*(?:total|balance)/i) ||
            null;
    // Referring physician
    result.referringPhysician =
        firstMatch(text, /\b(?:referring physician|referred by|referral)\s*[:\-]\s*([A-Z][a-z]+(?:\s+[A-Z][a-z\.]+){1,3})\b/i) ||
            null;
    // Medical Record Number
    result.mrn =
        firstMatch(text, /\b(?:mrn|medical record number|medical record #)\s*[:\-]?\s*([A-Z0-9\-]{4,20})\b/i) ||
            null;
    return result;
}
