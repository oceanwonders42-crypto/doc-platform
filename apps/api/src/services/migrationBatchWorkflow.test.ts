import "dotenv/config";

import { pgPool } from "../db/pg";
import { prisma } from "../db/prisma";
import {
  finalizeMigrationBatchForClioHandoff,
  getMigrationBatchDetail,
  importMigrationBatch,
  listMigrationBatches,
  syncMigrationBatchLifecycle,
} from "./migrationBatchWorkflow";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

async function main() {
  const firmId = `migration-batch-service-firm-${Date.now()}`;
  const routedContactId = `migration-batch-contact-${Date.now()}`;
  const routedCaseId = `migration-batch-case-${Date.now()}`;
  const createdDocumentIds: string[] = [];
  const createdTrafficMatterIds: string[] = [];
  const createdBatchIds: string[] = [];
  let createdTrafficCaseId: string | null = null;
  let createdTrafficContactId: string | null = null;
  let createdBatchId: string | null = null;

  await prisma.firm.create({
    data: {
      id: firmId,
      name: "Migration Batch Service Test Firm",
      settings: {
        paperless: {
          reviewRequiredBeforeExport: true,
        },
      },
    },
  });
  await prisma.contact.create({
    data: {
      id: routedContactId,
      firmId,
      fullName: "Routed Client",
      firstName: "Routed",
      lastName: "Client",
    },
  });
  await prisma.legalCase.create({
    data: {
      id: routedCaseId,
      firmId,
      title: "Routed Client Matter",
      caseNumber: "MIG-001",
      clientName: "Routed Client",
      clientContactId: routedContactId,
      status: "open",
    },
  });

  try {
    const importResult = await importMigrationBatch(
      {
        firmId,
        createdByUserId: "migration-batch-service-user",
        label: "Scanned backfile import",
        files: [
          {
            originalName: "routed-medical.pdf",
            mimeType: "application/pdf",
            buffer: Buffer.from("fake routed pdf"),
          },
          {
            originalName: "traffic-citation.pdf",
            mimeType: "application/pdf",
            buffer: Buffer.from("fake traffic pdf"),
          },
          {
            originalName: "broken.pdf",
            mimeType: "application/pdf",
            buffer: Buffer.from("bad pdf"),
          },
        ],
      },
      {
        ingestDocument: async (input) => {
          if (input.originalName === "broken.pdf") {
            return { ok: false, error: "Corrupt scanned file" };
          }

          const documentId = `${input.batchId}-${input.originalName.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`;
          const isTraffic = input.originalName.includes("traffic");
          createdDocumentIds.push(documentId);

          await prisma.document.create({
            data: {
              id: documentId,
              firmId: input.firmId,
              migrationBatchId: input.batchId,
              source: "migration",
              spacesKey: `tests/${documentId}.pdf`,
              originalName: input.originalName,
              mimeType: input.mimeType,
              pageCount: 1,
              status: isTraffic ? "NEEDS_REVIEW" : "UPLOADED",
              processingStage: "complete",
              reviewState: isTraffic ? "IN_REVIEW" : "APPROVED",
              routedCaseId: isTraffic ? null : routedCaseId,
              routedSystem: isTraffic ? null : "manual",
              routingStatus: isTraffic ? "needs_review" : "routed",
              confidence: isTraffic ? 0.72 : 0.96,
              ingestedAt: new Date(),
              processedAt: new Date(),
            },
          });

          await pgPool.query(
            `insert into document_recognition
              (document_id, client_name, case_number, doc_type, confidence, match_confidence, match_reason, updated_at)
             values ($1, $2, $3, $4, $5, $6, $7, now())
             on conflict (document_id) do update set
               client_name = excluded.client_name,
               case_number = excluded.case_number,
               doc_type = excluded.doc_type,
               confidence = excluded.confidence,
               match_confidence = excluded.match_confidence,
               match_reason = excluded.match_reason,
               updated_at = now()`,
            [
              documentId,
              isTraffic ? "Traffic Driver" : "Routed Client",
              isTraffic ? null : "MIG-001",
              isTraffic ? "traffic_citation" : "medical_record",
              isTraffic ? 0.72 : 0.96,
              isTraffic ? 0.42 : 0.99,
              isTraffic ? "Low-confidence case suggestion" : "Exact case match",
            ]
          );

          if (isTraffic) {
            const trafficMatterId = `${documentId}-traffic-matter`;
            createdTrafficMatterIds.push(trafficMatterId);
            await prisma.trafficMatter.create({
              data: {
                id: trafficMatterId,
                firmId: input.firmId,
                sourceDocumentId: documentId,
                matterType: "TRAFFIC",
                status: "REVIEW_REQUIRED",
                citationNumber: "TR-9001",
                defendantName: "Traffic Driver",
                reviewRequired: true,
                routingConfidence: 0.72,
              },
            });
          }

          return { ok: true, documentId, spacesKey: `tests/${documentId}.pdf` };
        },
      }
    );

    createdBatchId = importResult.batchId;
    createdBatchIds.push(importResult.batchId);
    assert(importResult.documentIds.length === 2, `Expected 2 imported docs, got ${importResult.documentIds.length}`);
    assert(importResult.failures.length === 1, `Expected 1 import failure, got ${importResult.failures.length}`);

    const initialDetail = await getMigrationBatchDetail(firmId, importResult.batchId);
    assert(initialDetail.batch.status === "NEEDS_REVIEW", `Expected initial batch status NEEDS_REVIEW, got ${initialDetail.batch.status}`);
    assert(initialDetail.reviewFlags.length > 0, "Expected review flags for traffic candidate.");
    assert(
      initialDetail.contactCandidates.some((candidate) => candidate.fullName === "Traffic Driver"),
      "Expected traffic contact candidate to be surfaced."
    );
    assert(
      initialDetail.matterCandidates.some((candidate) => candidate.matterType === "TRAFFIC"),
      "Expected traffic matter candidate to be surfaced."
    );
    assert(
      initialDetail.exportSummary.readyForClioExport === false,
      "Expected batch to be blocked from Clio export before review is complete."
    );
    assert(
      initialDetail.handoffReadiness.state === "NEEDS_REVIEW",
      `Expected initial handoff readiness NEEDS_REVIEW, got ${initialDetail.handoffReadiness.state}`
    );
    assert(
      initialDetail.exportSummary.blockedReason === "Resolve review flags before exporting this migration batch.",
      `Unexpected initial blockedReason: ${initialDetail.exportSummary.blockedReason}`
    );
    const initialList = await listMigrationBatches(firmId);
    const initialBatchListItem = initialList.find((item) => item.id === importResult.batchId);
    assert(!!initialBatchListItem, "Expected migration batch to appear in the batch list.");
    assert(
      initialBatchListItem?.unresolvedReviewCount === 1,
      `Expected unresolved review count 1 for blocked batch, got ${initialBatchListItem?.unresolvedReviewCount}`
    );
    assert(
      initialBatchListItem?.needsReviewCount === 1,
      `Expected needsReviewCount 1 for blocked batch, got ${initialBatchListItem?.needsReviewCount}`
    );
    assert(
      initialBatchListItem?.lastReviewedAt == null,
      "Expected no lastReviewedAt before any review actions have been recorded."
    );
    assert(
      initialBatchListItem?.processedDocuments === 2,
      `Expected processedDocuments 2 for completed docs, got ${initialBatchListItem?.processedDocuments}`
    );
    assert(
      initialBatchListItem?.remainingDocuments === 0,
      `Expected remainingDocuments 0 for completed docs, got ${initialBatchListItem?.remainingDocuments}`
    );

    const processingBatchId = `mig_progress_${Date.now()}`;
    createdBatchIds.push(processingBatchId);
    await prisma.migrationBatch.create({
      data: {
        id: processingBatchId,
        firmId,
        label: "Processing progress batch",
        status: "PROCESSING",
      },
    });
    await prisma.document.create({
      data: {
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
    });
    createdDocumentIds.push(`${processingBatchId}-processing-doc`);
    await prisma.document.create({
      data: {
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
        routedCaseId,
        routedSystem: "manual",
        routingStatus: "routed",
        confidence: 0.91,
        ingestedAt: new Date(),
        processedAt: new Date(),
      },
    });
    createdDocumentIds.push(`${processingBatchId}-complete-doc`);

    const processingList = await listMigrationBatches(firmId);
    const processingBatchListItem = processingList.find((item) => item.id === processingBatchId);
    assert(!!processingBatchListItem, "Expected processing migration batch to appear in the batch list.");
    assert(
      processingBatchListItem?.status === "PROCESSING",
      `Expected processing batch status PROCESSING, got ${processingBatchListItem?.status}`
    );
    assert(
      processingBatchListItem?.processedDocuments === 1,
      `Expected processedDocuments 1 for in-flight batch, got ${processingBatchListItem?.processedDocuments}`
    );
    assert(
      processingBatchListItem?.remainingDocuments === 1,
      `Expected remainingDocuments 1 for in-flight batch, got ${processingBatchListItem?.remainingDocuments}`
    );

    createdTrafficContactId = `migration-batch-traffic-contact-${Date.now()}`;
    createdTrafficCaseId = `migration-batch-traffic-case-${Date.now()}`;
    await prisma.contact.create({
      data: {
        id: createdTrafficContactId,
        firmId,
        fullName: "Traffic Driver",
        firstName: "Traffic",
        lastName: "Driver",
      },
    });
    await prisma.legalCase.create({
      data: {
        id: createdTrafficCaseId,
        firmId,
        title: "Traffic Driver Citation Matter",
        caseNumber: "TR-9001",
        clientName: "Traffic Driver",
        clientContactId: createdTrafficContactId,
        status: "open",
      },
    });

    const trafficDocumentId = createdDocumentIds.find((id) => id.includes("traffic-citation"));
    assert(!!trafficDocumentId, "Expected created traffic document id.");
    await prisma.documentAuditEvent.create({
      data: {
        documentId: trafficDocumentId!,
        firmId,
        actor: "migration-batch-reviewer",
        action: "claimed",
      },
    });

    const reviewedList = await listMigrationBatches(firmId);
    const reviewedBatchListItem = reviewedList.find((item) => item.id === importResult.batchId);
    assert(
      !!reviewedBatchListItem?.lastReviewedAt,
      "Expected lastReviewedAt after a review action has been recorded for the batch."
    );

    await prisma.document.update({
      where: { id: trafficDocumentId! },
      data: {
        routedCaseId: createdTrafficCaseId,
        routedSystem: "manual",
        routingStatus: "routed",
        status: "UPLOADED",
        reviewState: "APPROVED",
      },
    });
    await prisma.trafficMatter.updateMany({
      where: {
        firmId,
        sourceDocumentId: trafficDocumentId!,
      },
      data: {
        caseId: createdTrafficCaseId,
        reviewRequired: false,
        status: "OPEN",
      },
    });

    const nextStatus = await syncMigrationBatchLifecycle(firmId, importResult.batchId);
    assert(nextStatus === "NEEDS_REVIEW", `Expected batch status NEEDS_REVIEW before finalize, got ${nextStatus}`);

    const preFinalizeDetail = await getMigrationBatchDetail(firmId, importResult.batchId);
    assert(
      preFinalizeDetail.exportSummary.readyForClioExport === false,
      "Expected batch to stay blocked until approved docs are finalized."
    );
    assert(
      preFinalizeDetail.exportSummary.blockedReason === "Finalize approved routed documents before downloading the Clio handoff package.",
      `Unexpected pre-finalize blockedReason: ${preFinalizeDetail.exportSummary.blockedReason}`
    );
    assert(
      preFinalizeDetail.handoffReadiness.canFinalize === true,
      "Expected finalized transition to be available once review blockers are cleared."
    );
    assert(preFinalizeDetail.reviewFlags.length === 0, `Expected review flags to clear, got ${preFinalizeDetail.reviewFlags.length}`);

    const finalizeResult = await finalizeMigrationBatchForClioHandoff(
      firmId,
      importResult.batchId,
      "migration-batch-reviewer"
    );
    assert(finalizeResult.ok === true, "Expected finalizeMigrationBatchForClioHandoff to succeed.");
    if (!finalizeResult.ok) {
      throw new Error(`Finalize unexpectedly failed: ${finalizeResult.error}`);
    }
    assert(
      finalizeResult.markedExportReadyCount === 2,
      `Expected finalize to mark 2 docs export-ready, got ${finalizeResult.markedExportReadyCount}`
    );

    const finalDetail = await getMigrationBatchDetail(firmId, importResult.batchId);
    assert(finalDetail.exportSummary.readyForClioExport === true, "Expected batch to become Clio-export ready after finalize.");
    assert(finalDetail.exportSummary.routedCaseIds.length === 2, `Expected 2 routed case ids, got ${finalDetail.exportSummary.routedCaseIds.length}`);
    assert(
      finalDetail.exportSummary.exportReadyCaseIds.length === 2,
      `Expected 2 export-ready case ids after finalize, got ${finalDetail.exportSummary.exportReadyCaseIds.length}`
    );
    assert(
      finalDetail.handoffReadiness.state === "READY_FOR_HANDOFF",
      `Expected handoff readiness READY_FOR_HANDOFF, got ${finalDetail.handoffReadiness.state}`
    );
    const finalList = await listMigrationBatches(firmId);
    const finalBatchListItem = finalList.find((item) => item.id === importResult.batchId);
    assert(
      finalBatchListItem?.unresolvedReviewCount === 0,
      `Expected unresolved review count 0 after review is resolved, got ${finalBatchListItem?.unresolvedReviewCount}`
    );
    assert(
      finalBatchListItem?.status === "READY_FOR_EXPORT",
      `Expected batch list status READY_FOR_EXPORT after review, got ${finalBatchListItem?.status}`
    );

    console.log("Migration batch workflow service tests passed");
  } finally {
    if (createdDocumentIds.length > 0) {
      await pgPool.query(`delete from document_recognition where document_id = any($1)`, [createdDocumentIds]);
    }
    if (createdTrafficMatterIds.length > 0) {
      await prisma.trafficMatter.deleteMany({
        where: { id: { in: createdTrafficMatterIds } },
      });
    }
    if (createdDocumentIds.length > 0) {
      await prisma.document.deleteMany({
        where: { id: { in: createdDocumentIds } },
      });
    }
    if (createdBatchId) {
      await prisma.migrationBatchClioHandoff.deleteMany({
        where: { batchId: createdBatchId },
      });
    }
    if (createdBatchIds.length > 0) {
      await prisma.migrationBatch.deleteMany({
        where: { id: { in: createdBatchIds } },
      });
    }
    if (createdTrafficCaseId) {
      await prisma.legalCase.deleteMany({
        where: { id: createdTrafficCaseId },
      });
    }
    if (createdTrafficContactId) {
      await prisma.contact.deleteMany({
        where: { id: createdTrafficContactId },
      });
    }
    await prisma.legalCase.deleteMany({
      where: { id: routedCaseId },
    });
    await prisma.contact.deleteMany({
      where: { id: routedContactId },
    });
    await prisma.firm.deleteMany({
      where: { id: firmId },
    });
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
      Promise.allSettled([prisma.$disconnect(), pgPool.end()]),
      new Promise((resolve) => setTimeout(resolve, 1000)),
    ]);
    process.exit(exitCode);
  });
