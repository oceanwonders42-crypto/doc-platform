-- CreateTable RoutingFeedback
CREATE TABLE "RoutingFeedback" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "predictedCaseId" TEXT,
    "finalCaseId" TEXT,
    "predictedStatus" TEXT,
    "finalStatus" TEXT,
    "predictedDocType" TEXT,
    "finalDocType" TEXT,
    "confidence" DOUBLE PRECISION,
    "correctedBy" TEXT,
    "wasAccepted" BOOLEAN NOT NULL DEFAULT false,
    "featuresJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoutingFeedback_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RoutingFeedback_firmId_documentId_idx" ON "RoutingFeedback"("firmId", "documentId");
CREATE INDEX "RoutingFeedback_firmId_wasAccepted_idx" ON "RoutingFeedback"("firmId", "wasAccepted");

-- CreateTable RoutingPattern
CREATE TABLE "RoutingPattern" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "docType" TEXT,
    "providerName" TEXT,
    "source" TEXT,
    "fileNamePattern" TEXT,
    "keywordsJson" JSONB,
    "targetCaseId" TEXT,
    "targetFolder" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoutingPattern_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RoutingPattern_firmId_active_priority_idx" ON "RoutingPattern"("firmId", "active", "priority");

-- CreateTable RoutingScoreSnapshot
CREATE TABLE "RoutingScoreSnapshot" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "chosenCaseId" TEXT,
    "chosenFolder" TEXT,
    "chosenDocType" TEXT,
    "confidence" DOUBLE PRECISION,
    "signalsJson" JSONB,
    "candidatesJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoutingScoreSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RoutingScoreSnapshot_firmId_documentId_idx" ON "RoutingScoreSnapshot"("firmId", "documentId");
