/**
 * Shared document routing logic: update document, audit event, rebuild timeline.
 * Used by POST /documents/:id/route and by the worker for auto-route.
 */
import { prisma } from "../db/prisma";
import { pgPool } from "../db/pg";
import { Prisma } from "@prisma/client";
import { rebuildCaseTimeline } from "./caseTimeline";
import { createNotification } from "./notifications";
import { emitWebhookEvent } from "./webhooks";
import { recordReviewQueueExit } from "./reviewQueueEvent";
import { ensureProviderCaseLinkFromDocument } from "./providerCaseLinking";
import type { DocumentStatus } from "@prisma/client";

export type RouteDocumentOptions = {
  actor: string;
  action: string;
  routedSystem?: string | null;
  routingStatus?: string | null;
  metaJson?: unknown;
};

export async function routeDocument(
  firmId: string,
  documentId: string,
  toCaseId: string | null,
  options: RouteDocumentOptions
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { actor, action, routedSystem, routingStatus, metaJson } = options;

  const doc = await prisma.document.findFirst({
    where: { id: documentId, firmId },
    select: { id: true, routedCaseId: true },
  });
  if (!doc) return { ok: false, error: "document not found" };

  const updateData: {
    routedCaseId?: string | null;
    routedSystem?: string | null;
    routingStatus?: string | null;
    status?: DocumentStatus;
  } = {
    routedCaseId: toCaseId ?? null,
  };
  if (routedSystem !== undefined) updateData.routedSystem = routedSystem;
  if (routingStatus !== undefined) updateData.routingStatus = routingStatus;
  if (toCaseId) {
    updateData.status = "UPLOADED";
  } else {
    updateData.status = "UNMATCHED";
    updateData.routingStatus = null;
  }

  await prisma.document.update({
    where: { id: documentId },
    data: updateData,
  });

  if (toCaseId) {
    await recordReviewQueueExit(firmId, documentId, "routed");
    await ensureProviderCaseLinkFromDocument(firmId, documentId, toCaseId).catch((e) => {
      console.warn("[documentRouting] ensureProviderCaseLinkFromDocument failed", { documentId, caseId: toCaseId, err: e });
    });
  } else {
    await recordReviewQueueExit(firmId, documentId, "unmatched");
  }

  await prisma.documentAuditEvent.create({
    data: {
      firmId,
      documentId,
      actor,
      action,
      fromCaseId: doc.routedCaseId ?? null,
      toCaseId: toCaseId ?? null,
      metaJson: metaJson != null ? (JSON.parse(JSON.stringify(metaJson)) as Prisma.InputJsonValue) : Prisma.JsonNull,
    },
  });

  if (toCaseId) {
    try {
      await rebuildCaseTimeline(toCaseId, firmId);
    } catch (e) {
      console.error("[documentRouting] rebuildCaseTimeline failed", { caseId: toCaseId, err: e });
    }
    const { rows } = await pgPool.query<{ insurance_fields: unknown }>(
      `select insurance_fields from document_recognition where document_id = $1`,
      [documentId]
    );
    const raw = rows[0]?.insurance_fields;
    if (raw != null && typeof raw === "object" && "settlementOffer" in raw) {
      const v = (raw as { settlementOffer?: unknown }).settlementOffer;
      const amount = typeof v === "number" && Number.isFinite(v) ? v : null;
      if (amount != null && amount > 0) {
        createNotification(
          firmId,
          "settlement_offer_detected",
          "Settlement offer detected",
          `A document routed to this case contains a settlement offer of $${Number(amount).toLocaleString()}.`,
          { caseId: toCaseId, documentId, amount }
        ).catch((e) => console.warn("[notifications] settlement_offer_detected failed", e));
      }
    }
  }

  emitWebhookEvent(firmId, "document.routed", {
    documentId,
    caseId: toCaseId ?? undefined,
    fromCaseId: doc.routedCaseId ?? undefined,
    actor,
    action,
  }).catch((e) => console.warn("[webhooks] document.routed emit failed", e));

  return { ok: true };
}
