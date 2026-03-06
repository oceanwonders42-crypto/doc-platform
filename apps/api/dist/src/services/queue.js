"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.redis = void 0;
exports.enqueueDocumentJob = enqueueDocumentJob;
exports.popDocumentJob = popDocumentJob;
const ioredis_1 = __importDefault(require("ioredis"));
const url = process.env.REDIS_URL || "redis://localhost:6379";
exports.redis = new ioredis_1.default(url);
const QUEUE_KEY = "doc_jobs";
async function enqueueDocumentJob(payload) {
    await exports.redis.lpush(QUEUE_KEY, JSON.stringify(payload));
}
async function popDocumentJob() {
    const raw = await exports.redis.rpop(QUEUE_KEY);
    return raw ? JSON.parse(raw) : null;
}
