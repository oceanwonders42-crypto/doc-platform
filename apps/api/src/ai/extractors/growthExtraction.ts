/**
 * Growth tier: deeper extraction for provider details, service/treatment dates,
 * billing summary, and organization metadata. Preserves confidence/fallback;
 * weak extractions are stored with _confidence and _raw so we don't force false precision.
 */
import type { MedicalRecordExtracted } from "./medicalRecord";
import type { InsuranceExtracted } from "./insurance";
import type { CourtExtracted } from "./court";

export type GrowthConfidence = "high" | "medium" | "low";

export interface GrowthProviderDetails {
  phone?: string | null;
  fax?: string | null;
  addressLine?: string | null;
  specialty?: string | null;
  /** When low confidence, main fields may be null and value only in _raw */
  _confidence?: GrowthConfidence;
  _raw?: Record<string, unknown>;
}

export interface GrowthServiceDates {
  /** Primary service/treatment/visit date (ISO date string or parseable). */
  primaryServiceDate?: string | null;
  /** Range when document references a period (e.g. "services 01/01/24 - 01/15/24"). */
  dateFrom?: string | null;
  dateTo?: string | null;
  /** Source hint: medicalRecord | insurance | court | billing */
  source?: string | null;
  _confidence?: GrowthConfidence;
  _raw?: Record<string, unknown>;
}

export interface GrowthBillingSummary {
  totalCharged?: number | null;
  totalPaid?: number | null;
  balance?: number | null;
  currency?: string | null;
  /** When from regex only, treat as hint. */
  _fromExtractor?: "medicalRecord" | "insurance" | "billing" | null;
  _confidence?: GrowthConfidence;
  _raw?: Record<string, unknown>;
}

export interface GrowthOrganizationMetadata {
  /** Suggested category for grouping (e.g. medical_record, billing_statement). */
  suggestedCategory?: string | null;
  /** Suggested folder name for export/organization. */
  suggestedFolderName?: string | null;
  /** Short label for cross-document grouping (e.g. "ER Visit 2024-01", "Billing - Dr. Smith"). */
  crossDocLabel?: string | null;
  _confidence?: GrowthConfidence;
}

export interface GrowthExtracted {
  providerDetails?: GrowthProviderDetails | null;
  serviceDates?: GrowthServiceDates | null;
  billingSummary?: GrowthBillingSummary | null;
  organizationMetadata?: GrowthOrganizationMetadata | null;
  /** Overall confidence for this document's growth extraction. */
  _confidence?: GrowthConfidence;
}

const PHONE_FAX = /(?:phone|tel|fax)\s*[:\-#]?\s*(\+?1?[-.\s]?)?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})/gi;
const ADDRESS_LINE = /\b(?:address|location)\s*[:\-#]?\s*([0-9][^.\n]{5,120}?)(?=\n\n|\n(?:phone|fax|email)|$)/i;
const DATE_RANGE = /(?:date\s+range|period|services?\s+from|between)\s*[:\-#]?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})\s*(?:[-–—to]\s*)?(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})?/i;
const TOTAL_CHARGED = /(?:total\s+charge|amount\s+charged|charges?)\s*[:\-#]?\s*\$?\s*([\d,]+\.?\d*)/i;
const BALANCE_DUE = /(?:balance\s+due|amount\s+due|balance)\s*[:\-#]?\s*\$?\s*([\d,]+\.?\d*)/i;
const AMOUNT_PAID = /(?:amount\s+paid|paid)\s*[:\-#]?\s*\$?\s*([\d,]+\.?\d*)/i;

function parseMoney(s: string | null | undefined): number | null {
  if (s == null) return null;
  const cleaned = String(s).replace(/[$,]/g, "").trim();
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
}

function normalizeDateStr(s: string | null | undefined): string | null {
  if (!s || typeof s !== "string") return null;
  const t = s.trim();
  if (!t) return null;
  const d = new Date(t);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

/**
 * Build Growth extraction from existing extractors' output and optional recognition row.
 * Does not force incomplete extractions into false precision; low-confidence values go to _raw.
 */
export function extractGrowthFields(
  text: string,
  docType: string,
  baseExtracted: {
    medicalRecord?: MedicalRecordExtracted | null;
    insurance?: InsuranceExtracted | null;
    court?: CourtExtracted | null;
    incidentDate?: string | null;
    caseNumber?: string | null;
    clientName?: string | null;
  },
  recognition?: {
    incident_date?: string | null;
    provider_name?: string | null;
    facility_name?: string | null;
    provider_phone?: string | null;
    provider_fax?: string | null;
    provider_address?: string | null;
    provider_specialty?: string | null;
  } | null
): GrowthExtracted {
  const out: GrowthExtracted = {};
  const t = text.replace(/\s+/g, " ").trim().slice(0, 50000);

  // --- Provider details (merge recognition + text patterns; mark confidence) ---
  const phoneFromRec = recognition?.provider_phone ?? null;
  const faxFromRec = recognition?.provider_fax ?? null;
  const addressFromRec = recognition?.provider_address ?? null;
  const specialtyFromRec = recognition?.provider_specialty ?? null;

  let phone: string | null = phoneFromRec;
  let fax: string | null = faxFromRec;
  let addressLine: string | null = addressFromRec;
  let specialty: string | null = specialtyFromRec;

  if (!phone) {
    const phoneMatch = t.match(PHONE_FAX);
    if (phoneMatch) phone = phoneMatch[0].replace(/\s/g, "").slice(0, 20);
  }
  if (!fax) {
    const faxLabel = t.match(/\bfax\s*[:\-#]?\s*(\+?1?[-.\s]?)?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})/i);
    if (faxLabel) fax = faxLabel[0].replace(/\s/g, "").slice(0, 20);
  }
  if (!addressLine) {
    const addrMatch = t.match(ADDRESS_LINE);
    if (addrMatch) addressLine = addrMatch[1].trim().replace(/\s+/g, " ").slice(0, 200);
  }
  if (!specialty && /(?:primary care|orthopedic|neurology|radiology|surgery|physical therapy|emergency)/i.test(t)) {
    const specMatch = t.match(/(primary care|internal medicine|family medicine|orthopedic|neurology|radiology|emergency medicine|surgery|physical therapy|occupational therapy)/i);
    if (specMatch) specialty = specMatch[1].trim();
  }

  const providerConfidence: GrowthConfidence =
    phoneFromRec || faxFromRec || addressFromRec || specialtyFromRec ? "high" : phone || fax || addressLine || specialty ? "medium" : "low";
  if (providerConfidence !== "low" || phone || fax || addressLine || specialty) {
    out.providerDetails = {
      phone: providerConfidence === "low" ? null : phone,
      fax: providerConfidence === "low" ? null : fax,
      addressLine: providerConfidence === "low" ? null : addressLine,
      specialty: providerConfidence === "low" ? null : specialty,
      _confidence: providerConfidence,
      ...(providerConfidence === "low" && (phone || fax || addressLine || specialty)
        ? { _raw: { phone, fax, addressLine, specialty } }
        : {}),
    };
  }

  // --- Service dates (primary + range) ---
  const medical = baseExtracted.medicalRecord;
  const insurance = baseExtracted.insurance;
  const court = baseExtracted.court;
  const incidentDate = baseExtracted.incidentDate ?? recognition?.incident_date ?? null;

  let primaryServiceDate: string | null = null;
  let source: string | null = null;
  if (medical?.visitDate) {
    primaryServiceDate = normalizeDateStr(medical.visitDate) ?? medical.visitDate;
    source = "medicalRecord";
  } else if (insurance?.letterDate || insurance?.lossDate) {
    primaryServiceDate = normalizeDateStr(insurance.letterDate ?? insurance.lossDate) ?? (insurance.letterDate ?? insurance.lossDate) ?? null;
    source = "insurance";
  } else if (court?.filingDate || court?.hearingDate) {
    primaryServiceDate = normalizeDateStr(court.filingDate ?? court.hearingDate) ?? (court.filingDate ?? court.hearingDate) ?? null;
    source = "court";
  } else if (incidentDate) {
    primaryServiceDate = normalizeDateStr(incidentDate) ?? incidentDate;
    source = "recognition";
  }
  if (!primaryServiceDate && t.length >= 50) {
    const dateMatch = t.match(/(?:date of service|dos|service date|visit date)\s*[:\-#]?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i)
      || t.match(/(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/);
    if (dateMatch) {
      primaryServiceDate = normalizeDateStr(dateMatch[1]) ?? dateMatch[1];
      source = "billing";
    }
  }

  const rangeMatch = t.match(DATE_RANGE);
  let dateFrom: string | null = null;
  let dateTo: string | null = null;
  if (rangeMatch) {
    dateFrom = normalizeDateStr(rangeMatch[1]) ?? rangeMatch[1];
    dateTo = rangeMatch[2] ? (normalizeDateStr(rangeMatch[2]) ?? rangeMatch[2]) : null;
  }

  const dateConfidence: GrowthConfidence = primaryServiceDate ? (source === "medicalRecord" || source === "insurance" || source === "court" ? "high" : "medium") : "low";
  if (primaryServiceDate || dateFrom || dateTo) {
    out.serviceDates = {
      primaryServiceDate: dateConfidence === "low" ? null : primaryServiceDate,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      source: source ?? undefined,
      _confidence: dateConfidence,
      ...(dateConfidence === "low" && primaryServiceDate ? { _raw: { primaryServiceDate, dateFrom, dateTo } } : {}),
    };
  }

  // --- Billing summary (from medical record amount, insurance offer, or regex) ---
  let totalCharged: number | null = null;
  let totalPaid: number | null = null;
  let balance: number | null = null;
  let fromExtractor: "medicalRecord" | "insurance" | "billing" | null = null;

  if (medical?.billingAmount) {
    totalCharged = parseMoney(medical.billingAmount);
    fromExtractor = "medicalRecord";
  }
  if (insurance?.offerAmount) {
    const amt = parseMoney(insurance.offerAmount);
    if (amt != null && totalCharged == null) totalCharged = amt;
    if (fromExtractor == null) fromExtractor = "insurance";
  }
  if (!totalCharged || !balance) {
    const totalMatch = t.match(TOTAL_CHARGED);
    const balanceMatch = t.match(BALANCE_DUE);
    const paidMatch = t.match(AMOUNT_PAID);
    if (totalMatch) totalCharged = totalCharged ?? parseMoney(totalMatch[1]);
    if (balanceMatch) balance = parseMoney(balanceMatch[1]);
    if (paidMatch) totalPaid = parseMoney(paidMatch[1]);
    if (fromExtractor == null && (totalMatch || balanceMatch)) fromExtractor = "billing";
  }

  const billingConfidence: GrowthConfidence = fromExtractor === "medicalRecord" || fromExtractor === "insurance" ? "high" : totalCharged ?? balance ?? totalPaid ? "medium" : "low";
  if (totalCharged != null || totalPaid != null || balance != null) {
    out.billingSummary = {
      totalCharged: billingConfidence === "low" ? null : totalCharged,
      totalPaid: billingConfidence === "low" ? null : totalPaid,
      balance: billingConfidence === "low" ? null : balance,
      currency: "USD",
      _fromExtractor: fromExtractor,
      _confidence: billingConfidence,
      ...(billingConfidence === "low" ? { _raw: { totalCharged, totalPaid, balance } } : {}),
    };
  }

  // --- Organization metadata (category, folder hint, cross-doc label) ---
  const suggestedCategory = docType && docType !== "other" ? docType : null;
  const providerName = recognition?.provider_name ?? medical?.provider ?? recognition?.facility_name ?? medical?.facility ?? null;
  const suggestedFolderName =
    suggestedCategory && providerName
      ? `${suggestedCategory.replace(/_/g, " ")} - ${String(providerName).slice(0, 40)}`
      : suggestedCategory
        ? suggestedCategory.replace(/_/g, " ")
        : null;
  const crossDocLabel =
    primaryServiceDate && providerName
      ? `${String(providerName).slice(0, 30)} ${primaryServiceDate}`
      : primaryServiceDate
        ? `Document ${primaryServiceDate}`
        : providerName
          ? String(providerName).slice(0, 50)
          : null;

  out.organizationMetadata = {
    suggestedCategory: suggestedCategory ?? undefined,
    suggestedFolderName: suggestedFolderName ?? undefined,
    crossDocLabel: crossDocLabel ?? undefined,
    _confidence: suggestedCategory ? "high" : "medium",
  };

  out._confidence =
    providerConfidence === "high" || dateConfidence === "high" || billingConfidence === "high"
      ? "high"
      : providerConfidence === "medium" || dateConfidence === "medium" || billingConfidence === "medium"
        ? "medium"
        : "low";

  return out;
}
