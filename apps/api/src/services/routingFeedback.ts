/**
 * Record routing feedback when a user corrects or accepts routing.
 * Used by POST /documents/:id/routing-feedback and when routing/approving/rejecting.
 */
import { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma";
import { addDocumentAuditEvent } from "./audit";

export type RoutingFeedbackInput = {
  firmId: string;
  documentId: string;
  finalCaseId?: string | null;
  finalStatus?: string | null;
  finalDocType?: string | null;
  correctedBy?: string | null;
};

export type RoutingFeedbackFeatures = {
  caseNumber?: string | null;
  clientName?: string | null;
  docType?: string | null;
  fileName?: string | null;
  source?: string | null;
  providerName?: string | null;
};

/** Create a RoutingFeedback row comparing predicted vs final; store features when it was a correction. */
export async function recordRoutingFeedback(
  input: RoutingFeedbackInput,
  predicted: {
    caseId?: string | null;
    status?: string | null;
    docType?: string | null;
    confidence?: number | null;
  },
  features: RoutingFeedbackFeatures | null
): Promise<void> {
  const { firmId, documentId, finalCaseId, finalStatus, finalDocType, correctedBy } = input;
  const predictedCaseId = predicted.caseId ?? null;
  const finalCase = finalCaseId ?? null;
  const predictedStatus = predicted.status ?? null;
  const finalStat = finalStatus ?? null;
  const predictedDocType = predicted.docType ?? null;
  const finalDoc = finalDocType ?? null;
  const wasAccepted =
    predictedCaseId === finalCase && predictedStatus === finalStat && predictedDocType === finalDoc;

  await prisma.routingFeedback.create({
    data: {
      firmId,
      documentId,
      predictedCaseId,
      finalCaseId: finalCase,
      predictedStatus,
      finalStatus: finalStat,
      predictedDocType,
      finalDocType: finalDoc,
      confidence: predicted.confidence ?? null,
      correctedBy: correctedBy ?? null,
      wasAccepted,
      featuresJson: features != null ? (features as Prisma.InputJsonValue) : Prisma.JsonNull,
    },
  });

  await addDocumentAuditEvent({
    firmId,
    documentId,
    actor: correctedBy ?? "system",
    action: "routing_feedback",
    fromCaseId: predictedCaseId,
    toCaseId: finalCase,
    metaJson: { wasAccepted, finalStatus: finalStat, finalDocType: finalDoc },
  });
}
