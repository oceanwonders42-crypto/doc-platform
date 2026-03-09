/**
 * Traffic matter type detection. Separate from document type (what the document is).
 * Returns MatterType (TRAFFIC vs PI), routing confidence, and review flag.
 * Used to route into TrafficMatter workflow vs LegalCase (PI) workflow.
 */
import { MatterType, type MatterTypeValue } from "../types/matterType";

/** Traffic-origin document types (what the document is). */
export const TRAFFIC_DOC_TYPES = [
  "citation",
  "traffic_hearing_notice",
  "traffic_court_notice",
  "traffic_disposition",
  "traffic_order",
] as const;

export type TrafficDocType = (typeof TRAFFIC_DOC_TYPES)[number];

export interface TrafficMatterDetectionResult {
  /** Detected workflow: TRAFFIC or PI (default). */
  matterType: MatterTypeValue;
  /** When matterType === TRAFFIC, the specific traffic document type. */
  documentType: TrafficDocType | null;
  /** Routing confidence 0..1. */
  routingConfidence: number;
  /** True when matter type or routing is ambiguous. */
  reviewRequired: boolean;
  /** Human-readable reason for matter type; for review UI. */
  reason: string;
  /** Short signals that contributed (e.g. "citation_number", "traffic_court"). */
  signals: string[];
}

const TRAFFIC_CITATION_KEYWORDS = [
  "traffic citation",
  "citation number",
  "uniform traffic citation",
  "utc",
  "violation date",
  "court date",
  "payable by",
  "must appear",
  "driving while",
  "speeding",
  "reckless driving",
  "dui",
  "dwi",
  "section 316",
  "florida statute",
  "fla. stat.",
  "vehicle code",
  "v.c.",
  "ordinance",
  "municipal code",
];

const TRAFFIC_NOTICE_KEYWORDS = [
  "traffic hearing",
  "hearing date",
  "traffic court",
  "notice to appear",
  "arraignment",
  "traffic division",
  "traffic case",
  "citation no",
  "citation #",
];

const TRAFFIC_DISPOSITION_KEYWORDS = [
  "disposition",
  "guilty",
  "nolo",
  "adjudication withheld",
  "traffic school",
  "fine paid",
  "points",
];

const TRAFFIC_ORDER_KEYWORDS = [
  "order",
  "ordered",
  "it is ordered",
  "traffic",
  "court order",
];

/** Patterns that strongly indicate PI (personal injury) rather than traffic. */
const PI_STRONG_SIGNALS = [
  "personal injury",
  "plaintiff",
  "complaint for damages",
  "negligence",
  "medical expenses",
  "pain and suffering",
  "settlement offer",
  "demand letter",
  "insurance claim",
  "bodily injury",
];

function countSignals(text: string, keywords: string[]): string[] {
  const lower = text.toLowerCase();
  const found: string[] = [];
  for (const k of keywords) {
    if (lower.includes(k.toLowerCase())) found.push(k);
  }
  return found;
}

/**
 * Detect whether the document belongs to TRAFFIC matter workflow or PI (LegalCase).
 * Document type (citation, notice, etc.) is separate from matter type.
 */
export function detectTrafficMatterType(
  text: string,
  docType: string,
  filename: string = ""
): TrafficMatterDetectionResult {
  const combined = `${(filename || "").toLowerCase()} ${(text || "").replace(/\s+/g, " ").trim()}`.toLowerCase();
  const signals: string[] = [];

  // Strong PI signals → route to PI, not traffic
  const piSignals = countSignals(combined, PI_STRONG_SIGNALS);
  if (piSignals.length >= 2) {
    return {
      matterType: MatterType.PI,
      documentType: null,
      routingConfidence: 0.9,
      reviewRequired: false,
      reason: "Document matches personal injury workflow (plaintiff, complaint, negligence, etc.).",
      signals: piSignals.slice(0, 5),
    };
  }

  // Citation number pattern (e.g. "Citation No. 123456" or "UTC # 789")
  const citationNumMatch = combined.match(/\b(?:citation\s*(?:no\.?|#|number)?|utc\s*#?)\s*[:\-]?\s*([A-Z0-9\-]+)/i);
  if (citationNumMatch) signals.push("citation_number");

  // State/court traffic patterns
  if (/\b(florida|fla\.?)\s+stat(?:ute)?\.?\s*\d+/i.test(combined)) signals.push("florida_statute");
  if (/\bvehicle\s+code\b|\b(v\.?c\.?)\s*§?\s*\d+/i.test(combined)) signals.push("vehicle_code");
  if (/\btraffic\s+(?:court|division|hearing)\b/i.test(combined)) signals.push("traffic_court");
  if (/\b(?:speeding|reckless|dui|dwi|dwls)\b/i.test(combined)) signals.push("traffic_charge");
  if (/\bnotice\s+to\s+appear\b/i.test(combined)) signals.push("notice_to_appear");

  const citationKw = countSignals(combined, TRAFFIC_CITATION_KEYWORDS);
  const noticeKw = countSignals(combined, TRAFFIC_NOTICE_KEYWORDS);
  const dispositionKw = countSignals(combined, TRAFFIC_DISPOSITION_KEYWORDS);
  const orderKw = countSignals(combined, TRAFFIC_ORDER_KEYWORDS);

  signals.push(...citationKw, ...noticeKw, ...dispositionKw, ...orderKw);

  const trafficScore =
    (citationNumMatch ? 0.35 : 0) +
    citationKw.length * 0.08 +
    noticeKw.length * 0.06 +
    dispositionKw.length * 0.05 +
    orderKw.length * 0.04;

  let documentType: TrafficDocType | null = null;
  if (citationKw.length >= 2 || citationNumMatch) documentType = "citation";
  else if (noticeKw.length >= 2) documentType = "traffic_hearing_notice";
  else if (dispositionKw.length >= 2) documentType = "traffic_disposition";
  else if (orderKw.length >= 2) documentType = "traffic_order";
  else if (signals.includes("traffic_court") || signals.includes("traffic_hearing")) documentType = "traffic_court_notice";

  const confidence = Math.min(0.95, 0.3 + trafficScore);
  const isTraffic = confidence >= 0.5 && documentType !== null;
  const reviewRequired = isTraffic && (confidence < 0.65 || !citationNumMatch);

  if (isTraffic) {
    return {
      matterType: MatterType.TRAFFIC,
      documentType,
      routingConfidence: confidence,
      reviewRequired,
      reason: reviewRequired
        ? "Traffic-related document detected; routing confidence is moderate. Please confirm."
        : "Traffic citation or court document detected; routed to traffic matter workflow.",
      signals: [...new Set(signals)].slice(0, 10),
    };
  }

  return {
    matterType: MatterType.PI,
    documentType: null,
    routingConfidence: 1 - Math.min(0.5, trafficScore),
    reviewRequired: false,
    reason: "No strong traffic signals; defaulting to standard (PI) workflow.",
    signals: [],
  };
}
