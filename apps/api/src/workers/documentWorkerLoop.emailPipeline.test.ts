import assert from "node:assert/strict";

import {
  getWorkerCaseMatchSkipReason,
  getPostRouteClioAutoUpdateGateSource,
  isWorkerReviewFallbackRecorded,
  shouldWorkerDeferCaseMatchUntilAfterExtraction,
  shouldWorkerQueueCaseMatchAfterExtraction,
} from "./documentWorkerLoop";

async function main() {
  assert.equal(
    shouldWorkerDeferCaseMatchUntilAfterExtraction({ source: "email" }, "PI"),
    true,
    "Expected email documents to defer case matching until extraction completes."
  );
  assert.equal(
    shouldWorkerDeferCaseMatchUntilAfterExtraction({ source: "upload" }, "PI"),
    false,
    "Expected non-email documents to keep the existing parallel case match behavior."
  );
  assert.equal(
    shouldWorkerDeferCaseMatchUntilAfterExtraction({ source: "email" }, "TRAFFIC"),
    false,
    "Expected traffic documents to stay on the existing extraction-only path."
  );

  assert.equal(
    shouldWorkerQueueCaseMatchAfterExtraction(
      {
        source: "email",
        routedCaseId: null,
        status: "PROCESSING",
        reviewState: null,
        processingStage: "extraction",
        routingStatus: null,
      },
      "PI"
    ),
    true,
    "Expected unresolved email documents to queue case matching after extraction."
  );
  assert.equal(
    shouldWorkerQueueCaseMatchAfterExtraction(
      {
        source: "email",
        routedCaseId: "case-123",
        status: "UPLOADED",
        reviewState: null,
        processingStage: "complete",
        routingStatus: "routed",
      },
      "PI"
    ),
    false,
    "Expected already-routed email documents to skip post-extraction case matching."
  );
  assert.equal(
    shouldWorkerQueueCaseMatchAfterExtraction(
      {
        source: "email",
        routedCaseId: null,
        status: "NEEDS_REVIEW",
        reviewState: "IN_REVIEW",
        processingStage: "complete",
        routingStatus: "needs_review",
      },
      "PI"
    ),
    false,
    "Expected review-fallback email documents to skip duplicate post-extraction case matching."
  );

  assert.equal(
    isWorkerReviewFallbackRecorded({
      status: "NEEDS_REVIEW",
      reviewState: "IN_REVIEW",
      processingStage: "complete",
      routingStatus: null,
    }),
    true,
    "Expected completed NEEDS_REVIEW documents to be treated as having a recorded review fallback."
  );
  assert.equal(
    isWorkerReviewFallbackRecorded({
      status: "PROCESSING",
      reviewState: "IN_REVIEW",
      processingStage: "case_match",
      routingStatus: "needs_review",
    }),
    false,
    "Expected in-flight documents to remain eligible for case matching."
  );

  assert.equal(
    getPostRouteClioAutoUpdateGateSource({
      clioAutoUpdateEnabled: true,
      legacyClioSyncEnabled: false,
    }),
    "entitlement",
    "Expected monetized entitlement to allow the post-route Clio seam without the legacy flag."
  );
  assert.equal(
    getPostRouteClioAutoUpdateGateSource({
      clioAutoUpdateEnabled: false,
      legacyClioSyncEnabled: true,
    }),
    "legacy_flag",
    "Expected the legacy crm_sync fallback to keep the post-route Clio seam enabled temporarily."
  );
  assert.equal(
    getPostRouteClioAutoUpdateGateSource({
      clioAutoUpdateEnabled: false,
      legacyClioSyncEnabled: false,
    }),
    null,
    "Expected the post-route Clio seam to stay disabled when neither entitlement nor legacy fallback is present."
  );

  assert.equal(
    getWorkerCaseMatchSkipReason({
      routedCaseId: "case-123",
      status: "UPLOADED",
      reviewState: null,
      processingStage: "complete",
      routingStatus: "routed",
    }),
    "already_routed",
    "Expected case matching to skip already-routed documents."
  );
  assert.equal(
    getWorkerCaseMatchSkipReason({
      routedCaseId: null,
      status: "NEEDS_REVIEW",
      reviewState: "IN_REVIEW",
      processingStage: "complete",
      routingStatus: "needs_review",
    }),
    "review_fallback_recorded",
    "Expected case matching to skip duplicate reruns once review fallback is already recorded."
  );
  assert.equal(
    getWorkerCaseMatchSkipReason({
      routedCaseId: null,
      status: "PROCESSING",
      reviewState: null,
      processingStage: "case_match",
      routingStatus: null,
    }),
    null,
    "Expected in-flight documents to continue through case matching."
  );

  console.log("documentWorkerLoop email pipeline orchestration tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
