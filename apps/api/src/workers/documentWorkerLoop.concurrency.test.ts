import assert from "node:assert/strict";

import {
  getDocumentWorkerConcurrency,
  getDocumentWorkerFirmQueuedCap,
  getDocumentWorkerOcrConcurrency,
  getDocumentWorkerPerFirmConcurrency,
  getDocumentWorkerLabels,
  runDocumentWorkerPool,
  shouldDeferJobForFirmLimits,
  shouldDeferJobForOcrCap,
} from "./documentWorkerLoop";

type SimulatedJob = {
  type: "ocr" | "extraction" | "timeline_rebuild" | "post_route_sync" | "case_match";
  durationMs: number;
  firmId?: string;
};

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runScenario(concurrency: number, jobs: SimulatedJob[]) {
  const queue = [...jobs];
  const started: Array<{ type: string; label: string; atMs: number }> = [];
  const finished: Array<{ type: string; label: string; atMs: number }> = [];
  const startedAt = Date.now();

  await runDocumentWorkerPool({
    label: "test-worker",
    concurrency,
    runLoop: async (label) => {
      while (true) {
        const job = queue.shift();
        if (!job) {
          return;
        }

        started.push({
          type: job.type,
          label,
          atMs: Date.now() - startedAt,
        });
        await sleep(job.durationMs);
        finished.push({
          type: job.type,
          label,
          atMs: Date.now() - startedAt,
        });
      }
    },
  });

  return {
    started,
    finished,
    totalMs: Date.now() - startedAt,
  };
}

async function runScenarioWithOcrCap(concurrency: number, ocrConcurrency: number, jobs: SimulatedJob[]) {
  const queue = [...jobs];
  const started: Array<{ type: string; label: string; atMs: number }> = [];
  const finished: Array<{ type: string; label: string; atMs: number }> = [];
  const startedAt = Date.now();
  let activeOcrJobs = 0;

  await runDocumentWorkerPool({
    label: "test-worker-cap",
    concurrency,
    runLoop: async (label) => {
      while (true) {
        const job = queue.shift();
        if (!job) {
          return;
        }

        if (shouldDeferJobForOcrCap(job.type, activeOcrJobs, ocrConcurrency)) {
          queue.push(job);
          await sleep(5);
          continue;
        }

        const holdsOcrSlot = job.type === "ocr";
        if (holdsOcrSlot) {
          activeOcrJobs += 1;
        }

        started.push({
          type: job.type,
          label,
          atMs: Date.now() - startedAt,
        });
        await sleep(job.durationMs);
        finished.push({
          type: job.type,
          label,
          atMs: Date.now() - startedAt,
        });

        if (holdsOcrSlot) {
          activeOcrJobs -= 1;
        }
      }
    },
  });

  return {
    started,
    finished,
    totalMs: Date.now() - startedAt,
  };
}

async function runScenarioWithPerFirmCap(
  concurrency: number,
  perFirmConcurrency: number,
  perFirmQueuedCap: number,
  jobs: SimulatedJob[]
) {
  const queue = [...jobs];
  const started: Array<{ type: string; label: string; atMs: number; firmId: string | null }> = [];
  const finished: Array<{ type: string; label: string; atMs: number; firmId: string | null }> = [];
  const startedAt = Date.now();
  const activeByFirm = new Map<string, number>();

  await runDocumentWorkerPool({
    label: "test-worker-firm-cap",
    concurrency,
    runLoop: async (label) => {
      while (true) {
        const job = queue.shift();
        if (!job) {
          return;
        }

        const firmId = job.firmId ?? null;
        if (!firmId) {
          throw new Error("firmId required for per-firm cap simulation");
        }

        const activeForFirm = activeByFirm.get(firmId) ?? 0;
        const queuedForFirm = queue.filter((queuedJob) => queuedJob.firmId === firmId).length;
        if (shouldDeferJobForFirmLimits(activeForFirm, queuedForFirm, perFirmQueuedCap, perFirmConcurrency)) {
          queue.push(job);
          await sleep(5);
          continue;
        }

        activeByFirm.set(firmId, activeForFirm + 1);
        started.push({
          type: job.type,
          label,
          atMs: Date.now() - startedAt,
          firmId,
        });
        await sleep(job.durationMs);
        finished.push({
          type: job.type,
          label,
          atMs: Date.now() - startedAt,
          firmId,
        });
        const nextActiveForFirm = (activeByFirm.get(firmId) ?? 1) - 1;
        if (nextActiveForFirm <= 0) {
          activeByFirm.delete(firmId);
        } else {
          activeByFirm.set(firmId, nextActiveForFirm);
        }
      }
    },
  });

  return {
    started,
    finished,
    totalMs: Date.now() - startedAt,
  };
}

async function main() {
  assert.equal(getDocumentWorkerConcurrency("", "production"), 3);
  assert.equal(getDocumentWorkerConcurrency("", "development"), 1);
  assert.equal(getDocumentWorkerConcurrency("2", "production"), 2);
  assert.equal(getDocumentWorkerConcurrency("0", "production"), 3);
  assert.equal(getDocumentWorkerConcurrency("99", "production"), 6);
  assert.equal(getDocumentWorkerOcrConcurrency("", 3), 3);
  assert.equal(getDocumentWorkerOcrConcurrency("1", 3), 1);
  assert.equal(getDocumentWorkerOcrConcurrency("99", 3), 3);
  assert.equal(getDocumentWorkerPerFirmConcurrency("", 3), 2);
  assert.equal(getDocumentWorkerPerFirmConcurrency("1", 3), 1);
  assert.equal(getDocumentWorkerPerFirmConcurrency("99", 3), 3);
  assert.equal(getDocumentWorkerFirmQueuedCap(""), 20);
  assert.equal(getDocumentWorkerFirmQueuedCap("7"), 7);
  assert.deepEqual(getDocumentWorkerLabels("worker", 1), ["worker"]);
  assert.deepEqual(getDocumentWorkerLabels("worker", 3), ["worker-1", "worker-2", "worker-3"]);
  assert.equal(shouldDeferJobForOcrCap("ocr", 1, 1), true);
  assert.equal(shouldDeferJobForOcrCap("ocr", 0, 1), false);
  assert.equal(shouldDeferJobForOcrCap("post_route_sync", 1, 1), false);
  assert.equal(shouldDeferJobForFirmLimits(1, 5, 3, 2), true);
  assert.equal(shouldDeferJobForFirmLimits(0, 5, 3, 2), false);
  assert.equal(shouldDeferJobForFirmLimits(1, 2, 3, 2), false);
  assert.equal(shouldDeferJobForFirmLimits(2, 1, 3, 2), true);

  const jobs: SimulatedJob[] = [
    { type: "extraction", durationMs: 120 },
    { type: "ocr", durationMs: 120 },
    { type: "timeline_rebuild", durationMs: 10 },
    { type: "post_route_sync", durationMs: 10 },
    { type: "case_match", durationMs: 20 },
  ];

  const serial = await runScenario(1, jobs);
  const concurrent = await runScenario(3, jobs);

  const serialTimelineFinish = serial.finished.find((entry) => entry.type === "timeline_rebuild");
  const concurrentTimelineFinish = concurrent.finished.find((entry) => entry.type === "timeline_rebuild");
  const serialSyncFinish = serial.finished.find((entry) => entry.type === "post_route_sync");
  const concurrentSyncFinish = concurrent.finished.find((entry) => entry.type === "post_route_sync");

  assert(serialTimelineFinish, "serial timeline job should finish");
  assert(concurrentTimelineFinish, "concurrent timeline job should finish");
  assert(serialSyncFinish, "serial post-route sync job should finish");
  assert(concurrentSyncFinish, "concurrent post-route sync job should finish");

  assert(
    concurrentTimelineFinish.atMs < serialTimelineFinish.atMs,
    "timeline rebuild should finish sooner with bounded concurrency"
  );
  assert(
    concurrentSyncFinish.atMs < serialSyncFinish.atMs,
    "post-route sync should finish sooner with bounded concurrency"
  );
  assert(
    concurrent.totalMs < serial.totalMs,
    "mixed deferred workload should complete faster with bounded concurrency"
  );
  assert(
    concurrentTimelineFinish.atMs < 120,
    "lightweight follow-up work should finish before a single slow OCR/extraction slot completes"
  );

  const ocrCapScenario = await runScenarioWithOcrCap(3, 1, [
    { type: "ocr", durationMs: 120 },
    { type: "ocr", durationMs: 120 },
    { type: "timeline_rebuild", durationMs: 10 },
    { type: "post_route_sync", durationMs: 10 },
  ]);

  const firstOcrStart = ocrCapScenario.started.find((entry) => entry.type === "ocr");
  const secondOcrStart = ocrCapScenario.started.filter((entry) => entry.type === "ocr")[1];
  const firstOcrFinish = ocrCapScenario.finished.find((entry) => entry.type === "ocr");
  const cappedTimelineFinish = ocrCapScenario.finished.find((entry) => entry.type === "timeline_rebuild");
  const cappedSyncFinish = ocrCapScenario.finished.find((entry) => entry.type === "post_route_sync");

  assert(firstOcrStart, "first OCR should start");
  assert(secondOcrStart, "second OCR should eventually start");
  assert(firstOcrFinish, "first OCR should finish");
  assert(cappedTimelineFinish, "timeline rebuild should finish under OCR cap");
  assert(cappedSyncFinish, "post-route sync should finish under OCR cap");

  assert(
    secondOcrStart.atMs >= firstOcrFinish.atMs,
    "OCR cap should keep the second OCR job from starting before the first finishes"
  );
  assert(
    cappedTimelineFinish.atMs < secondOcrStart.atMs,
    "timeline rebuild should run before the deferred second OCR resumes"
  );
  assert(
    cappedSyncFinish.atMs < secondOcrStart.atMs,
    "post-route sync should run before the deferred second OCR resumes"
  );

  const perFirmFairnessScenario = await runScenarioWithPerFirmCap(2, 1, 2, [
    { type: "extraction", durationMs: 40, firmId: "firm-a" },
    { type: "extraction", durationMs: 40, firmId: "firm-a" },
    { type: "extraction", durationMs: 40, firmId: "firm-a" },
    { type: "extraction", durationMs: 40, firmId: "firm-b" },
    { type: "extraction", durationMs: 40, firmId: "firm-b" },
    { type: "extraction", durationMs: 40, firmId: "firm-b" },
  ]);
  const firstFirmAStart = perFirmFairnessScenario.started.find((entry) => entry.firmId === "firm-a");
  const firstFirmBStart = perFirmFairnessScenario.started.find((entry) => entry.firmId === "firm-b");
  const secondFirmAStart = perFirmFairnessScenario.started.filter((entry) => entry.firmId === "firm-a")[1];

  assert(firstFirmAStart, "firm-a should start work");
  assert(firstFirmBStart, "firm-b should start work");
  assert(secondFirmAStart, "firm-a should get a second turn after fairness defer");
  assert(
    firstFirmBStart.atMs < 40,
    "per-firm cap should let another firm begin work before the first firm's backlog drains"
  );
  assert(
    secondFirmAStart.atMs >= 35,
    "per-firm cap should delay the second job for the same firm until another firm gets a turn"
  );

  console.log("documentWorkerLoop concurrency tests passed", {
    serialTotalMs: serial.totalMs,
    concurrentTotalMs: concurrent.totalMs,
    serialTimelineFinishMs: serialTimelineFinish.atMs,
    concurrentTimelineFinishMs: concurrentTimelineFinish.atMs,
    ocrCapTotalMs: ocrCapScenario.totalMs,
    perFirmFairnessTotalMs: perFirmFairnessScenario.totalMs,
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
