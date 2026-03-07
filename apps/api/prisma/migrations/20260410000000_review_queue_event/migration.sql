CREATE TABLE "ReviewQueueEvent" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "enteredAt" TIMESTAMP(3) NOT NULL,
    "exitedAt" TIMESTAMP(3),
    "resolutionType" TEXT,

    CONSTRAINT "ReviewQueueEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ReviewQueueEvent_firmId_documentId_idx" ON "ReviewQueueEvent"("firmId", "documentId");
CREATE INDEX "ReviewQueueEvent_firmId_enteredAt_idx" ON "ReviewQueueEvent"("firmId", "enteredAt");
CREATE INDEX "ReviewQueueEvent_exitedAt_idx" ON "ReviewQueueEvent"("exitedAt");

ALTER TABLE "ReviewQueueEvent" ADD CONSTRAINT "ReviewQueueEvent_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
