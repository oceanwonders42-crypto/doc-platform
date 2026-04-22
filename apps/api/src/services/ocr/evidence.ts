/**
 * Build extracted field with evidence and apply confidence threshold.
 * In strict mode, low confidence → uncertain: true and extractedValue null (or keep raw for display).
 */
import type { ExtractedFieldWithEvidence } from "./types";
import { DEFAULT_CONFIDENCE_THRESHOLD, getExtractionStrictMode } from "./types";

export function withEvidence(
  value: string | null | undefined,
  confidence: number,
  opts: {
    sourceText?: string | null;
    pageNumber?: number | null;
    extractionMethod: string;
    normalizedValue?: string | null;
    strictMode?: boolean;
    threshold?: number;
  }
): ExtractedFieldWithEvidence {
  const threshold = opts.threshold ?? DEFAULT_CONFIDENCE_THRESHOLD;
  const strict = opts.strictMode ?? true;
  const uncertain = confidence < threshold;
  const finalValue =
    strict && uncertain ? null : (value != null && String(value).trim() !== "" ? String(value).trim() : null);

  return {
    extractedValue: finalValue,
    rawValue: value != null ? String(value).trim() : null,
    normalizedValue: opts.normalizedValue ?? finalValue,
    confidence,
    sourceText: opts.sourceText ?? null,
    pageNumber: opts.pageNumber ?? null,
    extractionMethod: opts.extractionMethod,
    uncertain,
  };
}

export function getStrictModeFromFirm(firmSettings: Record<string, unknown> | null | undefined): boolean {
  return getExtractionStrictMode(firmSettings ?? null);
}
