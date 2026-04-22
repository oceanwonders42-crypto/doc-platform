/**
 * Structured logging for document intake failures.
 * Use for validation, storage, and enqueue failures so ops can debug.
 */
export type IntakeFailureStage = "validation" | "storage" | "enqueue" | "unknown";

export interface IntakeFailureContext {
  stage: IntakeFailureStage;
  error: string;
  code?: string;
  firmId?: string | null;
  fileName?: string;
  sizeBytes?: number;
  documentId?: string;
  [key: string]: unknown;
}

export function logIntakeFailure(ctx: IntakeFailureContext): void {
  const payload = {
    type: "INTAKE_FAILURE",
    stage: ctx.stage,
    error: ctx.error,
    code: ctx.code ?? null,
    firmId: ctx.firmId ?? null,
    fileName: ctx.fileName ?? null,
    sizeBytes: ctx.sizeBytes ?? null,
    documentId: ctx.documentId ?? null,
    ts: new Date().toISOString(),
  };
  console.error("[intake]", JSON.stringify(payload));
}
