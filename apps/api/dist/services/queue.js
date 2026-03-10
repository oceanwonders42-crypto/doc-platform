"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.enqueueMigrationOcrJob = exports.redis = void 0;
exports.enqueueOcrJob = enqueueOcrJob;
exports.enqueueClassificationJob = enqueueClassificationJob;
exports.enqueueExtractionJob = enqueueExtractionJob;
exports.enqueueCaseMatchJob = enqueueCaseMatchJob;
exports.enqueueDocumentJob = enqueueDocumentJob;
exports.enqueueTimelineRebuildJob = enqueueTimelineRebuildJob;
exports.popJob = popJob;
exports.popDocumentJob = popDocumentJob;
const ioredis_1 = __importDefault(require("ioredis"));
const url = process.env.REDIS_URL || "redis://localhost:6379";
exports.redis = new ioredis_1.default(url);
const QUEUE_KEY = "doc_jobs";
async function enqueueOcrJob(payload) {
    await exports.redis.lpush(QUEUE_KEY, JSON.stringify({ type: "ocr", ...payload }));
}
async function enqueueClassificationJob(payload) {
    await exports.redis.lpush(QUEUE_KEY, JSON.stringify({ type: "classification", ...payload }));
}
async function enqueueExtractionJob(payload) {
    await exports.redis.lpush(QUEUE_KEY, JSON.stringify({ type: "extraction", ...payload }));
}
async function enqueueCaseMatchJob(payload) {
    await exports.redis.lpush(QUEUE_KEY, JSON.stringify({ type: "case_match", ...payload }));
}
/** Enqueue first stage (OCR). Use this from ingest. */
async function enqueueDocumentJob(payload) {
    await enqueueOcrJob(payload);
}
async function enqueueTimelineRebuildJob(payload) {
    await exports.redis.lpush(QUEUE_KEY, JSON.stringify({ type: "timeline_rebuild", ...payload }));
}
/** Alias for migration/bulk ingest; uses same OCR queue. */
exports.enqueueMigrationOcrJob = enqueueOcrJob;
async function popJob() {
    const raw = await exports.redis.rpop(QUEUE_KEY);
    return raw ? JSON.parse(raw) : null;
}
/** @deprecated Use popJob */
async function popDocumentJob() {
    return popJob();
}
