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

const VISIT_DATE_PATTERNS = [
  /\b(?:date of service|dos|visit date|service date|date of visit|admission date|discharge date|treatment date|evaluation date)\s*[:\-]?\s*([0-9]{4}-[0-9]{2}-[0-9]{2}|[0-9]{1,2}[\/\-][0-9]{1,2}[\/\-][0-9]{2,4})/i,
  /\b(?:emergency department|evaluation|consultation|follow-up visits?|follow up visits?|initial evaluation|mri(?: cervical spine)?|radiology report)\s+(?:dated|on)\s*([0-9]{4}-[0-9]{2}-[0-9]{2}|[0-9]{1,2}[\/\-][0-9]{1,2}[\/\-][0-9]{2,4})/i,
  /\bdated\s*[:\-]?\s*([0-9]{4}-[0-9]{2}-[0-9]{2}|[0-9]{1,2}[\/\-][0-9]{1,2}[\/\-][0-9]{2,4})/i,
] as const;
const INCIDENT_DATE =
  /\bincident date\s*[:\-]?\s*([0-9]{4}-[0-9]{2}-[0-9]{2}|[0-9]{1,2}[\/\-][0-9]{1,2}[\/\-][0-9]{2,4})/i;
const HEADER_FACILITY =
  /\b(?:emergency department report|mri report|radiology report|chiropractic progress notes?|treatment notes?)\s*[-:]\s*([A-Z][A-Za-z0-9\s&.'\-]{3,80}?)(?=\s+(?:Client|Patient|DOB|Incident Date)\b|$)/i;
const PROVIDER =
  /\b(?:attending|provider|physician|doctor|md|do)\s*[:\-]?\s*([A-Z][a-zA-Z\s\.\-]{2,80}?)(?=\n|$|date|diagnosis|facility|patient)/i;
const FACILITY =
  /\b(?:facility|hospital|clinic|location|place of service)\s*[:\-]?\s*([A-Za-z0-9\s&\.\-]{3,80}?)(?=\n|$|patient|dob|date|provider)/i;
const DIAGNOSIS =
  /\b(?:diagnosis|dx|assessment|primary diagnosis|final diagnosis)\s*[:\-]?\s*([^\n]{5,200}?)(?=\n\n|\n(?:procedure|treatment|plan|code)|$)/i;
const DOCUMENTED_DIAGNOSIS =
  /\b(?:documented|assessed|impression(?: recommended)?(?: correlation with)?)\s+([^.]{10,220}?)(?=\.|$)/i;
const PROCEDURE_SINGLE =
  /\b(?:procedure|treatment|service|cpt)\s*[:\-]?\s*([^\n]{5,150}?)(?=\n\n|\n(?:diagnosis|date|charge)|$)/i;
const RENDERED_TREATMENT =
  /\b(?:therapy rendered included|rendered included|treatment rendered included)\s+([^.]{10,220}?)(?=\.|$)/i;
const BILLING_AMOUNT =
  /\b(?:amount|charge|total|balance due|amount due|billing amount|total charge)\s*[:\-]?\s*\$?\s*([0-9,]+(?:\.[0-9]{2})?)/i;

export function extractMedicalRecord(text: string): MedicalRecordExtracted {
  const out: MedicalRecordExtracted = {};
  const t = text.replace(/\s+/g, " ").trim();
  const tMultiline = text.trim();

  for (const pattern of VISIT_DATE_PATTERNS) {
    const visitMatch = t.match(pattern);
    if (visitMatch) {
      out.visitDate = visitMatch[1].trim();
      break;
    }
  }
  if (!out.visitDate) {
    const incidentMatch = t.match(INCIDENT_DATE);
    if (incidentMatch) out.visitDate = incidentMatch[1].trim();
  }

  const headerFacilityMatch = t.match(HEADER_FACILITY);
  if (headerFacilityMatch) {
    out.facility = headerFacilityMatch[1].trim().replace(/\s{2,}/g, " ").slice(0, 200);
  }

  const providerMatch = t.match(PROVIDER);
  if (providerMatch) out.provider = providerMatch[1].trim().slice(0, 200);

  const facilityMatch = t.match(FACILITY);
  if (!out.facility && facilityMatch) {
    out.facility = facilityMatch[1].trim().replace(/\s{2,}/g, " ").slice(0, 200);
  }

  const diagMatch = tMultiline.match(DIAGNOSIS);
  if (diagMatch) out.diagnosis = diagMatch[1].trim().slice(0, 500);
  const documentedDiagnosisMatch = t.match(DOCUMENTED_DIAGNOSIS);
  if (!out.diagnosis && documentedDiagnosisMatch) {
    out.diagnosis = documentedDiagnosisMatch[1].trim().slice(0, 500);
  }

  const procMatch = tMultiline.match(PROCEDURE_SINGLE);
  if (procMatch) out.procedure = procMatch[1].trim().slice(0, 300);
  const renderedTreatmentMatch = t.match(RENDERED_TREATMENT);
  if (!out.procedure && renderedTreatmentMatch) {
    out.procedure = renderedTreatmentMatch[1].trim().slice(0, 300);
  }

  const amountMatch = t.match(BILLING_AMOUNT);
  if (amountMatch) out.billingAmount = amountMatch[1].trim();

  if (!out.provider && out.facility) {
    out.provider = out.facility;
  }

  return out;
}
