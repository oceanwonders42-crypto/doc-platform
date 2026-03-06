-- Store only caseId, externalMatterId, firmId (no full case records from CRM)
CREATE TABLE IF NOT EXISTS "CrmCaseMapping" (
  "id" TEXT NOT NULL,
  "firmId" TEXT NOT NULL,
  "caseId" TEXT NOT NULL,
  "externalMatterId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "CrmCaseMapping_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CrmCaseMapping_firmId_caseId_key" ON "CrmCaseMapping"("firmId", "caseId");
CREATE INDEX IF NOT EXISTS "CrmCaseMapping_firmId_idx" ON "CrmCaseMapping"("firmId");
CREATE INDEX IF NOT EXISTS "CrmCaseMapping_externalMatterId_idx" ON "CrmCaseMapping"("externalMatterId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CrmCaseMapping_firmId_fkey') THEN
    ALTER TABLE "CrmCaseMapping" ADD CONSTRAINT "CrmCaseMapping_firmId_fkey"
      FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
