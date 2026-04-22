-- Add requestDate, responseDate for RecordsRequest workflow
ALTER TABLE "RecordsRequest" ADD COLUMN IF NOT EXISTS "requestDate" TIMESTAMP(3);
ALTER TABLE "RecordsRequest" ADD COLUMN IF NOT EXISTS "responseDate" TIMESTAMP(3);
