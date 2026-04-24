/**
 * Run the appropriate extractor by docType and merge into a base extractedFields object.
 */
import { extractBillingStatement, type BillingStatementExtracted } from "./billing";
import { extractCourt, type CourtExtracted } from "./court";
import { extractInsurance, type InsuranceExtracted } from "./insurance";
import { extractMedicalRecord, type MedicalRecordExtracted } from "./medicalRecord";

export type { BillingStatementExtracted, CourtExtracted, InsuranceExtracted, MedicalRecordExtracted };

export function runExtractors(
  text: string,
  docType: string,
  base: Record<string, unknown> = {}
): Record<string, unknown> {
  const merged = { ...base };
  if (docType === "court_filing" || docType.startsWith("court_")) {
    const court = extractCourt(text);
    merged.court = court;
    if (court.caseNumber) merged.caseNumber = court.caseNumber;
    if (court.filingDate) merged.filingDate = court.filingDate;
    if (court.hearingDate) merged.hearingDate = court.hearingDate;
  }
  if (docType === "insurance_letter" || docType.startsWith("insurance_")) {
    const insurance = extractInsurance(text);
    merged.insurance = insurance;
    if (insurance.claimNumber) merged.claimNumber = insurance.claimNumber;
    if (insurance.letterDate) merged.letterDate = insurance.letterDate;
    if (insurance.offerAmount) merged.offerAmount = insurance.offerAmount;
  }
  if (docType === "billing_statement" || docType === "medical_bill" || docType === "ledger_statement") {
    const billing = extractBillingStatement(text);
    merged.billing = billing;
    if (billing.totalBilled) merged.totalBilled = billing.totalBilled;
    if (billing.lineItems[0]?.providerName) merged.providerName = billing.lineItems[0].providerName;
  }
  if (docType === "medical_record" || docType === "medical" || docType === "police_report") {
    const medical = extractMedicalRecord(text);
    merged.medicalRecord = medical;
    if (medical.visitDate) merged.incidentDate = medical.visitDate;
    if (medical.provider) merged.providerName = medical.provider;
  }
  return merged;
}
