/**
 * Internal document ingestion from buffer (e.g. email attachments).
 * Does not modify the existing POST /ingest handler; used by email ingestion and integration worker.
 */
import crypto from "crypto";
import { prisma } from "../db/prisma";
import { putObject } from "./storage";
import { enqueueDocumentJob } from "./queue";
import { validateUploadFile } from "./fileSecurity/index";
import { logIntakeFailure } from "./intakeLogger";
import { hasFeature } from "./featureFlags";
import { buildOriginalMetadata, normalizeFilename } from "./ingestHelpers";
import { canIngestDocument } from "./billingPlans";

export type IngestFromBufferInput = {
  firmId: string;
  buffer: Buffer;
  originalName: string;
  mimeType: string;
  source: string;
  externalId?: string | null;
};

export type IngestFromBufferResult =
  | { ok: true; documentId: string; spacesKey: string; duplicate?: boolean; existingId?: string }
  | { ok: false; error: string };

export async function ingestDocumentFromBuffer(input: IngestFromBufferInput): Promise<IngestFromBufferResult> {
  const { firmId, buffer, originalName, mimeType, source, externalId } = input;

  if (!buffer || !Buffer.isBuffer(buffer) || buffer.length === 0) {
    logIntakeFailure({ stage: "validation", error: "Empty or missing buffer", code: "INVALID_FILE", firmId, fileName: originalName, sizeBytes: 0 });
    return { ok: false, error: "File is empty or invalid" };
  }

  const scan = await validateUploadFile({
    originalname: originalName,
    mimetype: mimeType,
    size: buffer.length,
    buffer,
  });
  if (!scan.ok) {
    const reason = (scan as { reason?: string }).reason ?? "Invalid file";
    logIntakeFailure({ stage: "validation", error: reason, code: "INVALID_FILE", firmId, fileName: originalName, sizeBytes: buffer.length });
    return { ok: false, error: reason };
  }

  const firm = await prisma.firm.findUnique({
    where: { id: firmId },
    select: { id: true },
  });
  if (!firm) return { ok: false, error: "Firm not found" };

  const docLimitCheck = await canIngestDocument(firmId);
  if (!docLimitCheck.allowed) {
    return { ok: false, error: docLimitCheck.error };
  }

  const fileSha256 = crypto.createHash("sha256").update(buffer).digest("hex");
  const fileSizeBytes = buffer.length;

  const duplicatesEnabled = await hasFeature(firmId, "duplicates_detection");
  if (duplicatesEnabled) {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const existing = await prisma.document.findFirst({
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
      await prisma.usageMonthly.upsert({
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
      await prisma.document.update({
        where: { id: existing.id },
        data: { duplicateMatchCount: { increment: 1 } },
      });
      const meta = buildOriginalMetadata({
        originalFilename: originalName,
        sizeBytes: buffer.length,
        mimeType: mimeType || "application/octet-stream",
      });
      const doc = await prisma.document.create({
        data: {
          firmId,
          source,
          spacesKey: existing.spacesKey,
          originalName: normalizeFilename(originalName),
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
  const key = `${firmId}/${Date.now()}_${crypto.randomBytes(6).toString("hex")}.${ext}`;

  await putObject(key, buffer, mimeType);

  const originalMeta = buildOriginalMetadata({
    originalFilename: originalName,
    sizeBytes: buffer.length,
    mimeType: mimeType || "application/octet-stream",
  });

  const doc = await prisma.document.create({
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
    await enqueueDocumentJob({ documentId: doc.id, firmId });
  } catch (e) {
    const errMsg = (e as Error)?.message ?? "Enqueue failed";
    logIntakeFailure({
      stage: "enqueue",
      error: errMsg,
      code: "ENQUEUE_FAILED",
      firmId,
      fileName: originalName,
      sizeBytes: buffer.length,
      documentId: doc.id,
    });
    await prisma.document.update({
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
