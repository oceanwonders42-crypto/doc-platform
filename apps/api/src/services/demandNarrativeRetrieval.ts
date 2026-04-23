import { Prisma } from "@prisma/client";

import { prisma } from "../db/prisma";

type DemandNarrativePreviewItemType = "document" | "section";
type DemandNarrativeUsefulness = "useful" | "not_useful";

type StoredFeedbackValue = {
  usefulness?: DemandNarrativeUsefulness | null;
  removed?: boolean;
  updatedAt?: string | null;
  updatedBy?: string | null;
};

type StoredFeedbackCollection = {
  documents: Record<string, StoredFeedbackValue>;
  sections: Record<string, StoredFeedbackValue>;
};

type StoredReasoningEntry = {
  id: string;
  score: number;
  reasons: string[];
  demandBankDocumentId?: string;
};

type StoredReasoning = {
  documents: StoredReasoningEntry[];
  sections: StoredReasoningEntry[];
  reviewerFeedback: StoredFeedbackCollection;
};

type DemandNarrativeCaseProfile = {
  jurisdiction: string | null;
  caseType: string | null;
  liabilityType: string | null;
  injuryTags: string[];
  treatmentTags: string[];
  bodyPartTags: string[];
  mriPresent: boolean | null;
  injectionsPresent: boolean | null;
  surgeryPresent: boolean | null;
  billsBand: "low" | "medium" | "high" | null;
  templateFamily: string | null;
};

type DemandNarrativePreviewFeedback = {
  usefulness: DemandNarrativeUsefulness | null;
  removed: boolean;
  updatedAt: string | null;
  updatedBy: string | null;
};

type DemandNarrativePreviewSignal = {
  label: string;
  currentValue: string;
  exampleValue: string;
  matched: boolean;
};

export type DemandNarrativeRetrievalPreview = {
  available: boolean;
  draftId: string;
  runId: string | null;
  runCreatedAt: string | null;
  unavailableReason: string | null;
  caseProfile: DemandNarrativeCaseProfile | null;
  hiddenCounts: {
    examples: number;
    sections: number;
  };
  retrievedExamples: Array<{
    id: string;
    title: string;
    caseType: string | null;
    injuryTags: string[];
    totalBillsAmount: number | null;
    demandAmount: number | null;
    qualityScore: number | null;
    matchScore: number;
    matchReasons: string[];
    matchSignals: DemandNarrativePreviewSignal[];
    feedback: DemandNarrativePreviewFeedback;
  }>;
  retrievedSections: Array<{
    id: string;
    demandBankDocumentId: string;
    sourceDemandTitle: string;
    sectionType: string;
    heading: string | null;
    previewText: string | null;
    matchScore: number;
    matchReasons: string[];
    feedback: DemandNarrativePreviewFeedback;
  }>;
};

type DemandNarrativeRetrievalFeedbackInput = {
  firmId: string;
  caseId: string;
  draftId: string;
  actorUserId: string | null;
  itemType: DemandNarrativePreviewItemType;
  itemId: string;
  usefulness?: DemandNarrativeUsefulness | null;
  removed?: boolean;
};

function trimToNull(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value
        .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
        .filter(Boolean)
    ),
  ];
}

function readIdArray(value: Prisma.JsonValue | null): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
}

function toBooleanOrNull(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function parseBillsBand(value: unknown): "low" | "medium" | "high" | null {
  return value === "low" || value === "medium" || value === "high" ? value : null;
}

function normalizeCaseProfile(value: Prisma.JsonValue | null): DemandNarrativeCaseProfile | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  return {
    jurisdiction: trimToNull(typeof record.jurisdiction === "string" ? record.jurisdiction : null),
    caseType: trimToNull(typeof record.caseType === "string" ? record.caseType : null),
    liabilityType: trimToNull(typeof record.liabilityType === "string" ? record.liabilityType : null),
    injuryTags: normalizeStringArray(record.injuryTags),
    treatmentTags: normalizeStringArray(record.treatmentTags),
    bodyPartTags: normalizeStringArray(record.bodyPartTags),
    mriPresent: toBooleanOrNull(record.mriPresent),
    injectionsPresent: toBooleanOrNull(record.injectionsPresent),
    surgeryPresent: toBooleanOrNull(record.surgeryPresent),
    billsBand: parseBillsBand(record.billsBand),
    templateFamily: trimToNull(typeof record.templateFamily === "string" ? record.templateFamily : null),
  };
}

function normalizeFeedbackCollection(value: unknown): StoredFeedbackCollection {
  const empty: StoredFeedbackCollection = { documents: {}, sections: {} };
  if (!value || typeof value !== "object" || Array.isArray(value)) return empty;
  const record = value as Record<string, unknown>;

  function readBucket(bucketValue: unknown) {
    if (!bucketValue || typeof bucketValue !== "object" || Array.isArray(bucketValue)) return {};
    const bucket = bucketValue as Record<string, unknown>;
    const entries: Record<string, StoredFeedbackValue> = {};
    for (const [key, rawEntry] of Object.entries(bucket)) {
      if (!rawEntry || typeof rawEntry !== "object" || Array.isArray(rawEntry)) continue;
      const item = rawEntry as Record<string, unknown>;
      const usefulness =
        item.usefulness === "useful" || item.usefulness === "not_useful"
          ? item.usefulness
          : null;
      entries[key] = {
        usefulness,
        removed: item.removed === true,
        updatedAt: trimToNull(typeof item.updatedAt === "string" ? item.updatedAt : null),
        updatedBy: trimToNull(typeof item.updatedBy === "string" ? item.updatedBy : null),
      };
    }
    return entries;
  }

  return {
    documents: readBucket(record.documents),
    sections: readBucket(record.sections),
  };
}

function normalizeReasoningEntries(value: unknown): StoredReasoningEntry[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const record = entry as Record<string, unknown>;
    const id = trimToNull(typeof record.id === "string" ? record.id : null);
    if (!id) return [];
    return [
      {
        id,
        score: typeof record.score === "number" && Number.isFinite(record.score) ? record.score : 0,
        reasons: normalizeStringArray(record.reasons),
        demandBankDocumentId: trimToNull(
          typeof record.demandBankDocumentId === "string" ? record.demandBankDocumentId : null
        ) ?? undefined,
      },
    ];
  });
}

function normalizeStoredReasoning(value: Prisma.JsonValue | null): StoredReasoning {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {
      documents: [],
      sections: [],
      reviewerFeedback: { documents: {}, sections: {} },
    };
  }
  const record = value as Record<string, unknown>;
  return {
    documents: normalizeReasoningEntries(record.documents),
    sections: normalizeReasoningEntries(record.sections),
    reviewerFeedback: normalizeFeedbackCollection(record.reviewerFeedback),
  };
}

function formatBooleanLabel(value: boolean | null | undefined) {
  if (value === true) return "yes";
  if (value === false) return "no";
  return "unknown";
}

function formatBillsBandLabel(value: "low" | "medium" | "high" | null) {
  return value ?? "unknown";
}

function normalizeBillsBand(amount: number | null | undefined): "low" | "medium" | "high" | null {
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) return null;
  if (amount < 10000) return "low";
  if (amount < 50000) return "medium";
  return "high";
}

function buildMatchSignals(
  profile: DemandNarrativeCaseProfile | null,
  candidate: {
    bodyPartTags: string[];
    mriPresent: boolean;
    injectionsPresent: boolean;
    surgeryPresent: boolean;
    totalBillsAmount: number | null;
    templateFamily: string | null;
  }
): DemandNarrativePreviewSignal[] {
  if (!profile) return [];
  const bodyPartOverlap = profile.bodyPartTags.filter((tag) =>
    candidate.bodyPartTags.some((candidateTag) => candidateTag.toLowerCase() === tag.toLowerCase())
  );
  const candidateBillsBand = normalizeBillsBand(candidate.totalBillsAmount);
  return [
    {
      label: "MRI",
      currentValue: formatBooleanLabel(profile.mriPresent),
      exampleValue: formatBooleanLabel(candidate.mriPresent),
      matched: profile.mriPresent === true && candidate.mriPresent,
    },
    {
      label: "Injections",
      currentValue: formatBooleanLabel(profile.injectionsPresent),
      exampleValue: formatBooleanLabel(candidate.injectionsPresent),
      matched: profile.injectionsPresent === true && candidate.injectionsPresent,
    },
    {
      label: "Surgery",
      currentValue: formatBooleanLabel(profile.surgeryPresent),
      exampleValue: formatBooleanLabel(candidate.surgeryPresent),
      matched: profile.surgeryPresent === true && candidate.surgeryPresent,
    },
    {
      label: "Body part overlap",
      currentValue: profile.bodyPartTags.length > 0 ? profile.bodyPartTags.join(", ") : "none recorded",
      exampleValue:
        candidate.bodyPartTags.length > 0 ? candidate.bodyPartTags.join(", ") : "none recorded",
      matched: bodyPartOverlap.length > 0,
    },
    {
      label: "Bills range",
      currentValue: formatBillsBandLabel(profile.billsBand),
      exampleValue: formatBillsBandLabel(candidateBillsBand),
      matched: profile.billsBand !== null && profile.billsBand === candidateBillsBand,
    },
    {
      label: "Template match",
      currentValue: profile.templateFamily ?? "unknown",
      exampleValue: candidate.templateFamily ?? "unknown",
      matched:
        profile.templateFamily !== null &&
        trimToNull(candidate.templateFamily) !== null &&
        profile.templateFamily === candidate.templateFamily,
    },
  ];
}

function normalizeFeedback(value: StoredFeedbackValue | undefined): DemandNarrativePreviewFeedback {
  return {
    usefulness: value?.usefulness ?? null,
    removed: value?.removed === true,
    updatedAt: value?.updatedAt ?? null,
    updatedBy: value?.updatedBy ?? null,
  };
}

async function loadDraftAndRun(firmId: string, caseId: string, draftId: string) {
  const draft = await prisma.demandNarrativeDraft.findFirst({
    where: { id: draftId, firmId, caseId },
    select: {
      id: true,
      demandBankRunId: true,
      generatedAt: true,
    },
  });

  if (!draft) {
    throw new Error("Demand narrative draft not found.");
  }

  if (!draft.demandBankRunId) {
    return {
      draft,
      run: null,
    };
  }

  const run = await prisma.demandBankRun.findFirst({
    where: { id: draft.demandBankRunId, firmId },
    select: {
      id: true,
      templateId: true,
      inputCaseProfile: true,
      retrievedDemandIds: true,
      retrievedSectionIds: true,
      retrievalReasoning: true,
      createdAt: true,
    },
  });

  return { draft, run };
}

export async function getDemandNarrativeRetrievalPreview(
  firmId: string,
  caseId: string,
  draftId: string
): Promise<DemandNarrativeRetrievalPreview> {
  const { draft, run } = await loadDraftAndRun(firmId, caseId, draftId);
  if (!run) {
    return {
      available: false,
      draftId: draft.id,
      runId: null,
      runCreatedAt: null,
      unavailableReason: "This draft was generated before Demand Bank retrieval tracking was recorded.",
      caseProfile: null,
      hiddenCounts: { examples: 0, sections: 0 },
      retrievedExamples: [],
      retrievedSections: [],
    };
  }

  const reasoning = normalizeStoredReasoning(run.retrievalReasoning);
  const demandIds = readIdArray(run.retrievedDemandIds);
  const sectionIds = readIdArray(run.retrievedSectionIds);
  const profile = normalizeCaseProfile(run.inputCaseProfile);

  const [documents, sections] = await Promise.all([
    demandIds.length > 0
      ? prisma.demandBankDocument.findMany({
          where: {
            firmId,
            id: { in: demandIds },
            approvedForReuse: true,
            blockedForReuse: false,
          },
          select: {
            id: true,
            title: true,
            caseType: true,
            injuryTags: true,
            bodyPartTags: true,
            mriPresent: true,
            injectionsPresent: true,
            surgeryPresent: true,
            totalBillsAmount: true,
            demandAmount: true,
            templateFamily: true,
            qualityScore: true,
          },
        })
      : Promise.resolve([]),
    sectionIds.length > 0
      ? prisma.demandBankSection.findMany({
          where: {
            id: { in: sectionIds },
            approvedForReuse: true,
            document: {
              firmId,
              approvedForReuse: true,
              blockedForReuse: false,
            },
          },
          include: {
            document: {
              select: {
                id: true,
                title: true,
              },
            },
          },
        })
      : Promise.resolve([]),
  ]);

  const documentMap = new Map(documents.map((item) => [item.id, item]));
  const sectionMap = new Map(sections.map((item) => [item.id, item]));
  const documentReasonMap = new Map(reasoning.documents.map((entry) => [entry.id, entry]));
  const sectionReasonMap = new Map(reasoning.sections.map((entry) => [entry.id, entry]));

  const retrievedExamples = demandIds
    .map((id) => {
      const item = documentMap.get(id);
      if (!item) return null;
      const reasonEntry = documentReasonMap.get(id);
      return {
        id: item.id,
        title: item.title,
        caseType: item.caseType,
        injuryTags: item.injuryTags,
        totalBillsAmount: item.totalBillsAmount,
        demandAmount: item.demandAmount,
        qualityScore: item.qualityScore,
        matchScore: reasonEntry?.score ?? 0,
        matchReasons: reasonEntry?.reasons ?? [],
        matchSignals: buildMatchSignals(profile, item),
        feedback: normalizeFeedback(reasoning.reviewerFeedback.documents[item.id]),
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  const retrievedSections = sectionIds
    .map((id) => {
      const item = sectionMap.get(id);
      if (!item) return null;
      const reasonEntry = sectionReasonMap.get(id);
      return {
        id: item.id,
        demandBankDocumentId: item.demandBankDocumentId,
        sourceDemandTitle: item.document.title,
        sectionType: item.sectionType,
        heading: item.heading,
        previewText: trimToNull(item.redactedText ?? item.originalText),
        matchScore: reasonEntry?.score ?? 0,
        matchReasons: reasonEntry?.reasons ?? [],
        feedback: normalizeFeedback(reasoning.reviewerFeedback.sections[item.id]),
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  return {
    available: true,
    draftId: draft.id,
    runId: run.id,
    runCreatedAt: run.createdAt.toISOString(),
    unavailableReason: null,
    caseProfile: profile,
    hiddenCounts: {
      examples: Math.max(0, demandIds.length - retrievedExamples.length),
      sections: Math.max(0, sectionIds.length - retrievedSections.length),
    },
    retrievedExamples,
    retrievedSections,
  };
}

export async function updateDemandNarrativeRetrievalFeedback(
  input: DemandNarrativeRetrievalFeedbackInput
) {
  const { draft, run } = await loadDraftAndRun(input.firmId, input.caseId, input.draftId);
  if (!run) {
    throw new Error("This draft does not have stored Demand Bank retrieval data.");
  }

  const allowedIds =
    input.itemType === "document"
      ? readIdArray(run.retrievedDemandIds)
      : readIdArray(run.retrievedSectionIds);
  if (!allowedIds.includes(input.itemId)) {
    throw new Error("Demand Bank retrieval item not found for this draft.");
  }

  const nextReasoning = normalizeStoredReasoning(run.retrievalReasoning);
  const bucket =
    input.itemType === "document"
      ? nextReasoning.reviewerFeedback.documents
      : nextReasoning.reviewerFeedback.sections;
  const existing = bucket[input.itemId] ?? {};
  bucket[input.itemId] = {
    ...existing,
    usefulness:
      input.usefulness === "useful" || input.usefulness === "not_useful"
        ? input.usefulness
        : existing.usefulness ?? null,
    removed:
      typeof input.removed === "boolean" ? input.removed : existing.removed === true,
    updatedAt: new Date().toISOString(),
    updatedBy: trimToNull(input.actorUserId),
  };

  await prisma.demandBankRun.update({
    where: { id: run.id },
    data: {
      retrievalReasoning: nextReasoning as unknown as Prisma.InputJsonValue,
    },
  });

  return getDemandNarrativeRetrievalPreview(input.firmId, input.caseId, draft.id);
}
