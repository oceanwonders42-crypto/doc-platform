CREATE TYPE "DocumentReviewState" AS ENUM ('IN_REVIEW', 'APPROVED', 'REJECTED', 'EXPORT_READY');

ALTER TABLE "Document"
ADD COLUMN "reviewState" "DocumentReviewState";

UPDATE "Document"
SET "reviewState" = 'IN_REVIEW'
WHERE "reviewState" IS NULL
  AND "status" IN ('NEEDS_REVIEW', 'UPLOADED')
  AND ("routingStatus" IS NULL OR "routingStatus" = 'needs_review');

CREATE INDEX "Document_firmId_reviewState_idx" ON "Document"("firmId", "reviewState");
