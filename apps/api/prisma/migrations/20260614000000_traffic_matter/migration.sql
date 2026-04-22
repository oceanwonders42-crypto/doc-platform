-- TrafficMatter: first-class traffic citation/court workflow. Separate from LegalCase (PI).
CREATE TABLE IF NOT EXISTS "TrafficMatter" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "caseId" TEXT,
    "crmRecordId" TEXT,
    "crmProvider" TEXT,
    "matterType" TEXT NOT NULL DEFAULT 'TRAFFIC',
    "status" TEXT NOT NULL DEFAULT 'NEW_CITATION',
    "documentTypeOfOrigin" TEXT,
    "sourceDocumentId" TEXT,
    "defendantName" TEXT,
    "defendantDob" TIMESTAMP(3),
    "citationNumber" TEXT,
    "statuteCodeRaw" TEXT,
    "statuteCodeNormalized" TEXT,
    "chargeDescriptionRaw" TEXT,
    "chargeListJson" JSONB,
    "jurisdictionState" TEXT,
    "jurisdictionCounty" TEXT,
    "courtName" TEXT,
    "courtType" TEXT,
    "issueDate" TIMESTAMP(3),
    "dueDate" TIMESTAMP(3),
    "hearingDate" TIMESTAMP(3),
    "extractedFactsJson" JSONB,
    "extractionConfidenceJson" JSONB,
    "routingConfidence" DOUBLE PRECISION,
    "reviewRequired" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrafficMatter_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "TrafficMatter_firmId_idx" ON "TrafficMatter"("firmId");
CREATE INDEX IF NOT EXISTS "TrafficMatter_firmId_citationNumber_idx" ON "TrafficMatter"("firmId", "citationNumber");
CREATE INDEX IF NOT EXISTS "TrafficMatter_firmId_jurisdictionState_idx" ON "TrafficMatter"("firmId", "jurisdictionState");
CREATE INDEX IF NOT EXISTS "TrafficMatter_firmId_dueDate_idx" ON "TrafficMatter"("firmId", "dueDate");
CREATE INDEX IF NOT EXISTS "TrafficMatter_firmId_status_idx" ON "TrafficMatter"("firmId", "status");
CREATE INDEX IF NOT EXISTS "TrafficMatter_firmId_createdAt_idx" ON "TrafficMatter"("firmId", "createdAt");

ALTER TABLE "TrafficMatter" ADD CONSTRAINT "TrafficMatter_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Matter routing: suggested_matter_type (PI | TRAFFIC) and review flag for document_recognition
ALTER TABLE document_recognition ADD COLUMN IF NOT EXISTS suggested_matter_type TEXT;
ALTER TABLE document_recognition ADD COLUMN IF NOT EXISTS matter_routing_reason TEXT;
ALTER TABLE document_recognition ADD COLUMN IF NOT EXISTS matter_review_required BOOLEAN DEFAULT false;
COMMENT ON COLUMN document_recognition.suggested_matter_type IS 'Detected workflow: PI (LegalCase) or TRAFFIC (TrafficMatter).';
COMMENT ON COLUMN document_recognition.matter_routing_reason IS 'Why this matter type was chosen; for review when ambiguous.';
COMMENT ON COLUMN document_recognition.matter_review_required IS 'True when matter type or routing is ambiguous.';
