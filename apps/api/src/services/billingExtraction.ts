/**
 * Queue 3: Billing extraction from bill-like documents.
 * Detects provider, service date, CPT, amounts; creates MedicalBillLineItem and updates case totals.
 */
import { prisma } from "../db/prisma";
import { pgPool } from "../db/pg";
import { Prisma } from "@prisma/client";
import { extractBillingStatement } from "../ai/extractors/billing";

const BILL_DOC_TYPES = ["medical_bill", "ledger_statement", "billing_statement", "medical_record"];

export interface ExtractedBillLine {
  providerName: string | null;
  serviceDate: Date | null;
  cptCode: string | null;
  procedureDescription: string | null;
  amountCharged: number | null;
  amountPaid: number | null;
  balance: number | null;
  lineTotal: number | null;
}

function parseMoney(s: string | null | undefined): number | null {
  if (s == null) return null;
  const cleaned = String(s).replace(/[$,]/g, "").trim();
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
}

function parseDate(s: string | null | undefined): Date | null {
  if (!s || typeof s !== "string") return null;
  const d = new Date(s.trim());
  return isNaN(d.getTime()) ? null : d;
}

function decimalToNumber(value: Prisma.Decimal | number | null | undefined): number | undefined {
  if (value == null) return undefined;
  return typeof value === "number" ? value : value.toNumber();
}

const DATE_PATTERNS = [
  /(?:date of service|dos|service date|date)\s*[:\-#]?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i,
  /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/,
];
const CPT_PATTERN = /(?:cpt|procedure code|code)\s*[:\-#]?\s*([A-Z0-9]{5})/i;

/**
 * Extract one or more bill lines from text (single-doc bill or itemized).
 */
export function extractBillFromText(
  text: string,
  providerName: string | null
): ExtractedBillLine[] {
  const extracted = extractBillingStatement(text);
  if (extracted.lineItems.length > 0) {
    return extracted.lineItems.map((line) => ({
      providerName: line.providerName ?? providerName,
      serviceDate: parseDate(line.serviceDate),
      cptCode: null,
      procedureDescription: line.procedureDescription ?? null,
      amountCharged: parseMoney(line.amountCharged),
      amountPaid: null,
      balance: null,
      lineTotal: parseMoney(line.lineTotal) ?? parseMoney(line.amountCharged),
    }));
  }

  const lines: ExtractedBillLine[] = [];
  const t = text.slice(0, 30000);

  let serviceDate: Date | null = null;
  for (const re of DATE_PATTERNS) {
    const m = t.match(re);
    if (m) {
      serviceDate = parseDate(m[1]);
      if (serviceDate) break;
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
export async function persistBillingForDocument(
  documentId: string,
  caseId: string,
  firmId: string,
  extractedLines: ExtractedBillLine[]
): Promise<void> {
  await prisma.medicalBillLineItem.deleteMany({ where: { documentId, caseId, firmId } });

  for (const line of extractedLines) {
    if (line.lineTotal == null && line.amountCharged == null && line.balance == null) continue;
    await prisma.medicalBillLineItem.create({
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

  const agg = await prisma.medicalBillLineItem.aggregate({
    where: { caseId, firmId },
    _sum: { lineTotal: true },
  });
  const total = decimalToNumber(agg._sum.lineTotal) ?? 0;

  await prisma.caseFinancial.upsert({
    where: { caseId },
    create: { firmId, caseId, medicalBillsTotal: total },
    update: { medicalBillsTotal: total },
  });
}

/**
 * If doc is bill-like, extract and persist billing; update case totals.
 */
export async function extractAndPersistBillingIfBill(
  documentId: string,
  caseId: string,
  firmId: string,
  docType: string | null
): Promise<boolean> {
  if (!caseId || !BILL_DOC_TYPES.includes(docType ?? "")) return false;

  const { rows } = await pgPool.query<{ text_excerpt: string | null; provider_name: string | null }>(
    `select text_excerpt, provider_name from document_recognition where document_id = $1`,
    [documentId]
  );
  const r = rows[0];
  const text = r?.text_excerpt ?? null;
  if (!text || text.length < 50) return false;

  const lines = extractBillFromText(text, r.provider_name);
  if (lines.length === 0) return false;

  await persistBillingForDocument(documentId, caseId, firmId, lines);
  return true;
}
