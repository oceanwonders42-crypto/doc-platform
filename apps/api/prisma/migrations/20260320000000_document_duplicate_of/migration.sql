-- Add duplicateOfId to Document: reference to the original document when this row is a duplicate
ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "duplicateOfId" TEXT;

-- Self-referential FK (skip if already present)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Document_duplicateOfId_fkey'
  ) THEN
    ALTER TABLE "Document" ADD CONSTRAINT "Document_duplicateOfId_fkey"
      FOREIGN KEY ("duplicateOfId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "Document_duplicateOfId_idx" ON "Document"("duplicateOfId");
