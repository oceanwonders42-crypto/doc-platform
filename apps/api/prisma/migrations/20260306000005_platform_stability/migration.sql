-- Platform stability: extend SystemErrorLog, add AppBugReport (SystemErrorLog created in 20260331000000)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'SystemErrorLog') THEN
    RETURN;
  END IF;
  ALTER TABLE "SystemErrorLog" ADD COLUMN IF NOT EXISTS "firmId" TEXT;
  ALTER TABLE "SystemErrorLog" ADD COLUMN IF NOT EXISTS "userId" TEXT;
  ALTER TABLE "SystemErrorLog" ADD COLUMN IF NOT EXISTS "area" TEXT;
  ALTER TABLE "SystemErrorLog" ADD COLUMN IF NOT EXISTS "route" TEXT;
  ALTER TABLE "SystemErrorLog" ADD COLUMN IF NOT EXISTS "method" TEXT;
  ALTER TABLE "SystemErrorLog" ADD COLUMN IF NOT EXISTS "severity" TEXT;
  ALTER TABLE "SystemErrorLog" ADD COLUMN IF NOT EXISTS "metaJson" JSONB;
  ALTER TABLE "SystemErrorLog" ADD COLUMN IF NOT EXISTS "resolvedAt" TIMESTAMP(3);
  ALTER TABLE "SystemErrorLog" ADD COLUMN IF NOT EXISTS "status" TEXT;
  CREATE INDEX IF NOT EXISTS "SystemErrorLog_firmId_idx" ON "SystemErrorLog"("firmId");
  CREATE INDEX IF NOT EXISTS "SystemErrorLog_severity_idx" ON "SystemErrorLog"("severity");
  CREATE INDEX IF NOT EXISTS "SystemErrorLog_status_idx" ON "SystemErrorLog"("status");
  CREATE TABLE IF NOT EXISTS "AppBugReport" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "userId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "pageUrl" TEXT,
    "screenshotUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "priority" TEXT NOT NULL DEFAULT 'MEDIUM',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AppBugReport_pkey" PRIMARY KEY ("id")
  );
  CREATE INDEX IF NOT EXISTS "AppBugReport_firmId_idx" ON "AppBugReport"("firmId");
  CREATE INDEX IF NOT EXISTS "AppBugReport_status_idx" ON "AppBugReport"("status");
  CREATE INDEX IF NOT EXISTS "AppBugReport_priority_idx" ON "AppBugReport"("priority");
  CREATE INDEX IF NOT EXISTS "AppBugReport_createdAt_idx" ON "AppBugReport"("createdAt");
END $$;
