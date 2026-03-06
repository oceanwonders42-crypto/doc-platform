"use strict";
// /src/ai/docRecognition.ts
// Uses pdf-parse for PDF text extraction (no pdfjs-dist).
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractTextFromPdf = extractTextFromPdf;
exports.classifyAndExtract = classifyAndExtract;
const documentClassifier_1 = require("./documentClassifier");
const medicalRecordExtractor_1 = require("./medicalRecordExtractor");
function clean(s) {
    return s.replace(/\s+/g, " ").trim();
}
async function extractTextFromPdf(buffer) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require("pdf-parse");
    const PDFParse = mod?.PDFParse ?? mod?.default?.PDFParse;
    if (typeof PDFParse !== "function")
        throw new Error("pdf-parse PDFParse export missing");
    // pdf-parse v2: pass buffer via constructor; getText() returns { text } (no load(buffer) API)
    const parser = new PDFParse({ data: buffer });
    try {
        const data = await parser.getText();
        return String(data?.text ?? "").trim();
    }
    finally {
        if (typeof parser.destroy === "function") {
            await parser.destroy();
        }
    }
}
// KEEP your existing classify logic, but make sure it's inside this function
function classifyAndExtract(textRaw) {
    const text = clean(textRaw);
    const classification = (0, documentClassifier_1.classifyDocumentType)(text);
    const docType = classification.docType;
    const folder = classification.folder;
    let confidence = classification.confidence;
    const caseNumber = text.match(/\b(case\s*(no|#|number)\s*[:\-]?\s*)([A-Z0-9\-\/]{4,})/i)?.[3] || null;
    const clientName = text.match(/\b(client|patient|claimant)\s*[:\-]\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})\b/)?.[2] || null;
    const incidentDate = text.match(/\b(date of loss|incident date|loss date)\s*[:\-]?\s*([0-9]{1,2}\/[0-9]{1,2}\/[0-9]{2,4})/i)?.[2] || null;
    if (caseNumber)
        confidence = Math.min(0.95, confidence + 0.1);
    if (clientName)
        confidence = Math.min(0.95, confidence + 0.05);
    if (incidentDate)
        confidence = Math.min(0.95, confidence + 0.05);
    let medicalRecord;
    let resolvedClientName = clientName;
    if (docType === "medical_record") {
        medicalRecord = (0, medicalRecordExtractor_1.extractMedicalRecordFields)(text);
        if (medicalRecord.patientName)
            resolvedClientName = medicalRecord.patientName;
    }
    return {
        docType,
        folder,
        caseNumber,
        clientName: resolvedClientName,
        incidentDate,
        confidence,
        excerpt: text.slice(0, 1200),
        ...(medicalRecord ? { medicalRecord } : {}),
    };
}
