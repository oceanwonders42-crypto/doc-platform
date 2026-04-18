import assert from "node:assert/strict";

import { getOcrNoTextReviewState, runWorkerOcr, upsertRecognitionTextExcerpt } from "./documentWorkerLoop";
import type { OcrResult } from "../services/ocr";

async function main() {
  let pipelineCalls = 0;
  let persistedParams: [string, string] | null = null;

  const text = await runWorkerOcr(
    Buffer.from("fake-image-bytes"),
    {
      mimeType: "image/png",
      originalName: "scanned-intake.png",
      documentId: "doc-scan-1",
      firmId: "firm-scan-1",
    },
    {
      runOcrPipeline: async (_buffer, options) => {
        pipelineCalls += 1;
        assert.equal(options?.mimeType, "image/png", "Expected image docs to be routed through the OCR pipeline.");
        assert.equal(options?.documentId, "doc-scan-1");
        assert.equal(options?.firmId, "firm-scan-1");

        const result: OcrResult = {
          fullText: "Recovered OCR text from scanned intake",
          pageTexts: [{ page: 1, text: "Recovered OCR text from scanned intake" }],
          ocrEngine: "test-fallback",
          ocrConfidence: 0.91,
          preprocessingApplied: [],
          pageDiagnostics: [],
        };
        return result;
      },
    }
  );

  assert.equal(pipelineCalls, 1, "Expected OCR-eligible scanned/image-heavy docs to enter runOcrPipeline exactly once.");
  assert.equal(text, "Recovered OCR text from scanned intake");

  const inferredMimeText = await runWorkerOcr(
    Buffer.from("fake-image-bytes"),
    {
      originalName: "scan-only-extension.jpeg",
      documentId: "doc-scan-2",
      firmId: "firm-scan-2",
    },
    {
      runOcrPipeline: async (_buffer, options) => {
        pipelineCalls += 1;
        assert.equal(
          options?.mimeType,
          "image/jpeg",
          "Expected extension-only image docs to infer an image mime type before entering the OCR pipeline."
        );

        const result: OcrResult = {
          fullText: "Recovered OCR text from extension-only image",
          pageTexts: [{ page: 1, text: "Recovered OCR text from extension-only image" }],
          ocrEngine: "test-fallback",
          ocrConfidence: 0.88,
          preprocessingApplied: [],
          pageDiagnostics: [],
        };
        return result;
      },
    }
  );

  assert.equal(pipelineCalls, 2, "Expected both OCR-eligible image scenarios to route through the OCR pipeline.");
  assert.equal(inferredMimeText, "Recovered OCR text from extension-only image");

  const skippedText = await runWorkerOcr(
    Buffer.from("plain text bytes"),
    {
      mimeType: "text/plain",
      originalName: "note.txt",
      documentId: "doc-note-1",
      firmId: "firm-note-1",
    },
    {
      runOcrPipeline: async () => {
        throw new Error("Non-OCR-eligible documents should not enter the OCR pipeline.");
      },
    }
  );

  assert.equal(skippedText, "", "Expected non-OCR-eligible docs to bypass OCR entirely.");

  await upsertRecognitionTextExcerpt(
    "doc-scan-1",
    text,
    async (_sql, params) => {
      persistedParams = params;
      return { rowCount: 1 };
    }
  );

  assert.deepEqual(
    persistedParams,
    ["doc-scan-1", "Recovered OCR text from scanned intake"],
    "Expected successful OCR text to be persisted as a non-empty text_excerpt."
  );

  assert.deepEqual(
    getOcrNoTextReviewState(),
    {
      status: "NEEDS_REVIEW",
      reviewState: "IN_REVIEW",
      processingStage: "ocr",
      failureStage: "ocr",
      failureReason: "No OCR text extracted",
    },
    "Expected OCR-empty documents to remain in the OCR stage while being routed to review."
  );

  console.log("documentWorkerLoop OCR pipeline wiring tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
