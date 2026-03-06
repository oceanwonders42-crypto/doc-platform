/**
 * Extract structured fields from insurance letter documents.
 * Used when docType === "insurance_letter" and insurance_extraction feature is on.
 * Results stored in document_recognition.insurance_fields.
 */
export interface InsuranceLetterExtracted {
  adjusterName?: string | null;
  insuranceCompany?: string | null;
  claimNumber?: string | null;
  settlementOffer?: string | null;
  policyLimits?: Record<string, string> | null;
  denialReason?: string | null;
  letterDate?: string | null;
}

const ADJUSTER_NAME = /\b(?:adjuster|claims?\s+representative|handled by)\s*[:\-]?\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i;
const INSURANCE_COMPANY = /\b(?:insurer|carrier|insurance\s+company|company)\s*[:\-]?\s*([A-Za-z][^.\n]{2,80})/i;
const CLAIM_NUMBER = /\b(?:claim\s*(?:no\.?|#|number)\s*[:\-]?\s*)([A-Z0-9\-\.\/]{4,})/i;
// Settlement offer: explicit phrases first, then generic amount-in-context
const SETTLEMENT_OFFER_EXPLICIT =
  /\b(?:settlement\s+offer|offer\s+amount|we\s+offer|our\s+offer|offer\s*[:\-])\s*\$?\s*([0-9,]+(?:\.\d{2})?)/i;
const SETTLEMENT_IN_AMOUNT =
  /\b(?:settlement|offer|payment)\s+(?:in\s+the\s+)?(?:amount|sum)\s+of\s*\$?\s*([0-9,]+(?:\.\d{2})?)/i;
const TOTAL_SETTLEMENT = /\b(?:total\s+settlement|settlement\s+total|full\s+settlement)\s+(?:of\s+)?\$?\s*([0-9,]+(?:\.\d{2})?)/i;
const OFFER_TO_SETTLE = /\b(?:offer\s+to\s+settle|proposed\s+settlement|settle\s+for)\s*\$?\s*([0-9,]+(?:\.\d{2})?)/i;
const ACCEPT_OFFER_OF = /\b(?:accept\s+(?:this\s+)?offer\s+of|accepting\s+in\s+the\s+amount\s+of)\s*\$?\s*([0-9,]+(?:\.\d{2})?)/i;
const WE_ARE_OFFERING = /\b(?:we\s+are\s+offering|we\s+offer|our\s+settlement\s+offer)\s*\$?\s*([0-9,]+(?:\.\d{2})?)/i;
const OFFER_AMT = /\b(?:offer|settlement|amount)\s*[:\-]?\s*\$?\s*([0-9,]+(?:\.\d{2})?)/i;
const POLICY_LIMITS = /\b(?:policy\s+limits?|limits?)\s*[:\-]?\s*\$?\s*([0-9,]+(?:\.\d{2})?)/i;
const LIMIT_BI = /\b(?:bodily\s+injury|BI)\s*[:\-]?\s*\$?\s*([0-9,]+(?:\.\d{2})?)/i;
const LIMIT_PD = /\b(?:property\s+damage|PD)\s*[:\-]?\s*\$?\s*([0-9,]+(?:\.\d{2})?)/i;
const LIMIT_UM = /\b(?:uninsured|UM)\s*[:\-]?\s*\$?\s*([0-9,]+(?:\.\d{2})?)/i;
const LIMIT_MED = /\b(?:med(?:ical)?\s*pay|medpay)\s*[:\-]?\s*\$?\s*([0-9,]+(?:\.\d{2})?)/i;
const DENIAL_REASON = /\b(?:denial\s+reason|reason\s+for\s+denial|because)\s*[:\-]?\s*([^.\n]{10,200})/i;
const DENIAL_WE = /\b(?:we\s+are\s+unable to|coverage\s+does\s+not|we\s+must\s+deny)\s+([^.\n]{10,200})/i;
const LETTER_DATE = /\b(?:date\s*[:\-]|letter\s+date|dated)\s*([0-9]{1,2}[\/\-][0-9]{1,2}[\/\-][0-9]{2,4})/i;
const DATE_AT_START = /^([0-9]{1,2}[\/\-][0-9]{1,2}[\/\-][0-9]{2,4})/m;

export function extractInsuranceLetter(text: string): InsuranceLetterExtracted {
  const out: InsuranceLetterExtracted = {};
  const t = text.replace(/\s+/g, " ").trim();
  const tFull = text;

  const adjusterMatch = t.match(ADJUSTER_NAME);
  if (adjusterMatch) out.adjusterName = adjusterMatch[1].trim();

  const companyMatch = t.match(INSURANCE_COMPANY);
  if (companyMatch) out.insuranceCompany = companyMatch[1].trim().slice(0, 120);

  const claimMatch = t.match(CLAIM_NUMBER);
  if (claimMatch) out.claimNumber = claimMatch[1].trim();

  const settlementMatch =
    t.match(SETTLEMENT_OFFER_EXPLICIT) ||
    t.match(SETTLEMENT_IN_AMOUNT) ||
    t.match(TOTAL_SETTLEMENT) ||
    t.match(OFFER_TO_SETTLE) ||
    t.match(ACCEPT_OFFER_OF) ||
    t.match(WE_ARE_OFFERING) ||
    t.match(OFFER_AMT);
  if (settlementMatch) out.settlementOffer = settlementMatch[1].trim();

  const limits: Record<string, string> = {};
  const bi = t.match(LIMIT_BI);
  if (bi) limits.BI = bi[1].trim();
  const pd = t.match(LIMIT_PD);
  if (pd) limits.PD = pd[1].trim();
  const um = t.match(LIMIT_UM);
  if (um) limits.UM = um[1].trim();
  const med = t.match(LIMIT_MED);
  if (med) limits.MedPay = med[1].trim();
  const policyLimitSingle = t.match(POLICY_LIMITS);
  if (policyLimitSingle && !Object.keys(limits).length) limits.limit = policyLimitSingle[1].trim();
  if (Object.keys(limits).length) out.policyLimits = limits;

  const denialReasonMatch = t.match(DENIAL_REASON) || tFull.match(DENIAL_WE);
  if (denialReasonMatch) out.denialReason = denialReasonMatch[1].trim().slice(0, 500);

  const letterDateMatch = t.match(LETTER_DATE) || tFull.match(DATE_AT_START);
  if (letterDateMatch) out.letterDate = letterDateMatch[1].trim();

  return out;
}
