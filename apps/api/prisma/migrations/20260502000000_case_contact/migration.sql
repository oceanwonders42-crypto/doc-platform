-- CreateTable
CREATE TABLE "CaseContact" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CaseContact_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CaseContact_firmId_idx" ON "CaseContact"("firmId");
CREATE INDEX "CaseContact_caseId_idx" ON "CaseContact"("caseId");

-- AddForeignKey
ALTER TABLE "CaseContact" ADD CONSTRAINT "CaseContact_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CaseContact" ADD CONSTRAINT "CaseContact_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;
