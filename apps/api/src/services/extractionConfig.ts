/**
 * Extraction config: strict mode and confidence threshold.
 * Legal-medical workflow prefers strict mode (no guessing).
 */
import { prisma } from "../db/prisma";
import { DEFAULT_CONFIDENCE_THRESHOLD } from "./ocr";

const CONFIDENCE_THRESHOLD_ENV = "EXTRACTION_CONFIDENCE_THRESHOLD";

export function getConfidenceThreshold(): number {
  const raw = process.env[CONFIDENCE_THRESHOLD_ENV];
  if (raw == null || raw === "") return DEFAULT_CONFIDENCE_THRESHOLD;
  const n = parseFloat(raw);
  return Number.isFinite(n) && n >= 0 && n <= 1 ? n : DEFAULT_CONFIDENCE_THRESHOLD;
}

/**
 * Resolve extraction strict mode for a firm (async to load firm settings).
 * When true: do not emit low-confidence values as final; mark uncertain and send to review.
 */
export async function getExtractionStrictMode(firmId: string): Promise<boolean> {
  if (process.env.EXTRACTION_STRICT_MODE === "false") return false;
  try {
    const firm = await prisma.firm.findUnique({
      where: { id: firmId },
      select: { settings: true },
    });
    const settings = (firm?.settings as Record<string, unknown>) ?? {};
    if (settings.extractionStrictMode === false) return false;
  } catch {
    // default true
  }
  return true;
}
