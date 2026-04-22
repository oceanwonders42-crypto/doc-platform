-- Add updatedAt to Case for "Last Updated" display
ALTER TABLE "Case" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
-- Backfill existing rows: use createdAt as initial updatedAt
UPDATE "Case" SET "updatedAt" = "createdAt";
