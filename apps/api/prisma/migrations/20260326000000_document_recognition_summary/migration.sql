-- Add summary (AI-generated summary + key facts) to document_recognition
ALTER TABLE document_recognition ADD COLUMN IF NOT EXISTS summary JSONB;

COMMENT ON COLUMN document_recognition.summary IS 'AI-generated document summary: { summary: string, keyFacts: string[] }';
