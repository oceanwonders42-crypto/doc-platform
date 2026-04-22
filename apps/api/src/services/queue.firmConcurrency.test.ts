import assert from "node:assert/strict";

import {
  enqueueExtractionJob,
  getFirmConcurrencyActiveCount,
  getRedisQueueSnapshot,
  heartbeatFirmConcurrencyLease,
  popJob,
  redis,
  releaseFirmConcurrencyLease,
  requeueJob,
  tryAcquireFirmConcurrencyLease,
} from "./queue";
import { shouldDeferJobForFirmLimits } from "../workers/documentWorkerLoop";

type RedisValueEntry = {
  value: string;
  expiresAtMs: number | null;
};

type MockRedisState = {
  nowMs: number;
  queue: string[];
  values: Map<string, RedisValueEntry>;
};

type RestoreRedisMock = () => void;

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createRedisMockState(): MockRedisState {
  return {
    nowMs: 0,
    queue: [],
    values: new Map<string, RedisValueEntry>(),
  };
}

function purgeExpiredKeys(state: MockRedisState) {
  for (const [key, entry] of state.values.entries()) {
    if (entry.expiresAtMs != null && entry.expiresAtMs <= state.nowMs) {
      state.values.delete(key);
    }
  }
}

function installRedisMock(state: MockRedisState): RestoreRedisMock {
  const originalStatusDescriptor = Object.getOwnPropertyDescriptor(redis, "status");
  const redisMock = redis as any;
  const originalMethods = {
    connect: redis.connect.bind(redis),
    del: redis.del.bind(redis),
    eval: redis.eval.bind(redis),
    get: redis.get.bind(redis),
    lpush: redis.lpush.bind(redis),
    lrange: redis.lrange.bind(redis),
    mget: redis.mget.bind(redis),
    pexpire: redis.pexpire.bind(redis),
    rpop: redis.rpop.bind(redis),
    scan: redis.scan.bind(redis),
    set: redis.set.bind(redis),
  };

  Object.defineProperty(redis, "status", {
    configurable: true,
    value: "ready",
  });

  redisMock.connect = async () => undefined;
  redisMock.lpush = async (_key: string, value: string) => {
    purgeExpiredKeys(state);
    state.queue.unshift(value);
    return state.queue.length;
  };
  redisMock.lrange = async (_key: string, _start: number, _end: number) => {
    purgeExpiredKeys(state);
    return [...state.queue];
  };
  redisMock.rpop = async () => {
    purgeExpiredKeys(state);
    if (state.queue.length === 0) {
      return null;
    }
    return state.queue.pop() ?? null;
  };
  redisMock.set = async (key: string, value: string, ...args: unknown[]) => {
    purgeExpiredKeys(state);
    const useNx = args.includes("NX");
    if (useNx && state.values.has(key)) {
      return null;
    }

    const pxIndex = args.findIndex((arg) => arg === "PX");
    const ttlMs = pxIndex >= 0 ? Number(args[pxIndex + 1]) : null;
    state.values.set(key, {
      value,
      expiresAtMs: ttlMs != null && Number.isFinite(ttlMs) ? state.nowMs + ttlMs : null,
    });
    return "OK";
  };
  redisMock.get = async (key: string) => {
    purgeExpiredKeys(state);
    return state.values.get(key)?.value ?? null;
  };
  redisMock.mget = async (...keys: string[]) => {
    purgeExpiredKeys(state);
    return keys.map((key) => state.values.get(key)?.value ?? null);
  };
  redisMock.del = async (...keys: string[]) => {
    purgeExpiredKeys(state);
    let deleted = 0;
    for (const key of keys) {
      if (state.values.delete(key)) {
        deleted += 1;
      }
    }
    return deleted;
  };
  redisMock.pexpire = async (key: string, ttlMs: number) => {
    purgeExpiredKeys(state);
    const entry = state.values.get(key);
    if (!entry) {
      return 0;
    }
    entry.expiresAtMs = state.nowMs + Number(ttlMs);
    state.values.set(key, entry);
    return 1;
  };
  redisMock.eval = async (script: string, _keyCount: number, key: string, token: string, ttlMs?: string) => {
    purgeExpiredKeys(state);
    const entry = state.values.get(key);
    if (!entry || entry.value !== token) {
      return 0;
    }

    if (script.includes("pexpire")) {
      entry.expiresAtMs = state.nowMs + Number(ttlMs ?? 0);
      state.values.set(key, entry);
      return 1;
    }

    state.values.delete(key);
    return 1;
  };
  redisMock.scan = async (cursor: string, _match: string, pattern: string, _count: string, _countValue: number) => {
    purgeExpiredKeys(state);
    if (cursor !== "0") {
      return ["0", []];
    }

    const prefix = pattern.endsWith("*") ? pattern.slice(0, -1) : pattern;
    return ["0", Array.from(state.values.keys()).filter((key) => key.startsWith(prefix))];
  };

  return () => {
    redis.disconnect();
    if (originalStatusDescriptor) {
      Object.defineProperty(redis, "status", originalStatusDescriptor);
    }
    redisMock.connect = originalMethods.connect;
    redisMock.del = originalMethods.del;
    redisMock.eval = originalMethods.eval;
    redisMock.get = originalMethods.get;
    redisMock.lpush = originalMethods.lpush;
    redisMock.lrange = originalMethods.lrange;
    redisMock.mget = originalMethods.mget;
    redisMock.pexpire = originalMethods.pexpire;
    redisMock.rpop = originalMethods.rpop;
    redisMock.scan = originalMethods.scan;
    redisMock.set = originalMethods.set;
  };
}

async function runClusterFairnessSimulation() {
  const durations = new Map<string, number>([
    ["firm-a-1", 35],
    ["firm-a-2", 35],
    ["firm-a-3", 35],
    ["firm-b-1", 15],
    ["firm-b-2", 15],
  ]);
  const started: Array<{ worker: string; firmId: string; documentId: string; atMs: number }> = [];
  const completed: Array<{ worker: string; firmId: string; documentId: string; atMs: number }> = [];
  const runningByFirm = new Map<string, number>();
  const maxRunningByFirm = new Map<string, number>();
  const startedAt = Date.now();

  async function worker(workerLabel: string) {
    while (true) {
      const job = await popJob();
      if (!job) {
        return;
      }

      if (job.type !== "extraction") {
        throw new Error(`Unexpected job type in fairness simulation: ${job.type}`);
      }

      const snapshot = await getRedisQueueSnapshot();
      const runningForFirm = snapshot.byFirm[job.firmId]?.running ?? 0;
      const queuedForFirm = snapshot.byFirm[job.firmId]?.queued ?? 0;
      if (shouldDeferJobForFirmLimits(runningForFirm, queuedForFirm, 2, 1)) {
        await requeueJob(job);
        await sleep(2);
        continue;
      }

      const leaseResult = await tryAcquireFirmConcurrencyLease({
        firmId: job.firmId,
        limit: 1,
        token: `${workerLabel}:${job.documentId}`,
        ttlMs: 500,
      });
      if (!leaseResult) {
        await requeueJob(job);
        await sleep(2);
        continue;
      }

      const currentRunning = (runningByFirm.get(job.firmId) ?? 0) + 1;
      runningByFirm.set(job.firmId, currentRunning);
      maxRunningByFirm.set(job.firmId, Math.max(maxRunningByFirm.get(job.firmId) ?? 0, currentRunning));
      started.push({
        worker: workerLabel,
        firmId: job.firmId,
        documentId: job.documentId,
        atMs: Date.now() - startedAt,
      });

      await sleep(durations.get(job.documentId) ?? 10);

      completed.push({
        worker: workerLabel,
        firmId: job.firmId,
        documentId: job.documentId,
        atMs: Date.now() - startedAt,
      });
      await releaseFirmConcurrencyLease(leaseResult.lease);

      const nextRunning = (runningByFirm.get(job.firmId) ?? 1) - 1;
      if (nextRunning <= 0) {
        runningByFirm.delete(job.firmId);
      } else {
        runningByFirm.set(job.firmId, nextRunning);
      }
    }
  }

  await Promise.all([
    worker("worker-1"),
    worker("worker-2"),
  ]);

  return { started, completed, maxRunningByFirm };
}

async function main() {
  const state = createRedisMockState();
  const restoreRedisMock = installRedisMock(state);

  try {
    const firstLease = await tryAcquireFirmConcurrencyLease({
      firmId: "firm-a",
      limit: 1,
      token: "lease-1",
      ttlMs: 20_000,
    });
    assert(firstLease, "first shared firm slot lease should acquire");
    assert.equal(await getFirmConcurrencyActiveCount("firm-a", 1), 1);

    const blockedLease = await tryAcquireFirmConcurrencyLease({
      firmId: "firm-a",
      limit: 1,
      token: "lease-2",
      ttlMs: 20_000,
    });
    assert.equal(blockedLease, null, "same firm should not exceed the global cap");

    state.nowMs += 10_000;
    assert.equal(await heartbeatFirmConcurrencyLease(firstLease.lease), true, "lease heartbeat should refresh TTL");
    state.nowMs += 15_000;
    assert.equal(await getFirmConcurrencyActiveCount("firm-a", 1), 1, "heartbeat should keep lease alive");
    state.nowMs += 6_000;
    assert.equal(await getFirmConcurrencyActiveCount("firm-a", 1), 0, "expired lease should clean itself up");

    const replacementLease = await tryAcquireFirmConcurrencyLease({
      firmId: "firm-a",
      limit: 1,
      token: "lease-3",
      ttlMs: 20_000,
    });
    assert(replacementLease, "expired lease should free the firm slot");
    await releaseFirmConcurrencyLease(firstLease.lease);
    assert.equal(
      await getFirmConcurrencyActiveCount("firm-a", 1),
      1,
      "releasing a stale lease token must not clear the replacement lease"
    );
    await releaseFirmConcurrencyLease(replacementLease.lease);

    await enqueueExtractionJob({ documentId: "firm-a-1", firmId: "firm-a" });
    await enqueueExtractionJob({ documentId: "firm-a-2", firmId: "firm-a" });
    await enqueueExtractionJob({ documentId: "firm-a-3", firmId: "firm-a" });
    await enqueueExtractionJob({ documentId: "firm-b-1", firmId: "firm-b" });
    await enqueueExtractionJob({ documentId: "firm-b-2", firmId: "firm-b" });

    const fairness = await runClusterFairnessSimulation();
    const firstFirmBStart = fairness.started.find((entry) => entry.firmId === "firm-b");
    const secondFirmAStart = fairness.started.filter((entry) => entry.firmId === "firm-a")[1];

    assert(firstFirmBStart, "firm-b should get worker time while firm-a is flooding jobs");
    assert(secondFirmAStart, "firm-a should continue after firm-b gets a turn");
    assert(
      firstFirmBStart.atMs < secondFirmAStart.atMs,
      "another firm should start before the flooded firm's second global slot-less turn"
    );
    assert.equal(
      fairness.maxRunningByFirm.get("firm-a"),
      1,
      "firm-a should never exceed the global shared concurrency cap"
    );
    assert.equal(
      fairness.maxRunningByFirm.get("firm-b"),
      1,
      "firm-b should also honor the same global shared concurrency cap"
    );

    console.log("queue firm concurrency tests passed", {
      started: fairness.started,
      completed: fairness.completed,
      maxRunningByFirm: Object.fromEntries(fairness.maxRunningByFirm),
    });
  } finally {
    restoreRedisMock();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
