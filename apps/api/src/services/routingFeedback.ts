/**
 * Record routing feedback when a user corrects or accepts routing.
 * Used by POST /documents/:id/routing-feedback and when routing/approving/rejecting.
 */
import { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma";
import { pgPool } from "../db/pg";
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

type RoutingFeedbackContext = {
  predicted: {
    caseId?: string | null;
    status?: string | null;
    docType?: string | null;
    confidence?: number | null;
  };
  features: RoutingFeedbackFeatures | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value == null || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function readString(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  return null;
}

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

export async function loadRoutingFeedbackContext(
  firmId: string,
  documentId: string
): Promise<RoutingFeedbackContext | null> {
  const document = await prisma.document.findFirst({
    where: { id: documentId, firmId },
    select: {
      originalName: true,
      source: true,
      status: true,
      routedCaseId: true,
      extractedFields: true,
    },
  });
  if (!document) return null;

  const { rows } = await pgPool.query<{
    case_number: string | null;
    client_name: string | null;
    doc_type: string | null;
    provider_name: string | null;
    match_confidence: number | null;
    suggested_case_id: string | null;
  }>(
    `
    select case_number, client_name, doc_type, provider_name, match_confidence, suggested_case_id
    from document_recognition
    where document_id = $1
    `,
    [documentId]
  );

  const recognition = rows[0];
  const extractedFields = asRecord(document.extractedFields);
  const medicalRecord = asRecord(extractedFields?.medicalRecord);

  return {
    predicted: {
      caseId: document.routedCaseId ?? recognition?.suggested_case_id ?? null,
      status: document.status ?? null,
      docType:
        recognition?.doc_type ??
        readString(extractedFields?.docType) ??
        readString(extractedFields?.documentType) ??
        null,
      confidence:
        typeof recognition?.match_confidence === "number"
          ? recognition.match_confidence
          : null,
    },
    features: {
      caseNumber:
        recognition?.case_number ??
        readString(extractedFields?.caseNumber) ??
        readString(extractedFields?.claimNumber) ??
        null,
      clientName:
        recognition?.client_name ??
        readString(extractedFields?.clientName) ??
        readString(extractedFields?.patientName) ??
        null,
      docType:
        recognition?.doc_type ??
        readString(extractedFields?.docType) ??
        readString(extractedFields?.documentType) ??
        null,
      fileName: document.originalName ?? null,
      source: document.source ?? null,
      providerName:
        recognition?.provider_name ??
        readString(extractedFields?.providerName) ??
        readString(extractedFields?.provider) ??
        readString(extractedFields?.facility) ??
        readString(medicalRecord?.provider) ??
        readString(medicalRecord?.facility) ??
        null,
    },
  };
}

export async function recordRoutingFeedbackForDocumentAction(input: {
  firmId: string;
  documentId: string;
  finalCaseId?: string | null;
  finalStatus?: string | null;
  finalDocType?: string | null;
  correctedBy?: string | null;
}): Promise<void> {
  const context = await loadRoutingFeedbackContext(input.firmId, input.documentId);
  if (!context) return;

  await recordRoutingFeedback(
    {
      ...input,
      finalDocType: input.finalDocType ?? context.predicted.docType ?? null,
    },
    context.predicted,
    context.features
  );
}
