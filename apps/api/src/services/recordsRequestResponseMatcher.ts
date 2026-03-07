/**
 * When returned documents arrive (email ingestion or upload), attempt to match
 * them to an open RecordsRequest by firmId, providerId, caseId, patient name, refs.
 * If matched: attach as RESPONSE_DOC, create RESPONSE_RECEIVED event, optionally set RECEIVED.
 * Does not change existing recognition pipeline; add hooks where documents are created/routed.
 */
import { prisma } from "../db/prisma";
import { buildFirmWhere } from "../lib/tenant";

export type MatchDocumentToRecordsRequestInput = {
  firmId: string;
  documentId: string;
  /** Optional: case already routed for this document */
  caseId?: string | null;
  /** Optional: provider id if known from document/source */
  providerId?: string | null;
  /** Optional: patient/client name if extracted */
  patientName?: string | null;
  /** Optional: reference tokens from subject/body (e.g. "records request", case number) */
  referenceTokens?: string[];
};

export type MatchDocumentToRecordsRequestResult =
  | { matched: true; recordsRequestId: string; attached: true }
  | { matched: false; reason?: string };

/**
 * Try to find an open RecordsRequest for this firm/case/provider/patient and attach the document.
 * Call after a document is created and optionally routed to a case (e.g. from email ingestion).
 */
export async function tryMatchDocumentToRecordsRequest(
  input: MatchDocumentToRecordsRequestInput
): Promise<MatchDocumentToRecordsRequestResult> {
  const { firmId, documentId, caseId, providerId, patientName } = input;

  const doc = await prisma.document.findFirst({
    where: buildFirmWhere(firmId, { id: documentId }),
  });
  if (!doc) return { matched: false, reason: "Document not found" };

  if (!caseId && !providerId) return { matched: false, reason: "caseId or providerId required to match" };

  const openStatuses = ["SENT", "FOLLOW_UP_DUE", "RECEIVED"];
  const where: Record<string, unknown> = {
    ...buildFirmWhere(firmId),
    status: { in: openStatuses },
  };
  if (caseId) where.caseId = caseId;
  if (providerId) where.providerId = providerId;

  const candidates = await prisma.recordsRequest.findMany({
    where,
    orderBy: { sentAt: "desc" },
    take: 20,
  });

  let best: (typeof candidates)[0] | null = null;
  for (const req of candidates) {
    if (caseId && req.caseId !== caseId) continue;
    if (providerId && req.providerId !== providerId) continue;
    if (patientName && req.patientName) {
      const a = normalizeName(patientName);
      const b = normalizeName(req.patientName);
      if (a && b && !a.includes(b) && !b.includes(a)) continue;
    }
    best = req;
    break;
  }
  if (!best) return { matched: false, reason: "No matching open request" };

  const existing = await prisma.recordsRequestAttachment.findFirst({
    where: {
      firmId,
      recordsRequestId: best.id,
      documentId,
      kind: "RESPONSE_DOC",
    },
  });
  if (existing) return { matched: true, recordsRequestId: best.id, attached: false };

  await prisma.recordsRequestAttachment.create({
    data: {
      firmId,
      recordsRequestId: best.id,
      documentId,
      kind: "RESPONSE_DOC",
    },
  });
  await prisma.recordsRequestEvent.create({
    data: {
      firmId,
      recordsRequestId: best.id,
      eventType: "RESPONSE_RECEIVED",
      status: "RECEIVED",
      message: "Response document attached",
      metaJson: { documentId },
    },
  });
  await prisma.recordsRequest.update({
    where: { id: best.id },
    data: { status: "RECEIVED" },
  });

  return { matched: true, recordsRequestId: best.id, attached: true };
}

function normalizeName(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}
