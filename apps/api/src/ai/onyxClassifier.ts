/**
 * Queue 2 (Onyx Intel): Document classification into medical/legal categories.
 * Types: er_record, imaging_report, physician_notes, pcp_notes, therapy_pt_notes,
 * operative_report, medical_bill, ledger_statement, insurance_correspondence, miscellaneous.
 * Returns docType, confidence, reason, and signals used for storage and review.
 */

export const ONYX_DOC_TYPES = [
  "er_record",
  "imaging_report",
  "physician_notes",
  "pcp_notes",
  "therapy_pt_notes",
  "operative_report",
  "medical_bill",
  "ledger_statement",
  "insurance_correspondence",
  "miscellaneous",
] as const;

export type OnyxDocType = (typeof ONYX_DOC_TYPES)[number];

/** Status for classification result: confirmed (high confidence), uncertain (low confidence, use fallback type), fallback (no text/signals). */
export type ClassificationStatus = "confirmed" | "uncertain" | "fallback";

/** Confidence below this: do not use classifier type as final; use fallback "other" and mark uncertain. */
export const CLASSIFICATION_CONFIDENCE_UNCERTAIN_THRESHOLD = 0.5;

/** Minimum confidence to treat as confirmed (above uncertain threshold). */
export const CLASSIFICATION_CONFIDENCE_CONFIRMED_MIN = 0.5;

export interface OnyxClassificationResult {
  docType: OnyxDocType;
  confidence: number;
  reason: string;
  signals: string[];
  /** True when confidence < threshold or no signals; caller should use fallback doc_type and set status uncertain/fallback. */
  uncertain?: boolean;
  /** Status for downstream: confirmed, uncertain, or fallback. */
  classificationStatus: ClassificationStatus;
}

const ER_KEYWORDS = [
  "emergency room",
  "er visit",
  "ed visit",
  "emergency department",
  "triage",
  "emergency admission",
  "discharge from er",
  "er record",
  "emergency record",
];

const IMAGING_KEYWORDS = [
  "mri",
  "ct scan",
  "x-ray",
  "radiology",
  "imaging",
  "ultrasound",
  "mammogram",
  "fluoroscopy",
  "radiology report",
  "impression:",
  "findings:",
  "comparison:",
];

const PHYSICIAN_NOTES_KEYWORDS = [
  "progress note",
  "progress notes",
  "physician note",
  "attending",
  "h&p",
  "history and physical",
  "consultation",
  "clinical note",
  "office note",
  "soap note",
];

const PCP_KEYWORDS = [
  "primary care",
  "pcp",
  "family medicine",
  "internal medicine",
  "general practice",
  "primary care physician",
];

const THERAPY_PT_KEYWORDS = [
  "physical therapy",
  "pt session",
  "occupational therapy",
  "ot evaluation",
  "therapy note",
  "rehabilitation",
  "therapist",
  "treatment session",
  "exercises",
  "range of motion",
  "modalities",
];

const OPERATIVE_KEYWORDS = [
  "operative report",
  "surgery",
  "procedure",
  "surgeon",
  "anesthesia",
  "preoperative",
  "postoperative",
  "surgical",
  "incision",
  "closure",
];

const MEDICAL_BILL_KEYWORDS = [
  "invoice",
  "amount due",
  "total charges",
  "cpt",
  "icd-10",
  "date of service",
  "dos",
  "procedure code",
  "billing",
  "subtotal",
  "patient responsibility",
];

const LEDGER_STATEMENT_KEYWORDS = [
  "statement",
  "account balance",
  "balance due",
  "ledger",
  "itemized",
  "statement date",
  "remit to",
  "payment history",
];

const INSURANCE_CORRESPONDENCE_KEYWORDS = [
  "claim number",
  "policy number",
  "adjuster",
  "reservation of rights",
  "coverage",
  "denial",
  "settlement offer",
  "insurance company",
  "we are writing regarding",
  "claim reference",
  "eob",
  "explanation of benefits",
];

function countHits(text: string, keywords: string[]): number {
  const lower = text.toLowerCase();
  let n = 0;
  for (const k of keywords) {
    if (lower.includes(k.toLowerCase())) n++;
  }
  return n;
}

/**
 * Classify document into Onyx doc types with production-safe confidence (0..1),
 * a short reason, and list of signals (keyword hits) used.
 */
export function classifyOnyx(extractedText: string, filename: string = ""): OnyxClassificationResult {
  const raw = (extractedText || "").replace(/\s+/g, " ").trim();
  const combined = `${(filename || "").toLowerCase()} ${raw}`.toLowerCase();

  const candidates: { docType: OnyxDocType; hits: number; signals: string[] }[] = [];

  const erHits = countHits(combined, ER_KEYWORDS);
  if (erHits >= 1) candidates.push({ docType: "er_record", hits: erHits, signals: ER_KEYWORDS.filter((k) => combined.includes(k)) });

  const imgHits = countHits(combined, IMAGING_KEYWORDS);
  if (imgHits >= 1) candidates.push({ docType: "imaging_report", hits: imgHits, signals: IMAGING_KEYWORDS.filter((k) => combined.includes(k)) });

  const opHits = countHits(combined, OPERATIVE_KEYWORDS);
  if (opHits >= 2) candidates.push({ docType: "operative_report", hits: opHits, signals: OPERATIVE_KEYWORDS.filter((k) => combined.includes(k)) });

  const physHits = countHits(combined, PHYSICIAN_NOTES_KEYWORDS);
  if (physHits >= 1) candidates.push({ docType: "physician_notes", hits: physHits, signals: PHYSICIAN_NOTES_KEYWORDS.filter((k) => combined.includes(k)) });

  const pcpHits = countHits(combined, PCP_KEYWORDS);
  if (pcpHits >= 1) candidates.push({ docType: "pcp_notes", hits: pcpHits, signals: PCP_KEYWORDS.filter((k) => combined.includes(k)) });

  const ptHits = countHits(combined, THERAPY_PT_KEYWORDS);
  if (ptHits >= 1) candidates.push({ docType: "therapy_pt_notes", hits: ptHits, signals: THERAPY_PT_KEYWORDS.filter((k) => combined.includes(k)) });

  const billHits = countHits(combined, MEDICAL_BILL_KEYWORDS);
  if (billHits >= 2) candidates.push({ docType: "medical_bill", hits: billHits, signals: MEDICAL_BILL_KEYWORDS.filter((k) => combined.includes(k)) });

  const ledgerHits = countHits(combined, LEDGER_STATEMENT_KEYWORDS);
  if (ledgerHits >= 2) candidates.push({ docType: "ledger_statement", hits: ledgerHits, signals: LEDGER_STATEMENT_KEYWORDS.filter((k) => combined.includes(k)) });

  const insHits = countHits(combined, INSURANCE_CORRESPONDENCE_KEYWORDS);
  if (insHits >= 1) candidates.push({ docType: "insurance_correspondence", hits: insHits, signals: INSURANCE_CORRESPONDENCE_KEYWORDS.filter((k) => combined.includes(k)) });

  if (candidates.length === 0) {
    return {
      docType: "miscellaneous",
      confidence: 0.3,
      reason: "No category signals found",
      signals: [],
      uncertain: true,
      classificationStatus: "fallback",
    };
  }

  candidates.sort((a, b) => b.hits - a.hits);
  const best = candidates[0];
  const confidence = Math.min(0.95, 0.4 + best.hits * 0.1);
  const uncertain = confidence < CLASSIFICATION_CONFIDENCE_UNCERTAIN_THRESHOLD;
  const reason =
    best.signals.length > 0
      ? `Matched: ${best.signals.slice(0, 5).join(", ")}`
      : `${best.docType} (${best.hits} hits)`;

  return {
    docType: best.docType,
    confidence,
    reason,
    signals: best.signals,
    uncertain,
    classificationStatus: uncertain ? "uncertain" : "confirmed",
  };
}

/** Map Onyx doc type to legacy doc_type for backward compatibility (timeline, extractors). */
export function onyxToLegacyDocType(onyx: OnyxDocType): string {
  const map: Record<OnyxDocType, string> = {
    er_record: "medical_record",
    imaging_report: "medical_record",
    physician_notes: "medical_record",
    pcp_notes: "medical_record",
    therapy_pt_notes: "medical_record",
    operative_report: "medical_record",
    medical_bill: "billing_statement",
    ledger_statement: "billing_statement",
    insurance_correspondence: "insurance_letter",
    miscellaneous: "other",
  };
  return map[onyx] ?? "other";
}
