/**
 * OCR fallback for image-only PDFs and image files.
 * Uses preprocessing + Tesseract CLI when available, and stays explicit when OCR cannot produce usable text.
 */
import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import type { OcrResult, PageDiagnostic } from "./types";
import { preprocessPageImage, preprocessPdfPage, type PreprocessResult } from "./preprocess";

const execFileAsync = promisify(execFile);
const MIN_TEXT_LENGTH_FOR_SUCCESS = 20;
const DEFAULT_LANGUAGE = process.env.TESSERACT_LANGUAGE?.trim() || "eng";
const DEFAULT_PSM = Number(process.env.TESSERACT_PSM ?? 6) || 6;
const DEFAULT_MAX_BUFFER = 32 * 1024 * 1024;
const MAX_PDF_PAGES = Number(process.env.OCR_FALLBACK_MAX_PAGES ?? 10) || 10;

export type OcrFallbackOptions = {
  documentId?: string;
  firmId?: string;
  onFailure?: (opts: { stage: string; message: string; documentId?: string; firmId?: string }) => void;
};

export type RecognizedImageText = {
  text: string;
  averageConfidence: number;
  engine: string;
};

export type ImageOcrFallbackDependencies = {
  preprocessImage?: (buffer: Buffer, mimeType?: string) => Promise<PreprocessResult>;
  preprocessPdfPage?: (buffer: Buffer, pageNum: number) => Promise<PreprocessResult>;
  recognizeImage?: (buffer: Buffer) => Promise<RecognizedImageText>;
  maxPdfPages?: number;
};

type TsvWord = {
  text: string;
  confidence: number;
  lineKey: string;
};

function getBinaryPath(): string {
  return process.env.TESSERACT_PATH?.trim() || "tesseract";
}

function buildMissingBinaryMessage(binaryPath: string): string {
  return (
    `Tesseract OCR binary not found at "${binaryPath}". ` +
    "Install Tesseract on the host and set TESSERACT_PATH if it is not on PATH."
  );
}

function buildRuntimeErrorMessage(error: unknown): string {
  const binaryPath = getBinaryPath();
  const errorWithCode = error as { code?: string; stderr?: string } | undefined;
  if (errorWithCode?.code === "ENOENT") {
    return buildMissingBinaryMessage(binaryPath);
  }

  const stderr = typeof errorWithCode?.stderr === "string" ? errorWithCode.stderr.trim() : "";
  const rawMessage = stderr || (error instanceof Error ? error.message : String(error));
  if (rawMessage.toLowerCase().includes("error opening data file")) {
    return `${rawMessage}. Install the requested Tesseract language pack or set TESSDATA_PREFIX correctly.`;
  }
  return rawMessage || "Tesseract OCR failed";
}

function parseTsv(tsv: string): TsvWord[] {
  const lines = tsv.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length <= 1) return [];

  const header = lines[0].split("\t");
  const textIndex = header.indexOf("text");
  const confIndex = header.indexOf("conf");
  const pageIndex = header.indexOf("page_num");
  const blockIndex = header.indexOf("block_num");
  const paragraphIndex = header.indexOf("par_num");
  const lineIndex = header.indexOf("line_num");

  if (
    textIndex === -1 ||
    confIndex === -1 ||
    pageIndex === -1 ||
    blockIndex === -1 ||
    paragraphIndex === -1 ||
    lineIndex === -1
  ) {
    return [];
  }

  return lines.slice(1).flatMap((line) => {
    const columns = line.split("\t");
    const text = (columns[textIndex] ?? "").trim();
    const confidence = Number(columns[confIndex] ?? "-1");
    if (!text || Number.isNaN(confidence) || confidence < 0) return [];

    return [
      {
        text,
        confidence,
        lineKey: [
          columns[pageIndex] ?? "0",
          columns[blockIndex] ?? "0",
          columns[paragraphIndex] ?? "0",
          columns[lineIndex] ?? "0",
        ].join(":"),
      },
    ];
  });
}

function buildRecognizedText(words: TsvWord[]): RecognizedImageText {
  if (words.length === 0) {
    return {
      text: "",
      averageConfidence: 0,
      engine: "tesseract",
    };
  }

  const lines: string[] = [];
  let currentLineKey = "";
  let currentLine: string[] = [];

  for (const word of words) {
    if (word.lineKey !== currentLineKey) {
      if (currentLine.length > 0) {
        lines.push(currentLine.join(" "));
      }
      currentLineKey = word.lineKey;
      currentLine = [word.text];
      continue;
    }
    currentLine.push(word.text);
  }

  if (currentLine.length > 0) {
    lines.push(currentLine.join(" "));
  }

  return {
    text: lines.join("\n").trim(),
    averageConfidence: words.reduce((total, word) => total + word.confidence, 0) / (words.length * 100),
    engine: "tesseract",
  };
}

async function recognizeImageWithTesseract(imageBuffer: Buffer): Promise<RecognizedImageText> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "onyx-image-ocr-"));
  const inputPath = path.join(tempDir, "page.png");
  const args = [
    inputPath,
    "stdout",
    "-l",
    DEFAULT_LANGUAGE,
    "--psm",
    String(DEFAULT_PSM),
    "tsv",
  ];

  try {
    await fs.writeFile(inputPath, imageBuffer);
    const { stdout } = await execFileAsync(getBinaryPath(), args, {
      windowsHide: true,
      maxBuffer: DEFAULT_MAX_BUFFER,
    });
    return buildRecognizedText(parseTsv(stdout));
  } catch (error) {
    throw new Error(buildRuntimeErrorMessage(error));
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function buildPageDiagnostic(
  pageNumber: number,
  recognized: RecognizedImageText,
  lowQuality: boolean
): PageDiagnostic {
  const hasText = recognized.text.trim().length > 0;
  const status: PageDiagnostic["status"] = !hasText
    ? "LOW_CONFIDENCE"
    : lowQuality || recognized.averageConfidence < 0.55
      ? "NEEDS_REVIEW"
      : "GOOD";

  return {
    pageNumber,
    ocrMethod: recognized.engine,
    averageConfidence: recognized.averageConfidence,
    status,
    needsReview: status !== "GOOD",
    textLength: recognized.text.trim().length,
  };
}

function buildEmptyFallbackResult(preprocessingApplied: string[], engine: string): OcrResult {
  return {
    fullText: "",
    pageTexts: [],
    ocrEngine: engine,
    ocrConfidence: 0,
    lowQualityExtraction: true,
    pageDiagnostics: [],
    preprocessingApplied,
  };
}

function isPdfFallbackInput(mimeType: string): boolean {
  return mimeType === "application/pdf";
}

export async function runImageOcrFallback(
  buffer: Buffer,
  mimeType: string,
  opts: OcrFallbackOptions = {},
  dependencies: ImageOcrFallbackDependencies = {}
): Promise<OcrResult> {
  const { documentId, firmId, onFailure } = opts;
  const preprocessImage = dependencies.preprocessImage ?? preprocessPageImage;
  const preprocessPdf = dependencies.preprocessPdfPage ?? preprocessPdfPage;
  const recognizeImage = dependencies.recognizeImage ?? recognizeImageWithTesseract;

  const preprocessingApplied = new Set<string>(["attempted_image_ocr"]);
  const pageTexts: Array<{ page: number; text: string }> = [];
  const pageDiagnostics: PageDiagnostic[] = [];
  const confidences: number[] = [];
  const maxPdfPages = Math.max(1, dependencies.maxPdfPages ?? MAX_PDF_PAGES);

  const handleFailure = (stage: string, message: string) => {
    onFailure?.({
      stage,
      message,
      documentId,
      firmId,
    });
  };

  const runSinglePage = async (pageNumber: number, processed: PreprocessResult): Promise<boolean> => {
    processed.applied.forEach((step) => preprocessingApplied.add(step));

    if (!processed.buffer.length) {
      return false;
    }

    try {
      const recognized = await recognizeImage(processed.buffer);
      const text = recognized.text.trim();
      if (text.length > 0) {
        pageTexts.push({ page: pageNumber, text });
      }
      confidences.push(recognized.averageConfidence);
      pageDiagnostics.push(
        buildPageDiagnostic(pageNumber, recognized, text.length < MIN_TEXT_LENGTH_FOR_SUCCESS)
      );
      return true;
    } catch (error) {
      handleFailure("ocr_fallback", error instanceof Error ? error.message : String(error));
      if (pageTexts.length === 0) {
        return false;
      }
      return true;
    }
  };

  if (isPdfFallbackInput(mimeType)) {
    preprocessingApplied.add("pdf_to_image_rasterization");
    for (let pageNumber = 1; pageNumber <= maxPdfPages; pageNumber += 1) {
      const processed = await preprocessPdf(buffer, pageNumber);
      const ranPage = await runSinglePage(pageNumber, processed);
      if (!ranPage) {
        if (pageNumber === 1) {
          handleFailure(
            "ocr_fallback",
            "Image OCR fallback could not rasterize the PDF into page images."
          );
        } else {
          handleFailure(
            "ocr_fallback",
            `Image OCR fallback could not rasterize PDF page ${pageNumber}.`
          );
        }
        break;
      }
    }
  } else {
    const processed = await preprocessImage(buffer, mimeType);
    const ranImage = await runSinglePage(1, processed);
    if (!ranImage) {
      handleFailure(
        "ocr_fallback",
        "Image OCR preprocessing produced no rasterized output."
      );
      return buildEmptyFallbackResult(uniqueStrings([...preprocessingApplied]), "tesseract_unavailable");
    }
  }

  const fullText = pageTexts
    .sort((a, b) => a.page - b.page)
    .map((page) => page.text)
    .join("\n\n")
    .trim();
  const averageConfidence =
    confidences.length > 0 ? confidences.reduce((total, value) => total + value, 0) / confidences.length : 0;
  const lowQuality = fullText.length < MIN_TEXT_LENGTH_FOR_SUCCESS;

  if (!fullText) {
    return buildEmptyFallbackResult(uniqueStrings([...preprocessingApplied]), "tesseract");
  }

  if (lowQuality) {
    handleFailure("ocr_low_text", "Image OCR extracted too little text to trust automatically.");
  }

  return {
    fullText,
    pageTexts: pageTexts.sort((a, b) => a.page - b.page),
    ocrEngine: "tesseract",
    ocrConfidence: averageConfidence,
    lowQualityExtraction: lowQuality,
    pageDiagnostics,
    preprocessingApplied: uniqueStrings([...preprocessingApplied]),
  };
}

export function isLowTextResult(result: OcrResult): boolean {
  const text = (result.fullText || "").trim();
  return text.length < MIN_TEXT_LENGTH_FOR_SUCCESS;
}
