"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.enqueueJob = enqueueJob;
exports.registerJobHandler = registerJobHandler;
exports.runNextJob = runNextJob;
exports.runJobLoop = runJobLoop;
/**
 * Robust job runner: processes Job table with exponential backoff.
 * Permanently failing jobs (max attempts exceeded) are marked failed with lastError.
 */
const prisma_1 = require("../db/prisma");
const retentionCleanup_1 = require("./retentionCleanup");
const overdueTaskReminders_1 = require("./overdueTaskReminders");
const webhooks_1 = require("./webhooks");
async function enqueueJob(firmId, type, payload) {
    const job = await prisma_1.prisma.job.create({
        data: {
            firmId,
            type,
            payload: payload ? JSON.parse(JSON.stringify(payload)) : undefined,
        },
    });
    return job.id;
}
const MAX_ATTEMPTS = 5;
const BASE_DELAY_MS = 60_000; // 1 minute
const handlers = {
    retention_cleanup: async () => {
        await (0, retentionCleanup_1.runRetentionCleanup)();
    },
    overdue_task_reminders: async () => {
        await (0, overdueTaskReminders_1.runOverdueTaskReminders)();
    },
    webhook_delivery: async (_firmId, p) => {
        const payload = p;
        if (!payload?.url || !payload?.secret || !payload?.event) {
            throw new Error("Invalid webhook_delivery payload");
        }
        await (0, webhooks_1.deliverWebhook)(payload);
    },
};
function registerJobHandler(type, handler) {
    handlers[type] = handler;
}
function getBackoffDelayMs(attempts) {
    return BASE_DELAY_MS * Math.pow(2, attempts);
}
async function runNextJob() {
    const now = new Date();
    const job = await prisma_1.prisma.job.findFirst({
        where: {
            status: "queued",
            runAt: { lte: now },
            attempts: { lt: MAX_ATTEMPTS },
        },
        orderBy: { runAt: "asc" },
    });
    if (!job)
        return false;
    const handler = handlers[job.type];
    if (!handler) {
        await prisma_1.prisma.job.update({
            where: { id: job.id },
            data: {
                status: "failed",
                lastError: `No handler for job type: ${job.type}`,
                attempts: job.attempts + 1,
                updatedAt: new Date(),
            },
        });
        return true;
    }
    await prisma_1.prisma.job.update({
        where: { id: job.id },
        data: { status: "running", attempts: job.attempts + 1, updatedAt: new Date() },
    });
    try {
        const firmId = job.firmId;
        if (!firmId)
            throw new Error("Job missing firmId");
        await handler(firmId, job.payload);
        await prisma_1.prisma.job.update({
            where: { id: job.id },
            data: { status: "done", lastError: null, updatedAt: new Date() },
        });
    }
    catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        const errStack = err instanceof Error ? err.stack : undefined;
        const lastError = errStack ? `${errMsg}\n${errStack}` : errMsg;
        if (job.attempts + 1 >= MAX_ATTEMPTS) {
            await prisma_1.prisma.job.update({
                where: { id: job.id },
                data: {
                    status: "failed",
                    lastError,
                    updatedAt: new Date(),
                },
            });
        }
        else {
            const delayMs = getBackoffDelayMs(job.attempts + 1);
            const runAt = new Date(Date.now() + delayMs);
            await prisma_1.prisma.job.update({
                where: { id: job.id },
                data: {
                    status: "queued",
                    lastError,
                    runAt,
                    updatedAt: new Date(),
                },
            });
        }
    }
    return true;
}
async function runJobLoop(pollIntervalMs = 2000) {
    // eslint-disable-next-line no-constant-condition
    while (true) {
        const didWork = await runNextJob();
        if (!didWork) {
            await new Promise((r) => setTimeout(r, pollIntervalMs));
        }
    }
}
