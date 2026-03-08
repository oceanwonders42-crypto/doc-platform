-- CreateTable: CaseTimelineEvent
CREATE TABLE IF NOT EXISTS "CaseTimelineEvent" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "eventDate" TIMESTAMP(3),
    "eventType" TEXT,
    "facilityId" TEXT,
    "provider" TEXT,
    "diagnosis" TEXT,
    "procedure" TEXT,
    "amount" TEXT,
    "documentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CaseTimelineEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable: CaseTimelineRebuild
CREATE TABLE IF NOT EXISTS "CaseTimelineRebuild" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "rebuiltAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CaseTimelineRebuild_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CaseTimelineEvent_caseId_firmId_idx" ON "CaseTimelineEvent"("caseId", "firmId");
CREATE INDEX IF NOT EXISTS "CaseTimelineEvent_documentId_idx" ON "CaseTimelineEvent"("documentId");
CREATE UNIQUE INDEX IF NOT EXISTS "CaseTimelineRebuild_caseId_firmId_key" ON "CaseTimelineRebuild"("caseId", "firmId");
CREATE INDEX IF NOT EXISTS "CaseTimelineRebuild_caseId_idx" ON "CaseTimelineRebuild"("caseId");
