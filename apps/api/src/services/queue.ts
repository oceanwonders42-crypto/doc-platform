import Redis from "ioredis";

const url = process.env.REDIS_URL || "redis://localhost:6379";
export const redis = new Redis(url);

const QUEUE_KEY = "doc_jobs";

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

/** Alias for migration/bulk ingest; uses same OCR queue. */
export const enqueueMigrationOcrJob = enqueueOcrJob;

export async function popJob(): Promise<JobPayload | null> {
  const raw = await redis.rpop(QUEUE_KEY);
  return raw ? (JSON.parse(raw) as JobPayload) : null;
}

/** @deprecated Use popJob */
export async function popDocumentJob(): Promise<JobPayload | null> {
  return popJob();
}
