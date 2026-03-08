-- Add suggested_case_id to document_recognition for case match linking (real LegalCase.id)
-- case_number stays as display value (e.g. "DEMO-001"); suggested_case_id is the link target
ALTER TABLE document_recognition ADD COLUMN IF NOT EXISTS suggested_case_id TEXT;
