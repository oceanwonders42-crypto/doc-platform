import assert from "node:assert/strict";

import {
  enqueueCaseMatchJob,
  enqueueExtractionJob,
  enqueuePostRouteSyncJob,
  enqueueTimelineRebuildJob,
  getRedisQueueStatus,
  popJob,
  redis,
  settleJobDeduplication,
} from "./queue";

async function main() {
  const state = {
    queue: [] as string[],
    values: new Map<string, string>(),
  };

  const originalWarn = console.warn;
  const originalInfo = console.info;
  const originalStatusDescriptor = Object.getOwnPropertyDescriptor(redis, "status");
  const redisMock = redis as any;
  const originalMethods = {
    connect: redis.connect.bind(redis),
    lpush: redis.lpush.bind(redis),
    rpop: redis.rpop.bind(redis),
    llen: redis.llen.bind(redis),
    set: redis.set.bind(redis),
    get: redis.get.bind(redis),
    del: redis.del.bind(redis),
    pexpire: redis.pexpire.bind(redis),
  };

  console.warn = () => {
    // keep the test output quiet
  };
  console.info = () => {
    // keep the test output quiet
  };

  Object.defineProperty(redis, "status", {
    configurable: true,
    value: "ready",
  });

  redisMock.connect = async () => undefined;
  redisMock.lpush = async (_key: string, value: string) => {
    state.queue.unshift(value);
    return state.queue.length;
  };
  redisMock.rpop = async () => {
    if (state.queue.length === 0) {
      return null;
    }
    return state.queue.pop();
  };
  redisMock.llen = async () => state.queue.length;
  redisMock.set = async (key: string, value: string, ...args: unknown[]) => {
    const useNx = args.includes("NX");
    if (useNx && state.values.has(key)) {
      return null;
    }
    state.values.set(key, value);
    return "OK";
  };
  redisMock.get = async (key: string) => state.values.get(key) ?? null;
  redisMock.del = async (...keys: string[]) => {
    let deleted = 0;
    for (const key of keys) {
      if (state.values.delete(key)) {
        deleted += 1;
      }
    }
    return deleted;
  };
  redisMock.pexpire = async (key: string) => (state.values.has(key) ? 1 : 0);

  function resetState() {
    state.queue.length = 0;
    state.values.clear();
  }

  try {
    resetState();
    await enqueueTimelineRebuildJob({ caseId: "case-1", firmId: "firm-1" });
    await enqueueTimelineRebuildJob({ caseId: "case-1", firmId: "firm-1" });
    assert.equal((await getRedisQueueStatus()).queueDepth, 1, "timeline rebuild should queue once while pending");

    const queuedTimeline = await popJob();
    assert.equal(queuedTimeline?.type, "timeline_rebuild");
    assert.equal((await getRedisQueueStatus()).queueDepth, 0, "timeline rebuild should be running, not duplicated");

    await enqueueTimelineRebuildJob({ caseId: "case-1", firmId: "firm-1" });
    assert.equal((await getRedisQueueStatus()).queueDepth, 0, "running timeline rebuild should not create a duplicate queue entry");

    await settleJobDeduplication(queuedTimeline!, "completed");
    assert.equal((await getRedisQueueStatus()).queueDepth, 1, "running timeline rebuild should queue one rerun after duplicate trigger");

    const rerunTimeline = await popJob();
    assert.equal(rerunTimeline?.type, "timeline_rebuild");
    await settleJobDeduplication(rerunTimeline!, "completed");
    assert.equal((await getRedisQueueStatus()).queueDepth, 0, "timeline rebuild rerun should clear after completion");

    resetState();
    await enqueuePostRouteSyncJob({
      documentId: "doc-1",
      firmId: "firm-1",
      caseId: "case-1",
      action: "approved",
    });
    await enqueuePostRouteSyncJob({
      documentId: "doc-1",
      firmId: "firm-1",
      caseId: "case-1",
      action: "approved",
    });
    assert.equal((await getRedisQueueStatus()).queueDepth, 1, "identical post-route sync should queue once");

    const runningSync = await popJob();
    assert.equal(runningSync?.type, "post_route_sync");
    await enqueuePostRouteSyncJob({
      documentId: "doc-1",
      firmId: "firm-1",
      caseId: "case-1",
      action: "approved",
    });
    assert.equal((await getRedisQueueStatus()).queueDepth, 0, "running post-route sync should not queue duplicate work");
    await settleJobDeduplication(runningSync!, "completed");
    assert.equal((await getRedisQueueStatus()).queueDepth, 0, "post-route sync should not rerun identical work");

    resetState();
    await enqueuePostRouteSyncJob({
      documentId: "doc-1",
      firmId: "firm-1",
      caseId: "case-1",
      action: "routed",
    });
    await enqueuePostRouteSyncJob({
      documentId: "doc-1",
      firmId: "firm-1",
      caseId: "case-1",
      action: "approved",
    });
    assert.equal((await getRedisQueueStatus()).queueDepth, 2, "distinct post-route sync actions should stay separate");
    await settleJobDeduplication((await popJob())!, "completed");
    await settleJobDeduplication((await popJob())!, "completed");

    resetState();
    await enqueueExtractionJob({ documentId: "doc-2", firmId: "firm-1" });
    const runningExtraction = await popJob();
    assert.equal(runningExtraction?.type, "extraction");
    await enqueueExtractionJob({ documentId: "doc-2", firmId: "firm-1" });
    assert.equal((await getRedisQueueStatus()).queueDepth, 0, "running extraction should suppress duplicate queue entries");
    await settleJobDeduplication(runningExtraction!, "completed");
    assert.equal((await getRedisQueueStatus()).queueDepth, 1, "running extraction should schedule exactly one rerun");
    await settleJobDeduplication((await popJob())!, "completed");

    resetState();
    await enqueueExtractionJob({ documentId: "doc-2b", firmId: "firm-1" });
    const concurrentlyRunningExtraction = await popJob();
    assert.equal(concurrentlyRunningExtraction?.type, "extraction");
    await Promise.all([
      enqueueExtractionJob({ documentId: "doc-2b", firmId: "firm-1" }),
      enqueueExtractionJob({ documentId: "doc-2b", firmId: "firm-1" }),
      enqueueExtractionJob({ documentId: "doc-2b", firmId: "firm-1" }),
    ]);
    assert.equal((await getRedisQueueStatus()).queueDepth, 0, "concurrent duplicate extraction triggers should not stack queued work");
    await settleJobDeduplication(concurrentlyRunningExtraction!, "completed");
    assert.equal((await getRedisQueueStatus()).queueDepth, 1, "concurrent duplicate triggers should still collapse to one rerun");
    await settleJobDeduplication((await popJob())!, "completed");

    resetState();
    await enqueueCaseMatchJob({ documentId: "doc-3", firmId: "firm-1" });
    const failedCaseMatch = await popJob();
    assert.equal(failedCaseMatch?.type, "case_match");
    await settleJobDeduplication(failedCaseMatch!, "failed");
    await enqueueCaseMatchJob({ documentId: "doc-3", firmId: "firm-1" });
    assert.equal((await getRedisQueueStatus()).queueDepth, 1, "failed case match should be explicitly re-enqueueable");

    console.log("queue dedupe tests passed");
  } finally {
    redis.disconnect();
    console.warn = originalWarn;
    console.info = originalInfo;
    if (originalStatusDescriptor) {
      Object.defineProperty(redis, "status", originalStatusDescriptor);
    }
    redisMock.connect = originalMethods.connect;
    redisMock.lpush = originalMethods.lpush;
    redisMock.rpop = originalMethods.rpop;
    redisMock.llen = originalMethods.llen;
    redisMock.set = originalMethods.set;
    redisMock.get = originalMethods.get;
    redisMock.del = originalMethods.del;
    redisMock.pexpire = originalMethods.pexpire;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
