import assert from "node:assert/strict";

import {
  buildRoutingExplanation,
  buildRoutingReviewReasons,
  buildStructuredRoutingDecision,
  DEFAULT_AUTO_ROUTE_MARGIN,
  getRoutingCandidateSummaries,
  getRoutingConfidenceMargin,
  getTopRoutingSignals,
  shouldAutoRouteRoutingResult,
} from "./documentRoutingDecision";
import type { RoutingScoreResult } from "./routingScorer";

function buildResult(overrides?: Partial<RoutingScoreResult>): RoutingScoreResult {
  return {
    chosenCaseId: "case-1",
    chosenFolder: null,
    chosenDocType: "medical_record",
    confidence: 0.94,
    candidates: [
      {
        caseId: "case-1",
        caseNumber: "CASE-1",
        caseTitle: "Top candidate",
        confidence: 0.94,
        reason: "Case number exact match",
        source: "case_match",
      },
      {
        caseId: "case-2",
        caseNumber: "CASE-2",
        caseTitle: "Runner up",
        confidence: 0.62,
        reason: "Client name fuzzy match",
        source: "feedback",
      },
    ],
    matchedPatterns: [],
    signals: {
      caseNumber: "CASE-1",
      clientName: "Casey Client",
      docType: "medical_record",
      fileName: "casey-record.pdf",
      source: "upload",
      baseMatchReason: "Case number match (exact)",
      providerName: "Casey Therapy",
      providerMatchReasons: ['Provider "Casey Therapy" linked to case'],
      documentClientName: "Casey Client",
      emailClientName: null,
    },
    ...overrides,
  };
}

async function main() {
  const result = buildResult();
  assert.ok(
    Math.abs((getRoutingConfidenceMargin(result.candidates) ?? 0) - 0.32) < 1e-9
  );
  assert.deepEqual(getTopRoutingSignals(result).slice(0, 3), [
    "Case number match (exact)",
    "Case number: CASE-1",
    "Client: Casey Client",
  ]);
  assert.deepEqual(getRoutingCandidateSummaries(result.candidates), [
    "CASE-1 (94%): Case number exact match",
    "CASE-2 (62%): Client name fuzzy match",
  ]);
  assert.equal(
    shouldAutoRouteRoutingResult(result, { minConfidence: 0.9 }),
    true
  );

  const ambiguous = buildResult({
    confidence: 0.91,
    candidates: [
      {
        caseId: "case-1",
        caseNumber: "CASE-1",
        caseTitle: "Top candidate",
        confidence: 0.91,
        reason: "Case number fuzzy match",
        source: "case_match",
      },
      {
        caseId: "case-2",
        caseNumber: "CASE-2",
        caseTitle: "Runner up",
        confidence: 0.84,
        reason: "Provider overlap",
        source: "feedback",
      },
    ],
  });
  assert.equal(
    shouldAutoRouteRoutingResult(ambiguous, {
      minConfidence: 0.9,
      minMargin: DEFAULT_AUTO_ROUTE_MARGIN,
    }),
    false
  );
  assert.deepEqual(buildRoutingReviewReasons(ambiguous, { minConfidence: 0.9 }), [
    "Top candidates are too close (7% apart) for safe auto-routing.",
  ]);

  const noMatch = buildResult({
    chosenCaseId: null,
    confidence: 0,
    candidates: [],
    signals: {
      caseNumber: null,
      clientName: null,
      docType: "insurance_letter",
      fileName: "carrier-letter.pdf",
      source: "email",
      baseMatchReason: null,
      providerName: null,
      providerMatchReasons: [],
      documentClientName: null,
      emailClientName: null,
    },
  });
  assert.equal(shouldAutoRouteRoutingResult(noMatch, { minConfidence: 0.9 }), false);
  assert.deepEqual(buildRoutingReviewReasons(noMatch, { minConfidence: 0.9 }), [
    "No reliable case candidate was found.",
    "Top candidate confidence 0% is below the auto-route threshold 90%.",
    "No routing candidates were produced from the current document signals.",
  ]);

  const explanation = buildRoutingExplanation(result, { minConfidence: 0.9 });
  assert.equal(explanation.shouldAutoRoute, true);
  assert.equal(explanation.suggestedCaseId, "case-1");
  assert.equal(explanation.candidateSummaries.length, 2);
  const structured = buildStructuredRoutingDecision(
    buildResult({
      signals: {
        ...result.signals,
        claimNumber: "CLM-123",
        dateOfLoss: "2026-04-01",
      },
    }),
    explanation
  );
  assert.equal(structured.document_type, "medical_record");
  assert.equal(structured.client_name, "Casey Client");
  assert.equal(structured.date_of_loss, "2026-04-01");
  assert.equal(structured.claim_number, "CLM-123");
  assert.equal(structured.matched_case_id, "case-1");
  assert.equal(structured.review_required, false);
  assert(structured.reasoning.some((reason) => reason.includes("Case number")));

  console.log("documentRoutingDecision tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
