-- Add AI-generated letter body to RecordsRequest (fax/email ready)
ALTER TABLE "RecordsRequest" ADD COLUMN IF NOT EXISTS "letterBody" TEXT;
