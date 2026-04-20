import assert from "node:assert/strict";

import {
  enqueueOcrJob,
  getRedisQueueStatus,
  popJob,
  redis,
} from "./queue";

async function main() {
  const originalConnect = redis.connect.bind(redis);
  const originalInfo = console.info;
  const originalWarn = console.warn;

  const warnings: unknown[][] = [];

  console.warn = (...args: unknown[]) => {
    warnings.push(args);
  };
  console.info = () => {
    // suppress availability chatter during the test
  };

  redis.connect = (async () => {
    const error = new Error("connect ECONNREFUSED 127.0.0.1:6379") as Error & { code: string };
    error.code = "ECONNREFUSED";
    throw error;
  }) as typeof redis.connect;

  try {
    const popped = await popJob();
    assert.equal(popped, null, "Expected dequeue to fall back to null when Redis is unavailable.");

    const queueStatus = await getRedisQueueStatus();
    assert.deepEqual(
      queueStatus,
      { available: false, queueDepth: 0 },
      "Expected queue status fallback when Redis is unavailable."
    );

    await assert.rejects(
      enqueueOcrJob({ documentId: "doc-test", firmId: "firm-test" }),
      (error: unknown) =>
        !!error
        && typeof error === "object"
        && "code" in error
        && (error as { code?: string }).code === "REDIS_UNAVAILABLE"
    );

    assert.equal(warnings.length, 1, "Expected Redis unavailable warning to be throttled.");

    console.log("queue Redis fallback tests passed");
  } finally {
    console.warn = originalWarn;
    console.info = originalInfo;
    redis.connect = originalConnect;
    redis.disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
