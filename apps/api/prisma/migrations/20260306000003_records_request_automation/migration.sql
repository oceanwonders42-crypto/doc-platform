-- Records request automation: extend RecordsRequest, add Attachment, Event, Template, FollowUpRule
-- Run only when RecordsRequest exists (table is created in 20260322500000_create_records_request)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'RecordsRequest') THEN
    RETURN;
  END IF;

  ALTER TABLE "RecordsRequest" ADD COLUMN IF NOT EXISTS "patientName" TEXT;
  ALTER TABLE "RecordsRequest" ADD COLUMN IF NOT EXISTS "patientDob" TIMESTAMP(3);
  ALTER TABLE "RecordsRequest" ADD COLUMN IF NOT EXISTS "dateOfLoss" TIMESTAMP(3);
  ALTER TABLE "RecordsRequest" ADD COLUMN IF NOT EXISTS "requestType" TEXT;
  ALTER TABLE "RecordsRequest" ADD COLUMN IF NOT EXISTS "destinationType" TEXT;
  ALTER TABLE "RecordsRequest" ADD COLUMN IF NOT EXISTS "destinationValue" TEXT;
  ALTER TABLE "RecordsRequest" ADD COLUMN IF NOT EXISTS "subject" TEXT;
  ALTER TABLE "RecordsRequest" ADD COLUMN IF NOT EXISTS "messageBody" TEXT;
  ALTER TABLE "RecordsRequest" ADD COLUMN IF NOT EXISTS "requestedDateFrom" TIMESTAMP(3);
  ALTER TABLE "RecordsRequest" ADD COLUMN IF NOT EXISTS "requestedDateTo" TIMESTAMP(3);
  ALTER TABLE "RecordsRequest" ADD COLUMN IF NOT EXISTS "sentAt" TIMESTAMP(3);
  ALTER TABLE "RecordsRequest" ADD COLUMN IF NOT EXISTS "dueAt" TIMESTAMP(3);
  ALTER TABLE "RecordsRequest" ADD COLUMN IF NOT EXISTS "completedAt" TIMESTAMP(3);
  ALTER TABLE "RecordsRequest" ADD COLUMN IF NOT EXISTS "createdByUserId" TEXT;
  ALTER TABLE "RecordsRequest" ADD COLUMN IF NOT EXISTS "followUpCount" INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE "RecordsRequest" ADD COLUMN IF NOT EXISTS "lastFollowUpAt" TIMESTAMP(3);
  BEGIN
    ALTER TABLE "RecordsRequest" ALTER COLUMN "status" SET DEFAULT 'DRAFT';
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

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
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'RecordsRequestAttachment_recordsRequestId_fkey') THEN
    ALTER TABLE "RecordsRequestAttachment" ADD CONSTRAINT "RecordsRequestAttachment_recordsRequestId_fkey" FOREIGN KEY ("recordsRequestId") REFERENCES "RecordsRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

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
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'RecordsRequestEvent_recordsRequestId_fkey') THEN
    ALTER TABLE "RecordsRequestEvent" ADD CONSTRAINT "RecordsRequestEvent_recordsRequestId_fkey" FOREIGN KEY ("recordsRequestId") REFERENCES "RecordsRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  CREATE TABLE IF NOT EXISTS "RecordsRequestTemplate" (
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
  CREATE INDEX IF NOT EXISTS "RecordsRequestTemplate_firmId_idx" ON "RecordsRequestTemplate"("firmId");

  CREATE TABLE IF NOT EXISTS "RecordsRequestFollowUpRule" (
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
  CREATE INDEX IF NOT EXISTS "RecordsRequestFollowUpRule_firmId_idx" ON "RecordsRequestFollowUpRule"("firmId");
END $$;
