"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.recordRoutingFeedback = recordRoutingFeedback;
/**
 * Record routing feedback when a user corrects or accepts routing.
 * Used by POST /documents/:id/routing-feedback and when routing/approving/rejecting.
 */
const client_1 = require("@prisma/client");
const prisma_1 = require("../db/prisma");
const audit_1 = require("./audit");
/** Create a RoutingFeedback row comparing predicted vs final; store features when it was a correction. */
async function recordRoutingFeedback(input, predicted, features) {
    const { firmId, documentId, finalCaseId, finalStatus, finalDocType, correctedBy } = input;
    const predictedCaseId = predicted.caseId ?? null;
    const finalCase = finalCaseId ?? null;
    const predictedStatus = predicted.status ?? null;
    const finalStat = finalStatus ?? null;
    const predictedDocType = predicted.docType ?? null;
    const finalDoc = finalDocType ?? null;
    const wasAccepted = predictedCaseId === finalCase && predictedStatus === finalStat && predictedDocType === finalDoc;
    await prisma_1.prisma.routingFeedback.create({
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
            featuresJson: features != null ? features : client_1.Prisma.JsonNull,
        },
    });
    await (0, audit_1.addDocumentAuditEvent)({
        firmId,
        documentId,
        actor: correctedBy ?? "system",
        action: "routing_feedback",
        fromCaseId: predictedCaseId,
        toCaseId: finalCase,
        metaJson: { wasAccepted, finalStatus: finalStat, finalDocType: finalDoc },
    });
}
