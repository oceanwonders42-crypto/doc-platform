/**
 * DB-backed job queue: enqueue, claim, complete, fail, retry, cancel.
 * Used by API to create jobs and by the job worker to process them.
 */
import { prisma } from "../db/prisma";
import { JobStatus } from "@prisma/client";

const STALE_LOCK_MINUTES = 15;

export type EnqueueJobInput = {
  firmId?: string | null;
  type: string;
  payload: Record<string, unknown>;
  priority?: number;
  runAt?: Date;
  maxAttempts?: number;
};

export async function enqueueJob(input: EnqueueJobInput) {
  const {
    firmId = null,
    type,
    payload,
    priority = 100,
    runAt = new Date(),
    maxAttempts = 5,
  } = input;
  const job = await prisma.job.create({
    data: {
      firmId,
      type,
      payload: payload as object,
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
export async function claimNextJob(workerId: string): Promise<{ id: string; type: string; payload: any; firmId: string | null; attempts: number; maxAttempts: number } | null> {
  const now = new Date();
  const staleCutoff = new Date(now.getTime() - STALE_LOCK_MINUTES * 60 * 1000);

  // Find one queued job or stale running job, ordered by priority asc (lower = first), then runAt asc
  const candidates = await prisma.job.findMany({
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
  if (!candidate) return null;

  const updated = await prisma.job.updateMany({
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

  if (updated.count === 0) return null;

  return {
    id: candidate.id,
    type: candidate.type,
    payload: candidate.payload as Record<string, unknown>,
    firmId: candidate.firmId,
    attempts: candidate.attempts + 1,
    maxAttempts: candidate.maxAttempts,
  };
}

export async function completeJob(
  jobId: string,
  resultMeta: Record<string, unknown>
) {
  await prisma.job.update({
    where: { id: jobId },
    data: {
      status: "done",
      finishedAt: new Date(),
      resultMeta: resultMeta as object,
      lockedAt: null,
      lockedBy: null,
    },
  });
}

export async function failJob(
  jobId: string,
  lastError: string,
  status: "failed" = "failed"
) {
  await prisma.job.update({
    where: { id: jobId },
    data: {
      status: status as JobStatus,
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
export async function rescheduleJobForRetry(jobId: string, attempts: number) {
  const delayMs = Math.min(60_000 * Math.pow(2, attempts - 1), 3600_000);
  const runAt = new Date(Date.now() + delayMs);
  await prisma.job.update({
    where: { id: jobId },
    data: {
      status: "queued",
      runAt,
      lockedAt: null,
      lockedBy: null,
    },
  });
}

export async function addJobEvent(
  jobId: string,
  level: "info" | "warn" | "error",
  message: string,
  meta?: Record<string, unknown>
) {
  await prisma.jobEvent.create({
    data: {
      jobId,
      level,
      message,
      meta: meta ? (meta as object) : undefined,
    },
  });
}

export async function getJobWithEvents(jobId: string) {
  return prisma.job.findUnique({
    where: { id: jobId },
    include: {
      events: { orderBy: { createdAt: "asc" } },
      firm: { select: { id: true, name: true } },
    },
  });
}

export type ListJobsFilters = {
  status?: string;
  type?: string;
  firmId?: string;
  onlyFailed?: boolean;
  limit?: number;
  cursor?: string;
};

export async function listJobs(filters: ListJobsFilters) {
  const { status, type, firmId, onlyFailed, limit = 50, cursor } = filters;
  const where: Record<string, unknown> = {};
  if (status) where.status = status;
  if (type) where.type = type;
  if (firmId) where.firmId = firmId;
  if (onlyFailed) where.status = "failed";

  const items = await prisma.job.findMany({
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
export async function retryJob(jobId: string): Promise<{ ok: boolean; error?: string }> {
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    select: { id: true, status: true, attempts: true, maxAttempts: true },
  });
  if (!job) return { ok: false, error: "Job not found" };
  if (job.status !== "failed") return { ok: false, error: "Only failed jobs can be retried" };

  await prisma.job.update({
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
export async function cancelJob(jobId: string): Promise<{ ok: boolean; error?: string }> {
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    select: { status: true },
  });
  if (!job) return { ok: false, error: "Job not found" };
  if (job.status !== "queued") return { ok: false, error: "Only queued jobs can be cancelled" };

  await prisma.job.update({
    where: { id: jobId },
    data: { status: "cancelled" },
  });
  return { ok: true };
}

/**
 * Counts for dashboard: queued, running, failed, and retry backlog (queued with attempts > 0).
 */
export async function getJobCounts(firmId?: string | null) {
  const where = firmId ? { firmId } : {};
  const [queued, running, failed, retryBacklog] = await Promise.all([
    prisma.job.count({ where: { ...where, status: "queued" } }),
    prisma.job.count({ where: { ...where, status: "running" } }),
    prisma.job.count({ where: { ...where, status: "failed" } }),
    prisma.job.count({ where: { ...where, status: "queued", attempts: { gt: 0 } } }),
  ]);
  return { queued, running, failed, retryBacklog };
}
