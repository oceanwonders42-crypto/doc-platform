"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Records request follow-up worker.
 * Run periodically; find SENT requests past dueAt or follow-up threshold;
 * send follow-up email if rule enabled; increment follow-up count; log event;
 * stop after maxFollowUps; mark FAILED or leave FOLLOW_UP_DUE when exhausted.
 */
require("dotenv/config");
const prisma_1 = require("../db/prisma");
const tenant_1 = require("../lib/tenant");
const compositeAdapter_1 = require("../send/compositeAdapter");
const INTERVAL_MS = Number(process.env.RECORDS_REQUEST_FOLLOW_UP_INTERVAL_MS) || 60 * 60 * 1000; // 1 hour
async function runOnce() {
    const now = new Date();
    const rules = await prisma_1.prisma.recordsRequestFollowUpRule.findMany({
        where: { enabled: true },
    });
    for (const rule of rules) {
        const firmId = rule.firmId;
        const sentRequests = await prisma_1.prisma.recordsRequest.findMany({
            where: {
                ...(0, tenant_1.buildFirmWhere)(firmId),
                status: { in: ["SENT", "FOLLOW_UP_DUE"] },
                sentAt: { not: null },
            },
            take: 50,
        });
        for (const req of sentRequests) {
            const maxFollowUps = rule.maxFollowUps ?? 3;
            const count = req.followUpCount ?? 0;
            if (count >= maxFollowUps) {
                await prisma_1.prisma.recordsRequest.update({
                    where: { id: req.id },
                    data: { status: "FAILED" },
                });
                await prisma_1.prisma.recordsRequestEvent.create({
                    data: {
                        firmId,
                        recordsRequestId: req.id,
                        eventType: "FAILED",
                        status: req.status,
                        message: "Max follow-ups reached",
                        metaJson: { followUpCount: count, maxFollowUps },
                    },
                });
                continue;
            }
            const dest = (req.destinationValue ?? "").trim();
            if (!dest)
                continue;
            const daysSinceSend = req.sentAt
                ? Math.floor((now.getTime() - req.sentAt.getTime()) / (24 * 60 * 60 * 1000))
                : 0;
            if (daysSinceSend < rule.daysAfterSend)
                continue;
            const lastFollowUp = req.lastFollowUpAt;
            const daysSinceLastFollowUp = lastFollowUp
                ? Math.floor((now.getTime() - lastFollowUp.getTime()) / (24 * 60 * 60 * 1000))
                : daysSinceSend;
            if (lastFollowUp && daysSinceLastFollowUp < rule.daysAfterSend)
                continue;
            const subject = `Follow-up: ${req.subject ?? "Medical Records Request"}`;
            const body = rule.messageTemplate?.trim() ||
                req.messageBody ||
                "Please send the requested records at your earliest convenience. Thank you.";
            const result = await compositeAdapter_1.sendAdapter.sendEmail(dest, subject, body);
            const followUpCount = count + 1;
            await prisma_1.prisma.recordsRequest.update({
                where: { id: req.id },
                data: {
                    followUpCount,
                    lastFollowUpAt: now,
                    status: followUpCount >= maxFollowUps ? "FAILED" : "SENT",
                },
            });
            await prisma_1.prisma.recordsRequestEvent.create({
                data: {
                    firmId,
                    recordsRequestId: req.id,
                    eventType: result.ok ? "FOLLOW_UP_SENT" : "FAILED",
                    status: result.ok ? "SENT" : req.status,
                    message: result.ok ? "Follow-up sent" : (result.error ?? "Send failed"),
                    metaJson: { followUpCount, ok: result.ok },
                },
            });
        }
    }
}
async function run() {
    console.log("[records-request-follow-up] started", { intervalMs: INTERVAL_MS });
    try {
        await runOnce();
    }
    catch (e) {
        console.error("[records-request-follow-up] runOnce error", e);
    }
    setInterval(async () => {
        try {
            await runOnce();
        }
        catch (e) {
            console.error("[records-request-follow-up] runOnce error", e);
        }
    }, INTERVAL_MS);
}
run().catch((e) => {
    console.error(e);
    process.exit(1);
});
