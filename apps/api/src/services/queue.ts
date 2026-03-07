import Redis from "ioredis";

const url = process.env.REDIS_URL || "redis://localhost:6379";
export const redis = new Redis(url);

const QUEUE_KEY = "doc_jobs";
/** Legacy migration jobs: processed after main queue so normal workflow is not blocked. */
const QUEUE_KEY_MIGRATION = "doc_jobs_migration";

export type OcrJobPayload = { type: "ocr"; documentId: string; firmId: string };
export type ClassificationJobPayload = { type: "classification"; documentId: string; firmId: string };
export type ExtractionJobPayload = { type: "extraction"; documentId: string; firmId: string };
export type CaseMatchJobPayload = { type: "case_match"; documentId: string; firmId: string };
export type TimelineRebuildJobPayload = { type: "timeline_rebuild"; caseId: string; firmId: string };

export type JobPayload =
  | OcrJobPayload
  | ClassificationJobPayload
  | ExtractionJobPayload
  | CaseMatchJobPayload
  | TimelineRebuildJobPayload;

export async function enqueueOcrJob(payload: Omit<OcrJobPayload, "type">) {
  await redis.lpush(QUEUE_KEY, JSON.stringify({ type: "ocr", ...payload }));
}

/** Enqueue OCR job to migration queue (bulk backfile import). Same pipeline; worker processes main queue first. */
export async function enqueueMigrationOcrJob(payload: Omit<OcrJobPayload, "type">) {
  await redis.lpush(QUEUE_KEY_MIGRATION, JSON.stringify({ type: "ocr", ...payload }));
}

export async function enqueueClassificationJob(payload: Omit<ClassificationJobPayload, "type">) {
  await redis.lpush(QUEUE_KEY, JSON.stringify({ type: "classification", ...payload }));
}

export async function enqueueExtractionJob(payload: Omit<ExtractionJobPayload, "type">) {
  await redis.lpush(QUEUE_KEY, JSON.stringify({ type: "extraction", ...payload }));
}

export async function enqueueCaseMatchJob(payload: Omit<CaseMatchJobPayload, "type">) {
  await redis.lpush(QUEUE_KEY, JSON.stringify({ type: "case_match", ...payload }));
}

/** Enqueue first stage (OCR). Use this from ingest. */
export async function enqueueDocumentJob(payload: { documentId: string; firmId: string }) {
  await enqueueOcrJob(payload);
}

export async function enqueueTimelineRebuildJob(payload: { caseId: string; firmId: string }) {
  await redis.lpush(QUEUE_KEY, JSON.stringify({ type: "timeline_rebuild", ...payload }));
}

export async function popJob(): Promise<JobPayload | null> {
  const raw = await redis.rpop(QUEUE_KEY);
  if (raw) return JSON.parse(raw) as JobPayload;
  const migrationRaw = await redis.rpop(QUEUE_KEY_MIGRATION);
  return migrationRaw ? (JSON.parse(migrationRaw) as JobPayload) : null;
}

/** Number of jobs waiting in the document pipeline queue (pending). */
export async function getRedisQueueLength(): Promise<number> {
  const n = await redis.llen(QUEUE_KEY);
  return typeof n === "number" ? n : 0;
}

/** Number of jobs in the migration queue. */
export async function getMigrationQueueLength(): Promise<number> {
  const n = await redis.llen(QUEUE_KEY_MIGRATION);
  return typeof n === "number" ? n : 0;
}

/** @deprecated Use popJob */
export async function popDocumentJob(): Promise<JobPayload | null> {
  return popJob();
}
