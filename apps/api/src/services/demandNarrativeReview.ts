import { DemandReviewStatus, Role, type Prisma } from "@prisma/client";

export type DemandNarrativeUsedEvent = {
  eventDate: string | null;
  eventType: string | null;
  documentId: string;
};

export type DemandLifecycleStatus =
  | "pending_dev_review"
  | "dev_approved"
  | "released_to_requester";

type NarrativeDraftRecord = {
  id: string;
  caseId: string;
  narrativeType: string;
  tone: string;
  status: DemandReviewStatus;
  generatedText: string;
  warningsJson: Prisma.JsonValue | null;
  usedEventsJson: Prisma.JsonValue | null;
  generatedByUserId: string | null;
  approvedByUserId: string | null;
  releasedByUserId: string | null;
  generatedAt: Date;
  approvedAt: Date | null;
  releasedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export function normalizeDemandNarrativeStatus(status: DemandReviewStatus): DemandLifecycleStatus {
  switch (status) {
    case DemandReviewStatus.RELEASED_TO_REQUESTER:
      return "released_to_requester";
    case DemandReviewStatus.DEV_APPROVED:
      return "dev_approved";
    case DemandReviewStatus.DRAFT_GENERATED:
    case DemandReviewStatus.PENDING_DEV_REVIEW:
    default:
      return "pending_dev_review";
  }
}

export function normalizeDemandPackageStatus(
  status: string | null | undefined
): DemandLifecycleStatus | null {
  const normalized = typeof status === "string" ? status.trim().toLowerCase() : "";
  if (!normalized) return null;
  if (normalized === "released" || normalized === "released_to_requester") {
    return "released_to_requester";
  }
  if (normalized === "approved" || normalized === "dev_approved") {
    return "dev_approved";
  }
  if (
    normalized === "generated" ||
    normalized === "draft_generated" ||
    normalized === "pending_dev_review"
  ) {
    return "pending_dev_review";
  }
  return null;
}

function readStringArray(value: Prisma.JsonValue | null): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
}

function readUsedEvents(value: Prisma.JsonValue | null): DemandNarrativeUsedEvent[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const record = item as Record<string, unknown>;
    const documentId = typeof record.documentId === "string" ? record.documentId.trim() : "";
    if (!documentId) return [];
    return [
      {
        documentId,
        eventDate: typeof record.eventDate === "string" ? record.eventDate : null,
        eventType: typeof record.eventType === "string" ? record.eventType : null,
      },
    ];
  });
}

export function isDemandReviewerRole(role: Role | string | null | undefined): boolean {
  return role === Role.PLATFORM_ADMIN;
}

export function canViewDemandNarrativeText(
  status: DemandReviewStatus,
  role: Role | string | null | undefined
): boolean {
  return (
    isDemandReviewerRole(role) ||
    normalizeDemandNarrativeStatus(status) === "released_to_requester"
  );
}

export function canAccessDemandNarrativeDraft(
  status: DemandReviewStatus,
  role: Role | string | null | undefined
): boolean {
  return (
    isDemandReviewerRole(role) ||
    normalizeDemandNarrativeStatus(status) === "released_to_requester"
  );
}

export function isDemandPackageReleaseBlocked(status: string | null | undefined): boolean {
  const normalized = normalizeDemandPackageStatus(status);
  return normalized !== null && normalized !== "released_to_requester";
}

export function serializeDemandNarrativeDraft(
  draft: NarrativeDraftRecord,
  role: Role | string | null | undefined
) {
  const canViewText = canViewDemandNarrativeText(draft.status, role);
  return {
    id: draft.id,
    caseId: draft.caseId,
    narrativeType: draft.narrativeType,
    tone: draft.tone,
    status: normalizeDemandNarrativeStatus(draft.status),
    canViewText,
    text: canViewText ? draft.generatedText : null,
    warnings: readStringArray(draft.warningsJson),
    usedEvents: readUsedEvents(draft.usedEventsJson),
    generatedByUserId: draft.generatedByUserId ?? null,
    approvedByUserId: draft.approvedByUserId ?? null,
    releasedByUserId: draft.releasedByUserId ?? null,
    generatedAt: draft.generatedAt.toISOString(),
    approvedAt: draft.approvedAt?.toISOString() ?? null,
    releasedAt: draft.releasedAt?.toISOString() ?? null,
    createdAt: draft.createdAt.toISOString(),
    updatedAt: draft.updatedAt.toISOString(),
  };
}
