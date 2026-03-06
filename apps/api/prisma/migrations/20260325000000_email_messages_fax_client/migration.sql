-- Add fax and client-name detection columns to email_messages
ALTER TABLE "email_messages"
  ADD COLUMN IF NOT EXISTS "is_fax" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "client_name_extracted" TEXT;

COMMENT ON COLUMN "email_messages"."is_fax" IS 'True when the message appears to be from a fax-to-email service';
COMMENT ON COLUMN "email_messages"."client_name_extracted" IS 'Client name heuristically extracted from subject (e.g. Re: Client Name)';
