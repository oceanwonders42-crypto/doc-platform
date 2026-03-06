-- CreateTable
CREATE TABLE "CaseProvider" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "relationship" TEXT NOT NULL DEFAULT 'treating',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CaseProvider_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CaseProvider_firmId_caseId_providerId_key" ON "CaseProvider"("firmId", "caseId", "providerId");

-- CreateIndex
CREATE INDEX "CaseProvider_firmId_providerId_idx" ON "CaseProvider"("firmId", "providerId");

-- AddForeignKey
ALTER TABLE "CaseProvider" ADD CONSTRAINT "CaseProvider_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseProvider" ADD CONSTRAINT "CaseProvider_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseProvider" ADD CONSTRAINT "CaseProvider_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
