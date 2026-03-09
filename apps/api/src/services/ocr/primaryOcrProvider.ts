/**
 * Primary OCR provider: embedded text first, then full text extraction.
 * Builds diagnostics (language, handwriting heuristic, page status).
 */
import { extractTextFromPdfPerPage } from "../../ai/docRecognition";
import { detectLanguage, hasNonLatinScript } from "./languageDetection";
import { detectHandwritingFromText } from "./handwritingDetection";
import type { OcrResult, PageDiagnostic } from "./types";

export async function runPrimaryOcr(buffer: Buffer): Promise<OcrResult> {
  const pageTexts: { page: number; text: string }[] = [];
  let fullText = "";

  try {
    const result = await extractTextFromPdfPerPage(buffer);
    fullText = result.fullText.trim();
    for (const p of result.pageTexts) {
      pageTexts.push({ page: p.page, text: p.text });
    }
  } catch (e) {
    console.warn("[ocr] primary extract failed:", e instanceof Error ? e.message : e);
    return {
      fullText: "",
      pageTexts: [],
      ocrEngine: "pdfjs",
      ocrConfidence: 0,
      pageDiagnostics: [],
      preprocessingApplied: [],
    };
  }

  const lang = detectLanguage(fullText);
  const nonLatin = hasNonLatinScript(fullText);
  const handwriting = detectHandwritingFromText(fullText);

  const pageDiagnostics: PageDiagnostic[] = pageTexts.map((p) => {
    const wordCount = p.text.trim().split(/\s+/).filter(Boolean).length;
    let status: PageDiagnostic["status"] = "GOOD";
    if (wordCount < 10 && fullText.length > 100) status = "LOW_CONFIDENCE";
    if (handwriting.hasHandwriting) status = handwriting.handwritingHeavy ? "HANDWRITTEN" : "NEEDS_REVIEW";
    if (nonLatin) status = "MIXED_LANGUAGE";
    return {
      pageNumber: p.page,
      ocrMethod: "pdfjs",
      status,
      averageConfidence: 0.9,
      detectedLanguage: lang.detectedLanguage,
      hasHandwriting: handwriting.hasHandwriting,
      needsHumanReview: status !== "GOOD",
      textLength: p.text.length,
    };
  });

  return {
    fullText,
    pageTexts,
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
}
