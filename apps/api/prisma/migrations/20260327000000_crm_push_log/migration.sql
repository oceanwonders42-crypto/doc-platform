-- CrmPushLog: audit log for CRM push attempts (no case state, delivery only)
CREATE TABLE IF NOT EXISTS "CrmPushLog" (
  "id" TEXT NOT NULL,
  "firmId" TEXT NOT NULL,
  "caseId" TEXT NOT NULL,
  "documentId" TEXT,
  "actionType" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "ok" BOOLEAN NOT NULL,
  "externalId" TEXT,
  "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "CrmPushLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CrmPushLog_firmId_idx" ON "CrmPushLog"("firmId");
CREATE INDEX IF NOT EXISTS "CrmPushLog_caseId_idx" ON "CrmPushLog"("caseId");
CREATE INDEX IF NOT EXISTS "CrmPushLog_createdAt_idx" ON "CrmPushLog"("createdAt");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CrmPushLog_firmId_fkey') THEN
    ALTER TABLE "CrmPushLog" ADD CONSTRAINT "CrmPushLog_firmId_fkey"
      FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
