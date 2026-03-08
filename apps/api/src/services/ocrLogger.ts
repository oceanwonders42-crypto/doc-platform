/**
 * Structured logging for OCR and extraction pipeline failures and low-quality outcomes.
 * Use for fetch, page_count, OCR, recognition_save, low-text, and extraction failures.
 */
export type OcrExtractionStage =
  | "fetch"
  | "page_count"
  | "ocr"
  | "ocr_fallback"
  | "low_text"
  | "recognition_save"
  | "classification"
  | "extraction"
  | "unknown";

export interface OcrExtractionFailureContext {
  stage: OcrExtractionStage;
  message: string;
  documentId?: string | null;
  firmId?: string | null;
  pageCount?: number | null;
  textLength?: number | null;
  ocrEngine?: string | null;
  /** "error" | "warn" | "info" - low_text is typically info */
  severity?: "error" | "warn" | "info";
  [key: string]: unknown;
}

export function logOcrExtractionFailure(ctx: OcrExtractionFailureContext): void {
  const payload = {
    type: "OCR_EXTRACTION_FAILURE",
    stage: ctx.stage,
    message: ctx.message,
    documentId: ctx.documentId ?? null,
    firmId: ctx.firmId ?? null,
    pageCount: ctx.pageCount ?? null,
    textLength: ctx.textLength ?? null,
    ocrEngine: ctx.ocrEngine ?? null,
    severity: ctx.severity ?? "error",
    ts: new Date().toISOString(),
  };
  const line = JSON.stringify(payload);
  if (ctx.severity === "info") {
    console.warn("[ocr_extraction]", line);
  } else {
    console.error("[ocr_extraction]", line);
  }
}
