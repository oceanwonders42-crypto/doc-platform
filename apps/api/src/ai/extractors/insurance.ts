/**
 * Extract insurance/adjuster-related fields from document text.
 * Used when docType starts with "insurance_".
 */
export interface InsuranceExtracted {
  claimNumber?: string | null;
  policyNumber?: string | null;
  insurerName?: string | null;
  adjusterName?: string | null;
  adjusterEmail?: string | null;
  adjusterPhone?: string | null;
  lossDate?: string | null;
  letterDate?: string | null;
  coverageDecision?: "accepted" | "denied" | null;
  denialReasons?: string[] | null;
  offerAmount?: string | null;
  limits?: { BI?: string; PD?: string; UM?: string; MedPay?: string } | null;
}

const CLAIM_NO = /\b(?:claim\s*(?:no\.?|#|number)\s*[:\-]?\s*)([A-Z0-9\-\.\/]{4,})/i;
const POLICY_NO = /\b(?:policy\s*(?:no\.?|#|number)\s*[:\-]?\s*)([A-Z0-9\-\.\/]{4,})/i;
const INSURER = /\b(?:insurer|carrier|company)\s*[:\-]?\s*([A-Za-z][^.\n]{2,60})/i;
const ADJUSTER_NAME = /\b(?:adjuster|claims?\s+representative)\s*[:\-]?\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i;
const ADJUSTER_EMAIL = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
const ADJUSTER_PHONE = /\b(?:phone|tel|ph)\s*[:\-]?\s*\(?([0-9]{3})\)?[\s.-]?([0-9]{3})[\s.-]?([0-9]{4})/i;
const LOSS_DATE = /\b(?:date of loss|loss date|incident date|dol)\s*[:\-]?\s*([0-9]{1,2}[\/\-][0-9]{1,2}[\/\-][0-9]{2,4})/i;
const LETTER_DATE = /\b(?:date\s*[:\-]|letter\s+date)\s*([0-9]{1,2}[\/\-][0-9]{1,2}[\/\-][0-9]{2,4})/i;
const DENIAL = /\b(?:denied|denial|we are unable to|coverage does not)\b/i;
const ACCEPTED = /\b(?:accepted|coverage is afforded|we will provide)\b/i;
const OFFER_AMT = /\b(?:offer|settlement|amount)\s*[:\-]?\s*\$?\s*([0-9,]+(?:\.\d{2})?)/i;
const LIMIT_BI = /\b(?:bodily injury|BI)\s*[:\-]?\s*\$?\s*([0-9,]+(?:\.\d{2})?)/i;
const LIMIT_PD = /\b(?:property damage|PD)\s*[:\-]?\s*\$?\s*([0-9,]+(?:\.\d{2})?)/i;
const LIMIT_UM = /\b(?:uninsured|UM)\s*[:\-]?\s*\$?\s*([0-9,]+(?:\.\d{2})?)/i;
const LIMIT_MED = /\b(?:med(?:ical)?\s*pay|medpay)\s*[:\-]?\s*\$?\s*([0-9,]+(?:\.\d{2})?)/i;

export function extractInsurance(text: string): InsuranceExtracted {
  const out: InsuranceExtracted = {};
  const t = text.replace(/\s+/g, " ").trim();

  const claimMatch = t.match(CLAIM_NO);
  if (claimMatch) out.claimNumber = claimMatch[1].trim();

  const policyMatch = t.match(POLICY_NO);
  if (policyMatch) out.policyNumber = policyMatch[1].trim();

  const insurerMatch = t.match(INSURER);
  if (insurerMatch) out.insurerName = insurerMatch[1].trim().slice(0, 120);

  const adjusterMatch = t.match(ADJUSTER_NAME);
  if (adjusterMatch) out.adjusterName = adjusterMatch[1].trim();

  const emailMatch = t.match(ADJUSTER_EMAIL);
  if (emailMatch) out.adjusterEmail = emailMatch[0];

  const phoneMatch = t.match(ADJUSTER_PHONE);
  if (phoneMatch) out.adjusterPhone = `${phoneMatch[1]}-${phoneMatch[2]}-${phoneMatch[3]}`;

  const lossMatch = t.match(LOSS_DATE);
  if (lossMatch) out.lossDate = lossMatch[1].trim();

  const letterMatch = t.match(LETTER_DATE);
  if (letterMatch) out.letterDate = letterMatch[1].trim();

  if (DENIAL.test(t)) out.coverageDecision = "denied";
  else if (ACCEPTED.test(t)) out.coverageDecision = "accepted";

  const offerMatch = t.match(OFFER_AMT);
  if (offerMatch) out.offerAmount = offerMatch[1].trim();

  const limits: NonNullable<InsuranceExtracted["limits"]> = {};
  const bi = t.match(LIMIT_BI);
  if (bi) limits.BI = bi[1].trim();
  const pd = t.match(LIMIT_PD);
  if (pd) limits.PD = pd[1].trim();
  const um = t.match(LIMIT_UM);
  if (um) limits.UM = um[1].trim();
  const med = t.match(LIMIT_MED);
  if (med) limits.MedPay = med[1].trim();
  if (Object.keys(limits).length) out.limits = limits;

  return out;
}
