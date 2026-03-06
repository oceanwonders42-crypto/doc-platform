-- CaseNote: content -> body, add authorUserId, remove updatedAt
ALTER TABLE "CaseNote" RENAME COLUMN "content" TO "body";
ALTER TABLE "CaseNote" ADD COLUMN "authorUserId" TEXT;
ALTER TABLE "CaseNote" DROP COLUMN IF EXISTS "updatedAt";

-- CaseTask
CREATE TABLE "CaseTask" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CaseTask_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CaseTask_caseId_idx" ON "CaseTask"("caseId");
CREATE INDEX "CaseTask_firmId_idx" ON "CaseTask"("firmId");
CREATE INDEX "CaseTask_firmId_completedAt_dueDate_idx" ON "CaseTask"("firmId", "completedAt", "dueDate");

ALTER TABLE "CaseTask" ADD CONSTRAINT "CaseTask_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;
