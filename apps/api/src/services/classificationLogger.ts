/**
 * Structured logging for document classification decisions.
 * Use for uncertain/fallback classifications and misclassification debug.
 */

/** Classification status stored in document_recognition and returned by API. */
export type ClassificationDecisionStatus = "confirmed" | "uncertain" | "fallback";

/** Stored classification result shape (document_recognition row + API). Usable by routing/renaming. */
export interface ClassificationResultPayload {
  doc_type: string;
  confidence: number;
  classification_status: ClassificationDecisionStatus | null;
  suggested_doc_type: string | null;
  classification_reason: string | null;
  classification_signals_json: unknown;
}

export interface ClassificationDecisionContext {
  documentId: string;
  firmId: string;
  docType: string;
  suggestedDocType?: string | null;
  confidence: number;
  status: ClassificationDecisionStatus;
  reason?: string | null;
  signalCount?: number;
}

export function logClassificationDecision(ctx: ClassificationDecisionContext): void {
  const payload = {
    type: "CLASSIFICATION_DECISION",
    documentId: ctx.documentId,
    firmId: ctx.firmId,
    docType: ctx.docType,
    suggestedDocType: ctx.suggestedDocType ?? null,
    confidence: ctx.confidence,
    status: ctx.status,
    reason: ctx.reason ?? null,
    signalCount: ctx.signalCount ?? null,
    ts: new Date().toISOString(),
  };
  const line = JSON.stringify(payload);
  if (ctx.status === "uncertain" || ctx.status === "fallback") {
    console.warn("[classification]", line);
  } else {
    console.info("[classification]", line);
  }
}
