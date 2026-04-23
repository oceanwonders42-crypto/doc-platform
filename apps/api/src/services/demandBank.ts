import { prisma } from "../db/prisma";

type DemandBankListOptions = {
  query?: string | null;
  reviewStatus?: string | null;
  approvedForReuse?: boolean | null;
  blockedForReuse?: boolean | null;
};

function trimToNull(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeStringArray(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.map((value) => (typeof value === "string" ? value.trim() : "")).filter(Boolean))];
}

function normalizeBoolean(value: unknown): boolean | null {
  if (value === true || value === false) return value;
  return null;
}

function normalizeNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeDate(value: Date | null | undefined): string | null {
  return value?.toISOString() ?? null;
}

function serializeDemandBankDocumentRow(
  item: {
    id: string;
    matterId: string | null;
    sourceDocumentId: string | null;
    title: string;
    fileName: string | null;
    summary: string | null;
    jurisdiction: string | null;
    caseType: string | null;
    liabilityType: string | null;
    injuryTags: string[];
    treatmentTags: string[];
    bodyPartTags: string[];
    mriPresent: boolean;
    injectionsPresent: boolean;
    surgeryPresent: boolean;
    treatmentDurationDays: number | null;
    totalBillsAmount: number | null;
    demandAmount: number | null;
    templateFamily: string | null;
    toneStyle: string | null;
    qualityScore: number | null;
    approvedForReuse: boolean;
    blockedForReuse: boolean;
    reviewStatus: string;
    reviewedBy: string | null;
    reviewedAt: Date | null;
    createdBy: string | null;
    createdAt: Date;
    updatedAt: Date;
    _count?: { sections: number };
  }
) {
  return {
    id: item.id,
    matterId: item.matterId,
    sourceDocumentId: item.sourceDocumentId,
    title: item.title,
    fileName: item.fileName,
    summary: item.summary,
    jurisdiction: item.jurisdiction,
    caseType: item.caseType,
    liabilityType: item.liabilityType,
    injuryTags: item.injuryTags,
    treatmentTags: item.treatmentTags,
    bodyPartTags: item.bodyPartTags,
    mriPresent: item.mriPresent,
    injectionsPresent: item.injectionsPresent,
    surgeryPresent: item.surgeryPresent,
    treatmentDurationDays: item.treatmentDurationDays,
    totalBillsAmount: item.totalBillsAmount,
    demandAmount: item.demandAmount,
    templateFamily: item.templateFamily,
    toneStyle: item.toneStyle,
    qualityScore: item.qualityScore,
    approvedForReuse: item.approvedForReuse,
    blockedForReuse: item.blockedForReuse,
    reviewStatus: item.reviewStatus,
    reviewedBy: item.reviewedBy,
    reviewedAt: normalizeDate(item.reviewedAt),
    createdBy: item.createdBy,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
    sectionCount: item._count?.sections ?? 0,
  };
}

export async function listDemandBankDocuments(
  firmId: string,
  options?: DemandBankListOptions
) {
  const query = trimToNull(options?.query ?? null);
  const reviewStatus = trimToNull(options?.reviewStatus ?? null);

  const items = await prisma.demandBankDocument.findMany({
    where: {
      firmId,
      ...(reviewStatus ? { reviewStatus } : {}),
      ...(options?.approvedForReuse !== null && options?.approvedForReuse !== undefined
        ? { approvedForReuse: options.approvedForReuse }
        : {}),
      ...(options?.blockedForReuse !== null && options?.blockedForReuse !== undefined
        ? { blockedForReuse: options.blockedForReuse }
        : {}),
      ...(query
        ? {
            OR: [
              { title: { contains: query, mode: "insensitive" } },
              { fileName: { contains: query, mode: "insensitive" } },
              { summary: { contains: query, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    include: {
      _count: {
        select: { sections: true },
      },
    },
  });

  return items.map((item) => serializeDemandBankDocumentRow(item));
}

export async function getDemandBankDocumentDetail(firmId: string, demandBankDocumentId: string) {
  const item = await prisma.demandBankDocument.findFirst({
    where: { id: demandBankDocumentId, firmId },
    include: {
      sections: {
        orderBy: [{ approvedForReuse: "desc" }, { createdAt: "asc" }],
      },
      _count: {
        select: { sections: true },
      },
    },
  });

  if (!item) {
    throw new Error("Demand bank document not found");
  }

  const [matter, sourceDocument, recentRuns] = await Promise.all([
    item.matterId
      ? prisma.legalCase.findFirst({
          where: { id: item.matterId, firmId },
          select: { id: true, title: true, caseNumber: true, clientName: true, status: true },
        })
      : Promise.resolve(null),
    item.sourceDocumentId
      ? prisma.document.findFirst({
          where: { id: item.sourceDocumentId, firmId },
          select: { id: true, originalName: true, status: true, routedCaseId: true, ingestedAt: true },
        })
      : Promise.resolve(null),
    prisma.demandBankRun.findMany({
      where: { firmId },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  ]);

  const relevantRuns = recentRuns
    .filter((run) => {
      if (!Array.isArray(run.retrievedDemandIds)) return false;
      return run.retrievedDemandIds.includes(item.id);
    })
    .slice(0, 10)
    .map((run) => ({
      id: run.id,
      matterId: run.matterId,
      runType: run.runType,
      templateId: run.templateId,
      inputCaseProfile: run.inputCaseProfile,
      retrievedDemandIds: run.retrievedDemandIds,
      retrievedSectionIds: run.retrievedSectionIds,
      retrievalReasoning: run.retrievalReasoning,
      model: run.model,
      promptVersion: run.promptVersion,
      createdBy: run.createdBy,
      createdAt: run.createdAt.toISOString(),
    }));

  return {
    item: {
      ...serializeDemandBankDocumentRow(item),
      originalText: item.originalText,
      redactedText: item.redactedText,
    },
    matter: matter
      ? {
          id: matter.id,
          title: matter.title,
          caseNumber: matter.caseNumber,
          clientName: matter.clientName,
          status: matter.status,
        }
      : null,
    sourceDocument: sourceDocument
      ? {
          id: sourceDocument.id,
          originalName: sourceDocument.originalName,
          status: sourceDocument.status,
          routedCaseId: sourceDocument.routedCaseId,
          ingestedAt: sourceDocument.ingestedAt.toISOString(),
        }
      : null,
    sections: item.sections.map((section) => ({
      id: section.id,
      sectionType: section.sectionType,
      heading: section.heading,
      originalText: section.originalText,
      redactedText: section.redactedText,
      qualityScore: section.qualityScore,
      approvedForReuse: section.approvedForReuse,
      createdAt: section.createdAt.toISOString(),
      updatedAt: section.updatedAt.toISOString(),
    })),
    recentRuns: relevantRuns,
  };
}

export async function updateDemandBankDocument(
  firmId: string,
  demandBankDocumentId: string,
  actorUserId: string | null,
  payload: Record<string, unknown>
) {
  const existing = await prisma.demandBankDocument.findFirst({
    where: { id: demandBankDocumentId, firmId },
    select: { id: true },
  });

  if (!existing) {
    throw new Error("Demand bank document not found");
  }

  const approvedForReuse = normalizeBoolean(payload.approvedForReuse);
  const blockedForReuse = normalizeBoolean(payload.blockedForReuse);
  let nextApprovedForReuse = approvedForReuse;
  let nextBlockedForReuse = blockedForReuse;

  if (nextApprovedForReuse === true) {
    nextBlockedForReuse = false;
  }
  if (nextBlockedForReuse === true) {
    nextApprovedForReuse = false;
  }

  const explicitReviewStatus = trimToNull(typeof payload.reviewStatus === "string" ? payload.reviewStatus : null);
  const inferredReviewStatus =
    nextApprovedForReuse === true
      ? "approved"
      : nextBlockedForReuse === true
        ? "blocked"
        : explicitReviewStatus;

  const reviewTouched =
    nextApprovedForReuse !== null ||
    nextBlockedForReuse !== null ||
    inferredReviewStatus !== null ||
    payload.qualityScore !== undefined;

  const updateData = {
    ...(trimToNull(typeof payload.title === "string" ? payload.title : null) ? { title: trimToNull(payload.title as string)! } : {}),
    ...(payload.fileName !== undefined ? { fileName: trimToNull(typeof payload.fileName === "string" ? payload.fileName : null) } : {}),
    ...(payload.summary !== undefined ? { summary: trimToNull(typeof payload.summary === "string" ? payload.summary : null) } : {}),
    ...(payload.redactedText !== undefined ? { redactedText: trimToNull(typeof payload.redactedText === "string" ? payload.redactedText : null) } : {}),
    ...(payload.jurisdiction !== undefined ? { jurisdiction: trimToNull(typeof payload.jurisdiction === "string" ? payload.jurisdiction : null) } : {}),
    ...(payload.caseType !== undefined ? { caseType: trimToNull(typeof payload.caseType === "string" ? payload.caseType : null) } : {}),
    ...(payload.liabilityType !== undefined ? { liabilityType: trimToNull(typeof payload.liabilityType === "string" ? payload.liabilityType : null) } : {}),
    ...(payload.templateFamily !== undefined ? { templateFamily: trimToNull(typeof payload.templateFamily === "string" ? payload.templateFamily : null) } : {}),
    ...(payload.toneStyle !== undefined ? { toneStyle: trimToNull(typeof payload.toneStyle === "string" ? payload.toneStyle : null) } : {}),
    ...(payload.injuryTags !== undefined ? { injuryTags: normalizeStringArray(payload.injuryTags) } : {}),
    ...(payload.treatmentTags !== undefined ? { treatmentTags: normalizeStringArray(payload.treatmentTags) } : {}),
    ...(payload.bodyPartTags !== undefined ? { bodyPartTags: normalizeStringArray(payload.bodyPartTags) } : {}),
    ...(payload.mriPresent !== undefined && typeof payload.mriPresent === "boolean" ? { mriPresent: payload.mriPresent } : {}),
    ...(payload.injectionsPresent !== undefined && typeof payload.injectionsPresent === "boolean" ? { injectionsPresent: payload.injectionsPresent } : {}),
    ...(payload.surgeryPresent !== undefined && typeof payload.surgeryPresent === "boolean" ? { surgeryPresent: payload.surgeryPresent } : {}),
    ...(payload.treatmentDurationDays !== undefined ? { treatmentDurationDays: normalizeNumber(payload.treatmentDurationDays) } : {}),
    ...(payload.totalBillsAmount !== undefined ? { totalBillsAmount: normalizeNumber(payload.totalBillsAmount) } : {}),
    ...(payload.demandAmount !== undefined ? { demandAmount: normalizeNumber(payload.demandAmount) } : {}),
    ...(payload.qualityScore !== undefined ? { qualityScore: normalizeNumber(payload.qualityScore) } : {}),
    ...(nextApprovedForReuse !== null ? { approvedForReuse: nextApprovedForReuse } : {}),
    ...(nextBlockedForReuse !== null ? { blockedForReuse: nextBlockedForReuse } : {}),
    ...(inferredReviewStatus ? { reviewStatus: inferredReviewStatus } : {}),
    ...(reviewTouched
      ? {
          reviewedBy: actorUserId,
          reviewedAt: new Date(),
        }
      : {}),
  };

  const updated = await prisma.$transaction(async (tx) => {
    const nextItem = await tx.demandBankDocument.update({
      where: { id: demandBankDocumentId },
      data: updateData,
      include: {
        _count: {
          select: { sections: true },
        },
      },
    });

    if (nextApprovedForReuse !== null || nextBlockedForReuse !== null) {
      await tx.demandBankSection.updateMany({
        where: { demandBankDocumentId },
        data: {
          approvedForReuse: nextApprovedForReuse === true && nextBlockedForReuse !== true,
        },
      });
    }

    return nextItem;
  });

  return serializeDemandBankDocumentRow(updated);
}
