-- Add status to Case (open | pending | closed)
ALTER TABLE "Case" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'open';
