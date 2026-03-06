-- Add insights (document insights engine) to document_recognition
ALTER TABLE document_recognition ADD COLUMN IF NOT EXISTS insights JSONB;
