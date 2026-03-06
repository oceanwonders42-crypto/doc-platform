-- Add court_fields to document_recognition for court document extractor (court_extraction feature)
ALTER TABLE document_recognition ADD COLUMN IF NOT EXISTS court_fields JSONB;
