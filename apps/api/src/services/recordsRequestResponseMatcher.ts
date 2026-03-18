/**
 * When returned documents arrive (email ingestion or upload), attempt to match
 * them to an open RecordsRequest by firmId, providerId, caseId, patient name, refs.
 * If matched: attach as RESPONSE_DOC, create RESPONSE_RECEIVED event, optionally set RECEIVED.
 * Does not change existing recognition pipeline; add hooks where documents are created/routed.
 */
import { prisma } from "../db/prisma";
import { buildFirmWhere } from "../lib/tenant";
import { normalizeRecordsRequestStatus } from "./recordsRequestStatus";

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
  | { matched: true; recordsRequestId: string; attached: boolean }
  | { matched: false; reason?: string };

/**
 * Try to find an open RecordsRequest for this firm/case/provider/patient and attach the document.
 * Call after a document is created and optionally routed to a case (e.g. from email ingestion).
 */
export async function tryMatchDocumentToRecordsRequest(
  input: MatchDocumentToRecordsRequestInput
): Promise<MatchDocumentToRecordsRequestResult> {
  const { firmId, documentId, caseId, providerId, patientName, referenceTokens = [] } = input;

  const doc = await prisma.document.findFirst({
    where: buildFirmWhere(firmId, { id: documentId }),
  });
  if (!doc) return { matched: false, reason: "Document not found" };

  const openStatuses = new Set(["SENT", "FOLLOW_UP_DUE", "RECEIVED"]);
  const where: Record<string, unknown> = buildFirmWhere(firmId);
  if (caseId) where.caseId = caseId;
  if (providerId) where.providerId = providerId;

  const candidates = await prisma.recordsRequest.findMany({
    where,
    orderBy: { sentAt: "desc" },
    take: 20,
  });

  const normalizedTokens = referenceTokens
    .flatMap((token) => tokenize(token))
    .filter((token, index, list) => token.length >= 3 && list.indexOf(token) === index);

  let best: (typeof candidates)[0] | null = null;
  let bestScore = -1;
  for (const req of candidates) {
    const status = normalizeRecordsRequestStatus(req.status);
    if (!openStatuses.has(status)) continue;
    if (caseId && req.caseId !== caseId) continue;
    if (providerId && req.providerId !== providerId) continue;

    let score = 0;
    if (caseId && req.caseId === caseId) score += 100;
    if (providerId && req.providerId === providerId) score += 100;
    if (patientName && req.patientName) {
      const a = normalizeName(patientName);
      const b = normalizeName(req.patientName);
      if (a && b && !a.includes(b) && !b.includes(a)) continue;
      if (a && b) score += 25;
    }
    if (normalizedTokens.length > 0) {
      const haystack = [
        req.providerName,
        req.providerContact,
        req.subject,
        req.messageBody,
        req.patientName,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      const tokenMatches = normalizedTokens.filter((token) => haystack.includes(token)).length;
      score += tokenMatches * 10;
    }
    if (!caseId && !providerId && score <= 0) continue;
    if (score > bestScore) {
      bestScore = score;
      best = req;
    }
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
  const receivedAt = new Date();
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
    data: {
      status: "RECEIVED",
      responseDate: best.responseDate ?? receivedAt,
      completedAt: best.completedAt ?? receivedAt,
    },
  });

  return { matched: true, recordsRequestId: best.id, attached: true };
}

function normalizeName(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((token) => token.trim())
    .filter(Boolean);
}
