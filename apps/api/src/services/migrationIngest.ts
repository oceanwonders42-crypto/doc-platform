/**
 * Legacy migration ingest: bulk import of historical PDFs/scanned files.
 * Documents are enqueued to the migration queue (processed after main queue) and run
 * the same OCR/classification/extraction/case-match pipeline. Review and export use existing flows.
 */

import crypto from "crypto";
import { prisma } from "../db/prisma";
import { putObject } from "./storage";
import { enqueueMigrationOcrJob } from "./queue";
import { buildOriginalMetadata } from "./ingestHelpers";

export type MigrationIngestInput = {
  firmId: string;
  batchId: string;
  buffer: Buffer;
  originalName: string;
  mimeType: string;
};

export type MigrationIngestResult =
  | { ok: true; documentId: string; spacesKey: string }
  | { ok: false; error: string };

/**
 * Ingest one file into a migration batch. Creates document with metaJson.migrationBatchId and enqueues to migration queue.
 */
export async function ingestMigrationDocument(input: MigrationIngestInput): Promise<MigrationIngestResult> {
  const { firmId, batchId, buffer, originalName, mimeType } = input;

  const firm = await prisma.firm.findUnique({
    where: { id: firmId },
    select: { id: true },
  });
  if (!firm) return { ok: false, error: "Firm not found" };

  const fileSha256 = crypto.createHash("sha256").update(buffer).digest("hex");
  const fileSizeBytes = buffer.length;
  const ext = (originalName.split(".").pop() || "bin").toLowerCase();
  const key = `${firmId}/migration/${batchId}/${Date.now()}_${crypto.randomBytes(6).toString("hex")}.${ext}`;

  await putObject(key, buffer, mimeType);

  const originalMeta = buildOriginalMetadata({
    originalFilename: originalName,
    sizeBytes: buffer.length,
    mimeType: mimeType || "application/octet-stream",
  });

  const doc = await prisma.document.create({
    data: {
      firmId,
      migrationBatchId: batchId,
      source: "migration",
      spacesKey: key,
      originalName: originalMeta.normalizedFilename,
      mimeType: originalMeta.mimeType,
      pageCount: 0,
      status: "RECEIVED",
      file_sha256: fileSha256,
      fileSizeBytes,
      ingestedAt: new Date(),
      metaJson: {
        ...originalMeta,
        migrationBatchId: batchId,
      } as object,
    },
  });

  try {
    await enqueueMigrationOcrJob({ documentId: doc.id, firmId });
  } catch (e) {
    const errMsg = (e as Error)?.message ?? "Enqueue failed";
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
