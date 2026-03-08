"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.addDocumentAuditEvent = addDocumentAuditEvent;
/**
 * Audit helpers for document and job events. Used by workers and API.
 */
const client_1 = require("@prisma/client");
const prisma_1 = require("../db/prisma");
async function addDocumentAuditEvent(input) {
    const { firmId, documentId, actor, action, fromCaseId, toCaseId, metaJson } = input;
    try {
        await prisma_1.prisma.documentAuditEvent.create({
            data: {
                firmId,
                documentId,
                actor,
                action,
                fromCaseId: fromCaseId ?? null,
                toCaseId: toCaseId ?? null,
                metaJson: metaJson != null ? metaJson : client_1.Prisma.JsonNull,
            },
        });
    }
    catch (err) {
        console.error("[audit] failed to insert audit event", { err, firmId, documentId, action });
    }
}
