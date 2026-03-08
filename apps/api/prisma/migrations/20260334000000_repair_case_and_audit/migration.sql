-- Repair Case table: add clientName, createdAt (schema expects them; DB may have clientId, status from old migration)
ALTER TABLE "Case" ADD COLUMN IF NOT EXISTS "clientName" TEXT;
ALTER TABLE "Case" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3);
UPDATE "Case" SET "createdAt" = CURRENT_TIMESTAMP WHERE "createdAt" IS NULL;
ALTER TABLE "Case" ALTER COLUMN "createdAt" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Case" ALTER COLUMN "createdAt" SET NOT NULL;
-- Backfill clientName from clientId if clientId exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Case' AND column_name = 'clientId') THEN
    UPDATE "Case" SET "clientName" = COALESCE("clientName", "clientId") WHERE "clientName" IS NULL AND "clientId" IS NOT NULL;
  END IF;
END $$;
-- Ensure createdAt is populated
UPDATE "Case" SET "createdAt" = COALESCE("createdAt", CURRENT_TIMESTAMP) WHERE "createdAt" IS NULL;

-- Create DocumentAuditEvent if missing (expected by schema)
CREATE TABLE IF NOT EXISTS "DocumentAuditEvent" (
  "id" TEXT NOT NULL,
  "documentId" TEXT NOT NULL,
  "firmId" TEXT NOT NULL,
  "actor" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "fromCaseId" TEXT,
  "toCaseId" TEXT,
  "metaJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DocumentAuditEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "DocumentAuditEvent_documentId_idx" ON "DocumentAuditEvent"("documentId");
CREATE INDEX IF NOT EXISTS "DocumentAuditEvent_firmId_idx" ON "DocumentAuditEvent"("firmId");
CREATE INDEX IF NOT EXISTS "DocumentAuditEvent_action_idx" ON "DocumentAuditEvent"("action");
