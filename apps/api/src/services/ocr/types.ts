/**
 * OCR and extraction quality types.
 * - Never assume missing values.
 * - Every extracted field: value, confidence, source snippet, extraction method.
 * - Below threshold → mark uncertain, do not autofill as final truth.
 * - Separate: OCR text quality, field extraction confidence, document classification confidence.
 */

export type PageStatus =
  | "GOOD"
  | "LOW_CONFIDENCE"
  | "HANDWRITTEN"
  | "BLURRY"
  | "MIXED_LANGUAGE"
  | "NEEDS_REVIEW";

export interface PageDiagnostic {
  pageNumber: number;
  ocrMethod: string;
  averageConfidence?: number;
  detectedLanguage?: string;
  hasHandwriting?: boolean;
  qualityPoor?: boolean;
  needsReview?: boolean;
  status: PageStatus;
  textLength?: number;
}

export interface OcrResult {
  fullText: string;
  pageTexts: { page: number; text: string }[];
  /** Which engine produced the text (embedded | pdfjs | tesseract | ...) */
  ocrEngine: string;
  /** Overall OCR confidence 0..1 if available */
  ocrConfidence?: number;
  /** True when no or minimal text was extracted (scanned/image-only or unreadable) */
  lowQualityExtraction?: boolean;
  /** Detected primary language code (e.g. en, es) */
  detectedLanguage?: string;
  /** Alternative language codes detected */
  possibleLanguages?: string[];
  /** Whether handwriting was detected */
  hasHandwriting?: boolean;
  /** Handwriting is dominant (vs annotations only) */
  handwritingHeavy?: boolean;
  /** Confidence of handwriting detection 0..1 */
  handwritingConfidence?: number;
  /** Per-page diagnostics */
  pageDiagnostics?: PageDiagnostic[];
  /** What preprocessing was applied */
  preprocessingApplied?: string[];
}

export interface ExtractedFieldWithEvidence {
  /** Final value used (null if uncertain in strict mode) */
  extractedValue: string | null;
  /** Normalized value for display/storage */
  normalizedValue?: string | null;
  /** Raw value as seen in source */
  rawValue?: string | null;
  confidence: number;
  /** Snippet of source text this came from */
  sourceText?: string | null;
  pageNumber?: number | null;
  /** Bounding region if available (e.g. { x, y, w, h } or text span) */
  sourceRegion?: Record<string, unknown> | null;
  extractionMethod: string;
  /** True when below threshold or conflicting; do not treat as final truth */
  uncertain?: boolean;
  /** Reason when uncertain (e.g. low_ocr_confidence, conflicting_candidates) */
  uncertainReason?: string;
  /** When uncertain or conflicting, alternative candidates */
  candidates?: { value: string; confidence: number }[];
  /** @deprecated use extractedValue */
  value?: string | null;
}

/** Key field names used in extraction (patient name, DOB, provider, etc.) */
export type EvidenceFieldKey =
  | "patientName"
  | "clientName"
  | "dateOfBirth"
  | "incidentDate"
  | "dateOfService"
  | "provider"
  | "facility"
  | "caseNumber"
  | "claimNumber"
  | "billingTotal"
  | "diagnosis"
  | "address";

export type ExtractedFieldsWithEvidence = Partial<
  Record<EvidenceFieldKey | string, ExtractedFieldWithEvidence>
>;

/** Threshold below which we mark uncertain and (in strict mode) do not emit value as final */
export const DEFAULT_CONFIDENCE_THRESHOLD = 0.7;

/** Strict mode: prefer null/uncertain over guessing. Default true for legal-medical. */
export function getExtractionStrictMode(firmSettings?: Record<string, unknown> | null): boolean {
  if (firmSettings?.extractionStrictMode === false) return false;
  if (process.env.EXTRACTION_STRICT_MODE === "false") return false;
  return true;
}
