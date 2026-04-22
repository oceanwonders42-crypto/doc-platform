-- Centralized system error log for API and other services
CREATE TABLE IF NOT EXISTS "SystemErrorLog" (
  "id" TEXT NOT NULL,
  "service" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "stack" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "firmId" TEXT,
  "userId" TEXT,
  "area" TEXT,
  "route" TEXT,
  "method" TEXT,
  "severity" TEXT,
  "metaJson" JSONB,
  "resolvedAt" TIMESTAMP(3),
  "status" TEXT,
  CONSTRAINT "SystemErrorLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "SystemErrorLog_service_idx" ON "SystemErrorLog"("service");
CREATE INDEX IF NOT EXISTS "SystemErrorLog_createdAt_idx" ON "SystemErrorLog"("createdAt");
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
