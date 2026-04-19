-- Repair migration for drifted environments where document_recognition was never created
-- or was created through a partial/manual path. This migration is intentionally idempotent:
-- it only creates the table, ensures required columns exist, restores the FK if possible,
-- and adds the normalized_text_hash index used by duplicate detection.

CREATE TABLE IF NOT EXISTS document_recognition (
  document_id TEXT PRIMARY KEY,
  text_excerpt TEXT,
  doc_type TEXT,
  client_name TEXT,
  case_number TEXT,
  incident_date TEXT,
  confidence NUMERIC,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  match_confidence NUMERIC,
  match_reason TEXT,
  suggested_case_id TEXT,
  detected_language TEXT,
  possible_languages JSONB,
  ocr_engine TEXT,
  ocr_confidence NUMERIC,
  has_handwriting BOOLEAN,
  handwriting_heavy BOOLEAN,
  handwriting_confidence NUMERIC,
  page_diagnostics JSONB,
  extraction_strict_mode BOOLEAN,
  insurance_fields JSONB,
  risks JSONB,
  insights JSONB,
  summary JSONB,
  court_fields JSONB,
  text_fingerprint TEXT,
  normalized_text_hash TEXT,
  page_texts_json JSONB,
  extracted_json JSONB,
  extraction_version TEXT,
  quality_score NUMERIC,
  issues_json JSONB,
  page_count_detected INT,
  provider_name TEXT,
  classification_reason TEXT,
  classification_signals_json JSONB,
  facility_name TEXT,
  provider_phone TEXT,
  provider_fax TEXT,
  provider_address TEXT,
  provider_specialty TEXT,
  suggested_provider_id TEXT,
  unmatched_reason TEXT,
  classification_status TEXT,
  suggested_doc_type TEXT,
  provider_name_normalized TEXT,
  provider_resolution_status TEXT,
  suggested_matter_type TEXT,
  matter_routing_reason TEXT,
  matter_review_required BOOLEAN DEFAULT false
);

ALTER TABLE document_recognition ADD COLUMN IF NOT EXISTS text_excerpt TEXT;
ALTER TABLE document_recognition ADD COLUMN IF NOT EXISTS doc_type TEXT;
ALTER TABLE document_recognition ADD COLUMN IF NOT EXISTS client_name TEXT;
ALTER TABLE document_recognition ADD COLUMN IF NOT EXISTS case_number TEXT;
ALTER TABLE document_recognition ADD COLUMN IF NOT EXISTS incident_date TEXT;
ALTER TABLE document_recognition ADD COLUMN IF NOT EXISTS confidence NUMERIC;
ALTER TABLE document_recognition ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE document_recognition ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE document_recognition ADD COLUMN IF NOT EXISTS match_confidence NUMERIC;
ALTER TABLE document_recognition ADD COLUMN IF NOT EXISTS match_reason TEXT;
ALTER TABLE document_recognition ADD COLUMN IF NOT EXISTS suggested_case_id TEXT;
ALTER TABLE document_recognition ADD COLUMN IF NOT EXISTS detected_language TEXT;
ALTER TABLE document_recognition ADD COLUMN IF NOT EXISTS possible_languages JSONB;
ALTER TABLE document_recognition ADD COLUMN IF NOT EXISTS ocr_engine TEXT;
ALTER TABLE document_recognition ADD COLUMN IF NOT EXISTS ocr_confidence NUMERIC;
ALTER TABLE document_recognition ADD COLUMN IF NOT EXISTS has_handwriting BOOLEAN;
ALTER TABLE document_recognition ADD COLUMN IF NOT EXISTS handwriting_heavy BOOLEAN;
ALTER TABLE document_recognition ADD COLUMN IF NOT EXISTS handwriting_confidence NUMERIC;
ALTER TABLE document_recognition ADD COLUMN IF NOT EXISTS page_diagnostics JSONB;
ALTER TABLE document_recognition ADD COLUMN IF NOT EXISTS extraction_strict_mode BOOLEAN;
ALTER TABLE document_recognition ADD COLUMN IF NOT EXISTS insurance_fields JSONB;
ALTER TABLE document_recognition ADD COLUMN IF NOT EXISTS risks JSONB;
ALTER TABLE document_recognition ADD COLUMN IF NOT EXISTS insights JSONB;
ALTER TABLE document_recognition ADD COLUMN IF NOT EXISTS summary JSONB;
ALTER TABLE document_recognition ADD COLUMN IF NOT EXISTS court_fields JSONB;
ALTER TABLE document_recognition ADD COLUMN IF NOT EXISTS text_fingerprint TEXT;
ALTER TABLE document_recognition ADD COLUMN IF NOT EXISTS normalized_text_hash TEXT;
ALTER TABLE document_recognition ADD COLUMN IF NOT EXISTS page_texts_json JSONB;
ALTER TABLE document_recognition ADD COLUMN IF NOT EXISTS extracted_json JSONB;
ALTER TABLE document_recognition ADD COLUMN IF NOT EXISTS extraction_version TEXT;
ALTER TABLE document_recognition ADD COLUMN IF NOT EXISTS quality_score NUMERIC;
ALTER TABLE document_recognition ADD COLUMN IF NOT EXISTS issues_json JSONB;
ALTER TABLE document_recognition ADD COLUMN IF NOT EXISTS page_count_detected INT;
ALTER TABLE document_recognition ADD COLUMN IF NOT EXISTS provider_name TEXT;
ALTER TABLE document_recognition ADD COLUMN IF NOT EXISTS classification_reason TEXT;
ALTER TABLE document_recognition ADD COLUMN IF NOT EXISTS classification_signals_json JSONB;
ALTER TABLE document_recognition ADD COLUMN IF NOT EXISTS facility_name TEXT;
ALTER TABLE document_recognition ADD COLUMN IF NOT EXISTS provider_phone TEXT;
ALTER TABLE document_recognition ADD COLUMN IF NOT EXISTS provider_fax TEXT;
ALTER TABLE document_recognition ADD COLUMN IF NOT EXISTS provider_address TEXT;
ALTER TABLE document_recognition ADD COLUMN IF NOT EXISTS provider_specialty TEXT;
ALTER TABLE document_recognition ADD COLUMN IF NOT EXISTS suggested_provider_id TEXT;
ALTER TABLE document_recognition ADD COLUMN IF NOT EXISTS unmatched_reason TEXT;
ALTER TABLE document_recognition ADD COLUMN IF NOT EXISTS classification_status TEXT;
ALTER TABLE document_recognition ADD COLUMN IF NOT EXISTS suggested_doc_type TEXT;
ALTER TABLE document_recognition ADD COLUMN IF NOT EXISTS provider_name_normalized TEXT;
ALTER TABLE document_recognition ADD COLUMN IF NOT EXISTS provider_resolution_status TEXT;
ALTER TABLE document_recognition ADD COLUMN IF NOT EXISTS suggested_matter_type TEXT;
ALTER TABLE document_recognition ADD COLUMN IF NOT EXISTS matter_routing_reason TEXT;
ALTER TABLE document_recognition ADD COLUMN IF NOT EXISTS matter_review_required BOOLEAN DEFAULT false;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = current_schema()
      AND table_name = 'Document'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    INNER JOIN pg_class t ON t.oid = c.conrelid
    INNER JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE c.conname = 'document_recognition_document_id_fkey'
      AND n.nspname = current_schema()
      AND t.relname = 'document_recognition'
  ) THEN
    ALTER TABLE document_recognition
      ADD CONSTRAINT document_recognition_document_id_fkey
      FOREIGN KEY (document_id) REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_document_recognition_normalized_text_hash
  ON document_recognition (normalized_text_hash)
  WHERE normalized_text_hash IS NOT NULL;

COMMENT ON TABLE document_recognition IS 'OCR and classification results per document; repaired to exist across drifted runtimes.';
