CREATE TABLE "demand_templates" (
  "id" TEXT NOT NULL,
  "firmId" TEXT,
  "name" TEXT NOT NULL,
  "caseType" TEXT,
  "demandType" TEXT,
  "version" INTEGER NOT NULL DEFAULT 1,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "requiredSections" TEXT[] NOT NULL DEFAULT ARRAY[
    'facts_liability',
    'injuries',
    'treatment_chronology',
    'bills',
    'missing_records',
    'damages',
    'demand_amount',
    'exhibits'
  ]::TEXT[],
  "structureJson" JSONB,
  "examplesText" TEXT,
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "demand_templates_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "demand_templates_firmId_isActive_idx"
  ON "demand_templates"("firmId", "isActive");

CREATE INDEX "demand_templates_caseType_demandType_isActive_idx"
  ON "demand_templates"("caseType", "demandType", "isActive");

ALTER TABLE "demand_templates"
  ADD CONSTRAINT "demand_templates_firmId_fkey"
  FOREIGN KEY ("firmId") REFERENCES "Firm"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;
