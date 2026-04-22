import Redis from "ioredis";

import { OPENAI_TASK_TYPES, recordAiTaskDedupeAvoided } from "./aiTaskTelemetry";

const url = process.env.REDIS_URL || "redis://localhost:6379";
const QUEUE_KEY = "doc_jobs";
const JOB_STATE_KEY_PREFIX = "doc_job_state:";
const FIRM_CONCURRENCY_SLOT_KEY_PREFIX = "doc_job_firm_slot:";
const REDIS_LOG_THROTTLE_MS = 60_000;
const REDIS_RETRY_COOLDOWN_MS = 15_000;
const REDIS_UNAVAILABLE_CODES = new Set(["ECONNREFUSED", "ECONNRESET", "ENOTFOUND", "EAI_AGAIN", "ETIMEDOUT"]);
const JOB_STATE_TTL_MS = 30 * 60 * 1000;
const DEFAULT_FIRM_CONCURRENCY_LEASE_TTL_MS = 2 * 60 * 1000;
const MIN_FIRM_CONCURRENCY_LEASE_TTL_MS = 15_000;

const RELEASE_FIRM_CONCURRENCY_LEASE_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
end
return 0
`;

const HEARTBEAT_FIRM_CONCURRENCY_LEASE_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("pexpire", KEYS[1], ARGV[2])
end
return 0
`;

type RedisAvailability = "unknown" | "up" | "down";

let redisAvailability: RedisAvailability = "unknown";
let lastUnavailableLogAt = 0;
let lastUnavailableSignature = "";
let nextConnectAttemptAt = 0;

function sanitizeRedisTarget(value: string): string {
  try {
    const parsed = new URL(value);
    if (parsed.username) {
      parsed.username = "***";
    }
    if (parsed.password) {
      parsed.password = "***";
    }
    return parsed.toString();
  } catch {
    return value;
  }
}

function getErrorCode(error: unknown): string | undefined {
  if (error && typeof error === "object" && "code" in error) {
    const code = (error as { code?: unknown }).code;
    return typeof code === "string" ? code : undefined;
  }
  return undefined;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function isRedisUnavailableError(error: unknown): boolean {
  const code = getErrorCode(error);
  if (code && REDIS_UNAVAILABLE_CODES.has(code)) {
    return true;
  }

  const message = getErrorMessage(error).toUpperCase();
  return message.includes("ECONNREFUSED")
    || message.includes("ECONNRESET")
    || message.includes("ENOTFOUND")
    || message.includes("EAI_AGAIN")
    || message.includes("ETIMEDOUT")
    || message.includes("CONNECTION IS CLOSED");
}

function createRedisUnavailableError(operation: string, cause?: unknown): Error & { code: string; cause?: unknown } {
  const error = new Error(
    `Redis is unavailable during ${operation}. Queue-backed work remains disabled until Redis reconnects.`
  ) as Error & { code: string; cause?: unknown };
  error.code = "REDIS_UNAVAILABLE";
  if (cause !== undefined) {
    error.cause = cause;
  }
  return error;
}

const redisTarget = sanitizeRedisTarget(url);

function markRedisAvailable(source: string) {
  nextConnectAttemptAt = 0;

  if (redisAvailability !== "up") {
    console.info("[queue] Redis available; queue-backed operations restored.", {
      source,
      target: redisTarget,
    });
  }

  redisAvailability = "up";
}

function markRedisUnavailable(source: string, error: unknown) {
  const now = Date.now();
  const message = getErrorMessage(error);
  const code = getErrorCode(error) ?? "UNKNOWN";
  const signature = `${code}:${message}`;
  const shouldLog = redisAvailability !== "down"
    || signature !== lastUnavailableSignature
    || now - lastUnavailableLogAt >= REDIS_LOG_THROTTLE_MS;

  redisAvailability = "down";
  nextConnectAttemptAt = now + REDIS_RETRY_COOLDOWN_MS;

  if (shouldLog) {
    console.warn("[queue] Redis unavailable; queue-backed operations are running in degraded mode.", {
      source,
      target: redisTarget,
      errorCode: code,
      error: message,
    });
    lastUnavailableLogAt = now;
    lastUnavailableSignature = signature;
  }
}

export const redis = new Redis(url, {
  lazyConnect: true,
  enableOfflineQueue: false,
  retryStrategy: () => null,
});

redis.on("ready", () => {
  markRedisAvailable("ready");
});

redis.on("error", (error) => {
  if (isRedisUnavailableError(error)) {
    markRedisUnavailable("error", error);
    return;
  }

  console.error("[queue] Unexpected Redis error.", error);
});

redis.on("end", () => {
  if (redisAvailability === "up") {
    console.warn("[queue] Redis connection ended; queue-backed operations are degraded until it returns.", {
      target: redisTarget,
    });
    lastUnavailableLogAt = Date.now();
    lastUnavailableSignature = "connection-ended";
  }
  redisAvailability = "down";
  nextConnectAttemptAt = Date.now() + REDIS_RETRY_COOLDOWN_MS;
});

async function ensureRedisConnection(source: string): Promise<boolean> {
  if (redis.status === "ready") {
    return true;
  }

  if (redis.status === "connecting" || redis.status === "connect" || redis.status === "reconnecting") {
    return false;
  }

  if (Date.now() < nextConnectAttemptAt) {
    return false;
  }

  try {
    await redis.connect();
    markRedisAvailable(`${source}:connect`);
    return true;
  } catch (error) {
    if (isRedisUnavailableError(error)) {
      markRedisUnavailable(source, error);
      return false;
    }
    throw error;
  }
}

async function runRedisCommand<T>(
  source: string,
  action: () => Promise<T>,
  options?: { fallbackOnUnavailable?: boolean; fallbackValue?: T }
): Promise<T> {
  const connected = await ensureRedisConnection(source);

  if (!connected) {
    if (options?.fallbackOnUnavailable) {
      return options.fallbackValue as T;
    }
    throw createRedisUnavailableError(source);
  }

  try {
    const result = await action();
    markRedisAvailable(source);
    return result;
  } catch (error) {
    if (isRedisUnavailableError(error)) {
      markRedisUnavailable(source, error);
      if (options?.fallbackOnUnavailable) {
        return options.fallbackValue as T;
      }
      throw createRedisUnavailableError(source, error);
    }
    throw error;
  }
}

type JobMetadata = {
  queuedAt?: string;
  attempt?: number;
};

export type OcrJobPayload = JobMetadata & { type: "ocr"; documentId: string; firmId: string };
export type ClassificationJobPayload = JobMetadata & { type: "classification"; documentId: string; firmId: string };
export type ExtractionJobPayload = JobMetadata & { type: "extraction"; documentId: string; firmId: string };
export type CaseMatchJobPayload = JobMetadata & { type: "case_match"; documentId: string; firmId: string };
export type TimelineRebuildJobPayload = JobMetadata & { type: "timeline_rebuild"; caseId: string; firmId: string };
export type PostRouteSyncJobPayload = {
  type: "post_route_sync";
  documentId: string;
  firmId: string;
  caseId: string;
  action: string;
} & JobMetadata;

export type JobPayload =
  | OcrJobPayload
  | ClassificationJobPayload
  | ExtractionJobPayload
  | CaseMatchJobPayload
  | TimelineRebuildJobPayload
  | PostRouteSyncJobPayload;

export type RedisQueueStatus = {
  available: boolean;
  queueDepth: number;
};

export type QueueTypeMetrics = {
  queued: number;
  oldestAgeMs: number | null;
  retriedQueuedCount: number;
  maxAttempt: number;
};

export type QueueSnapshot = {
  available: boolean;
  queueDepth: number;
  byType: Record<JobPayload["type"], QueueTypeMetrics>;
  oldestJobAgeMs: number | null;
  retriedQueuedCount: number;
  byFirm: Record<string, { queued: number; running: number }>;
  dedupeMarkers: Record<ManagedDedupeJobType, {
    queued: number;
    running: number;
    rerunRequested: number;
  }>;
};

export type FirmConcurrencyLease = {
  firmId: string;
  limit: number;
  slotKey: string;
  token: string;
  ttlMs: number;
};

export type FirmConcurrencyAcquireResult = {
  lease: FirmConcurrencyLease;
  activeJobsForFirm: number;
};

type ManagedDedupeJobType = "timeline_rebuild" | "post_route_sync" | "case_match" | "extraction";
type JobStateStatus = "queued" | "running";
type JobStateMarker = {
  type: ManagedDedupeJobType;
  status: JobStateStatus;
  rerunRequested: boolean;
  updatedAt: string;
};

const DEFERRED_JOB_DEDUPE_TYPES = new Set<ManagedDedupeJobType>([
  "timeline_rebuild",
  "post_route_sync",
  "case_match",
  "extraction",
]);

const ALL_JOB_TYPES: JobPayload["type"][] = [
  "ocr",
  "classification",
  "extraction",
  "case_match",
  "timeline_rebuild",
  "post_route_sync",
];

function isDeferredDedupJob(payload: JobPayload): payload is
  | TimelineRebuildJobPayload
  | PostRouteSyncJobPayload
  | CaseMatchJobPayload
  | ExtractionJobPayload {
  return DEFERRED_JOB_DEDUPE_TYPES.has(payload.type as ManagedDedupeJobType);
}

function supportsRunningRerun(payload: JobPayload): boolean {
  return payload.type === "timeline_rebuild"
    || payload.type === "case_match"
    || payload.type === "extraction";
}

function shouldRecordDedupeTelemetry(payload: JobPayload): payload is
  | CaseMatchJobPayload
  | ExtractionJobPayload {
  return payload.type === "case_match" || payload.type === "extraction";
}

async function recordDeferredDedupeAvoided(payload: JobPayload, reason: "queued_duplicate" | "running_duplicate") {
  if (!shouldRecordDedupeTelemetry(payload)) {
    return;
  }

  await recordAiTaskDedupeAvoided({
    firmId: payload.firmId,
    documentId: payload.documentId,
    taskType: payload.type === "extraction" ? OPENAI_TASK_TYPES.extractionJob : OPENAI_TASK_TYPES.caseMatchJob,
    source: "queue.enqueue",
    meta: {
      reason,
      dedupeKey: buildJobDedupeKey(payload),
      jobType: payload.type,
    } as import("@prisma/client").Prisma.InputJsonValue,
  });
}

export function buildJobDedupeKey(payload: JobPayload): string | null {
  switch (payload.type) {
    case "timeline_rebuild":
      return `${payload.type}:${payload.firmId}:${payload.caseId}`;
    case "post_route_sync":
      return `${payload.type}:${payload.firmId}:${payload.caseId}:${payload.documentId}:${payload.action}`;
    case "case_match":
    case "extraction":
      return `${payload.type}:${payload.firmId}:${payload.documentId}`;
    default:
      return null;
  }
}

function getJobStateKey(payload: JobPayload): string | null {
  const dedupeKey = buildJobDedupeKey(payload);
  return dedupeKey ? `${JOB_STATE_KEY_PREFIX}${dedupeKey}` : null;
}

function encodeJobStateMarker(marker: JobStateMarker): string {
  return JSON.stringify(marker);
}

function createQueueTypeMetrics(): QueueTypeMetrics {
  return {
    queued: 0,
    oldestAgeMs: null,
    retriedQueuedCount: 0,
    maxAttempt: 0,
  };
}

function createQueueSnapshotBase(available: boolean): QueueSnapshot {
  return {
    available,
    queueDepth: 0,
    byFirm: {},
    byType: {
      ocr: createQueueTypeMetrics(),
      classification: createQueueTypeMetrics(),
      extraction: createQueueTypeMetrics(),
      case_match: createQueueTypeMetrics(),
      timeline_rebuild: createQueueTypeMetrics(),
      post_route_sync: createQueueTypeMetrics(),
    },
    oldestJobAgeMs: null,
    retriedQueuedCount: 0,
    dedupeMarkers: {
      timeline_rebuild: { queued: 0, running: 0, rerunRequested: 0 },
      post_route_sync: { queued: 0, running: 0, rerunRequested: 0 },
      case_match: { queued: 0, running: 0, rerunRequested: 0 },
      extraction: { queued: 0, running: 0, rerunRequested: 0 },
    },
  };
}

function touchFirmMetrics(snapshot: QueueSnapshot, firmId: string | null | undefined) {
  if (!firmId) {
    return null;
  }

  if (!snapshot.byFirm[firmId]) {
    snapshot.byFirm[firmId] = { queued: 0, running: 0 };
  }

  return snapshot.byFirm[firmId];
}

function getFirmIdFromJobStateKey(key: string): string | null {
  if (!key.startsWith(JOB_STATE_KEY_PREFIX)) {
    return null;
  }

  const raw = key.slice(JOB_STATE_KEY_PREFIX.length);
  const [, firmId] = raw.split(":");
  return firmId?.trim() ? firmId : null;
}

function normalizeFirmConcurrencyLimit(limit: number): number {
  if (!Number.isFinite(limit)) {
    return 1;
  }

  return Math.max(1, Math.trunc(limit));
}

function normalizeFirmConcurrencyLeaseTtl(ttlMs: number): number {
  if (!Number.isFinite(ttlMs)) {
    return DEFAULT_FIRM_CONCURRENCY_LEASE_TTL_MS;
  }

  return Math.max(MIN_FIRM_CONCURRENCY_LEASE_TTL_MS, Math.trunc(ttlMs));
}

function buildFirmConcurrencySlotKey(firmId: string, slotNumber: number): string {
  return `${FIRM_CONCURRENCY_SLOT_KEY_PREFIX}${firmId}:${slotNumber}`;
}

function buildFirmConcurrencySlotKeys(firmId: string, limit: number): string[] {
  const normalizedLimit = normalizeFirmConcurrencyLimit(limit);
  return Array.from({ length: normalizedLimit }, (_unused, index) => buildFirmConcurrencySlotKey(firmId, index + 1));
}

function getFirmIdFromConcurrencySlotKey(key: string): string | null {
  if (!key.startsWith(FIRM_CONCURRENCY_SLOT_KEY_PREFIX)) {
    return null;
  }

  const raw = key.slice(FIRM_CONCURRENCY_SLOT_KEY_PREFIX.length);
  const separatorIndex = raw.lastIndexOf(":");
  if (separatorIndex <= 0) {
    return null;
  }

  const firmId = raw.slice(0, separatorIndex);
  return firmId.trim() ? firmId : null;
}

function normalizeJobAttempt(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.trunc(value) : 1;
}

function decorateQueuedPayload<T extends JobPayload>(payload: T, attempt = normalizeJobAttempt(payload.attempt)): T {
  return {
    ...payload,
    queuedAt: new Date().toISOString(),
    attempt,
  } as T;
}

function parseQueuedPayload(raw: string): JobPayload | null {
  try {
    const parsed = JSON.parse(raw) as Partial<JobPayload>;
    if (!parsed || typeof parsed !== "object" || typeof parsed.type !== "string" || !ALL_JOB_TYPES.includes(parsed.type as JobPayload["type"])) {
      return null;
    }
    return parsed as JobPayload;
  } catch {
    return null;
  }
}

function getQueuedAgeMs(payload: JobPayload): number | null {
  if (!payload.queuedAt) {
    return null;
  }

  const parsed = Date.parse(payload.queuedAt);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  return Math.max(0, Date.now() - parsed);
}

function decodeJobStateMarker(raw: string | null): JobStateMarker | null {
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<JobStateMarker>;
    if (
      parsed == null
      || typeof parsed !== "object"
      || typeof parsed.type !== "string"
      || typeof parsed.status !== "string"
      || typeof parsed.rerunRequested !== "boolean"
      || typeof parsed.updatedAt !== "string"
    ) {
      return null;
    }

    if (!DEFERRED_JOB_DEDUPE_TYPES.has(parsed.type as ManagedDedupeJobType)) {
      return null;
    }

    if (parsed.status !== "queued" && parsed.status !== "running") {
      return null;
    }

    return {
      type: parsed.type as ManagedDedupeJobType,
      status: parsed.status,
      rerunRequested: parsed.rerunRequested,
      updatedAt: parsed.updatedAt,
    };
  } catch {
    return null;
  }
}

async function writeJobStateMarker(markerKey: string, marker: JobStateMarker, source: string) {
  await runRedisCommand(source, () =>
    redis.set(markerKey, encodeJobStateMarker(marker), "PX", JOB_STATE_TTL_MS)
  );
}

async function queuePayload(payload: JobPayload, options?: { attempt?: number }) {
  const queuedPayload = decorateQueuedPayload(payload, options?.attempt);
  await runRedisCommand("enqueue", () => redis.lpush(QUEUE_KEY, JSON.stringify(queuedPayload)));
  return queuedPayload;
}

async function countFirmConcurrencySlots(firmId: string, limit: number): Promise<number> {
  const slotKeys = buildFirmConcurrencySlotKeys(firmId, limit);
  const values = await runRedisCommand(
    "firm-concurrency-count",
    () => redis.mget(...slotKeys),
    {
      fallbackOnUnavailable: true,
      fallbackValue: Array.from({ length: slotKeys.length }, () => null) as Array<string | null>,
    }
  );
  return values.reduce((count, value) => count + (value ? 1 : 0), 0);
}

export async function getFirmConcurrencyActiveCount(firmId: string, limit: number): Promise<number> {
  return countFirmConcurrencySlots(firmId, limit);
}

export async function tryAcquireFirmConcurrencyLease(options: {
  firmId: string;
  limit: number;
  token: string;
  ttlMs?: number;
}): Promise<FirmConcurrencyAcquireResult | null> {
  const normalizedLimit = normalizeFirmConcurrencyLimit(options.limit);
  const ttlMs = normalizeFirmConcurrencyLeaseTtl(options.ttlMs ?? DEFAULT_FIRM_CONCURRENCY_LEASE_TTL_MS);

  for (let slotNumber = 1; slotNumber <= normalizedLimit; slotNumber += 1) {
    const slotKey = buildFirmConcurrencySlotKey(options.firmId, slotNumber);
    const acquired = await runRedisCommand(
      "firm-concurrency-acquire",
      () => redis.set(slotKey, options.token, "PX", ttlMs, "NX"),
      {
        fallbackOnUnavailable: true,
        fallbackValue: null,
      }
    );

    if (acquired !== "OK") {
      continue;
    }

    return {
      lease: {
        firmId: options.firmId,
        limit: normalizedLimit,
        slotKey,
        token: options.token,
        ttlMs,
      },
      activeJobsForFirm: await countFirmConcurrencySlots(options.firmId, normalizedLimit),
    };
  }

  return null;
}

export async function heartbeatFirmConcurrencyLease(lease: FirmConcurrencyLease): Promise<boolean> {
  const refreshed = await runRedisCommand(
    "firm-concurrency-heartbeat",
    () => redis.eval(
      HEARTBEAT_FIRM_CONCURRENCY_LEASE_SCRIPT,
      1,
      lease.slotKey,
      lease.token,
      String(lease.ttlMs)
    ),
    {
      fallbackOnUnavailable: true,
      fallbackValue: 0,
    }
  );

  return Number(refreshed) === 1;
}

export async function releaseFirmConcurrencyLease(lease: FirmConcurrencyLease): Promise<{
  released: boolean;
  activeJobsForFirm: number;
}> {
  const released = await runRedisCommand(
    "firm-concurrency-release",
    () => redis.eval(RELEASE_FIRM_CONCURRENCY_LEASE_SCRIPT, 1, lease.slotKey, lease.token),
    {
      fallbackOnUnavailable: true,
      fallbackValue: 0,
    }
  );

  return {
    released: Number(released) === 1,
    activeJobsForFirm: await countFirmConcurrencySlots(lease.firmId, lease.limit),
  };
}

async function pushManagedDedupedJob(payload: JobPayload) {
  const markerKey = getJobStateKey(payload);
  if (!markerKey || !isDeferredDedupJob(payload)) {
    await queuePayload(payload);
    return;
  }

  const acquired = await runRedisCommand("dedupe-acquire", () =>
    redis.set(
      markerKey,
      encodeJobStateMarker({
        type: payload.type as ManagedDedupeJobType,
        status: "queued",
        rerunRequested: false,
        updatedAt: new Date().toISOString(),
      }),
      "PX",
      JOB_STATE_TTL_MS,
      "NX"
    )
  );

  if (acquired === "OK") {
    try {
      await queuePayload(payload);
      return;
    } catch (error) {
      await runRedisCommand("dedupe-acquire-rollback", () => redis.del(markerKey), {
        fallbackOnUnavailable: true,
        fallbackValue: 0,
      });
      throw error;
    }
  }

  const existingRaw = await runRedisCommand("dedupe-read", () => redis.get(markerKey), {
    fallbackOnUnavailable: true,
    fallbackValue: null,
  });
  const existing = decodeJobStateMarker(existingRaw);

  if (existing?.status === "running" && supportsRunningRerun(payload)) {
    await writeJobStateMarker(
      markerKey,
      {
        ...existing,
        rerunRequested: true,
        updatedAt: new Date().toISOString(),
      },
      "dedupe-rerun-request"
    );
    await recordDeferredDedupeAvoided(payload, "running_duplicate");
    return;
  }

  await runRedisCommand("dedupe-refresh", () => redis.pexpire(markerKey, JOB_STATE_TTL_MS), {
    fallbackOnUnavailable: true,
    fallbackValue: 0,
  });
  await recordDeferredDedupeAvoided(payload, "queued_duplicate");
}

async function pushJob(payload: JobPayload) {
  if (isDeferredDedupJob(payload)) {
    await pushManagedDedupedJob(payload);
    return;
  }

  await queuePayload(payload);
}

export async function enqueueOcrJob(payload: Omit<OcrJobPayload, "type">) {
  await pushJob({ type: "ocr", ...payload });
}

export async function enqueueClassificationJob(payload: Omit<ClassificationJobPayload, "type">) {
  await pushJob({ type: "classification", ...payload });
}

export async function enqueueExtractionJob(payload: Omit<ExtractionJobPayload, "type">) {
  await pushJob({ type: "extraction", ...payload });
}

export async function enqueueCaseMatchJob(payload: Omit<CaseMatchJobPayload, "type">) {
  await pushJob({ type: "case_match", ...payload });
}

/** Enqueue first stage (OCR). Use this from ingest. */
export async function enqueueDocumentJob(payload: { documentId: string; firmId: string }) {
  await enqueueOcrJob(payload);
}

export async function enqueueTimelineRebuildJob(payload: { caseId: string; firmId: string }) {
  await pushJob({ type: "timeline_rebuild", ...payload });
}

export async function enqueuePostRouteSyncJob(
  payload: Omit<PostRouteSyncJobPayload, "type">
) {
  await pushJob({ type: "post_route_sync", ...payload });
}

/** Alias for migration/bulk ingest; uses same OCR queue. */
export const enqueueMigrationOcrJob = enqueueOcrJob;

async function markJobStarted(payload: JobPayload): Promise<void> {
  const markerKey = getJobStateKey(payload);
  if (!markerKey || !isDeferredDedupJob(payload)) {
    return;
  }

  const existingRaw = await runRedisCommand("job-start-read", () => redis.get(markerKey), {
    fallbackOnUnavailable: true,
    fallbackValue: null,
  });
  const existing = decodeJobStateMarker(existingRaw);

  await writeJobStateMarker(
    markerKey,
    {
      type: payload.type,
      status: "running",
      rerunRequested: existing?.rerunRequested ?? false,
      updatedAt: new Date().toISOString(),
    },
    "job-start-write"
  );
}

export async function settleJobDeduplication(
  payload: JobPayload,
  outcome: "completed" | "failed"
): Promise<void> {
  const markerKey = getJobStateKey(payload);
  if (!markerKey) {
    return;
  }

  const existingRaw = await runRedisCommand("job-finish-read", () => redis.get(markerKey), {
    fallbackOnUnavailable: true,
    fallbackValue: null,
  });
  const existing = decodeJobStateMarker(existingRaw);

  if (!existing) {
    return;
  }

  if (outcome === "completed" && existing.rerunRequested && supportsRunningRerun(payload)) {
    await writeJobStateMarker(
      markerKey,
      {
        type: existing.type,
        status: "queued",
        rerunRequested: false,
        updatedAt: new Date().toISOString(),
      },
      "job-finish-rerun-state"
    );

    try {
      await queuePayload(payload, { attempt: normalizeJobAttempt(payload.attempt) + 1 });
      return;
    } catch (error) {
      await runRedisCommand("job-finish-rerun-cleanup", () => redis.del(markerKey), {
        fallbackOnUnavailable: true,
        fallbackValue: 0,
      });
      throw error;
    }
  }

  await runRedisCommand("job-finish-clear", () => redis.del(markerKey), {
    fallbackOnUnavailable: true,
    fallbackValue: 0,
  });
}

export async function popJob(): Promise<JobPayload | null> {
  const raw = await runRedisCommand("dequeue", () => redis.rpop(QUEUE_KEY), {
    fallbackOnUnavailable: true,
    fallbackValue: null,
  });
  const job = raw ? (JSON.parse(raw) as JobPayload) : null;
  if (job) {
    await markJobStarted(job);
  }
  return job;
}

/**
 * Requeue an existing payload without changing queuedAt/attempt metadata.
 * Used when a worker temporarily yields a job due to local execution caps.
 */
export async function requeueJob(payload: JobPayload): Promise<void> {
  await runRedisCommand("requeue", () => redis.lpush(QUEUE_KEY, JSON.stringify(payload)));
}

export async function getRedisQueueStatus(): Promise<RedisQueueStatus> {
  const queueDepth = await runRedisCommand("queue-depth", () => redis.llen(QUEUE_KEY), {
    fallbackOnUnavailable: true,
    fallbackValue: 0,
  });

  return {
    available: redisAvailability === "up" && redis.status === "ready",
    queueDepth,
  };
}

export async function getRedisQueueSnapshot(): Promise<QueueSnapshot> {
  const snapshot = createQueueSnapshotBase(false);

  const rawQueue = await runRedisCommand("queue-snapshot-list", () => redis.lrange(QUEUE_KEY, 0, -1), {
    fallbackOnUnavailable: true,
    fallbackValue: [] as string[],
  });

  for (const raw of rawQueue) {
    const job = parseQueuedPayload(raw);
    if (!job) {
      continue;
    }

    snapshot.queueDepth += 1;
    const metrics = snapshot.byType[job.type];
    metrics.queued += 1;
    const firmMetrics = touchFirmMetrics(snapshot, job.firmId);
    if (firmMetrics) {
      firmMetrics.queued += 1;
    }
    const attempt = normalizeJobAttempt(job.attempt);
    metrics.maxAttempt = Math.max(metrics.maxAttempt, attempt);
    if (attempt > 1) {
      metrics.retriedQueuedCount += 1;
      snapshot.retriedQueuedCount += 1;
    }

    const ageMs = getQueuedAgeMs(job);
    if (ageMs != null) {
      metrics.oldestAgeMs = metrics.oldestAgeMs == null ? ageMs : Math.max(metrics.oldestAgeMs, ageMs);
      snapshot.oldestJobAgeMs = snapshot.oldestJobAgeMs == null ? ageMs : Math.max(snapshot.oldestJobAgeMs, ageMs);
    }
  }

  let cursor = "0";
  do {
    const [nextCursor, keys] = await runRedisCommand(
      "queue-snapshot-firm-slot-scan",
      () => redis.scan(cursor, "MATCH", `${FIRM_CONCURRENCY_SLOT_KEY_PREFIX}*`, "COUNT", 100),
      {
        fallbackOnUnavailable: true,
        fallbackValue: ["0", [] as string[]] as [string, string[]],
      }
    );

    cursor = nextCursor;
    for (const key of keys) {
      const firmMetrics = touchFirmMetrics(snapshot, getFirmIdFromConcurrencySlotKey(key));
      if (firmMetrics) {
        firmMetrics.running += 1;
      }
    }
  } while (cursor !== "0");

  cursor = "0";
  do {
    const [nextCursor, keys] = await runRedisCommand(
      "queue-snapshot-scan",
      () => redis.scan(cursor, "MATCH", `${JOB_STATE_KEY_PREFIX}*`, "COUNT", 100),
      {
        fallbackOnUnavailable: true,
        fallbackValue: ["0", [] as string[]] as [string, string[]],
      }
    );

    cursor = nextCursor;
    for (const key of keys) {
      const marker = decodeJobStateMarker(
        await runRedisCommand("queue-snapshot-marker-get", () => redis.get(key), {
          fallbackOnUnavailable: true,
          fallbackValue: null,
        })
      );
      if (!marker) {
        continue;
      }

      const metrics = snapshot.dedupeMarkers[marker.type];
      metrics[marker.status] += 1;
      if (marker.rerunRequested) {
        metrics.rerunRequested += 1;
      }
    }
  } while (cursor !== "0");

  snapshot.available = redisAvailability === "up" && redis.status === "ready";
  return snapshot;
}

/** @deprecated Use popJob */
export async function popDocumentJob(): Promise<JobPayload | null> {
  return popJob();
}
