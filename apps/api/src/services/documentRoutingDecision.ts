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
