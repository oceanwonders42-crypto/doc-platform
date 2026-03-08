-- Add ingestedAt for duplicate window (default now; backfill existing from createdAt)
ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "ingestedAt" TIMESTAMP(3);

UPDATE "Document" SET "ingestedAt" = COALESCE("createdAt", CURRENT_TIMESTAMP) WHERE "ingestedAt" IS NULL;

ALTER TABLE "Document" ALTER COLUMN "ingestedAt" SET NOT NULL;
ALTER TABLE "Document" ALTER COLUMN "ingestedAt" SET DEFAULT CURRENT_TIMESTAMP;

-- Ensure fileSizeBytes exists (required for index; added in later migration 20260311)
ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "fileSizeBytes" INTEGER;

-- Ensure file_sha256 exists (required for index; added in later migration 20260316)
ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "file_sha256" TEXT;

-- Index for duplicate check: firmId + file_sha256 + fileSizeBytes (ingestedAt filtered in query)
CREATE INDEX IF NOT EXISTS "Document_firmId_file_sha256_fileSizeBytes_idx"
  ON "Document"("firmId", "file_sha256", "fileSizeBytes");
