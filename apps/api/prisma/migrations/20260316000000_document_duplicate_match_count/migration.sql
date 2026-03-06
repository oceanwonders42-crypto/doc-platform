-- Duplicates Detection: ensure Document has file hash/size and duplicate match count
-- file_sha256 / fileSizeBytes may already exist from earlier migrations
ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "file_sha256" TEXT;
ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "fileSizeBytes" INTEGER;
ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "duplicateMatchCount" INTEGER NOT NULL DEFAULT 0;
