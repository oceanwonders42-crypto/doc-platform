/**
 * OCR fallback for image-only PDFs and image files.
 * When embedded text extraction yields no/minimal text, we attempt image OCR.
 * Stub: logs and returns empty result; replace with Tesseract or similar when available.
 */
import type { OcrResult } from "./types";

const MIN_TEXT_LENGTH_FOR_SUCCESS = 20;

export type OcrFallbackOptions = {
  documentId?: string;
  firmId?: string;
  onFailure?: (opts: { stage: string; message: string; documentId?: string; firmId?: string }) => void;
};

/**
 * Stub image OCR. Returns empty result and reports failure via onFailure.
 * Implement with Tesseract/Textract when needed.
 */
export async function runImageOcrFallback(
  _buffer: Buffer,
  _mimeType: string,
  opts: OcrFallbackOptions = {}
): Promise<OcrResult> {
  const { documentId, firmId, onFailure } = opts;
  const message = "Image OCR fallback not implemented; document has no embedded text";
  onFailure?.({
    stage: "ocr_fallback",
    message,
    documentId,
    firmId,
  });
  return {
    fullText: "",
    pageTexts: [],
    ocrEngine: "fallback_unavailable",
    ocrConfidence: 0,
    lowQualityExtraction: true,
    pageDiagnostics: [],
    preprocessingApplied: ["attempted_image_ocr"],
  };
}

export function isLowTextResult(result: OcrResult): boolean {
  const text = (result.fullText || "").trim();
  return text.length < MIN_TEXT_LENGTH_FOR_SUCCESS;
}
