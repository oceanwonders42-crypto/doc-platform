ALTER TABLE "DemandNarrativeDraft"
ADD COLUMN "demandBankRunId" TEXT;

CREATE INDEX "DemandNarrativeDraft_demandBankRunId_idx"
ON "DemandNarrativeDraft"("demandBankRunId");

ALTER TABLE "DemandNarrativeDraft"
ADD CONSTRAINT "DemandNarrativeDraft_demandBankRunId_fkey"
FOREIGN KEY ("demandBankRunId") REFERENCES "demand_bank_runs"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;
