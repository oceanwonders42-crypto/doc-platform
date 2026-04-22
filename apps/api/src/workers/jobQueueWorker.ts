/**
 * DB-backed job queue worker: poll Job table, claim atomically, run handler, handle success/failure with retries.
 * Run as a separate process: npx ts-node src/workers/jobQueueWorker.ts
 */
import "dotenv/config";
import {
  claimNextJob,
  completeJob,
  failJob,
  rescheduleJobForRetry,
  addJobEvent,
} from "../services/jobQueue";
import { getJobHandler } from "./jobHandlers";
import { logSystemError } from "../services/errorLog";
import { createNotification } from "../services/notifications";

const WORKER_ID = process.env.JOB_WORKER_ID || `worker-${process.pid}-${Date.now()}`;
const POLL_MS = Number(process.env.JOB_POLL_MS) || 2000;

const USER_VISIBLE_JOB_TYPES = new Set([
  "document.reprocess",
  "demand_package.generate",
  "records_request.send",
  "export.packet",
  "timeline.rebuild",
]);

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function runOne(): Promise<boolean> {
  const job = await claimNextJob(WORKER_ID);
  if (!job) return false;

  const { id: jobId, type, payload, firmId, attempts, maxAttempts } = job;

  const addEvent = async (
    level: "info" | "warn" | "error",
    message: string,
    meta?: Record<string, unknown>
  ) => {
    await addJobEvent(jobId, level, message, meta);
  };

  const handler = getJobHandler(type);
  if (!handler) {
    await addEvent("error", `Unknown job type: ${type}`);
    await failJob(jobId, `Unknown job type: ${type}`);
    return true;
  }

  try {
    await addEvent("info", "Job started");
    await handler(payload as Record<string, unknown>, {
      jobId,
      firmId,
      addEvent,
    });
    await completeJob(jobId, { completedAt: new Date().toISOString() });
    await addEvent("info", "Job completed");
    return true;
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    const errStack = err instanceof Error ? err.stack : undefined;

    await addEvent("error", errMsg, { stack: errStack });

    if (attempts < maxAttempts) {
      await rescheduleJobForRetry(jobId, attempts);
      await addEvent("info", `Scheduled retry ${attempts}/${maxAttempts}`);
    } else {
      await failJob(jobId, errMsg);
      await logSystemError("job-worker", errMsg, errStack, {
        area: type,
        firmId: firmId ?? undefined,
        metaJson: { jobId, type, attempts, maxAttempts },
      }).catch(() => {});

      if (firmId && USER_VISIBLE_JOB_TYPES.has(type)) {
        createNotification(
          firmId,
          "job_failed",
          "Background job failed",
          `Job ${type} failed after ${maxAttempts} attempts: ${errMsg.slice(0, 200)}`,
          { jobId, type, error: errMsg }
        ).catch(() => {});
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
      if (!didWork) await sleep(POLL_MS);
    } catch (e) {
      console.error("[job-queue-worker] iteration error", e);
      await sleep(POLL_MS);
    }
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
