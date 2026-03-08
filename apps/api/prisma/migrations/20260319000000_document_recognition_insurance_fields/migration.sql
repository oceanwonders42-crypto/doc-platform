-- Add insurance_fields to document_recognition (raw table) for insurance letter extractor
ALTER TABLE document_recognition ADD COLUMN IF NOT EXISTS insurance_fields JSONB;
