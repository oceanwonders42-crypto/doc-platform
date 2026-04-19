import Redis from "ioredis";

const url = process.env.REDIS_URL || "redis://localhost:6379";
const QUEUE_KEY = "doc_jobs";
const REDIS_LOG_THROTTLE_MS = 60_000;
const REDIS_RETRY_COOLDOWN_MS = 15_000;
const REDIS_UNAVAILABLE_CODES = new Set(["ECONNREFUSED", "ECONNRESET", "ENOTFOUND", "EAI_AGAIN", "ETIMEDOUT"]);

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

export type OcrJobPayload = { type: "ocr"; documentId: string; firmId: string };
export type ClassificationJobPayload = { type: "classification"; documentId: string; firmId: string };
export type ExtractionJobPayload = { type: "extraction"; documentId: string; firmId: string };
export type CaseMatchJobPayload = { type: "case_match"; documentId: string; firmId: string };
export type TimelineRebuildJobPayload = { type: "timeline_rebuild"; caseId: string; firmId: string };
export type PostRouteSyncJobPayload = {
  type: "post_route_sync";
  documentId: string;
  firmId: string;
  caseId: string;
  action: string;
};

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

async function pushJob(payload: JobPayload) {
  await runRedisCommand("enqueue", () => redis.lpush(QUEUE_KEY, JSON.stringify(payload)));
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

export async function popJob(): Promise<JobPayload | null> {
  const raw = await runRedisCommand("dequeue", () => redis.rpop(QUEUE_KEY), {
    fallbackOnUnavailable: true,
    fallbackValue: null,
  });
  return raw ? (JSON.parse(raw) as JobPayload) : null;
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

/** @deprecated Use popJob */
export async function popDocumentJob(): Promise<JobPayload | null> {
  return popJob();
}
