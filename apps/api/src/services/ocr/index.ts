/**
 * OCR pipeline: embedded text first, then language/handwriting detection, diagnostics.
 * For image-only PDFs or images: attempts image OCR fallback and logs structured failures.
 */
import type { OcrResult, PageDiagnostic } from "./types";
import { extractEmbeddedText, hasEmbeddedText } from "./embeddedTextExtractor";
import { detectLanguageFromText } from "./languageDetection";
import { detectHandwritingFromText } from "./handwritingDetection";
import { runImageOcrFallback, isLowTextResult } from "./imageOcrFallback";

export type { OcrResult, PageDiagnostic, PageStatus, ExtractedFieldWithEvidence, ExtractedFieldsWithEvidence } from "./types";
export { DEFAULT_CONFIDENCE_THRESHOLD, getExtractionStrictMode } from "./types";
export { extractEmbeddedText, hasEmbeddedText } from "./embeddedTextExtractor";
export { detectLanguageFromText } from "./languageDetection";
export { detectHandwritingFromText } from "./handwritingDetection";
export { runImageOcrFallback, isLowTextResult } from "./imageOcrFallback";

export type OcrPipelineOptions = {
  documentId?: string;
  firmId?: string;
  /** Called when OCR fallback is used or fails (structured failure logging). */
  onOcrFailure?: (opts: { stage: string; message: string; documentId?: string; firmId?: string }) => void;
};

export async function runOcrPipeline(pdfBuffer: Buffer, options?: OcrPipelineOptions): Promise<OcrResult> {
  const hasEmbedded = await hasEmbeddedText(pdfBuffer);
  let result: OcrResult | null = hasEmbedded ? await extractEmbeddedText(pdfBuffer) : null;

  if (!result) {
    result = await extractEmbeddedText(pdfBuffer).catch(() => null);
  }
  if (!result || isLowTextResult(result)) {
    const fallback = await runImageOcrFallback(
      pdfBuffer,
      "application/pdf",
      {
        documentId: options?.documentId,
        firmId: options?.firmId,
        onFailure: options?.onOcrFailure,
      }
    );
    if (result && result.fullText.trim().length > fallback.fullText.trim().length) return result;
    const merged =
      fallback.fullText.trim().length > 0 ? fallback : { ...fallback, lowQualityExtraction: true };
    return merged;
  }

  const lang = detectLanguageFromText(result.fullText);
  result.detectedLanguage = lang.detectedLanguage;
  result.possibleLanguages = lang.possibleLanguages;

  const hw = detectHandwritingFromText(result.fullText);
  result.hasHandwriting = hw.hasHandwriting;
  result.handwritingHeavy = hw.handwritingHeavy;
  result.handwritingConfidence = hw.confidence;

  if (result.pageDiagnostics?.length) {
    result.pageDiagnostics = result.pageDiagnostics.map((p) => {
      const needsReview =
        p.status === "LOW_CONFIDENCE" ||
        p.status === "HANDWRITTEN" ||
        (result!.hasHandwriting && result!.handwritingHeavy);
      return {
        ...p,
        detectedLanguage: result!.detectedLanguage,
        hasHandwriting: result!.hasHandwriting,
        needsReview,
        status: needsReview ? "NEEDS_REVIEW" : p.status,
      } as PageDiagnostic;
    });
  }

  return result;
}
