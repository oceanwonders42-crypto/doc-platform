-- Firm feature flags (add-on gating for insurance/court extraction)
ALTER TABLE "Firm" ADD COLUMN IF NOT EXISTS "features" JSONB;

-- Usage tracking for insurance_doc_extracted and court_doc_extracted
ALTER TABLE "UsageMonthly" ADD COLUMN IF NOT EXISTS "insuranceDocsExtracted" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "UsageMonthly" ADD COLUMN IF NOT EXISTS "courtDocsExtracted" INTEGER NOT NULL DEFAULT 0;
