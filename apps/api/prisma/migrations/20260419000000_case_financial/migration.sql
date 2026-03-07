-- CreateTable
CREATE TABLE "CaseFinancial" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "medicalBillsTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "liensTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "settlementOffer" DOUBLE PRECISION,
    "settlementAccepted" DOUBLE PRECISION,
    "attorneyFees" DOUBLE PRECISION,
    "costs" DOUBLE PRECISION,
    "netToClient" DOUBLE PRECISION,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CaseFinancial_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CaseFinancial_firmId_caseId_key" ON "CaseFinancial"("firmId", "caseId");
CREATE INDEX "CaseFinancial_caseId_idx" ON "CaseFinancial"("caseId");

-- AddForeignKey
ALTER TABLE "CaseFinancial" ADD CONSTRAINT "CaseFinancial_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CaseFinancial" ADD CONSTRAINT "CaseFinancial_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;
