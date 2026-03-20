import {
  ClioHandoffCaseStatus,
  ClioHandoffExportSubtype,
  ClioHandoffExportType,
  type Prisma,
} from "@prisma/client";

import { prisma as db } from "../db/prisma";
import type { BatchClioHandoffExportResult } from "./batchClioHandoffExport";

type ClioHandoffActorContext = {
  firmId: string;
  userId?: string | null;
  apiKeyId?: string | null;
  authRole?: string | null;
};

type ClioHandoffActorSnapshot = {
  actorType: string | null;
  actorUserId: string | null;
  actorApiKeyId: string | null;
  actorLabel: string | null;
  actorRole: string | null;
};

type SingleCaseSnapshot = {
  id: string;
  caseNumber: string | null;
  title: string | null;
  clientName: string | null;
};

type SingleCaseRecordInput = {
  firmId: string;
  actor: ClioHandoffActorSnapshot;
  exportSubtype: ClioHandoffExportSubtype;
  exportedAt?: Date;
  idempotencyKey?: string | null;
  requestFingerprint?: string | null;
  reExportOverride?: boolean;
  reExportReason?: string | null;
  isReExport?: boolean;
  caseSnapshot: SingleCaseSnapshot;
  fileName: string;
  rowCount: number;
};

type BatchRecordInput = {
  firmId: string;
  actor: ClioHandoffActorSnapshot;
  exportedAt?: Date;
  idempotencyKey?: string | null;
  requestFingerprint?: string | null;
  reExportOverride?: boolean;
  reExportReason?: string | null;
  batchResult: BatchClioHandoffExportResult;
};

export type ClioHandoffCaseSummary = {
  alreadyExported: boolean;
  exportCount: number;
  lastExportedAt: string | null;
  lastExportType: "single_case" | "batch" | null;
  lastExportSubtype: "contacts" | "matters" | "combined_batch" | null;
  lastExportWasReExport: boolean;
  lastActorLabel: string | null;
};

export type ClioHandoffHistoryItem = {
  exportId: string;
  exportedAt: string;
  exportType: "single_case" | "batch";
  exportSubtype: "contacts" | "matters" | "combined_batch";
  actorLabel: string | null;
  actorType: string | null;
  actorRole: string | null;
  archiveFileName: string | null;
  contactsFileName: string | null;
  mattersFileName: string | null;
  manifestFileName: string | null;
  contactsRowCount: number | null;
  mattersRowCount: number | null;
  reExportOverride: boolean;
  reExportReason: string | null;
  includedCases: Array<{
    caseId: string;
    caseNumber: string | null;
    caseTitle: string | null;
    clientName: string | null;
    isReExport: boolean;
  }>;
  skippedCases: Array<{
    caseId: string;
    caseNumber: string | null;
    caseTitle: string | null;
    clientName: string | null;
    reason: string;
  }>;
};

export type CaseClioHandoffHistoryItem = {
  exportId: string;
  exportedAt: string;
  exportType: "single_case" | "batch";
  exportSubtype: "contacts" | "matters" | "combined_batch";
  actorLabel: string | null;
  archiveFileName: string | null;
  contactsFileName: string | null;
  mattersFileName: string | null;
  isReExport: boolean;
};

type FindRecentDuplicateInput = {
  firmId: string;
  exportType: ClioHandoffExportType;
  exportSubtype: ClioHandoffExportSubtype;
  idempotencyKey?: string | null;
  requestFingerprint?: string | null;
  withinMinutes?: number;
};

type ExportWithMemberships = Prisma.ClioHandoffExportGetPayload<{
  include: {
    memberships: true;
  };
}>;

function toExportTypeLabel(value: ClioHandoffExportType): "single_case" | "batch" {
  return value === ClioHandoffExportType.BATCH ? "batch" : "single_case";
}

function toExportSubtypeLabel(
  value: ClioHandoffExportSubtype
): "contacts" | "matters" | "combined_batch" {
  if (value === ClioHandoffExportSubtype.CONTACTS) return "contacts";
  if (value === ClioHandoffExportSubtype.MATTERS) return "matters";
  return "combined_batch";
}

function serializeHistoryItem(item: ExportWithMemberships): ClioHandoffHistoryItem {
  const includedCases = item.memberships
    .filter((membership) => membership.status === ClioHandoffCaseStatus.INCLUDED)
    .map((membership) => ({
      caseId: membership.caseId,
      caseNumber: membership.caseNumber ?? null,
      caseTitle: membership.caseTitle ?? null,
      clientName: membership.clientName ?? null,
      isReExport: membership.isReExport,
    }));
  const skippedCases = item.memberships
    .filter((membership) => membership.status === ClioHandoffCaseStatus.SKIPPED)
    .map((membership) => ({
      caseId: membership.caseId,
      caseNumber: membership.caseNumber ?? null,
      caseTitle: membership.caseTitle ?? null,
      clientName: membership.clientName ?? null,
      reason: membership.skipReason ?? "Skipped",
    }));

  return {
    exportId: item.id,
    exportedAt: item.exportedAt.toISOString(),
    exportType: toExportTypeLabel(item.exportType),
    exportSubtype: toExportSubtypeLabel(item.exportSubtype),
    actorLabel: item.actorLabel ?? null,
    actorType: item.actorType ?? null,
    actorRole: item.actorRole ?? null,
    archiveFileName: item.archiveFileName ?? null,
    contactsFileName: item.contactsFileName ?? null,
    mattersFileName: item.mattersFileName ?? null,
    manifestFileName: item.manifestFileName ?? null,
    contactsRowCount: item.contactsRowCount ?? null,
    mattersRowCount: item.mattersRowCount ?? null,
    reExportOverride: item.reExportOverride,
    reExportReason: item.reExportReason ?? null,
    includedCases,
    skippedCases,
  };
}

export async function resolveClioHandoffActorSnapshot(
  context: ClioHandoffActorContext
): Promise<ClioHandoffActorSnapshot> {
  const userId = context.userId?.trim() || null;
  const apiKeyId = context.apiKeyId?.trim() || null;

  let actorLabel: string | null = null;
  let actorRole = context.authRole?.trim() || null;

  if (userId) {
    const user = await db.user.findFirst({
      where: { id: userId, firmId: context.firmId },
      select: { email: true, role: true },
    });
    if (user) {
      actorLabel = user.email;
      actorRole = user.role;
    } else {
      actorLabel = userId;
    }
  }

  if (apiKeyId) {
    const apiKey = await db.apiKey.findFirst({
      where: { id: apiKeyId, firmId: context.firmId },
      select: { name: true, keyPrefix: true },
    });
    const apiKeyLabel = apiKey ? `${apiKey.name} (${apiKey.keyPrefix})` : apiKeyId;
    actorLabel = actorLabel ? `${actorLabel} via ${apiKeyLabel}` : apiKeyLabel;
  }

  return {
    actorType: apiKeyId ? "api_key" : userId ? "user" : null,
    actorUserId: userId,
    actorApiKeyId: apiKeyId,
    actorLabel,
    actorRole,
  };
}

export async function recordSingleCaseClioHandoff(
  input: SingleCaseRecordInput
) {
  const exportedAt = input.exportedAt ?? new Date();
  const contactsRowCount =
    input.exportSubtype === ClioHandoffExportSubtype.CONTACTS ? input.rowCount : null;
  const mattersRowCount =
    input.exportSubtype === ClioHandoffExportSubtype.MATTERS ? input.rowCount : null;
  const isReExport = input.isReExport === true;

  return db.clioHandoffExport.create({
    data: {
      firmId: input.firmId,
      exportType: ClioHandoffExportType.SINGLE_CASE,
      exportSubtype: input.exportSubtype,
      idempotencyKey: input.idempotencyKey ?? null,
      requestFingerprint: input.requestFingerprint ?? null,
      reExportOverride: input.reExportOverride === true,
      reExportReason: input.reExportReason ?? null,
      actorType: input.actor.actorType,
      actorUserId: input.actor.actorUserId,
      actorApiKeyId: input.actor.actorApiKeyId,
      actorLabel: input.actor.actorLabel,
      actorRole: input.actor.actorRole,
      contactsFileName:
        input.exportSubtype === ClioHandoffExportSubtype.CONTACTS ? input.fileName : null,
      mattersFileName:
        input.exportSubtype === ClioHandoffExportSubtype.MATTERS ? input.fileName : null,
      contactsRowCount,
      mattersRowCount,
      exportedAt,
      manifestJson: {
        exportTimestamp: exportedAt.toISOString(),
        includedCaseIds: [input.caseSnapshot.id],
        includedCaseNumbers: input.caseSnapshot.caseNumber ? [input.caseSnapshot.caseNumber] : [],
        reexportedCaseIds: isReExport ? [input.caseSnapshot.id] : [],
        reexportedCaseNumbers: isReExport && input.caseSnapshot.caseNumber ? [input.caseSnapshot.caseNumber] : [],
        skippedCases: [],
        contactsRowCount: contactsRowCount ?? 0,
        mattersRowCount: mattersRowCount ?? 0,
      },
      memberships: {
        create: [
          {
            firmId: input.firmId,
            caseId: input.caseSnapshot.id,
            caseNumber: input.caseSnapshot.caseNumber,
            caseTitle: input.caseSnapshot.title,
            clientName: input.caseSnapshot.clientName,
            status: ClioHandoffCaseStatus.INCLUDED,
            isReExport,
          },
        ],
      },
    },
  });
}

export async function recordBatchClioHandoff(input: BatchRecordInput) {
  const exportedAt = input.exportedAt ?? new Date(input.batchResult.manifest.exportTimestamp);
  const snapshotByCaseId = new Map<string, { caseNumber: string | null; caseTitle: string | null; clientName: string | null }>();
  const referencedCaseIds = [
    ...new Set([
      ...input.batchResult.manifest.includedCaseIds,
      ...input.batchResult.manifest.skippedCases.map((item) => item.id),
    ]),
  ];

  if (referencedCaseIds.length > 0) {
    const cases = await db.legalCase.findMany({
      where: { firmId: input.firmId, id: { in: referencedCaseIds } },
      select: {
        id: true,
        caseNumber: true,
        title: true,
        clientName: true,
        clientContact: { select: { fullName: true } },
      },
    });
    for (const item of cases) {
      snapshotByCaseId.set(item.id, {
        caseNumber: item.caseNumber?.trim() || null,
        caseTitle: item.title?.trim() || null,
        clientName: item.clientContact?.fullName ?? item.clientName ?? null,
      });
    }
  }

  return db.clioHandoffExport.create({
    data: {
      firmId: input.firmId,
      exportType: ClioHandoffExportType.BATCH,
      exportSubtype: ClioHandoffExportSubtype.COMBINED_BATCH,
      idempotencyKey: input.idempotencyKey ?? null,
      requestFingerprint: input.requestFingerprint ?? null,
      reExportOverride: input.reExportOverride === true,
      reExportReason: input.reExportReason ?? null,
      actorType: input.actor.actorType,
      actorUserId: input.actor.actorUserId,
      actorApiKeyId: input.actor.actorApiKeyId,
      actorLabel: input.actor.actorLabel,
      actorRole: input.actor.actorRole,
      archiveFileName: input.batchResult.fileName,
      contactsFileName: input.batchResult.contactsFileName,
      mattersFileName: input.batchResult.mattersFileName,
      manifestFileName: input.batchResult.manifestFileName,
      contactsRowCount: input.batchResult.manifest.contactsRowCount,
      mattersRowCount: input.batchResult.manifest.mattersRowCount,
      manifestJson: input.batchResult.manifest as Prisma.InputJsonValue,
      exportedAt,
      memberships: {
        create: [
          ...input.batchResult.manifest.includedCases.map((includedCase) => {
            const snapshot = snapshotByCaseId.get(includedCase.id);
            return {
              firmId: input.firmId,
              caseId: includedCase.id,
              caseNumber: snapshot?.caseNumber ?? null,
              caseTitle: snapshot?.caseTitle ?? null,
              clientName: snapshot?.clientName ?? null,
              status: ClioHandoffCaseStatus.INCLUDED,
              isReExport: includedCase.isReExport === true,
            };
          }),
          ...input.batchResult.manifest.skippedCases.map((item) => {
            const snapshot = snapshotByCaseId.get(item.id);
            return {
              firmId: input.firmId,
              caseId: item.id,
              caseNumber: snapshot?.caseNumber ?? null,
              caseTitle: snapshot?.caseTitle ?? null,
              clientName: snapshot?.clientName ?? null,
              status: ClioHandoffCaseStatus.SKIPPED,
              skipReason: item.reason,
            };
          }),
        ],
      },
    },
  });
}

export async function listClioHandoffHistory(
  firmId: string,
  limit = 20
): Promise<ClioHandoffHistoryItem[]> {
  const items = await db.clioHandoffExport.findMany({
    where: { firmId },
    orderBy: [{ exportedAt: "desc" }, { createdAt: "desc" }],
    take: Math.max(1, Math.min(limit, 100)),
    include: {
      memberships: {
        orderBy: [{ caseNumber: "asc" }, { caseTitle: "asc" }, { caseId: "asc" }],
      },
    },
  });

  return items.map(serializeHistoryItem);
}

export async function getClioHandoffSummaryByCaseIds(
  firmId: string,
  caseIds: string[]
): Promise<Map<string, ClioHandoffCaseSummary>> {
  const uniqueCaseIds = [...new Set(caseIds.filter((value) => value.trim().length > 0))];
  const summaries = new Map<string, ClioHandoffCaseSummary>();

  for (const caseId of uniqueCaseIds) {
    summaries.set(caseId, {
      alreadyExported: false,
      exportCount: 0,
      lastExportedAt: null,
      lastExportType: null,
      lastExportSubtype: null,
      lastExportWasReExport: false,
      lastActorLabel: null,
    });
  }

  if (uniqueCaseIds.length === 0) return summaries;

  const exports = await db.clioHandoffExport.findMany({
    where: {
      firmId,
      memberships: {
        some: {
          caseId: { in: uniqueCaseIds },
          status: ClioHandoffCaseStatus.INCLUDED,
        },
      },
    },
    orderBy: [{ exportedAt: "desc" }, { createdAt: "desc" }],
    include: {
      memberships: {
        where: {
          caseId: { in: uniqueCaseIds },
          status: ClioHandoffCaseStatus.INCLUDED,
        },
        select: { caseId: true, isReExport: true },
      },
    },
  });

  for (const item of exports) {
    for (const membership of item.memberships) {
      const summary = summaries.get(membership.caseId);
      if (!summary) continue;
      summary.exportCount += 1;
      if (!summary.alreadyExported) {
        summary.alreadyExported = true;
        summary.lastExportedAt = item.exportedAt.toISOString();
        summary.lastExportType = toExportTypeLabel(item.exportType);
        summary.lastExportSubtype = toExportSubtypeLabel(item.exportSubtype);
        summary.lastExportWasReExport = membership.isReExport;
        summary.lastActorLabel = item.actorLabel ?? null;
      }
    }
  }

  return summaries;
}

export async function getCaseClioHandoffHistory(
  firmId: string,
  caseId: string,
  limit = 5
): Promise<CaseClioHandoffHistoryItem[]> {
  const items = await db.clioHandoffExport.findMany({
    where: {
      firmId,
      memberships: {
        some: {
          caseId,
          status: ClioHandoffCaseStatus.INCLUDED,
        },
      },
    },
    orderBy: [{ exportedAt: "desc" }, { createdAt: "desc" }],
    take: Math.max(1, Math.min(limit, 20)),
    include: {
      memberships: {
        where: {
          caseId,
          status: ClioHandoffCaseStatus.INCLUDED,
        },
        select: { isReExport: true },
      },
      },
  });

  return items.map((item) => ({
    exportId: item.id,
    exportedAt: item.exportedAt.toISOString(),
    exportType: toExportTypeLabel(item.exportType),
    exportSubtype: toExportSubtypeLabel(item.exportSubtype),
    actorLabel: item.actorLabel ?? null,
    archiveFileName: item.archiveFileName ?? null,
    contactsFileName: item.contactsFileName ?? null,
    mattersFileName: item.mattersFileName ?? null,
    isReExport: item.memberships[0]?.isReExport === true,
  }));
}

export async function findRecentClioHandoffDuplicate(
  input: FindRecentDuplicateInput
) {
  const idempotencyKey = input.idempotencyKey?.trim() || null;
  if (idempotencyKey) {
    return db.clioHandoffExport.findFirst({
      where: {
        firmId: input.firmId,
        idempotencyKey,
      },
    });
  }

  const requestFingerprint = input.requestFingerprint?.trim() || null;
  if (!requestFingerprint) return null;

  const withinMinutes = Math.max(1, input.withinMinutes ?? 5);
  const since = new Date(Date.now() - withinMinutes * 60 * 1000);

  return db.clioHandoffExport.findFirst({
    where: {
      firmId: input.firmId,
      exportType: input.exportType,
      exportSubtype: input.exportSubtype,
      requestFingerprint,
      exportedAt: { gte: since },
    },
    orderBy: [{ exportedAt: "desc" }, { createdAt: "desc" }],
  });
}
