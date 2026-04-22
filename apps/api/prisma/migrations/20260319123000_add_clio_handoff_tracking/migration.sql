-- CreateEnum
CREATE TYPE "ClioHandoffExportType" AS ENUM ('SINGLE_CASE', 'BATCH');

-- CreateEnum
CREATE TYPE "ClioHandoffExportSubtype" AS ENUM ('CONTACTS', 'MATTERS', 'COMBINED_BATCH');

-- CreateEnum
CREATE TYPE "ClioHandoffCaseStatus" AS ENUM ('INCLUDED', 'SKIPPED');

-- CreateTable
CREATE TABLE "ClioHandoffExport" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "exportType" "ClioHandoffExportType" NOT NULL,
    "exportSubtype" "ClioHandoffExportSubtype" NOT NULL,
    "actorType" TEXT,
    "actorUserId" TEXT,
    "actorApiKeyId" TEXT,
    "actorLabel" TEXT,
    "actorRole" TEXT,
    "archiveFileName" TEXT,
    "contactsFileName" TEXT,
    "mattersFileName" TEXT,
    "manifestFileName" TEXT,
    "contactsRowCount" INTEGER,
    "mattersRowCount" INTEGER,
    "manifestJson" JSONB,
    "exportedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClioHandoffExport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClioHandoffExportCase" (
    "id" TEXT NOT NULL,
    "exportId" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "caseNumber" TEXT,
    "caseTitle" TEXT,
    "clientName" TEXT,
    "status" "ClioHandoffCaseStatus" NOT NULL,
    "skipReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClioHandoffExportCase_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "ClioHandoffExport"
ADD CONSTRAINT "ClioHandoffExport_firmId_fkey"
FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClioHandoffExportCase"
ADD CONSTRAINT "ClioHandoffExportCase_exportId_fkey"
FOREIGN KEY ("exportId") REFERENCES "ClioHandoffExport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClioHandoffExportCase"
ADD CONSTRAINT "ClioHandoffExportCase_firmId_fkey"
FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "ClioHandoffExport_firmId_exportedAt_idx" ON "ClioHandoffExport"("firmId", "exportedAt");

-- CreateIndex
CREATE INDEX "ClioHandoffExport_firmId_exportType_exportedAt_idx" ON "ClioHandoffExport"("firmId", "exportType", "exportedAt");

-- CreateIndex
CREATE INDEX "ClioHandoffExportCase_exportId_idx" ON "ClioHandoffExportCase"("exportId");

-- CreateIndex
CREATE INDEX "ClioHandoffExportCase_firmId_caseId_createdAt_idx" ON "ClioHandoffExportCase"("firmId", "caseId", "createdAt");

-- CreateIndex
CREATE INDEX "ClioHandoffExportCase_firmId_status_createdAt_idx" ON "ClioHandoffExportCase"("firmId", "status", "createdAt");
