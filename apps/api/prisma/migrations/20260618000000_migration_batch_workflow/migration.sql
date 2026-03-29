CREATE TYPE "MigrationBatchStatus" AS ENUM (
  'UPLOADED',
  'PROCESSING',
  'NEEDS_REVIEW',
  'READY_FOR_EXPORT',
  'EXPORTED',
  'FAILED'
);

CREATE TABLE "MigrationBatch" (
  "id" TEXT NOT NULL,
  "firmId" TEXT NOT NULL,
  "label" TEXT,
  "source" TEXT NOT NULL DEFAULT 'paperless_scan_batch',
  "status" "MigrationBatchStatus" NOT NULL DEFAULT 'UPLOADED',
  "createdByUserId" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "completedAt" TIMESTAMP(3),
  "lastExportedAt" TIMESTAMP(3),
  CONSTRAINT "MigrationBatch_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MigrationBatchClioHandoff" (
  "id" TEXT NOT NULL,
  "batchId" TEXT NOT NULL,
  "firmId" TEXT NOT NULL,
  "clioHandoffExportId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MigrationBatchClioHandoff_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Document"
  ADD COLUMN "migrationBatchId" TEXT;

CREATE INDEX "MigrationBatch_firmId_createdAt_idx"
  ON "MigrationBatch"("firmId", "createdAt");

CREATE INDEX "MigrationBatch_firmId_status_createdAt_idx"
  ON "MigrationBatch"("firmId", "status", "createdAt");

CREATE UNIQUE INDEX "MigrationBatchClioHandoff_batchId_clioHandoffExportId_key"
  ON "MigrationBatchClioHandoff"("batchId", "clioHandoffExportId");

CREATE INDEX "MigrationBatchClioHandoff_firmId_createdAt_idx"
  ON "MigrationBatchClioHandoff"("firmId", "createdAt");

CREATE INDEX "MigrationBatchClioHandoff_batchId_createdAt_idx"
  ON "MigrationBatchClioHandoff"("batchId", "createdAt");

CREATE INDEX "Document_migrationBatchId_idx"
  ON "Document"("migrationBatchId");

CREATE INDEX "Document_firmId_migrationBatchId_idx"
  ON "Document"("firmId", "migrationBatchId");

ALTER TABLE "MigrationBatch"
  ADD CONSTRAINT "MigrationBatch_firmId_fkey"
  FOREIGN KEY ("firmId") REFERENCES "Firm"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

ALTER TABLE "MigrationBatchClioHandoff"
  ADD CONSTRAINT "MigrationBatchClioHandoff_batchId_fkey"
  FOREIGN KEY ("batchId") REFERENCES "MigrationBatch"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

ALTER TABLE "MigrationBatchClioHandoff"
  ADD CONSTRAINT "MigrationBatchClioHandoff_firmId_fkey"
  FOREIGN KEY ("firmId") REFERENCES "Firm"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

ALTER TABLE "MigrationBatchClioHandoff"
  ADD CONSTRAINT "MigrationBatchClioHandoff_clioHandoffExportId_fkey"
  FOREIGN KEY ("clioHandoffExportId") REFERENCES "ClioHandoffExport"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

ALTER TABLE "Document"
  ADD CONSTRAINT "Document_migrationBatchId_fkey"
  FOREIGN KEY ("migrationBatchId") REFERENCES "MigrationBatch"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;
