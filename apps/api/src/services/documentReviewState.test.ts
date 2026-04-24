import assert from "node:assert/strict";

import { getNormalizedDocumentStatus } from "./documentReviewState";

async function main() {
  assert.equal(
    getNormalizedDocumentStatus({
      status: "PROCESSING",
      reviewState: "APPROVED",
      routedCaseId: "case-123",
      processingStage: "complete",
      processedAt: new Date("2026-04-24T17:00:00.000Z"),
    }),
    "UPLOADED"
  );

  assert.equal(
    getNormalizedDocumentStatus({
      status: "PROCESSING",
      reviewState: "IN_REVIEW",
      routedCaseId: "case-123",
      processingStage: "complete",
    }),
    "NEEDS_REVIEW"
  );

  assert.equal(
    getNormalizedDocumentStatus({
      status: "PROCESSING",
      reviewState: null,
      routedCaseId: null,
      processingStage: "classification",
      processedAt: null,
    }),
    "PROCESSING"
  );

  console.log("document review state normalization tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
