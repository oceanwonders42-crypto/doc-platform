CREATE TABLE "RecordsRequestAttempt" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "recordsRequestId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "ok" BOOLEAN NOT NULL,
    "error" TEXT,
    "externalId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecordsRequestAttempt_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RecordsRequestAttempt_firmId_recordsRequestId_idx" ON "RecordsRequestAttempt"("firmId", "recordsRequestId");
CREATE INDEX "RecordsRequestAttempt_recordsRequestId_idx" ON "RecordsRequestAttempt"("recordsRequestId");

ALTER TABLE "RecordsRequestAttempt" ADD CONSTRAINT "RecordsRequestAttempt_recordsRequestId_fkey" FOREIGN KEY ("recordsRequestId") REFERENCES "RecordsRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
