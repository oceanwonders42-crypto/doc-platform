-- Track "duplicate_detected" for Duplicates Detection add-on
ALTER TABLE "UsageMonthly" ADD COLUMN IF NOT EXISTS "duplicateDetected" INTEGER NOT NULL DEFAULT 0;
