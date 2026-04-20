import assert from "node:assert/strict";
import crypto from "node:crypto";
import "dotenv/config";

import { prisma } from "../db/prisma";
import {
  type DeferredJobType,
  getDeferredJobTelemetryOverview,
  recordDeferredJobAttempt,
} from "../services/deferredJobTelemetry";
import { runDocumentWorkerPool } from "./documentWorkerLoop";

type SimulatedJob = {
  jobType: DeferredJobType;
  durationMs: number;
  queuedAt: Date;
  documentId: string | null;
  caseId: string | null;
  action: string | null;
};

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildScenario(queuedAt: Date, suffix: string): SimulatedJob[] {
  return [
    { jobType: "extraction", durationMs: 240, queuedAt, documentId: `doc-extract-a-${suffix}`, caseId: `case-a-${suffix}`, action: null },
    { jobType: "ocr", durationMs: 220, queuedAt, documentId: `doc-ocr-a-${suffix}`, caseId: null, action: null },
    { jobType: "extraction", durationMs: 240, queuedAt, documentId: `doc-extract-b-${suffix}`, caseId: `case-b-${suffix}`, action: null },
    { jobType: "ocr", durationMs: 220, queuedAt, documentId: `doc-ocr-b-${suffix}`, caseId: null, action: null },
    { jobType: "timeline_rebuild", durationMs: 20, queuedAt, documentId: null, caseId: `case-a-${suffix}`, action: null },
    { jobType: "post_route_sync", durationMs: 20, queuedAt, documentId: `doc-sync-a-${suffix}`, caseId: `case-a-${suffix}`, action: "routed" },
    { jobType: "case_match", durationMs: 60, queuedAt, documentId: `doc-match-a-${suffix}`, caseId: `case-a-${suffix}`, action: null },
    { jobType: "timeline_rebuild", durationMs: 20, queuedAt, documentId: null, caseId: `case-b-${suffix}`, action: null },
    { jobType: "post_route_sync", durationMs: 20, queuedAt, documentId: `doc-sync-b-${suffix}`, caseId: `case-b-${suffix}`, action: "approved" },
    { jobType: "case_match", durationMs: 60, queuedAt, documentId: `doc-match-b-${suffix}`, caseId: `case-b-${suffix}`, action: null },
    { jobType: "extraction", durationMs: 240, queuedAt, documentId: `doc-extract-c-${suffix}`, caseId: `case-c-${suffix}`, action: null },
    { jobType: "ocr", durationMs: 220, queuedAt, documentId: `doc-ocr-c-${suffix}`, caseId: null, action: null },
    { jobType: "extraction", durationMs: 240, queuedAt, documentId: `doc-extract-d-${suffix}`, caseId: `case-d-${suffix}`, action: null },
    { jobType: "classification", durationMs: 80, queuedAt, documentId: `doc-classify-${suffix}`, caseId: null, action: null },
  ];
}

async function runSweepLevel(level: number, suffix: string) {
  const firmId = `deferred-sweep-firm-${level}-${suffix}`;
  const queuedAt = new Date();
  const jobs = buildScenario(queuedAt, `${suffix}-${level}`);
  const queue = [...jobs];
  const startedAt = Date.now();

  await runDocumentWorkerPool({
    label: `telemetry-sweep-${level}`,
    concurrency: level,
    runLoop: async (label) => {
      while (true) {
        const job = queue.shift();
        if (!job) {
          return;
        }

        const runStartedAt = new Date();
        await sleep(job.durationMs);
        const finishedAt = new Date();
        await recordDeferredJobAttempt({
          firmId,
          documentId: job.documentId,
          caseId: job.caseId,
          jobType: job.jobType,
          action: job.action,
          queuedAt: job.queuedAt,
          startedAt: runStartedAt,
          finishedAt,
          attempt: 1,
          outcome: "success",
          workerLabel: label,
          meta: {
            suite: "documentWorkerLoop.telemetry.sweep",
            concurrency: level,
          },
        });
      }
    },
  });

  const overview = await getDeferredJobTelemetryOverview({
    firmId,
    from: new Date(queuedAt.getTime() - 60_000),
    to: new Date(Date.now() + 60_000),
  });

  const dominantJob = [...overview.byType].sort((left, right) => right.p95RunMs - left.p95RunMs)[0] ?? null;

  return {
    level,
    firmId,
    totalMs: Date.now() - startedAt,
    overview,
    dominantJob,
  };
}

async function main() {
  const suffix = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
  const levels = [2, 3, 4, 5];
  const results = [];

  try {
    for (const level of levels) {
      results.push(await runSweepLevel(level, suffix));
    }

    const byLevel = new Map(results.map((entry) => [entry.level, entry]));
    assert(results.every((entry) => entry.overview.summary.failureCount === 0), "bounded sweep should not introduce failures");
    assert(byLevel.get(3)!.totalMs < byLevel.get(2)!.totalMs, "concurrency 3 should beat concurrency 2");
    assert(byLevel.get(4)!.totalMs <= byLevel.get(3)!.totalMs, "concurrency 4 should not regress throughput");
    assert(byLevel.get(5)!.totalMs <= byLevel.get(4)!.totalMs, "concurrency 5 should not regress throughput");

    const timelineWaitByLevel = levels.map((level) => ({
      level,
      waitMs: byLevel.get(level)!.overview.byType.find((entry) => entry.jobType === "timeline_rebuild")?.avgWaitMs ?? null,
    }));
    assert(
      (timelineWaitByLevel.find((entry) => entry.level === 4)?.waitMs ?? Number.POSITIVE_INFINITY)
        < (timelineWaitByLevel.find((entry) => entry.level === 3)?.waitMs ?? 0),
      "timeline rebuild should wait less at concurrency 4 than at concurrency 3"
    );

    console.log("document worker telemetry sweep passed", results.map((entry) => ({
      level: entry.level,
      totalMs: entry.totalMs,
      avgWaitMs: entry.overview.summary.avgWaitMs,
      p95WaitMs: entry.overview.summary.p95WaitMs,
      avgRunMs: entry.overview.summary.avgRunMs,
      p95RunMs: entry.overview.summary.p95RunMs,
      timelineAvgWaitMs: entry.overview.byType.find((item) => item.jobType === "timeline_rebuild")?.avgWaitMs ?? null,
      dominantJobType: entry.dominantJob?.jobType ?? null,
      dominantJobP95RunMs: entry.dominantJob?.p95RunMs ?? null,
    })));
  } finally {
    const firmIds = results.map((entry) => entry.firmId);
    await prisma.deferredJobTelemetry.deleteMany({
      where: {
        firmId: { in: firmIds },
      },
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
