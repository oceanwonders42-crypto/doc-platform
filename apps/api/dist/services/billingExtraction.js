"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractBillFromText = extractBillFromText;
exports.persistBillingForDocument = persistBillingForDocument;
exports.extractAndPersistBillingIfBill = extractAndPersistBillingIfBill;
/**
 * Queue 3: Billing extraction from bill-like documents.
 * Detects provider, service date, CPT, amounts; creates MedicalBillLineItem and updates case totals.
 */
const prisma_1 = require("../db/prisma");
const pg_1 = require("../db/pg");
const BILL_DOC_TYPES = ["medical_bill", "ledger_statement", "billing_statement", "medical_record"];
function parseMoney(s) {
    if (s == null)
        return null;
    const cleaned = String(s).replace(/[$,]/g, "").trim();
    const n = parseFloat(cleaned);
    return isNaN(n) ? null : n;
}
function parseDate(s) {
    if (!s || typeof s !== "string")
        return null;
    const d = new Date(s.trim());
    return isNaN(d.getTime()) ? null : d;
}
const DATE_PATTERNS = [
    /(?:date of service|dos|service date|date)\s*[:\-#]?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i,
    /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/,
];
const CPT_PATTERN = /(?:cpt|procedure code|code)\s*[:\-#]?\s*([A-Z0-9]{5})/i;
/**
 * Extract one or more bill lines from text (single-doc bill or itemized).
 */
function extractBillFromText(text, providerName) {
    const lines = [];
    const t = text.slice(0, 30000);
    let serviceDate = null;
    for (const re of DATE_PATTERNS) {
        const m = t.match(re);
        if (m) {
            serviceDate = parseDate(m[1]);
            if (serviceDate)
                break;
        }
    }
    const totalMatch = t.match(/(?:total|amount due|balance due)\s*[:\-#]?\s*\$?\s*([\d,]+\.?\d*)/i);
    const totalAmount = totalMatch ? parseMoney(totalMatch[1]) : null;
    const balanceMatch = t.match(/balance\s*[:\-#]?\s*\$?\s*([\d,]+\.?\d*)/i);
    const balanceAmount = balanceMatch ? parseMoney(balanceMatch[1]) : null;
    const cptMatch = t.match(CPT_PATTERN);
    const cptCode = cptMatch ? cptMatch[1] : null;
    lines.push({
        providerName,
        serviceDate,
        cptCode,
        procedureDescription: null,
        amountCharged: totalAmount,
        amountPaid: totalAmount != null && balanceAmount != null ? totalAmount - balanceAmount : null,
        balance: balanceAmount,
        lineTotal: totalAmount ?? balanceAmount,
    });
    return lines;
}
/**
 * Create MedicalBillLineItem records for a document and case; update CaseFinancial.medicalBillsTotal.
 */
async function persistBillingForDocument(documentId, caseId, firmId, extractedLines) {
    await prisma_1.prisma.medicalBillLineItem.deleteMany({ where: { documentId, caseId, firmId } });
    for (const line of extractedLines) {
        if (line.lineTotal == null && line.amountCharged == null && line.balance == null)
            continue;
        await prisma_1.prisma.medicalBillLineItem.create({
            data: {
                firmId,
                caseId,
                documentId,
                providerName: line.providerName,
                serviceDate: line.serviceDate,
                cptCode: line.cptCode,
                procedureDescription: line.procedureDescription,
                amountCharged: line.amountCharged,
                amountPaid: line.amountPaid,
                balance: line.balance,
                lineTotal: line.lineTotal ?? line.amountCharged ?? line.balance,
            },
        });
    }
    const agg = await prisma_1.prisma.medicalBillLineItem.aggregate({
        where: { caseId, firmId },
        _sum: { lineTotal: true },
    });
    const totalRaw = agg._sum.lineTotal;
    const total = typeof totalRaw === "number" ? totalRaw : totalRaw?.toNumber() ?? 0;
    await prisma_1.prisma.caseFinancial.upsert({
        where: { caseId },
        create: { firmId, caseId, medicalBillsTotal: total },
        update: { medicalBillsTotal: total },
    });
}
/**
 * If doc is bill-like, extract and persist billing; update case totals.
 */
async function extractAndPersistBillingIfBill(documentId, caseId, firmId, docType) {
    if (!caseId || !BILL_DOC_TYPES.includes(docType ?? ""))
        return false;
    const { rows } = await pg_1.pgPool.query(`select text_excerpt, provider_name from document_recognition where document_id = $1`, [documentId]);
    const r = rows[0];
    const text = r?.text_excerpt ?? null;
    if (!text || text.length < 50)
        return false;
    const lines = extractBillFromText(text, r.provider_name);
    if (lines.length === 0)
        return false;
    await persistBillingForDocument(documentId, caseId, firmId, lines);
    return true;
}
