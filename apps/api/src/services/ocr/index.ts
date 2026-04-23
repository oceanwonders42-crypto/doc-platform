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
  mimeType?: string;
  documentId?: string;
  firmId?: string;
  /** Called when OCR fallback is used or fails (structured failure logging). */
  onOcrFailure?: (opts: { stage: string; message: string; documentId?: string; firmId?: string }) => void;
};

export type OcrPipelineDependencies = {
  hasEmbeddedText?: typeof hasEmbeddedText;
  extractEmbeddedText?: typeof extractEmbeddedText;
  runImageOcrFallback?: typeof runImageOcrFallback;
};

function applyDerivedMetadata(result: OcrResult): OcrResult {
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
        (result.hasHandwriting && result.handwritingHeavy);
      return {
        ...p,
        detectedLanguage: result.detectedLanguage,
        hasHandwriting: result.hasHandwriting,
        needsReview,
        status: needsReview ? "NEEDS_REVIEW" : p.status,
      } as PageDiagnostic;
    });
  }

  return result;
}

export async function runOcrPipeline(
  documentBuffer: Buffer,
  options?: OcrPipelineOptions,
  dependencies: OcrPipelineDependencies = {}
): Promise<OcrResult> {
  const checkEmbeddedText = dependencies.hasEmbeddedText ?? hasEmbeddedText;
  const extractText = dependencies.extractEmbeddedText ?? extractEmbeddedText;
  const runFallback = dependencies.runImageOcrFallback ?? runImageOcrFallback;
  const mimeType = (options?.mimeType || "application/pdf").toLowerCase();
  const shouldTryEmbeddedText = mimeType === "application/pdf";
  let result: OcrResult | null = null;

  if (shouldTryEmbeddedText) {
    result = await extractText(documentBuffer).catch(() => null);
    if (result && !isLowTextResult(result)) {
      return applyDerivedMetadata(result);
    }

    const fallback = await runFallback(
      documentBuffer,
      mimeType,
      {
        documentId: options?.documentId,
        firmId: options?.firmId,
        onFailure: options?.onOcrFailure,
      }
    );

    if (!isLowTextResult(fallback)) {
      return applyDerivedMetadata(fallback);
    }

    const merged = fallback.fullText.trim().length > 0 ? fallback : { ...fallback, lowQualityExtraction: true };
    return applyDerivedMetadata(merged);
  }

  result = await runFallback(
    documentBuffer,
    mimeType,
    {
      documentId: options?.documentId,
      firmId: options?.firmId,
      onFailure: options?.onOcrFailure,
    }
  );

  return applyDerivedMetadata(result);
}
