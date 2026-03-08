-- CreateTable
CREATE TABLE "DocumentTag" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT,

    CONSTRAINT "DocumentTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentTagLink" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,

    CONSTRAINT "DocumentTagLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DocumentTag_firmId_idx" ON "DocumentTag"("firmId");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentTagLink_documentId_tagId_key" ON "DocumentTagLink"("documentId", "tagId");
CREATE INDEX "DocumentTagLink_documentId_idx" ON "DocumentTagLink"("documentId");
CREATE INDEX "DocumentTagLink_tagId_idx" ON "DocumentTagLink"("tagId");

-- AddForeignKey
ALTER TABLE "DocumentTag" ADD CONSTRAINT "DocumentTag_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DocumentTagLink" ADD CONSTRAINT "DocumentTagLink_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DocumentTagLink" ADD CONSTRAINT "DocumentTagLink_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "DocumentTag"("id") ON DELETE CASCADE ON UPDATE CASCADE;
