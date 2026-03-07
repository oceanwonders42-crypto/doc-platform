"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * DB-backed job queue worker: poll Job table, claim atomically, run handler, handle success/failure with retries.
 * Run as a separate process: npx ts-node src/workers/jobQueueWorker.ts
 */
require("dotenv/config");
const jobQueue_1 = require("../services/jobQueue");
const jobHandlers_1 = require("./jobHandlers");
const errorLog_1 = require("../services/errorLog");
const notifications_1 = require("../services/notifications");
const WORKER_ID = process.env.JOB_WORKER_ID || `worker-${process.pid}-${Date.now()}`;
const POLL_MS = Number(process.env.JOB_POLL_MS) || 2000;
const USER_VISIBLE_JOB_TYPES = new Set([
    "document.reprocess",
    "demand_package.generate",
    "records_request.send",
    "export.packet",
    "timeline.rebuild",
]);
async function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}
async function runOne() {
    const job = await (0, jobQueue_1.claimNextJob)(WORKER_ID);
    if (!job)
        return false;
    const { id: jobId, type, payload, firmId, attempts, maxAttempts } = job;
    const addEvent = async (level, message, meta) => {
        await (0, jobQueue_1.addJobEvent)(jobId, level, message, meta);
    };
    const handler = (0, jobHandlers_1.getJobHandler)(type);
    if (!handler) {
        await addEvent("error", `Unknown job type: ${type}`);
        await (0, jobQueue_1.failJob)(jobId, `Unknown job type: ${type}`);
        return true;
    }
    try {
        await addEvent("info", "Job started");
        await handler(payload, {
            jobId,
            firmId,
            addEvent,
        });
        await (0, jobQueue_1.completeJob)(jobId, { completedAt: new Date().toISOString() });
        await addEvent("info", "Job completed");
        return true;
    }
    catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        const errStack = err instanceof Error ? err.stack : undefined;
        await addEvent("error", errMsg, { stack: errStack });
        if (attempts < maxAttempts) {
            await (0, jobQueue_1.rescheduleJobForRetry)(jobId, attempts);
            await addEvent("info", `Scheduled retry ${attempts}/${maxAttempts}`);
        }
        else {
            await (0, jobQueue_1.failJob)(jobId, errMsg);
            await (0, errorLog_1.logSystemError)("job-worker", errMsg, errStack, {
                area: type,
                firmId: firmId ?? undefined,
                metaJson: { jobId, type, attempts, maxAttempts },
            }).catch(() => { });
            if (firmId && USER_VISIBLE_JOB_TYPES.has(type)) {
                (0, notifications_1.createNotification)(firmId, "job_failed", "Background job failed", `Job ${type} failed after ${maxAttempts} attempts: ${errMsg.slice(0, 200)}`, { jobId, type, error: errMsg }).catch(() => { });
            }
        }
    }
    return true;
}
async function run() {
    console.log("[job-queue-worker] started", { workerId: WORKER_ID, pollMs: POLL_MS });
    while (true) {
        try {
            const didWork = await runOne();
            if (!didWork)
                await sleep(POLL_MS);
        }
        catch (e) {
            console.error("[job-queue-worker] iteration error", e);
            await sleep(POLL_MS);
        }
    }
}
run().catch((e) => {
    console.error(e);
    process.exit(1);
});
