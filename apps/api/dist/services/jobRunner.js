"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.enqueueJob = enqueueJob;
exports.runNextJob = runNextJob;
exports.runJobLoop = runJobLoop;
/**
 * Robust job runner: processes Job table with exponential backoff.
 * Enqueue via enqueueJob(); run jobQueueWorker to process (or use runNextJob for legacy loop).
 */
const prisma_1 = require("../db/prisma");
async function enqueueJob(firmId, type, payload, opts) {
    const job = await prisma_1.prisma.job.create({
        data: {
            firmId,
            type,
            payload: (payload != null ? JSON.parse(JSON.stringify(payload)) : {}),
            priority: opts?.priority ?? 100,
            runAt: opts?.runAt ?? new Date(),
            maxAttempts: opts?.maxAttempts ?? 5,
        },
    });
    return job.id;
}
const MAX_ATTEMPTS = 5;
const BASE_DELAY_MS = 60_000; // 1 minute
const handlers = {};
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
        orderBy: [{ priority: "asc" }, { runAt: "asc" }],
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
        data: {
            status: "running",
            attempts: job.attempts + 1,
            lockedAt: now,
            lockedBy: "jobRunner",
            updatedAt: new Date(),
        },
    });
    try {
        await handler(job.firmId, job.payload);
        await prisma_1.prisma.job.update({
            where: { id: job.id },
            data: {
                status: "done",
                lastError: null,
                finishedAt: new Date(),
                lockedAt: null,
                lockedBy: null,
                updatedAt: new Date(),
            },
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
                    finishedAt: new Date(),
                    lockedAt: null,
                    lockedBy: null,
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
                    lockedAt: null,
                    lockedBy: null,
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
