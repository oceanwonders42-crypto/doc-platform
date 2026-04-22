-- Queue 2: document classification (reason, signals), provider fields, case matching (unmatched_reason), duplicate_confidence
-- document_recognition
ALTER TABLE document_recognition ADD COLUMN IF NOT EXISTS classification_reason TEXT;
ALTER TABLE document_recognition ADD COLUMN IF NOT EXISTS classification_signals_json JSONB;
ALTER TABLE document_recognition ADD COLUMN IF NOT EXISTS facility_name TEXT;
ALTER TABLE document_recognition ADD COLUMN IF NOT EXISTS provider_phone TEXT;
ALTER TABLE document_recognition ADD COLUMN IF NOT EXISTS provider_fax TEXT;
ALTER TABLE document_recognition ADD COLUMN IF NOT EXISTS provider_address TEXT;
ALTER TABLE document_recognition ADD COLUMN IF NOT EXISTS provider_specialty TEXT;
ALTER TABLE document_recognition ADD COLUMN IF NOT EXISTS suggested_provider_id TEXT;
ALTER TABLE document_recognition ADD COLUMN IF NOT EXISTS unmatched_reason TEXT;

-- Document.duplicate_confidence (0..1 when duplicateOfId set)
ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS duplicate_confidence NUMERIC;

-- Provider suggestions for unmatched extracted providers (Queue 2)
CREATE TABLE IF NOT EXISTS document_provider_suggestion (
  id TEXT PRIMARY KEY,
  firm_id TEXT NOT NULL,
  document_id TEXT NOT NULL,
  extracted_name TEXT,
  facility_name TEXT,
  specialty TEXT,
  phone TEXT,
  fax TEXT,
  address TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_document_provider_suggestion_firm_document
  ON document_provider_suggestion (firm_id, document_id);
