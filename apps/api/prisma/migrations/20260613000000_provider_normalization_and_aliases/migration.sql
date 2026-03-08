-- Provider normalization and alias matching: store normalized name and resolution status; prepare alias map.
-- document_recognition: raw (provider_name) vs normalized (provider_name_normalized) and status
ALTER TABLE document_recognition ADD COLUMN IF NOT EXISTS provider_name_normalized TEXT;
ALTER TABLE document_recognition ADD COLUMN IF NOT EXISTS provider_resolution_status TEXT;
COMMENT ON COLUMN document_recognition.provider_name_normalized IS 'Normalized display form of extracted provider; set even when unresolved.';
COMMENT ON COLUMN document_recognition.provider_resolution_status IS 'resolved = matched to Provider; unresolved = no match or ambiguous.';

-- Optional alias table for provider map management (firm-scoped)
CREATE TABLE IF NOT EXISTS provider_alias (
  id TEXT PRIMARY KEY,
  firm_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  alias_normalized TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(firm_id, provider_id, alias_normalized)
);
CREATE INDEX IF NOT EXISTS idx_provider_alias_firm ON provider_alias (firm_id);
CREATE INDEX IF NOT EXISTS idx_provider_alias_provider ON provider_alias (provider_id);
