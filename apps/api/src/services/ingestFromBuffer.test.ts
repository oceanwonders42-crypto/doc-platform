import "dotenv/config";

import { pgPool } from "../db/pg";
import { prisma } from "../db/prisma";
import { buildOriginalMetadata } from "./ingestHelpers";
import { buildDuplicateDocumentCreateData, createDuplicateDocumentFromExisting } from "./ingestFromBuffer";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForDatabaseReady() {
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= 12; attempt += 1) {
    try {
      await pgPool.query("select 1 as ok");
      await prisma.$queryRawUnsafe("select 1 as ok");
      return;
    } catch (error) {
      lastError = error;
      await sleep(1000);
    }
  }
  throw lastError ?? new Error("Database never became ready for duplicate ingest test");
}

function runShapeTest() {
  const processedAt = new Date("2026-04-18T12:00:00.000Z");
  const data = buildDuplicateDocumentCreateData({
    firmId: "firm-1",
    source: "email",
    originalName: "rescanned-record.pdf",
    mimeType: "application/pdf",
    externalId: "email-duplicate-1",
    fileSha256: "sha-duplicate-1",
    fileSizeBytes: 4096,
    originalMeta: buildOriginalMetadata({
      originalFilename: "rescanned-record.pdf",
      sizeBytes: 4096,
      mimeType: "application/pdf",
    }),
    existing: {
      id: "doc-original-1",
      spacesKey: "firm-1/original-record.pdf",
      pageCount: 4,
      status: "UPLOADED",
      processingStage: "complete",
      extractedFields: {
        docType: "medical_record",
        clientName: "Alex Claimant",
      },
      confidence: 0.91,
      reviewState: "EXPORT_READY",
      routedSystem: "manual",
      routedCaseId: "case-demo-1",
      routingStatus: "routed",
      processedAt,
      failureStage: null,
      failureReason: null,
    },
  });

  assert(data.duplicateOfId === "doc-original-1", "Duplicate should link back to original document");
  assert(data.status === "UPLOADED", `Expected duplicate status UPLOADED, got ${data.status}`);
  assert(
    data.processingStage === "complete",
    `Expected duplicate processingStage complete, got ${data.processingStage}`
  );
  assert(data.pageCount === 4, `Expected duplicate pageCount 4, got ${data.pageCount}`);
  assert(data.reviewState === "EXPORT_READY", `Expected duplicate reviewState EXPORT_READY, got ${data.reviewState}`);
  assert(data.routedCaseId === "case-demo-1", `Expected duplicate routedCaseId case-demo-1, got ${data.routedCaseId}`);
  assert(
    new Date(data.processedAt ?? "").toISOString() === processedAt.toISOString(),
    "Duplicate processedAt should inherit from original processed record"
  );
  assert(
    (data.extractedFields as { clientName?: string } | undefined)?.clientName === "Alex Claimant",
    "Duplicate extractedFields should inherit from original document"
  );
  assert(
    (data.metaJson as { duplicateOfDocumentId?: string } | undefined)?.duplicateOfDocumentId === "doc-original-1",
    "Duplicate metadata should record its source document"
  );
}

async function runDbBackedIntegrationTest() {
  await waitForDatabaseReady();

  const suffix = `${Date.now()}`;
  const firmId = `duplicate-firm-${suffix}`;
  const originalDocumentId = `duplicate-original-${suffix}`;
  let duplicateDocumentId: string | null = null;
  const processedAt = new Date("2026-04-18T12:00:00.000Z");

  try {
    await prisma.firm.create({
      data: {
        id: firmId,
        name: "Duplicate truth firm",
      },
    });

    await prisma.document.create({
      data: {
        id: originalDocumentId,
        firmId,
        source: "email",
        spacesKey: `tests/${originalDocumentId}.pdf`,
        originalName: "original-record.pdf",
        mimeType: "application/pdf",
        pageCount: 4,
        status: "UPLOADED",
        processingStage: "complete",
        extractedFields: {
          docType: "medical_record",
          clientName: "Alex Claimant",
        },
        confidence: 0.91,
        reviewState: "EXPORT_READY",
        routedSystem: "manual",
        routedCaseId: "case-demo-1",
        routingStatus: "routed",
        ingestedAt: new Date(),
        processedAt,
      },
    });

    await pgPool.query(
      `
      insert into document_recognition (
        document_id,
        text_excerpt,
        doc_type,
        client_name,
        case_number,
        confidence,
        normalized_text_hash,
        suggested_case_id,
        updated_at
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8, now())
      `,
      [
        originalDocumentId,
        "Medical record for Alex Claimant.",
        "medical_record",
        "Alex Claimant",
        "CASE-42",
        0.91,
        "hash-123",
        "case-demo-1",
      ]
    );

    const duplicate = await createDuplicateDocumentFromExisting({
      firmId,
      source: "email",
      originalName: "rescanned-record.pdf",
      mimeType: "application/pdf",
      externalId: "email-duplicate-1",
      fileSha256: "sha-duplicate-1",
      fileSizeBytes: 4096,
      originalMeta: buildOriginalMetadata({
        originalFilename: "rescanned-record.pdf",
        sizeBytes: 4096,
        mimeType: "application/pdf",
      }),
      existing: {
        id: originalDocumentId,
        spacesKey: `tests/${originalDocumentId}.pdf`,
        pageCount: 4,
        status: "UPLOADED",
        processingStage: "complete",
        extractedFields: {
          docType: "medical_record",
          clientName: "Alex Claimant",
        },
        confidence: 0.91,
        reviewState: "EXPORT_READY",
        routedSystem: "manual",
        routedCaseId: "case-demo-1",
        routingStatus: "routed",
        processedAt,
        failureStage: null,
        failureReason: null,
      },
    });

    duplicateDocumentId = duplicate.documentId;

    const duplicateDocument = await prisma.document.findUnique({
      where: { id: duplicateDocumentId },
    });
    assert(!!duplicateDocument, "Duplicate document was not created");
    assert(duplicateDocument!.duplicateOfId === originalDocumentId, "Duplicate document is not linked to original");
    assert(duplicateDocument!.status === "UPLOADED", `Expected duplicate status UPLOADED, got ${duplicateDocument!.status}`);
    assert(
      duplicateDocument!.processingStage === "complete",
      `Expected duplicate processingStage complete, got ${duplicateDocument!.processingStage}`
    );
    assert(duplicateDocument!.pageCount === 4, `Expected duplicate pageCount 4, got ${duplicateDocument!.pageCount}`);
    assert(
      duplicateDocument!.reviewState === "EXPORT_READY",
      `Expected duplicate reviewState EXPORT_READY, got ${duplicateDocument!.reviewState}`
    );
    assert(
      duplicateDocument!.routedCaseId === "case-demo-1",
      `Expected duplicate routedCaseId case-demo-1, got ${duplicateDocument!.routedCaseId}`
    );
    assert(
      duplicateDocument!.processedAt?.toISOString() === processedAt.toISOString(),
      "Duplicate processedAt did not inherit from original"
    );
    assert(
      (duplicateDocument!.extractedFields as { clientName?: string } | undefined)?.clientName === "Alex Claimant",
      "Duplicate extractedFields did not inherit from original"
    );

    const recognition = await pgPool.query<{
      text_excerpt: string | null;
      doc_type: string | null;
      client_name: string | null;
      case_number: string | null;
      confidence: number | null;
      normalized_text_hash: string | null;
      suggested_case_id: string | null;
    }>(
      `
      select
        text_excerpt,
        doc_type,
        client_name,
        case_number,
        confidence,
        normalized_text_hash,
        suggested_case_id
      from document_recognition
      where document_id = $1
      `,
      [duplicateDocumentId]
    );

    assert(recognition.rows.length === 1, "Duplicate recognition row was not copied");
    assert(recognition.rows[0].text_excerpt === "Medical record for Alex Claimant.", "Duplicate text_excerpt mismatch");
    assert(recognition.rows[0].doc_type === "medical_record", "Duplicate doc_type mismatch");
    assert(recognition.rows[0].client_name === "Alex Claimant", "Duplicate client_name mismatch");
    assert(recognition.rows[0].case_number === "CASE-42", "Duplicate case_number mismatch");
    assert(Number(recognition.rows[0].confidence) === 0.91, "Duplicate confidence mismatch");
    assert(recognition.rows[0].normalized_text_hash === "hash-123", "Duplicate normalized_text_hash mismatch");
    assert(recognition.rows[0].suggested_case_id === "case-demo-1", "Duplicate suggested_case_id mismatch");
  } finally {
    await pgPool.query(
      `delete from document_recognition where document_id = any($1)`,
      [[originalDocumentId, duplicateDocumentId].filter(Boolean)]
    );
    await prisma.document.deleteMany({
      where: {
        id: {
          in: [originalDocumentId, duplicateDocumentId].filter(Boolean) as string[],
        },
      },
    });
    await prisma.firm.deleteMany({ where: { id: firmId } });
  }
}

async function main() {
  runShapeTest();
  await runDbBackedIntegrationTest();
}

main()
  .then(() => {
    console.log("ingestFromBuffer.test.ts passed");
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await Promise.race([
      prisma.$disconnect(),
      new Promise((resolve) => setTimeout(resolve, 500)),
    ]);
  });
