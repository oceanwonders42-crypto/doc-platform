/**
 * Internal document ingestion from buffer (e.g. email attachments).
 * Does not modify the existing POST /ingest handler; used by email ingestion and integration worker.
 */
import crypto from "crypto";
import { prisma } from "../db/prisma";
import { DocumentReviewState, DocumentStatus, Prisma, ProcessingStage } from "@prisma/client";
import { pgPool } from "../db/pg";
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
  metaJsonPatch?: Record<string, unknown> | null;
};

export type IngestFromBufferResult =
  | { ok: true; documentId: string; spacesKey: string; duplicate?: boolean; existingId?: string }
  | { ok: false; error: string };

type DuplicateSourceDocument = {
  id: string;
  spacesKey: string;
  pageCount: number;
  status: DocumentStatus;
  processingStage: ProcessingStage;
  extractedFields: Prisma.JsonValue | null;
  confidence: number | null;
  reviewState: DocumentReviewState | null;
  routedSystem: string | null;
  routedCaseId: string | null;
  routingStatus: string | null;
  processedAt: Date | null;
  failureStage: string | null;
  failureReason: string | null;
};

const DOCUMENT_RECOGNITION_COPY_COLUMNS = [
  "text_excerpt",
  "doc_type",
  "client_name",
  "case_number",
  "incident_date",
  "confidence",
  "match_confidence",
  "match_reason",
  "detected_language",
  "possible_languages",
  "ocr_engine",
  "ocr_confidence",
  "has_handwriting",
  "handwriting_heavy",
  "handwriting_confidence",
  "page_diagnostics",
  "extraction_strict_mode",
  "insurance_fields",
  "risks",
  "insights",
  "summary",
  "court_fields",
  "suggested_case_id",
  "text_fingerprint",
  "normalized_text_hash",
  "page_texts_json",
  "extracted_json",
  "extraction_version",
  "quality_score",
  "issues_json",
  "page_count_detected",
  "provider_name",
  "classification_reason",
  "classification_signals_json",
  "facility_name",
  "provider_phone",
  "provider_fax",
  "provider_address",
  "provider_specialty",
  "suggested_provider_id",
  "unmatched_reason",
  "classification_status",
  "suggested_doc_type",
  "provider_name_normalized",
  "provider_resolution_status",
  "suggested_matter_type",
  "matter_routing_reason",
  "matter_review_required",
] as const;

async function copyDocumentRecognitionToDuplicate(
  sourceDocumentId: string,
  duplicateDocumentId: string
): Promise<void> {
  const columns = DOCUMENT_RECOGNITION_COPY_COLUMNS.join(", ");
  await pgPool.query(
    `
    insert into document_recognition (document_id, ${columns}, updated_at)
    select $1, ${columns}, now()
    from document_recognition
    where document_id = $2
    on conflict (document_id) do update set
      ${DOCUMENT_RECOGNITION_COPY_COLUMNS.map((column) => `${column} = excluded.${column}`).join(", ")},
      updated_at = now()
    `,
    [duplicateDocumentId, sourceDocumentId]
  );
}

export async function createDuplicateDocumentFromExisting(params: {
  firmId: string;
  source: string;
  originalName: string;
  mimeType: string;
  externalId?: string | null;
  fileSha256: string;
  fileSizeBytes: number;
  originalMeta: ReturnType<typeof buildOriginalMetadata>;
  existing: DuplicateSourceDocument;
}): Promise<{ documentId: string; spacesKey: string; existingId: string }> {
  const { firmId, source, originalName, mimeType, externalId, fileSha256, fileSizeBytes, originalMeta, existing } = params;
  const doc = await prisma.document.create({ data: buildDuplicateDocumentCreateData({
    firmId,
    source,
    originalName,
    mimeType,
    externalId,
    fileSha256,
    fileSizeBytes,
    originalMeta,
    existing,
  }) });
  await copyDocumentRecognitionToDuplicate(existing.id, doc.id);
  return { documentId: doc.id, spacesKey: existing.spacesKey, existingId: existing.id };
}

export function buildDuplicateDocumentCreateData(params: {
  firmId: string;
  source: string;
  originalName: string;
  mimeType: string;
  externalId?: string | null;
  fileSha256: string;
  fileSizeBytes: number;
  originalMeta: ReturnType<typeof buildOriginalMetadata>;
  existing: DuplicateSourceDocument;
}): Prisma.DocumentUncheckedCreateInput {
  const { firmId, source, originalName, mimeType, externalId, fileSha256, fileSizeBytes, originalMeta, existing } = params;
  return {
    firmId,
    source,
    spacesKey: existing.spacesKey,
    originalName: normalizeFilename(originalName),
    mimeType: mimeType || "application/octet-stream",
    pageCount: existing.pageCount,
    status: existing.status,
    processingStage: existing.processingStage,
    external_id: externalId ?? null,
    file_sha256: fileSha256,
    fileSizeBytes,
    duplicateOfId: existing.id,
    ingestedAt: new Date(),
    processedAt: existing.processedAt,
    extractedFields: (existing.extractedFields ?? undefined) as Prisma.InputJsonValue | undefined,
    confidence: existing.confidence,
    reviewState: existing.reviewState,
    routedSystem: existing.routedSystem,
    routedCaseId: existing.routedCaseId,
    routingStatus: existing.routingStatus,
    failureStage: existing.failureStage,
    failureReason: existing.failureReason,
    metaJson: {
      ...originalMeta,
      duplicateOfDocumentId: existing.id,
    } as Prisma.InputJsonValue,
  };
}

export async function ingestDocumentFromBuffer(input: IngestFromBufferInput): Promise<IngestFromBufferResult> {
  const { firmId, buffer, originalName, mimeType, source, externalId, metaJsonPatch } = input;

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
      select: {
        id: true,
        spacesKey: true,
        pageCount: true,
        status: true,
        processingStage: true,
        extractedFields: true,
        confidence: true,
        reviewState: true,
        routedSystem: true,
        routedCaseId: true,
        routingStatus: true,
        processedAt: true,
        failureStage: true,
        failureReason: true,
      },
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
      const meta = {
        ...buildOriginalMetadata({
          originalFilename: originalName,
          sizeBytes: buffer.length,
          mimeType: mimeType || "application/octet-stream",
        }),
        ...(metaJsonPatch ?? {}),
      };
      const doc = await createDuplicateDocumentFromExisting({
        firmId,
        source,
        originalName,
        mimeType,
        externalId,
        fileSha256,
        fileSizeBytes,
        originalMeta: meta,
        existing,
      });
      return { ok: true, documentId: doc.documentId, spacesKey: doc.spacesKey, duplicate: true, existingId: doc.existingId };
    }
  }

  const ext = (originalName.split(".").pop() || "bin").toLowerCase();
  const key = `${firmId}/${Date.now()}_${crypto.randomBytes(6).toString("hex")}.${ext}`;

  await putObject(key, buffer, mimeType);

  const originalMeta = {
    ...buildOriginalMetadata({
      originalFilename: originalName,
      sizeBytes: buffer.length,
      mimeType: mimeType || "application/octet-stream",
    }),
    ...(metaJsonPatch ?? {}),
  };

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
      metaJson: originalMeta as unknown as Prisma.InputJsonValue,
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
