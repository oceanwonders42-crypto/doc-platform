-- AlterTable
ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "failureStage" TEXT;
ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "failureReason" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Document_firmId_failureStage_idx" ON "Document"("firmId", "failureStage");
