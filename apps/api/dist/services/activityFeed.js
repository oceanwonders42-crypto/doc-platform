"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createActivityFeedItem = createActivityFeedItem;
exports.logActivity = logActivity;
/**
 * Creates activity feed items for CRM-style activity feed.
 */
const prisma_1 = require("../db/prisma");
async function createActivityFeedItem(input) {
    await prisma_1.prisma.activityFeedItem.create({
        data: {
            firmId: input.firmId,
            caseId: input.caseId ?? undefined,
            providerId: input.providerId ?? undefined,
            documentId: input.documentId ?? undefined,
            type: input.type,
            title: input.title,
            meta: input.meta ?? undefined,
        },
    });
}
/** Fire-and-forget: log activity without awaiting. */
function logActivity(input) {
    createActivityFeedItem(input).catch((e) => console.warn("[activity-feed] create failed", e));
}
