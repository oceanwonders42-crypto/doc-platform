import assert from "node:assert/strict";

import { runImageOcrFallback } from "./imageOcrFallback";
import { runOcrPipeline } from "./index";

async function testPdfEmbeddedTextSkipsFallback() {
  let fallbackCalls = 0;

  const result = await runOcrPipeline(
    Buffer.from("fake-pdf"),
    {
      mimeType: "application/pdf",
      documentId: "doc-pdf-1",
      firmId: "firm-pdf-1",
    },
    {
      extractEmbeddedText: async () => ({
        fullText: "Embedded PDF text from a medical record.",
        pageTexts: [{ page: 1, text: "Embedded PDF text from a medical record." }],
        ocrEngine: "embedded",
        ocrConfidence: 0.95,
        preprocessingApplied: [],
        pageDiagnostics: [
          {
            pageNumber: 1,
            ocrMethod: "embedded",
            status: "GOOD",
            averageConfidence: 0.95,
            textLength: 40,
          },
        ],
      }),
      runImageOcrFallback: async () => {
        fallbackCalls += 1;
        return {
          fullText: "Fallback OCR text",
          pageTexts: [{ page: 1, text: "Fallback OCR text" }],
          ocrEngine: "tesseract",
          ocrConfidence: 0.8,
          preprocessingApplied: ["attempted_image_ocr"],
          pageDiagnostics: [],
        };
      },
    }
  );

  assert.equal(fallbackCalls, 0, "Expected embedded-text PDFs to skip image fallback when text is already available.");
  assert.match(result.fullText, /Embedded PDF text/);
}

async function testImageMimeTypeRoutesIntoFallback() {
  let fallbackCalls = 0;

  const result = await runOcrPipeline(
    Buffer.from("fake-image"),
    {
      mimeType: "image/png",
      documentId: "doc-image-1",
      firmId: "firm-image-1",
    },
    {
      runImageOcrFallback: async (_buffer, mimeType, options) => {
        fallbackCalls += 1;
        assert.equal(mimeType, "image/png");
        assert.ok(options, "Expected fallback options to be passed through.");
        assert.equal(options?.documentId, "doc-image-1");
        assert.equal(options?.firmId, "firm-image-1");
        return {
          fullText: "Recovered scanned intake text",
          pageTexts: [{ page: 1, text: "Recovered scanned intake text" }],
          ocrEngine: "tesseract",
          ocrConfidence: 0.88,
          preprocessingApplied: ["attempted_image_ocr", "grayscale"],
          pageDiagnostics: [
            {
              pageNumber: 1,
              ocrMethod: "tesseract",
              status: "GOOD",
              averageConfidence: 0.88,
              textLength: 29,
            },
          ],
        };
      },
    }
  );

  assert.equal(fallbackCalls, 1, "Expected image MIME inputs to enter the OCR fallback path.");
  assert.match(result.fullText, /Recovered scanned intake text/);
}

async function testFallbackRecordsPreprocessingMetadata() {
  const result = await runImageOcrFallback(
    Buffer.from("image-bytes"),
    "image/jpeg",
    {},
    {
      preprocessImage: async (buffer) => ({
        buffer,
        applied: ["resolution_normalize", "grayscale", "contrast", "binarize"],
      }),
      recognizeImage: async () => ({
        text: "Legible scanned text from fallback OCR",
        averageConfidence: 0.83,
        engine: "tesseract",
      }),
    }
  );

  assert.deepEqual(
    result.preprocessingApplied,
    ["attempted_image_ocr", "resolution_normalize", "grayscale", "contrast", "binarize"],
    "Expected preprocessing steps to be preserved for diagnostics."
  );
  assert.equal(result.lowQualityExtraction, false);
}

async function testLowTextStaysExplicit() {
  const failures: string[] = [];

  const result = await runImageOcrFallback(
    Buffer.from("image-bytes"),
    "image/png",
    {
      onFailure: ({ message }) => failures.push(message),
    },
    {
      preprocessImage: async (buffer) => ({
        buffer,
        applied: ["grayscale"],
      }),
      recognizeImage: async () => ({
        text: "stub",
        averageConfidence: 0.22,
        engine: "tesseract",
      }),
    }
  );

  assert.equal(result.fullText, "stub");
  assert.equal(result.lowQualityExtraction, true, "Expected low-text OCR to stay explicitly low quality.");
  assert.ok(
    failures.some((message) => /too little text/i.test(message)),
    "Expected low-text OCR to report an explicit failure reason."
  );
}

async function testFailedOcrStaysExplicit() {
  const failures: string[] = [];

  const result = await runImageOcrFallback(
    Buffer.from("image-bytes"),
    "image/png",
    {
      onFailure: ({ message }) => failures.push(message),
    },
    {
      preprocessImage: async (buffer) => ({
        buffer,
        applied: ["grayscale", "contrast"],
      }),
      recognizeImage: async () => {
        throw new Error("Tesseract OCR binary not found at \"tesseract\".");
      },
    }
  );

  assert.equal(result.fullText, "");
  assert.equal(result.lowQualityExtraction, true);
  assert.equal(result.ocrEngine, "tesseract_unavailable");
  assert.ok(
    failures.some((message) => /tesseract/i.test(message)),
    "Expected OCR engine failures to be surfaced explicitly."
  );
}

async function testEmptyRasterizationReportsFailure() {
  const failures: Array<{ stage: string; message: string }> = [];

  const result = await runImageOcrFallback(
    Buffer.from("image-bytes"),
    "image/png",
    {
      onFailure: (event) => failures.push(event),
    },
    {
      preprocessImage: async () => ({
        buffer: Buffer.from([]),
        applied: ["grayscale"],
      }),
      recognizeImage: async () => {
        throw new Error("recognizeImage should not be called for empty rasterization.");
      },
    }
  );

  assert.equal(result.fullText, "");
  assert.equal(result.ocrEngine, "tesseract_unavailable");
  assert.ok(
    failures.some((event) => /no rasterized output/i.test(event.message)),
    "Expected empty rasterization to report an explicit failure reason."
  );
}

async function main() {
  await testPdfEmbeddedTextSkipsFallback();
  console.log("  - embedded-text PDFs skip image fallback");
  await testImageMimeTypeRoutesIntoFallback();
  console.log("  - image MIME types route into the fallback path");
  await testFallbackRecordsPreprocessingMetadata();
  console.log("  - preprocessing metadata is preserved");
  await testLowTextStaysExplicit();
  console.log("  - low-text OCR stays explicitly low quality");
  await testFailedOcrStaysExplicit();
  console.log("  - OCR engine failures stay explicit");
  await testEmptyRasterizationReportsFailure();
  console.log("  - empty rasterization reports an explicit failure");
  console.log("OCR fallback tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
