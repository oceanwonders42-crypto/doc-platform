import assert from "node:assert/strict";

import { DemandReviewStatus, Role, type Prisma } from "@prisma/client";

import {
  canAccessDemandNarrativeDraft,
  canViewDemandNarrativeText,
  isDemandPackageReleaseBlocked,
  isDemandReviewerRole,
  normalizeDemandNarrativeStatus,
  normalizeDemandPackageStatus,
  serializeDemandNarrativeDraft,
} from "./demandNarrativeReview";

async function main() {
  assert.equal(isDemandReviewerRole(Role.PLATFORM_ADMIN), true);
  assert.equal(isDemandReviewerRole(Role.FIRM_ADMIN), true);
  assert.equal(isDemandReviewerRole("ATTORNEY"), true);
  assert.equal(canViewDemandNarrativeText(DemandReviewStatus.PENDING_DEV_REVIEW, Role.FIRM_ADMIN), true);
  assert.equal(canViewDemandNarrativeText(DemandReviewStatus.PENDING_DEV_REVIEW, "ATTORNEY"), true);
  assert.equal(canViewDemandNarrativeText(DemandReviewStatus.PENDING_DEV_REVIEW, Role.PLATFORM_ADMIN), true);
  assert.equal(canViewDemandNarrativeText(DemandReviewStatus.RELEASED_TO_REQUESTER, Role.FIRM_ADMIN), true);
  assert.equal(canAccessDemandNarrativeDraft(DemandReviewStatus.PENDING_DEV_REVIEW, Role.FIRM_ADMIN), true);
  assert.equal(canAccessDemandNarrativeDraft(DemandReviewStatus.DEV_APPROVED, Role.FIRM_ADMIN), true);
  assert.equal(canAccessDemandNarrativeDraft(DemandReviewStatus.RELEASED_TO_REQUESTER, Role.FIRM_ADMIN), true);

  assert.equal(normalizeDemandNarrativeStatus(DemandReviewStatus.PENDING_DEV_REVIEW), "pending_dev_review");
  assert.equal(normalizeDemandNarrativeStatus(DemandReviewStatus.DEV_APPROVED), "dev_approved");
  assert.equal(
    normalizeDemandNarrativeStatus(DemandReviewStatus.RELEASED_TO_REQUESTER),
    "released_to_requester"
  );

  assert.equal(normalizeDemandPackageStatus("pending_dev_review"), "pending_dev_review");
  assert.equal(normalizeDemandPackageStatus("dev_approved"), "dev_approved");
  assert.equal(normalizeDemandPackageStatus("approved"), "dev_approved");
  assert.equal(normalizeDemandPackageStatus("released_to_requester"), "released_to_requester");
  assert.equal(normalizeDemandPackageStatus("released"), "released_to_requester");

  assert.equal(isDemandPackageReleaseBlocked("pending_dev_review"), true);
  assert.equal(isDemandPackageReleaseBlocked("dev_approved"), true);
  assert.equal(isDemandPackageReleaseBlocked("approved"), true);
  assert.equal(isDemandPackageReleaseBlocked("released_to_requester"), false);
  assert.equal(isDemandPackageReleaseBlocked("released"), false);
  assert.equal(isDemandPackageReleaseBlocked("ready"), false);

  const baseDraft: {
    id: string;
    caseId: string;
    narrativeType: string;
    tone: string;
    status: DemandReviewStatus;
    generatedText: string;
    warningsJson: Prisma.JsonValue;
    usedEventsJson: Prisma.JsonValue;
    generatedByUserId: string | null;
    approvedByUserId: string | null;
    releasedByUserId: string | null;
    generatedAt: Date;
    approvedAt: Date | null;
    releasedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  } = {
    id: "draft-1",
    caseId: "case-1",
    narrativeType: "demand_rationale",
    tone: "neutral",
    status: DemandReviewStatus.PENDING_DEV_REVIEW,
    generatedText: "Internal draft text",
    warningsJson: ["OPENAI_API_KEY not configured."],
    usedEventsJson: [
      { documentId: "doc-1", eventDate: "2026-04-21T00:00:00.000Z", eventType: "Visit" },
    ],
    generatedByUserId: "user-1",
    approvedByUserId: null,
    releasedByUserId: null,
    generatedAt: new Date("2026-04-21T12:00:00.000Z"),
    approvedAt: null,
    releasedAt: null,
    createdAt: new Date("2026-04-21T12:00:00.000Z"),
    updatedAt: new Date("2026-04-21T12:05:00.000Z"),
  };

  const requesterView = serializeDemandNarrativeDraft(baseDraft, Role.FIRM_ADMIN);
  assert.equal(requesterView.status, "pending_dev_review");
  assert.equal(requesterView.canViewText, true);
  assert.equal(requesterView.text, "Internal draft text");
  assert.deepEqual(requesterView.warnings, ["OPENAI_API_KEY not configured."]);
  assert.equal(requesterView.usedEvents.length, 1);

  const reviewerView = serializeDemandNarrativeDraft(baseDraft, Role.PLATFORM_ADMIN);
  assert.equal(reviewerView.canViewText, true);
  assert.equal(reviewerView.text, "Internal draft text");

  const approvedView = serializeDemandNarrativeDraft(
    {
      ...baseDraft,
      status: DemandReviewStatus.DEV_APPROVED,
      approvedAt: new Date("2026-04-21T12:30:00.000Z"),
    },
    Role.FIRM_ADMIN
  );
  assert.equal(approvedView.status, "dev_approved");
  assert.equal(approvedView.canViewText, true);
  assert.equal(approvedView.text, "Internal draft text");

  const releasedView = serializeDemandNarrativeDraft(
    { ...baseDraft, status: DemandReviewStatus.RELEASED_TO_REQUESTER, releasedAt: new Date("2026-04-21T13:00:00.000Z") },
    Role.FIRM_ADMIN
  );
  assert.equal(releasedView.status, "released_to_requester");
  assert.equal(releasedView.canViewText, true);
  assert.equal(releasedView.text, "Internal draft text");

  console.log("demand narrative review helper tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
