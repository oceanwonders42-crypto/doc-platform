import crypto from "crypto";
import { Prisma, type MigrationBatchStatus } from "@prisma/client";

import { prisma } from "../db/prisma";
import { pgPool } from "../db/pg";
import { buildBatchClioHandoffExport } from "./batchClioHandoffExport";
import { getEffectiveDocumentReviewState } from "./documentReviewState";
import { ingestMigrationDocument, type MigrationIngestInput, type MigrationIngestResult } from "./migrationIngest";
import { getPaperlessSettings } from "./paperlessSettings";

type BatchImportFile = {
  buffer: Buffer;
  originalName: string;
  mimeType: string;
};

type BatchRecognitionRow = {
  document_id: string;
  client_name: string | null;
  case_number: string | null;
  doc_type: string | null;
  confidence: number | null;
  match_confidence: number | null;
  match_reason: string | null;
};

type BatchCaseRow = {
  id: string;
  title: string | null;
  caseNumber: string | null;
  clientName: string | null;
  status: string;
  clientContact: {
    fullName: string;
    firstName: string | null;
    lastName: string | null;
  } | null;
};

type BatchDocumentRow = Awaited<ReturnType<typeof loadBatchDocuments>>[number];

type BatchImportDependencies = {
  ingestDocument?: (input: MigrationIngestInput) => Promise<MigrationIngestResult>;
};

export type MigrationBatchImportResult = {
  batchId: string;
  documentIds: string[];
  failures: Array<{ originalName: string; error: string }>;
};

export type MigrationBatchReviewFlag = {
  code: string;
  severity: "warning" | "error";
  documentId: string;
  message: string;
};

export type MigrationBatchContactCandidate = {
  key: string;
  fullName: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string | null;
  confidence: number | null;
  matterTypes: string[];
  caseNumbers: string[];
  sourceDocumentIds: string[];
  sourceDocumentNames: string[];
  needsReview: boolean;
};

export type MigrationBatchMatterCandidate = {
  key: string;
  matterType: string;
  description: string;
  customNumber: string;
  status: string;
  clientFullName: string;
  confidence: number | null;
  routedCaseId: string | null;
  trafficMatterId: string | null;
  sourceDocumentIds: string[];
  sourceDocumentNames: string[];
  needsReview: boolean;
  exportReady: boolean;
};

export type MigrationBatchHandoffHistoryItem = {
  exportId: string;
  exportedAt: string;
  actorLabel: string | null;
  archiveFileName: string | null;
  archiveAvailable: boolean;
  contactsFileName: string | null;
  mattersFileName: string | null;
  includedCaseCount: number;
  skippedCaseCount: number;
};

export type MigrationBatchHandoffReadiness = {
  state: "PROCESSING" | "NEEDS_REVIEW" | "READY_FOR_HANDOFF" | "HANDED_OFF";
  canFinalize: boolean;
  canDownloadPackage: boolean;
  nextAction: string;
  issueCount: number;
  blockingIssueCount: number;
  warningIssueCount: number;
  contactCount: number;
  contactNeedsReviewCount: number;
  matterCount: number;
  matterNeedsReviewCount: number;
  matterExportReadyCount: number;
  routedDocumentCount: number;
  approvedDocumentCount: number;
  exportReadyDocumentCount: number;
  inReviewDocumentCount: number;
  rejectedDocumentCount: number;
  failedDocumentCount: number;
};

export type MigrationBatchDetail = {
  batch: {
    id: string;
    firmId: string;
    label: string | null;
    source: string;
    status: MigrationBatchStatus;
    createdByUserId: string | null;
    createdAt: string;
    updatedAt: string;
    completedAt: string | null;
    lastExportedAt: string | null;
  };
  total: number;
  byStatus: Record<string, number>;
  byStage: Record<string, number>;
  documentIds: string[];
  documents: Array<{
    id: string;
    originalName: string;
    status: string;
    processingStage: string;
    reviewState: string | null;
    routedCaseId: string | null;
    routedCaseNumber: string | null;
    routedCaseTitle: string | null;
    routingStatus: string | null;
    confidence: number | null;
    pageCount: number;
    ingestedAt: string;
    processedAt: string | null;
    failureStage: string | null;
    failureReason: string | null;
    recognition: {
      clientName: string | null;
      caseNumber: string | null;
      docType: string | null;
      matchConfidence: number | null;
      matchReason: string | null;
    } | null;
    trafficMatter: {
      id: string;
      citationNumber: string | null;
      defendantName: string | null;
      reviewRequired: boolean;
      status: string;
    } | null;
  }>;
  failed: Array<{
    id: string;
    originalName: string;
    failureStage: string | null;
    failureReason: string | null;
  }>;
  contactCandidates: MigrationBatchContactCandidate[];
  matterCandidates: MigrationBatchMatterCandidate[];
  reviewFlags: MigrationBatchReviewFlag[];
  exportSummary: {
    routedCaseIds: string[];
    routedCaseNumbers: string[];
    exportReadyCaseIds: string[];
    exportReadyCaseNumbers: string[];
    readyForClioExport: boolean;
    blockedReason: string | null;
    handoffCount: number;
    lastHandoffAt: string | null;
  };
  handoffReadiness: MigrationBatchHandoffReadiness;
  handoffHistory: MigrationBatchHandoffHistoryItem[];
};

export type MigrationBatchFinalizeResult =
  | {
      ok: true;
      markedExportReadyCount: number;
      detail: MigrationBatchDetail;
    }
  | {
      ok: false;
      error: string;
      detail: MigrationBatchDetail;
    };

const REVIEW_ACTIVITY_ACTIONS = [
  "approved",
  "rejected",
  "routed",
  "unrouted",
  "review_state_changed",
  "patched",
  "reprocess",
  "rematch",
  "claimed",
  "unclaimed",
  "bulk_marked_needs_review",
  "bulk_marked_unmatched",
] as const;

function createMigrationBatchId() {
  return `mig_${crypto.randomBytes(10).toString("hex")}`;
}

function trimToNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeNameKey(value: string | null, dateOfBirth: Date | null = null): string | null {
  const trimmed = trimToNull(value);
  if (!trimmed) return null;
  const normalized = trimmed.toLowerCase().replace(/\s+/g, " ");
  const dobPart = dateOfBirth ? `:${dateOfBirth.toISOString().slice(0, 10)}` : "";
  return `${normalized}${dobPart}`;
}

function splitName(fullName: string | null): { firstName: string; lastName: string } {
  const trimmed = trimToNull(fullName);
  if (!trimmed) return { firstName: "", lastName: "" };
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return { firstName: "", lastName: parts[0] };
  return {
    firstName: parts[0] ?? "",
    lastName: parts.slice(1).join(" "),
  };
}

function pushUnique(target: string[], value: string | null | undefined) {
  const trimmed = trimToNull(value);
  if (!trimmed || target.includes(trimmed)) return;
  target.push(trimmed);
}

function toDisplayMatterStatus(value: string | null | undefined): string {
  const normalized = trimToNull(value)?.toLowerCase();
  if (normalized === "closed") return "Closed";
  if (normalized === "pending") return "Pending";
  if (normalized === "review_required") return "Review Required";
  if (normalized === "new_citation") return "New Citation";
  return "Open";
}

async function loadBatchDocuments(firmId: string, batchId: string) {
  return prisma.document.findMany({
    where: { firmId, migrationBatchId: batchId },
    orderBy: [{ ingestedAt: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      originalName: true,
      status: true,
      processingStage: true,
      reviewState: true,
      routedCaseId: true,
      routingStatus: true,
      confidence: true,
      pageCount: true,
      ingestedAt: true,
      processedAt: true,
      failureStage: true,
      failureReason: true,
    },
  });
}

async function loadRecognitionRows(documentIds: string[]): Promise<Map<string, BatchRecognitionRow>> {
  if (documentIds.length === 0) return new Map();
  const { rows } = await pgPool.query<BatchRecognitionRow>(
    `select
       document_id,
       client_name,
       case_number,
       doc_type,
       confidence,
       match_confidence,
       match_reason
     from document_recognition
     where document_id = any($1)`,
    [documentIds]
  );
  return new Map(rows.map((row) => [row.document_id, row]));
}

async function loadCases(firmId: string, caseIds: string[]): Promise<Map<string, BatchCaseRow>> {
  if (caseIds.length === 0) return new Map();
  const items = await prisma.legalCase.findMany({
    where: { firmId, id: { in: caseIds } },
    select: {
      id: true,
      title: true,
      caseNumber: true,
      clientName: true,
      status: true,
      clientContact: {
        select: {
          fullName: true,
          firstName: true,
          lastName: true,
        },
      },
    },
  });
  return new Map(items.map((item) => [item.id, item]));
}

async function loadBatchHandoffHistory(firmId: string, batchId: string): Promise<MigrationBatchHandoffHistoryItem[]> {
  const items = await prisma.migrationBatchClioHandoff.findMany({
    where: { firmId, batchId },
    orderBy: [{ createdAt: "desc" }],
    include: {
      clioHandoffExport: {
        select: {
          id: true,
          exportedAt: true,
          actorLabel: true,
          archiveFileName: true,
          archiveStorageKey: true,
          contactsFileName: true,
          mattersFileName: true,
          memberships: {
            select: {
              status: true,
            },
          },
        },
      },
    },
  });

  return items.map((item) => {
    const includedCaseCount = item.clioHandoffExport.memberships.filter(
      (membership) => membership.status === "INCLUDED"
    ).length;
    const skippedCaseCount = item.clioHandoffExport.memberships.filter(
      (membership) => membership.status === "SKIPPED"
    ).length;
    return {
      exportId: item.clioHandoffExport.id,
      exportedAt: item.clioHandoffExport.exportedAt.toISOString(),
      actorLabel: item.clioHandoffExport.actorLabel ?? null,
      archiveFileName: item.clioHandoffExport.archiveFileName ?? null,
      archiveAvailable: item.clioHandoffExport.archiveStorageKey != null,
      contactsFileName: item.clioHandoffExport.contactsFileName ?? null,
      mattersFileName: item.clioHandoffExport.mattersFileName ?? null,
      includedCaseCount,
      skippedCaseCount,
    };
  });
}

async function loadLastReviewedAtForBatch(
  firmId: string,
  documentIds: string[]
): Promise<string | null> {
  if (documentIds.length === 0) return null;
  const latestEvent = await prisma.documentAuditEvent.findFirst({
    where: {
      firmId,
      documentId: { in: documentIds },
      action: { in: [...REVIEW_ACTIVITY_ACTIONS] },
    },
    orderBy: [{ createdAt: "desc" }],
    select: { createdAt: true },
  });
  return latestEvent?.createdAt?.toISOString() ?? null;
}

function buildReviewFlags(
  doc: BatchDocumentRow,
  recognition: BatchRecognitionRow | undefined,
  trafficMatter: Awaited<ReturnType<typeof loadTrafficMatters>>[number] | undefined
): MigrationBatchReviewFlag[] {
  const flags: MigrationBatchReviewFlag[] = [];
  const effectiveReviewState = getEffectiveDocumentReviewState(doc);
  const clientName = trimToNull(trafficMatter?.defendantName) ?? trimToNull(recognition?.client_name);
  const caseNumber = trimToNull(recognition?.case_number) ?? trimToNull(trafficMatter?.citationNumber);
  const matchConfidence =
    recognition?.match_confidence == null ? null : Number(recognition.match_confidence);

  if (doc.status === "FAILED") {
    flags.push({
      code: "failed_processing",
      severity: "error",
      documentId: doc.id,
      message: `Processing failed for ${doc.originalName}.`,
    });
  }
  if (doc.status === "UNMATCHED") {
    flags.push({
      code: "unmatched_document",
      severity: "warning",
      documentId: doc.id,
      message: `${doc.originalName} is still unmatched and needs staff review.`,
    });
  }
  if (doc.status === "NEEDS_REVIEW" || effectiveReviewState === "IN_REVIEW") {
    flags.push({
      code: "needs_review",
      severity: "warning",
      documentId: doc.id,
      message: `${doc.originalName} still needs review before export.`,
    });
  }
  if (!clientName) {
    flags.push({
      code: "missing_contact_candidate",
      severity: "warning",
      documentId: doc.id,
      message: `${doc.originalName} did not yield a client/contact candidate.`,
    });
  }
  if (!trafficMatter && !doc.routedCaseId && !caseNumber) {
    flags.push({
      code: "missing_matter_identifier",
      severity: "warning",
      documentId: doc.id,
      message: `${doc.originalName} is missing a case number or routed case.`,
    });
  }
  if (trafficMatter?.reviewRequired) {
    flags.push({
      code: "traffic_review_required",
      severity: "warning",
      documentId: doc.id,
      message: `${doc.originalName} created a traffic matter that still needs review.`,
    });
  }
  if (doc.routedCaseId == null && matchConfidence != null && matchConfidence > 0 && matchConfidence < 0.9) {
    flags.push({
      code: "low_case_match_confidence",
      severity: "warning",
      documentId: doc.id,
      message: `${doc.originalName} only has a low-confidence case suggestion.`,
    });
  }

  return flags;
}

async function loadTrafficMatters(firmId: string, documentIds: string[]) {
  if (documentIds.length === 0) return [];
  return prisma.trafficMatter.findMany({
    where: {
      firmId,
      sourceDocumentId: { in: documentIds },
    },
    select: {
      id: true,
      caseId: true,
      sourceDocumentId: true,
      defendantName: true,
      defendantDob: true,
      citationNumber: true,
      matterType: true,
      status: true,
      reviewRequired: true,
      routingConfidence: true,
    },
  });
}

function deriveMatterCandidateKey(
  doc: BatchDocumentRow,
  recognition: BatchRecognitionRow | undefined,
  trafficMatter: Awaited<ReturnType<typeof loadTrafficMatters>>[number] | undefined
) {
  if (trafficMatter) return `traffic:${trafficMatter.id}`;
  if (doc.routedCaseId) return `case:${doc.routedCaseId}`;
  const caseNumber = trimToNull(recognition?.case_number);
  if (caseNumber) return `case-number:${caseNumber.toLowerCase()}`;
  return `document:${doc.id}`;
}

function pickMatterClientName(
  routedCase: BatchCaseRow | undefined,
  recognition: BatchRecognitionRow | undefined,
  trafficMatter: Awaited<ReturnType<typeof loadTrafficMatters>>[number] | undefined
) {
  return (
    trimToNull(routedCase?.clientContact?.fullName) ??
    trimToNull(routedCase?.clientName) ??
    trimToNull(trafficMatter?.defendantName) ??
    trimToNull(recognition?.client_name) ??
    ""
  );
}

function pickMatterDescription(
  doc: BatchDocumentRow,
  routedCase: BatchCaseRow | undefined,
  recognition: BatchRecognitionRow | undefined,
  trafficMatter: Awaited<ReturnType<typeof loadTrafficMatters>>[number] | undefined
) {
  if (trimToNull(routedCase?.title)) return trimToNull(routedCase?.title) as string;
  if (trafficMatter) {
    const suffix =
      trimToNull(trafficMatter.citationNumber) ??
      trimToNull(trafficMatter.defendantName) ??
      doc.originalName;
    return `Traffic matter ${suffix}`;
  }
  const clientName = trimToNull(recognition?.client_name);
  if (clientName) return `Matter for ${clientName}`;
  const caseNumber = trimToNull(recognition?.case_number);
  if (caseNumber) return `Matter ${caseNumber}`;
  return `Scanned matter ${doc.originalName}`;
}

function getBatchBlockedReason(input: {
  flags: MigrationBatchReviewFlag[];
  routedCaseIds: string[];
  exportReadyCaseIds: string[];
  approvedDocumentCount: number;
}): string | null {
  if (input.flags.length > 0) return "Resolve review flags before exporting this migration batch.";
  if (input.routedCaseIds.length === 0) return "Route scanned documents to matters before exporting to Clio.";
  if (input.exportReadyCaseIds.length === 0) {
    if (input.approvedDocumentCount > 0) {
      return "Finalize approved routed documents before downloading the Clio handoff package.";
    }
    return "Mark routed documents export-ready before downloading the Clio handoff package.";
  }
  return null;
}

function deriveBatchStatus(input: {
  totalDocuments: number;
  byStatus: Record<string, number>;
  byStage: Record<string, number>;
  reviewFlags: MigrationBatchReviewFlag[];
  routedCaseIds: string[];
  exportReadyCaseIds: string[];
  handoffHistory: MigrationBatchHandoffHistoryItem[];
}): MigrationBatchStatus {
  if (input.totalDocuments === 0) return "UPLOADED";
  const processingCount =
    (input.byStatus.RECEIVED ?? 0) + (input.byStatus.PROCESSING ?? 0);
  const completeStageCount = input.byStage.complete ?? 0;
  if (processingCount > 0 || completeStageCount < input.totalDocuments) {
    return "PROCESSING";
  }
  if ((input.byStatus.FAILED ?? 0) === input.totalDocuments) {
    return "FAILED";
  }
  if (input.reviewFlags.length > 0) {
    return "NEEDS_REVIEW";
  }
  if (input.routedCaseIds.length === 0 || input.exportReadyCaseIds.length === 0) {
    return "NEEDS_REVIEW";
  }
  if (input.handoffHistory.length > 0) {
    return "EXPORTED";
  }
  return "READY_FOR_EXPORT";
}

function buildHandoffReadiness(input: {
  batchStatus: MigrationBatchStatus;
  handoffHistory: MigrationBatchHandoffHistoryItem[];
  blockedReason: string | null;
  contactCandidates: MigrationBatchContactCandidate[];
  matterCandidates: MigrationBatchMatterCandidate[];
  reviewFlags: MigrationBatchReviewFlag[];
  routedDocumentCount: number;
  approvedDocumentCount: number;
  exportReadyDocumentCount: number;
  inReviewDocumentCount: number;
  rejectedDocumentCount: number;
  failedDocumentCount: number;
}): MigrationBatchHandoffReadiness {
  const blockingIssueCount = input.reviewFlags.filter((flag) => flag.severity === "error").length;
  const warningIssueCount = input.reviewFlags.filter((flag) => flag.severity !== "error").length;
  const state: MigrationBatchHandoffReadiness["state"] =
    input.handoffHistory.length > 0
      ? "HANDED_OFF"
      : input.batchStatus === "PROCESSING" || input.batchStatus === "UPLOADED"
        ? "PROCESSING"
        : input.blockedReason
          ? "NEEDS_REVIEW"
          : "READY_FOR_HANDOFF";
  const canFinalize =
    input.handoffHistory.length === 0 &&
    input.reviewFlags.length === 0 &&
    input.routedDocumentCount > 0 &&
    input.approvedDocumentCount > 0;
  const canDownloadPackage =
    input.handoffHistory.length > 0 ||
    (input.blockedReason === null && input.exportReadyDocumentCount > 0);
  let nextAction = "Download the final Clio handoff package.";
  if (state === "PROCESSING") {
    nextAction = "Wait for the batch to finish processing before review.";
  } else if (state === "HANDED_OFF") {
    nextAction = "Download the latest Clio handoff package or review prior handoff history.";
  } else if (input.reviewFlags.length > 0) {
    nextAction = "Review and fix the flagged contacts, matters, or documents before handoff.";
  } else if (input.routedDocumentCount === 0) {
    nextAction = "Route the batch documents to matters before handoff.";
  } else if (input.exportReadyDocumentCount === 0 && input.approvedDocumentCount > 0) {
    nextAction = "Finalize approved routed documents to mark the batch ready for Clio handoff.";
  } else if (input.exportReadyDocumentCount === 0) {
    nextAction = "Approve or fix routed documents so they become export-ready for handoff.";
  }

  return {
    state,
    canFinalize,
    canDownloadPackage,
    nextAction,
    issueCount: input.reviewFlags.length,
    blockingIssueCount,
    warningIssueCount,
    contactCount: input.contactCandidates.length,
    contactNeedsReviewCount: input.contactCandidates.filter((candidate) => candidate.needsReview).length,
    matterCount: input.matterCandidates.length,
    matterNeedsReviewCount: input.matterCandidates.filter((candidate) => candidate.needsReview).length,
    matterExportReadyCount: input.matterCandidates.filter((candidate) => candidate.exportReady).length,
    routedDocumentCount: input.routedDocumentCount,
    approvedDocumentCount: input.approvedDocumentCount,
    exportReadyDocumentCount: input.exportReadyDocumentCount,
    inReviewDocumentCount: input.inReviewDocumentCount,
    rejectedDocumentCount: input.rejectedDocumentCount,
    failedDocumentCount: input.failedDocumentCount,
  };
}

export async function importMigrationBatch(
  input: {
    firmId: string;
    label?: string | null;
    createdByUserId?: string | null;
    files: BatchImportFile[];
  },
  dependencies: BatchImportDependencies = {}
): Promise<MigrationBatchImportResult> {
  const batchId = createMigrationBatchId();
  const ingestDocument = dependencies.ingestDocument ?? ingestMigrationDocument;

  await prisma.migrationBatch.create({
    data: {
      id: batchId,
      firmId: input.firmId,
      label: trimToNull(input.label),
      createdByUserId: trimToNull(input.createdByUserId),
      status: "UPLOADED",
    },
  });

  const documentIds: string[] = [];
  const failures: Array<{ originalName: string; error: string }> = [];

  for (const file of input.files) {
    const result = await ingestDocument({
      firmId: input.firmId,
      batchId,
      buffer: file.buffer,
      originalName: file.originalName,
      mimeType: file.mimeType,
    });
    if (result.ok) {
      documentIds.push(result.documentId);
    } else {
      failures.push({
        originalName: file.originalName,
        error: result.error,
      });
    }
  }

  await syncMigrationBatchLifecycle(input.firmId, batchId);

  return {
    batchId,
    documentIds,
    failures,
  };
}

export async function syncMigrationBatchLifecycle(
  firmId: string,
  batchId: string
): Promise<MigrationBatchStatus> {
  const [documents, handoffHistory] = await Promise.all([
    loadBatchDocuments(firmId, batchId),
    loadBatchHandoffHistory(firmId, batchId),
  ]);
  const documentIds = documents.map((doc) => doc.id);
  const [recognitionByDocumentId, trafficMatters] = await Promise.all([
    loadRecognitionRows(documentIds),
    loadTrafficMatters(firmId, documentIds),
  ]);
  const trafficByDocumentId = new Map(
    trafficMatters.map((item) => [item.sourceDocumentId ?? "", item])
  );

  const byStatus: Record<string, number> = {};
  const byStage: Record<string, number> = {};
  const reviewFlags: MigrationBatchReviewFlag[] = [];
  const routedCaseIds = new Set<string>();
  const exportReadyCaseIds = new Set<string>();

  for (const doc of documents) {
    byStatus[doc.status] = (byStatus[doc.status] ?? 0) + 1;
    byStage[doc.processingStage] = (byStage[doc.processingStage] ?? 0) + 1;
    if (doc.routedCaseId) routedCaseIds.add(doc.routedCaseId);
    if (doc.routedCaseId && getEffectiveDocumentReviewState(doc) === "EXPORT_READY") {
      exportReadyCaseIds.add(doc.routedCaseId);
    }
    reviewFlags.push(
      ...buildReviewFlags(doc, recognitionByDocumentId.get(doc.id), trafficByDocumentId.get(doc.id))
    );
  }

  const nextStatus = deriveBatchStatus({
    totalDocuments: documents.length,
    byStatus,
    byStage,
    reviewFlags,
    routedCaseIds: [...routedCaseIds],
    exportReadyCaseIds: [...exportReadyCaseIds],
    handoffHistory,
  });

  await prisma.migrationBatch.update({
    where: { id: batchId },
    data: {
      status: nextStatus,
      completedAt:
        (byStatus.RECEIVED ?? 0) + (byStatus.PROCESSING ?? 0) === 0 && documents.length > 0
          ? new Date()
          : null,
      lastExportedAt:
        handoffHistory.length > 0 ? new Date(handoffHistory[0].exportedAt) : null,
    },
  });

  return nextStatus;
}

export async function listMigrationBatches(firmId: string) {
  const batches = await prisma.migrationBatch.findMany({
    where: { firmId },
    orderBy: [{ createdAt: "desc" }],
  });

  const items = await Promise.all(
    batches.map(async (batch) => {
      const detail = await getMigrationBatchDetail(firmId, batch.id);
      const unresolvedReviewCount = new Set(detail.reviewFlags.map((flag) => flag.documentId)).size;
      const lastReviewedAt = await loadLastReviewedAtForBatch(firmId, detail.documentIds);
      const processedDocuments = Math.min(detail.total, detail.byStage.complete ?? 0);
      const remainingDocuments = Math.max(0, detail.total - processedDocuments);
      return {
        id: detail.batch.id,
        label: detail.batch.label,
        status: detail.batch.status,
        createdAt: detail.batch.createdAt,
        updatedAt: detail.batch.updatedAt,
        completedAt: detail.batch.completedAt,
        totalDocuments: detail.total,
        processedDocuments,
        remainingDocuments,
        needsReviewCount: unresolvedReviewCount,
        unresolvedReviewCount,
        lastReviewedAt,
        routedCaseCount: detail.exportSummary.routedCaseIds.length,
        handoffCount: detail.exportSummary.handoffCount,
        lastExportedAt: detail.exportSummary.lastHandoffAt,
      };
    })
  );

  return items;
}

export async function getMigrationBatchDetail(
  firmId: string,
  batchId: string
): Promise<MigrationBatchDetail> {
  const batch = await prisma.migrationBatch.findFirst({
    where: { id: batchId, firmId },
    select: {
      id: true,
      firmId: true,
      label: true,
      source: true,
      status: true,
      createdByUserId: true,
      createdAt: true,
      updatedAt: true,
      completedAt: true,
      lastExportedAt: true,
    },
  });
  if (!batch) {
    throw new Error("Migration batch not found");
  }

  const documents = await loadBatchDocuments(firmId, batchId);
  const documentIds = documents.map((doc) => doc.id);
  const [recognitionByDocumentId, trafficMatters, handoffHistory, paperlessSettings] = await Promise.all([
    loadRecognitionRows(documentIds),
    loadTrafficMatters(firmId, documentIds),
    loadBatchHandoffHistory(firmId, batchId),
    getPaperlessSettings(firmId),
  ]);

  const trafficByDocumentId = new Map(
    trafficMatters.map((item) => [item.sourceDocumentId ?? "", item])
  );
  const relatedCaseIds = [
    ...new Set(
      [
        ...documents.map((doc) => doc.routedCaseId).filter((value): value is string => !!value),
        ...trafficMatters.map((item) => item.caseId).filter((value): value is string => !!value),
      ]
    ),
  ];
  const caseById = await loadCases(firmId, relatedCaseIds);

  const byStatus: Record<string, number> = {};
  const byStage: Record<string, number> = {};
  const reviewFlags: MigrationBatchReviewFlag[] = [];
  const failed: MigrationBatchDetail["failed"] = [];
  const contactCandidateMap = new Map<string, MigrationBatchContactCandidate>();
  const matterCandidateMap = new Map<string, MigrationBatchMatterCandidate>();
  const routedCaseIds = new Set<string>();
  const routedCaseNumbers = new Set<string>();
  const exportReadyCaseIds = new Set<string>();
  const exportReadyCaseNumbers = new Set<string>();
  let routedDocumentCount = 0;
  let approvedDocumentCount = 0;
  let exportReadyDocumentCount = 0;
  let inReviewDocumentCount = 0;
  let rejectedDocumentCount = 0;
  let failedDocumentCount = 0;

  const detailDocuments: MigrationBatchDetail["documents"] = documents.map((doc) => {
    const recognition = recognitionByDocumentId.get(doc.id);
    const trafficMatter = trafficByDocumentId.get(doc.id);
    const routedCase = doc.routedCaseId ? caseById.get(doc.routedCaseId) : undefined;
    const effectiveReviewState = getEffectiveDocumentReviewState(doc);
    const docFlags = buildReviewFlags(doc, recognition, trafficMatter);

    byStatus[doc.status] = (byStatus[doc.status] ?? 0) + 1;
    byStage[doc.processingStage] = (byStage[doc.processingStage] ?? 0) + 1;
    reviewFlags.push(...docFlags);

    if (doc.status === "FAILED") {
      failedDocumentCount += 1;
      failed.push({
        id: doc.id,
        originalName: doc.originalName,
        failureStage: doc.failureStage ?? null,
        failureReason: doc.failureReason ?? null,
      });
    }

    if (doc.routedCaseId) {
      routedDocumentCount += 1;
      routedCaseIds.add(doc.routedCaseId);
      if (trimToNull(routedCase?.caseNumber)) {
        routedCaseNumbers.add(trimToNull(routedCase?.caseNumber) as string);
      }
    }
    if (effectiveReviewState === "APPROVED") {
      approvedDocumentCount += 1;
    } else if (effectiveReviewState === "EXPORT_READY") {
      exportReadyDocumentCount += 1;
      if (doc.routedCaseId) {
        exportReadyCaseIds.add(doc.routedCaseId);
        if (trimToNull(routedCase?.caseNumber)) {
          exportReadyCaseNumbers.add(trimToNull(routedCase?.caseNumber) as string);
        }
      }
    } else if (effectiveReviewState === "IN_REVIEW") {
      inReviewDocumentCount += 1;
    } else if (effectiveReviewState === "REJECTED") {
      rejectedDocumentCount += 1;
    }

    const contactName =
      trimToNull(trafficMatter?.defendantName) ??
      trimToNull(routedCase?.clientContact?.fullName) ??
      trimToNull(routedCase?.clientName) ??
      trimToNull(recognition?.client_name);
    const contactKey = normalizeNameKey(contactName, trafficMatter?.defendantDob ?? null);
    if (contactKey && contactName) {
      const candidate =
        contactCandidateMap.get(contactKey) ??
        {
          key: contactKey,
          fullName: contactName,
          ...splitName(contactName),
          dateOfBirth: trafficMatter?.defendantDob?.toISOString() ?? null,
          confidence:
            trafficMatter?.routingConfidence != null
              ? Number(trafficMatter.routingConfidence)
              : recognition?.confidence != null
                ? Number(recognition.confidence)
                : doc.confidence != null
                  ? Number(doc.confidence)
                  : null,
          matterTypes: [],
          caseNumbers: [],
          sourceDocumentIds: [],
          sourceDocumentNames: [],
          needsReview: false,
        } satisfies MigrationBatchContactCandidate;
      pushUnique(candidate.matterTypes, trafficMatter?.matterType ?? recognition?.doc_type ?? "LEGAL");
      pushUnique(candidate.caseNumbers, routedCase?.caseNumber ?? recognition?.case_number ?? trafficMatter?.citationNumber);
      pushUnique(candidate.sourceDocumentIds, doc.id);
      pushUnique(candidate.sourceDocumentNames, doc.originalName);
      candidate.needsReview ||= docFlags.length > 0;
      contactCandidateMap.set(contactKey, candidate);
    }

    const matterKey = deriveMatterCandidateKey(doc, recognition, trafficMatter);
    const clientFullName = pickMatterClientName(routedCase, recognition, trafficMatter);
    const matterCandidate =
      matterCandidateMap.get(matterKey) ??
      {
        key: matterKey,
        matterType: trafficMatter?.matterType ?? recognition?.doc_type ?? "LEGAL",
        description: pickMatterDescription(doc, routedCase, recognition, trafficMatter),
        customNumber:
          trimToNull(routedCase?.caseNumber) ??
          trimToNull(trafficMatter?.citationNumber) ??
          trimToNull(recognition?.case_number) ??
          doc.id,
        status: toDisplayMatterStatus(routedCase?.status ?? trafficMatter?.status),
        clientFullName,
        confidence:
          trafficMatter?.routingConfidence != null
            ? Number(trafficMatter.routingConfidence)
            : recognition?.match_confidence != null
              ? Number(recognition.match_confidence)
              : recognition?.confidence != null
                ? Number(recognition.confidence)
                : doc.confidence != null
                  ? Number(doc.confidence)
                  : null,
        routedCaseId: doc.routedCaseId ?? null,
        trafficMatterId: trafficMatter?.id ?? null,
        sourceDocumentIds: [],
        sourceDocumentNames: [],
        needsReview: false,
        exportReady: false,
      } satisfies MigrationBatchMatterCandidate;
    pushUnique(matterCandidate.sourceDocumentIds, doc.id);
    pushUnique(matterCandidate.sourceDocumentNames, doc.originalName);
    matterCandidate.needsReview ||= docFlags.length > 0;
    matterCandidate.exportReady ||= doc.routedCaseId != null && effectiveReviewState === "EXPORT_READY";
    matterCandidateMap.set(matterKey, matterCandidate);

    return {
      id: doc.id,
      originalName: doc.originalName,
      status: doc.status,
      processingStage: doc.processingStage,
      reviewState: effectiveReviewState,
      routedCaseId: doc.routedCaseId ?? null,
      routedCaseNumber: routedCase?.caseNumber ?? null,
      routedCaseTitle: routedCase?.title ?? null,
      routingStatus: doc.routingStatus ?? null,
      confidence: doc.confidence != null ? Number(doc.confidence) : null,
      pageCount: doc.pageCount ?? 0,
      ingestedAt: doc.ingestedAt.toISOString(),
      processedAt: doc.processedAt?.toISOString() ?? null,
      failureStage: doc.failureStage ?? null,
      failureReason: doc.failureReason ?? null,
      recognition: recognition
        ? {
            clientName: recognition.client_name ?? null,
            caseNumber: recognition.case_number ?? null,
            docType: recognition.doc_type ?? null,
            matchConfidence:
              recognition.match_confidence != null ? Number(recognition.match_confidence) : null,
            matchReason: recognition.match_reason ?? null,
          }
        : null,
      trafficMatter: trafficMatter
        ? {
            id: trafficMatter.id,
            citationNumber: trafficMatter.citationNumber ?? null,
            defendantName: trafficMatter.defendantName ?? null,
            reviewRequired: trafficMatter.reviewRequired,
            status: trafficMatter.status,
          }
        : null,
    };
  });

  const nextStatus = deriveBatchStatus({
    totalDocuments: documents.length,
    byStatus,
    byStage,
    reviewFlags,
    routedCaseIds: [...routedCaseIds],
    exportReadyCaseIds: [...exportReadyCaseIds],
    handoffHistory,
  });

  await prisma.migrationBatch.update({
    where: { id: batchId },
    data: {
      status: nextStatus,
      completedAt:
        (byStatus.RECEIVED ?? 0) + (byStatus.PROCESSING ?? 0) === 0 && documents.length > 0
          ? new Date()
          : null,
      lastExportedAt:
        handoffHistory.length > 0 ? new Date(handoffHistory[0].exportedAt) : null,
    },
  });

  const filteredReviewFlags =
    paperlessSettings.reviewRequiredBeforeExport === false
      ? reviewFlags.filter((flag) => flag.code !== "needs_review")
      : reviewFlags;
  const blockedReason = getBatchBlockedReason({
    flags: filteredReviewFlags,
    routedCaseIds: [...routedCaseIds],
    exportReadyCaseIds: [...exportReadyCaseIds],
    approvedDocumentCount,
  });
  const handoffReadiness = buildHandoffReadiness({
    batchStatus: nextStatus,
    handoffHistory,
    blockedReason,
    contactCandidates: [...contactCandidateMap.values()],
    matterCandidates: [...matterCandidateMap.values()],
    reviewFlags: filteredReviewFlags,
    routedDocumentCount,
    approvedDocumentCount,
    exportReadyDocumentCount,
    inReviewDocumentCount,
    rejectedDocumentCount,
    failedDocumentCount,
  });

  return {
    batch: {
      id: batch.id,
      firmId: batch.firmId,
      label: batch.label ?? null,
      source: batch.source,
      status: nextStatus,
      createdByUserId: batch.createdByUserId ?? null,
      createdAt: batch.createdAt.toISOString(),
      updatedAt: batch.updatedAt.toISOString(),
      completedAt:
        (byStatus.RECEIVED ?? 0) + (byStatus.PROCESSING ?? 0) === 0 && documents.length > 0
          ? new Date().toISOString()
          : batch.completedAt?.toISOString() ?? null,
      lastExportedAt:
        handoffHistory.length > 0
          ? handoffHistory[0].exportedAt
          : batch.lastExportedAt?.toISOString() ?? null,
    },
    total: documents.length,
    byStatus,
    byStage,
    documentIds,
    documents: detailDocuments,
    failed,
    contactCandidates: [...contactCandidateMap.values()].sort((a, b) =>
      a.fullName.localeCompare(b.fullName, undefined, { sensitivity: "base" })
    ),
    matterCandidates: [...matterCandidateMap.values()].sort((a, b) =>
      a.description.localeCompare(b.description, undefined, { sensitivity: "base" })
    ),
    reviewFlags: filteredReviewFlags,
    exportSummary: {
      routedCaseIds: [...routedCaseIds],
      routedCaseNumbers: [...routedCaseNumbers],
      exportReadyCaseIds: [...exportReadyCaseIds],
      exportReadyCaseNumbers: [...exportReadyCaseNumbers],
      readyForClioExport: filteredReviewFlags.length === 0 && exportReadyCaseIds.size > 0,
      blockedReason,
      handoffCount: handoffHistory.length,
      lastHandoffAt: handoffHistory[0]?.exportedAt ?? null,
    },
    handoffReadiness,
    handoffHistory,
  };
}

export async function buildMigrationBatchClioPreview(
  firmId: string,
  batchId: string,
  options: { allowReexport?: boolean } = {}
) {
  const detail = await getMigrationBatchDetail(firmId, batchId);
  if (detail.exportSummary.exportReadyCaseIds.length === 0) {
    throw new Error("This migration batch does not have any routed cases ready for Clio export.");
  }
  return buildBatchClioHandoffExport({
    firmId,
    caseIds: detail.exportSummary.exportReadyCaseIds,
    allowReexport: options.allowReexport ?? true,
  });
}

export async function finalizeMigrationBatchForClioHandoff(
  firmId: string,
  batchId: string,
  actor: string
): Promise<MigrationBatchFinalizeResult> {
  const detail = await getMigrationBatchDetail(firmId, batchId);
  if (detail.reviewFlags.length > 0) {
    return {
      ok: false,
      error: "Resolve review flags before marking this migration batch ready for Clio handoff.",
      detail,
    };
  }

  const eligibleDocuments = detail.documents.filter(
    (doc) => doc.routedCaseId != null && doc.reviewState === "APPROVED"
  );
  if (eligibleDocuments.length === 0) {
    if (detail.exportSummary.readyForClioExport) {
      return { ok: true, markedExportReadyCount: 0, detail };
    }
    return {
      ok: false,
      error:
        detail.exportSummary.blockedReason ??
        "No approved routed documents are ready to mark export-ready for Clio handoff.",
      detail,
    };
  }

  const eligibleIds = eligibleDocuments.map((doc) => doc.id);
  await prisma.$transaction(async (tx) => {
    await tx.document.updateMany({
      where: { firmId, id: { in: eligibleIds } },
      data: { reviewState: "EXPORT_READY" },
    });
    await tx.documentAuditEvent.createMany({
      data: eligibleDocuments.map((doc) => ({
        documentId: doc.id,
        firmId,
        actor,
        action: "review_state_changed",
        fromCaseId: doc.routedCaseId,
        toCaseId: doc.routedCaseId,
        metaJson: {
          fromReviewState: "APPROVED",
          toReviewState: "EXPORT_READY",
          source: "migration_batch_finalize",
        },
      })),
    });
  });

  await syncMigrationBatchLifecycle(firmId, batchId);
  const finalizedDetail = await getMigrationBatchDetail(firmId, batchId);
  return {
    ok: true,
    markedExportReadyCount: eligibleDocuments.length,
    detail: finalizedDetail,
  };
}

export async function linkMigrationBatchToClioHandoff(
  firmId: string,
  batchId: string,
  clioHandoffExportId: string
) {
  await prisma.migrationBatchClioHandoff.upsert({
    where: {
      batchId_clioHandoffExportId: {
        batchId,
        clioHandoffExportId,
      },
    },
    create: {
      batchId,
      firmId,
      clioHandoffExportId,
    },
    update: {},
  });
  await syncMigrationBatchLifecycle(firmId, batchId);
}
