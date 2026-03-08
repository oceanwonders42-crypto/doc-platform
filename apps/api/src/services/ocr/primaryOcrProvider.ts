/**
 * Primary OCR provider: embedded text first, then full text extraction.
 * Builds diagnostics (language, handwriting heuristic, page status).
 */
import { extractTextFromPdfPerPage } from "../../../ai/docRecognition";
import { detectLanguage, hasNonLatinScript } from "./languageDetection";
import { detectHandwritingFromText } from "./handwritingDetection";
import type { OcrResult, OcrPageResult, OcrDiagnostics, PageDiagnostic, PageQualityStatus } from "./types";

export async function runPrimaryOcr(buffer: Buffer): Promise<OcrResult> {
  const pageTexts: { pageNumber: number; text: string }[] = [];
  let fullText = "";

  try {
    const { fullText: text, pageTexts: pts } = await extractTextFromPdfPerPage(buffer);
    fullText = text.trim();
    for (const p of pts) {
      pageTexts.push({ pageNumber: p.page, text: p.text });
    }
  } catch (e) {
    console.warn("[ocr] primary extract failed:", e instanceof Error ? e.message : e);
    return {
      fullText: "",
      pageTexts: [],
      diagnostics: {
        ocrEngine: "pdfjs",
        ocrConfidence: 0,
        pageDiagnostics: [],
        preprocessingApplied: [],
      },
      fromEmbeddedText: false,
    };
  }

  const lang = detectLanguage(fullText);
  const nonLatin = hasNonLatinScript(fullText);
  const handwriting = detectHandwritingFromText(pageTexts, fullText.length > 0 ? 0.9 : undefined);

  const pageResults: OcrPageResult[] = pageTexts.map((p) => {
    const wordCount = p.text.trim().split(/\s+/).filter(Boolean).length;
    let qualityStatus: PageQualityStatus = "GOOD";
    if (wordCount < 10 && fullText.length > 100) qualityStatus = "LOW_CONFIDENCE";
    if (handwriting.hasHandwriting) qualityStatus = handwriting.handwritingHeavy ? "HANDWRITTEN" : "NEEDS_REVIEW";
    if (nonLatin) qualityStatus = "MIXED_LANGUAGE";
    return {
      pageNumber: p.pageNumber,
      text: p.text,
      confidence: 0.9,
      language: lang.detectedLanguage,
      hasHandwriting: handwriting.hasHandwriting,
      qualityStatus,
    };
  });

  const pageDiagnostics: PageDiagnostic[] = pageResults.map((p) => ({
    pageNumber: p.pageNumber,
    ocrMethod: "pdfjs",
    averageConfidence: p.confidence,
    detectedLanguage: p.language,
    hasHandwriting: p.hasHandwriting,
    qualityStatus: p.qualityStatus ?? "GOOD",
    needsHumanReview: p.qualityStatus !== "GOOD",
    wordCount: p.text.trim().split(/\s+/).filter(Boolean).length,
  }));

  const diagnostics: OcrDiagnostics = {
    ocrEngine: "pdfjs",
    ocrConfidence: fullText.length > 50 ? 0.85 : 0.5,
    detectedLanguage: lang.detectedLanguage,
    possibleLanguages: lang.possibleLanguages,
    hasHandwriting: handwriting.hasHandwriting,
    handwritingHeavy: handwriting.handwritingHeavy,
    handwritingConfidence: handwriting.confidence,
    pageDiagnostics,
    preprocessingApplied: [],
  };

  return {
    fullText,
    pageTexts: pageResults,
    diagnostics,
    fromEmbeddedText: false,
  };
}
