/**
 * Document type classifier.
 * Classes: medical_record, insurance_letter, court_filing, billing_statement, police_report.
 * Returns docType + confidence (0..1). Confidence is stored in document_recognition.confidence.
 */

export const DOC_CLASSES = [
  "medical_record",
  "insurance_letter",
  "court_filing",
  "billing_statement",
  "police_report",
] as const;

export type DocType = (typeof DOC_CLASSES)[number] | "unknown";

export interface ClassifierResult {
  docType: DocType;
  confidence: number;
}

const MEDICAL_RECORD_KEYWORDS = [
  "medical record",
  "patient",
  "diagnosis",
  "discharge summary",
  "admission",
  "progress note",
  "progress notes",
  "history and physical",
  "h&p",
  "treatment plan",
  "physician",
  "clinical",
  "vital signs",
  "allergies",
  "medications",
  "radiology",
  "lab results",
  "discharge instructions",
];

const INSURANCE_LETTER_KEYWORDS = [
  "claim number",
  "policy number",
  "policy holder",
  "adjuster",
  "reservation of rights",
  "coverage",
  "denial",
  "denied",
  "settlement offer",
  "offer to settle",
  "claim adjuster",
  "insurance company",
  "declarations page",
  "dec page",
  "effective date",
  "we are writing regarding",
  "claim reference",
];

const COURT_FILING_KEYWORDS = [
  "in the",
  "plaintiff",
  "defendant",
  "complaint",
  "cause of action",
  "wherefore",
  "motion",
  "notice of hearing",
  "summons",
  "you are hereby summoned",
  "ordered",
  "it is hereby ordered",
  "court",
  "case no",
  "case number",
  "judge",
  "superior court",
  "district court",
  "county of",
];

const BILLING_STATEMENT_KEYWORDS = [
  "invoice",
  "statement",
  "amount due",
  "balance due",
  "total due",
  "billing",
  "cpt",
  "icd",
  "procedure code",
  "date of service",
  "dos",
  "charges",
  "payment",
  "account balance",
  "remit to",
  "statement date",
];

const POLICE_REPORT_KEYWORDS = [
  "police report",
  "incident report",
  "officer",
  "responding officer",
  "report number",
  "offense",
  "narrative",
  "witness",
  "victim",
  "suspect",
  "date of incident",
  "location of incident",
  "lapd",
  "sheriff",
  "case number",
  "incident",
];

function countMatches(text: string, keywords: string[]): number {
  const lower = text.toLowerCase();
  let n = 0;
  for (const k of keywords) {
    if (lower.includes(k.toLowerCase())) n++;
  }
  return n;
}

function scoreSegment(text: string, keywords: string[], minHits: number): { score: number; hits: number } {
  const hits = countMatches(text, keywords);
  if (hits < minHits) return { score: 0, hits };
  const score = Math.min(0.95, 0.4 + hits * 0.08);
  return { score, hits };
}

/**
 * Classify document from extracted text and optional filename.
 * Returns one of: medical_record, insurance_letter, court_filing, billing_statement, police_report, unknown.
 * Confidence is in [0, 1] and should be stored in document_recognition.confidence.
 */
export function classify(extractedText: string, filename: string = ""): ClassifierResult {
  const raw = (extractedText || "").replace(/\s+/g, " ").trim();
  const text = `${(filename || "").toLowerCase()} ${raw}`;
  const combined = text.toLowerCase();

  const candidates: { docType: DocType; score: number }[] = [];

  // Court: high specificity (legal language)
  const court = scoreSegment(combined, COURT_FILING_KEYWORDS, 2);
  if (court.score > 0) candidates.push({ docType: "court_filing", score: court.score });

  // Police report: distinct phrases
  const police = scoreSegment(combined, POLICE_REPORT_KEYWORDS, 2);
  if (police.score > 0) candidates.push({ docType: "police_report", score: police.score });

  // Insurance: claim/policy language
  const insurance = scoreSegment(combined, INSURANCE_LETTER_KEYWORDS, 1);
  if (insurance.score > 0) candidates.push({ docType: "insurance_letter", score: insurance.score });

  // Billing: invoice/statement language
  const billing = scoreSegment(combined, BILLING_STATEMENT_KEYWORDS, 2);
  if (billing.score > 0) candidates.push({ docType: "billing_statement", score: billing.score });

  // Medical record: clinical language
  const medical = scoreSegment(combined, MEDICAL_RECORD_KEYWORDS, 1);
  if (medical.score > 0) candidates.push({ docType: "medical_record", score: medical.score });

  if (candidates.length === 0) {
    return { docType: "unknown", confidence: 0.25 };
  }

  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];
  if (best.score < 0.5) {
    return { docType: "unknown", confidence: Math.max(0.25, best.score) };
  }

  return { docType: best.docType, confidence: best.score };
}

/** For backward compatibility: map to legacy court_* / insurance_* where needed (e.g. case timeline labels). */
export function getLegacyDocType(docType: DocType): string {
  if (docType === "court_filing") return "court_filing";
  if (docType === "insurance_letter") return "insurance_letter";
  return docType;
}
