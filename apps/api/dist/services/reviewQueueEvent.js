"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.recordReviewQueueEnter = recordReviewQueueEnter;
exports.recordReviewQueueExit = recordReviewQueueExit;
const prisma_1 = require("../db/prisma");
/**
 * Record that a document entered the NEEDS_REVIEW queue.
 * Call when document status becomes NEEDS_REVIEW.
 */
async function recordReviewQueueEnter(firmId, documentId) {
    try {
        await prisma_1.prisma.reviewQueueEvent.create({
            data: {
                firmId,
                documentId,
                enteredAt: new Date(),
            },
        });
    }
    catch (e) {
        console.warn("[reviewQueue] recordReviewQueueEnter failed", e);
    }
}
/**
 * Close the most recent open review event for this document (exitedAt null).
 * Call when document leaves NEEDS_REVIEW (routed, rejected, etc.).
 */
async function recordReviewQueueExit(firmId, documentId, resolutionType) {
    try {
        const open = await prisma_1.prisma.reviewQueueEvent.findFirst({
            where: { firmId, documentId, exitedAt: null },
            orderBy: { enteredAt: "desc" },
            select: { id: true },
        });
        if (open) {
            await prisma_1.prisma.reviewQueueEvent.update({
                where: { id: open.id },
                data: { exitedAt: new Date(), resolutionType },
            });
        }
    }
    catch (e) {
        console.warn("[reviewQueue] recordReviewQueueExit failed", e);
    }
}
