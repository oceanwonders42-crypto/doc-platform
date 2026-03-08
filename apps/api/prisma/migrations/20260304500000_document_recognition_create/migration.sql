-- document_recognition: OCR and classification persistence (raw table, not Prisma-managed).
-- Replaces manual create_recognition_table.js; all columns added by later migrations use ADD COLUMN IF NOT EXISTS.
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
  match_reason TEXT
);

-- Ensure columns exist when table was created by legacy create_recognition_table.js (no match_* columns)
ALTER TABLE document_recognition ADD COLUMN IF NOT EXISTS match_confidence NUMERIC;
ALTER TABLE document_recognition ADD COLUMN IF NOT EXISTS match_reason TEXT;

COMMENT ON TABLE document_recognition IS 'OCR and classification results per document; referenced by worker, API, and backfill scripts.';
