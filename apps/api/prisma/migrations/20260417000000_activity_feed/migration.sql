-- CreateTable
CREATE TABLE "ActivityFeedItem" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "caseId" TEXT,
    "providerId" TEXT,
    "documentId" TEXT,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityFeedItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ActivityFeedItem_firmId_idx" ON "ActivityFeedItem"("firmId");
CREATE INDEX "ActivityFeedItem_caseId_idx" ON "ActivityFeedItem"("caseId");
CREATE INDEX "ActivityFeedItem_createdAt_idx" ON "ActivityFeedItem"("createdAt");

-- AddForeignKey
ALTER TABLE "ActivityFeedItem" ADD CONSTRAINT "ActivityFeedItem_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ActivityFeedItem" ADD CONSTRAINT "ActivityFeedItem_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ActivityFeedItem" ADD CONSTRAINT "ActivityFeedItem_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ActivityFeedItem" ADD CONSTRAINT "ActivityFeedItem_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;
