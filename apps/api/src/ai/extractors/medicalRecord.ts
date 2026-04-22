/**
 * Extract medical visit/record fields for timeline events.
 * Used when docType is medical_record or text looks medical.
 */
export interface MedicalRecordExtracted {
  visitDate?: string | null;
  provider?: string | null;
  facility?: string | null;
  diagnosis?: string | null;
  procedure?: string | null;
  procedures?: string[] | null;
  billingAmount?: string | null;
}

const VISIT_DATE =
  /\b(?:date of service|dos|visit date|service date|date of visit|admission date|discharge date)\s*[:\-]?\s*([0-9]{1,2}[\/\-][0-9]{1,2}[\/\-][0-9]{2,4})/i;
const PROVIDER =
  /\b(?:attending|provider|physician|doctor|md|do)\s*[:\-]?\s*([A-Z][a-zA-Z\s\.\-]{2,80}?)(?=\n|$|date|diagnosis|facility|patient)/i;
const FACILITY =
  /\b(?:facility|hospital|clinic|location|place of service)\s*[:\-]?\s*([A-Za-z0-9\s&\.\-]{3,80}?)(?=\n|$|patient|dob|date|provider)/i;
const DIAGNOSIS =
  /\b(?:diagnosis|dx|assessment|primary diagnosis|final diagnosis)\s*[:\-]?\s*([^\n]{5,200}?)(?=\n\n|\n(?:procedure|treatment|plan|code)|$)/i;
const PROCEDURE_SINGLE =
  /\b(?:procedure|treatment|service|cpt)\s*[:\-]?\s*([^\n]{5,150}?)(?=\n\n|\n(?:diagnosis|date|charge)|$)/i;
const BILLING_AMOUNT =
  /\b(?:amount|charge|total|balance due|amount due|billing amount|total charge)\s*[:\-]?\s*\$?\s*([0-9,]+(?:\.[0-9]{2})?)/i;

export function extractMedicalRecord(text: string): MedicalRecordExtracted {
  const out: MedicalRecordExtracted = {};
  const t = text.replace(/\s+/g, " ").trim();
  const tMultiline = text.trim();

  const visitMatch = t.match(VISIT_DATE);
  if (visitMatch) out.visitDate = visitMatch[1].trim();

  const providerMatch = t.match(PROVIDER);
  if (providerMatch) out.provider = providerMatch[1].trim().slice(0, 200);

  const facilityMatch = t.match(FACILITY);
  if (facilityMatch) out.facility = facilityMatch[1].trim().replace(/\s{2,}/g, " ").slice(0, 200);

  const diagMatch = tMultiline.match(DIAGNOSIS);
  if (diagMatch) out.diagnosis = diagMatch[1].trim().slice(0, 500);

  const procMatch = tMultiline.match(PROCEDURE_SINGLE);
  if (procMatch) out.procedure = procMatch[1].trim().slice(0, 300);

  const amountMatch = t.match(BILLING_AMOUNT);
  if (amountMatch) out.billingAmount = amountMatch[1].trim();

  return out;
}
