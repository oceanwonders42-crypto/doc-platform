-- AlterTable
ALTER TABLE "ClioHandoffExport"
ADD COLUMN "idempotencyKey" TEXT,
ADD COLUMN "requestFingerprint" TEXT,
ADD COLUMN "reExportOverride" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "reExportReason" TEXT;

-- AlterTable
ALTER TABLE "ClioHandoffExportCase"
ADD COLUMN "isReExport" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "ClioHandoffExport_firmId_requestFingerprint_exportedAt_idx"
ON "ClioHandoffExport"("firmId", "requestFingerprint", "exportedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ClioHandoffExport_firmId_idempotencyKey_key"
ON "ClioHandoffExport"("firmId", "idempotencyKey");
