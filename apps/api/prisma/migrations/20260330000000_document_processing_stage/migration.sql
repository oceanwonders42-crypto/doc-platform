-- Document processing stage for AI pipeline progress
DO $$ BEGIN
  CREATE TYPE "ProcessingStage" AS ENUM ('uploaded', 'ocr', 'classification', 'extraction', 'case_match', 'complete');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "processingStage" "ProcessingStage" NOT NULL DEFAULT 'uploaded';
