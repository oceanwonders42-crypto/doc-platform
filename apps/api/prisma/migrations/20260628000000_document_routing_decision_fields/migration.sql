ALTER TABLE "Document"
  ADD COLUMN IF NOT EXISTS "routing_confidence" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "routing_reason" TEXT,
  ADD COLUMN IF NOT EXISTS "routing_source_fields" JSONB,
  ADD COLUMN IF NOT EXISTS "routing_decision" JSONB;

CREATE INDEX IF NOT EXISTS "Document_firmId_routing_confidence_idx"
  ON "Document"("firmId", "routing_confidence")
  WHERE "routing_confidence" IS NOT NULL;

COMMENT ON COLUMN "Document"."routing_confidence" IS 'Final structured routing confidence for the latest AI/document routing decision.';
COMMENT ON COLUMN "Document"."routing_reason" IS 'Human-readable reason for the latest AI/document routing decision.';
COMMENT ON COLUMN "Document"."routing_source_fields" IS 'Normalized source fields used for document-to-case routing.';
COMMENT ON COLUMN "Document"."routing_decision" IS 'Structured AI/document routing decision object for audit and UI visibility.';
