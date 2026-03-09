-- CreateTable: document_recognition (raw table for OCR/classification/extraction; JSONB columns added in later migrations)
CREATE TABLE IF NOT EXISTS document_recognition (
    document_id     TEXT NOT NULL,
    text_excerpt    TEXT,
    doc_type        TEXT,
    client_name     TEXT,
    case_number     TEXT,
    incident_date   TIMESTAMP(3),
    confidence      DOUBLE PRECISION,
    match_confidence DOUBLE PRECISION,
    match_reason    TEXT,
    updated_at      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT document_recognition_pkey PRIMARY KEY (document_id)
);

-- FK to Document so recognition is dropped when document is deleted (skip if exists)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'document_recognition_document_id_fkey') THEN
    ALTER TABLE document_recognition
      ADD CONSTRAINT document_recognition_document_id_fkey
      FOREIGN KEY (document_id) REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
