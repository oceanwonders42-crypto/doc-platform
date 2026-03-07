"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.routeDocument = routeDocument;
/**
 * Shared document routing logic: update document, audit event, rebuild timeline.
 * Used by POST /documents/:id/route and by the worker for auto-route.
 */
const prisma_1 = require("../db/prisma");
const pg_1 = require("../db/pg");
const client_1 = require("@prisma/client");
const caseTimeline_1 = require("./caseTimeline");
const notifications_1 = require("./notifications");
const webhooks_1 = require("./webhooks");
const reviewQueueEvent_1 = require("./reviewQueueEvent");
async function routeDocument(firmId, documentId, toCaseId, options) {
    const { actor, action, routedSystem, routingStatus, metaJson } = options;
    const doc = await prisma_1.prisma.document.findFirst({
        where: { id: documentId, firmId },
        select: { id: true, routedCaseId: true },
    });
    if (!doc)
        return { ok: false, error: "document not found" };
    const updateData = {
        routedCaseId: toCaseId ?? null,
    };
    if (routedSystem !== undefined)
        updateData.routedSystem = routedSystem;
    if (routingStatus !== undefined)
        updateData.routingStatus = routingStatus;
    if (toCaseId) {
        updateData.status = "UPLOADED";
    }
    await prisma_1.prisma.document.update({
        where: { id: documentId },
        data: updateData,
    });
    if (toCaseId) {
        await (0, reviewQueueEvent_1.recordReviewQueueExit)(firmId, documentId, "routed");
    }
    await prisma_1.prisma.documentAuditEvent.create({
        data: {
            firmId,
            documentId,
            actor,
            action,
            fromCaseId: doc.routedCaseId ?? null,
            toCaseId: toCaseId ?? null,
            metaJson: metaJson != null ? JSON.parse(JSON.stringify(metaJson)) : client_1.Prisma.JsonNull,
        },
    });
    if (toCaseId) {
        try {
            await (0, caseTimeline_1.rebuildCaseTimeline)(toCaseId, firmId);
        }
        catch (e) {
            console.error("[documentRouting] rebuildCaseTimeline failed", { caseId: toCaseId, err: e });
        }
        const { rows } = await pg_1.pgPool.query(`select insurance_fields from document_recognition where document_id = $1`, [documentId]);
        const raw = rows[0]?.insurance_fields;
        if (raw != null && typeof raw === "object" && "settlementOffer" in raw) {
            const v = raw.settlementOffer;
            const amount = typeof v === "number" && Number.isFinite(v) ? v : null;
            if (amount != null && amount > 0) {
                (0, notifications_1.createNotification)(firmId, "settlement_offer_detected", "Settlement offer detected", `A document routed to this case contains a settlement offer of $${Number(amount).toLocaleString()}.`, { caseId: toCaseId, documentId, amount }).catch((e) => console.warn("[notifications] settlement_offer_detected failed", e));
            }
        }
    }
    (0, webhooks_1.emitWebhookEvent)(firmId, "document.routed", {
        documentId,
        caseId: toCaseId ?? undefined,
        fromCaseId: doc.routedCaseId ?? undefined,
        actor,
        action,
    }).catch((e) => console.warn("[webhooks] document.routed emit failed", e));
    return { ok: true };
}
