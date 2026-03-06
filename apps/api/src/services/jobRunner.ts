/**
 * Robust job runner: processes Job table with exponential backoff.
 * Permanently failing jobs (max attempts exceeded) are marked failed with lastError.
 */
import { prisma } from "../db/prisma";
import { runRetentionCleanup } from "./retentionCleanup";
import { runOverdueTaskReminders } from "./overdueTaskReminders";
import { deliverWebhook } from "./webhooks";

export async function enqueueJob(firmId: string, type: string, payload?: unknown): Promise<string> {
  const job = await prisma.job.create({
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

export type JobHandler = (firmId: string, payload: unknown) => Promise<void>;

const handlers: Record<string, JobHandler> = {
  retention_cleanup: async () => {
    await runRetentionCleanup();
  },
  overdue_task_reminders: async () => {
    await runOverdueTaskReminders();
  },
  webhook_delivery: async (_firmId, p) => {
    const payload = p as {
      webhookEndpointId: string;
      url: string;
      secret: string;
      event: string;
      data: Record<string, unknown>;
      timestamp: string;
    };
    if (!payload?.url || !payload?.secret || !payload?.event) {
      throw new Error("Invalid webhook_delivery payload");
    }
    await deliverWebhook(payload);
  },
};

export function registerJobHandler(type: string, handler: JobHandler) {
  handlers[type] = handler;
}

function getBackoffDelayMs(attempts: number): number {
  return BASE_DELAY_MS * Math.pow(2, attempts);
}

export async function runNextJob(): Promise<boolean> {
  const now = new Date();
  const job = await prisma.job.findFirst({
    where: {
      status: "queued",
      runAt: { lte: now },
      attempts: { lt: MAX_ATTEMPTS },
    },
    orderBy: { runAt: "asc" },
  });

  if (!job) return false;

  const handler = handlers[job.type];
  if (!handler) {
    await prisma.job.update({
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

  await prisma.job.update({
    where: { id: job.id },
    data: { status: "running", attempts: job.attempts + 1, updatedAt: new Date() },
  });

  try {
    await handler(job.firmId, job.payload as object);
    await prisma.job.update({
      where: { id: job.id },
      data: { status: "done", lastError: null, updatedAt: new Date() },
    });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    const errStack = err instanceof Error ? err.stack : undefined;
    const lastError = errStack ? `${errMsg}\n${errStack}` : errMsg;

    if (job.attempts + 1 >= MAX_ATTEMPTS) {
      await prisma.job.update({
        where: { id: job.id },
        data: {
          status: "failed",
          lastError,
          updatedAt: new Date(),
        },
      });
    } else {
      const delayMs = getBackoffDelayMs(job.attempts + 1);
      const runAt = new Date(Date.now() + delayMs);
      await prisma.job.update({
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

export async function runJobLoop(pollIntervalMs = 2000): Promise<void> {
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const didWork = await runNextJob();
    if (!didWork) {
      await new Promise((r) => setTimeout(r, pollIntervalMs));
    }
  }
}
