-- Classification status and suggested type for uncertain/low-confidence classifications.
-- classification_status: 'confirmed' | 'uncertain' | 'fallback' for routing/renaming and review.
-- suggested_doc_type: raw classifier suggestion when status is uncertain (e.g. onyx type or legacy).
ALTER TABLE document_recognition ADD COLUMN IF NOT EXISTS classification_status TEXT;
ALTER TABLE document_recognition ADD COLUMN IF NOT EXISTS suggested_doc_type TEXT;
COMMENT ON COLUMN document_recognition.classification_status IS 'confirmed = high confidence; uncertain = low confidence, doc_type is fallback; fallback = no/minimal text or no signals.';
COMMENT ON COLUMN document_recognition.suggested_doc_type IS 'Classifier suggestion when classification_status is uncertain; for review only.';
