CREATE TABLE "DemoRequest" (
  "id" TEXT NOT NULL,
  "fullName" TEXT NOT NULL,
  "workEmail" TEXT NOT NULL,
  "firmName" TEXT NOT NULL,
  "firmSize" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "improvements" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "message" TEXT,
  "source" TEXT NOT NULL DEFAULT 'public_demo_form',
  "pageUrl" TEXT,
  "userAgent" TEXT,
  "ipAddress" TEXT,
  "status" TEXT NOT NULL DEFAULT 'NEW',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "DemoRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DemoRequest_workEmail_idx" ON "DemoRequest"("workEmail");
CREATE INDEX "DemoRequest_status_idx" ON "DemoRequest"("status");
CREATE INDEX "DemoRequest_createdAt_idx" ON "DemoRequest"("createdAt");
