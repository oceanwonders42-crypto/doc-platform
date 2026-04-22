-- CreateTable
CREATE TABLE "DemandPackage" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "summaryText" TEXT,
    "damagesText" TEXT,
    "liabilityText" TEXT,
    "treatmentText" TEXT,
    "futureCareText" TEXT,
    "settlementText" TEXT,
    "generatedDocId" TEXT,
    "generatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DemandPackage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DemandPackageSectionSource" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "demandPackageId" TEXT NOT NULL,
    "sectionKey" TEXT NOT NULL,
    "documentId" TEXT,
    "timelineEventId" TEXT,
    "sourceType" TEXT NOT NULL,
    "sourceMeta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DemandPackageSectionSource_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DemandPackage_firmId_caseId_idx" ON "DemandPackage"("firmId", "caseId");

-- CreateIndex
CREATE INDEX "DemandPackageSectionSource_firmId_demandPackageId_idx" ON "DemandPackageSectionSource"("firmId", "demandPackageId");

-- AddForeignKey
ALTER TABLE "DemandPackage" ADD CONSTRAINT "DemandPackage_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DemandPackage" ADD CONSTRAINT "DemandPackage_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DemandPackageSectionSource" ADD CONSTRAINT "DemandPackageSectionSource_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DemandPackageSectionSource" ADD CONSTRAINT "DemandPackageSectionSource_demandPackageId_fkey" FOREIGN KEY ("demandPackageId") REFERENCES "DemandPackage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
