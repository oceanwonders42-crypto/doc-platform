-- OCR and extraction quality: multilingual, handwriting, diagnostics, evidence
ALTER TABLE document_recognition ADD COLUMN IF NOT EXISTS detected_language TEXT;
ALTER TABLE document_recognition ADD COLUMN IF NOT EXISTS possible_languages JSONB;
ALTER TABLE document_recognition ADD COLUMN IF NOT EXISTS ocr_engine TEXT;
ALTER TABLE document_recognition ADD COLUMN IF NOT EXISTS ocr_confidence NUMERIC;
ALTER TABLE document_recognition ADD COLUMN IF NOT EXISTS has_handwriting BOOLEAN;
ALTER TABLE document_recognition ADD COLUMN IF NOT EXISTS handwriting_heavy BOOLEAN;
ALTER TABLE document_recognition ADD COLUMN IF NOT EXISTS handwriting_confidence NUMERIC;
ALTER TABLE document_recognition ADD COLUMN IF NOT EXISTS page_diagnostics JSONB;
ALTER TABLE document_recognition ADD COLUMN IF NOT EXISTS extraction_strict_mode BOOLEAN;
