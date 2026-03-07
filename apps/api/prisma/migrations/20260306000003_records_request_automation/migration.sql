-- Records request automation: extend RecordsRequest, add Attachment, Event, Template, FollowUpRule

ALTER TABLE "RecordsRequest" ADD COLUMN "patientName" TEXT;
ALTER TABLE "RecordsRequest" ADD COLUMN "patientDob" TIMESTAMP(3);
ALTER TABLE "RecordsRequest" ADD COLUMN "dateOfLoss" TIMESTAMP(3);
ALTER TABLE "RecordsRequest" ADD COLUMN "requestType" TEXT;
ALTER TABLE "RecordsRequest" ADD COLUMN "destinationType" TEXT;
ALTER TABLE "RecordsRequest" ADD COLUMN "destinationValue" TEXT;
ALTER TABLE "RecordsRequest" ADD COLUMN "subject" TEXT;
ALTER TABLE "RecordsRequest" ADD COLUMN "messageBody" TEXT;
ALTER TABLE "RecordsRequest" ADD COLUMN "requestedDateFrom" TIMESTAMP(3);
ALTER TABLE "RecordsRequest" ADD COLUMN "requestedDateTo" TIMESTAMP(3);
ALTER TABLE "RecordsRequest" ADD COLUMN "sentAt" TIMESTAMP(3);
ALTER TABLE "RecordsRequest" ADD COLUMN "dueAt" TIMESTAMP(3);
ALTER TABLE "RecordsRequest" ADD COLUMN "completedAt" TIMESTAMP(3);
ALTER TABLE "RecordsRequest" ADD COLUMN "createdByUserId" TEXT;
ALTER TABLE "RecordsRequest" ADD COLUMN "followUpCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "RecordsRequest" ADD COLUMN "lastFollowUpAt" TIMESTAMP(3);
ALTER TABLE "RecordsRequest" ALTER COLUMN "status" SET DEFAULT 'DRAFT';

CREATE INDEX "RecordsRequest_firmId_providerId_idx" ON "RecordsRequest"("firmId", "providerId");
CREATE INDEX "RecordsRequest_firmId_status_idx" ON "RecordsRequest"("firmId", "status");
CREATE INDEX "RecordsRequest_firmId_dueAt_idx" ON "RecordsRequest"("firmId", "dueAt");
CREATE INDEX "RecordsRequest_firmId_createdAt_idx" ON "RecordsRequest"("firmId", "createdAt");

CREATE TABLE "RecordsRequestAttachment" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "recordsRequestId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RecordsRequestAttachment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "RecordsRequestAttachment_firmId_idx" ON "RecordsRequestAttachment"("firmId");
CREATE INDEX "RecordsRequestAttachment_recordsRequestId_idx" ON "RecordsRequestAttachment"("recordsRequestId");
ALTER TABLE "RecordsRequestAttachment" ADD CONSTRAINT "RecordsRequestAttachment_recordsRequestId_fkey" FOREIGN KEY ("recordsRequestId") REFERENCES "RecordsRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "RecordsRequestEvent" (
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
CREATE INDEX "RecordsRequestEvent_firmId_idx" ON "RecordsRequestEvent"("firmId");
CREATE INDEX "RecordsRequestEvent_recordsRequestId_idx" ON "RecordsRequestEvent"("recordsRequestId");
CREATE INDEX "RecordsRequestEvent_createdAt_idx" ON "RecordsRequestEvent"("createdAt");
ALTER TABLE "RecordsRequestEvent" ADD CONSTRAINT "RecordsRequestEvent_recordsRequestId_fkey" FOREIGN KEY ("recordsRequestId") REFERENCES "RecordsRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "RecordsRequestTemplate" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "requestType" TEXT,
    "subject" TEXT,
    "body" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RecordsRequestTemplate_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "RecordsRequestTemplate_firmId_idx" ON "RecordsRequestTemplate"("firmId");

CREATE TABLE "RecordsRequestFollowUpRule" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "daysAfterSend" INTEGER NOT NULL DEFAULT 14,
    "maxFollowUps" INTEGER NOT NULL DEFAULT 3,
    "messageTemplate" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RecordsRequestFollowUpRule_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "RecordsRequestFollowUpRule_firmId_idx" ON "RecordsRequestFollowUpRule"("firmId");
