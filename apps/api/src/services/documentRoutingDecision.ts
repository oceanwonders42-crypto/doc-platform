import type { RoutingCandidate, RoutingScoreResult } from "./routingScorer";

export const DEFAULT_AUTO_ROUTE_MARGIN = 0.15;

type RoutingDecisionOptions = {
  minConfidence: number;
  minMargin?: number;
};

type RoutingExplanation = {
  suggestedCaseId: string | null;
  confidence: number;
  margin: number | null;
  shouldAutoRoute: boolean;
  topSignals: string[];
  candidateSummaries: string[];
  reviewReasons: string[];
};

export type StructuredRoutingDecision = {
  document_type: string | null;
  client_name: string | null;
  date_of_loss: string | null;
  provider: string | null;
  claim_number: string | null;
  matched_case_id: string | null;
  confidence_score: number;
  reasoning: string[];
  review_required: boolean;
  source_fields: Record<string, unknown>;
  candidate_summaries: string[];
};

function formatConfidence(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function pushUnique(target: string[], value: string | null | undefined) {
  if (typeof value !== "string") return;
  const trimmed = value.trim();
  if (!trimmed || target.includes(trimmed)) return;
  target.push(trimmed);
}

export function getRoutingConfidenceMargin(
  candidates: RoutingCandidate[]
): number | null {
  const [top, runnerUp] = [...candidates].sort((left, right) => right.confidence - left.confidence);
  if (!top) return null;
  if (!runnerUp) return top.confidence;
  return top.confidence - runnerUp.confidence;
}

export function getTopRoutingSignals(
  result: RoutingScoreResult,
  maxSignals = 6
): string[] {
  const topSignals: string[] = [];
  pushUnique(topSignals, result.signals.baseMatchReason);

  if (result.signals.caseNumber) {
    pushUnique(topSignals, `Case number: ${result.signals.caseNumber}`);
  }
  if (result.signals.claimNumber && result.signals.claimNumber !== result.signals.caseNumber) {
    pushUnique(topSignals, `Claim number: ${result.signals.claimNumber}`);
  }
  if (result.signals.clientName) {
    pushUnique(topSignals, `Client: ${result.signals.clientName}`);
  }
  if (result.signals.documentClientName) {
    pushUnique(topSignals, `Document client: ${result.signals.documentClientName}`);
  }
  if (result.signals.emailClientName) {
    pushUnique(topSignals, `Email client: ${result.signals.emailClientName}`);
  }
  if (result.signals.providerName) {
    pushUnique(topSignals, `Provider: ${result.signals.providerName}`);
  }
  if (result.signals.dateOfLoss) {
    pushUnique(topSignals, `Date of loss: ${result.signals.dateOfLoss}`);
  }
  if (result.signals.docType) {
    pushUnique(topSignals, `Document type: ${result.signals.docType}`);
  }
  for (const providerReason of result.signals.providerMatchReasons ?? []) {
    pushUnique(topSignals, providerReason);
  }

  return topSignals.slice(0, maxSignals);
}

export function getRoutingCandidateSummaries(
  candidates: RoutingCandidate[],
  maxCandidates = 3
): string[] {
  return [...candidates]
    .sort((left, right) => right.confidence - left.confidence)
    .slice(0, maxCandidates)
    .map((candidate) => {
      const caseLabel = candidate.caseNumber?.trim() || candidate.caseTitle?.trim() || candidate.caseId;
      return `${caseLabel} (${formatConfidence(candidate.confidence)}): ${candidate.reason}`;
    });
}

export function shouldAutoRouteRoutingResult(
  result: RoutingScoreResult,
  options: RoutingDecisionOptions
): boolean {
  if (!result.chosenCaseId || result.confidence < options.minConfidence) {
    return false;
  }

  const margin = getRoutingConfidenceMargin(result.candidates);
  const minMargin = options.minMargin ?? DEFAULT_AUTO_ROUTE_MARGIN;
  return margin == null || margin >= minMargin;
}

export function buildRoutingReviewReasons(
  result: RoutingScoreResult,
  options: RoutingDecisionOptions
): string[] {
  const reasons: string[] = [];
  const minMargin = options.minMargin ?? DEFAULT_AUTO_ROUTE_MARGIN;
  const margin = getRoutingConfidenceMargin(result.candidates);

  if (!result.chosenCaseId) {
    pushUnique(reasons, "No reliable case candidate was found.");
  }
  if (result.confidence < options.minConfidence) {
    pushUnique(
      reasons,
      `Top candidate confidence ${formatConfidence(result.confidence)} is below the auto-route threshold ${formatConfidence(options.minConfidence)}.`
    );
  }
  if (result.candidates.length > 1 && margin != null && margin < minMargin) {
    pushUnique(
      reasons,
      `Top candidates are too close (${formatConfidence(margin)} apart) for safe auto-routing.`
    );
  }
  if (result.candidates.length === 0) {
    pushUnique(reasons, "No routing candidates were produced from the current document signals.");
  }

  return reasons;
}

export function buildRoutingExplanation(
  result: RoutingScoreResult,
  options: RoutingDecisionOptions
): RoutingExplanation {
  const margin = getRoutingConfidenceMargin(result.candidates);
  return {
    suggestedCaseId: result.chosenCaseId,
    confidence: result.confidence,
    margin,
    shouldAutoRoute: shouldAutoRouteRoutingResult(result, options),
    topSignals: getTopRoutingSignals(result),
    candidateSummaries: getRoutingCandidateSummaries(result.candidates),
    reviewReasons: buildRoutingReviewReasons(result, options),
  };
}

export function buildStructuredRoutingDecision(
  result: RoutingScoreResult,
  explanation: RoutingExplanation
): StructuredRoutingDecision {
  const sourceFields = {
    document_type: result.signals.docType ?? null,
    client_name:
      result.signals.clientName ??
      result.signals.documentClientName ??
      result.signals.emailClientName ??
      null,
    date_of_loss: result.signals.dateOfLoss ?? null,
    provider: result.signals.providerName ?? null,
    claim_number: result.signals.claimNumber ?? result.signals.caseNumber ?? null,
    case_number: result.signals.caseNumber ?? null,
    file_name: result.signals.fileName ?? null,
    source: result.signals.source ?? null,
    base_match_reason: result.signals.baseMatchReason ?? null,
  };
  const reasoning = [
    ...explanation.topSignals,
    ...(result.candidates[0]?.reason ? [result.candidates[0].reason] : []),
    ...explanation.reviewReasons,
  ].filter((reason, index, list) => reason && list.indexOf(reason) === index);

  return {
    document_type: result.signals.docType ?? null,
    client_name: sourceFields.client_name,
    date_of_loss: sourceFields.date_of_loss,
    provider: sourceFields.provider,
    claim_number: sourceFields.claim_number,
    matched_case_id: result.chosenCaseId,
    confidence_score: result.confidence,
    reasoning,
    review_required: !explanation.shouldAutoRoute,
    source_fields: sourceFields,
    candidate_summaries: explanation.candidateSummaries,
  };
}
