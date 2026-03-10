/**
 * MOCK EXTRACTION PIPELINE — Demo only.
 * Replace with real API call (e.g. POST /api/extract) when backend is ready.
 * Uses demo-seed providers and timeline so upload results match dashboard story.
 */

import { getProviders, getTimelineForCase } from "@/lib/demo-seed";

export interface ExtractionResult {
  documentType: string;
  providerName: string;
  dateRange: { from: string; to: string };
  billingAmount: number | null;
  timelineEntries: { date: string; event: string; provider?: string }[];
  confidence: number;
  needsReview: boolean;
  fileName: string;
}

/** Document-type hints from filename for variety. */
const DOC_TYPE_HINTS: Record<string, string> = {
  er: "ER Records",
  radiology: "Imaging",
  mri: "Imaging",
  pcp: "PCP Notes",
  hospital: "Hospital Records",
  bill: "Bills",
  statement: "Bills",
  pt: "PT Notes",
  lab: "Lab Results",
  discharge: "Discharge Summary",
};

/** Generates deterministic-ish mock result from fileName. Uses seed providers and timeline for consistency with dashboard. */
export function runMockExtraction(fileName: string): ExtractionResult {
  const lower = fileName.toLowerCase();
  let documentType = "Medical Records";
  for (const [key, value] of Object.entries(DOC_TYPE_HINTS)) {
    if (lower.includes(key)) {
      documentType = value;
      break;
    }
  }

  const seedProviders = getProviders();
  const seedTimeline = getTimelineForCase("c1");
  const hash = fileName.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const provider = seedProviders[hash % seedProviders.length]?.name ?? "Unknown Provider";

  const hasBilling = lower.includes("bill") || lower.includes("statement") || lower.includes("0324");
  const billingAmount = hasBilling ? 18420 + (hash % 5000) : null;

  const baseDate = new Date("2024-03-15");
  const fromOffset = hash % 5;
  const toOffset = fromOffset + 2 + (hash % 3);
  const dateFrom = new Date(baseDate);
  dateFrom.setDate(dateFrom.getDate() + fromOffset);
  const dateTo = new Date(baseDate);
  dateTo.setDate(dateTo.getDate() + toOffset);

  const timelineEntries = seedTimeline.slice(0, 2 + (hash % 3));

  const confidence = hasBilling ? 0.92 + (hash % 7) / 100 : 0.78 + (hash % 15) / 100;
  const needsReview = confidence < 0.85 || lower.includes("review") || lower.includes("pt");

  return {
    documentType,
    providerName: provider,
    dateRange: {
      from: dateFrom.toISOString().slice(0, 10),
      to: dateTo.toISOString().slice(0, 10),
    },
    billingAmount,
    timelineEntries,
    confidence: Math.min(0.99, confidence),
    needsReview,
    fileName,
  };
}

/** SessionStorage key for demo extraction result. Replace with API-backed lookup when backend exists. */
export const DEMO_EXTRACTION_STORAGE_KEY_PREFIX = "onyx-demo-extraction-";

export function getStoredResult(jobId: string): { fileName: string; result: ExtractionResult } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(`${DEMO_EXTRACTION_STORAGE_KEY_PREFIX}${jobId}`);
    if (!raw) return null;
    return JSON.parse(raw) as { fileName: string; result: ExtractionResult };
  } catch {
    return null;
  }
}

export function setStoredResult(jobId: string, payload: { fileName: string; result: ExtractionResult }): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(`${DEMO_EXTRACTION_STORAGE_KEY_PREFIX}${jobId}`, JSON.stringify(payload));
  } catch {
    // ignore
  }
}
