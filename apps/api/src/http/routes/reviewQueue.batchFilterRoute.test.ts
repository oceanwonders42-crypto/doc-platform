import "dotenv/config";

import { Role } from "@prisma/client";

process.env.ENABLE_INLINE_DOCUMENT_WORKER = "false";

import { pgPool } from "../../db/pg";
import { prisma } from "../../db/prisma";
import { signToken } from "../../lib/jwt";
import { app } from "../server";
import { assert, startTestServer, stopTestServer } from "./cases.batchClioRouteTestUtils";

async function main() {
  const suffix = Date.now();
  const firmId = `review-queue-batch-firm-${suffix}`;
  const actorUserId = `review-queue-batch-user-${suffix}`;
  const batchOneId = `review-queue-batch-one-${suffix}`;
  const batchTwoId = `review-queue-batch-two-${suffix}`;
  const reviewDocId = `review-queue-review-doc-${suffix}`;
  const failedDocId = `review-queue-failed-doc-${suffix}`;
  const otherBatchDocId = `review-queue-other-doc-${suffix}`;

  await prisma.firm.create({
    data: {
      id: firmId,
      name: "Review Queue Batch Filter Test Firm",
    },
  });
  await prisma.migrationBatch.createMany({
    data: [
      {
        id: batchOneId,
        firmId,
        label: "Batch One",
        status: "NEEDS_REVIEW",
        createdByUserId: actorUserId,
      },
      {
        id: batchTwoId,
        firmId,
        label: "Batch Two",
        status: "NEEDS_REVIEW",
        createdByUserId: actorUserId,
      },
    ],
  });
  await prisma.document.createMany({
    data: [
      {
        id: reviewDocId,
        firmId,
        migrationBatchId: batchOneId,
        source: "migration",
        spacesKey: `tests/${reviewDocId}.pdf`,
        originalName: "needs-review.pdf",
        mimeType: "application/pdf",
        pageCount: 2,
        status: "NEEDS_REVIEW",
        processingStage: "case_match",
        routingStatus: "needs_review",
        ingestedAt: new Date(),
        processedAt: new Date(),
        extractedFields: { providerName: "Clinic One", clientName: "Alice Batch" },
      },
      {
        id: failedDocId,
        firmId,
        migrationBatchId: batchOneId,
        source: "migration",
        spacesKey: `tests/${failedDocId}.pdf`,
        originalName: "ocr-failed.pdf",
        mimeType: "application/pdf",
        pageCount: 1,
        status: "FAILED",
        processingStage: "ocr",
        reviewState: "IN_REVIEW",
        failureStage: "ocr",
        failureReason: "OCR timeout",
        ingestedAt: new Date(),
      },
      {
        id: otherBatchDocId,
        firmId,
        migrationBatchId: batchTwoId,
        source: "migration",
        spacesKey: `tests/${otherBatchDocId}.pdf`,
        originalName: "other-batch.pdf",
        mimeType: "application/pdf",
        pageCount: 3,
        status: "NEEDS_REVIEW",
        processingStage: "case_match",
        routingStatus: "needs_review",
        ingestedAt: new Date(),
        processedAt: new Date(),
        extractedFields: { providerName: "Clinic Two", clientName: "Bob Other" },
      },
    ],
  });
  await pgPool.query(
    `insert into document_recognition
      (document_id, client_name, case_number, doc_type, confidence, match_confidence, match_reason, updated_at)
     values
      ($1, $2, $3, 'medical_record', 0.88, 0.72, 'Possible batch match', now()),
      ($4, $5, $6, 'medical_record', 0.91, 0.93, 'Different batch match', now())
     on conflict (document_id) do update set
       client_name = excluded.client_name,
       case_number = excluded.case_number,
       doc_type = excluded.doc_type,
       confidence = excluded.confidence,
       match_confidence = excluded.match_confidence,
       match_reason = excluded.match_reason,
       updated_at = now()`,
    [
      reviewDocId,
      "Alice Batch",
      "BATCH-REVIEW-1",
      otherBatchDocId,
      "Bob Other",
      "BATCH-OTHER-1",
    ]
  );

  const token = signToken({
    userId: actorUserId,
    firmId,
    role: Role.STAFF,
    email: "review-queue-batch@example.com",
  });
  const { baseUrl, server } = await startTestServer(app);

  try {
    const filteredResponse = await fetch(
      `${baseUrl}/me/review-queue?limit=50&migrationBatchId=${encodeURIComponent(batchOneId)}`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );
    assert(filteredResponse.status === 200, `Expected filtered review queue to return 200, got ${filteredResponse.status}`);
    const filteredJson = (await filteredResponse.json()) as {
      items?: Array<{
        id: string;
        migrationBatchId?: string | null;
        reviewReasons?: string[];
        failureStage?: string | null;
        failureReason?: string | null;
      }>;
    };
    assert(Array.isArray(filteredJson.items), "Expected filtered review queue response to include items.");
    assert(filteredJson.items!.length === 2, `Expected 2 batch-filtered review items, got ${filteredJson.items!.length}`);
    assert(
      filteredJson.items!.every((item) => item.migrationBatchId === batchOneId),
      "Expected every returned item to belong to the requested migration batch."
    );
    assert(
      filteredJson.items!.every((item) => item.id !== otherBatchDocId),
      "Expected review queue filter to exclude documents from other migration batches."
    );

    const failedItem = filteredJson.items!.find((item) => item.id === failedDocId);
    assert(!!failedItem, "Expected failed migration document to appear in the filtered review queue.");
    assert(failedItem?.failureStage === "ocr", `Expected failed document failureStage to be ocr, got ${failedItem?.failureStage}`);
    assert(
      failedItem?.failureReason === "OCR timeout",
      `Expected failed document failureReason to be preserved, got ${failedItem?.failureReason}`
    );
    assert(
      failedItem?.reviewReasons?.includes("Processing failed") === true,
      "Expected failed document to include a Processing failed review reason."
    );

    const focusedResponse = await fetch(
      `${baseUrl}/me/review-queue?limit=50&migrationBatchId=${encodeURIComponent(batchOneId)}&documentId=${encodeURIComponent(reviewDocId)}`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );
    assert(focusedResponse.status === 200, `Expected focused review queue to return 200, got ${focusedResponse.status}`);
    const focusedJson = (await focusedResponse.json()) as {
      items?: Array<{ id: string; migrationBatchId?: string | null }>;
    };
    assert((focusedJson.items?.length ?? 0) === 1, `Expected 1 focused review item, got ${focusedJson.items?.length ?? 0}`);
    assert(focusedJson.items?.[0]?.id === reviewDocId, "Expected focused review queue to return the requested document.");
    assert(
      focusedJson.items?.[0]?.migrationBatchId === batchOneId,
      "Expected focused review item to retain its migration batch id."
    );

    console.log("Review queue batch filter route tests passed");
  } finally {
    await stopTestServer(server);
    await pgPool.query(`delete from document_recognition where document_id = any($1)`, [[reviewDocId, otherBatchDocId]]);
    await prisma.document.deleteMany({
      where: { id: { in: [reviewDocId, failedDocId, otherBatchDocId] } },
    });
    await prisma.migrationBatch.deleteMany({
      where: { id: { in: [batchOneId, batchTwoId] } },
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
