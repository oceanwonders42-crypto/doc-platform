CREATE TABLE "demand_bank_documents" (
  "id" TEXT NOT NULL,
  "firmId" TEXT NOT NULL,
  "matterId" TEXT,
  "sourceDocumentId" TEXT,
  "title" TEXT NOT NULL,
  "fileName" TEXT,
  "originalText" TEXT NOT NULL,
  "redactedText" TEXT,
  "summary" TEXT,
  "jurisdiction" TEXT,
  "caseType" TEXT,
  "liabilityType" TEXT,
  "injuryTags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "treatmentTags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "bodyPartTags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "mriPresent" BOOLEAN NOT NULL DEFAULT false,
  "injectionsPresent" BOOLEAN NOT NULL DEFAULT false,
  "surgeryPresent" BOOLEAN NOT NULL DEFAULT false,
  "treatmentDurationDays" INTEGER,
  "totalBillsAmount" DOUBLE PRECISION,
  "demandAmount" DOUBLE PRECISION,
  "templateFamily" TEXT,
  "toneStyle" TEXT,
  "qualityScore" INTEGER,
  "approvedForReuse" BOOLEAN NOT NULL DEFAULT false,
  "blockedForReuse" BOOLEAN NOT NULL DEFAULT false,
  "reviewStatus" TEXT NOT NULL DEFAULT 'pending',
  "reviewedBy" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "createdBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "demand_bank_documents_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "demand_bank_sections" (
  "id" TEXT NOT NULL,
  "demandBankDocumentId" TEXT NOT NULL,
  "sectionType" TEXT NOT NULL,
  "heading" TEXT,
  "originalText" TEXT NOT NULL,
  "redactedText" TEXT,
  "qualityScore" INTEGER,
  "approvedForReuse" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "demand_bank_sections_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "demand_bank_runs" (
  "id" TEXT NOT NULL,
  "matterId" TEXT,
  "firmId" TEXT NOT NULL,
  "runType" TEXT NOT NULL,
  "templateId" TEXT,
  "inputCaseProfile" JSONB NOT NULL,
  "retrievedDemandIds" JSONB NOT NULL,
  "retrievedSectionIds" JSONB NOT NULL,
  "retrievalReasoning" JSONB,
  "model" TEXT,
  "promptVersion" TEXT,
  "createdBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "demand_bank_runs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "demand_bank_documents_firmId_createdAt_idx"
  ON "demand_bank_documents"("firmId", "createdAt");

CREATE INDEX "demand_bank_documents_firmId_matterId_idx"
  ON "demand_bank_documents"("firmId", "matterId");

CREATE INDEX "demand_bank_documents_firmId_reviewStatus_createdAt_idx"
  ON "demand_bank_documents"("firmId", "reviewStatus", "createdAt");

CREATE INDEX "demand_bank_documents_firmId_approvedForReuse_blockedForReuse_createdAt_idx"
  ON "demand_bank_documents"("firmId", "approvedForReuse", "blockedForReuse", "createdAt");

CREATE INDEX "demand_bank_sections_demandBankDocumentId_createdAt_idx"
  ON "demand_bank_sections"("demandBankDocumentId", "createdAt");

CREATE INDEX "demand_bank_sections_approvedForReuse_sectionType_idx"
  ON "demand_bank_sections"("approvedForReuse", "sectionType");

CREATE INDEX "demand_bank_runs_firmId_createdAt_idx"
  ON "demand_bank_runs"("firmId", "createdAt");

CREATE INDEX "demand_bank_runs_firmId_matterId_createdAt_idx"
  ON "demand_bank_runs"("firmId", "matterId", "createdAt");

CREATE INDEX "demand_bank_runs_firmId_runType_createdAt_idx"
  ON "demand_bank_runs"("firmId", "runType", "createdAt");

ALTER TABLE "demand_bank_documents"
  ADD CONSTRAINT "demand_bank_documents_firmId_fkey"
  FOREIGN KEY ("firmId") REFERENCES "Firm"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

ALTER TABLE "demand_bank_sections"
  ADD CONSTRAINT "demand_bank_sections_demandBankDocumentId_fkey"
  FOREIGN KEY ("demandBankDocumentId") REFERENCES "demand_bank_documents"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

ALTER TABLE "demand_bank_runs"
  ADD CONSTRAINT "demand_bank_runs_firmId_fkey"
  FOREIGN KEY ("firmId") REFERENCES "Firm"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;
