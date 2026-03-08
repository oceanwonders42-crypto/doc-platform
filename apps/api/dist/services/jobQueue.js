"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.enqueueJob = enqueueJob;
exports.claimNextJob = claimNextJob;
exports.completeJob = completeJob;
exports.failJob = failJob;
exports.rescheduleJobForRetry = rescheduleJobForRetry;
exports.addJobEvent = addJobEvent;
exports.getJobWithEvents = getJobWithEvents;
exports.listJobs = listJobs;
exports.retryJob = retryJob;
exports.cancelJob = cancelJob;
exports.getJobCounts = getJobCounts;
/**
 * DB-backed job queue: enqueue, claim, complete, fail, retry, cancel.
 * Used by API to create jobs and by the job worker to process them.
 */
const prisma_1 = require("../db/prisma");
const STALE_LOCK_MINUTES = 15;
async function enqueueJob(input) {
    const { firmId = null, type, payload, priority = 100, runAt = new Date(), maxAttempts = 5, } = input;
    const job = await prisma_1.prisma.job.create({
        data: {
            firmId,
            type,
            payload: payload,
            status: "queued",
            priority,
            runAt,
            maxAttempts,
        },
    });
    return job;
}
/**
 * Claim the next available job (queued or stale running).
 * Returns null if none available.
 */
async function claimNextJob(workerId) {
    const now = new Date();
    const staleCutoff = new Date(now.getTime() - STALE_LOCK_MINUTES * 60 * 1000);
    // Find one queued job or stale running job, ordered by priority asc (lower = first), then runAt asc
    const candidates = await prisma_1.prisma.job.findMany({
        where: {
            OR: [
                { status: "queued", runAt: { lte: now } },
                { status: "running", lockedAt: { lt: staleCutoff } },
            ],
        },
        orderBy: [{ priority: "asc" }, { runAt: "asc" }],
        take: 1,
        select: { id: true, type: true, payload: true, firmId: true, attempts: true, maxAttempts: true },
    });
    const candidate = candidates[0];
    if (!candidate)
        return null;
    const updated = await prisma_1.prisma.job.updateMany({
        where: {
            id: candidate.id,
            OR: [
                { status: "queued", runAt: { lte: now } },
                { status: "running", lockedAt: { lt: staleCutoff } },
            ],
        },
        data: {
            status: "running",
            lockedAt: now,
            lockedBy: workerId,
            attempts: { increment: 1 },
        },
    });
    if (updated.count === 0)
        return null;
    return {
        id: candidate.id,
        type: candidate.type,
        payload: candidate.payload,
        firmId: candidate.firmId,
        attempts: candidate.attempts + 1,
        maxAttempts: candidate.maxAttempts,
    };
}
async function completeJob(jobId, resultMeta) {
    await prisma_1.prisma.job.update({
        where: { id: jobId },
        data: {
            status: "done",
            finishedAt: new Date(),
            resultMeta: resultMeta,
            lockedAt: null,
            lockedBy: null,
        },
    });
}
async function failJob(jobId, lastError, status = "failed") {
    await prisma_1.prisma.job.update({
        where: { id: jobId },
        data: {
            status: status,
            lastError,
            finishedAt: new Date(),
            lockedAt: null,
            lockedBy: null,
        },
    });
}
/**
 * Reschedule a failed job for retry with exponential backoff.
 */
async function rescheduleJobForRetry(jobId, attempts) {
    const delayMs = Math.min(60_000 * Math.pow(2, attempts - 1), 3600_000);
    const runAt = new Date(Date.now() + delayMs);
    await prisma_1.prisma.job.update({
        where: { id: jobId },
        data: {
            status: "queued",
            runAt,
            lockedAt: null,
            lockedBy: null,
        },
    });
}
async function addJobEvent(jobId, level, message, meta) {
    await prisma_1.prisma.jobEvent.create({
        data: {
            jobId,
            level,
            message,
            meta: meta ? meta : undefined,
        },
    });
}
async function getJobWithEvents(jobId) {
    return prisma_1.prisma.job.findUnique({
        where: { id: jobId },
        include: {
            events: { orderBy: { createdAt: "asc" } },
            firm: { select: { id: true, name: true } },
        },
    });
}
async function listJobs(filters) {
    const { status, type, firmId, onlyFailed, limit = 50, cursor } = filters;
    const where = {};
    if (status)
        where.status = status;
    if (type)
        where.type = type;
    if (firmId)
        where.firmId = firmId;
    if (onlyFailed)
        where.status = "failed";
    const items = await prisma_1.prisma.job.findMany({
        where,
        orderBy: [{ updatedAt: "desc" }],
        take: limit + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        include: { firm: { select: { id: true, name: true } } },
    });
    const nextCursor = items.length > limit ? items[limit - 1]?.id : null;
    const list = items.length > limit ? items.slice(0, limit) : items;
    return { items: list, nextCursor };
}
/**
 * Set failed job back to queued for retry (attempts preserved or reset per policy).
 */
async function retryJob(jobId) {
    const job = await prisma_1.prisma.job.findUnique({
        where: { id: jobId },
        select: { id: true, status: true, attempts: true, maxAttempts: true },
    });
    if (!job)
        return { ok: false, error: "Job not found" };
    if (job.status !== "failed")
        return { ok: false, error: "Only failed jobs can be retried" };
    await prisma_1.prisma.job.update({
        where: { id: jobId },
        data: {
            status: "queued",
            runAt: new Date(),
            lastError: null,
            lockedAt: null,
            lockedBy: null,
        },
    });
    return { ok: true };
}
/**
 * Cancel a queued job.
 */
async function cancelJob(jobId) {
    const job = await prisma_1.prisma.job.findUnique({
        where: { id: jobId },
        select: { status: true },
    });
    if (!job)
        return { ok: false, error: "Job not found" };
    if (job.status !== "queued")
        return { ok: false, error: "Only queued jobs can be cancelled" };
    await prisma_1.prisma.job.update({
        where: { id: jobId },
        data: { status: "cancelled" },
    });
    return { ok: true };
}
/**
 * Counts for dashboard: queued, running, failed, and retry backlog (queued with attempts > 0).
 */
async function getJobCounts(firmId) {
    const where = firmId ? { firmId } : {};
    const [queued, running, failed, retryBacklog] = await Promise.all([
        prisma_1.prisma.job.count({ where: { ...where, status: "queued" } }),
        prisma_1.prisma.job.count({ where: { ...where, status: "running" } }),
        prisma_1.prisma.job.count({ where: { ...where, status: "failed" } }),
        prisma_1.prisma.job.count({ where: { ...where, status: "queued", attempts: { gt: 0 } } }),
    ]);
    return { queued, running, failed, retryBacklog };
}
