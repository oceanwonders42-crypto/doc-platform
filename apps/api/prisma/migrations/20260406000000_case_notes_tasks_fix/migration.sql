-- CaseTask: add updatedAt column
ALTER TABLE "CaseTask" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CaseTask: fix indexes (drop old, add new)
DROP INDEX IF EXISTS "CaseTask_firmId_completedAt_dueDate_idx";
CREATE INDEX IF NOT EXISTS "CaseTask_firmId_completedAt_idx" ON "CaseTask"("firmId", "completedAt");
CREATE INDEX IF NOT EXISTS "CaseTask_firmId_caseId_idx" ON "CaseTask"("firmId", "caseId");

-- CaseNote: add composite index
CREATE INDEX IF NOT EXISTS "CaseNote_firmId_caseId_idx" ON "CaseNote"("firmId", "caseId");
