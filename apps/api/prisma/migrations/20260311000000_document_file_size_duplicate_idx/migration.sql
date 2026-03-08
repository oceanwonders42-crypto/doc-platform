-- Add fileSizeBytes to Document if not present (duplicate prevention)
ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "fileSizeBytes" INTEGER;

-- Index for duplicate lookup: same firm + same file hash in last 30 days
CREATE INDEX IF NOT EXISTS "Document_firmId_file_sha256_idx" ON "Document"("firmId", "file_sha256");
