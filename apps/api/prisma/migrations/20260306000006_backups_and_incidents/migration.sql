-- CreateTable
CREATE TABLE "SystemBackup" (
    "id" TEXT NOT NULL,
    "backupType" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "size" INTEGER NOT NULL DEFAULT 0,
    "checksum" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verifiedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL,

    CONSTRAINT "SystemBackup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemIncident" (
    "id" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL,
    "relatedErrorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "SystemIncident_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SystemBackup_backupType_idx" ON "SystemBackup"("backupType");

-- CreateIndex
CREATE INDEX "SystemBackup_createdAt_idx" ON "SystemBackup"("createdAt");

-- CreateIndex
CREATE INDEX "SystemBackup_status_idx" ON "SystemBackup"("status");

-- CreateIndex
CREATE INDEX "SystemIncident_severity_idx" ON "SystemIncident"("severity");

-- CreateIndex
CREATE INDEX "SystemIncident_status_idx" ON "SystemIncident"("status");

-- CreateIndex
CREATE INDEX "SystemIncident_createdAt_idx" ON "SystemIncident"("createdAt");
