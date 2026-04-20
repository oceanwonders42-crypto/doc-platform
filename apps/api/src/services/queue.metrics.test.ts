import assert from "node:assert/strict";

import {
  enqueueClassificationJob,
  enqueueExtractionJob,
  enqueueTimelineRebuildJob,
  getRedisQueueSnapshot,
  popJob,
  redis,
  releaseFirmConcurrencyLease,
  settleJobDeduplication,
  tryAcquireFirmConcurrencyLease,
} from "./queue";

async function main() {
  const state = {
    queue: [] as string[],
    values: new Map<string, string>(),
  };

  const originalStatusDescriptor = Object.getOwnPropertyDescriptor(redis, "status");
  const redisMock = redis as any;
  const originalMethods = {
    connect: redis.connect.bind(redis),
    lpush: redis.lpush.bind(redis),
    lrange: redis.lrange.bind(redis),
    rpop: redis.rpop.bind(redis),
    set: redis.set.bind(redis),
    get: redis.get.bind(redis),
    del: redis.del.bind(redis),
    eval: redis.eval.bind(redis),
    mget: redis.mget.bind(redis),
    pexpire: redis.pexpire.bind(redis),
    scan: redis.scan.bind(redis),
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
  redisMock.lrange = async (_key: string, _start: number, _end: number) => [...state.queue];
  redisMock.rpop = async () => {
    if (state.queue.length === 0) return null;
    return state.queue.pop();
  };
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
  redisMock.eval = async (script: string, _keyCount: number, key: string, token: string) => {
    const current = state.values.get(key);
    if (current !== token) {
      return 0;
    }

    if (script.includes("pexpire")) {
      return 1;
    }

    state.values.delete(key);
    return 1;
  };
  redisMock.mget = async (...keys: string[]) => keys.map((key) => state.values.get(key) ?? null);
  redisMock.pexpire = async (key: string) => (state.values.has(key) ? 1 : 0);
  redisMock.scan = async (cursor: string, _match: string, pattern: string, _count: string, _countValue: number) => {
    if (cursor !== "0") {
      return ["0", []];
    }
    const prefix = pattern.endsWith("*") ? pattern.slice(0, -1) : pattern;
    return ["0", Array.from(state.values.keys()).filter((key) => key.startsWith(prefix))];
  };

  try {
    await enqueueExtractionJob({ documentId: "doc-metrics", firmId: "firm-1" });
    await enqueueClassificationJob({ documentId: "doc-classify", firmId: "firm-1" });
    await enqueueTimelineRebuildJob({ caseId: "case-1", firmId: "firm-1" });
    await enqueueClassificationJob({ documentId: "doc-other-firm", firmId: "firm-2" });

    const snapshot = await getRedisQueueSnapshot();
    assert.equal(snapshot.available, true);
    assert.equal(snapshot.queueDepth, 4);
    assert.equal(snapshot.byType.extraction.queued, 1);
    assert.equal(snapshot.byType.classification.queued, 2);
    assert.equal(snapshot.byType.timeline_rebuild.queued, 1);
    assert.equal(snapshot.byFirm["firm-1"]?.queued, 3);
    assert.equal(snapshot.byFirm["firm-2"]?.queued, 1);
    assert(snapshot.oldestJobAgeMs != null);

    const runningTimeline = await popJob();
    assert.equal(runningTimeline?.type, "extraction");
    const runningLease = await tryAcquireFirmConcurrencyLease({
      firmId: "firm-1",
      limit: 1,
      token: "metrics-running-lease",
    });
    assert(runningLease, "running extraction should reserve a shared firm slot");
    await enqueueExtractionJob({ documentId: "doc-metrics", firmId: "firm-1" });

    const afterDuplicate = await getRedisQueueSnapshot();
    assert.equal(afterDuplicate.queueDepth, 3, "duplicate extraction should not create another queued entry while running");
    assert.equal(afterDuplicate.dedupeMarkers.extraction.running, 1);
    assert.equal(afterDuplicate.dedupeMarkers.extraction.rerunRequested, 1);
    assert.equal(afterDuplicate.byFirm["firm-1"]?.queued, 2);
    assert.equal(afterDuplicate.byFirm["firm-1"]?.running, 1);
    assert.equal(afterDuplicate.byFirm["firm-2"]?.queued, 1);

    await settleJobDeduplication(runningTimeline!, "completed");
    await releaseFirmConcurrencyLease(runningLease.lease);

    const rerunSnapshot = await getRedisQueueSnapshot();
    assert.equal(rerunSnapshot.queueDepth, 4, "dedupe rerun should enqueue one replacement job");
    assert.equal(rerunSnapshot.byType.extraction.retriedQueuedCount, 1);
    assert.equal(rerunSnapshot.byType.extraction.maxAttempt, 2);
    assert.equal(rerunSnapshot.byFirm["firm-1"]?.queued, 3);

    console.log("queue metrics tests passed");
  } finally {
    redis.disconnect();
    if (originalStatusDescriptor) {
      Object.defineProperty(redis, "status", originalStatusDescriptor);
    }
    redisMock.connect = originalMethods.connect;
    redisMock.lpush = originalMethods.lpush;
    redisMock.lrange = originalMethods.lrange;
    redisMock.rpop = originalMethods.rpop;
    redisMock.set = originalMethods.set;
    redisMock.get = originalMethods.get;
    redisMock.del = originalMethods.del;
    redisMock.eval = originalMethods.eval;
    redisMock.mget = originalMethods.mget;
    redisMock.pexpire = originalMethods.pexpire;
    redisMock.scan = originalMethods.scan;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
