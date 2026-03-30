import "dotenv/config";

import { prisma } from "../db/prisma";
import { pgPool } from "../db/pg";
import { listMigrationBatches, syncMigrationBatchLifecycle } from "./migrationBatchWorkflow";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

async function main() {
  const firmId = `migration-list-triage-${Date.now()}`;
  const processingBatchId = `migration-batch-processing-${Date.now()}`;
  const readyBatchId = `migration-batch-ready-${Date.now()}`;
  const readyContactId = `migration-contact-${Date.now()}`;
  const readyCaseId = `migration-case-${Date.now()}`;

  try {
    await prisma.firm.create({
      data: {
        id: firmId,
        name: "Migration list triage firm",
      },
    });

    // Create a processing batch with one in-flight and one completed document
    await prisma.migrationBatch.create({
      data: {
        id: processingBatchId,
        firmId,
        label: "Processing batch",
        status: "PROCESSING",
      },
    });
    await prisma.document.createMany({
      data: [
        {
          id: `${processingBatchId}-processing-doc`,
          firmId,
          migrationBatchId: processingBatchId,
          source: "migration",
          spacesKey: `tests/${processingBatchId}-processing-doc.pdf`,
          originalName: "processing-doc.pdf",
          mimeType: "application/pdf",
          pageCount: 1,
          status: "PROCESSING",
          processingStage: "extraction",
          confidence: 0.5,
          ingestedAt: new Date(),
        },
        {
          id: `${processingBatchId}-complete-doc`,
          firmId,
          migrationBatchId: processingBatchId,
          source: "migration",
          spacesKey: `tests/${processingBatchId}-complete-doc.pdf`,
          originalName: "complete-doc.pdf",
          mimeType: "application/pdf",
          pageCount: 1,
          status: "UPLOADED",
          processingStage: "complete",
          reviewState: "EXPORT_READY",
          confidence: 0.93,
          ingestedAt: new Date(),
          processedAt: new Date(),
        },
      ],
    });

    // Create a ready-for-export batch with routed/export-ready docs
    await prisma.contact.create({
      data: {
        id: readyContactId,
        firmId,
        fullName: "Ready Client",
        firstName: "Ready",
        lastName: "Client",
      },
    });
    await prisma.legalCase.create({
      data: {
        id: readyCaseId,
        firmId,
        title: "Ready Case",
        caseNumber: "READY-001",
        clientName: "Ready Client",
        clientContactId: readyContactId,
        status: "open",
      },
    });
    await prisma.migrationBatch.create({
      data: {
        id: readyBatchId,
        firmId,
        label: "Ready batch",
        status: "UPLOADED",
      },
    });
    await prisma.document.createMany({
      data: [
        {
          id: `${readyBatchId}-doc-1`,
          firmId,
          migrationBatchId: readyBatchId,
          source: "migration",
          spacesKey: `tests/${readyBatchId}-doc-1.pdf`,
          originalName: "ready-doc-1.pdf",
          mimeType: "application/pdf",
          pageCount: 1,
          status: "UPLOADED",
          processingStage: "complete",
          reviewState: "EXPORT_READY",
          routedCaseId: readyCaseId,
          routedSystem: "manual",
          routingStatus: "routed",
          confidence: 0.98,
          ingestedAt: new Date(),
          processedAt: new Date(),
        },
        {
          id: `${readyBatchId}-doc-2`,
          firmId,
          migrationBatchId: readyBatchId,
          source: "migration",
          spacesKey: `tests/${readyBatchId}-doc-2.pdf`,
          originalName: "ready-doc-2.pdf",
          mimeType: "application/pdf",
          pageCount: 1,
          status: "UPLOADED",
          processingStage: "complete",
          reviewState: "EXPORT_READY",
          routedCaseId: readyCaseId,
          routedSystem: "manual",
          routingStatus: "routed",
          confidence: 0.99,
          ingestedAt: new Date(),
          processedAt: new Date(),
        },
      ],
    });

    await pgPool.query(
      `insert into document_recognition (document_id, client_name, case_number, doc_type, confidence, match_confidence, match_reason, updated_at)
       values ($1, $2, $3, $4, $5, $6, $7, now()),
              ($8, $9, $10, $11, $12, $13, $14, now())
       on conflict (document_id) do update set
         client_name = excluded.client_name,
         case_number = excluded.case_number,
         doc_type = excluded.doc_type,
         confidence = excluded.confidence,
         match_confidence = excluded.match_confidence,
         match_reason = excluded.match_reason,
         updated_at = now()`,
      [
        `${readyBatchId}-doc-1`,
        "Ready Client",
        "READY-001",
        "medical_record",
        0.95,
        0.98,
        "Exact routed case match",
        `${readyBatchId}-doc-2`,
        "Ready Client",
        "READY-001",
        "medical_record",
        0.96,
        0.99,
        "Exact routed case match",
      ]
    );

    await syncMigrationBatchLifecycle(firmId, processingBatchId);
    await syncMigrationBatchLifecycle(firmId, readyBatchId);

    const list = await listMigrationBatches(firmId);
    const processingItem = list.find((item) => item.id === processingBatchId);
    const readyItem = list.find((item) => item.id === readyBatchId);

    assert(!!processingItem, "Processing batch not returned in list");
    assert(processingItem!.status === "PROCESSING", `Expected PROCESSING, got ${processingItem!.status}`);
    assert(processingItem!.processedDocuments === 1, `Expected 1 processed, got ${processingItem!.processedDocuments}`);
    assert(processingItem!.remainingDocuments === 1, `Expected 1 remaining, got ${processingItem!.remainingDocuments}`);

    assert(!!readyItem, "Ready batch not returned in list");
    assert(readyItem!.status === "READY_FOR_EXPORT", `Expected READY_FOR_EXPORT, got ${readyItem!.status}`);
    assert(readyItem!.processedDocuments === 2, `Expected 2 processed, got ${readyItem!.processedDocuments}`);
    assert(readyItem!.remainingDocuments === 0, `Expected 0 remaining, got ${readyItem!.remainingDocuments}`);
    assert(readyItem!.unresolvedReviewCount === 0, "Expected no unresolved review items on ready batch");
  } finally {
    await prisma.document.deleteMany({
      where: {
        migrationBatchId: { in: [processingBatchId, readyBatchId] },
      },
    });
    await prisma.migrationBatch.deleteMany({
      where: { id: { in: [processingBatchId, readyBatchId] } },
    });
    await prisma.legalCase.deleteMany({
      where: { id: readyCaseId },
    });
    await prisma.contact.deleteMany({
      where: { id: readyContactId },
    });
    await prisma.firm.deleteMany({ where: { id: firmId } });
    await pgPool.query(
      `delete from document_recognition where document_id = any($1)`,
      [[`${readyBatchId}-doc-1`, `${readyBatchId}-doc-2`]]
    );
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    const exitCode = process.exitCode ?? 0;
    await Promise.race([
      prisma.$disconnect(),
      new Promise((resolve) => setTimeout(resolve, 500)),
    ]);
    process.exit(exitCode);
  });
