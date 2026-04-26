/**
 * Shared document routing logic: update document, audit event, queue follow-up work.
 * Used by POST /documents/:id/route and by the worker for auto-route.
 */
import type { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma";
import { enqueuePostRouteSyncJob, enqueueTimelineRebuildJob } from "./queue";
import { emitWebhookEvent } from "./webhooks";
import type { DocumentReviewStateValue } from "./documentReviewState";

export type RouteDocumentTimingStage =
  | "persistence_complete"
  | "audit_complete"
  | "enqueue_complete";

export type RouteDocumentTimingReporter = (
  stage: RouteDocumentTimingStage,
  meta?: Record<string, unknown>
) => void | Promise<void>;

export type RouteDocumentOptions = {
  actor: string;
  action: string;
  routedSystem?: string | null;
  routingStatus?: string | null;
  reviewState?: DocumentReviewStateValue | null;
  status?: "RECEIVED" | "PROCESSING" | "NEEDS_REVIEW" | "UPLOADED" | "FAILED" | "UNMATCHED";
  routingConfidence?: number | null;
  routingReason?: string | null;
  routingSourceFields?: unknown;
  routingDecision?: unknown;
  metaJson?: unknown;
  timingReporter?: RouteDocumentTimingReporter;
};

type RouteDocumentStoredStatus =
  | "RECEIVED"
  | "PROCESSING"
  | "NEEDS_REVIEW"
  | "UPLOADED"
  | "FAILED"
  | "UNMATCHED";

type RouteDocumentCurrentState = {
  status: RouteDocumentStoredStatus;
};

type RouteDocumentUpdateData = {
  routedCaseId?: string | null;
  routedSystem?: string | null;
  routingStatus?: string | null;
  reviewState?: DocumentReviewStateValue | null;
  status?: RouteDocumentStoredStatus;
  routingConfidence?: number | null;
  routingReason?: string | null;
  routingSourceFields?: Prisma.InputJsonValue;
  routingDecision?: Prisma.InputJsonValue;
};

function toJsonSafe(value: unknown): Prisma.InputJsonValue | undefined {
  if (value == null) return undefined;
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export function buildRouteDocumentUpdateData(
  doc: RouteDocumentCurrentState,
  toCaseId: string | null,
  options: RouteDocumentOptions
): RouteDocumentUpdateData {
  const { routedSystem, routingStatus, reviewState, status } = options;
  const updateData: RouteDocumentUpdateData = {
    routedCaseId: toCaseId ?? null,
  };
  if (routedSystem !== undefined) updateData.routedSystem = routedSystem;
  if (routingStatus !== undefined) updateData.routingStatus = routingStatus;
  if (reviewState !== undefined) updateData.reviewState = reviewState;
  if (options.routingConfidence !== undefined) updateData.routingConfidence = options.routingConfidence;
  if (options.routingReason !== undefined) updateData.routingReason = options.routingReason;
  if (options.routingSourceFields !== undefined) {
    const json = toJsonSafe(options.routingSourceFields);
    if (json !== undefined) updateData.routingSourceFields = json;
  }
  if (options.routingDecision !== undefined) {
    const json = toJsonSafe(options.routingDecision);
    if (json !== undefined) updateData.routingDecision = json;
  }
  if (status !== undefined) {
    updateData.status = status;
  } else if (
    toCaseId &&
    (doc.status === "PROCESSING" || doc.status === "NEEDS_REVIEW" || doc.status === "UNMATCHED")
  ) {
    updateData.status = "UPLOADED";
  }

  return updateData;
}

export async function routeDocument(
  firmId: string,
  documentId: string,
  toCaseId: string | null,
  options: RouteDocumentOptions
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { actor, action, routedSystem, routingStatus, reviewState, status, metaJson, timingReporter } = options;

  const doc = await prisma.document.findFirst({
    where: { id: documentId, firmId },
    select: { id: true, routedCaseId: true, status: true },
  });
  if (!doc) return { ok: false, error: "document not found" };

  const updateData = buildRouteDocumentUpdateData(doc, toCaseId, options);

  await prisma.document.updateMany({
    where: { id: documentId, firmId },
    data: updateData,
  });
  await timingReporter?.("persistence_complete", {
    documentId,
    toCaseId,
  });

  await prisma.documentAuditEvent.create({
    data: {
      firmId,
      documentId,
      actor,
      action,
      fromCaseId: doc.routedCaseId ?? null,
      toCaseId: toCaseId ?? null,
      metaJson: metaJson ? JSON.parse(JSON.stringify(metaJson)) : null,
    },
  });
  await timingReporter?.("audit_complete", {
    documentId,
    fromCaseId: doc.routedCaseId ?? null,
    toCaseId,
  });

  const queuedJobs: string[] = [];
  if (toCaseId) {
    queuedJobs.push("timeline_rebuild", "post_route_sync");
    const enqueueResults = await Promise.allSettled([
      enqueueTimelineRebuildJob({ caseId: toCaseId, firmId }),
      enqueuePostRouteSyncJob({
        documentId,
        firmId,
        caseId: toCaseId,
        action,
      }),
    ]);
    for (const result of enqueueResults) {
      if (result.status === "rejected") {
        console.warn("[documentRouting] background route follow-up enqueue failed", {
          caseId: toCaseId,
          documentId,
          error: result.reason,
        });
      }
    }
  }
  await timingReporter?.("enqueue_complete", {
    documentId,
    toCaseId,
    queuedJobs,
  });

  emitWebhookEvent(firmId, "document.routed", {
    documentId,
    caseId: toCaseId ?? undefined,
    fromCaseId: doc.routedCaseId ?? undefined,
    actor,
    action,
  }).catch((e) => console.warn("[webhooks] document.routed emit failed", e));

  return { ok: true };
}
