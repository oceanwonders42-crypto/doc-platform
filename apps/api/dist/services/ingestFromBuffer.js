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
async function ingestDocumentFromBuffer(input) {
    const { firmId, buffer, originalName, mimeType, source, externalId } = input;
    const firm = await prisma_1.prisma.firm.findUnique({
        where: { id: firmId },
        select: { id: true },
    });
    if (!firm)
        return { ok: false, error: "Firm not found" };
    const fileSha256 = crypto_1.default.createHash("sha256").update(buffer).digest("hex");
    const fileSizeBytes = buffer.length;
    const ext = (originalName.split(".").pop() || "bin").toLowerCase();
    const key = `${firmId}/${Date.now()}_${crypto_1.default.randomBytes(6).toString("hex")}.${ext}`;
    await (0, storage_1.putObject)(key, buffer, mimeType);
    const doc = await prisma_1.prisma.document.create({
        data: {
            firmId,
            source,
            spacesKey: key,
            originalName,
            mimeType,
            pageCount: 0,
            status: "RECEIVED",
            external_id: externalId ?? null,
            file_sha256: fileSha256,
            fileSizeBytes,
            ingestedAt: new Date(),
        },
    });
    try {
        await (0, queue_1.enqueueDocumentJob)({ documentId: doc.id, firmId });
    }
    catch (e) {
        const errMsg = e?.message ?? "Enqueue failed";
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
