-- Track "narrative_generated" for Demand Narrative Assistant add-on
ALTER TABLE "UsageMonthly" ADD COLUMN IF NOT EXISTS "narrativeGenerated" INTEGER NOT NULL DEFAULT 0;
