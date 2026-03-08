-- CreateTable: RecordsRequest (letterBody and generatedDocumentId added in later migrations)
CREATE TABLE "RecordsRequest" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "providerId" TEXT,
    "providerName" TEXT NOT NULL,
    "providerContact" TEXT,
    "dateFrom" TIMESTAMP(3),
    "dateTo" TIMESTAMP(3),
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Draft',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecordsRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RecordsRequest_firmId_caseId_idx" ON "RecordsRequest"("firmId", "caseId");
