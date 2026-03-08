-- CreateTable
CREATE TABLE "CasePacketExport" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CasePacketExport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CasePacketExport_firmId_idx" ON "CasePacketExport"("firmId");
CREATE INDEX "CasePacketExport_caseId_idx" ON "CasePacketExport"("caseId");
CREATE INDEX "CasePacketExport_createdAt_idx" ON "CasePacketExport"("createdAt");

-- AddForeignKey
ALTER TABLE "CasePacketExport" ADD CONSTRAINT "CasePacketExport_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CasePacketExport" ADD CONSTRAINT "CasePacketExport_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;
