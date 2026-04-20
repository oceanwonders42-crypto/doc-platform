import assert from "node:assert/strict";

import {
  getDocumentWorkerConcurrency,
  getDocumentWorkerOcrConcurrency,
  getDocumentWorkerLabels,
  runDocumentWorkerPool,
  shouldDeferJobForOcrCap,
} from "./documentWorkerLoop";

type SimulatedJob = {
  type: "ocr" | "extraction" | "timeline_rebuild" | "post_route_sync" | "case_match";
  durationMs: number;
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

async function main() {
  assert.equal(getDocumentWorkerConcurrency("", "production"), 3);
  assert.equal(getDocumentWorkerConcurrency("", "development"), 1);
  assert.equal(getDocumentWorkerConcurrency("2", "production"), 2);
  assert.equal(getDocumentWorkerConcurrency("0", "production"), 3);
  assert.equal(getDocumentWorkerConcurrency("99", "production"), 6);
  assert.equal(getDocumentWorkerOcrConcurrency("", 3), 3);
  assert.equal(getDocumentWorkerOcrConcurrency("1", 3), 1);
  assert.equal(getDocumentWorkerOcrConcurrency("99", 3), 3);
  assert.deepEqual(getDocumentWorkerLabels("worker", 1), ["worker"]);
  assert.deepEqual(getDocumentWorkerLabels("worker", 3), ["worker-1", "worker-2", "worker-3"]);
  assert.equal(shouldDeferJobForOcrCap("ocr", 1, 1), true);
  assert.equal(shouldDeferJobForOcrCap("ocr", 0, 1), false);
  assert.equal(shouldDeferJobForOcrCap("post_route_sync", 1, 1), false);

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

  console.log("documentWorkerLoop concurrency tests passed", {
    serialTotalMs: serial.totalMs,
    concurrentTotalMs: concurrent.totalMs,
    serialTimelineFinishMs: serialTimelineFinish.atMs,
    concurrentTimelineFinishMs: concurrentTimelineFinish.atMs,
    ocrCapTotalMs: ocrCapScenario.totalMs,
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
