-- CreateTable
CREATE TABLE "CaseSummary" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CaseSummary_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CaseSummary_firmId_caseId_key" ON "CaseSummary"("firmId", "caseId");
CREATE INDEX "CaseSummary_firmId_idx" ON "CaseSummary"("firmId");
CREATE INDEX "CaseSummary_caseId_idx" ON "CaseSummary"("caseId");

-- AddForeignKey
ALTER TABLE "CaseSummary" ADD CONSTRAINT "CaseSummary_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CaseSummary" ADD CONSTRAINT "CaseSummary_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;
