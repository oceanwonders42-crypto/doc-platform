/**
 * Structured logging for routing decisions (case match → auto-route, needs_review, unmatched).
 * Use for auditability and debug of why a document was routed or sent to review.
 */
export type RoutingDecisionAction = "auto_routed" | "needs_review" | "unmatched" | "manual" | "auto_created_case";

export interface RoutingDecisionContext {
  documentId: string;
  firmId: string;
  matchConfidence: number;
  threshold: number;
  action: RoutingDecisionAction;
  suggestedCaseId?: string | null;
  matchedCaseId?: string | null;
  matchReason?: string | null;
  unmatchedReason?: string | null;
  matchSource?: string | null;
  /** True when auto-route was skipped because doc was already manually routed to a different case. */
  preservedManualRoute?: boolean;
}

export function logRoutingDecision(ctx: RoutingDecisionContext): void {
  const payload = {
    type: "ROUTING_DECISION",
    documentId: ctx.documentId,
    firmId: ctx.firmId,
    matchConfidence: ctx.matchConfidence,
    threshold: ctx.threshold,
    action: ctx.action,
    suggestedCaseId: ctx.suggestedCaseId ?? null,
    matchedCaseId: ctx.matchedCaseId ?? null,
    matchReason: ctx.matchReason ?? null,
    unmatchedReason: ctx.unmatchedReason ?? null,
    matchSource: ctx.matchSource ?? null,
    preservedManualRoute: ctx.preservedManualRoute ?? false,
    ts: new Date().toISOString(),
  };
  const line = JSON.stringify(payload);
  if (ctx.action === "auto_routed" || ctx.action === "auto_created_case") {
    console.info("[routing]", line);
  } else {
    console.warn("[routing]", line);
  }
}
