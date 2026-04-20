import assert from "node:assert/strict";

import {
  enqueueClassificationJob,
  enqueueExtractionJob,
  enqueueTimelineRebuildJob,
  getRedisQueueSnapshot,
  popJob,
  redis,
  settleJobDeduplication,
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
  redisMock.pexpire = async (key: string) => (state.values.has(key) ? 1 : 0);
  redisMock.scan = async (cursor: string, _match: string, _pattern: string, _count: string, _countValue: number) => {
    if (cursor !== "0") {
      return ["0", []];
    }
    return ["0", Array.from(state.values.keys()).filter((key) => key.startsWith("doc_job_state:"))];
  };

  try {
    await enqueueExtractionJob({ documentId: "doc-metrics", firmId: "firm-1" });
    await enqueueClassificationJob({ documentId: "doc-classify", firmId: "firm-1" });
    await enqueueTimelineRebuildJob({ caseId: "case-1", firmId: "firm-1" });

    const snapshot = await getRedisQueueSnapshot();
    assert.equal(snapshot.available, true);
    assert.equal(snapshot.queueDepth, 3);
    assert.equal(snapshot.byType.extraction.queued, 1);
    assert.equal(snapshot.byType.classification.queued, 1);
    assert.equal(snapshot.byType.timeline_rebuild.queued, 1);
    assert(snapshot.oldestJobAgeMs != null);

    const runningTimeline = await popJob();
    assert.equal(runningTimeline?.type, "extraction");
    await enqueueExtractionJob({ documentId: "doc-metrics", firmId: "firm-1" });

    const afterDuplicate = await getRedisQueueSnapshot();
    assert.equal(afterDuplicate.queueDepth, 2, "duplicate extraction should not create another queued entry while running");
    assert.equal(afterDuplicate.dedupeMarkers.extraction.running, 1);
    assert.equal(afterDuplicate.dedupeMarkers.extraction.rerunRequested, 1);

    await settleJobDeduplication(runningTimeline!, "completed");

    const rerunSnapshot = await getRedisQueueSnapshot();
    assert.equal(rerunSnapshot.queueDepth, 3, "dedupe rerun should enqueue one replacement job");
    assert.equal(rerunSnapshot.byType.extraction.retriedQueuedCount, 1);
    assert.equal(rerunSnapshot.byType.extraction.maxAttempt, 2);

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
    redisMock.pexpire = originalMethods.pexpire;
    redisMock.scan = originalMethods.scan;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
