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
  contactsFileName: string | null;
  mattersFileName: string | null;
  includedCaseCount: number;
  skippedCaseCount: number;
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
    readyForClioExport: boolean;
    blockedReason: string | null;
    handoffCount: number;
    lastHandoffAt: string | null;
  };
  handoffHistory: MigrationBatchHandoffHistoryItem[];
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

function getBatchBlockedReason(flags: MigrationBatchReviewFlag[], routedCaseIds: string[]): string | null {
  if (flags.length > 0) return "Resolve review flags before exporting this migration batch.";
  if (routedCaseIds.length === 0) return "Route scanned documents to matters before exporting to Clio.";
  return null;
}

function deriveBatchStatus(input: {
  totalDocuments: number;
  byStatus: Record<string, number>;
  byStage: Record<string, number>;
  reviewFlags: MigrationBatchReviewFlag[];
  routedCaseIds: string[];
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
  if (input.routedCaseIds.length === 0) {
    return "NEEDS_REVIEW";
  }
  if (input.handoffHistory.length > 0) {
    return "EXPORTED";
  }
  return "READY_FOR_EXPORT";
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

  for (const doc of documents) {
    byStatus[doc.status] = (byStatus[doc.status] ?? 0) + 1;
    byStage[doc.processingStage] = (byStage[doc.processingStage] ?? 0) + 1;
    if (doc.routedCaseId) routedCaseIds.add(doc.routedCaseId);
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
      failed.push({
        id: doc.id,
        originalName: doc.originalName,
        failureStage: doc.failureStage ?? null,
        failureReason: doc.failureReason ?? null,
      });
    }

    if (doc.routedCaseId) {
      routedCaseIds.add(doc.routedCaseId);
      if (trimToNull(routedCase?.caseNumber)) {
        routedCaseNumbers.add(trimToNull(routedCase?.caseNumber) as string);
      }
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
    handoffHistory,
  });

  const blockedReason = getBatchBlockedReason(reviewFlags, [...routedCaseIds]);

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
      readyForClioExport: filteredReviewFlags.length === 0 && routedCaseIds.size > 0,
      blockedReason:
        filteredReviewFlags.length === 0
          ? routedCaseIds.size > 0
            ? null
            : "Route scanned documents to matters before exporting to Clio."
          : blockedReason,
      handoffCount: handoffHistory.length,
      lastHandoffAt: handoffHistory[0]?.exportedAt ?? null,
    },
    handoffHistory,
  };
}

export async function buildMigrationBatchClioPreview(
  firmId: string,
  batchId: string,
  options: { allowReexport?: boolean } = {}
) {
  const detail = await getMigrationBatchDetail(firmId, batchId);
  if (detail.exportSummary.routedCaseIds.length === 0) {
    throw new Error("This migration batch does not have any routed cases ready for Clio export.");
  }
  return buildBatchClioHandoffExport({
    firmId,
    caseIds: detail.exportSummary.routedCaseIds,
    allowReexport: options.allowReexport ?? true,
  });
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
