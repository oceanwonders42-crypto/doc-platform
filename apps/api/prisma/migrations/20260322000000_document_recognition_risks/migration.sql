-- Add risks (risk alerts) to document_recognition for medical/insurance phrase detection
ALTER TABLE document_recognition ADD COLUMN IF NOT EXISTS risks JSONB;
