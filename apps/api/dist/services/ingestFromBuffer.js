"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ingestDocumentFromBuffer = ingestDocumentFromBuffer;
/**
 * Internal document ingestion from buffer (e.g. email attachments).
 * Does not modify the existing POST /ingest handler; used by email ingestion and integration worker.
 */
const crypto_1 = __importDefault(require("crypto"));
const prisma_1 = require("../db/prisma");
const storage_1 = require("./storage");
const queue_1 = require("./queue");
const index_1 = require("./fileSecurity/index");
const intakeLogger_1 = require("./intakeLogger");
const featureFlags_1 = require("./featureFlags");
const ingestHelpers_1 = require("./ingestHelpers");
const billingPlans_1 = require("./billingPlans");
async function ingestDocumentFromBuffer(input) {
    const { firmId, buffer, originalName, mimeType, source, externalId } = input;
    if (!buffer || !Buffer.isBuffer(buffer) || buffer.length === 0) {
        (0, intakeLogger_1.logIntakeFailure)({ stage: "validation", error: "Empty or missing buffer", code: "INVALID_FILE", firmId, fileName: originalName, sizeBytes: 0 });
        return { ok: false, error: "File is empty or invalid" };
    }
    const scan = await (0, index_1.validateUploadFile)({
        originalname: originalName,
        mimetype: mimeType,
        size: buffer.length,
        buffer,
    });
    if (!scan.ok) {
        const reason = scan.reason ?? "Invalid file";
        (0, intakeLogger_1.logIntakeFailure)({ stage: "validation", error: reason, code: "INVALID_FILE", firmId, fileName: originalName, sizeBytes: buffer.length });
        return { ok: false, error: reason };
    }
    const firm = await prisma_1.prisma.firm.findUnique({
        where: { id: firmId },
        select: { id: true },
    });
    if (!firm)
        return { ok: false, error: "Firm not found" };
    const docLimitCheck = await (0, billingPlans_1.canIngestDocument)(firmId);
    if (!docLimitCheck.allowed) {
        return { ok: false, error: docLimitCheck.error };
    }
    const fileSha256 = crypto_1.default.createHash("sha256").update(buffer).digest("hex");
    const fileSizeBytes = buffer.length;
    const duplicatesEnabled = await (0, featureFlags_1.hasFeature)(firmId, "duplicates_detection");
    if (duplicatesEnabled) {
        const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const existing = await prisma_1.prisma.document.findFirst({
            where: {
                firmId,
                file_sha256: fileSha256,
                fileSizeBytes,
                ingestedAt: { gte: since },
            },
            orderBy: { ingestedAt: "desc" },
            select: { id: true, spacesKey: true },
        });
        if (existing) {
            const ym = `${new Date().getUTCFullYear()}-${String(new Date().getUTCMonth() + 1).padStart(2, "0")}`;
            await prisma_1.prisma.usageMonthly.upsert({
                where: { firmId_yearMonth: { firmId, yearMonth: ym } },
                create: {
                    firmId,
                    yearMonth: ym,
                    pagesProcessed: 0,
                    docsProcessed: 0,
                    insuranceDocsExtracted: 0,
                    courtDocsExtracted: 0,
                    narrativeGenerated: 0,
                    duplicateDetected: 1,
                },
                update: { duplicateDetected: { increment: 1 } },
            });
            await prisma_1.prisma.document.update({
                where: { id: existing.id },
                data: { duplicateMatchCount: { increment: 1 } },
            });
            const meta = (0, ingestHelpers_1.buildOriginalMetadata)({
                originalFilename: originalName,
                sizeBytes: buffer.length,
                mimeType: mimeType || "application/octet-stream",
            });
            const doc = await prisma_1.prisma.document.create({
                data: {
                    firmId,
                    source,
                    spacesKey: existing.spacesKey,
                    originalName: (0, ingestHelpers_1.normalizeFilename)(originalName),
                    mimeType: mimeType || "application/octet-stream",
                    pageCount: 0,
                    status: "UPLOADED",
                    processingStage: "complete",
                    external_id: externalId ?? null,
                    file_sha256: fileSha256,
                    fileSizeBytes,
                    duplicateOfId: existing.id,
                    ingestedAt: new Date(),
                    processedAt: new Date(),
                    metaJson: meta,
                },
            });
            return { ok: true, documentId: doc.id, spacesKey: existing.spacesKey, duplicate: true, existingId: existing.id };
        }
    }
    const ext = (originalName.split(".").pop() || "bin").toLowerCase();
    const key = `${firmId}/${Date.now()}_${crypto_1.default.randomBytes(6).toString("hex")}.${ext}`;
    await (0, storage_1.putObject)(key, buffer, mimeType);
    const originalMeta = (0, ingestHelpers_1.buildOriginalMetadata)({
        originalFilename: originalName,
        sizeBytes: buffer.length,
        mimeType: mimeType || "application/octet-stream",
    });
    const doc = await prisma_1.prisma.document.create({
        data: {
            firmId,
            source,
            spacesKey: key,
            originalName: originalMeta.normalizedFilename,
            mimeType: originalMeta.mimeType,
            pageCount: 0,
            status: "RECEIVED",
            external_id: externalId ?? null,
            file_sha256: fileSha256,
            fileSizeBytes,
            ingestedAt: new Date(),
            metaJson: originalMeta,
        },
    });
    try {
        await (0, queue_1.enqueueDocumentJob)({ documentId: doc.id, firmId });
    }
    catch (e) {
        const errMsg = e?.message ?? "Enqueue failed";
        (0, intakeLogger_1.logIntakeFailure)({
            stage: "enqueue",
            error: errMsg,
            code: "ENQUEUE_FAILED",
            firmId,
            fileName: originalName,
            sizeBytes: buffer.length,
            documentId: doc.id,
        });
        await prisma_1.prisma.document.update({
            where: { id: doc.id },
            data: {
                status: "FAILED",
                failureStage: "ingest",
                failureReason: errMsg.slice(0, 2000),
            },
        });
        return { ok: false, error: errMsg };
    }
    return { ok: true, documentId: doc.id, spacesKey: key };
}
