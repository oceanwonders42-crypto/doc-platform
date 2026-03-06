-- Centralized system error log for API and other services
CREATE TABLE IF NOT EXISTS "SystemErrorLog" (
  "id" TEXT NOT NULL,
  "service" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "stack" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SystemErrorLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "SystemErrorLog_service_idx" ON "SystemErrorLog"("service");
CREATE INDEX IF NOT EXISTS "SystemErrorLog_createdAt_idx" ON "SystemErrorLog"("createdAt");
