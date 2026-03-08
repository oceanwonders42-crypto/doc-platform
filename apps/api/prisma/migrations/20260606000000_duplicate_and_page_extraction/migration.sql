-- Smart duplicate detection: normalized text hash and fingerprint
ALTER TABLE document_recognition ADD COLUMN IF NOT EXISTS text_fingerprint TEXT;
ALTER TABLE document_recognition ADD COLUMN IF NOT EXISTS normalized_text_hash TEXT;

-- Multi-page extraction and quality
ALTER TABLE document_recognition ADD COLUMN IF NOT EXISTS page_texts_json JSONB;
ALTER TABLE document_recognition ADD COLUMN IF NOT EXISTS extracted_json JSONB;
ALTER TABLE document_recognition ADD COLUMN IF NOT EXISTS extraction_version TEXT;
ALTER TABLE document_recognition ADD COLUMN IF NOT EXISTS quality_score NUMERIC;
ALTER TABLE document_recognition ADD COLUMN IF NOT EXISTS issues_json JSONB;
ALTER TABLE document_recognition ADD COLUMN IF NOT EXISTS page_count_detected INT;

-- Provider name for provider-aware routing
ALTER TABLE document_recognition ADD COLUMN IF NOT EXISTS provider_name TEXT;

CREATE INDEX IF NOT EXISTS idx_document_recognition_normalized_text_hash
  ON document_recognition (normalized_text_hash) WHERE normalized_text_hash IS NOT NULL;
