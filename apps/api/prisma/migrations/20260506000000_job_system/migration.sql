-- AlterEnum: add cancelled to JobStatus
ALTER TYPE "JobStatus" ADD VALUE 'cancelled';

-- Job: ensure payload has default for existing rows, then make NOT NULL
UPDATE "Job" SET "payload" = '{}' WHERE "payload" IS NULL;
ALTER TABLE "Job" ALTER COLUMN "payload" SET NOT NULL;

-- Job: make firmId nullable
ALTER TABLE "Job" ALTER COLUMN "firmId" DROP NOT NULL;

-- Job: add new columns
ALTER TABLE "Job" ADD COLUMN "maxAttempts" INTEGER NOT NULL DEFAULT 5;
ALTER TABLE "Job" ADD COLUMN "priority" INTEGER NOT NULL DEFAULT 100;
ALTER TABLE "Job" ADD COLUMN "lockedAt" TIMESTAMP(3);
ALTER TABLE "Job" ADD COLUMN "lockedBy" TEXT;
ALTER TABLE "Job" ADD COLUMN "resultMeta" JSONB;
ALTER TABLE "Job" ADD COLUMN "finishedAt" TIMESTAMP(3);

-- Drop old indexes
DROP INDEX IF EXISTS "Job_firmId_idx";
DROP INDEX IF EXISTS "Job_status_idx";
DROP INDEX IF EXISTS "Job_status_runAt_idx";

-- Create new indexes
CREATE INDEX "Job_status_runAt_priority_idx" ON "Job"("status", "runAt", "priority");
CREATE INDEX "Job_firmId_status_idx" ON "Job"("firmId", "status");
CREATE INDEX "Job_type_status_idx" ON "Job"("type", "status");

-- CreateTable JobEvent
CREATE TABLE "JobEvent" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "JobEvent_jobId_idx" ON "JobEvent"("jobId");

ALTER TABLE "JobEvent" ADD CONSTRAINT "JobEvent_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;
