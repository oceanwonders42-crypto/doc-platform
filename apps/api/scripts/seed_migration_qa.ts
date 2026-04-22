#!/usr/bin/env node
import "dotenv/config";

import { pgPool } from "../src/db/pg";
import { prisma } from "../src/db/prisma";
import { syncMigrationBatchLifecycle } from "../src/services/migrationBatchWorkflow";

const DEMO_FIRM_NAME = "Demo Firm";

const REVIEW_BATCH_ID = "mig_qa_needs_review";
const READY_BATCH_ID = "mig_qa_ready_export";
const STALE_BATCH_ID = "mig_qa_stale_processing";

const REVIEW_DOC_ID = "mig_qa_review_doc";
const READY_DOC_ID = "mig_qa_ready_doc";
const STALE_DOC_ID = "mig_qa_stale_doc";
const STALE_COMPLETE_DOC_ID = "mig_qa_stale_complete_doc";

function hoursAgo(hours: number): Date {
  return new Date(Date.now() - hours * 60 * 60 * 1000);
}

async function upsertDemoCase(
  firmId: string,
  contactId: string,
  caseId: string,
  fullName: string,
  caseNumber: string,
  title: string
) {
  const [firstName, ...rest] = fullName.split(" ");
  const lastName = rest.join(" ") || null;

  await prisma.contact.upsert({
    where: { id: contactId },
    create: {
      id: contactId,
      firmId,
      fullName,
      firstName: firstName ?? null,
      lastName,
    },
    update: {
      firmId,
      fullName,
      firstName: firstName ?? null,
      lastName,
    },
  });

  await prisma.legalCase.upsert({
    where: { id: caseId },
    create: {
      id: caseId,
      firmId,
      title,
      caseNumber,
      clientName: fullName,
      clientContactId: contactId,
      status: "open",
    },
    update: {
      firmId,
      title,
      caseNumber,
      clientName: fullName,
      clientContactId: contactId,
      status: "open",
    },
  });
}

async function upsertRecognitionRow(input: {
  documentId: string;
  clientName: string | null;
  caseNumber: string | null;
  docType: string;
  confidence: number;
  matchConfidence: number | null;
  matchReason: string | null;
}) {
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
      input.documentId,
      input.clientName,
      input.caseNumber,
      input.docType,
      input.confidence,
      input.matchConfidence,
      input.matchReason,
    ]
  );
}

async function deleteExistingQaData(firmId: string) {
  const batchIds = [REVIEW_BATCH_ID, READY_BATCH_ID, STALE_BATCH_ID];
  const documentIds = [REVIEW_DOC_ID, READY_DOC_ID, STALE_DOC_ID, STALE_COMPLETE_DOC_ID];

  await prisma.documentAuditEvent.deleteMany({ where: { documentId: { in: documentIds } } });
  await prisma.trafficMatter.deleteMany({ where: { sourceDocumentId: { in: documentIds }, firmId } });
  await pgPool.query(`delete from document_recognition where document_id = any($1)`, [documentIds]);
  await prisma.document.deleteMany({ where: { id: { in: documentIds } } });
  await prisma.migrationBatchClioHandoff.deleteMany({ where: { batchId: { in: batchIds } } });
  await prisma.migrationBatch.deleteMany({ where: { id: { in: batchIds }, firmId } });
}

async function createQaDocuments(
  input: Array<{
    id: string;
    firmId: string;
    migrationBatchId: string;
    source: string;
    spacesKey: string;
    originalName: string;
    mimeType: string;
    pageCount: number;
    status: "UPLOADED" | "NEEDS_REVIEW" | "PROCESSING";
    processingStage: "complete" | "extraction";
    reviewState: "IN_REVIEW" | "EXPORT_READY" | null;
    routedCaseId: string | null;
    routedSystem: string | null;
    routingStatus: string;
    confidence: number;
    ingestedAt: Date;
    processedAt: Date | null;
  }>
) {
  for (const document of input) {
    await prisma.document.upsert({
      where: { id: document.id },
      create: {
        id: document.id,
        firmId: document.firmId,
        migrationBatchId: document.migrationBatchId,
        source: document.source,
        spacesKey: document.spacesKey,
        originalName: document.originalName,
        mimeType: document.mimeType,
        pageCount: document.pageCount,
        status: document.status,
        processingStage: document.processingStage,
        reviewState: document.reviewState,
        routedCaseId: document.routedCaseId,
        routedSystem: document.routedSystem,
        routingStatus: document.routingStatus,
        confidence: document.confidence,
        ingestedAt: document.ingestedAt,
        processedAt: document.processedAt,
      },
      update: {
        firmId: document.firmId,
        migrationBatchId: document.migrationBatchId,
        source: document.source,
        spacesKey: document.spacesKey,
        originalName: document.originalName,
        mimeType: document.mimeType,
        pageCount: document.pageCount,
        status: document.status,
        processingStage: document.processingStage,
        reviewState: document.reviewState,
        routedCaseId: document.routedCaseId,
        routedSystem: document.routedSystem,
        routingStatus: document.routingStatus,
        confidence: document.confidence,
        ingestedAt: document.ingestedAt,
        processedAt: document.processedAt,
        failureStage: null,
        failureReason: null,
      },
    });
  }
}

async function main() {
  const firm = await prisma.firm.findFirst({ where: { name: DEMO_FIRM_NAME }, select: { id: true } });
  if (!firm) {
    throw new Error(`Demo firm not found. Run seed_demo_data.ts first.`);
  }

  const firmId = firm.id;
  const reviewCaseId = "demo-case-3";
  const readyCaseId = "demo-case-1";

  await upsertDemoCase(firmId, "demo-contact-1", readyCaseId, "Alice Smith", "DEMO-001", "Smith v. State Farm");
  await upsertDemoCase(firmId, "demo-contact-3", reviewCaseId, "Carol Wilson", "DEMO-003", "Wilson PI Claim");

  await deleteExistingQaData(firmId);

  await prisma.migrationBatch.createMany({
    data: [
      {
        id: REVIEW_BATCH_ID,
        firmId,
        label: "QA Review Batch",
        source: "paperless_scan_batch",
        status: "UPLOADED",
      },
      {
        id: READY_BATCH_ID,
        firmId,
        label: "QA Ready Batch",
        source: "paperless_scan_batch",
        status: "UPLOADED",
      },
      {
        id: STALE_BATCH_ID,
        firmId,
        label: "QA Stale Batch",
        source: "paperless_scan_batch",
        status: "PROCESSING",
      },
    ],
  });

  await createQaDocuments([
    {
      id: REVIEW_DOC_ID,
      firmId,
      migrationBatchId: REVIEW_BATCH_ID,
      source: "migration",
      spacesKey: "qa/migration/review-doc.pdf",
      originalName: "qa-review-doc.pdf",
      mimeType: "application/pdf",
      pageCount: 2,
      status: "NEEDS_REVIEW",
      processingStage: "complete",
      reviewState: "IN_REVIEW",
      routedCaseId: null,
      routedSystem: null,
      routingStatus: "needs_review",
      confidence: 0.74,
      ingestedAt: hoursAgo(3),
      processedAt: hoursAgo(2.5),
    },
    {
      id: READY_DOC_ID,
      firmId,
      migrationBatchId: READY_BATCH_ID,
      source: "migration",
      spacesKey: "qa/migration/ready-doc.pdf",
      originalName: "qa-ready-doc.pdf",
      mimeType: "application/pdf",
      pageCount: 3,
      status: "UPLOADED",
      processingStage: "complete",
      reviewState: "EXPORT_READY",
      routedCaseId: readyCaseId,
      routedSystem: "manual",
      routingStatus: "routed",
      confidence: 0.97,
      ingestedAt: hoursAgo(2),
      processedAt: hoursAgo(1.8),
    },
    {
      id: STALE_DOC_ID,
      firmId,
      migrationBatchId: STALE_BATCH_ID,
      source: "migration",
      spacesKey: "qa/migration/stale-doc.pdf",
      originalName: "qa-stale-doc.pdf",
      mimeType: "application/pdf",
      pageCount: 4,
      status: "PROCESSING",
      processingStage: "extraction",
      reviewState: null,
      routedCaseId: null,
      routedSystem: null,
      routingStatus: "processing",
      confidence: 0.51,
      ingestedAt: hoursAgo(4),
      processedAt: null,
    },
    {
      id: STALE_COMPLETE_DOC_ID,
      firmId,
      migrationBatchId: STALE_BATCH_ID,
      source: "migration",
      spacesKey: "qa/migration/stale-complete-doc.pdf",
      originalName: "qa-stale-complete-doc.pdf",
      mimeType: "application/pdf",
      pageCount: 1,
      status: "UPLOADED",
      processingStage: "complete",
      reviewState: "EXPORT_READY",
      routedCaseId: readyCaseId,
      routedSystem: "manual",
      routingStatus: "routed",
      confidence: 0.9,
      ingestedAt: hoursAgo(4),
      processedAt: hoursAgo(3.7),
    },
  ]);

  await upsertRecognitionRow({
    documentId: REVIEW_DOC_ID,
    clientName: "Carol Wilson",
    caseNumber: "DEMO-003",
    docType: "medical_record",
    confidence: 0.74,
    matchConfidence: 0.62,
    matchReason: "Low-confidence case suggestion",
  });
  await upsertRecognitionRow({
    documentId: READY_DOC_ID,
    clientName: "Alice Smith",
    caseNumber: "DEMO-001",
    docType: "medical_record",
    confidence: 0.97,
    matchConfidence: 0.99,
    matchReason: "Exact case match",
  });
  await upsertRecognitionRow({
    documentId: STALE_DOC_ID,
    clientName: "Pat Pending",
    caseNumber: null,
    docType: "medical_record",
    confidence: 0.51,
    matchConfidence: 0.45,
    matchReason: "Still processing",
  });
  await upsertRecognitionRow({
    documentId: STALE_COMPLETE_DOC_ID,
    clientName: "Alice Smith",
    caseNumber: "DEMO-001",
    docType: "medical_record",
    confidence: 0.9,
    matchConfidence: 0.94,
    matchReason: "Matched routed case",
  });

  await prisma.documentAuditEvent.create({
    data: {
      documentId: REVIEW_DOC_ID,
      firmId,
      actor: "migration-qa-seed",
      action: "claimed",
    },
  });

  await syncMigrationBatchLifecycle(firmId, REVIEW_BATCH_ID);
  await syncMigrationBatchLifecycle(firmId, READY_BATCH_ID);
  await syncMigrationBatchLifecycle(firmId, STALE_BATCH_ID);

  const staleTime = hoursAgo(3);
  await prisma.$executeRawUnsafe(
    `UPDATE "MigrationBatch" SET "createdAt" = $1, "updatedAt" = $1 WHERE id = $2`,
    staleTime,
    STALE_BATCH_ID
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        firmId,
        batches: {
          needsReview: REVIEW_BATCH_ID,
          readyForExport: READY_BATCH_ID,
          staleProcessing: STALE_BATCH_ID,
        },
        documents: {
          reviewDoc: REVIEW_DOC_ID,
          readyDoc: READY_DOC_ID,
          staleDoc: STALE_DOC_ID,
        },
      },
      null,
      2
    )
  );
}

main()
  .then(async () => {
    await Promise.allSettled([prisma.$disconnect(), pgPool.end()]);
    process.exit(0);
  })
  .catch(async (error) => {
    console.error(error);
    await Promise.allSettled([prisma.$disconnect(), pgPool.end()]);
    process.exit(1);
  });
