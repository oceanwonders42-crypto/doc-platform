"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.tryMatchDocumentToRecordsRequest = tryMatchDocumentToRecordsRequest;
/**
 * When returned documents arrive (email ingestion or upload), attempt to match
 * them to an open RecordsRequest by firmId, providerId, caseId, patient name, refs.
 * If matched: attach as RESPONSE_DOC, create RESPONSE_RECEIVED event, optionally set RECEIVED.
 * Does not change existing recognition pipeline; add hooks where documents are created/routed.
 */
const prisma_1 = require("../db/prisma");
const tenant_1 = require("../lib/tenant");
/**
 * Try to find an open RecordsRequest for this firm/case/provider/patient and attach the document.
 * Call after a document is created and optionally routed to a case (e.g. from email ingestion).
 */
async function tryMatchDocumentToRecordsRequest(input) {
    const { firmId, documentId, caseId, providerId, patientName } = input;
    const doc = await prisma_1.prisma.document.findFirst({
        where: (0, tenant_1.buildFirmWhere)(firmId, { id: documentId }),
    });
    if (!doc)
        return { matched: false, reason: "Document not found" };
    if (!caseId && !providerId)
        return { matched: false, reason: "caseId or providerId required to match" };
    const openStatuses = ["SENT", "FOLLOW_UP_DUE", "RECEIVED"];
    const where = {
        ...(0, tenant_1.buildFirmWhere)(firmId),
        status: { in: openStatuses },
    };
    if (caseId)
        where.caseId = caseId;
    if (providerId)
        where.providerId = providerId;
    const candidates = await prisma_1.prisma.recordsRequest.findMany({
        where,
        orderBy: { sentAt: "desc" },
        take: 20,
    });
    let best = null;
    for (const req of candidates) {
        if (caseId && req.caseId !== caseId)
            continue;
        if (providerId && req.providerId !== providerId)
            continue;
        if (patientName && req.patientName) {
            const a = normalizeName(patientName);
            const b = normalizeName(req.patientName);
            if (a && b && !a.includes(b) && !b.includes(a))
                continue;
        }
        best = req;
        break;
    }
    if (!best)
        return { matched: false, reason: "No matching open request" };
    const existing = await prisma_1.prisma.recordsRequestAttachment.findFirst({
        where: {
            firmId,
            recordsRequestId: best.id,
            documentId,
            kind: "RESPONSE_DOC",
        },
    });
    if (existing)
        return { matched: true, recordsRequestId: best.id, attached: false };
    await prisma_1.prisma.recordsRequestAttachment.create({
        data: {
            firmId,
            recordsRequestId: best.id,
            documentId,
            kind: "RESPONSE_DOC",
        },
    });
    await prisma_1.prisma.recordsRequestEvent.create({
        data: {
            firmId,
            recordsRequestId: best.id,
            eventType: "RESPONSE_RECEIVED",
            status: "RECEIVED",
            message: "Response document attached",
            metaJson: { documentId },
        },
    });
    await prisma_1.prisma.recordsRequest.update({
        where: { id: best.id },
        data: { status: "RECEIVED" },
    });
    return { matched: true, recordsRequestId: best.id, attached: true };
}
function normalizeName(s) {
    return s
        .trim()
        .toLowerCase()
        .replace(/\s+/g, " ");
}
