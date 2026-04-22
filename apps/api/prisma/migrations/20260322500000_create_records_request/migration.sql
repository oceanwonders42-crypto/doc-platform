-- CreateTable: RecordsRequest (letterBody and generatedDocumentId added in later migrations)
CREATE TABLE "RecordsRequest" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "providerId" TEXT,
    "providerName" TEXT NOT NULL,
    "providerContact" TEXT,
    "dateFrom" TIMESTAMP(3),
    "dateTo" TIMESTAMP(3),
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Draft',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "patientName" TEXT,
    "patientDob" TIMESTAMP(3),
    "dateOfLoss" TIMESTAMP(3),
    "requestType" TEXT,
    "destinationType" TEXT,
    "destinationValue" TEXT,
    "subject" TEXT,
    "messageBody" TEXT,
    "requestedDateFrom" TIMESTAMP(3),
    "requestedDateTo" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "dueAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdByUserId" TEXT,
    "followUpCount" INTEGER NOT NULL DEFAULT 0,
    "lastFollowUpAt" TIMESTAMP(3),
    CONSTRAINT "RecordsRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RecordsRequest_firmId_caseId_idx" ON "RecordsRequest"("firmId", "caseId");
CREATE INDEX IF NOT EXISTS "RecordsRequest_firmId_providerId_idx" ON "RecordsRequest"("firmId", "providerId");
CREATE INDEX IF NOT EXISTS "RecordsRequest_firmId_status_idx" ON "RecordsRequest"("firmId", "status");
CREATE INDEX IF NOT EXISTS "RecordsRequest_firmId_dueAt_idx" ON "RecordsRequest"("firmId", "dueAt");
CREATE INDEX IF NOT EXISTS "RecordsRequest_firmId_createdAt_idx" ON "RecordsRequest"("firmId", "createdAt");

CREATE TABLE IF NOT EXISTS "RecordsRequestAttachment" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "recordsRequestId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RecordsRequestAttachment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "RecordsRequestAttachment_firmId_idx" ON "RecordsRequestAttachment"("firmId");
CREATE INDEX IF NOT EXISTS "RecordsRequestAttachment_recordsRequestId_idx" ON "RecordsRequestAttachment"("recordsRequestId");
ALTER TABLE "RecordsRequestAttachment" ADD CONSTRAINT "RecordsRequestAttachment_recordsRequestId_fkey" FOREIGN KEY ("recordsRequestId") REFERENCES "RecordsRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "RecordsRequestEvent" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "recordsRequestId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "status" TEXT,
    "message" TEXT,
    "metaJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RecordsRequestEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "RecordsRequestEvent_firmId_idx" ON "RecordsRequestEvent"("firmId");
CREATE INDEX IF NOT EXISTS "RecordsRequestEvent_recordsRequestId_idx" ON "RecordsRequestEvent"("recordsRequestId");
CREATE INDEX IF NOT EXISTS "RecordsRequestEvent_createdAt_idx" ON "RecordsRequestEvent"("createdAt");
ALTER TABLE "RecordsRequestEvent" ADD CONSTRAINT "RecordsRequestEvent_recordsRequestId_fkey" FOREIGN KEY ("recordsRequestId") REFERENCES "RecordsRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "RecordsRequestTemplate" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "requestType" TEXT,
    "subject" TEXT,
    "body" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RecordsRequestTemplate_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "RecordsRequestTemplate_firmId_idx" ON "RecordsRequestTemplate"("firmId");

CREATE TABLE IF NOT EXISTS "RecordsRequestFollowUpRule" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "daysAfterSend" INTEGER NOT NULL DEFAULT 14,
    "maxFollowUps" INTEGER NOT NULL DEFAULT 3,
    "messageTemplate" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RecordsRequestFollowUpRule_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "RecordsRequestFollowUpRule_firmId_idx" ON "RecordsRequestFollowUpRule"("firmId");
