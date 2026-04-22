CREATE TYPE "DemandReviewStatus" AS ENUM (
    'DRAFT_GENERATED',
    'PENDING_DEV_REVIEW',
    'DEV_APPROVED',
    'RELEASED_TO_REQUESTER'
);

CREATE TABLE "DemandNarrativeDraft" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "narrativeType" TEXT NOT NULL,
    "tone" TEXT NOT NULL,
    "status" "DemandReviewStatus" NOT NULL DEFAULT 'PENDING_DEV_REVIEW',
    "generatedText" TEXT NOT NULL,
    "warningsJson" JSONB,
    "usedEventsJson" JSONB,
    "generatedByUserId" TEXT,
    "approvedByUserId" TEXT,
    "releasedByUserId" TEXT,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" TIMESTAMP(3),
    "releasedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DemandNarrativeDraft_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DemandNarrativeDraft_firmId_caseId_createdAt_idx"
ON "DemandNarrativeDraft"("firmId", "caseId", "createdAt");

CREATE INDEX "DemandNarrativeDraft_firmId_caseId_status_createdAt_idx"
ON "DemandNarrativeDraft"("firmId", "caseId", "status", "createdAt");

ALTER TABLE "DemandNarrativeDraft"
ADD CONSTRAINT "DemandNarrativeDraft_firmId_fkey"
FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DemandNarrativeDraft"
ADD CONSTRAINT "DemandNarrativeDraft_caseId_fkey"
FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;
